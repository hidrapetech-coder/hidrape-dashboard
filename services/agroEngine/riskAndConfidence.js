const calculateRiskAndConfidence = (quality, anomalies, predictor, history, climate = {}) => {
    const blocked = !quality.eligible || anomalies.some(a => ['HIGH','CRITICAL'].includes(a.severity)) || !predictor.cropSupported;
    const factors = [...quality.issues, ...anomalies.map(a => a.explanation)];
    if (!predictor.cropSupported) factors.push('Cultura sem faixa de referência configurada.');
    if (!climate.available) factors.push('Clima indisponível; avaliação limitada ao sensor.');
    if (predictor.dynamicDropRate === null) factors.push('Tendência de secagem indisponível.');
    const confidence = { score: blocked ? Math.min(quality.score, 35) : climate.available && predictor.dynamicDropRate !== null ? 90 : 65,
        level: blocked ? 'LOW' : climate.available && predictor.dynamicDropRate !== null ? 'HIGH' : 'MEDIUM',
        eligible: !blocked, factors: [...new Set(factors)], basis: 'OPERATIONAL_SCORE_NOT_PROBABILITY' };
    const wet = predictor.upperLimit !== null && predictor.currentMoisture > predictor.upperLimit;
    const dry = predictor.hoursUntilStress === 0;
    const near = predictor.hoursUntilStress !== null && predictor.hoursUntilStress <= 6;
    const risk = blocked ? { score: null, level: 'UNKNOWN', factors: ['Dados insuficientes para classificar risco agronômico.'] }
        : { score: wet || dry ? 90 : near ? 70 : 10, level: wet || dry ? 'HIGH' : near ? 'MEDIUM' : 'LOW',
            factors: wet ? ['Umidade acima da faixa de referência.'] : dry ? ['Umidade no limite inferior ou abaixo.'] : near ? ['Tendência próxima ao limite inferior.'] : ['Sem desvio atual da faixa de referência.'] };
    return { confidence, risk };
};
module.exports = { calculateRiskAndConfidence };
