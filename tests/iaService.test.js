import { it,expect,vi,afterEach } from 'vitest';
import { loader } from './helpers/offline.js';
const { createIaService } = loader()('services/iaService.js');
const facts=['Conferir leitura antes do manejo.','Chuva prevista não comprova reposição do déficit.'];
const payload={engineData:{confidence:{eligible:true,level:'HIGH'},recommendation:{explanation:facts}}};
const make = (generate,options={}) => {
    const cache=new Map(),locks=new Map(),quota=new Map();
    const store={
        get:vi.fn(async k=>cache.get(k)),setex:vi.fn(async(k,t,v)=>cache.set(k,v)),
        set:vi.fn(async(k,v)=>{if(locks.has(k))return null;locks.set(k,v);return 'OK';}),
        eval:vi.fn(async(script,count,key,...args)=>{
            if(count===1){locks.delete(key);return 1;}
            const calls=quota.get(key)||0; if(calls>=Number(args[1]))return 0;quota.set(key,calls+1);return 1;
        }),...options.store
    };
    const client={models:{generateContent:vi.fn(generate)}};
    const service=createIaService({client,store,env:{GEMINI_ENABLED:'true',...options.env},sleep:async()=>{},...options.dependencies});
    return {service,store,client,quota};
};
afterEach(()=>vi.useRealTimers());
it.each(['garbage','{}','{"order":[0]}','{"order":[1,0]}','{"order":[0,0]}','{"order":[0,999]}','{"order":[0,1],"advice":"irrigue 999 litros"}',undefined])('Gemini malformado ou malicioso retorna apenas fatos: %s',async output=>{
    const {service}=make(async()=>({text:output})); expect(await service.traduzirDiagnostico(payload,'u1')).toBe(facts.join(' '));
});
it('saída válida fica em cache isolado por usuário',async()=>{
    const {service,client}=make(async()=>({text:'{"order":[0,1]}'}));
    await service.traduzirDiagnostico(payload,'u1');await service.traduzirDiagnostico(payload,'u1');expect(client.models.generateContent).toHaveBeenCalledTimes(1);
    await service.traduzirDiagnostico(payload,'u2');expect(client.models.generateContent).toHaveBeenCalledTimes(2);
});
it('sem usuário, baixa confiança e Redis ausente não chama Gemini',async()=>{
    const {service,client}=make(async()=>({text:'{"order":[0,1]}'}));
    await service.traduzirDiagnostico(payload);await service.traduzirDiagnostico({...payload,engineData:{...payload.engineData,confidence:{level:'LOW',eligible:false}}},'u');
    expect(client.models.generateContent).not.toHaveBeenCalled();
    const fail=make(async()=>{}, {store:{eval:async()=>{throw Error();}}});await fail.service.traduzirDiagnostico(payload,'u');expect(fail.client.models.generateContent).not.toHaveBeenCalled();
});
it('mensal e diagnóstico compartilham a mesma cota',async()=>{
    const {service,client}=make(async()=>({text:'{"order":[0,1]}'}),{env:{GEMINI_MAX_CALLS_PER_USER_DAY:'1'}});
    await service.traduzirDiagnostico(payload,'u');const monthly=await service.gerarResumoMensal({pctIdeal:20,pctDeficit:80},'u');
    expect(client.models.generateContent).toHaveBeenCalledTimes(1);expect(monthly).toContain('indisponível');
});
it('lock impede gerações concorrentes por usuário',async()=>{
    let complete;const promise=new Promise(r=>complete=r);const {service,client}=make(()=>promise);
    const first=service.traduzirDiagnostico(payload,'u');await Promise.resolve();await Promise.resolve();await Promise.resolve();
    expect(await service.traduzirDiagnostico(payload,'u')).toBe(facts.join(' '));complete({text:'{"order":[0,1]}'});await first;
    expect(client.models.generateContent).toHaveBeenCalledTimes(1);
});
it('retry 429/5xx é limitado e sucesso limpa falhas consecutivas',async()=>{
    let fail=true;const {service,client}=make(async()=>{if(fail){fail=false;throw {status:429};}return {text:'{"order":[0,1]}'};});
    await service.traduzirDiagnostico(payload,'u');expect(client.models.generateContent).toHaveBeenCalledTimes(2);
    expect(client.models.generateContent.mock.calls[0][0].config.httpOptions.retryOptions.attempts).toBe(1);
});
it('aborta transporte no prazo total e devolve fallback',async()=>{
    vi.useFakeTimers();let signal;const {service}=make(args=>{signal=args.config.abortSignal;return new Promise(()=>{});},{env:{GEMINI_TIMEOUT_MS:'1000'}});
    const pending=service.traduzirDiagnostico(payload,'u');await vi.advanceTimersByTimeAsync(1001);
    expect(await pending).toBe(facts.join(' '));expect(signal.aborted).toBe(true);
});
it('configuração inválida desativa geração e parâmetros são limitados',async()=>{
    const {service,client}=make(async()=>{}, {env:{GEMINI_TIMEOUT_MS:'-1'}});await service.traduzirDiagnostico(payload,'u');expect(client.models.generateContent).not.toHaveBeenCalled();
});
it('sucesso zera contador e circuito permite uma tentativa após cooldown',async()=>{
    let mode='fail',time=1000;
    const {service,client}=make(async()=>{if(mode==='fail')throw {status:400};return {text:'{"order":[0,1]}'};},{dependencies:{now:()=>time}});
    await service.traduzirDiagnostico(payload,'u1');await service.traduzirDiagnostico(payload,'u2');mode='success';await service.traduzirDiagnostico(payload,'u3');
    mode='fail';await service.traduzirDiagnostico(payload,'u4');await service.traduzirDiagnostico(payload,'u5');mode='success';await service.traduzirDiagnostico(payload,'u6');expect(client.models.generateContent).toHaveBeenCalledTimes(6);
    mode='fail';for(const id of ['a','b','c'])await service.traduzirDiagnostico(payload,id);
    await service.traduzirDiagnostico(payload,'blocked');expect(client.models.generateContent).toHaveBeenCalledTimes(9);
    time+=300001;mode='success';await service.traduzirDiagnostico(payload,'probe');expect(client.models.generateContent).toHaveBeenCalledTimes(10);
});
it('filtro de segurança e truncamento descartam resposta mesmo com JSON válido',async()=>{
    const {service,store}=make(async()=>({text:'{"order":[0,1]}',candidates:[{finishReason:'SAFETY'}]}));
    expect(await service.traduzirDiagnostico(payload,'u')).toBe(facts.join(' '));expect(store.setex).not.toHaveBeenCalled();
});
it('Retry-After maior que o orçamento evita nova tentativa',async()=>{
    const {service,client}=make(async()=>{throw {status:429,response:{headers:{'retry-after':'120'}}};});await service.traduzirDiagnostico(payload,'u');expect(client.models.generateContent).toHaveBeenCalledTimes(1);
});
