// Daemon externo. Nunca importa server.js, lib/env, lib/prisma ou carrega .env.
const { readConfig } = require('../config/agro4');
const { getAgroPool } = require('../lib/agroDb');
const { AgroRepository } = require('../services/agro4/repository');
const { createBlynkSource } = require('../services/iot/blynk');
const { sendWhatsApp } = require('../services/iot/notifications');
const { createWorker } = require('../services/agro4/worker');
const { createContext } = require('../services/agro4/context');
const { createControlPlane } = require('../services/agro4/controlPlane');

const main = async () => {
    const config=readConfig();
    if (config.mode==='agro-3') throw new Error('AGRO4_DISABLED');
    if (!config.workerApiUrl) throw new Error('AGRO_WORKER_API_URL_REQUIRED');
    const pool=getAgroPool(),repository=new AgroRepository(pool);
    const worker=createWorker({repository,config,source:createBlynkSource({baseUrl:config.blynkServerUrl,timeoutMs:config.timeoutMs,retries:config.retries}),sendAlert:sendWhatsApp,context:createContext(),resolveDevice:createControlPlane({url:config.workerApiUrl,secret:config.workerSecret}),
        log:event=>console.warn(`[Agro4 Worker] ${event==='delivery_failed' ? 'Entrega indisponível.' : 'Coleta indisponível.'}`)});
    let stopping=false,wake;
    const stop=()=>{stopping=true;wake?.();};
    process.once('SIGTERM',stop);process.once('SIGINT',stop);
    try {
        do {
            const began=Date.now();
            try {
                const counters=await worker.runOnce();
                console.log('[Agro4 Worker] Ciclo:',JSON.stringify(counters));
                if (config.workerApiUrl) {
                    try {
                        await require('axios').post(new URL('/api/agro/worker/heartbeat',config.workerApiUrl).href,{counters},{headers:{Authorization:`Bearer ${config.workerSecret}`},timeout:4000,maxRedirects:0,maxContentLength:65536});
                    } catch {console.warn('[Agro4 Worker] Monitoramento remoto indisponível.');}
                }
            } catch {console.error('[Agro4 Worker] Ciclo indisponível; verificar infraestrutura.');}
            if (process.argv.includes('--once')) break;
            if (!stopping) await new Promise(resolve=>{const timer=setTimeout(resolve,Math.max(0,config.pollMinutes*60000-(Date.now()-began)));wake=()=>{clearTimeout(timer);resolve();};});
        } while (!stopping);
    } finally {await pool.end();}
};
if (require.main===module) main().catch(()=>{console.error('[Agro4 Worker] Configuração ou infraestrutura indisponível.');process.exitCode=1;});
module.exports={main};
