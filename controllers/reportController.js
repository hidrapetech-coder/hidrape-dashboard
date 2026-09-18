const prisma = require('../lib/prisma');
const axios = require('axios');
const iaService = require('../services/iaService');
const { getCropConfig } = require('../config/cultures');

// Limites (Thresholds) extraídos da lógica já existente
const getLimites = (tipoPlantacao) => {
    return getCropConfig(tipoPlantacao);
};

// Integração Histórica com Open-Meteo (past_days)
const fetchOpenMeteoHistorical = async (lat, lon, pastDays = 92) => {
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${parseFloat(lat)}&longitude=${parseFloat(lon)}&daily=precipitation_sum,et0_fao_evapotranspiration,temperature_2m_max,temperature_2m_min,temperature_2m_mean&past_days=${pastDays}&forecast_days=1&timezone=auto`;
        const res = await axios.get(url, { timeout: 8000 });
        return res.data;
    } catch (e) {
        console.warn(`[Open-Meteo] Falha ao buscar histórico climático para lat ${lat} lon ${lon}: ${e.message}`);
        return null;
    }
};

const { z } = require('zod');

const querySchema = z.object({
    year: z.string().regex(/^\d{4}$/, 'Ano inválido').transform(Number),
    month: z.string().regex(/^(0?[1-9]|1[0-2])$/, 'Mês inválido').transform(Number)
});

exports.getMonthlyReport = async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Zod validation
        const parseResult = querySchema.safeParse(req.query);
        if (!parseResult.success) {
            return res.status(400).json({ error: parseResult.error.errors[0].message });
        }
        
        const { year: targetYear, month: targetMonth } = parseResult.data;

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

        // Intervalo do mês selecionado
        const startDate = new Date(targetYear, targetMonth - 1, 1);
        const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);
        
        const limites = getLimites(user.tipoPlantacao);

        // 1. Dados do Banco de Dados (Sensores) agregados por dia via SQL
        const agregation = await prisma.$queryRaw`
            SELECT 
                DATE_TRUNC('day', "data") as dia, 
                AVG("umidade") as avg_umidade,
                COUNT(*) as total_dia,
                SUM(CASE WHEN "status" = 'SECO' THEN 1 ELSE 0 END) as qtd_seco,
                SUM(CASE WHEN "status" = 'ENCHARCADO' THEN 1 ELSE 0 END) as qtd_encharcado,
                SUM(CASE WHEN "status" = 'IDEAL' THEN 1 ELSE 0 END) as qtd_ideal
            FROM "Sensor"
            WHERE "userId" = ${userId} AND "data" >= ${startDate} AND "data" <= ${endDate}
            GROUP BY DATE_TRUNC('day', "data")
            ORDER BY dia ASC
        `;

        let totalLeituras = 0;
        let sumUmidadeTotal = 0;
        let countIdeal = 0, countDeficit = 0, countExcesso = 0;
        let recomendacoesCount = 0; // Aproximação baseada em dias secos
        let sensorChartData = [];

        agregation.forEach(row => {
            const n = Number(row.total_dia);
            totalLeituras += n;
            sumUmidadeTotal += (Number(row.avg_umidade) * n);
            countIdeal += Number(row.qtd_ideal);
            countDeficit += Number(row.qtd_seco);
            countExcesso += Number(row.qtd_encharcado);
            
            // Para recomendacoesCount aproximado, contamos os dias com predominância de SECO
            if (Number(row.qtd_seco) > Number(row.qtd_ideal)) {
                recomendacoesCount++;
            }

            sensorChartData.push({ data: row.dia, umidade: Number(row.avg_umidade) });
        });

        let umidadeMedia = 0, pctIdeal = 0, pctDeficit = 0, pctExcesso = 0;

        if (totalLeituras > 0) {
            umidadeMedia = sumUmidadeTotal / totalLeituras;
            pctIdeal = (countIdeal / totalLeituras) * 100;
            pctDeficit = (countDeficit / totalLeituras) * 100;
            pctExcesso = (countExcesso / totalLeituras) * 100;
        }

        // 2. Dados Meteorológicos (Open-Meteo Histórico)
        let chuvaAcumulada = null;
        let et0Acumulada = null;
        let climaChartData = [];
        let climaValido = false;

        const climaHist = await fetchOpenMeteoHistorical(user.lat, user.lon, 92);
        
        if (climaHist && climaHist.daily) {
            const { time, precipitation_sum, et0_fao_evapotranspiration, temperature_2m_mean } = climaHist.daily;
            
            let sumChuva = 0;
            let sumEt0 = 0;
            
            // Format YYYY-MM para filtro simples
            const targetMonthStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;

            time.forEach((dateStr, index) => {
                if (dateStr.startsWith(targetMonthStr)) {
                    const chuva = precipitation_sum[index] || 0;
                    const et0 = et0_fao_evapotranspiration[index] || 0;
                    const temp = temperature_2m_mean[index] || 0;

                    sumChuva += chuva;
                    sumEt0 += et0;
                    climaValido = true;

                    climaChartData.push({
                        data: dateStr,
                        chuva: chuva,
                        et0: et0,
                        temp: temp
                    });
                }
            });

            if (climaValido) {
                chuvaAcumulada = sumChuva;
                et0Acumulada = sumEt0;
            }
        }

        // 3. Volume Teórico Estimado
        // V = ET0 (mm) * Área (ha) * 10 (m³/ha/mm) = m³
        let volumeTeorico = null;
        if (climaValido && user.tamanhoFazenda > 0) {
            volumeTeorico = et0Acumulada * user.tamanhoFazenda * 10;
        }

        // 4. Inteligência Artificial (Leitura do Mês)
        let leituraIA = "Não foi possível gerar a leitura do mês (sem conexão com IA).";
        if (totalLeituras >= 10) { // Só gerar interpretação se tiver dados suficientes para o mês
            try {
                const contexto = {
                    mes: `${targetMonth}/${targetYear}`,
                    cultura: user.tipoPlantacao,
                    pctIdeal: Math.round(pctIdeal),
                    pctDeficit: Math.round(pctDeficit),
                    chuvaAcumulada: chuvaAcumulada !== null ? Math.round(chuvaAcumulada) : 'indisponível',
                    et0Acumulada: et0Acumulada !== null ? Math.round(et0Acumulada) : 'indisponível',
                    recomendacoesEmitidas: recomendacoesCount
                };
                leituraIA = await iaService.gerarResumoMensal(contexto);
            } catch (err) {
                console.warn("[IA] Falha ao gerar resumo mensal:", err.message);
                leituraIA = "Serviço de interpretação indisponível no momento. Avalie os indicadores técnicos abaixo.";
            }
        } else if (totalLeituras > 0 && totalLeituras < 10) {
            leituraIA = "Dados insuficientes neste mês para gerar um resumo detalhado e confiável.";
        } else {
            leituraIA = "Nenhuma leitura de umidade registrada neste mês para esta cultura.";
        }

        // 5. Retorno
        res.json({
            kpis: {
                totalLeituras,
                pctIdeal: Math.round(pctIdeal),
                pctDeficit: Math.round(pctDeficit),
                pctExcesso: Math.round(pctExcesso),
                chuvaAcumulada: chuvaAcumulada !== null ? Math.round(chuvaAcumulada) : null,
                et0Acumulada: et0Acumulada !== null ? Math.round(et0Acumulada) : null,
                recomendacoesCount,
                volumeTeorico: volumeTeorico !== null ? Math.round(volumeTeorico) : null,
                limites: limites
            },
            graficos: {
                solo: sensorChartData,
                clima: climaChartData
            },
            ia: {
                resumo: leituraIA
            }
        });

    } catch (e) {
        console.error('Erro no Relatório Mensal:', e.message);
        res.status(500).json({ error: 'Erro ao processar relatório mensal' });
    }
};
