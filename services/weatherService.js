const { getJson, validCoordinates } = require('../lib/httpJson');
const cache = require('../lib/cache');
const { analyzeClimate } = require('./agroEngine/climateAnalyzer');
const fetchWeather = async user => {
    if (!user.cidade?.trim() || !validCoordinates(user.lat,user.lon)) return null;
    const key = `weather:v3:${user.id}:${user.lat}:${user.lon}`;
    const stored = await cache.read(key);
    if (stored && analyzeClimate(stored,null).available) return stored;
    try {
        const params = new URLSearchParams({ latitude:user.lat, longitude:user.lon, current:'temperature_2m,relative_humidity_2m,weather_code,is_day,wind_speed_10m',hourly:'precipitation,precipitation_probability',daily:'et0_fao_evapotranspiration',timezone:'auto',timeformat:'unixtime',forecast_days:'2' });
        const result = await getJson(`https://api.open-meteo.com/v1/forecast?${params}`);
        if (!analyzeClimate(result,null).available) return null;
        result.retrievedAt = new Date().toISOString();
        await cache.write(key,600,result); return result;
    } catch { console.warn('[Weather] Fonte indisponível.'); return null; }
};
module.exports = { fetchWeather };
