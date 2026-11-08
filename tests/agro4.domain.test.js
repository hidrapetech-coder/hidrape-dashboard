import { it,expect } from 'vitest';
import { loader,history,now,weather } from './helpers/offline.js';
const load=loader(),domain=load('services/agro4/domain.js'),{defaults,readConfig}=load('config/agro4.js');
const user={id:'owner',tipoPlantacao:'Milho'};
const confirmed={value:50,status:'ONLINE',communicationConfirmed:true,measurementConfirmed:true,observedAt:new Date(now).toISOString()};
const state={quality:'VALID',connectionStatus:'ONLINE',lastMeasurementAt:new Date(now).toISOString(),collectedAt:new Date(now).toISOString()};

it('sem flag, não exige URL ou segredo e mantém agro-3',()=>{
    expect(readConfig({AGRO_DATABASE_URL:'inválida',AGRO_WORKER_SECRET:''})).toEqual(defaults);
});
const active={AGRO4_MODE:'shadow',AGRO_DATABASE_URL:'postgresql://agro:fixture@agro.invalid/agro',AGRO_DATABASE_ACK:'dedicated-agro',AGRO_WORKER_SECRET:'s'.repeat(32)};
it('valida opt-in sem imprimir credenciais e exige corte para promover',()=>{
    expect(readConfig(active).pollMinutes).toBe(5);
    expect(()=>readConfig({...active,AGRO_WORKER_SECRET:'PRIVATE'})).toThrow('AGRO_CONFIG_INVALID: AGRO_WORKER_SECRET');
    expect(()=>readConfig({...active,AGRO4_MODE:'agro-4'})).toThrow('AGRO4_CUTOVER_AT_REQUIRED');
});
it.each([
    ['postgresql://auth:secret@host.invalid:5432/main','postgresql://agro:other@host.invalid:6543/main?schema=agro'],
    ['postgresql://postgres:secret@db.project.supabase.co/postgres','postgresql://postgres.project:other@region.pooler.supabase.com/postgres']
])('recusa o mesmo banco apesar de porta/schema/pooler: %s',(original,target)=>{
    expect(()=>readConfig({...active,DATABASE_URL:original,AGRO_DATABASE_URL:target})).toThrow('AGRO_DATABASE_MUST_BE_SEPARATE');
});
it('zero é leitura válida e não vira ausência',()=>{
    const plan=domain.planCollection(null,{...confirmed,value:0},now);
    expect(plan.value).toBe(0);expect(plan.independent).toBe(true);expect(plan.state.measurementValue).toBe(0);
});
it('consultar o mesmo valor não confirma medição nem inventa observedAt',()=>{
    const poll={...confirmed,measurementConfirmed:false,observedAt:null};
    const first=domain.planCollection(null,poll,now);
    const next=domain.planCollection(first.state,poll,now+5*60000);
    const heartbeat=domain.planCollection(next.state,poll,now+15*60000);
    expect(first.quality).toBe('UNCONFIRMED');expect(next.persistReading).toBe(false);
    expect(heartbeat.persistReading).toBe(true);expect(heartbeat.reason).toBe('HEARTBEAT');
    expect(heartbeat.independent).toBe(false);expect(heartbeat.observedAt).toBeNull();expect(heartbeat.state.lastMeasurementAt).toBeNull();
    expect(heartbeat.state.lastSeenAt).toBe(new Date(now+15*60000).toISOString());
});
it('mudança de 2 pontos persiste, sem inventar amostra independente',()=>{
    const first=domain.planCollection(null,{...confirmed,measurementConfirmed:false,observedAt:null},now);
    const next=domain.planCollection(first.state,{...confirmed,value:52,measurementConfirmed:false,observedAt:null},now+5*60000);
    expect(next.reason).toBe('CHANGE');expect(next.persistReading).toBe(true);expect(next.independent).toBe(false);
});
it('timestamp repetido não renova medição; valor conflitante é suspeito',()=>{
    const first=domain.planCollection(null,confirmed,now);
    const repeated=domain.planCollection(first.state,confirmed,now+15*60000);
    expect(repeated.independent).toBe(false);expect(repeated.state.lastMeasurementAt).toBe(confirmed.observedAt);
    expect(domain.planCollection(first.state,{...confirmed,value:60},now+5*60000).quality).toBe('CONFLICT');
});
it.each([null,NaN,Infinity,-1,101,'50'])('dado inválido fica ausente: %s',value=>{
    const plan=domain.planCollection(null,{...confirmed,value},now);
    expect(plan.value).toBeNull();expect(plan.quality).toBe('INVALID');expect(plan.independent).toBe(false);
});
it('diferencia medição antiga, data futura e desordem',()=>{
    expect(domain.planCollection(null,{...confirmed,observedAt:new Date(now-31*60000)},now).quality).toBe('STALE');
    expect(domain.planCollection(null,{...confirmed,observedAt:new Date(now+1)},now).quality).toBe('INVALID');
    const previous=domain.planCollection(null,confirmed,now).state;
    expect(domain.planCollection(previous,{...confirmed,observedAt:new Date(now-1000)},now).quality).toBe('OUT_OF_ORDER');
});
it('três consultas sem comunicação pedem investigação sem afirmar defeito físico',()=>{
    let previous=null;
    for(let i=0;i<3;i++)previous=domain.planCollection(previous,{status:'API_ERROR',value:null},now+i*5*60000).state;
    expect(previous.investigationRequired).toBe(true);expect(previous.connectionStatus).toBe('UNKNOWN');expect(previous.lastSeenAt).toBeNull();
    expect(domain.planCollection(previous,confirmed,now+20*60000).state.communicationMisses).toBe(0);
});
it('cadência do worker não transforma heartbeat em histórico elegível',()=>{
    const snapshot=domain.evaluatePhase1({user,history:[],deviceId:'device',state:{...state,quality:'UNCONFIRMED',lastMeasurementAt:null},now});
    expect(snapshot.engineData.confidence.eligible).toBe(false);expect(snapshot.tempoHoras).toBeNull();
    expect(snapshot.recomendacao).toContain('heartbeat não são amostras independentes');
});
it('evento explica salto, sem remover o bloqueio conservador',()=>{
    const rows=history(80);rows[1].umidade=30;
    const events=[{id:'rain',userId:user.id,deviceId:'device',type:'RAIN',value:10,occurredAt:new Date(now-60000),receivedAt:new Date(now)}];
    const snapshot=domain.evaluatePhase1({user,history:rows,weather:weather(),events,deviceId:'device',state,now});
    expect(snapshot.engineData.eventContext[0].classification).toBe('RAIN');
    expect(snapshot.engineData.recommendation.action).toBe('VERIFICAR_SENSOR');expect(snapshot.tempoHoras).toBeNull();
});
it('não associa evento de outro usuário, futuro ou causalidade ambígua',()=>{
    const event={id:'x',userId:user.id,deviceId:'device',type:'RAIN',value:10,occurredAt:new Date(now-60000),receivedAt:new Date(now)};
    const window={userId:user.id,deviceId:'device',start:now-5*60000,end:now,now};
    expect(domain.classifyJump([{...event,userId:'other'}],window).classification).toBe('UNEXPLAINED');
    expect(domain.classifyJump([{...event,value:0}],window).classification).toBe('UNEXPLAINED');
    expect(domain.classifyJump([{...event,receivedAt:new Date(now+1)}],window).classification).toBe('UNEXPLAINED');
    expect(domain.classifyJump([event,{...event,id:'y',type:'IRRIGATION'}],window).classification).toBe('UNEXPLAINED');
});
it('compactação mantém snapshotId, hash/referência do histórico e não duplica valores',()=>{
    const snapshot=domain.evaluatePhase1({user,history:history(),deviceId:'device',state,now});
    const compact=domain.compactSnapshot(snapshot,{history:history(),deviceId:'device',now});
    expect(compact.snapshotId).toBe(snapshot.snapshotId);expect(compact.engineData.inputs.history).toBeUndefined();
    expect(compact.engineData.inputs.readings).toBeUndefined();expect(compact.engineData.inputs.historyRef.count).toBe(9);
    expect(compact.engineData.inputs.historyRef.hash).toHaveLength(64);expect(snapshot.engineData.inputs.history).toHaveLength(9);
});
it('deduplica por ação/risco e permite heartbeat de 15 minutos',()=>{
    const snapshot=domain.evaluatePhase1({user,history:history(),deviceId:'device',state,now});
    const previous={action:snapshot.engineData.recommendation.action,riskLevel:snapshot.engineData.risk.level,createdAt:new Date(now-5*60000)};
    expect(domain.decisionKind(null,snapshot,now)).toBe('TRANSITION');
    expect(domain.decisionKind(previous,snapshot,now)).toBeNull();
    expect(domain.decisionKind({...previous,riskLevel:'OTHER'},snapshot,now)).toBe('TRANSITION');
    expect(domain.decisionKind({...previous,createdAt:new Date(now-15*60000)},snapshot,now)).toBe('HEARTBEAT');
});
