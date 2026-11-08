const crypto = require('node:crypto');
const { evaluate } = require('../agroEngine');
const { normalizeHistory, isMoisture } = require('../agroEngine/dataQuality');
const rules = require('../../config/agro');
const { defaults } = require('../../config/agro4');
// JSONB não preserva a ordem das chaves; identidade e configuração precisam ser canônicas.
const canonical = value => {
    if (value instanceof Date) return value.toJSON();
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
    return value;
};
const hash = value => crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const ms = value => value == null ? NaN : new Date(value).getTime();

const planCollection = (previous, poll, now, config = defaults) => {
    if (!Number.isFinite(now)) throw new Error('INVALID_CLOCK');
    const collectedAt = new Date(now).toISOString();
    const timestamp = ms(poll.observedAt);
    const measurementConfirmed = poll.measurementConfirmed === true && Number.isFinite(timestamp) && timestamp <= now;
    const communicationConfirmed = poll.communicationConfirmed === true;
    const validValue = isMoisture(poll.value);
    let quality = poll.status === 'OFFLINE' ? 'OFFLINE' : poll.status === 'API_ERROR' ? 'API_ERROR' : !validValue ? 'INVALID' :
        !measurementConfirmed ? 'UNCONFIRMED' : now-timestamp > config.freshnessMinutes*60000 ? 'STALE' : 'VALID';
    if (poll.observedAt != null && (!Number.isFinite(timestamp) || timestamp > now)) quality='INVALID';
    if (measurementConfirmed && previous?.lastMeasurementAt && timestamp < ms(previous.lastMeasurementAt)) quality='OUT_OF_ORDER';
    if (measurementConfirmed && timestamp === ms(previous?.lastMeasurementAt) && validValue && poll.value !== previous?.measurementValue) quality='CONFLICT';
    const latestMeasurement = measurementConfirmed && validValue && !['OUT_OF_ORDER','CONFLICT','INVALID'].includes(quality);
    const newMeasurement = latestMeasurement && timestamp !== ms(previous?.lastMeasurementAt);
    const significant = validValue && (!isMoisture(previous?.persistedValue) || Math.abs(poll.value-previous.persistedValue) >= config.changePoints);
    const heartbeat = !previous?.lastPersistedAt || now-ms(previous.lastPersistedAt) >= config.readingHeartbeatMinutes*60000;
    const persistReading = newMeasurement || significant || heartbeat;
    const misses = communicationConfirmed ? 0 : (previous?.communicationMisses || 0)+1;
    return {
        collectedAt, observedAt:measurementConfirmed ? new Date(timestamp).toISOString() : null,
        value:validValue ? poll.value : null, unit:'sensor_percent', source:'BLYNK', quality,
        communicationConfirmed, measurementConfirmed, independent:newMeasurement && quality==='VALID', persistReading,
        reason:newMeasurement ? 'MEASUREMENT' : significant ? 'CHANGE' : heartbeat ? 'HEARTBEAT' : 'POLL',
        state:{
            ...previous, value:validValue ? poll.value : null, quality,
            collectedAt, lastSeenAt:communicationConfirmed ? collectedAt : previous?.lastSeenAt || null,
            lastMeasurementAt:latestMeasurement ? new Date(timestamp).toISOString() : previous?.lastMeasurementAt || null,
            measurementValue:latestMeasurement ? poll.value : previous?.measurementValue ?? null,
            connectionStatus:poll.status === 'OFFLINE' ? 'OFFLINE' : communicationConfirmed ? 'ONLINE' : 'UNKNOWN',
            communicationMisses:misses, investigationRequired:misses >= config.missingCommunicationLimit,
            lastPersistedAt:persistReading ? collectedAt : previous?.lastPersistedAt || null,
            persistedValue:persistReading && validValue ? poll.value : previous?.persistedValue ?? null
        }
    };
};

