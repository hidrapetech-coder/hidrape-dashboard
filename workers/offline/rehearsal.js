const { createWorker } = require('../../services/agro4/worker');
const { defaults } = require('../../config/agro4');
const { createMemoryRepository } = require('./memory');

const minute=60000,epoch=Date.parse('2026-11-08T12:00:00Z');
const check=condition=>{if(!condition)throw Error('SYNTHETIC_INVARIANT_FAILED');};
const harness = ({mode='shadow',count=1,poll,send,authorize}={}) => {
    let clock=epoch,sourceCalls=0,sendAttempts=0;
    const secret='synthetic-rehearsal-only-not-a-real-secret';
    const memory=createMemoryRepository({count,secret});
    const worker=createWorker({repository:memory.repository,config:{...defaults,mode,workerSecret:secret,cutoverAt:new Date(epoch-minute).toISOString()},now:()=>clock,
        source:{collect:async input=>{sourceCalls++;return poll ? poll(input,clock) : {status:'ONLINE',value:0,communicationConfirmed:true,measurementConfirmed:false,observedAt:null};}},
        resolveDevice:device=>authorize ? authorize(device,memory) : memory.authorize(device),
        sendAlert:async()=>{sendAttempts++;if(send)await send();}});
    return {...memory,worker,advance:minutes=>clock+=minutes*minute,sourceCalls:()=>sourceCalls,sendAttempts:()=>sendAttempts};
};
const cases=[
    ['consulta_sem_timestamp',async()=>{
        const h=harness();
        for(let i=0;i<4;i++){await h.worker.runOnce();h.advance(5);}
        const snapshots=h.data.evaluations.map(e=>e.snapshot);
        check(h.data.polls.length===4 && h.data.readings.length===2);
        check(h.data.readings.every(r=>r.value===0 && !r.independent && r.observedAt===null));
        check(snapshots.every(s=>!s.engineData.confidence.eligible && s.sensorState.lastMeasurementAt===null));
        check(h.data.decisions.map(d=>d.kind).join(',')==='TRANSITION,HEARTBEAT' && h.sendAttempts()===0);
        return {consultas:4,registros:2,amostrasIndependentes:0,enviosSimulados:0};
    }],
    ['replay_do_mesmo_ciclo',async()=>{
        const h=harness();await h.worker.runOnce();const repeated=await h.worker.runOnce();
        check(h.sourceCalls()===1 && h.data.polls.length===1 && repeated.skipped===1);
        return {consultas:1,repeticoesIgnoradas:1};
    }],
    ['tres_consultas_sem_comunicacao',async()=>{
        const h=harness({poll:async()=>({status:'API_ERROR',value:null,communicationConfirmed:false})});
        for(let i=0;i<3;i++){await h.worker.runOnce();h.advance(5);}
        const state=h.devices[0].state;
        check(state.communicationMisses===3 && state.investigationRequired && state.connectionStatus==='UNKNOWN');
        check(!h.data.evaluations.at(-1).snapshot.engineData.confidence.eligible && h.sendAttempts()===0);
        return {consultasSemConfirmacao:3,investigar:true,defeitoFisicoComprovado:false};
    }],
    ['executor_parado_nao_e_falha_fisica',async()=>{
        const h=harness();await h.worker.runOnce();h.advance(60);
        check(h.data.polls.length===1 && h.devices[0].state.communicationMisses===0);
        await h.worker.runOnce();
        check(h.data.polls.length===2 && h.devices[0].state.communicationMisses===0);
        return {minutosSemExecutar:60,consultasEfetuadas:2,falhasDeComunicacao:0};
    }],
    ['medicao_antiga_bloqueia_manejo',async()=>{
        const h=harness({mode:'agro-4',poll:async(_,at)=>({status:'ONLINE',value:30,communicationConfirmed:true,measurementConfirmed:true,observedAt:new Date(at-31*minute).toISOString()})});
        await h.worker.runOnce();
        check(h.data.polls[0].quality==='STALE' && !h.data.polls[0].independent);
        check(!h.data.evaluations[0].snapshot.engineData.confidence.eligible && h.sendAttempts()===0);
        return {qualidade:'STALE',manejoLiberado:false,enviosSimulados:0};
    }],
    ['falha_isolada_por_dispositivo',async()=>{
        const h=harness({count:2,poll:async({token})=>{
            if(token==='synthetic-token-0')throw Error('SYNTHETIC_SOURCE_UNAVAILABLE');
            return {status:'ONLINE',value:50,communicationConfirmed:true,measurementConfirmed:false};
        }});
        const counters=await h.worker.runOnce();
        check(counters.failed===1 && counters.collected===1 && h.data.polls.length===1);
        check(h.data.polls[0].userId==='synthetic-owner-1' && h.devices[0].state.collectedAt===undefined);
        check(await h.repository.ownedDevice('synthetic-owner-0','synthetic-device-1')===null);
        return {dispositivos:2,falhasIsoladas:1,coletasConcluidas:1};
    }],
    ['autorizacao_revogada',async()=>{
        const h=harness({authorize:async device=>({active:false,userId:device.userId,deviceId:device.id})});
        const counters=await h.worker.runOnce();
        check(counters.skipped===1 && h.sourceCalls()===0 && !h.devices[0].active && h.devices[0].credential==='');
        return {dispositivoDesativado:true,consultas:0,enviosSimulados:0};
    }],
    ['entrega_incerta_nao_e_reenviada',async()=>{
        let value=38;
        const h=harness({mode:'agro-4',poll:async(_,at)=>({status:'ONLINE',value:value--,communicationConfirmed:true,measurementConfirmed:true,observedAt:new Date(at).toISOString()}),
            send:async()=>{throw Error('SYNTHETIC_TRANSPORT_TIMEOUT');}});
        for(let i=0;i<9;i++){await h.worker.runOnce();h.advance(15);}
        check(h.data.readings.filter(r=>r.independent).length===9);
        check(h.data.evaluations.at(-1).snapshot.engineData.confidence.eligible);
        check(h.sendAttempts()===1 && h.data.deliveries.length===1 && h.data.deliveries[0].status==='UNKNOWN');
        return {amostrasSinteticasConfirmadas:9,tentativasSimuladas:1,estado:'UNKNOWN',reenvios:0};
    }]
];
const runRehearsal = async () => {
    const scenarios=[];
    for(const [name,execute] of cases) {
        try {scenarios.push({name,passed:true,evidence:await execute()});}
        catch {scenarios.push({name,passed:false,code:'SYNTHETIC_INVARIANT_FAILED'});}
    }
    return {kind:'ENSAIO_SINTETICO_OFFLINE',passed:scenarios.every(s=>s.passed),scenarios,
        limits:['Sem banco, rede ou mensagens reais.','Memória não valida SQL, transações ou locks entre processos.','Timestamp confirmado existe somente nas fixtures; não muda a limitação do Blynk.','Não comprova precisão agronômica nem autoriza promoção.']};
};
module.exports={runRehearsal};
