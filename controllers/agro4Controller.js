const { z } = require('zod');
const crypto = require('node:crypto');
const { readConfig } = require('../config/agro4');
const { getRuntime,userConfig } = require('../services/agro4/runtime');
const { seal } = require('../services/agro4/credentials');
const {authorizationRevision,sensorRevision}=require('../services/agro4/authorization');
const validZone = value => {try{new Intl.DateTimeFormat('pt-BR',{timeZone:value}).format();return true;}catch{return false;}};
const eventSchema=z.object({
    deviceId:z.string().uuid(),idempotencyKey:z.string().uuid(),type:z.enum(['IRRIGATION','RAIN','ACTION_TAKEN','ALERT_IGNORED']),
    value:z.number().finite().nonnegative().nullable(),unit:z.enum(['mm','minutes','none']),
    occurredAt:z.string().datetime({offset:true}),timeZone:z.string().refine(validZone)
}).strict().superRefine((event,ctx)=>{
    const valid=event.type==='RAIN' ? event.unit==='mm' && event.value!==null : event.type==='IRRIGATION' ? ['mm','minutes'].includes(event.unit) && event.value!==null : event.unit==='none' && event.value===null;
    if(!valid)ctx.addIssue({code:'custom',message:'Unidade ou valor incompatível com o evento.'});
});
const createController = ({runtime=getRuntime,legacy=()=>require('../lib/prisma'),decrypt=value=>require('../lib/encryption').decrypt(value),now=Date.now}={}) => ({
    async enroll(req,res) {
        try {
            const engine=runtime();
            if (Object.keys(req.body || {}).length) return res.status(400).json({error:'O dispositivo principal usa a configuração da sessão.'});
            const user=await legacy().user.findUnique({where:{id:req.user.id}});
            if (!user) return res.status(404).json({error:'Usuário não encontrado'});
            if (!user.blynkToken) return res.status(409).json({error:'Configure a integração Blynk antes de cadastrar o dispositivo.'});
            const credential=seal({blynkToken:decrypt(user.blynkToken),whatsappPhone:user.whatsappPhone || '',callmebotApiKey:user.callmebotApiKey ? decrypt(user.callmebotApiKey) : ''},engine.config.workerSecret);
            const device=await engine.repository.enroll(user.id,userConfig(user),credential,{revision:authorizationRevision(user),sensorRevision:sensorRevision(user)});
            return res.status(201).json({deviceId:device.id,talhaoId:device.talhaoId,source:'BLYNK',pin:'V0',measurementTimestampAvailable:false});
        } catch {return res.status(503).json({error:'Cadastro agro indisponível; nenhuma configuração do login foi alterada.'});}
    },
    async createEvent(req,res) {
        const parsed=eventSchema.safeParse(req.body);
        if (!parsed.success || Date.parse(parsed.data.occurredAt)>now()) return res.status(400).json({error:'Evento inválido; confira tipo, unidade, horário e fuso.'});
        try {
            const engine=runtime(),event=parsed.data;
            if (!await engine.repository.ownedDevice(req.user.id,event.deviceId)) return res.status(404).json({error:'Dispositivo não encontrado'});
            const saved=await engine.repository.createEvent(req.user.id,event);
            return res.status(201).json({id:saved.id,deviceId:saved.deviceId,type:saved.type,origin:saved.origin,value:saved.value,unit:saved.unit,occurredAt:saved.occurredAt,timeZone:saved.timeZone});
        } catch(error) {return res.status(error.message==='AGRO_EVENT_CONFLICT'?409:503).json({error:'Não foi possível registrar o evento.'});}
    },
    async deactivate(req,res) {
        try {await runtime().repository.deactivate(req.user.id);return res.json({active:false});}
        catch {return res.status(503).json({error:'Não foi possível desativar a coleta agro.'});}
    },
    async listEvents(req,res) {
        const query=z.object({deviceId:z.string().uuid()}).strict().safeParse(req.query);
        if(!query.success)return res.status(400).json({error:'Dispositivo inválido'});
        try {
            const engine=runtime(),deviceId=query.data.deviceId;
            if (!await engine.repository.ownedDevice(req.user.id,deviceId)) return res.status(404).json({error:'Dispositivo não encontrado'});
            return res.json(await engine.repository.events(req.user.id,deviceId,new Date(now()-24*3600000),new Date(now())));
        } catch {return res.status(503).json({error:'Eventos indisponíveis.'});}
    },
    async metrics(req,res) {
        try {const engine=runtime();return res.json(await engine.repository.metrics(req.user.id,new Date(now()-7*86400000),new Date(now()),engine.config.readingHeartbeatMinutes));}
        catch {return res.status(503).json({error:'Métricas agro indisponíveis.'});}
    },
    async workerAuthorization(req,res) {
        const parsed=z.object({deviceId:z.string().uuid()}).strict().safeParse(req.body);
        if(!parsed.success)return res.status(400).json({error:'Dispositivo inválido.'});
        try {
            const engine=runtime();
            // O endpoint é restrito ao worker; o proprietário é resolvido no cadastro agro.
            const device=await engine.repository.deviceForWorker(parsed.data.deviceId);
            if(!device)return res.status(404).json({error:'Dispositivo não encontrado.'});
            const user=await legacy().user.findUnique({where:{id:device.userId}});
            if(!device.active || !user?.blynkToken)return res.json({active:false,deviceId:device.id,userId:device.userId});
            const credential=seal({blynkToken:decrypt(user.blynkToken),whatsappPhone:user.whatsappPhone || '',callmebotApiKey:user.callmebotApiKey?decrypt(user.callmebotApiKey):''},engine.config.workerSecret);
            return res.json({active:true,deviceId:device.id,userId:user.id,config:userConfig(user),revision:authorizationRevision(user),sensorRevision:sensorRevision(user),credential});
        } catch {return res.status(503).json({error:'Autorização da coleta indisponível.'});}
    }
});
const enabled = (req,res,next) => process.env.AGRO4_MODE && process.env.AGRO4_MODE!=='agro-3' ? next() : res.status(404).json({error:'Recurso agro não habilitado.'});
const workerAuth = (req,res,next) => {
    try {
        const config=readConfig(),received=req.headers?.authorization || '';
        if (!config.workerSecret || !crypto.timingSafeEqual(crypto.createHash('sha256').update(received).digest(),crypto.createHash('sha256').update(`Bearer ${config.workerSecret}`).digest())) return res.status(401).json({error:'Job não autorizado.'});
        next();
    } catch {return res.status(401).json({error:'Job não autorizado.'});}
};
const workerHeartbeat = (req,res) => {
    const counter=z.number().int().nonnegative();
    const parsed=z.object({counters:z.object({devices:counter,collected:counter,failed:counter,skipped:counter,independent:counter,unconfirmed:counter,sourceUnavailable:counter}).strict()}).strict().safeParse(req.body);
    if(!parsed.success)return res.status(400).json({error:'Heartbeat inválido.'});
    // A execução persistida em AgroWorkerRun é a fonte durável; esta rota apenas confirma o canal autenticado.
    return res.json({accepted:true});
};
module.exports={...createController(),createController,eventSchema,enabled,workerAuth,workerHeartbeat};
