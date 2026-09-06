/**
 * Módulo de Risco e Confiança
 * 
 * Calcula pontuações de Risco (Ex: Estresse hídrico) e Confiança (Qualidade das métricas utilizadas).
 * É crucial não apresentar estimativas de baixa confiança como garantias absolutas.
 */

const calculateRiskAndConfidence = (dataQuality, anomalies, predictor, historico) => {
    // ============================================
    // 1. CÁLCULO DE CONFIANÇA (Confidence Score)
    // ============================================
    let confidenceScore = 100;
    const confidenceFactors = [];

    // Impacto da qualidade de dados
    if (dataQuality.level === 'INVALID') {
        confidenceScore = 0;
        confidenceFactors.push("Dados do sensor inválidos ou offline.");
    } else {
        confidenceScore -= (100 - dataQuality.score) * 0.5; // Qualidade de dados afeta peso
    }

    // Impacto do histórico
    if (!historico || historico.length < 5) {
        confidenceScore -= 30;
        confidenceFactors.push("Quantidade insuficiente de dados históricos (Necessita de mais leituras).");
    } else if (historico.length < 50) {
        confidenceScore -= 10;
        confidenceFactors.push("Histórico parcial (Calibração do terreno ainda em andamento).");
    }

    // Impacto de anomalias
    if (anomalies && anomalies.length > 0) {
        const hasCritical = anomalies.some(a => a.severity === 'CRITICAL' || a.severity === 'HIGH');
        if (hasCritical) {
            confidenceScore -= 40;
            confidenceFactors.push("Anomalias graves detectadas no comportamento do sensor.");
        } else {
            confidenceScore -= 15;
            confidenceFactors.push("Anomalias leves detectadas cruzando clima e solo.");
        }
    }

    // Impacto do modelo utilizado
    if (predictor.modelType === 'DETERMINISTIC_FALLBACK') {
        confidenceScore -= 10;
        confidenceFactors.push("Utilizando modelo determinístico de fallback (ML requer mais dados).");
    }

    confidenceScore = Math.max(0, Math.min(100, Math.round(confidenceScore)));

    let confidenceLevel = 'HIGH';
    if (confidenceScore < 40) confidenceLevel = 'LOW';
    else if (confidenceScore < 75) confidenceLevel = 'MEDIUM';


    // ============================================
    // 2. CÁLCULO DE RISCO (Risk Score)
    // ============================================
    let riskScore = 0;
    const riskFactors = [];

    // Se a confiança é zero, o risco é desconhecido e alto de falha sistêmica
    if (confidenceLevel === 'LOW') {
        riskScore = 80;
        riskFactors.push("Risco elevado de tomada de decisão incorreta devido à baixa confiabilidade dos dados.");
    } else {
        // Horas até o estresse (Menor = Maior Risco)
        if (predictor.hoursUntilStress <= 0) {
            riskScore += 90;
            riskFactors.push("Plantação já se encontra abaixo do limite crítico de umidade.");
        } else if (predictor.hoursUntilStress <= 6) {
            riskScore += 70;
            riskFactors.push("Estresse hídrico muito próximo (menos de 6 horas).");
        } else if (predictor.hoursUntilStress <= 12) {
            riskScore += 40;
            riskFactors.push("Estresse hídrico provável nas próximas 12 horas.");
        } else {
            riskScore += 10;
        }

        // Predição 24h abaixo do limite crítico
        if (predictor.predictions.in24h < predictor.criticalLimit) {
            riskScore += 20;
            riskFactors.push(`A previsão indica umidade de ${Math.round(predictor.predictions.in24h)}% em 24h, o que é abaixo do ideal.`);
        }
    }

    riskScore = Math.max(0, Math.min(100, Math.round(riskScore)));
    
    let riskLevel = 'LOW';
    if (riskScore > 75) riskLevel = 'HIGH';
    else if (riskScore > 40) riskLevel = 'MEDIUM';

    return {
        confidence: {
            score: confidenceScore,
            level: confidenceLevel,
            factors: confidenceFactors
        },
        risk: {
            score: riskScore,
            level: riskLevel,
            factors: riskFactors
        }
    };
};

module.exports = { calculateRiskAndConfidence };
