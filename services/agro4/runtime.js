const { readConfig } = require('../../config/agro4');
const { getCropConfig } = require('../../config/cultures');
const { isMoisture } = require('../agroEngine/dataQuality');
const { hash } = require('./domain');
const {userConfig,authorizationRevision}=require('./authorization');
const statusFor = (value,user) => {
    const crop=getCropConfig(user);
    return !crop.supported ? 'INDEFINIDO' : value<=crop.minIdeal ? 'SECO' : value>crop.maxIdeal ? 'ENCHARCADO' : 'IDEAL';
};
const blockSnapshot = (snapshot,reason) => {
    const predictions=Object.fromEntries(Object.keys(snapshot.engineData.predictions).map(key=>[key,null]));
    const sensorState={...snapshot.sensorState,hasValidData:false,status:'stale',reason};
    const engineData={...snapshot.engineData,predictions,
        predictor:{...snapshot.engineData.predictor,predictions,dynamicDropRate:null,hoursUntilStress:null},
        dataQuality:{...snapshot.engineData.dataQuality,eligible:false,staleData:true},
        confidence:{...snapshot.engineData.confidence,eligible:false,score:0,level:'LOW',factors:[reason]},
        risk:{score:null,level:'UNKNOWN',factors:[reason]},recommendation:{action:'VERIFICAR_SENSOR',explanation:[reason]}};
    return {...snapshot,snapshotId:hash({original:snapshot.snapshotId,reason}),sensorState,status:'indisponivel',tempoHoras:null,recomendacao:reason,
        _meta:{...snapshot._meta,dropRealTime:null,sensorState},engineData};
};
const mergeRows = (...groups) => {
    const values=new Map();
    for (const row of groups.flat()) {
        const prior=values.get(row.dia) || {dia:row.dia,total_dia:0,weighted:0,qtd_seco:0,qtd_encharcado:0,qtd_ideal:0};
        const count=Number(row.total_dia);
        prior.total_dia+=count;prior.weighted+=Number(row.avg_umidade)*count;
        for(const key of ['qtd_seco','qtd_encharcado','qtd_ideal']) prior[key]+=Number(row[key] || 0);
        values.set(row.dia,prior);
    }
    return [...values.values()].sort((a,b)=>a.dia.localeCompare(b.dia)).map(({weighted,...row})=>({...row,avg_umidade:weighted/row.total_dia}));
};
const createRuntime = ({repository,config,now=Date.now}) => ({
    repository,config,
    async snapshot(user) {
        const device=await repository.primaryDevice(user.id);
        if (!device?.active) throw new Error('AGRO_DEVICE_NOT_READY');
        let snapshot=await repository.latestEvaluation(user.id,device.id,config.cutoverAt);
        if (!snapshot) throw new Error('AGRO_SNAPSHOT_NOT_READY');
        const age=now()-Date.parse(snapshot.engineData.evaluatedAt);
        if (!Number.isFinite(age) || age<0 || age>config.pollMinutes*2*60000 || device.state.needsEvaluation || hash(userConfig(user))!==hash(device.config) || snapshot.engineData.configurationHash!==hash(device.config) || snapshot.engineData.authorizationRevision!==authorizationRevision(user)) {
            snapshot=blockSnapshot(snapshot,'Análise não atualizada ou configuração alterada; recomendações suspensas até a próxima avaliação confirmada do worker.');
        }
        if (snapshot.sensorState.lastMeasurementAt && now()-Date.parse(snapshot.sensorState.lastMeasurementAt)>config.freshnessMinutes*60000) snapshot=blockSnapshot(snapshot,'Medição com mais de 30 minutos; recomendações suspensas.');
        return {clima:snapshot.engineData.inputs.weather,cidade:user.cidade,satelite:snapshot.engineData.inputs.satellite,previsao:snapshot,snapshotId:snapshot.snapshotId,sensorState:snapshot.sensorState,device};
    },
    async live(user) {
        const result=await this.snapshot(user),{device,previsao}=result;
        if (!isMoisture(device.state.value) || device.state.connectionStatus==='OFFLINE') {const error=new Error('AGRO_READING_UNAVAILABLE');error.sensorState=previsao.sensorState;throw error;}
        const confirmed=['VALID','STALE'].includes(device.state.quality) && device.state.value===device.state.measurementValue && !!device.state.lastMeasurementAt;
        return {umidade:device.state.value,status:previsao.engineData.confidence.eligible?statusFor(device.state.value,user):'INDEFINIDO',diagnostico:previsao.recomendacao,previsao,
            timestamp:confirmed?device.state.lastMeasurementAt:null,lastMeasurementAt:device.state.lastMeasurementAt || null,storedAt:device.state.lastPersistedAt || null,lastSeenAt:device.state.lastSeenAt || null,collectedAt:device.state.collectedAt || null,
            measurementConfirmed:confirmed,source:'BLYNK',unit:'sensor_percent'};
    },
    async history(user,legacy,{limit,page,zone}) {
        const cutover=new Date(config.cutoverAt),offset=(page-1)*limit;
        const freshCount=await repository.readingCount(user.id,cutover);
        const legacyWhere={userId:user.id,data:{lt:cutover}};
        const oldCount=await legacy.sensor.count({where:legacyWhere});
        const fresh=offset<freshCount ? await repository.readingPage(user.id,cutover,offset,limit) : [];
        const old=fresh.length<limit ? await legacy.sensor.findMany({where:legacyWhere,orderBy:{data:'desc'},skip:Math.max(0,offset-freshCount),take:limit-fresh.length}) : [];
        const data=fresh.map(row=>({...row,status:statusFor(row.umidade,user)})).concat(old).map(row=>({umidade:row.umidade,status:row.status,timeLabel:new Date(row.data).toLocaleTimeString('pt-BR',{hour12:false,timeZone:zone}),dataFull:row.data})).reverse();
        return {data,meta:{total:freshCount+oldCount,limit,page,pages:Math.ceil((freshCount+oldCount)/limit),source:'AGRO_DEDICATED_WITH_LEGACY_BEFORE_CUTOVER'}};
    }
});
const isPromoted = () => process.env.AGRO4_MODE==='agro-4' && Date.now()>=Date.parse(process.env.AGRO4_CUTOVER_AT);
let singleton;
const getRuntime = () => {
    const config=readConfig();
    if (config.mode==='agro-3') throw new Error('AGRO4_DISABLED');
    singleton ||= createRuntime({config,repository:new (require('./repository').AgroRepository)(require('../../lib/agroDb').getAgroPool())});
    return singleton;
};
module.exports={getRuntime,isPromoted,createRuntime,userConfig,mergeRows,blockSnapshot};
