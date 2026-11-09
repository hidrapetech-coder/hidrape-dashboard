import {it,expect,vi,afterEach} from 'vitest';
import {createAgroEdgeHandler} from '../supabase/functions/agro-worker/handler.mjs';
import {createHash} from 'node:crypto';
import {loader,now} from './helpers/offline.js';
import {createDeadlineResources} from '../workers/supabase/deadline.mjs';
afterEach(()=>vi.useRealTimers());
const projectRef='qexppwhxrpotzkifsgun',jobSecret='a'.repeat(96);
const configuration={jobSecret,databaseUrl:`postgresql://hidrape_agro_app:synthetic@db.${projectRef}.supabase.co:5432/postgres?sslmode=verify-full`,workerSecret:'synthetic-worker-secret-with-at-least-32-characters',workerApiUrl:null};
const make=()=>{
    const bootstrap=vi.fn(async()=>({...configuration})),runCycle=vi.fn(async()=>({mode:'shadow',controlApiConfigured:false,counters:{devices:0,collected:0,failed:0}}));
    return {bootstrap,runCycle,handler:createAgroEdgeHandler({bootstrap,runCycle,Pool:class{},projectRef,jobSecretDigest:createHash('sha256').update(jobSecret).digest('hex')})};
};
const request=(token=jobSecret)=>new Request('https://synthetic.invalid',{method:'POST',headers:{authorization:'Bearer '+token}});
it('recusa método e token ausente antes de abrir bootstrap',async()=>{
    const h=make();expect((await h.handler(new Request('https://synthetic.invalid'))).status).toBe(405);
    expect((await h.handler(request('wrong'))).status).toBe(401);expect(h.bootstrap).not.toHaveBeenCalled();
});
it('token de formato válido, mas incorreto, nunca executa o motor',async()=>{
    const h=make();expect((await h.handler(request('b'.repeat(96)))).status).toBe(401);expect(h.bootstrap).not.toHaveBeenCalled();expect(h.runCycle).not.toHaveBeenCalled();
});
it('sem canal de autorização, declara espera sem simular dispositivo operacional',async()=>{
    const h=make(),response=await h.handler(request());
    expect(response.status).toBe(200);expect(await response.json()).toMatchObject({state:'WAITING_CONTROL_API',mode:'shadow',counters:{devices:0}});
    expect(h.runCycle).toHaveBeenCalledOnce();
});
it.each([
    `postgresql://hidrape_agro_app:synthetic@db.ydlvhejbivcuwvcjxlsx.supabase.co:5432/postgres?sslmode=verify-full`,
    `postgresql://postgres:synthetic@db.${projectRef}.supabase.co:5432/postgres?sslmode=verify-full`,
    configuration.databaseUrl+'&host=other.invalid',
    configuration.databaseUrl.replace('verify-full','require')
])('recusa destino, privilégio ou TLS incompatível sem expor credencial: %s',async databaseUrl=>{
    const h=make();h.bootstrap.mockResolvedValue({...configuration,databaseUrl});
    const response=await h.handler(request());expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('synthetic');expect(h.runCycle).not.toHaveBeenCalled();
});
it('expõe degradação quando o orçamento da função impede iniciar mais dispositivos',async()=>{
    const h=make();h.bootstrap.mockResolvedValue({...configuration,workerApiUrl:'https://synthetic.invalid'});
    h.runCycle.mockResolvedValue({mode:'shadow',timeBudgetReached:true,counters:{devices:1,failed:0,skipped:1}});
    expect(await (await h.handler(request())).json()).toMatchObject({state:'DEGRADED_SHADOW'});
});
it('API configurada e cadastro vazio permanecem em espera por dispositivo',async()=>{
    const h=make();h.bootstrap.mockResolvedValue({...configuration,workerApiUrl:'https://synthetic.invalid'});
    expect(await (await h.handler(request())).json()).toMatchObject({state:'WAITING_DEVICE'});
});
it('worker respeita interrupção operacional sem fabricar falha de comunicação',async()=>{
    const {createWorker}=loader()('services/agro4/worker.js');
    const recordRun=vi.fn(),source={collect:vi.fn()},repository={listDevices:async()=>[{id:'synthetic-device'}],recordRun};
    const worker=createWorker({repository,source,config:{pollMinutes:5},resolveDevice:vi.fn(),shouldContinue:()=>false,now:()=>now});
    expect(await worker.runOnce()).toMatchObject({devices:1,skipped:1,failed:0,collected:0});
    expect(source.collect).not.toHaveBeenCalled();expect(recordRun).toHaveBeenCalledOnce();
});
it('prazo agregado fecha a sessão em andamento e preserva janela de registro',async()=>{
    vi.useFakeTimers();
    const native={query:vi.fn(async()=>({rows:[]})),release:vi.fn()};
    class Pool {on(){}async connect(){return native;}async end(){}}
    const resources=createDeadlineResources({Pool,workMs:10,cleanupMs:10});
    try {
        const pool=new resources.DeadlinePool({}),client=await pool.connect();
        const pending=resources.bounded(()=>new Promise(()=>{}));
        const assertion=expect(pending).rejects.toThrow('AGRO_EDGE_DEADLINE');
        await vi.advanceTimersByTimeAsync(11);await assertion;
        expect(resources.shouldContinue()).toBe(false);expect(native.release).toHaveBeenCalledWith(true);
        const cleanup=await pool.connect();await cleanup.query('SELECT 1');cleanup.release();
        await vi.advanceTimersByTimeAsync(10);await expect(pool.connect()).rejects.toThrow('AGRO_EDGE_DEADLINE');
        expect(()=>client.query('SELECT 1')).toThrow('AGRO_EDGE_CONNECTION_CLOSED');
    } finally {resources.dispose();}
});
