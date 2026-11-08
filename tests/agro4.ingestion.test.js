import { it,expect,vi } from 'vitest';
import { loader,now,history } from './helpers/offline.js';
const load=loader(),{createBlynkSource}=load('services/iot/blynk.js');
const {defaults}=load('config/agro4.js'),{seal,open}=load('services/agro4/credentials.js');
const {createWorker}=load('services/agro4/worker.js');
const secret='s'.repeat(32),config={...defaults,mode:'shadow',workerSecret:secret,cutoverAt:new Date(now-60000).toISOString()};

it('Blynk online com zero continua sem timestamp de medição',async()=>{
    const http={get:vi.fn().mockResolvedValueOnce({data:true}).mockResolvedValueOnce({data:'0'})};
    const result=await createBlynkSource({http}).collect({token:'synthetic-token'});
    expect(result).toMatchObject({value:0,status:'ONLINE',communicationConfirmed:true,measurementConfirmed:false,observedAt:null});
    expect(http.get.mock.calls[0][1]).toMatchObject({timeout:4000,maxRedirects:0,maxContentLength:65536});
});
it('hardware offline não consulta valor nem cria timestamp',async()=>{
    const http={get:vi.fn(async()=>({data:false}))};
    expect((await createBlynkSource({http}).collect({token:'synthetic'})).status).toBe('OFFLINE');expect(http.get).toHaveBeenCalledTimes(1);
});
it('erro de API usa retry limitado com backoff e nunca propaga URL com token',async()=>{
    const sleep=vi.fn(async()=>{}),http={get:vi.fn(async()=>{throw {message:'secret-token-in-url',response:{status:503}};})};
    const result=await createBlynkSource({http,sleep,retries:2}).collect({token:'synthetic'});
    expect(http.get).toHaveBeenCalledTimes(3);expect(sleep.mock.calls.map(c=>c[0])).toEqual([250,500]);
    expect(JSON.stringify(result)).not.toContain('secret-token');expect(result.status).toBe('API_ERROR');
});
it('429 com Retry-After maior que orçamento não causa tempestade de retries',async()=>{
    const sleep=vi.fn(),http={get:vi.fn(async()=>{throw {response:{status:429,headers:{'retry-after':'60'}}};})};
    await createBlynkSource({http,sleep}).collect({token:'synthetic'});expect(http.get).toHaveBeenCalledOnce();expect(sleep).not.toHaveBeenCalled();
});
it('valor bruto é inválido, não offline, quando a comunicação foi confirmada',async()=>{
    const http={get:vi.fn().mockResolvedValueOnce({data:true}).mockResolvedValueOnce({data:'1023raw'})};
    expect(await createBlynkSource({http}).collect({token:'synthetic'})).toMatchObject({status:'INVALID',value:null,communicationConfirmed:true});
});
it('credenciais possuem autenticação criptográfica e segredo separado',()=>{
    const cipher=seal({blynkToken:'synthetic-token'},secret);
    expect(cipher).not.toContain('synthetic-token');expect(open(cipher,secret)).toEqual({blynkToken:'synthetic-token'});
    expect(()=>open(cipher,'other'.repeat(10))).toThrow('AGRO_CREDENTIAL_UNAVAILABLE');
});

