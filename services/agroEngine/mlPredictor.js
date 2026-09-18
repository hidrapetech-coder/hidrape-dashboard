const { getCropConfig } = require('../../config/cultures');

/**
 * Calcula a inclinação (taxa de queda) usando regressão linear simples 
 * (Mínimos Quadrados) sobre uma série de leituras de umidade.
 */
const calculateLinearRegressionDropRate = (historicoValido) => {
    const n = historicoValido.length;
    if (n < 2) return null;

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    
    const t0 = new Date(historicoValido[0].data).getTime();

    for (let i = 0; i < n; i++) {
        const h = historicoValido[i];
        const x = (new Date(h.data).getTime() - t0) / (1000 * 60 * 60);
        const y = h.umidade;

        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
    }

    const denominator = (n * sumX2 - sumX * sumX);
    if (denominator === 0) return null;

    const slope = (n * sumXY - sumX * sumY) / denominator;
    return -slope; // Retorna positivo para "queda"
};

const predictMoisture = (historico, climateAnalysis, cropType) => {
    const config = getCropConfig(cropType);
    const limiteMinimo = config.minIdeal;

    let currentMoisture = 50; 
    let baseDropRate = 0.8; 

    let historicoRecente = [];
    if (historico && historico.length > 0) {
        currentMoisture = historico[0].umidade;
        historicoRecente.push(historico[0]);

        for (let i = 1; i < historico.length; i++) {
            const hAtual = historico[i-1];
            const hAnterior = historico[i];
            const drop = hAnterior.umidade - hAtual.umidade; 
            
            if (drop < -3) {
                break; // Reposição hídrica detectada
            }
            historicoRecente.push(hAnterior);
        }
    }

    const regressionDropRate = calculateLinearRegressionDropRate(historicoRecente);
    const etoHourlyDrop = (climateAnalysis.eto * config.kc) / 24;
    
    if (regressionDropRate !== null && regressionDropRate > 0) {
        baseDropRate = regressionDropRate;
    } else {
        baseDropRate = etoHourlyDrop > 0 ? etoHourlyDrop * 1.5 : 0.8; 
    }

    let dynamicDropRate = baseDropRate * climateAnalysis.climateMultiplier;
    dynamicDropRate = Math.max(0.1, dynamicDropRate);

    const uncertainty = 0.15;
    const dropMax = dynamicDropRate * (1 + uncertainty);
    const dropMin = Math.max(0.05, dynamicDropRate * (1 - uncertainty));

    const forecast = {
        in6h: Math.max(0, currentMoisture - (dynamicDropRate * 6)),
        in6h_min: Math.max(0, currentMoisture - (dropMax * 6)),
        in6h_max: Math.max(0, currentMoisture - (dropMin * 6)),
        
        in12h: Math.max(0, currentMoisture - (dynamicDropRate * 12)),
        in12h_min: Math.max(0, currentMoisture - (dropMax * 12)),
        in12h_max: Math.max(0, currentMoisture - (dropMin * 12)),
        
        in24h: Math.max(0, currentMoisture - (dynamicDropRate * 24)),
        in24h_min: Math.max(0, currentMoisture - (dropMax * 24)),
        in24h_max: Math.max(0, currentMoisture - (dropMin * 24))
    };

    const deficitAtual = Math.max(0, limiteMinimo - currentMoisture);
    
    let horasAteEstresse = 0;
    if (deficitAtual > 0) {
        horasAteEstresse = 0;
    } else {
        horasAteEstresse = (currentMoisture - limiteMinimo) / dynamicDropRate;
        horasAteEstresse = Math.max(0, Math.min(48, horasAteEstresse)); // Permite 0
    }

    return {
        predictions: forecast,
        dynamicDropRate: Number(dynamicDropRate.toFixed(2)),
        hoursUntilStress: horasAteEstresse,
        criticalLimit: limiteMinimo,
        deficitAtual: deficitAtual,
        modelType: "DETERMINISTIC_FALLBACK"
    };
};

module.exports = { predictMoisture };
