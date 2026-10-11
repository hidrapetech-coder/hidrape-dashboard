// Limiares operacionais conservadores; não substituem calibração agronômica.
module.exports = Object.freeze({
    version: 'agro-3', freshnessMinutes: 30, historyHours: 24, historyLimit: 200,
    minSamples: 5, minSpanHours: 1, frozenTolerance: 0.1,
    jumpPoints: 25, jumpMinutes: 30, refillPoints: 3,
    maxDropPointsPerHour: 10, maxForecastHours: 24, minFitR2: 0.7
});
