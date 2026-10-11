const makeDecision = (quality, anomalies, climate, predictor, riskAndConfidence, current) => {
    if (!quality.eligible || !riskAndConfidence.confidence.eligible || anomalies.some(a => ['HIGH','CRITICAL'].includes(a.severity))) {
        return { action: 'VERIFICAR_SENSOR', explanation: ['Recomendação de manejo suspensa: conferir sensor, histórico e configuração da cultura.', ...riskAndConfidence.confidence.factors] };
    }
    const explanation = [];
    let action = 'MONITORAR';
    if (current > predictor.upperLimit) {
        action = 'EXCESSO_UMIDADE';
        explanation.push(`Umidade de ${current}% acima da faixa de referência (${predictor.upperLimit}%). Evite acrescentar água e confira a condição do solo e a drenagem.`);
    } else if (current <= predictor.criticalLimit) {
        action = 'IRRIGAR';
        explanation.push(`Umidade de ${current}% no limite inferior ou abaixo (${predictor.criticalLimit}%). Avalie a irrigação após confirmar a leitura no campo. Volume e duração dependem de calibração do solo e do sistema.`);
    } else if (predictor.hoursUntilStress !== null && predictor.hoursUntilStress <= 6) {
        action = 'ATENÇÃO';
        explanation.push(`Se a secagem observada continuar, o limite de referência poderá ser atingido em ${predictor.hoursUntilStress.toFixed(1)}h. Monitorar novamente antes do manejo.`);
    } else {
        explanation.push(`Leitura atual de ${current}% dentro da faixa de referência. Continue monitorando.`);
    }
    if (!climate.available) explanation.push('Clima indisponível; não foi possível avaliar a previsão meteorológica.');
    else if (climate.expectedRainVolume12h > 0) explanation.push(`Precipitação prevista em 12h: ${climate.expectedRainVolume12h.toFixed(1)} mm. Não comprova chuva no talhão nem reposição do déficit do sensor.`);
    if (predictor.dynamicDropRate === null) explanation.push('Sem tendência de secagem confiável para estimar horário de irrigação.');
    return { action, explanation };
};
module.exports = { makeDecision };
