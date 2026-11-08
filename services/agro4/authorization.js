const { hash } = require('./domain');
const userConfig = user => ({tipoPlantacao:user.tipoPlantacao,minIdeal:user.minIdeal ?? null,maxIdeal:user.maxIdeal ?? null,timeZone:user.timeZone ?? null,
    cidade:user.cidade || '',lat:Number.isFinite(user.lat)?user.lat:null,lon:Number.isFinite(user.lon)?user.lon:null});
const sensorRevision = user => hash({blynkToken:user.blynkToken || ''});
const authorizationRevision = user => hash({userId:user.id,configuration:userConfig(user),sensorRevision:sensorRevision(user),phone:user.whatsappPhone || '',callmebotApiKey:user.callmebotApiKey || ''});
module.exports={userConfig,sensorRevision,authorizationRevision};
