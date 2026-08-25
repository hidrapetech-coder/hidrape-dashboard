const prisma = require('../lib/prisma');
const axios = require('axios');
const iaService = require('../services/iaService');

// Limites (Thresholds) extraídos da lógica já existente
const getLimites = (tipoPlantacao) => {
    let limites = { minIdeal: 40, maxIdeal: 60 };
    if (!tipoPlantacao) return limites;
    
    switch(tipoPlantacao.toLowerCase()) {
        case 'milho': limites = { minIdeal: 40, maxIdeal: 70 }; break;
        case 'feijão': limites = { minIdeal: 40, maxIdeal: 60 }; break;
        case 'hortaliças': limites = { minIdeal: 50, maxIdeal: 80 }; break;
        case 'cana-de-açúcar': limites = { minIdeal: 35, maxIdeal: 60 }; break;
    }
    return limites;
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

exports.getMonthlyReport = async (req, res) => {
    try {
        const userId = req.user.id;
        const { year, month } = req.query;

        if (!year || !month) {
            return res.status(400).json({ error: 'Ano e mês são obrigatórios' });
        }

        const targetYear = parseInt(year);
        const targetMonth = parseInt(month); // 1 a 12

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

        // Intervalo do mês selecionado
        const startDate = new Date(targetYear, targetMonth - 1, 1);
        const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);
        
        // Evita buscar meses futuros ou atuais incompletos sem aviso? (Deixaremos livre, mas com dados parciais)
        
        const limites = getLimites(user.tipoPlantacao);

        // 1. Dados do Banco de Dados (Sensores)
        const leituras = await prisma.sensor.findMany({
            where: {
                userId: userId,
                data: {
                    gte: startDate,
                    lte: endDate
                }
            },
            orderBy: { data: 'asc' }
        });

        const totalLeituras = leituras.length;
        
        let umidadeMedia = 0, pctIdeal = 0, pctDeficit = 0, pctExcesso = 0;
        let recomendacoesCount = 0;
        let sensorChartData = [];

        if (totalLeituras > 0) {
            let sumUmidade = 0;
            let countIdeal = 0, countDeficit = 0, countExcesso = 0;
            
            let lastStatus = null;

            leituras.forEach(l => {
                sumUmidade += l.umidade;
                sensorChartData.push({ data: l.data, umidade: l.umidade });

                if (l.umidade < limites.minIdeal) countDeficit++;
                else if (l.umidade > limites.maxIdeal) countExcesso++;
                else countIdeal++;

                // Lógica retroativa de "Recomendações Emitidas": 
                // Cada vez que o status passa de (IDEAL ou ENCHARCADO) para SECO, contabilizamos 1 alerta/recomendação
                let currentVirtualStatus = (l.umidade < limites.minIdeal) ? 'SECO' : ((l.umidade > limites.maxIdeal) ? 'ENCHARCADO' : 'IDEAL');
                if (currentVirtualStatus === 'SECO' && lastStatus !== 'SECO') {
                    recomendacoesCount++;
                }
                lastStatus = currentVirtualStatus;
            });

            umidadeMedia = sumUmidade / totalLeituras;
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
