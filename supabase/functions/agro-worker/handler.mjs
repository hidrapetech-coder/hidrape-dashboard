import { createHash,timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

const digest=value=>createHash('sha256').update(value).digest();
const respond=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
export const createAgroEdgeHandler = ({bootstrap,runCycle,Pool,projectRef,jobSecretDigest}) => async request => {
    if(request.method!=='POST')return respond(405,{error:'METHOD_NOT_ALLOWED'});
    const authorization=request.headers.get('authorization') || '';
    if(!/^Bearer [a-f0-9]{96}$/.test(authorization))return respond(401,{error:'UNAUTHORIZED'});
    // Verificador não reversível: recusar chamadas antes de abrir conexão/Vault.
    if(!/^[a-f0-9]{64}$/.test(jobSecretDigest || ''))return respond(503,{error:'AGRO_EDGE_UNAVAILABLE'});
    if(!timingSafeEqual(digest(authorization.slice(7)),Buffer.from(jobSecretDigest,'hex')))return respond(401,{error:'UNAUTHORIZED'});
    try {
        const configuration=await bootstrap();
        if(!timingSafeEqual(digest(authorization.slice(7)),digest(configuration.jobSecret)))return respond(401,{error:'UNAUTHORIZED'});
        const target=new URL(configuration.databaseUrl);
        if(!['postgres:','postgresql:'].includes(target.protocol) || target.hostname!==`db.${projectRef}.supabase.co` || target.username!=='hidrape_agro_app' || target.port!=='5432' || target.pathname!=='/postgres' || target.searchParams.get('sslmode')!=='verify-full' || [...target.searchParams.keys()].some(key=>key!=='sslmode'))throw Error('AGRO_EDGE_TARGET_INVALID');
        const result=await runCycle({Pool,databaseUrl:configuration.databaseUrl,workerSecret:configuration.workerSecret,workerApiUrl:configuration.workerApiUrl || null});
        const state=!configuration.workerApiUrl?'WAITING_CONTROL_API':!result.counters.devices?'WAITING_DEVICE':result.counters.failed || result.timeBudgetReached?'DEGRADED_SHADOW':'RUNNING_SHADOW';
        return respond(200,{state,...result});
    } catch {
        console.error('[Agro Edge] Configuração ou infraestrutura indisponível.');
        return respond(503,{error:'AGRO_EDGE_UNAVAILABLE'});
    }
};
