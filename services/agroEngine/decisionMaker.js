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

    // Regras de Negócio e Agronomia
    const rainProb = climate.maxRainProb12h;
    const expectedRainVolume = climate.expectedRainVolume12h || 0;
    const deficit = predictor.deficitAtual || 0;

    // Se a plantação JÁ está no limite crítico ou abaixo
    if (deficit > 0 || predictor.hoursUntilStress <= 0) {
        // Verifica se a chuva esperada será suficiente para cobrir o déficit (assumindo conversão empírica 1mm ~ 1%)
        // Aqui estamos simplificando: se a chuva não for pelo menos 80% do déficit, precisa irrigar.
        if (expectedRainVolume >= (deficit * 0.8)) {
            action = 'AGUARDAR';
            explanation.push(`A umidade atual está crítica (${currentMoisture}%), mas há previsão de chuva suficiente (${Math.round(expectedRainVolume)} mm) para reverter o quadro nas próximas horas.`);
            explanation.push(`Aguarde e monitore se a chuva realmente ocorre antes de acionar a irrigação.`);
        } else {
            action = 'IRRIGAR';
            explanation.push(`A umidade atual (${currentMoisture}%) está no limite crítico ou abaixo dele (${predictor.criticalLimit}%).`);
            explanation.push('O risco de estresse hídrico grave é iminente.');
            
            if (expectedRainVolume > 0) {
                explanation.push(`RESSALVA: Há previsão de chuva leve (${Math.round(expectedRainVolume)} mm), mas o volume é insuficiente para repor o déficit atual.`);
            }

            if (climate.eto > 5 || climate.temperature > 30) {
                explanation.push(`As condições atmosféricas (Calor / ETo alta) estão acelerando a perda de água.`);
            }
        }
    } else if (rainProb > 60 && expectedRainVolume > 2) {
        // Não há déficit crítico, mas vai chover razoavelmente
        action = 'AGUARDAR';
        explanation.push(`Aguardar. Alta probabilidade de chuva com volume esperado de ${Math.round(expectedRainVolume)} mm nas próximas horas.`);
        explanation.push('Irrigar agora geraria desperdício hídrico e risco de saturação (excesso de água).');
    } else if (predictor.hoursUntilStress > 0 && predictor.hoursUntilStress <= 6) {
        // Sem chuva suficiente e déficit próximo
        action = 'ATENÇÃO';
        explanation.push(`Previsão indica necessidade de irrigação nas próximas ${Math.round(predictor.hoursUntilStress)} horas.`);
        explanation.push(`Umidade projetada: ${Math.round(predictor.predictions.in6h)}%. Prepare os sistemas de irrigação.`);
    } else {
        // Sem déficit, sem chuva que atrapalhe, longe do limite
        action = 'MONITORAR';
        explanation.push(`Condições estáveis e dentro da faixa segura. Umidade projetada em 12h: ${Math.round(predictor.predictions.in12h)}%.`);
        
        if (rainProb > 0 && expectedRainVolume > 0) {
            explanation.push(`Existe uma leve chance de chuva com ${Math.round(expectedRainVolume)} mm esperados.`);
        }
    }

    // Injeção de Risco na Explicação
    if (riskAndConfidence.risk.level === 'HIGH' && action !== 'IRRIGAR') {
        explanation.push('CUIDADO: Apesar da recomendação atual, há fatores de alto risco presentes. Monitore ativamente.');
    }

    return { action, explanation };
};

module.exports = { makeDecision };
