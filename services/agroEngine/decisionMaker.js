/**
 * Módulo de Tomada de Decisão (Decision Maker & Explicability)
 * 
 * Agrega todos os módulos e sugere uma ação estruturada,
 * acompanhada da explicabilidade dos fatores determinantes.
 */

const makeDecision = (dataQuality, anomalies, climate, predictor, riskAndConfidence, currentMoisture) => {
    let action = 'MONITORAR';
    const explanation = [];

    // Prioridade Máxima: Fallback de Segurança
    if (riskAndConfidence.confidence.level === 'LOW') {
        action = 'VERIFICAR_SENSOR';
        explanation.push('Não há dados confiáveis suficientes para recomendar irrigação com segurança.');
        explanation.push(...riskAndConfidence.confidence.factors);
        
        return { action, explanation };
    }

    // Lógica de Negócio Padrão
    const rainProb = climate.maxRainProb12h;

    if (rainProb > 60) {
        action = 'AGUARDAR';
        explanation.push(`Aguardar. Alta probabilidade de chuva nas próximas horas (${rainProb}%).`);
        
        if (currentMoisture <= predictor.criticalLimit) {
            explanation.push('Embora o solo esteja seco, irrigar agora geraria desperdício hídrico e risco de saturação (excesso de água) caso chova pesado.');
        }
    } else if (predictor.hoursUntilStress <= 0) {
        action = 'IRRIGAR';
        explanation.push(`A umidade atual (${currentMoisture}%) está no limite crítico ou abaixo dele (${predictor.criticalLimit}%).`);
        explanation.push('O risco de estresse hídrico grave é iminente.');
        
        if (climate.eto > 5 || climate.temperature > 30) {
            explanation.push(`As condições atmosféricas (Calor / ETo alta) estão acelerando a perda de água.`);
        }
    } else if (predictor.hoursUntilStress <= 6) {
        action = 'ATENÇÃO';
        explanation.push(`Previsão indica necessidade de irrigação nas próximas ${Math.round(predictor.hoursUntilStress)} horas.`);
        explanation.push(`Umidade projetada: ${Math.round(predictor.predictions.in6h)}%. Prepare os sistemas de irrigação.`);
    } else {
        action = 'MONITORAR';
        explanation.push(`Condições estáveis e dentro da faixa segura. Umidade projetada em 12h: ${Math.round(predictor.predictions.in12h)}%.`);
        
        if (climate.maxRainProb12h > 0 && climate.maxRainProb12h <= 60) {
            explanation.push(`Existe uma chance moderada de chuva (${climate.maxRainProb12h}%), não é necessária intervenção.`);
        }
    }

    // Injeção de Risco na Explicação
    if (riskAndConfidence.risk.level === 'HIGH' && action !== 'IRRIGAR') {
        explanation.push('CUIDADO: Apesar da recomendação atual, há fatores de alto risco presentes. Monitore ativamente.');
    }

    return { action, explanation };
};

module.exports = { makeDecision };
