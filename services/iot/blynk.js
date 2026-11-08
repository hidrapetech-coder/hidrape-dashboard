const axios = require('axios');
const { isMoisture } = require('../agroEngine/dataQuality');
const parseSensorValue = value => {
    if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value.trim()))) throw new Error('INVALID_SENSOR_VALUE');
    const number=Number(value);
    if (!isMoisture(number)) throw new Error('INVALID_SENSOR_VALUE');
    return number;
};
const createBlynkSource = ({http=axios,baseUrl='https://blynk.cloud',getUrl=null,timeoutMs=4000,connectionTimeoutMs=timeoutMs,retries=2,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}) => ({
    collect: async ({token,pin='V0'}) => {
        let communicationConfirmed=false;
        for (let attempt=0;attempt<=retries;attempt++) {
            try {
                const request=async (url,deadline)=>{
                    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),deadline);
                    try {return await http.get(url,{timeout:deadline,signal:controller.signal,maxRedirects:0,maxContentLength:65536});}
                    finally {clearTimeout(timer);}
                };
                const valueUrl=getUrl || `${baseUrl.replace(/\/$/,'')}/external/api/get`;
                const connected=await request(`${valueUrl.replace('/get','/isHardwareConnected')}?${new URLSearchParams({token})}`,connectionTimeoutMs);
                if (connected.data!==true && connected.data!=='true') return {status:'OFFLINE',value:null,communicationConfirmed:false,measurementConfirmed:false,observedAt:null};
                communicationConfirmed=true;
                const response=await request(`${valueUrl}?${new URLSearchParams({token,[pin]:''})}`,timeoutMs);
                const value=parseSensorValue(response.data);
                // O endpoint get não fornece timestamp de medição. Nunca usar Date.now() como observedAt.
                return {status:'ONLINE',value,communicationConfirmed:true,measurementConfirmed:false,observedAt:null};
            } catch (error) {
                if (error.message==='INVALID_SENSOR_VALUE') return {status:'INVALID',value:null,communicationConfirmed,measurementConfirmed:false,observedAt:null};
                const status=error.response?.status;
                if (attempt>=retries || (status && status!==429 && status<500)) break;
                const retryAfter=Number(error.response?.headers?.['retry-after']);
                if (Number.isFinite(retryAfter) && retryAfter>2) break;
                await sleep(Number.isFinite(retryAfter) && retryAfter>=0 ? retryAfter*1000 : Math.min(2000,250*2**attempt));
            }
        }
        return {status:'API_ERROR',value:null,communicationConfirmed,measurementConfirmed:false,observedAt:null};
    }
});
module.exports={parseSensorValue,createBlynkSource};
