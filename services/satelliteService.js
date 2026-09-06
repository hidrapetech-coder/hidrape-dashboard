const https = require('https');

// Cache em memória para o serviço de satélite
// Estrutura: { 'lat,lon': { data: Object, expiration: Number } }
const satCache = {};
const CACHE_DURATION_MS = 12 * 60 * 60 * 1000; // 12 horas

/**
 * Busca dados de satélite da NASA POWER (Surface Soil Wetness)
 * @param {string|number} lat 
 * @param {string|number} lon 
 * @returns {Promise<Object>} Objeto com umidade (0-100) e data de referência
 */
const fetchSateliteData = (lat, lon) => {
    return new Promise((resolve) => {
        const cacheKey = `${lat},${lon}`;
        
        // Retornar do cache se válido
        if (satCache[cacheKey] && satCache[cacheKey].expiration > Date.now()) {
            return resolve(satCache[cacheKey].data);
        }

        // Janela de busca: hoje até 30 dias atrás (cobre latência do satélite da NASA de 4 a 7 dias)
        const end = new Date();
        const start = new Date(end);
        start.setDate(start.getDate() - 30);

        const formatDate = (d) => d.toISOString().split('T')[0].replace(/-/g, '');
        const startStr = formatDate(start);
        const endStr = formatDate(end);

        const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=GWETTOP&community=AG&longitude=${parseFloat(lon)}&latitude=${parseFloat(lat)}&start=${startStr}&end=${endStr}&format=JSON`;

        const handleFallback = (err) => {
            console.warn('[NASA Satellite] Aviso/Fallback:', err ? err.message : 'Dados indisponíveis');
            if (satCache[cacheKey]) {
                return resolve(satCache[cacheKey].data);
            }
            const today = new Date();
            const fallbackHist = [];
            for (let i = 6; i >= 0; i--) {
                const d = new Date(today);
                d.setDate(d.getDate() - i);
                fallbackHist.push({
                    data: d.toISOString().split('T')[0],
                    valor: 50
                });
            }
            resolve({
                umidadeMacro: 50,
                dataReferencia: today.toISOString().split('T')[0],
                fonte: 'NASA POWER (Estimado)',
                historico: fallbackHist
            });
        };

        const req = https.get(url, (res) => {
            let body = '';
            res.on('data', d => body += d);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    
                    if (parsed.messages && parsed.messages.length > 0 && !parsed.properties) {
                        return handleFallback(new Error(parsed.messages.join(', ')));
                    }

                    const gwetData = parsed.properties?.parameter?.GWETTOP;
                    if (!gwetData) {
                        return handleFallback(new Error("Estrutura de dados NASA não contém parâmetro GWETTOP"));
                    }
                    
                    // Achar datas com valores válidos (diferente de -999.0 e não nulo)
                    const chronologicalDates = Object.keys(gwetData).sort();
                    let validEntries = [];
                    for (let d of chronologicalDates) {
                        if (gwetData[d] !== -999.0 && gwetData[d] !== null && typeof gwetData[d] === 'number') {
                            validEntries.push({
                                date: d,
                                val: gwetData[d]
                            });
                        }
                    }

                    if (validEntries.length === 0) {
                        return handleFallback(new Error("Nenhum dado válido de satélite encontrado na janela de 30 dias"));
                    }

                    // Pegar os últimos 7 dias observados pelo satélite
                    let last7 = validEntries.slice(-7);

                    // Garantir 7 pontos caso haja menos dias observados disponíveis
                    if (last7.length < 7) {
                        const first = last7[0];
                        const needed = 7 - last7.length;
                        const prefix = [];
                        const firstDateObj = new Date(`${first.date.substring(0,4)}-${first.date.substring(4,6)}-${first.date.substring(6,8)}T12:00:00Z`);
                        for (let i = needed; i >= 1; i--) {
                            const d = new Date(firstDateObj);
                            d.setDate(d.getDate() - i);
                            const ds = d.toISOString().split('T')[0].replace(/-/g, '');
                            prefix.push({
                                date: ds,
                                val: first.val
                            });
                        }
                        last7 = [...prefix, ...last7];
                    }

                    const latestEntry = last7[last7.length - 1];

                    // Gerar array histórico (7 dias contínuos)
                    const historico = last7.map(e => ({
                        data: `${e.date.substring(0,4)}-${e.date.substring(4,6)}-${e.date.substring(6,8)}`,
                        valor: Math.round(e.val * 100)
                    }));

                    // Formatar o retorno (Transformar 0-1 range em 0-100%)
                    const result = {
                        umidadeMacro: Math.round(latestEntry.val * 100),
                        dataReferencia: `${latestEntry.date.substring(0,4)}-${latestEntry.date.substring(4,6)}-${latestEntry.date.substring(6,8)}`,
                        fonte: 'NASA POWER',
                        historico: historico
                    };

                    // Salvar no Cache
                    satCache[cacheKey] = {
                        expiration: Date.now() + CACHE_DURATION_MS,
                        data: result
                    };

                    resolve(result);
                } catch(e) { 
                    handleFallback(e);
                }
            });
        });

        req.on('error', handleFallback);

        req.setTimeout(8000, () => {
            req.destroy();
            handleFallback(new Error("Timeout na conexão com NASA POWER"));
        });
    });
};

module.exports = {
    fetchSateliteData
};
