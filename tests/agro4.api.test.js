import { it,expect,vi } from 'vitest';
import { loader,now,response,history } from './helpers/offline.js';
const load=loader(),{createController,eventSchema}=load('controllers/agro4Controller.js');
const {createRuntime,userConfig,mergeRows}=load('services/agro4/runtime.js');
const {evaluatePhase1,compactSnapshot,hash}=load('services/agro4/domain.js');
const {defaults}=load('config/agro4.js');
const {authorizationRevision}=load('services/agro4/authorization.js');
const user={id:'owner',tipoPlantacao:'Milho',cidade:'Recife',lat:-8,lon:-35,timeZone:'America/Recife',blynkToken:'cipher'};
const deviceId='d8bc9b88-2a23-4ad5-a193-5036dc37cc56';
const event={deviceId,idempotencyKey:'c7d75ce6-c1aa-40ca-9912-f919a2e74f7a',type:'RAIN',value:0,unit:'mm',occurredAt:new Date(now).toISOString(),timeZone:'America/Recife'};
const state={value:30,quality:'VALID',connectionStatus:'ONLINE',lastMeasurementAt:new Date(now).toISOString(),lastSeenAt:new Date(now).toISOString(),collectedAt:new Date(now).toISOString()};
const snapshot=evaluatePhase1({user,history:history(30),deviceId,state,now});
const compact=compactSnapshot(snapshot,{history:history(30),deviceId,now});
compact.engineData.configurationHash=hash(userConfig(user));
compact.engineData.authorizationRevision=authorizationRevision(user);
const config={...defaults,mode:'agro-4',cutoverAt:new Date(now-60000).toISOString(),workerSecret:'s'.repeat(32)};

