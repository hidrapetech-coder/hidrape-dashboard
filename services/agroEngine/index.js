const crypto = require('node:crypto');
const rules = require('../../config/agro');
const { getCropConfig } = require('../../config/cultures');
const { evaluateDataQuality, normalizeHistory } = require('./dataQuality');
const { detectAnomalies } = require('./anomalyDetection');
const { analyzeClimate } = require('./climateAnalyzer');
const { predictMoisture } = require('./mlPredictor');
const { calculateRiskAndConfidence } = require('./riskAndConfidence');
const { makeDecision } = require('./decisionMaker');
const evaluate = (user, history, weather, satellite, now = Date.now()) => {
    const quality = evaluateDataQuality(history,now), { readings } = normalizeHistory(history,now);
    if (user.sensorOnline === false) {
        quality.eligible = false; quality.score = 0; quality.level = 'INVALID'; quality.sensorStatus = 'OFFLINE';
        quality.issues.push('A última consulta ao dispositivo falhou; confirmar comunicação e leitura.');
    }
    const anomalies = detectAnomalies(history,weather,quality,now);
    const climate = analyzeClimate(weather,satellite,now);
    const predictor = predictMoisture(history,climate,user,now);
    const { risk, confidence } = calculateRiskAndConfidence(quality,anomalies,predictor,history,climate);
    const current = readings[0]?.umidade ?? null;
    const recommendation = makeDecision(quality,anomalies,climate,predictor,{ risk,confidence },current);
    if (!confidence.eligible) {
        predictor.hoursUntilStress = null; predictor.dynamicDropRate = null;
        for (const key of Object.keys(predictor.predictions)) predictor.predictions[key] = null;
    }
    const engineData = { version:rules.version, dataQuality:quality, anomalies,climateAnalysis:climate,
        predictor, predictions:predictor.predictions,risk,confidence,recommendation,
        inputs:{culture:user.tipoPlantacao, limits:getCropConfig(user), sensorOnline:user.sensorOnline ?? null, rules, history:(Array.isArray(history) ? history : []).map(row=>({data:row?.data,umidade:row?.umidade})), readings, weather, satellite}, evaluatedAt:new Date(now).toISOString() };
    const snapshotId = crypto.createHash('sha256').update(JSON.stringify({ userId:user.id, ...engineData })).digest('hex');
    const status = { IRRIGAR:'critico', ATENÇÃO:'alerta', EXCESSO_UMIDADE:'alerta', MONITORAR:'normal', VERIFICAR_SENSOR:'indisponivel' }[recommendation.action];
    const sensorState = { status:quality.sensorStatus.toLowerCase(),hasValidData:confidence.eligible,lastReadingAt:quality.lastUpdate,dataAgeMinutes:quality.ageMinutes,umidadeAtual:current,reason:quality.issues.join(' ') };
    return { snapshotId, sensorState, tempoHoras:predictor.hoursUntilStress, recomendacao:recommendation.explanation.join(' '),status,
        _meta:{dropRealTime:predictor.dynamicDropRate,limiteCultura:predictor.criticalLimit,rainProb:climate.maxRainProb12h,sensorState},engineData };
};
module.exports = { evaluate };
