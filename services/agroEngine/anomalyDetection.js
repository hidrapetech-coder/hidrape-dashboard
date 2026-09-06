/**
 * Módulo de Detecção de Anomalias (Anomaly Detection)
 * Busca comportamentos suspeitos cruzando dados do sensor e clima.
 */

const detectAnomalies = (historico, clima, dataQuality) => {
    const anomalies = [];

    // Se a qualidade já está inválida, não vale a pena gastar processamento procurando padrões sutis.
    if (dataQuality.level === 'INVALID') {
        anomalies.push({
            type: 'SENSOR_OFFLINE',
            severity: 'CRITICAL',
            explanation: 'O sensor não está enviando dados válidos.'
        });
        return anomalies;
    }

    if (!historico || historico.length < 5) {
        return anomalies; // Pouco dado para detectar padrões anômalos
    }

    const latest = historico[0];
    const past24h = historico.filter(h => 
        (new Date(latest.data).getTime() - new Date(h.data).getTime()) <= (24 * 60 * 60 * 1000)
    );

    // Regra 1: Sensor Congelado (Sensor Frozen)
    // Se nas últimas 24h (com pelo menos 5 leituras) a umidade nunca mudou nem 1%
    if (past24h.length >= 5) {
        let isFrozen = true;
        for (let i = 1; i < past24h.length; i++) {
            if (past24h[i].umidade !== latest.umidade) {
                isFrozen = false;
                break;
            }
        }
        if (isFrozen) {
            anomalies.push({
                type: 'FROZEN_SENSOR',
                severity: 'HIGH',
                explanation: 'A leitura de umidade não sofreu nenhuma alteração nas últimas 24h. Verifique se o sensor está travado.'
            });
        }
    }

    // Regra 2: Comportamento Incompatível com o Clima
    // Se a umidade caiu vertiginosamente (>15%) num período em que choveu muito.
    const precipArray = clima?.hourly?.precipitation_probability;
    if (precipArray && precipArray.length > 0) {
        const recentRain = precipArray.slice(0, 3).some(prob => prob > 80);
        if (recentRain && past24h.length >= 2) {
            const drop = past24h[past24h.length - 1].umidade - latest.umidade;
            if (drop > 15) {
                anomalies.push({
                    type: 'CLIMATE_MISMATCH',
                    severity: 'MEDIUM',
                    explanation: 'A umidade do solo caiu abruptamente mesmo com alta probabilidade de chuva recente. Possível erro de leitura ou drenagem excessiva.'
                });
            }
        }
    }

    return anomalies;
};

module.exports = { detectAnomalies };
