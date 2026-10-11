import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname,'../..');
export const blocked = () => { throw new Error('UNMOCKED_SIDE_EFFECT'); };
export const loader = (overrides = {}, environment = {}) => {
    const mocks = {
        'lib/prisma.js':new Proxy({}, {get:()=>new Proxy({}, {get:()=>blocked})}),
        'lib/redis.js':{available:false,get:async()=>null,setex:async()=>null,del:async()=>null,set:async()=>null,eval:blocked},
        'lib/env.js':{JWT_SECRET:'test-only-secret-with-at-least-32-bytes',ENCRYPTION_KEY:'test-only-key-with-32-bytes!!!!!!'},
        'lib/encryption.js':{decrypt:()=> 'synthetic-token',encrypt:()=> 'synthetic-cipher'},
        'services/emailService.js':{enviarBoasVindas:async()=>{}},
        'middleware/audit.js':{logAudit:async()=>{}},
        axios:{get:blocked}, '@google/genai':{GoogleGenAI:class {constructor(){throw new Error('SDK_NOT_MOCKED');}},Type:{OBJECT:'OBJECT',ARRAY:'ARRAY',INTEGER:'INTEGER'}},
        dotenv:{config:blocked}, 'node:https':{get:blocked}, https:{get:blocked}, ...overrides
    };
    const modules = new Map();
    const load = relative => {
        if (Object.hasOwn(mocks,relative)) return mocks[relative];
        if (modules.has(relative)) return modules.get(relative).exports;
        if (!relative.endsWith('.js')) return require(relative);
        const filename = path.join(root,relative), module = {exports:{}};
        modules.set(relative,module);
        const dependency = spec => {
            if (Object.hasOwn(mocks,spec)) return mocks[spec];
            if (!spec.startsWith('.')) {
                if (!['zod','node:crypto','crypto','jsonwebtoken','bcryptjs'].includes(spec)) throw new Error(`Forbidden import ${spec}`);
                return require(spec);
            }
            let file = path.resolve(path.dirname(filename),spec);
            if (!path.extname(file)) file += fs.existsSync(file+'.js') ? '.js' : '/index.js';
            return load(path.relative(root,file));
        };
        vm.runInNewContext(`(function(require,module,exports){${fs.readFileSync(filename,'utf8')}\n})`,{
            Date,Buffer,URL,URLSearchParams,AbortController,Intl,console,setTimeout,clearTimeout,
            process:{env:{NODE_ENV:'test',...environment},exit:blocked},global:{}
        },{filename})(dependency,module,module.exports);
        return module.exports;
    };
    return load;
};
export const now = Date.parse('2026-10-10T12:00:00Z');
export const history = (value=50,count=9,step=15) => Array.from({length:count},(_,i)=>({data:new Date(now-i*step*60000),umidade:value+i}));
export const weather = () => ({utc_offset_seconds:-10800,current:{time:now/1000,temperature_2m:25,relative_humidity_2m:60,wind_speed_10m:5},daily:{time:[now/1000-9*3600],et0_fao_evapotranspiration:[4]},hourly:{time:Array.from({length:12},(_,i)=>now/1000+(i+1)*3600),precipitation:Array(12).fill(0),precipitation_probability:Array(12).fill(0)}});
export const response = () => ({statusCode:200,body:null,status(n){this.statusCode=n;return this;},json(x){this.body=x;return this;},send(x){this.body=x;return this;},cookie(){return this;}});
