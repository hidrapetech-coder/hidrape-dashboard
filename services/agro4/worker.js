const { planCollection,evaluatePhase1,compactSnapshot,decisionKind,hash } = require('./domain');
const { evaluate } = require('../agroEngine');
const { open } = require('./credentials');

const createWorker = ({repository,source,config,sendAlert,resolveDevice,context=async()=>({weather:null,satellite:null}),now=Date.now,log=()=>{},shouldContinue=()=>true}) => {
    if(typeof resolveDevice!=='function')throw Error('AGRO_AUTHORIZATION_REQUIRED');
    let running=false;
    const refresh = async (repo,device) => {
        const authorization=await resolveDevice(device);
        if(authorization.deviceId!==device.id || authorization.userId!==device.userId)throw Error('AGRO_AUTHORIZATION_UNAVAILABLE');
        return repo.transaction(tx=>tx.syncAuthorization(device,authorization,new Date(now())));
    };
    const freshMeasurement = snapshot => {
        const age=now()-Date.parse(snapshot.sensorState.lastMeasurementAt);
        return Number.isFinite(age) && age>=0 && age<=config.freshnessMinutes*60000;
    };
    const deliver = async (repo,device) => {
        if (config.mode!=='agro-4' || now()<Date.parse(config.cutoverAt)) return;
        const current=await repo.ownedDevice(device.userId,device.id);
        if(!current)return;
        const authorization=await resolveDevice(current);
        if(authorization.deviceId!==current.id || authorization.userId!==current.userId)throw Error('AGRO_AUTHORIZATION_UNAVAILABLE');
        if(!authorization.active || authorization.revision!==current.state.authorizationRevision) {
            await repo.transaction(tx=>tx.syncAuthorization(current,authorization,new Date(now())));return;
        }
        const secrets=open(authorization.credential,config.workerSecret);
        const latest=await repo.latestEvaluation(device.userId,device.id,config.cutoverAt);
        if (!latest?.engineData.confidence.eligible || latest.sensorState.quality!=='VALID' ||
            !freshMeasurement(latest) || latest.engineData.authorizationRevision!==current.state.authorizationRevision ||
            now()<Date.parse(latest.engineData.evaluatedAt) ||
            now()-Date.parse(latest.engineData.evaluatedAt)>config.pollMinutes*2*60000 ||
            latest.engineData.configurationHash!==hash(device.config) ||
            hash(latest.engineData.inputs.limits)!==hash(require('../../config/cultures').getCropConfig(device.config))) return;
        for (const delivery of await repo.pendingDeliveries(device.userId,device.id)) {
            const snapshot=delivery.payload;
            if (snapshot.engineData.recommendation.action!==latest.engineData.recommendation.action || now()-Date.parse(snapshot.engineData.evaluatedAt)>config.pollMinutes*2*60000) {
                await repo.deliveryStatus(device.userId,delivery.id,'EXPIRED',now());continue;
            }
            // Não enviar recomendação antiga, sem medida confirmada ou fora da configuração atual.
            if (!secrets.whatsappPhone || !secrets.callmebotApiKey || !snapshot.engineData.confidence.eligible ||
                !['IRRIGAR','EXCESSO_UMIDADE'].includes(snapshot.engineData.recommendation.action) ||
                snapshot.engineData.recommendation.action!==latest.engineData.recommendation.action ||
                now()-Date.parse(snapshot.engineData.evaluatedAt)>config.pollMinutes*2*60000 ||
                hash(snapshot.engineData.inputs.limits)!==hash(require('../../config/cultures').getCropConfig(device.config))) continue;
            await repo.deliveryStatus(device.userId,delivery.id,'SENDING',now());
            if(!freshMeasurement(latest)) {await repo.deliveryStatus(device.userId,delivery.id,'EXPIRED',now());continue;}
            try { await sendAlert(secrets,latest.engineData.recommendation); }
            catch { await repo.deliveryStatus(device.userId,delivery.id,'UNKNOWN',now());log('delivery_failed');continue; }
            // Se o HTTP foi aceito mas a confirmação no banco falhar, manter SENDING.
            // Reenviar automaticamente poderia duplicar uma mensagem já aceita pelo provedor.
            await repo.deliveryStatus(device.userId,delivery.id,'SENT',now());
        }
    };
    const collectDevice = (device,scheduledAt) => repository.withDeviceLock(device.id,async repo=>{
        let current=await repo.ownedDevice(device.userId,device.id);
        if (!current) return {skipped:true};
        if(repo.recordAttempt){await repo.recordAttempt(current.userId,current.id,now());current.state={...current.state,lastAttemptedAt:new Date(now()).toISOString()};}
        current=await refresh(repo,current);
        if(!current)return {skipped:true,reason:'DISABLED'};
        const secrets=open(current.credential,config.workerSecret);
        if (await repo.hasPoll(current.id,scheduledAt)) { await deliver(repo,current);return {skipped:true}; }
        const poll=await source.collect({token:secrets.blynkToken,pin:current.pin});
        if(!shouldContinue())return {skipped:true,reason:'BUDGET'};
        const at=now(),plan=planCollection(current.state,poll,at,config);
        const ancillary=await context(current).catch(()=>({weather:null,satellite:null}));
        if(!shouldContinue())return {skipped:true,reason:'BUDGET'};
        const output=await repo.transaction(async tx=>{
            const pollId=await tx.saveCollection(current,plan,scheduledAt);
            if (!pollId) return {skipped:true};
            const history=await tx.history(current.userId,current.id,at,current.state.historySince || null);
            const events=await tx.events(current.userId,current.id,new Date(at-24*3600000),new Date(at));
            const user={...current.config,id:current.userId};
            const snapshot=evaluatePhase1({user,history,...ancillary,events,deviceId:current.id,state:plan.state,now:at,config});
            snapshot.engineData.configurationHash=hash(current.config);
            snapshot.engineData.authorizationRevision=current.state.authorizationRevision;
            snapshot.engineData.sourceEpoch=current.state.historySince || null;
            snapshot.snapshotId=hash({userId:current.userId,deviceId:current.id,engineData:snapshot.engineData,sensorState:snapshot.sensorState});
            const legacy=evaluate({...user,sensorOnline:plan.state.connectionStatus==='ONLINE'},history,ancillary.weather,ancillary.satellite,at);
            const comparison={version:legacy.engineData.version,action:legacy.engineData.recommendation.action,riskLevel:legacy.engineData.risk.level,eligible:legacy.engineData.confidence.eligible,snapshotId:legacy.snapshotId};
            const prior=await tx.previousDecision(current.userId,current.id,config.mode);
            const mode=config.mode==='agro-4' && at<Date.parse(config.cutoverAt)?'shadow':config.mode;
            const effectivePrior=mode===config.mode?prior:await tx.previousDecision(current.userId,current.id,mode);
            const kind=decisionKind(effectivePrior,snapshot,at,config);
            const compact=compactSnapshot(snapshot,{history,deviceId:current.id,now:at});
            await tx.saveEvaluation(current,pollId,compact,comparison,mode,kind,at);
            return {quality:plan.quality,persisted:plan.persistReading,independent:plan.independent,decision:kind};
        });
        await deliver(repo,current);
        return output;
    });
    const runOnce=async()=>{
        if (running) return {skipped:true};
        running=true;const started=now(),counters={devices:0,collected:0,failed:0,skipped:0,independent:0,unconfirmed:0,sourceUnavailable:0};
        try {
            const scheduledAt=new Date(Math.floor(started/(config.pollMinutes*60000))*config.pollMinutes*60000);
            for (const device of await repository.listDevices()) {
                counters.devices++;
                if(!shouldContinue()){counters.skipped++;continue;}
                try {
                    const result=await collectDevice(device,scheduledAt);
                    if (result.skipped) counters.skipped++;
                    else { counters.collected++;if(result.independent)counters.independent++;if(result.quality==='UNCONFIRMED')counters.unconfirmed++;if(['OFFLINE','API_ERROR','INVALID'].includes(result.quality))counters.sourceUnavailable++; }
                } catch { counters.failed++;log('collection_failed'); }
            }
            await repository.recordRun(started,now(),counters);
            return counters;
        } finally {running=false;}
    };
    return {runOnce};
};
module.exports={createWorker};
