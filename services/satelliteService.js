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
    return new Promise((resolve, reject) => {
        const cacheKey = `${lat},${lon}`;
        
        // Retornar do cache se válido
        if (satCache[cacheKey] && satCache[cacheKey].expiration > Date.now()) {
            return resolve(satCache[cacheKey].data);
        }

        // Janela de busca: hoje até 7 dias atrás (garante que pega o último dado publicado)
        const end = new Date();
        const start = new Date(end);
        start.setDate(start.getDate() - 7);

        const formatDate = (d) => d.toISOString().split('T')[0].replace(/-/g, '');
        const startStr = formatDate(start);
        const endStr = formatDate(end);

        const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=GWETTOP&community=AG&longitude=${parseFloat(lon)}&latitude=${parseFloat(lat)}&start=${startStr}&end=${endStr}&format=JSON`;

        https.get(url, (res) => {
            let body = '';
            res.on('data', d => body += d);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    
                    if (parsed.messages && parsed.messages.length > 0 && !parsed.properties) {
                        return reject(new Error(parsed.messages.join(', ')));
                    }

                    const gwetData = parsed.properties.parameter.GWETTOP;
                    
                    // Achar a data mais recente com valor válido (diferente de -999.0)
                    const dates = Object.keys(gwetData).sort().reverse();
                    let latestValidVal = null;
                    let latestValidDate = null;

                    for (let d of dates) {
                        if (gwetData[d] !== -999.0 && gwetData[d] !== null) {
                            latestValidVal = gwetData[d];
                            latestValidDate = d;
                            break;
                        }
                    }

                    if (latestValidVal === null) {
                        return reject(new Error("Nenhum dado válido de satélite encontrado na janela de 7 dias"));
                    }

                    // Gerar array histórico (ordenado cronologicamente)
                    const historico = [];
                    const chronologicalDates = Object.keys(gwetData).sort();
                    for (let d of chronologicalDates) {
                        if (gwetData[d] !== -999.0 && gwetData[d] !== null) {
                            historico.push({
                                data: `${d.substring(0,4)}-${d.substring(4,6)}-${d.substring(6,8)}`,
                                valor: Math.round(gwetData[d] * 100)
                            });
                        }
                    }

                    // Formatar o retorno (Transformar 0-1 range em 0-100%)
                    const result = {
                        umidadeMacro: Math.round(latestValidVal * 100),
                        dataReferencia: `${latestValidDate.substring(0,4)}-${latestValidDate.substring(4,6)}-${latestValidDate.substring(6,8)}`,
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
                    reject(e); 
                }
            });
        }).on('error', reject);
    });
};

module.exports = {
    fetchSateliteData
};
