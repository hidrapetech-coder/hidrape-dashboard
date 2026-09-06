/**
 * Módulo de Qualidade de Dados (Data Quality)
 * Avalia a confiabilidade dos dados dos sensores antes da análise agronômica.
 */

const evaluateDataQuality = (historico) => {
    // 1. Tratamento de Ausência de Dados
    if (!historico || historico.length === 0) {
        return {
            score: 0,
            level: 'INVALID',
            sensorStatus: 'OFFLINE',
            lastUpdate: null,
            staleData: true,
            anomaliesDetected: false,
            missingData: true,
            issues: ['Nenhum histórico encontrado para este sensor.']
        };
    }

    const latest = historico[0];
    const ageMs = Date.now() - new Date(latest.data).getTime();
    const ageMinutes = Math.floor(ageMs / (1000 * 60));

    let score = 100;
    const issues = [];
    let sensorStatus = 'ONLINE';
    let staleData = false;
    let anomaliesDetected = false;

    // 2. Avaliação de Staleness (Tempo da última leitura)
    // - Até 60 minutos: Perfeito (Score não perde pontos)
    // - 1h a 6h: Tolerável (Perde alguns pontos)
    // - 6h a 24h: Stale (Perde muitos pontos)
    // - > 24h: Offline / Invalid
    if (ageMinutes <= 60) {
        sensorStatus = 'ONLINE';
    } else if (ageMinutes <= 360) {
        sensorStatus = 'ONLINE';
        score -= 10; // Leve desatualização
        issues.push(`Última leitura ocorreu há ${Math.floor(ageMinutes/60)} horas.`);
    } else if (ageMinutes <= 1440) { // 24h
        sensorStatus = 'STALE';
        staleData = true;
        score -= 40; 
        issues.push(`Leitura muito desatualizada (${Math.floor(ageMinutes/60)}h). Confiança comprometida.`);
    } else {
        sensorStatus = 'OFFLINE';
        staleData = true;
        score = 0;
        issues.push(`Sensor offline há mais de 24h. Dados inválidos para tomada de decisão em tempo real.`);
    }

    // 3. Quantidade de Leituras no Histórico Recente
    // Precisa de pelo menos 3 leituras para ter um histórico minimamente confiável
    if (historico.length < 3 && sensorStatus !== 'OFFLINE') {
        score -= 20;
        issues.push('Pouco histórico acumulado no banco. Previsão de tendências pode ser imprecisa.');
    }

    // 4. Verificação de Limites Físicos Absurdos
    const moisture = latest.umidade;
    if (moisture < 0 || moisture > 100) {
        score = 0;
        anomaliesDetected = true;
        sensorStatus = 'ERROR';
        issues.push(`Leitura do sensor fora do limite físico possível (${moisture}%). Falha de hardware suspeita.`);
    }

    // 5. Verificação de Variações Abruptas Inexplicáveis (Pico ou Queda)
    if (historico.length >= 2 && score > 0) {
        const previous = historico[1];
        const diff = Math.abs(latest.umidade - previous.umidade);
        const timeDiffMins = Math.abs((new Date(latest.data).getTime() - new Date(previous.data).getTime()) / (1000 * 60));
        
        // Se a umidade saltou ou caiu mais de 25% em menos de 10 minutos (anormal, salvo se regou)
        if (diff > 25 && timeDiffMins > 0 && timeDiffMins <= 30) {
            score -= 15;
            anomaliesDetected = true;
            issues.push(`Variação abrupta de umidade detectada (${latest.umidade}% vs ${previous.umidade}% em curto período).`);
        }
    }

    // 6. Resolução do Level Baseado no Score Final
    let level = 'HIGH';
    if (score === 0) {
        level = 'INVALID';
    } else if (score < 50) {
        level = 'LOW';
    } else if (score < 85) {
        level = 'MEDIUM';
    }

    return {
        score: Math.max(0, score),
        level,
        sensorStatus,
        lastUpdate: latest.data,
        staleData,
        anomaliesDetected,
        missingData: false,
        issues
    };
};

module.exports = { evaluateDataQuality };
