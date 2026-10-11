const rules = require('../../config/agro');
const { normalizeHistory, timestamp } = require('./dataQuality');
const detectAnomalies = (history, climate, quality, now = Date.now()) => {
    const anomalies = [];
    const { readings } = normalizeHistory(history, now);
    if (!quality.eligible) anomalies.push({ type: 'DATA_QUALITY', severity: 'HIGH', explanation: quality.issues.join(' ') });
    const recent = readings.filter(r => now - timestamp(r.data) <= rules.historyHours * 3600000);
    const flat = [];
    for (const row of recent) {
        if (Math.abs(row.umidade-recent[0].umidade) > rules.frozenTolerance) break;
        flat.push(row);
    }
    const span = flat.length ? (timestamp(flat[0].data) - timestamp(flat.at(-1).data)) / 3600000 : 0;
    if (flat.length >= rules.minSamples && span >= rules.minSpanHours) {
        anomalies.push({ type: 'FROZEN_SENSOR', severity: 'HIGH', explanation: `Variação de até ${rules.frozenTolerance} ponto percentual em ${span.toFixed(1)}h; possível sensor congelado ou solo estável. Conferir antes de recomendar manejo.` });
    }
    for (let i = 1; i < recent.length; i++) {
        const minutes = (timestamp(recent[i-1].data) - timestamp(recent[i].data)) / 60000;
        const change = recent[i-1].umidade - recent[i].umidade;
        if (minutes <= rules.jumpMinutes && Math.abs(change) > rules.jumpPoints) {
            const confirmed = i >= rules.minSamples && (timestamp(recent[0].data)-timestamp(recent[i-1].data))/3600000 >= rules.minSpanHours;
            if (confirmed) {
                anomalies.push({type:'PAST_JUMP',severity:'INFO',explanation:'Variação abrupta anterior; há pelo menos 5 novas leituras ao longo de 1h após o evento.'});
                break;
            }
            anomalies.push({ type: change > 0 ? 'RAPID_WETTING' : 'ABRUPT_DROP', severity: 'HIGH',
                explanation: change > 0 ? 'Aumento rápido: pode ser chuva, irrigação ou falha. Aguardar confirmação por novas leituras.' : 'Queda abrupta; conferir leitura e instalação antes de recomendar irrigação.' });
            break;
        }
    }
    // Probabilidade prevista de chuva não prova chuva observada no ponto do sensor.
    return anomalies;
};
module.exports = { detectAnomalies };
