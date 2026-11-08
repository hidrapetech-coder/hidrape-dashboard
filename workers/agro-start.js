const { inspectWorkerConfig } = require('../services/agro4/preflight');

// Só carrega adaptadores reais após validar o ambiente exclusivo do worker.
const start = async ({env=process.env,checkOnly=false,run=()=>require('./agro').main()}={}) => {
    const report=inspectWorkerConfig(env);
    if(checkOnly)return report;
    if(!report.valid)throw Error('AGRO_WORKER_CONFIG_INVALID');
    await run();
    return null;
};
if(require.main===module) {
    const allowed=new Set(['--once','--check-config']);
    if(process.argv.slice(2).some(arg=>!allowed.has(arg))) {
        console.error('[Agro4 Worker] Argumento inválido.');process.exitCode=1;
    } else start({checkOnly:process.argv.includes('--check-config')}).then(report=>{
        if(report){console.log(JSON.stringify(report,null,2));if(!report.valid)process.exitCode=1;}
    }).catch(()=>{console.error('[Agro4 Worker] Configuração ou infraestrutura indisponível.');process.exitCode=1;});
}
module.exports={start};
