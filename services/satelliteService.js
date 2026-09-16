const https = require('https');
const redis = require('../lib/redis');

const CACHE_DURATION_SEC = 12 * 60 * 60; // 12 horas em segundos

/**
 * Busca dados de satélite da NASA POWER (Surface Soil Wetness)
 * @param {string|number} lat 
 * @param {string|number} lon 
 * @returns {Promise<Object>} Objeto com umidade (0-100) e data de referência
 */
const fetchSateliteData = async (lat, lon) => {
    return new Promise(async (resolve) => {
        const cacheKey = `sat:${lat},${lon}`;
        
        // Retornar do cache se válido
        const cached = await redis.get(cacheKey);
        if (cached) {
            return resolve(JSON.parse(cached));
        }

        // Janela de busca: hoje até 30 dias atrás
        const end = new Date();
        const start = new Date(end);
        start.setDate(start.getDate() - 30);

        const formatDate = (d) => d.toISOString().split('T')[0].replace(/-/g, '');
        const startStr = formatDate(start);
        const endStr = formatDate(end);

        const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=GWETTOP&community=AG&longitude=${parseFloat(lon)}&latitude=${parseFloat(lat)}&start=${startStr}&end=${endStr}&format=JSON`;

        const handleFallback = async (err) => {
            console.warn('[NASA Satellite] Aviso/Fallback:', err ? err.message : 'Dados indisponíveis');
            const fallbackCached = await redis.get(cacheKey);
            if (fallbackCached) {
                return resolve(JSON.parse(fallbackCached));
            }
            // Não injetar dados falsos
            resolve({
                umidadeMacro: null,
                dataReferencia: null,
                fonte: 'Indisponível',
                historico: []
            });
        };

        const req = https.get(url, (res) => {
            let body = '';
            res.on('data', d => body += d);
            res.on('end', async () => {
                try {
                    const json = JSON.parse(body);
                    if (!json || !json.properties || !json.properties.parameter || !json.properties.parameter.GWETTOP) {
                        return handleFallback(new Error("Formato inválido da NASA POWER"));
                    }

                    const rawData = json.properties.parameter.GWETTOP;
                    const historico = [];
                    let latestEntry = null;

                    // A NASA retorna datas como YYYYMMDD
                    const dates = Object.keys(rawData).sort((a,b) => b.localeCompare(a));
                    
                    for(let i=0; i<dates.length; i++){
                        let val = rawData[dates[i]];
                        if(val !== -999) { // -999 é null data na NASA
                            if (!latestEntry) latestEntry = { date: dates[i], val: val };
                            if (historico.length < 7) {
                                historico.push({
                                    data: `${dates[i].substring(0,4)}-${dates[i].substring(4,6)}-${dates[i].substring(6,8)}`,
                                    valor: Math.round(val * 100)
                                });
                            }
                        }
                        if (historico.length >= 7) break;
                    }

                    if (!latestEntry) {
                        return handleFallback(new Error("Sem dados válidos nos últimos 30 dias"));
                    }

                    const result = {
                        umidadeMacro: Math.round(latestEntry.val * 100),
                        dataReferencia: `${latestEntry.date.substring(0,4)}-${latestEntry.date.substring(4,6)}-${latestEntry.date.substring(6,8)}`,
                        fonte: 'NASA POWER',
                        historico: historico.reverse()
                    };

                    // Salvar no Cache Global Redis
                    await redis.setex(cacheKey, CACHE_DURATION_SEC, JSON.stringify(result));

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
