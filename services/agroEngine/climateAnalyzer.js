/**
 * Módulo de Análise Climática
 * Extrai e estrutura métricas climáticas relevantes (ETo, Vento, Radiação, Chuva)
 * para alimentar os modelos preditivos e regras agronômicas.
 */

const analyzeClimate = (climaData, sateliteData) => {
    // Valores fallback seguros
    const analysis = {
        temperature: 25,
        humidity: 50,
        windSpeed: 0,
        eto: 0, // Evapotranspiração de Referência
        maxRainProb12h: 0,
        expectedRainVolume12h: 0,
        macroMoisture: 50, // Dados de satélite
        climateMultiplier: 1.0 // Impacto geral do clima na secagem
    };

    if (!climaData) return analysis;

    const current = climaData.current || {};
    analysis.temperature = current.temperature_2m ?? 25;
    analysis.humidity = current.relative_humidity_2m ?? 50;
    analysis.windSpeed = current.wind_speed_10m ?? 0;

    // ETo diária
    if (climaData.daily && climaData.daily.et0_fao_evapotranspiration && climaData.daily.et0_fao_evapotranspiration.length > 0) {
        analysis.eto = climaData.daily.et0_fao_evapotranspiration[0] ?? 0;
    }

    // Probabilidade e Volume de chuva (Pico nas próximas 12 horas)
    const timeArray = climaData.hourly?.time;
    const precipProbArray = climaData.hourly?.precipitation_probability;
    const precipArray = climaData.hourly?.precipitation;
    
    if (Array.isArray(precipProbArray) && precipProbArray.length > 0 && timeArray) {
        const now = Date.now();
        let startIndex = 0;
        for (let i = 0; i < timeArray.length; i++) {
            if (new Date(timeArray[i]).getTime() >= now) {
                startIndex = i;
                break;
            }
        }
        
        const probSlice = precipProbArray.slice(startIndex, startIndex + 12);
        analysis.maxRainProb12h = probSlice.length > 0 ? Math.max(...probSlice) : 0;
        
        if (Array.isArray(precipArray)) {
            const volSlice = precipArray.slice(startIndex, startIndex + 12);
            let expectedVolume = 0;
            for(let i = 0; i < volSlice.length; i++) {
                const prob = probSlice[i] || 0;
                const vol = volSlice[i] || 0;
                expectedVolume += vol * (prob / 100);
            }
            analysis.expectedRainVolume12h = expectedVolume;
        }
    }

    if (sateliteData && sateliteData.umidadeMacro !== null && sateliteData.umidadeMacro !== undefined) {
        if (!sateliteData.isEstimated && sateliteData.fonte !== 'Indisponível') {
            analysis.macroMoisture = sateliteData.umidadeMacro;
        } else {
            analysis.macroMoisture = null; // Ignorar macroMoisture sintética
        }
    } else {
        analysis.macroMoisture = null;
    }

    // Calcular o Multiplicador Climático (usado pelo preditor determinístico)
    let multiplier = 1.0;
    
    if (analysis.temperature > 30) multiplier += 0.3;
    if (analysis.temperature > 35) multiplier += 0.2;
    
    if (analysis.humidity < 40) multiplier += 0.2;
    if (analysis.humidity > 80) multiplier -= 0.3;

    if (analysis.windSpeed > 15) multiplier += 0.1;
    if (analysis.windSpeed > 30) multiplier += 0.2;

    if (analysis.eto > 5) multiplier += 0.15;
    
    if (analysis.macroMoisture !== null && analysis.macroMoisture < 30) multiplier += 0.15;

    // Piso e teto para não gerar secagem instantânea ou congelamento total
    analysis.climateMultiplier = Math.max(0.3, Math.min(3.0, multiplier));

    return analysis;
};

module.exports = { analyzeClimate };
