// Entrada separada: bloqueia efeitos antes de carregar o worker e suas fixtures.
require('./offline/guard').installOfflineGuard();
if(process.argv.length>2) {
    console.error('[Ensaio SINTÉTICO] Argumento inválido.');process.exitCode=1;
} else require('./offline/rehearsal').runRehearsal().then(report=>{
    console.log(JSON.stringify(report,null,2));
    if(!report.passed)process.exitCode=1;
}).catch(()=>{console.error('[Ensaio SINTÉTICO] Verificação indisponível.');process.exitCode=1;});