const classifyJump = (events, {userId,deviceId,start,end,now}) => {
    const matches = events.filter(e=>e.userId===userId && e.deviceId===deviceId &&
        ms(e.occurredAt)>=start && ms(e.occurredAt)<=end && ms(e.receivedAt)<=now &&
        ['RAIN','IRRIGATION'].includes(e.type) && typeof e.value==='number' && Number.isFinite(e.value) && e.value>0);
    const types = [...new Set(matches.map(e=>e.type))];
    return {classification:types.length===1 ? types[0] : 'UNEXPLAINED',eventIds:matches.map(e=>e.id)};
};
const evaluatePhase1 = ({user,history,weather=null,satellite=null,events=[],deviceId,state,now,config=defaults}) => {
    const healthy = state?.quality==='VALID' && state?.connectionStatus==='ONLINE' &&
        Number.isFinite(ms(state.lastMeasurementAt)) && now-ms(state.lastMeasurementAt)<=rules.freshnessMinutes*60000 &&
        now-ms(state.collectedAt)<=config.pollMinutes*2*60000;
    const snapshot = evaluate({...user,sensorOnline:!!healthy},history,weather,satellite,now);
    const { readings } = normalizeHistory(history,now);
    const jumps = [];
    for (let i=1;i<readings.length;i++) {
        const start=ms(readings[i].data),end=ms(readings[i-1].data);
        if ((end-start)/60000<=rules.jumpMinutes && readings[i-1].umidade-readings[i].umidade>rules.jumpPoints) {
            jumps.push({...classifyJump(events,{userId:user.id,deviceId,start,end,now}),start:new Date(start).toISOString(),end:new Date(end).toISOString()});
        }
    }
    snapshot.engineData.version='agro-4-phase-1';
    snapshot.engineData.eventContext=jumps;
    // Evidência de evento explica o salto; não remove os gates de qualidade do agro-3.
    const reasons = jumps.map(j=>j.classification==='RAIN' ? 'Salto associado a registro de chuva medida; a qualidade do sensor continua sendo verificada.' :
        j.classification==='IRRIGATION' ? 'Salto associado a registro de irrigação realizada; a qualidade do sensor continua sendo verificada.' : 'Salto sem causa observada inequívoca; conferir no campo.');
    if (!healthy) reasons.unshift(state?.quality==='UNCONFIRMED' ? 'A fonte não confirma o horário de uma nova medição. Consulta e heartbeat não são amostras independentes.' : 'Qualidade, comunicação ou atualidade da medição insuficientes.');
    snapshot.engineData.recommendation.explanation.push(...reasons);
    snapshot.recomendacao=snapshot.engineData.recommendation.explanation.join(' ');
    snapshot.sensorState={...snapshot.sensorState,quality:state?.quality || 'MISSING',lastSeenAt:state?.lastSeenAt || null,lastMeasurementAt:state?.lastMeasurementAt || null,collectedAt:state?.collectedAt || null,reason:reasons.concat(snapshot.sensorState.reason || []).join(' ')};
    snapshot._meta.sensorState=snapshot.sensorState;
    snapshot.snapshotId=hash({userId:user.id,deviceId,engineData:snapshot.engineData,sensorState:snapshot.sensorState});
    return snapshot;
};
const compactSnapshot = (snapshot, {history,deviceId,now}) => {
    const {history:ignored,readings:ignoredReadings,...inputs}=snapshot.engineData.inputs;
    const rows=normalizeHistory(history,now).readings;
    return {...snapshot,engineData:{...snapshot.engineData,inputs:{...inputs,historyRef:{deviceId,count:rows.length,from:rows.at(-1)?.data || null,to:rows[0]?.data || null,asOf:new Date(now).toISOString(),hash:hash(rows),limit:rules.historyLimit}},rulesHash:hash(rules)}};
};
const decisionKind = (previous,snapshot,now,config=defaults) => !previous || previous.action!==snapshot.engineData.recommendation.action || previous.riskLevel!==snapshot.engineData.risk.level ? 'TRANSITION' :
    now-ms(previous.createdAt)>=config.decisionHeartbeatMinutes*60000 ? 'HEARTBEAT' : null;
module.exports={hash,planCollection,classifyJump,evaluatePhase1,compactSnapshot,decisionKind};
