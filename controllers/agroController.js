const mongoose = require('mongoose');
const https = require('https');
const Sensor = require('../models/Sensor');
const User = require('../models/User');
const satelliteService = require('../services/satelliteService');
const iaService = require('../services/iaService');
const weatherCache = {};
const weeklyCache = {}; // Cache para as Agregações DB
const CACHE_DURATION_MS = 10 * 60 * 1000; // 10 Minutos (Clima)
const WEEKLY_CACHE_MS = 60 * 60 * 1000; // 1 Hora (Painel Analítico)

exports.clearWeatherCache = (userId) => {
    delete weatherCache[userId.toString()];
    console.log(`[Cache] Cache climático de ${userId} invalidado com sucesso.`);
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
// IA PREDITIVA DE IRRIGAÇÃO (Análise Baseada e Tendências Históricas Módulo-Linear)
// ======================================
const preverIrrigacao = async (user, clima, satData) => {
    // 1. Definição de Limites por Cultura (Umidade Crítica)
    const CROP_CONFIG = {
        'cana-de-açúcar': { min: 35, retention: 'high' },
        'hortaliças': { min: 50, retention: 'low' },
        'milho': { min: 40, retention: 'medium' },
        'default': { min: 40, retention: 'medium' }
    };

    const config = CROP_CONFIG[(user.tipoPlantacao || '').toLowerCase()] || CROP_CONFIG['default'];
    const limiteMinimo = config.min;

    // 2. Cálculo da Taxa Real de Secagem (Droprate)
    const historico = await Sensor.find({ userId: user._id }).sort({ data: -1 }).limit(10);
    
    let currentMoisture = 50; 
    let dropRatePerHour = 0.8; // Padrão base recalibrado
    
    if(historico.length >= 2) {
        currentMoisture = historico[0].umidade;
        const oldest = historico[historico.length - 1];
        const hourDiff = (new Date(historico[0].data) - new Date(oldest.data)) / (1000 * 60 * 60);
        
        if (hourDiff > 0.1) { // Evita divisão por zero ou tempo muito curto
            const drop = oldest.umidade - currentMoisture;
            // Apenas considera se houve queda real (secagem)
            if (drop > 0) {
                dropRatePerHour = drop / hourDiff;
            }
        }
    }
    
    // 3. Ajustes Climáticos Dinâmicos na Taxa
    const current = clima?.current || {};
    const temp = current.temperature_2m || 25;
    const airHumid = current.relative_humidity_2m || 50;
    const windSpeed = current.wind_speed_10m || 0;
    
    // Fatores de ajuste (Heurística Agronômica)
    let climateMultiplier = 1.0;
    if (temp > 30) climateMultiplier += 0.3; // Calor aumenta evaporação
    if (temp > 35) climateMultiplier += 0.2; // Calor extremo
    if (airHumid < 40) climateMultiplier += 0.2; // Ar seco
    if (airHumid > 80) climateMultiplier -= 0.3; // Ar úmido retém água

    // Novo fator: Vento
    if (windSpeed > 15) climateMultiplier += 0.1;
    if (windSpeed > 30) climateMultiplier += 0.2; // Vento forte seca rápido

    // Fator FAO Evapotranspiração (se houver)
    const dailyEt0 = clima?.daily?.et0_fao_evapotranspiration?.[0] || 0;
    if (dailyEt0 > 5) climateMultiplier += 0.15;
    
    // Novo fator: Macro umidade via Satélite
    if (satData && satData.umidadeMacro < 30) {
        climateMultiplier += 0.15; // Região seca = mais evaporação
    }
    
    dropRatePerHour *= climateMultiplier;
    
    // Piso de segurança para evitar divisão por zero e garantir predict mínimo
    if(dropRatePerHour < 0.2) dropRatePerHour = 0.2;

    // 4. Previsão de Chuva (Próximas 12 horas para maior segurança)
    let maxRainProb = 0;
    const precipArray = clima?.hourly?.precipitation_probability;
    if (Array.isArray(precipArray) && precipArray.length > 0) {
        maxRainProb = Math.max(...precipArray.slice(0, 12));
    }

    // 5. Cálculo do Tempo Restante (Fórmula Solicitada)
    let horasRestantes = (currentMoisture - limiteMinimo) / dropRatePerHour;
    
    // Clamping: 1h a 48h
    horasRestantes = Math.max(1, Math.min(48, horasRestantes));

    // 6. Árvore de Decisão e Diagnóstico
    let recomendacao = '';
    let status = 'normal';

    if (maxRainProb > 60) {
        recomendacao = "Previsão de chuva detectada. Irrigação não recomendada no momento";
        status = 'alerta';
        horasRestantes = 0; // Sinaliza que não deve irrigar
    } else if (currentMoisture <= limiteMinimo) {
        recomendacao = `Solo abaixo do limite mínimo para ${user.tipoPlantacao.toLowerCase()}. Irrigue imediatamente`;
        status = 'critico';
        horasRestantes = 0;
    } else if (horasRestantes <= 6) {
        recomendacao = `Irrigação será necessária em aproximadamente ${Math.round(horasRestantes)} horas`;
        status = 'alerta';
    } else {
        recomendacao = `Condições estáveis. A cultura de ${user.tipoPlantacao.toLowerCase()} não necessita de irrigação no momento`;
        status = 'ideal';
    }

    return { 
        tempoHoras: horasRestantes, 
        recomendacao, 
        status, 
        _meta: { 
            dropRealTime: dropRatePerHour.toFixed(2), 
            limiteCultura: limiteMinimo,
            rainProb: maxRainProb 
        } 
    };
};


// Endpoint Primário: Clima via Lat/Lon da Cidade + Computação em Tempo Real da Previsão Baseada em Sensor Dinâmico
exports.getClimaEDashboard = async (req, res) => {
    try {
        const u = await User.findById(req.user.id);
        const { lat, lon, cidade } = u;

        // Busca dados de satélite da NASA (possui cache próprio de 12h)
        let satData = null;
        try {
            satData = await satelliteService.fetchSateliteData(lat, lon);
        } catch (e) {
            console.error('Erro na API de satélite:', e.message);
        }

        // Recuperar Cache Node Server para proteção de rede (Rate Limits)
        if (weatherCache[u.id] && weatherCache[u.id].expiration > Date.now()) {
            
            // Note que embora o CLIMA seja Cacheado (ele não muda todo segundo), o SENSOR muda. 
            // Logo, recalculamos a Previsão de Rega AO VIVO a partir da Memória RAM. Tremenda abstração arquitetural.
            const previsao = await preverIrrigacao(u, weatherCache[u.id].data, satData);
            
            return res.json({ 
                clima: weatherCache[u.id].data, 
                cidade: cidade,
                previsao,
                satelite: satData 
            });
        }

        // Bater no Satélite caso o Cache Morra (10 mins)
        const climaData = await fetchOpenMeteo(lat, lon);
        
        weatherCache[u.id] = {
            expiration: Date.now() + CACHE_DURATION_MS,
            data: climaData
        };

        const previsao = await preverIrrigacao(u, climaData, satData);

        res.json({ clima: climaData, cidade: cidade, previsao, satelite: satData });
    } catch (err) {
        console.error('Erro no Núcleo de Agro Meteorologia:', err.message);
        res.status(500).send('Erro na Nuvem Métrica');
    }
};

// Endpoint Secundário: Analytics Média Semanal Seg-Sexta (Pipeline Aggregation no Mongo)
exports.getMediaSemanal = async (req, res) => {
    try {
        const uId = req.user.id;
        
        // Cache L2 (Descarrega o MongoDB)
        if (weeklyCache[uId] && weeklyCache[uId].expiration > Date.now()) {
            return res.json(weeklyCache[uId].data);
        }

        const pastWeek = new Date();
        pastWeek.setDate(pastWeek.getDate() - 7);
        
        // Carga Direta na Pipeline do MongoDB sem afogar o express Javascript
        const aggregation = await Sensor.aggregate([
            { $match: { userId: new mongoose.Types.ObjectId(req.user.id), data: { $gte: pastWeek } } },
            { $project: {
                dayOfWeek: { $dayOfWeek: "$data" }, // Retorna 1 (Dom) até 7 (Sáb)
                umidade: 1
            }},
            { $match: { dayOfWeek: { $in: [2, 3, 4, 5, 6] } } }, // Peneira Cirúrgica Úteis (Seg-Sexta)
            { $group: {
                _id: "$dayOfWeek",
                media: { $avg: "$umidade" }
            }},
            { $sort: { _id: 1 } }
        ]);

        const diasSemanaMap = {
            2: "Segunda", 3: "Terça", 4: "Quarta", 5: "Quinta", 6: "Sexta"
        };
        
        // Padrozinação Visual Array O(1)
        const formatado = Object.keys(diasSemanaMap).map(id => {
            const achou = aggregation.find(a => a._id == Number(id));
            return {
                dia: diasSemanaMap[id].slice(0, 3), // "Seg", "Ter", etc
                media: achou ? Math.round(achou.media) : 0
            };
        });

        weeklyCache[uId] = {
            expiration: Date.now() + WEEKLY_CACHE_MS,
            data: formatado
        };

        res.json(formatado);

    } catch (e) {
        console.error(e.message);
        res.status(500).send('Falha Estrutural Histórica DB');
    }
};

const iaCache = {};
const IA_CACHE_MS = 3 * 60 * 60 * 1000; // 3 Horas

exports.getInsightsIA = async (req, res) => {
    try {
        const u = await User.findById(req.user.id);
        const { lat, lon } = u;

        // Verifica Cache
        if (iaCache[u.id] && iaCache[u.id].expiration > Date.now()) {
            return res.json({ diagnostico: iaCache[u.id].diagnostico, cached: true });
        }

        // Puxar insumos (dados brutos reais)
        let satData = null;
        try { satData = await satelliteService.fetchSateliteData(lat, lon); } catch(e) {}
        
        let climaData = weatherCache[u.id] ? weatherCache[u.id].data : null;
        if (!climaData) {
            climaData = await fetchOpenMeteo(lat, lon); 
        }
        
        // Calcular previsão (motor de regras determinístico)
        const previsao = await preverIrrigacao(u, climaData, satData);

        const ultimoSensor = await Sensor.findOne({ userId: u.id }).sort({ data: -1 });
        const umidadeAtual = ultimoSensor ? ultimoSensor.umidade : "Desconhecida";

        // Prepara dados formatados p/ a IA
        const dadosMatematicos = {
            tempoHoras: previsao.tempoHoras,
            _meta: {
                dropRealTime: previsao._meta?.dropRealTime || 0,
                umidadeAtual: umidadeAtual,
                rainProb: previsao._meta?.rainProb || 0,
                satUmidadeMacro: satData ? satData.umidadeMacro : 'N/A'
            }
        };
        
        const laudo = await iaService.traduzirDiagnostico(dadosMatematicos, u.tipoPlantacao);

        iaCache[u.id] = {
            expiration: Date.now() + IA_CACHE_MS,
            diagnostico: laudo
        };

        res.json({ diagnostico: laudo, cached: false });
    } catch (error) {
        console.error('Erro na IA Generativa:', error.message);
        res.status(503).json({ error: 'IA Generativa indisponível. Retornando ao diagnóstico matemático.', fallback: true });
    }
};
