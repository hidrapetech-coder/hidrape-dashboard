/**
 * Módulo Preditor (Machine Learning Preparado)
 * 
 * Calcula previsões de umidade futura. 
 * Se houver dados históricos suficientes (ex: milhares de logs + calibrações),
 * poderia carregar um modelo XGBoost ou LSTM. Atualmente, usa heurística determinística
 * robusta (Fallback Seguro), como estipulado nos requisitos de arquitetura confiável.
 */

const predictMoisture = (historico, climateAnalysis, cropType) => {
    const CROP_CONFIG = {
        'cana-de-açúcar': { min: 35, retention: 'high' },
        'hortaliças': { min: 50, retention: 'low' },
        'milho': { min: 40, retention: 'medium' },
        'default': { min: 40, retention: 'medium' }
    };

    const config = CROP_CONFIG[(cropType || '').toLowerCase()] || CROP_CONFIG['default'];
    const limiteMinimo = config.min;

    let currentMoisture = 50; 
    let baseDropRate = 0.8; // Taxa de queda base (Umidade % / hora)

    if (historico && historico.length > 0) {
        currentMoisture = historico[0].umidade;
        
        if (historico.length >= 2) {
            const oldest = historico[historico.length - 1];
            const hourDiff = (new Date(historico[0].data) - new Date(oldest.data)) / (1000 * 60 * 60);
            
            if (hourDiff > 0.1) {
                const drop = oldest.umidade - currentMoisture;
                if (drop > 0) {
                    baseDropRate = drop / hourDiff;
                }
            }
        }
    }

    // Aplica o multiplicador do modelo climático sobre a base do terreno
    const dynamicDropRate = Math.max(0.2, baseDropRate * climateAnalysis.climateMultiplier);

    // Previsões lineares simuladas para os próximos cenários (6h, 12h, 24h)
    // Impede que a previsão fique negativa
    const forecast = {
        in6h: Math.max(0, currentMoisture - (dynamicDropRate * 6)),
        in12h: Math.max(0, currentMoisture - (dynamicDropRate * 12)),
        in24h: Math.max(0, currentMoisture - (dynamicDropRate * 24))
    };

    // Tempo estimado para atingir o limite crítico da cultura
    let horasAteEstresse = (currentMoisture - limiteMinimo) / dynamicDropRate;
    horasAteEstresse = Math.max(1, Math.min(48, horasAteEstresse)); // Clamping

    // Simulação do impacto de uma chuva (Se houver >60% de prob de chuva, ela deve estagnar ou subir a umidade)
    if (climateAnalysis.maxRainProb12h > 60) {
        // Se chover, a umidade tende a subir ou estabilizar, e não cair linearmente.
        // O modelo ajusta a previsão
        forecast.in6h = Math.min(100, forecast.in6h + 10);
        forecast.in12h = Math.min(100, forecast.in12h + 20);
        forecast.in24h = Math.min(100, forecast.in24h + 25);
    }

    return {
        predictions: forecast,
        dynamicDropRate: dynamicDropRate.toFixed(2),
        hoursUntilStress: horasAteEstresse,
        criticalLimit: limiteMinimo,
        modelType: "DETERMINISTIC_FALLBACK" // Pode ser 'LSTM', 'XGBOOST' no futuro
    };
};

module.exports = { predictMoisture };
