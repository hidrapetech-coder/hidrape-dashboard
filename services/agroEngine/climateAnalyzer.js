const finite = (x, min = -Infinity, max = Infinity) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
const weatherTimestamp = (value, offset = 0) => {
    if (finite(value)) return value * 1000; // Open-Meteo timeformat=unixtime
    if (typeof value !== 'string') return NaN;
    return /Z$|[+-]\d\d:\d\d$/.test(value) ? Date.parse(value) : Date.parse(value + 'Z') - offset * 1000;
};
const analyzeClimate = (data, satellite, now = Date.now()) => {
    const result = { available: false, temperature: null, humidity: null, windSpeed: null, eto: null,
        maxRainProb12h: null, expectedRainVolume12h: null, macroMoisture: null, climateMultiplier: null,
        source: 'Open-Meteo', precipitationUnit: 'mm', etoUnit: 'mm/day', forecastHours: 0 };
    if (!data || data.error) return result;
    const offset = finite(data.utc_offset_seconds) ? data.utc_offset_seconds : 0;
    const age = now - weatherTimestamp(data.current?.time, offset);
    const currentValid = age >= 0 && age <= 2*3600000 && finite(data.current?.temperature_2m, -90,65) && finite(data.current?.relative_humidity_2m,0,100);
    if (currentValid) {
        result.temperature = data.current.temperature_2m; result.humidity = data.current.relative_humidity_2m;
        result.windSpeed = finite(data.current.wind_speed_10m,0,500) ? data.current.wind_speed_10m : null;
    }
    const today = new Date(now + offset * 1000).toISOString().slice(0,10);
    const dailyIndex = (Array.isArray(data.daily?.time) ? data.daily.time : [])?.findIndex(t => typeof t === 'string' ? t.slice(0,10) === today : new Date(t*1000+offset*1000).toISOString().slice(0,10) === today) ?? -1;
    const eto = data.daily?.et0_fao_evapotranspiration?.[dailyIndex];
    if (finite(eto,0,30)) result.eto = eto;
    const hours = [], seen = new Set();
    for (const [i,t] of (Array.isArray(data.hourly?.time) ? data.hourly.time : []).entries()) {
        const time = weatherTimestamp(t,offset), rain = data.hourly.precipitation?.[i], prob = data.hourly.precipitation_probability?.[i];
        if (time > now && time <= now+12*3600000 && !seen.has(time) && finite(rain,0,1000) && finite(prob,0,100)) {
            seen.add(time); hours.push({ time, rain, prob });
        }
    }
    hours.sort((a,b) => a.time-b.time);
    result.forecastHours = hours.length;
    const contiguous = hours.length === 12 && hours.every((h,i) => !i || h.time-hours[i-1].time === 3600000);
    if (contiguous) {
        result.maxRainProb12h = Math.max(...hours.map(h => h.prob));
        result.expectedRainVolume12h = hours.reduce((s,h) => s+h.rain,0);
    }
    result.available = currentValid && contiguous && result.eto !== null;
    // GWETTOP é saturação regional relativa, não uma medida intercambiável com o sensor.
    if (satellite?.available && finite(satellite.umidadeMacro,0,100)) result.macroMoisture = satellite.umidadeMacro;
    return result;
};
module.exports = { analyzeClimate, weatherTimestamp };
