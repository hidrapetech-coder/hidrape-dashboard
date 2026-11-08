const { readConfig } = require('../config/agro4');
let singleton;
const createAgroPool = (config, Pool) => {
    const underlying=new Pool({connectionString:config.databaseUrl,max:2,connectionTimeoutMillis:5000,idleTimeoutMillis:30000,query_timeout:10000,statement_timeout:10000,application_name:'hidrape-agro4'});
    underlying.on('error',()=>console.error('[Agro4] Conexão agro indisponível.'));
    const connect=async()=>{
        const client=await underlying.connect();
        try {
            // Defesa adicional contra URL apontando por engano ao banco protegido.
            const check=await client.query('SELECT (to_regclass(\'public."User"\') IS NOT NULL OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE c.relname=\'User\' AND n.nspname NOT LIKE \'pg_%\' AND n.nspname<>\'information_schema\')) AS "authTable",(SELECT "id" FROM "AgroStorageIdentity" WHERE "id"=$1) AS marker',['hidrape-agro4-dedicated']);
            if (check.rows[0]?.authTable || check.rows[0]?.marker!=='hidrape-agro4-dedicated') throw new Error('AGRO_DATABASE_NOT_DEDICATED');
            return client;
        } catch { client.release();throw new Error('AGRO_DATABASE_NOT_READY_OR_NOT_DEDICATED'); }
    };
    return {connect,query:async(sql,params)=>{const client=await connect();try{return await client.query(sql,params);}finally{client.release();}},end:()=>underlying.end()};
};
const getAgroPool = () => {
    const config=readConfig();
    if (config.mode==='agro-3') throw new Error('AGRO4_DISABLED');
    singleton ||= createAgroPool(config,require('pg').Pool);
    return singleton;
};
module.exports={getAgroPool,createAgroPool};
