const { readConfig } = require('../../config/agro4');

// Este processo não deve receber credenciais da autenticação, nem mesmo vazias.
const forbidden = ['DATABASE_URL','DIRECT_URL','JWT_SECRET','ENCRYPTION_KEY','REDIS_URL','BLYNK_URL','BLYNK_TOKEN','CALLMEBOT_API_KEY'];
const pending = ['isolamento físico do banco','TLS e permissões','migration agro aplicada','locks de sessão','API de autorização','dispositivo e quotas','supervisão e parada'];
const inspectWorkerConfig = (env = process.env) => {
    const errors=[];
    const present=forbidden.filter(name=>Object.hasOwn(env,name));
    if(present.length)errors.push({code:'WORKER_ENV_FORBIDDEN',fields:present});
    if(!present.length) {
        try {
            const config=readConfig(env);
            if(config.mode==='agro-3')errors.push({code:'AGRO4_DISABLED',fields:['AGRO4_MODE']});
            else if(!config.workerApiUrl)errors.push({code:'AGRO_WORKER_API_URL_REQUIRED',fields:['AGRO_WORKER_API_URL']});
        } catch(error) {
            // readConfig só produz códigos/nomes. Ainda assim não imprimir error.message.
            const code=String(error.message).split(':')[0];
            const known=['AGRO_CONFIG_INVALID','AGRO_DATABASE_URL_INVALID','AGRO_SESSION_CONNECTION_REQUIRED','AGRO_DATABASE_MUST_BE_SEPARATE','AGRO_HEARTBEAT_BELOW_POLL','AGRO4_CUTOVER_AT_REQUIRED'];
            const fields=code==='AGRO_CONFIG_INVALID' ? [...new Set(String(error.message).match(/\bAGRO[A-Z0-9_]*\b/g) || [])].filter(name=>name!==code) : [];
            errors.push({code:known.includes(code)?code:'AGRO_CONFIG_INVALID',fields});
        }
    }
    return {kind:'CONFIGURACAO_SEM_CONEXAO',valid:errors.length===0,errors,pending};
};
module.exports={inspectWorkerConfig};
