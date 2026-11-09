import configuration from '../../config/agro4.js';
import database from '../../lib/agroDb.js';
import storage from '../../services/agro4/repository.js';
import ingestion from '../../services/agro4/worker.js';
import blynk from '../../services/iot/blynk.js';
import authorization from '../../services/agro4/controlPlane.js';
import ancillary from '../../services/agro4/context.js';
import { createDeadlineResources } from './deadline.mjs';

export const runShadowCycle = async ({Pool,databaseUrl,workerSecret,workerApiUrl,now=Date.now}) => {
    const resources=createDeadlineResources({Pool,now});
    const config=configuration.readConfig({AGRO4_MODE:'shadow',AGRO_DATABASE_URL:databaseUrl,AGRO_DATABASE_ACK:'dedicated-agro',AGRO_WORKER_SECRET:workerSecret,...(workerApiUrl?{AGRO_WORKER_API_URL:workerApiUrl}:{})});
    const pool=database.createAgroPool(config,resources.DeadlinePool);
    try {
        const repository=new storage.AgroRepository(pool);
        const context=ancillary.createContext(now,{signal:resources.signal});
        const worker=ingestion.createWorker({repository,config,now,shouldContinue:resources.shouldContinue,
            source:blynk.createBlynkSource({baseUrl:config.blynkServerUrl,timeoutMs:config.timeoutMs,retries:config.retries,http:resources.http}),
            context:device=>resources.bounded(()=>context(device)),
            resolveDevice:workerApiUrl?authorization.createControlPlane({url:workerApiUrl,secret:workerSecret,http:resources.http}):async()=>{throw Error('AGRO_CONTROL_API_NOT_CONFIGURED');},
            sendAlert:async()=>{throw Error('AGRO_EDGE_SHADOW_ONLY');},
            log:()=>console.warn('[Agro Edge] Dispositivo indisponível para processamento.')});
        const counters=await worker.runOnce();
        return {mode:'shadow',controlApiConfigured:!!workerApiUrl,timeBudgetReached:!resources.shouldContinue(),counters};
    } finally {try{await pool.end();}finally{resources.dispose();}}
};
