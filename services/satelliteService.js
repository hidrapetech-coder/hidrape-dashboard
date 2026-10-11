const { getJson, validCoordinates } = require('../lib/httpJson');
const cache = require('../lib/cache');
const unavailable = () => ({ available:false, umidadeMacro:null, dataReferencia:null, fonte:'Indisponível', historico:[], unit:'relative_saturation_percent' });
const parseSatellite = (json, now = Date.now()) => {
    const rows = Object.entries(json?.properties?.parameter?.GWETTOP || {}).flatMap(([day,value]) => {
        if (!/^\d{8}$/.test(day) || typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) return [];
        const date = `${day.slice(0,4)}-${day.slice(4,6)}-${day.slice(6,8)}`;
        const ms = Date.parse(date+'T00:00:00Z');
        if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0,10) !== date || ms > now || now-ms > 30*86400000) return [];
        return [{ data:date, valor:Math.round(value*100) }];
    }).sort((a,b) => a.data.localeCompare(b.data)).slice(-7);
    if (!rows.length) return unavailable();
    const latest = rows.at(-1), ageDays = Math.floor((now-Date.parse(latest.data+'T00:00:00Z'))/86400000);
    return { available:ageDays <= 7, stale:ageDays > 7, umidadeMacro:ageDays <= 7 ? latest.valor : null,
        dataReferencia:latest.data, ageDays, fonte:'NASA POWER', historico:rows, unit:'relative_saturation_percent', retrievedAt:new Date(now).toISOString() };
};
const fetchSateliteData = async (lat,lon) => {
    if (!validCoordinates(lat,lon)) return unavailable();
    const key = `sat:v3:${lat},${lon}`;
    const stored = await cache.read(key);
    if (stored && Date.now()-Date.parse(stored.retrievedAt) < 12*3600000 && Date.now()-Date.parse(stored.dataReferencia+'T00:00:00Z') <= 7*86400000) return stored;
    try {
        const day = ms => new Date(ms).toISOString().slice(0,10).replaceAll('-','');
        const params = new URLSearchParams({parameters:'GWETTOP', community:'AG',longitude:lon,latitude:lat,start:day(Date.now()-30*86400000),end:day(Date.now()),format:'JSON'});
        const result = parseSatellite(await getJson(`https://power.larc.nasa.gov/api/temporal/daily/point?${params}`));
        if (result.available) await cache.write(key,43200,result);
        return result;
    } catch { console.warn('[NASA] Fonte indisponível.'); return unavailable(); }
};
module.exports = { fetchSateliteData, parseSatellite };
