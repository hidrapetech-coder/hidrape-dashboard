// Guarda exclusiva do processo de ensaio. Não usar no servidor ou worker real.
const installOfflineGuard = () => {
    const denied=()=>{throw Error('AGRO_REHEARSAL_SIDE_EFFECT_BLOCKED');};
    const Module=require('node:module'),path=require('node:path');
    const originalLoad=Module._load;
    let armed=false;
    const externalBuiltins=new Set(['net','tls','http','https','http2','dns','dns/promises','dgram','child_process','worker_threads']);
    const root=path.resolve(__dirname,'../..');
    const blocked=new Set([
        'lib/prisma.js','lib/agroDb.js','lib/env.js','lib/cache.js','lib/redis.js','lib/encryption.js','server.js',
        'workers/agro.js','workers/agro-start.js','services/agro4/repository.js','services/agro4/controlPlane.js',
        'services/agro4/context.js','services/iot/blynk.js','services/iot/notifications.js'
    ].map(file=>path.join(root,file)));
    Module._load=function(spec,parent,...args) {
        if(armed && externalBuiltins.has(spec.replace(/^node:/,'')))return denied();
        if(['pg','pg-native','dotenv','axios','ioredis','@prisma/client','undici'].some(name=>spec===name || spec.startsWith(name+'/')))return denied();
        if(spec.startsWith('.') || path.isAbsolute(spec)) {
            const resolved=Module._resolveFilename(spec,parent);
            if(blocked.has(resolved))return denied();
        }
        return originalLoad.call(this,spec,parent,...args);
    };
    for(const name of ['node:http','node:https']) {
        const http=require(name);http.request=denied;http.get=denied;
    }
    require('node:net').Socket.prototype.connect=denied;
    require('node:tls').connect=denied;
    for(const name of ['lookup','resolve','resolve4','resolve6'])require('node:dns')[name]=denied;
    for(const name of ['lookup','resolve','resolve4','resolve6'])require('node:dns').promises[name]=denied;
    const dgram=require('node:dgram');dgram.createSocket=denied;
    const child=require('node:child_process');
    for(const name of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])child[name]=denied;
    globalThis.fetch=denied;
    const fs=require('node:fs');
    const check=file=>{
        const filename=file instanceof URL ? file.pathname : String(file);
        if(/(^|[/\\])\.env(?:$|[.])/i.test(filename))denied();
    };
    for(const name of ['readFileSync','readFile','openSync','open','createReadStream']) {
        const original=fs[name];fs[name]=function(file,...args){check(file);return original.call(this,file,...args);};
    }
    for(const name of ['readFile','open']) {
        const original=fs.promises[name];fs.promises[name]=function(file,...args){check(file);return original.call(this,file,...args);};
    }
    armed=true;
};
module.exports={installOfflineGuard};
