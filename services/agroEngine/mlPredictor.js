const { getCropConfig } = require('../../config/cultures');
const rules = require('../../config/agro');
const { normalizeHistory, timestamp, evaluateDataQuality } = require('./dataQuality');
const predictMoisture = (history, climate, cropType, now = Date.now()) => {
    const config = getCropConfig(cropType);
    const { readings, issues } = normalizeHistory(history, now);
    const current = readings[0]?.umidade ?? null;
    const segment = [];
    for (const row of readings) {
        if (segment.length && segment.at(-1).umidade - row.umidade > rules.refillPoints) break;
        segment.push(row);
    }
    const span = segment.length ? (timestamp(segment[0].data) - timestamp(segment.at(-1).data)) / 3600000 : 0;
    let drop = null, r2 = null;
    if (!issues.length && evaluateDataQuality(history, now).eligible && segment.length >= rules.minSamples && span >= rules.minSpanHours) {
        const xs = segment.map(r => (timestamp(r.data) - timestamp(segment[0].data)) / 3600000);
        const ys = segment.map(r => r.umidade);
        const meanX = xs.reduce((a,b) => a+b,0) / xs.length, meanY = ys.reduce((a,b) => a+b,0) / ys.length;
        const xx = xs.reduce((sum,x) => sum + (x-meanX)**2,0);
        const yy = ys.reduce((sum,y) => sum + (y-meanY)**2,0);
        const xy = xs.reduce((sum,x,i) => sum + (x-meanX)*(ys[i]-meanY),0);
        const candidate = xx > 0 ? -xy / xx : null;
        r2 = xx > 0 && yy > 0 ? xy**2/(xx*yy) : null;
        if (candidate > 0 && candidate <= rules.maxDropPointsPerHour && r2 >= rules.minFitR2) drop = candidate;
    }
    const horizonHours = Math.min(rules.maxForecastHours, span);
    const ageHours = readings.length ? (now - timestamp(readings[0].data))/3600000 : 0;
    const forecast = {};
    for (const hours of [6,12,24]) {
        forecast[`in${hours}h`] = drop !== null && hours + ageHours <= horizonHours
            ? Math.max(0, Math.min(100, current - drop * (hours + ageHours))) : null;
        // Não há intervalo de confiança calibrado: não fabricar margem ±15%.
        forecast[`in${hours}h_min`] = null; forecast[`in${hours}h_max`] = null;
    }
    const deficit = current !== null && config.supported ? Math.max(0, config.minIdeal-current) : null;
    const time = drop !== null && config.supported ? Math.max(0,(current-config.minIdeal)/drop-ageHours) : null;
    return { predictions: forecast, dynamicDropRate: drop, hoursUntilStress: deficit !== null && current <= config.minIdeal ? 0 : time !== null && time <= horizonHours ? time : null,
        criticalLimit: config.minIdeal, upperLimit: config.maxIdeal, cropSupported: config.supported,
        currentMoisture: current, deficitAtual: deficit, modelType: drop === null ? 'UNAVAILABLE' : 'OBSERVED_LINEAR_TREND',
        sampleCount: segment.length, spanHours: span, horizonHours, fitR2: r2, unit: 'sensor_percentage_points_per_hour',
        limitations: ['Tendência condicional à continuidade da secagem; chuva e irrigação podem interrompê-la.', 'ET₀ e chuva em mm não são convertidas em porcentagem do sensor.'] };
};
module.exports = { predictMoisture };
