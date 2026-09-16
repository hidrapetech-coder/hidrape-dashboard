const https = require('https');
const prisma = require('../lib/prisma');
const satelliteService = require('../services/satelliteService');
const iaService = require('../services/iaService');
const redis = require('../lib/redis');
const CACHE_DURATIONS = {
    WEATHER: 10 * 60, // 10 Minutos (Clima)
    WEEKLY: 60 * 60,  // 1 Hora (Painel Analítico)
    IA: 3 * 60 * 60   // 3 Horas (IA)
};

exports.clearWeatherCache = (userId) => {
    redis.del(`weather:${userId}`).catch(console.error);
    console.log(`[Cache] Cache climático de ${userId} invalidação iniciada.`);
};

// Thresholds IA (Magic Numbers)
const IA_RULES = {
    TEMP_HOT: 30,
    TEMP_COLD: 20,
    AR_DRY: 40,
    AR_WET: 80,
    RAIN_ALERT: 60,
    CRIT_SEC: 30
};

// Utilitário de API (Open-Meteo - Gratuita via Satélite)
const fetchOpenMeteo = (lat, lon) => {
    return new Promise((resolve, reject) => {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${parseFloat(lat)}&longitude=${parseFloat(lon)}&current=temperature_2m,relative_humidity_2m,weather_code,is_day,wind_speed_10m&hourly=precipitation_probability&daily=et0_fao_evapotranspiration&timezone=auto&models=best_match`;
        
        https.get(url, (res) => {
            let body = '';
            res.on('data', d => body += d);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch(e) { reject(e); }
            });
        }).on('error', reject);
    });
};

// ======================================
// VERIFICAÇÃO DE DISPONIBILIDADE DO SENSOR (FAIL-SAFE)
// ======================================
const getSensorStatus = async (userId) => {
    const lastReading = await prisma.sensor.findFirst({
        where: { userId },
        orderBy: { data: 'desc' }
    });

    if (!lastReading) {
        return {
            status: 'offline',
            hasValidData: false,
            lastReadingAt: null,
            dataAgeMinutes: null,
            umidadeAtual: null,
            reason: 'Nenhuma leitura encontrada no histórico.'
        };
    }

    const ageMs = Date.now() - new Date(lastReading.data).getTime();
    const ageMinutes = Math.floor(ageMs / (1000 * 60));

    // Thresholds:
    // <= 30 mins: ONLINE
    // > 30 mins && <= 24h: STALE (Desatualizado, mas ainda serve para histórico parcial, porém inseguro para tempo real)
    // > 24h: OFFLINE
    if (ageMinutes <= 30) {
        return { status: 'online', hasValidData: true, lastReadingAt: lastReading.data, dataAgeMinutes: ageMinutes, umidadeAtual: lastReading.umidade, reason: 'Dados recentes.' };
    } else if (ageMinutes <= 1440) {
        return { status: 'stale', hasValidData: false, lastReadingAt: lastReading.data, dataAgeMinutes: ageMinutes, umidadeAtual: lastReading.umidade, reason: `Leitura desatualizada (${ageMinutes} min atrás).` };
    } else {
        return { status: 'offline', hasValidData: false, lastReadingAt: lastReading.data, dataAgeMinutes: ageMinutes, umidadeAtual: lastReading.umidade, reason: 'Sensor offline há mais de 24 horas.' };
    }
};

// ======================================
// IA PREDITIVA DE IRRIGAÇÃO (Análise Baseada e Tendências Históricas Módulo-Linear)
// ======================================
const { evaluateDataQuality } = require('../services/agroEngine/dataQuality');
const { detectAnomalies } = require('../services/agroEngine/anomalyDetection');
const { analyzeClimate } = require('../services/agroEngine/climateAnalyzer');
const { predictMoisture } = require('../services/agroEngine/mlPredictor');
const { calculateRiskAndConfidence } = require('../services/agroEngine/riskAndConfidence');
const { makeDecision } = require('../services/agroEngine/decisionMaker');
const { logAgroDecision } = require('../services/agroEngine/observability');

const preverIrrigacao = async (user, clima, satData, sensorState) => {
    // Busca um histórico maior para alimentar o novo motor (últimas 20 leituras)
    const historico = await prisma.sensor.findMany({ 
        where: { userId: user.id },
        orderBy: { data: 'desc' },
        take: 20
    });

    // Fase 1: Qualidade dos Dados
    const dataQuality = evaluateDataQuality(historico);

    // Fase 2: Anomalias
    const anomalies = detectAnomalies(historico, clima, dataQuality);

    // Fase 3: Análise Climática
    const climateAnalysis = analyzeClimate(clima, satData);

    // Fase 4: Predição de Umidade
    const predictor = predictMoisture(historico, climateAnalysis, user.tipoPlantacao);

    // Fase 5: Risco e Confiança
    const riskAndConfidence = calculateRiskAndConfidence(dataQuality, anomalies, predictor, historico);

    // Fase 6: Tomada de Decisão Estruturada
    const recommendation = makeDecision(dataQuality, anomalies, climateAnalysis, predictor, riskAndConfidence, historico.length > 0 ? historico[0].umidade : 50);

    const engineData = {
        dataQuality,
        anomalies,
        climateAnalysis,
        predictions: predictor.predictions,
        risk: riskAndConfidence.risk,
        confidence: riskAndConfidence.confidence,
        recommendation
    };

    // Fase 7: Observabilidade (Feedback Loop Assíncrono)
    logAgroDecision(user.id, engineData).catch(() => {}); // Não bloqueia o fluxo

    // =========================================
    // RETORNO DE COMPATIBILIDADE (LEGADO)
    // O sistema antigo esperava "tempoHoras", "recomendacao" como string, "status", e "_meta"
    // =========================================
    let statusAntigo = 'normal';
    if (recommendation.action === 'IRRIGAR') statusAntigo = 'critico';
    else if (recommendation.action === 'ATENÇÃO') statusAntigo = 'alerta';
    else if (recommendation.action === 'AGUARDAR') statusAntigo = 'alerta';

    return { 
        tempoHoras: predictor.hoursUntilStress, 
        recomendacao: recommendation.explanation.join(" "), // Concatena a explicação para o frontend legado
        status: statusAntigo, 
        _meta: { 
            dropRealTime: predictor.dynamicDropRate, 
            limiteCultura: predictor.criticalLimit,
            rainProb: climateAnalysis.maxRainProb12h,
            sensorState: sensorState
        },
        engineData // <--- Objeto da Nova Arquitetura acoplado aqui
    };
};


// Endpoint Primário: Clima via Lat/Lon da Cidade + Computação em Tempo Real da Previsão Baseada em Sensor Dinâmico
exports.getClimaEDashboard = async (req, res) => {
    try {
        const u = await prisma.user.findUnique({ where: { id: req.user.id } });
        if(!u) return res.status(404).json({error: 'Usuário não encontrado'});
        
        const { lat, lon, cidade } = u;

        // Busca dados de satélite da NASA (possui cache próprio de 12h)
        let satData = null;
        try {
            satData = await satelliteService.fetchSateliteData(lat, lon);
        } catch (e) {
            console.error('Erro na API de satélite:', e.message);
        }

        // Recuperar Cache Redis para proteção de rede (Rate Limits)
        let climaData = await redis.get(`weather:${u.id}`);
        
        if (climaData) {
            climaData = JSON.parse(climaData);
            const sensorState = await getSensorStatus(u.id);
            const previsao = await preverIrrigacao(u, climaData, satData, sensorState);
            
            return res.json({ 
                clima: climaData, 
                cidade: cidade,
                previsao,
                satelite: satData,
                sensorState
            });
        }

        // Bater na API caso o Cache Morra (10 mins)
        climaData = await fetchOpenMeteo(lat, lon);
        
        await redis.setex(`weather:${u.id}`, CACHE_DURATIONS.WEATHER, JSON.stringify(climaData));

        const sensorState = await getSensorStatus(u.id);
        const previsao = await preverIrrigacao(u, climaData, satData, sensorState);

        res.json({ clima: climaData, cidade: cidade, previsao, satelite: satData, sensorState });
    } catch (err) {
        console.error('Erro no Núcleo de Agro Meteorologia:', err.message);
        res.status(500).send('Erro na Nuvem Métrica');
    }
};

// Endpoint Secundário: Analytics Média Semanal Seg-Sexta
exports.getMediaSemanal = async (req, res) => {
    try {
        const uId = req.user.id;
        
        // Cache L2 Redis (Descarrega o Banco)
        let cachedWeekly = await redis.get(`weekly:${uId}`);
        if (cachedWeekly) {
            return res.json(JSON.parse(cachedWeekly));
        }

        const pastWeek = new Date();
        pastWeek.setDate(pastWeek.getDate() - 7);
        
        // Com Prisma, calculamos as médias em memória (são no máximo 1000 registros de uma semana por usuário)
        const sensores = await prisma.sensor.findMany({
            where: { 
                userId: uId,
                data: { gte: pastWeek }
            },
            select: { data: true, umidade: true }
        });

        // Agrupamento manual: Domingo=0 a Sábado=6 em JS (Mongo era 1-7)
        const groups = { 1: [], 2: [], 3: [], 4: [], 5: [] }; // Seg (1) a Sexta (5)

        sensores.forEach(s => {
            const day = new Date(s.data).getDay(); 
            if (day >= 1 && day <= 5) {
                groups[day].push(s.umidade);
            }
        });

        const diasSemanaMap = {
            1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta"
        };
        
        const formatado = Object.keys(diasSemanaMap).map(day => {
            const umidades = groups[day];
            const media = umidades.length > 0 ? (umidades.reduce((a, b) => a + b, 0) / umidades.length) : 0;
            return {
                dia: diasSemanaMap[day].slice(0, 3), // "Seg", "Ter", etc
                media: Math.round(media)
            };
        });

        await redis.setex(`weekly:${uId}`, CACHE_DURATIONS.WEEKLY, JSON.stringify(formatado));

        res.json(formatado);

    } catch (e) {
        console.error(e.message);
        res.status(500).send('Falha Estrutural Histórica DB');
    }
};



exports.getInsightsIA = async (req, res) => {
    try {
        const u = await prisma.user.findUnique({ where: { id: req.user.id } });
        if(!u) return res.status(404).json({error: 'Usuário não encontrado'});
        
        const { lat, lon } = u;

        // Verifica Cache Redis
        let cachedIa = await redis.get(`ia:${u.id}`);
        if (cachedIa) {
            return res.json({ diagnostico: JSON.parse(cachedIa), cached: true });
        }

        // Puxar insumos (dados brutos reais)
        let satData = null;
        try { satData = await satelliteService.fetchSateliteData(lat, lon); } catch(e) {}
        
        let climaDataString = await redis.get(`weather:${u.id}`);
        let climaData = climaDataString ? JSON.parse(climaDataString) : null;
        if (!climaData) {
            climaData = await fetchOpenMeteo(lat, lon); 
        }
        
        // Calcular previsão (motor de regras determinístico)
        const sensorState = await getSensorStatus(u.id);
        const previsao = await preverIrrigacao(u, climaData, satData, sensorState);

        const umidadeAtual = sensorState.umidadeAtual !== null ? sensorState.umidadeAtual : "Desconhecida";

        // Prepara dados formatados p/ a IA
        const dadosMatematicos = {
            tempoHoras: previsao.tempoHoras,
            _meta: {
                dropRealTime: previsao._meta?.dropRealTime || 0,
                umidadeAtual: umidadeAtual,
                rainProb: previsao._meta?.rainProb || 0,
                satUmidadeMacro: satData ? satData.umidadeMacro : 'N/A',
                sensorState: sensorState
            }
        };
        
        const laudo = await iaService.traduzirDiagnostico(dadosMatematicos, u.tipoPlantacao);

        await redis.setex(`ia:${u.id}`, CACHE_DURATIONS.IA, JSON.stringify(laudo));

        res.json({ diagnostico: laudo, cached: false });
    } catch (error) {
        console.error('Erro na IA Generativa:', error.message);
        res.status(503).json({ error: 'IA Generativa indisponível. Retornando ao diagnóstico matemático.', fallback: true });
    }
};
