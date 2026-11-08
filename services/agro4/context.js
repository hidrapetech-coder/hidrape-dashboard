const { createWeatherService } = require('../weatherService');
const { createSatelliteService } = require('../satelliteService');
// Cache local e descartável do worker: sem Redis e sem acesso ao ambiente de autenticação.
const createContext = (now=Date.now) => {
    const values=new Map();
    const cache={
        read:async key=>{const entry=values.get(key);if(entry && entry.until>now())return entry.value;values.delete(key);return null;},
        write:async(key,seconds,value)=>{
            if(values.size>=512)values.delete(values.keys().next().value);
            values.set(key,{until:now()+seconds*1000,value});
        }
    };
    const weather=createWeatherService(cache),satellite=createSatelliteService(cache);
    return async device=>{
        const user={...device.config,id:device.userId};
        const [weatherData,satelliteData]=await Promise.all([weather(user),user.cidade?.trim()?satellite(user.lat,user.lon):Promise.resolve(null)]);
        return {weather:weatherData,satellite:satelliteData};
    };
};
module.exports={createContext};