// Store em memória: exercita o worker completo sem SQL, rede ou lib/prisma.
const harness=({mode='shadow',devices=1,poll,cutoverAt=config.cutoverAt}={})=>{
    const data={polls:new Set(),readings:[],decisions:[],evaluations:[],runs:[],deliveries:[]};
    const registry=Array.from({length:devices},(_,i)=>({id:'device-'+i,userId:'owner-'+i,pin:'V0',active:true,state:{},credential:seal({blynkToken:'token-'+i,whatsappPhone:'synthetic-phone',callmebotApiKey:'synthetic-key'},secret),config:{tipoPlantacao:'Milho'}}));
    const locks=new Set();let clock=now;
    const repository={
        listDevices:async()=>registry.filter(d=>d.active),
        withDeviceLock:async(id,work)=>{if(locks.has(id))return {skipped:true};locks.add(id);try{return await work(repository);}finally{locks.delete(id);}},
        ownedDevice:async(userId,id)=>registry.find(d=>d.id===id && d.userId===userId && d.active),
        syncAuthorization:async(device,authorization,at)=>{
            if(!authorization.active){device.active=false;device.credential='';return null;}
            const changed=device.state.authorizationRevision!==authorization.revision;
            device.config=authorization.config;device.credential=authorization.credential;
            device.state={...device.state,authorizationRevision:authorization.revision,sensorRevision:authorization.sensorRevision,needsEvaluation:changed || device.state.needsEvaluation};
            return device;
        },
        hasPoll:async(id,scheduled)=>data.polls.has(id+scheduled.toISOString()),
        transaction:async work=>work(repository),
        saveCollection:async(device,plan,scheduled)=>{const key=device.id+scheduled.toISOString();if(data.polls.has(key))return null;data.polls.add(key);device.state={...plan.state,needsEvaluation:false};if(plan.persistReading)data.readings.push({userId:device.userId,deviceId:device.id,...plan});return key;},
        history:async(userId,deviceId)=>data.readings.filter(r=>r.userId===userId && r.deviceId===deviceId && r.independent).map(r=>({umidade:r.value,data:r.observedAt})).reverse(),
        events:async()=>[],
        previousDecision:async(userId,deviceId)=>data.decisions.filter(d=>d.userId===userId && d.deviceId===deviceId).at(-1),
        saveEvaluation:async(device,pollId,snapshot,comparison,mode,kind,at)=>{
            data.evaluations.push({deviceId:device.id,snapshot,comparison,mode});
            if(kind)data.decisions.push({userId:device.userId,deviceId:device.id,kind,action:snapshot.engineData.recommendation.action,riskLevel:snapshot.engineData.risk.level,createdAt:new Date(at)});
            if(mode==='agro-4' && kind==='TRANSITION' && snapshot.engineData.confidence.eligible && snapshot.engineData.recommendation.action==='IRRIGAR')data.deliveries.push({id:'delivery-'+data.deliveries.length,status:'PENDING',payload:snapshot});
        },
        latestEvaluation:async(userId,deviceId)=>data.evaluations.filter(e=>e.deviceId===deviceId && e.mode==='agro-4').at(-1)?.snapshot || null,
        pendingDeliveries:async()=>data.deliveries.filter(d=>['PENDING','FAILED'].includes(d.status)),
        deliveryStatus:vi.fn(async(userId,id,status)=>{data.deliveries.find(d=>d.id===id).status=status;}),
        recordRun:async(start,end,counters)=>data.runs.push(counters)
    };
    const source={collect:vi.fn(poll || (async()=>({status:'ONLINE',value:50,communicationConfirmed:true,measurementConfirmed:false,observedAt:null})))};
    const sendAlert=vi.fn(async()=>{});
    const resolveDevice=vi.fn(async device=>({active:true,deviceId:device.id,userId:device.userId,config:device.config,credential:device.credential,revision:'synthetic-revision',sensorRevision:'synthetic-sensor'}));
    const worker=createWorker({repository,source,config:{...config,mode,cutoverAt},sendAlert,resolveDevice,now:()=>clock});
    return {data,registry,source,sendAlert,repository,worker,resolveDevice,advance:minutes=>clock+=minutes*60000};
};
it('worker é independente da UI; replay do mesmo ciclo não duplica coleta',async()=>{
    const h=harness();await h.worker.runOnce();await h.worker.runOnce();
    expect(h.source.collect).toHaveBeenCalledOnce();expect(h.data.polls.size).toBe(1);expect(h.data.evaluations).toHaveLength(1);
    expect(h.data.evaluations[0].comparison.version).toBe('agro-3');expect(h.data.evaluations[0].snapshot.engineData.version).toBe('agro-4-phase-1');
});
it('consultas de 5 minutos geram heartbeat de 15, sem criar histórico elegível',async()=>{
    const h=harness();for(let i=0;i<4;i++){await h.worker.runOnce();h.advance(5);}
    expect(h.data.polls.size).toBe(4);expect(h.data.readings).toHaveLength(2);expect(h.data.readings.every(r=>!r.independent)).toBe(true);
    expect(h.data.decisions.map(d=>d.kind)).toEqual(['TRANSITION','HEARTBEAT']);expect(h.sendAlert).not.toHaveBeenCalled();
});
it('modo sombra nunca envia alerta, mesmo com entrega pendente',async()=>{
    const h=harness();h.data.deliveries.push({id:'delivery',payload:{}});await h.worker.runOnce();expect(h.sendAlert).not.toHaveBeenCalled();
});
it('falha de um dispositivo não impede outros usuários e não grava falsa medição',async()=>{
    const h=harness({devices:2,poll:async({token})=>{if(token==='token-0')throw Error('private detail');return {status:'ONLINE',value:0,communicationConfirmed:true,measurementConfirmed:false,observedAt:null};}});
    const result=await h.worker.runOnce();expect(result).toMatchObject({devices:2,failed:1,collected:1,independent:0});
    expect(h.data.readings[0].userId).toBe('owner-1');expect(h.data.readings[0].value).toBe(0);expect(h.registry[0].state.collectedAt).toBeUndefined();expect(h.registry[0].state.lastMeasurementAt).toBeUndefined();
});
it('dois processos concorrentes não coletam o mesmo dispositivo sob lock',async()=>{
    let finish;const h=harness({poll:()=>new Promise(resolve=>finish=()=>resolve({status:'OFFLINE',value:null}))});
    const second=createWorker({repository:h.repository,source:h.source,config,sendAlert:h.sendAlert,resolveDevice:h.resolveDevice,now:()=>now});
    const first=h.worker.runOnce();await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));
    expect((await second.runOnce()).skipped).toBe(1);finish();await first;expect(h.source.collect).toHaveBeenCalledOnce();
});
it('o mesmo processo não sobrepõe ciclos e expõe indisponibilidade sem marcar dispositivo offline',async()=>{
    let finish;const h=harness({poll:()=>new Promise(resolve=>finish=()=>resolve({status:'ONLINE',value:30,communicationConfirmed:true,measurementConfirmed:false}))});
    const first=h.worker.runOnce();await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));
    expect(await h.worker.runOnce()).toEqual({skipped:true});expect(h.registry[0].state.collectedAt).toBeUndefined();finish();await first;
});
const confirmedPoll=()=>({status:'ONLINE',value:30,communicationConfirmed:true,measurementConfirmed:true,observedAt:new Date(now).toISOString()});
it('alerta elegível é enviado no worker promovido uma vez por transição',async()=>{
    const h=harness({mode:'agro-4',poll:async()=>confirmedPoll()});h.repository.history=async()=>history(30);
    await h.worker.runOnce();await h.worker.runOnce();h.advance(5);await h.worker.runOnce();
    expect(h.sendAlert).toHaveBeenCalledOnce();expect(h.data.deliveries[0].status).toBe('SENT');
    expect(h.data.decisions).toHaveLength(1);
});
it('falha ambígua de envio não provoca reenvio automático e preserva UNKNOWN',async()=>{
    const h=harness({mode:'agro-4',poll:async()=>confirmedPoll()});h.repository.history=async()=>history(30);
    h.sendAlert.mockRejectedValue(new Error('synthetic timeout'));
    await h.worker.runOnce();h.advance(5);await h.worker.runOnce();
    expect(h.sendAlert).toHaveBeenCalledOnce();expect(h.data.deliveries[0].status).toBe('UNKNOWN');
});
it('um erro de confirmação após envio mantém SENDING e não repete a mensagem',async()=>{
    const h=harness({mode:'agro-4',poll:async()=>confirmedPoll()});h.repository.history=async()=>history(30);
    const update=h.repository.deliveryStatus;
    h.repository.deliveryStatus=async(userId,id,status)=>{if(status==='SENT')throw Error('synthetic database failure');return update(userId,id,status);};
    expect((await h.worker.runOnce()).failed).toBe(1);expect(h.data.deliveries[0].status).toBe('SENDING');
    await h.worker.runOnce();expect(h.sendAlert).toHaveBeenCalledOnce();
});
it('flag de promoção antes do corte ainda grava sombra e não envia alerta',async()=>{
    const h=harness({mode:'agro-4',poll:async()=>confirmedPoll(),cutoverAt:new Date(now+60000).toISOString()});h.repository.history=async()=>history(30);
    await h.worker.runOnce();expect(h.data.evaluations[0].mode).toBe('shadow');expect(h.sendAlert).not.toHaveBeenCalled();
});
it('dado sem confirmação bloqueia alerta mesmo no modo promovido',async()=>{
    const h=harness({mode:'agro-4'});h.repository.history=async()=>history(30);
    await h.worker.runOnce();expect(h.data.evaluations[0].snapshot.engineData.confidence.eligible).toBe(false);expect(h.sendAlert).not.toHaveBeenCalled();
});
it('controle indisponível não usa credenciais antigas nem declara falha física',async()=>{
    const h=harness();h.resolveDevice.mockRejectedValue(Error('synthetic control outage'));
    expect((await h.worker.runOnce()).failed).toBe(1);expect(h.source.collect).not.toHaveBeenCalled();expect(h.registry[0].state.communicationMisses).toBeUndefined();
});
it('edição de configuração é sincronizada na próxima coleta sem alterar o cadastro',async()=>{
    const h=harness();await h.worker.runOnce();h.advance(5);
    h.resolveDevice.mockImplementation(async device=>({active:true,deviceId:device.id,userId:device.userId,config:{tipoPlantacao:'Feijão'},credential:device.credential,revision:'changed-revision',sensorRevision:'synthetic-sensor'}));
    await h.worker.runOnce();expect(h.data.evaluations.at(-1).snapshot.engineData.inputs.culture).toBe('Feijão');
});
it('revogação entre a coleta e o envio impede usar o contato anterior',async()=>{
    const h=harness({mode:'agro-4',poll:async()=>confirmedPoll()});h.repository.history=async()=>history(30);
    h.resolveDevice.mockImplementation(async device=>h.data.evaluations.length?{active:false,deviceId:device.id,userId:device.userId}:{active:true,deviceId:device.id,userId:device.userId,config:device.config,credential:device.credential,revision:'synthetic-revision',sensorRevision:'synthetic-sensor'});
    await h.worker.runOnce();expect(h.sendAlert).not.toHaveBeenCalled();expect(h.registry[0].active).toBe(false);
});
it('revalida a idade da medição imediatamente antes de enviar',async()=>{
    const h=harness({mode:'agro-4',poll:async()=>confirmedPoll()});h.repository.history=async()=>history(30);
    const update=h.repository.deliveryStatus;
    h.repository.deliveryStatus=async(userId,id,status)=>{await update(userId,id,status);if(status==='SENDING')h.advance(31);};
    await h.worker.runOnce();expect(h.sendAlert).not.toHaveBeenCalled();expect(h.data.deliveries[0].status).toBe('EXPIRED');
});
