import pg from 'pg';
import { runShadowCycle } from './core.mjs';
import { createAgroEdgeHandler } from './handler.mjs';

const projectRef='qexppwhxrpotzkifsgun';
// Substituído por SHA-256 do token do job no deploy; nunca pelo token em claro.
const jobSecretDigest='__AGRO_JOB_DIGEST__';
const bootstrap=async()=>{
    if(new URL(Deno.env.get('SUPABASE_URL')).hostname!==`${projectRef}.supabase.co`)throw Error('AGRO_EDGE_PROJECT_INVALID');
    const url=new URL(Deno.env.get('SUPABASE_DB_URL'));
    url.searchParams.set('sslmode','verify-full');
    const client=new pg.Client({connectionString:url.href,connectionTimeoutMillis:5000,query_timeout:5000,statement_timeout:5000});
    try {
        await client.connect();
        const identity=await client.query(`SELECT (SELECT id FROM public."AgroStorageIdentity" WHERE id='hidrape-agro4-dedicated') AS marker,
            EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname='User' AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema') AS "authTable"`);
        if(identity.rows[0]?.marker!=='hidrape-agro4-dedicated' || identity.rows[0]?.authTable)throw Error('AGRO_EDGE_DATABASE_INVALID');
        // Bootstrap privilegiado limitado à leitura de segredos novos deste projeto.
        // Todo processamento agro depois usa hidrape_agro_app, sem bypass de RLS.
        const rows=(await client.query("SELECT name,decrypted_secret FROM vault.decrypted_secrets WHERE name=ANY($1::text[])",[
            ['agro_runtime_database_url','agro_edge_job_secret','agro_worker_secret','agro_worker_api_url']])).rows;
        const values=Object.fromEntries(rows.map(row=>[row.name,row.decrypted_secret]));
        if(!values.agro_runtime_database_url || !values.agro_edge_job_secret || !values.agro_worker_secret)throw Error('AGRO_EDGE_SECRETS_REQUIRED');
        return {databaseUrl:values.agro_runtime_database_url,jobSecret:values.agro_edge_job_secret,workerSecret:values.agro_worker_secret,workerApiUrl:values.agro_worker_api_url || null};
    } finally {await client.end().catch(()=>{});}
};
Deno.serve(createAgroEdgeHandler({bootstrap,runCycle:runShadowCycle,Pool:pg.Pool,projectRef,jobSecretDigest}));
