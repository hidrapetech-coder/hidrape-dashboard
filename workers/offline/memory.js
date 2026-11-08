// Adaptador descartável para ensaio: não simula SQL, durabilidade ou locks entre processos.
const { seal } = require('../../services/agro4/credentials');
const createMemoryRepository = ({count=1,secret}) => {
    const data={polls:[],readings:[],evaluations:[],decisions:[],deliveries:[],runs:[]};
    const devices=Array.from({length:count},(_,i)=>({id:`synthetic-device-${i}`,userId:`synthetic-owner-${i}`,pin:'V0',active:true,state:{},config:{tipoPlantacao:'Milho'},
        credential:seal({blynkToken:`synthetic-token-${i}`,whatsappPhone:'synthetic-contact',callmebotApiKey:'synthetic-key'},secret)}));
    const locks=new Set();
    const repository={
        listDevices:async()=>devices.filter(d=>d.active),
        ownedDevice:async(userId,id)=>devices.find(d=>d.active && d.userId===userId && d.id===id) || null,
        withDeviceLock:async(id,work)=>{
            if(locks.has(id))return {skipped:true};
            locks.add(id);try{return await work(repository);}finally{locks.delete(id);}
        },
        transaction:async work=>work(repository), // Não representa isolamento/rollback SQL.
        syncAuthorization:async(device,authorization)=>{
            const current=devices.find(d=>d.id===device.id && d.userId===device.userId);
            if(!authorization.active){current.active=false;current.credential='';return null;}
            current.state={...current.state,authorizationRevision:authorization.revision,sensorRevision:authorization.sensorRevision};
            current.config=authorization.config;current.credential=authorization.credential;
            return structuredClone(current);
        },
        hasPoll:async(deviceId,scheduledAt)=>data.polls.some(p=>p.deviceId===deviceId && p.scheduledAt===scheduledAt.toISOString()),
        saveCollection:async(device,plan,scheduledAt)=>{
            if(await repository.hasPoll(device.id,scheduledAt))return null;
            const id=`synthetic-poll-${data.polls.length}`;
            data.polls.push({id,userId:device.userId,deviceId:device.id,scheduledAt:scheduledAt.toISOString(),...structuredClone(plan)});
            const current=devices.find(d=>d.id===device.id && d.userId===device.userId);
            current.state={...plan.state,needsEvaluation:false};
            if(plan.persistReading)data.readings.push({userId:device.userId,deviceId:device.id,...structuredClone(plan)});
            return id;
        },
        history:async(userId,deviceId,at)=>data.readings.filter(r=>r.userId===userId && r.deviceId===deviceId && r.independent && Date.parse(r.observedAt)<=at && Date.parse(r.observedAt)>=at-86400000)
            .map(r=>({umidade:r.value,data:r.observedAt})).reverse().slice(0,200),
        events:async()=>[],
        previousDecision:async(userId,deviceId,mode)=>data.decisions.filter(d=>d.userId===userId && d.deviceId===deviceId && d.mode===mode).at(-1) || null,
        saveEvaluation:async(device,pollId,snapshot,comparison,mode,kind,at)=>{
            data.evaluations.push({userId:device.userId,deviceId:device.id,pollId,snapshot,comparison,mode});
            if(kind)data.decisions.push({userId:device.userId,deviceId:device.id,mode,kind,action:snapshot.engineData.recommendation.action,riskLevel:snapshot.engineData.risk.level,createdAt:new Date(at)});
            if(mode==='agro-4' && kind==='TRANSITION' && snapshot.engineData.confidence.eligible && ['IRRIGAR','EXCESSO_UMIDADE'].includes(snapshot.engineData.recommendation.action))
                data.deliveries.push({id:`synthetic-delivery-${data.deliveries.length}`,userId:device.userId,deviceId:device.id,status:'PENDING',payload:snapshot});
        },
        latestEvaluation:async(userId,deviceId)=>data.evaluations.filter(e=>e.userId===userId && e.deviceId===deviceId && e.mode==='agro-4').at(-1)?.snapshot || null,
        pendingDeliveries:async(userId,deviceId)=>data.deliveries.filter(d=>d.userId===userId && d.deviceId===deviceId && ['PENDING','FAILED'].includes(d.status)),
        deliveryStatus:async(userId,id,status)=>{const delivery=data.deliveries.find(d=>d.userId===userId && d.id===id);if(!delivery)throw Error('SYNTHETIC_DELIVERY_NOT_FOUND');delivery.status=status;},
        recordRun:async(start,end,counters)=>data.runs.push({start,end,counters})
    };
    const authorize=async device=>({active:true,deviceId:device.id,userId:device.userId,config:device.config,credential:device.credential,revision:'synthetic-revision',sensorRevision:'synthetic-sensor'});
    return {repository,data,devices,authorize};
};
module.exports={createMemoryRepository};
