import { it,expect,vi } from 'vitest';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
const require=createRequire(import.meta.url);
const {inspectWorkerConfig}=require('../services/agro4/preflight');
const {start}=require('../workers/agro-start');
const {runRehearsal}=require('../workers/offline/rehearsal');
const root=path.resolve(import.meta.dirname,'..');
const synthetic={AGRO4_MODE:'shadow',AGRO_DATABASE_URL:'postgresql://synthetic:synthetic@127.0.0.1:1/synthetic_agro',AGRO_DATABASE_ACK:'dedicated-agro',AGRO_WORKER_SECRET:'synthetic-only-secret-with-at-least-32-characters',AGRO_WORKER_API_URL:'http://127.0.0.1:1'};

it('checagem sem conexão recusa worker desativado e enumera somente campos ausentes',()=>{
    expect(inspectWorkerConfig({})).toMatchObject({valid:false,errors:[{code:'AGRO4_DISABLED'}]});
    const report=inspectWorkerConfig({AGRO4_MODE:'shadow'});
    expect(report.valid).toBe(false);expect(report.errors[0].fields).toContain('AGRO_DATABASE_URL');
    expect(inspectWorkerConfig(synthetic).valid).toBe(true);
});
it('ambiente exclusivo recusa credenciais legadas sem reproduzir seus valores',()=>{
    const report=inspectWorkerConfig({...synthetic,DATABASE_URL:'PRIVATE_VALUE_DATABASE',JWT_SECRET:'PRIVATE_VALUE_JWT'});
    expect(report.errors).toEqual([{code:'WORKER_ENV_FORBIDDEN',fields:['DATABASE_URL','JWT_SECRET']}]);
    expect(JSON.stringify(report)).not.toContain('PRIVATE_VALUE');
});
it.each([
    [{AGRO_WORKER_API_URL:''},'AGRO_WORKER_API_URL_REQUIRED'],
    [{AGRO_DATABASE_URL:'postgresql://s:s@synthetic.pooler.supabase.com:6543/postgres'},'AGRO_SESSION_CONNECTION_REQUIRED'],
    [{AGRO4_MODE:'agro-4'},'AGRO4_CUTOVER_AT_REQUIRED'],
    [{AGRO_POLL_MINUTES:'20'},'AGRO_HEARTBEAT_BELOW_POLL'],
    [{AGRO_WORKER_API_URL:'http://external.invalid'},'AGRO_CONFIG_INVALID']
])('checagem identifica incompatibilidade operacional sem I/O: %s',(change,code)=>{
    expect(inspectWorkerConfig({...synthetic,...change})).toMatchObject({valid:false,errors:[{code}]});
});
it('entrada não inicia adaptadores em modo check nem com configuração inválida',async()=>{
    const run=vi.fn();
    expect((await start({env:synthetic,checkOnly:true,run})).valid).toBe(true);
    await expect(start({env:{},run})).rejects.toThrow('AGRO_WORKER_CONFIG_INVALID');
    expect(run).not.toHaveBeenCalled();
    await start({env:synthetic,run});expect(run).toHaveBeenCalledOnce();
});
it('ensaio exercita os oito cenários com o worker real e dependências sintéticas',async()=>{
    const report=await runRehearsal();
    expect(report.kind).toBe('ENSAIO_SINTETICO_OFFLINE');
    expect(report.scenarios).toHaveLength(8);expect(report.scenarios.filter(s=>!s.passed)).toEqual([]);
    expect(report.passed).toBe(true);
    expect(report.scenarios.find(s=>s.name==='entrega_incerta_nao_e_reenviada').evidence).toMatchObject({tentativasSimuladas:1,reenvios:0,estado:'UNKNOWN'});
    expect(JSON.stringify(report)).not.toMatch(/synthetic-token|synthetic-key|synthetic-contact|postgresql:/);
});
it('guarda do processo bloqueia rede, adaptadores, subprocessos e leitura de .env',()=>{
    const code=`
        require('./workers/offline/guard').installOfflineGuard();
        const assert=require('node:assert/strict');
        const blocked=fn=>assert.throws(fn,/AGRO_REHEARSAL_SIDE_EFFECT_BLOCKED/);
        blocked(()=>require('pg'));
        blocked(()=>require('./lib/prisma'));
        blocked(()=>require('./services/iot/blynk'));
        blocked(()=>require('node:fs').readFileSync('/synthetic/.env'));
        blocked(()=>require('node:net').connect(1,'127.0.0.1'));
        blocked(()=>require('node:https').get('https://synthetic.invalid'));
        blocked(()=>require('node:dns').lookup('synthetic.invalid',()=>{}));
        blocked(()=>require('node:child_process').spawn('unavailable'));
        blocked(()=>fetch('https://synthetic.invalid'));
        console.log('GUARD_OK');
    `;
    const result=spawnSync(process.execPath,['-e',code],{cwd:root,env:{NODE_ENV:'test'},encoding:'utf8',timeout:10000});
    expect(result.status,result.stderr).toBe(0);expect(result.stdout.trim()).toBe('GUARD_OK');
});
it('lista do pacote contém a cadeia de imports do worker sem arquivos do login',()=>{
    const work=fs.mkdtempSync(path.join(os.tmpdir(),'hidrape-worker-package-'));
    try {
        const entries=fs.readFileSync(path.join(root,'deploy/agro-worker/Dockerfile.dockerignore'),'utf8').split('\n')
            .filter(line=>line.startsWith('!') && !line.endsWith('/')).map(line=>line.slice(1));
        expect(entries.some(file=>/\.env|prisma\/|authController|lib\/prisma|lib\/encryption/.test(file))).toBe(false);
        for(const file of entries) {
            if(file.includes('..') || path.isAbsolute(file))throw Error('UNSAFE_PACKAGE_PATH');
            fs.mkdirSync(path.dirname(path.join(work,file)),{recursive:true});
            fs.copyFileSync(path.join(root,file),path.join(work,file));
        }
        fs.symlinkSync(path.join(root,'node_modules'),path.join(work,'node_modules'),'dir');
        const code=`
            const denied=()=>{throw Error('NETWORK_OR_ENV_BLOCKED');};
            require('node:net').Socket.prototype.connect=denied;
            global.fetch=denied;
            const fs=require('node:fs'),read=fs.readFileSync;
            fs.readFileSync=function(file,...args){if(/[/\\\\]\\.env(?:$|[.])/.test(String(file)))denied();return read.call(this,file,...args);};
            require('./workers/agro');
            require('./workers/agro-start').start({env:{},checkOnly:true}).then(report=>{
                if(report.valid || report.errors[0].code!=='AGRO4_DISABLED')process.exitCode=1;
                else console.log('PACKAGE_IMPORTS_OK');
            });
        `;
        const result=spawnSync(process.execPath,['-e',code],{cwd:work,env:{NODE_ENV:'test'},encoding:'utf8',timeout:10000});
        expect(result.status,result.stderr).toBe(0);expect(result.stdout.trim()).toBe('PACKAGE_IMPORTS_OK');
    } finally {fs.rmSync(work,{recursive:true,force:true});}
});
