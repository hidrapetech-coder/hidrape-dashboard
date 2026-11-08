const axios = require('axios');
const { z } = require('zod');
const activeSchema=z.object({active:z.literal(true),deviceId:z.string(),userId:z.string(),revision:z.string().regex(/^[a-f0-9]{64}$/),sensorRevision:z.string().regex(/^[a-f0-9]{64}$/),
    config:z.object({tipoPlantacao:z.string(),minIdeal:z.number().nullable(),maxIdeal:z.number().nullable(),timeZone:z.string().nullable(),cidade:z.string(),lat:z.number().nullable(),lon:z.number().nullable()}).strict(),credential:z.string().min(1)}).strict();
const inactiveSchema=z.object({active:z.literal(false),deviceId:z.string(),userId:z.string()}).strict();
const createControlPlane = ({url,secret,http=axios}) => async device => {
    try {
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000);
        let response;
        try {response=await http.post(new URL('/api/agro/worker/authorization',url).href,{deviceId:device.id},{headers:{Authorization:`Bearer ${secret}`},timeout:4000,signal:controller.signal,maxRedirects:0,maxContentLength:65536});}
        finally {clearTimeout(timer);}
        const result=z.union([activeSchema,inactiveSchema]).parse(response.data);
        if(result.deviceId!==device.id || result.userId!==device.userId)throw Error('OWNER_MISMATCH');
        return result;
    } catch {throw Error('AGRO_AUTHORIZATION_UNAVAILABLE');}
};
module.exports={createControlPlane};
