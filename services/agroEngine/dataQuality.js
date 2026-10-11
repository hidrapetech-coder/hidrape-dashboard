const rules = require('../../config/agro');
const isMoisture = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
const timestamp = value => value instanceof Date || typeof value === 'string' ? new Date(value).getTime() : NaN;
// Ordena sem mutar o chamador; amostras inválidas e duplicadas são explicitamente sinalizadas.
const normalizeHistory = (history, now = Date.now()) => {
    const issues = [], readings = [], seen = new Map();
    for (const row of Array.isArray(history) ? history : []) {
        const time = timestamp(row?.data);
        if (!isMoisture(row?.umidade) || !Number.isFinite(time) || time > now) {
            issues.push('Leitura inválida ou com data futura.'); continue;
        }
        if (seen.has(time)) {
            issues.push(seen.get(time) === row.umidade ? 'Timestamp duplicado.' : 'Leituras conflitantes no mesmo timestamp.'); continue;
        }
        seen.set(time, row.umidade);
        readings.push({ data: new Date(time).toISOString(), umidade: row.umidade });
    }
    readings.sort((a, b) => timestamp(b.data) - timestamp(a.data));
    return { readings, issues: [...new Set(issues)] };
};
const evaluateDataQuality = (history, now = Date.now()) => {
    const { readings, issues } = normalizeHistory(history, now);
    const last = readings[0];
    const ageMinutes = last ? (now - timestamp(last.data)) / 60000 : null;
    const staleData = !last || ageMinutes > rules.freshnessMinutes;
    const spanHours = readings.length ? (timestamp(last.data) - timestamp(readings.at(-1).data)) / 3600000 : 0;
    if (!last) issues.push('Nenhuma leitura válida disponível.');
    if (last && staleData) issues.push('Leitura com mais de 30 minutos; atualizar o sensor.');
    if (readings.length < rules.minSamples || spanHours < rules.minSpanHours) issues.push('Histórico insuficiente: mínimo de 5 leituras distintas ao longo de 1 hora.');
    const eligible = !!last && !staleData && issues.length === 0;
    const score = !last ? 0 : eligible ? 100 : staleData ? 20 : 35;
    return { score, level: score === 0 ? 'INVALID' : eligible ? 'HIGH' : 'LOW', eligible,
        sensorStatus: !last ? 'OFFLINE' : staleData ? 'STALE' : 'ONLINE', lastUpdate: last?.data ?? null,
        ageMinutes, spanHours, sampleCount: readings.length, staleData,
        anomaliesDetected: issues.length > 0, missingData: !last, issues };
};
module.exports = { evaluateDataQuality, normalizeHistory, isMoisture, timestamp };