it('eventos preservam zero, exigem unidades compatíveis e não aceitam owner/origin forjados',()=>{
    expect(eventSchema.parse(event).value).toBe(0);
    expect(eventSchema.safeParse({...event,unit:'minutes'}).success).toBe(false);
    expect(eventSchema.safeParse({...event,userId:'victim'}).success).toBe(false);
    expect(eventSchema.safeParse({...event,origin:'SYSTEM'}).success).toBe(false);
    expect(eventSchema.safeParse({...event,type:'ACTION_TAKEN',unit:'none',value:null}).success).toBe(true);
});
it('evento de dispositivo alheio retorna 404 sem gravação',async()=>{
    const repository={ownedDevice:vi.fn(async()=>null),createEvent:vi.fn()};
    const controller=createController({runtime:()=>({repository}),now:()=>now}),res=response();
    await controller.createEvent({user:{id:'owner'},body:event},res);
    expect(res.statusCode).toBe(404);expect(repository.ownedDevice).toHaveBeenCalledWith('owner',deviceId);expect(repository.createEvent).not.toHaveBeenCalled();
});
it('evento futuro é recusado antes de tocar a persistência',async()=>{
    const runtime=vi.fn(),controller=createController({runtime,now:()=>now}),res=response();
    await controller.createEvent({user:{id:'owner'},body:{...event,occurredAt:new Date(now+1).toISOString()}},res);
    expect(res.statusCode).toBe(400);expect(runtime).not.toHaveBeenCalled();
});
it('registro de evento usa exclusivamente a identidade autenticada',async()=>{
    const repository={ownedDevice:async()=>({id:deviceId}),createEvent:vi.fn(async(id,body)=>({...body,id:'event-id',origin:'USER'}))};
    const controller=createController({runtime:()=>({repository}),now:()=>now}),res=response();
    await controller.createEvent({user:{id:'owner'},body:event},res);
    expect(res.statusCode).toBe(201);expect(repository.createEvent.mock.calls[0][0]).toBe('owner');expect(res.body).not.toHaveProperty('userId');
});
it('cadastro principal lê User e escreve apenas no repository agro, sem expor credenciais',async()=>{
    const enroll=vi.fn(async()=>({id:deviceId,talhaoId:'plot'})),legacy={user:{findUnique:vi.fn(async()=>user),update:vi.fn()}};
    const controller=createController({runtime:()=>({repository:{enroll},config}),legacy:()=>legacy,decrypt:()=> 'synthetic-blynk'}),res=response();
    await controller.enroll({user:{id:'owner'},body:{}},res);
    expect(res.statusCode).toBe(201);expect(legacy.user.update).not.toHaveBeenCalled();expect(enroll.mock.calls[0][0]).toBe('owner');
    expect(JSON.stringify(res.body)).not.toContain('synthetic-blynk');expect(JSON.stringify(enroll.mock.calls[0][1])).not.toContain('Token');
});
it('snapshot persistido é isolado por usuário e nenhuma avaliação ocorre na requisição',async()=>{
    const repository={primaryDevice:vi.fn(async()=>({id:deviceId,active:true,state,config:userConfig(user)})),latestEvaluation:vi.fn(async()=>compact)};
    const runtime=createRuntime({repository,config,now:()=>now});
    expect((await runtime.snapshot(user)).previsao.snapshotId).toBe(compact.snapshotId);
    expect(repository.latestEvaluation).toHaveBeenCalledWith('owner',deviceId,config.cutoverAt);
});
it('worker atrasado ou configuração alterada suspende as previsões persistidas',async()=>{
    const repository={primaryDevice:async()=>({id:deviceId,active:true,state,config:userConfig(user)}),latestEvaluation:async()=>compact};
    const late=await createRuntime({repository,config,now:()=>now+11*60000}).snapshot(user);
    expect(late.previsao.engineData.confidence.eligible).toBe(false);expect(late.previsao.tempoHoras).toBeNull();expect(late.previsao.engineData.risk.level).toBe('UNKNOWN');
    const changed=await createRuntime({repository,config,now:()=>now}).snapshot({...user,tipoPlantacao:'Feijão'});
    expect(changed.previsao.engineData.recommendation.action).toBe('VERIFICAR_SENSOR');
});
it('consulta persistida sem timestamp não inventa medição na resposta',async()=>{
    const unconfirmed={...state,quality:'UNCONFIRMED',lastMeasurementAt:null};
    const payload=evaluatePhase1({user,history:[],deviceId,state:unconfirmed,now});
    payload.engineData.configurationHash=hash(userConfig(user));
    payload.engineData.authorizationRevision=authorizationRevision(user);
    const repository={primaryDevice:async()=>({id:deviceId,active:true,state:unconfirmed,config:userConfig(user)}),latestEvaluation:async()=>payload};
    const live=await createRuntime({repository,config,now:()=>now}).live(user);
    expect(live.timestamp).toBeNull();expect(live.umidade).toBe(30);expect(live.status).toBe('INDEFINIDO');expect(live.measurementConfirmed).toBe(false);
});
it('consulta sem confirmação não associa o valor atual à data de uma medição anterior',async()=>{
    const unconfirmed={...state,value:55,measurementValue:30,quality:'UNCONFIRMED'};
    const payload=evaluatePhase1({user,history:history(30),deviceId,state:unconfirmed,now});payload.engineData.configurationHash=hash(userConfig(user));
    payload.engineData.authorizationRevision=authorizationRevision(user);
    const repository={primaryDevice:async()=>({id:deviceId,active:true,state:unconfirmed,config:userConfig(user)}),latestEvaluation:async()=>payload};
    const live=await createRuntime({repository,config,now:()=>now}).live(user);
    expect(live.timestamp).toBeNull();expect(live.lastMeasurementAt).toBe(state.lastMeasurementAt);expect(live.umidade).toBe(55);expect(live.measurementConfirmed).toBe(false);
});
it('desativação usa o proprietário autenticado, sem tocar o cadastro',async()=>{
    const deactivate=vi.fn(async()=>true),legacy=vi.fn(),controller=createController({runtime:()=>({repository:{deactivate}}),legacy});
    const res=response();await controller.deactivate({user:{id:'owner'}},res);
    expect(res.body.active).toBe(false);expect(deactivate).toHaveBeenCalledWith('owner');expect(legacy).not.toHaveBeenCalled();
});
it('remoção de credencial bloqueia snapshot imediatamente, antes da próxima coleta',async()=>{
    const repository={primaryDevice:async()=>({id:deviceId,active:true,state,config:userConfig(user)}),latestEvaluation:async()=>compact};
    const result=await createRuntime({repository,config,now:()=>now}).snapshot({...user,blynkToken:''});
    expect(result.previsao.engineData.confidence.eligible).toBe(false);expect(result.previsao.tempoHoras).toBeNull();
});
it('controle do worker lê credencial atual e devolve apenas envelope cifrado',async()=>{
    const repository={deviceForWorker:async()=>({id:deviceId,userId:'owner',active:true})};
    const legacy={user:{findUnique:vi.fn(async()=>user),update:vi.fn()}};
    const controller=createController({runtime:()=>({repository,config}),legacy:()=>legacy,decrypt:()=> 'synthetic-plain-token'}),res=response();
    await controller.workerAuthorization({body:{deviceId}},res);
    expect(res.statusCode).toBe(200);expect(res.body.active).toBe(true);expect(res.body.revision).toBe(authorizationRevision(user));
    expect(JSON.stringify(res.body)).not.toContain('synthetic-plain-token');expect(res.body).not.toHaveProperty('senha');expect(legacy.user.update).not.toHaveBeenCalled();
});
it('usuário removido ou token removido desautoriza o worker sem mudar User',async()=>{
    const controller=createController({runtime:()=>({repository:{deviceForWorker:async()=>({id:deviceId,userId:'owner',active:true})},config}),legacy:()=>({user:{findUnique:async()=>({...user,blynkToken:''})}})}),res=response();
    await controller.workerAuthorization({body:{deviceId}},res);expect(res.body).toEqual({active:false,deviceId,userId:'owner'});
});
it('paginação atravessa a data de corte sem duplicar registros legados',async()=>{
    const repository={readingCount:async()=>1,readingPage:async()=>[{umidade:0,data:new Date(now)}]};
    const legacy={sensor:{count:async()=>2,findMany:vi.fn(async()=>[{umidade:50,status:'IDEAL',data:new Date(now-86400000)}])}};
    const result=await createRuntime({repository,config,now:()=>now}).history(user,legacy,{limit:2,page:1,zone:'UTC'});
    expect(result.meta.total).toBe(3);expect(result.data.map(r=>r.umidade)).toEqual([50,0]);
    expect(legacy.sensor.findMany.mock.calls[0][0].where).toMatchObject({userId:'owner',data:{lt:new Date(config.cutoverAt)}});
});
it('média de um dia de transição é ponderada por amostras, sem média de médias',()=>{
    expect(mergeRows([{dia:'2026-10-10',total_dia:1,avg_umidade:0}],[{dia:'2026-10-10',total_dia:3,avg_umidade:100}])[0]).toMatchObject({total_dia:4,avg_umidade:75});
});
it('rota promovida do sensor não chama Blynk, grava Sensor ou envia WhatsApp',async()=>{
    const get=vi.fn(),create=vi.fn(),live=vi.fn(async()=>({umidade:0,timestamp:null,status:'INDEFINIDO'}));
    const controller=loader({axios:{get},'lib/prisma.js':{user:{findUnique:async()=>user},sensor:{create}},'services/agro4/runtime.js':{isPromoted:()=>true,getRuntime:()=>({live})}})('controllers/sensorController.js');
    const res=response();await controller.getLiveSystem({user:{id:'owner'}},res);
    expect(res.body.umidade).toBe(0);expect(get).not.toHaveBeenCalled();expect(create).not.toHaveBeenCalled();expect(live).toHaveBeenCalledWith(user);
});
it('snapshot promovido não cria AgroLog legado nem recalcula fontes',async()=>{
    const create=vi.fn(),fetchWeather=vi.fn();
    const controller=loader({'lib/prisma.js':{user:{findUnique:async()=>user},agroLog:{create}},'services/weatherService.js':{fetchWeather},'services/agro4/runtime.js':{isPromoted:()=>true,getRuntime:()=>({snapshot:async()=>({previsao:compact,snapshotId:compact.snapshotId,device:{credential:'NEVER_EXPOSE'}})})}})('controllers/agroController.js');
    const res=response();await controller.getClimaEDashboard({user:{id:'owner'}},res);
    expect(res.statusCode).toBe(200);expect(res.body).not.toHaveProperty('device');expect(create).not.toHaveBeenCalled();expect(fetchWeather).not.toHaveBeenCalled();
});
it('segredo de worker é dedicado e não aceita cookie ou cabeçalho arbitrário',()=>{
    const environment={AGRO4_MODE:'shadow',AGRO_DATABASE_URL:'postgresql://fixture:fixture@agro.invalid/agro',AGRO_DATABASE_ACK:'dedicated-agro',AGRO_WORKER_SECRET:config.workerSecret};
    const controller=loader({},environment)('controllers/agro4Controller.js'),next=vi.fn(),res=response();
    controller.workerAuth({headers:{authorization:'Bearer wrong'},cookies:{token:'session'}},res,next);
    expect(res.statusCode).toBe(401);expect(next).not.toHaveBeenCalled();
    controller.workerAuth({headers:{authorization:`Bearer ${config.workerSecret}`}},response(),next);expect(next).toHaveBeenCalledOnce();
});
it('configuração agro inválida não encerra o processo que atende ao login',()=>{
    const environment={NODE_ENV:'test',DATABASE_URL:'postgresql://fixture:fixture@auth.invalid/auth',DIRECT_URL:'postgresql://fixture:fixture@auth.invalid/auth',JWT_SECRET:'synthetic-jwt-secret-with-at-least-32-bytes',ENCRYPTION_KEY:'k'.repeat(32),AGRO4_MODE:'shadow',AGRO_DATABASE_URL:'INVALID'};
    const env=loader({dotenv:{config:()=>{}}},environment)('./lib/env.js');
    expect(env.AGRO4_CONFIG_VALID).toBe(false);expect(env.JWT_SECRET).toBe(environment.JWT_SECRET);
});
it('relatório separa decisões deduplicadas e registros históricos sem somar semânticas',async()=>{
    const query=vi.fn().mockResolvedValueOnce([{dia:'2026-10-10',total_dia:1,avg_umidade:0,qtd_seco:1,qtd_encharcado:0,qtd_ideal:0}]).mockResolvedValueOnce([{total:'12'}]);
    const aggregates=vi.fn(async()=>({rows:[{dia:'2026-10-10',total_dia:3,avg_umidade:100,qtd_seco:0,qtd_encharcado:3,qtd_ideal:0}],decisions:2}));
    const cutover='2026-10-10T12:00:00Z';
    const controller=loader({'lib/prisma.js':{user:{findUnique:async()=>({...user,cidade:''})},$queryRaw:query},'services/agro4/runtime.js':{isPromoted:()=>true,mergeRows,getRuntime:()=>({config:{cutoverAt:cutover},repository:{aggregates}})}})('controllers/reportController.js');
    const res=response();await controller.getMonthlyReport({user:{id:'owner'},query:{year:'2026',month:'10'}},res);
    expect(res.statusCode).toBe(200);expect(res.body.kpis.recomendacoesCount).toBe(2);
    expect(res.body.recommendationSemantics).toMatchObject({legacyRecordCount:12,deduplicatedCount:2,provesIrrigation:false});
    expect(res.body.graficos.solo[0].umidade).toBe(75);expect(query.mock.calls[0].slice(1)).toContainEqual(new Date(cutover));
});
