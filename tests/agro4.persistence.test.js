import { it,expect,vi } from 'vitest';
import fs from 'node:fs';
import { loader,now } from './helpers/offline.js';
const load=loader(),{AgroRepository}=load('services/agro4/repository.js'),{createAgroPool}=load('lib/agroDb.js');

it.each([{authTable:'"User"',marker:'hidrape-agro4-dedicated'},{authTable:null,marker:null}])('recusa destino sem isolamento antes de qualquer escrita: %j',async row=>{
    const query=vi.fn(async()=>({rows:[row]})),release=vi.fn();
    class Pool {on(){}async connect(){return {query,release};}async end(){}}
    const pool=createAgroPool({databaseUrl:'postgresql://fixture:fixture@agro.invalid/agro'},Pool);
    await expect(pool.query('INSERT INTO "AgroPoll" DEFAULT VALUES')).rejects.toThrow('AGRO_DATABASE_NOT_READY_OR_NOT_DEDICATED');
    expect(query).toHaveBeenCalledOnce();expect(query.mock.calls[0][0]).toContain('to_regclass');expect(release).toHaveBeenCalledOnce();
});
it('conexão dedicada confere o marcador, executa SQL parametrizado e libera o cliente',async()=>{
    const query=vi.fn().mockResolvedValueOnce({rows:[{authTable:null,marker:'hidrape-agro4-dedicated'}]}).mockResolvedValueOnce({rows:[]}),release=vi.fn();
    class Pool {on(){}async connect(){return {query,release};}async end(){}}
    const pool=createAgroPool({databaseUrl:'postgresql://fixture:fixture@agro.invalid/agro'},Pool);
    await pool.query('SELECT $1 AS owner',['owner']);expect(query.mock.calls[1]).toEqual(['SELECT $1 AS owner',['owner']]);expect(release).toHaveBeenCalledOnce();
});
it('falha transacional desfaz o conjunto e não confirma estado parcial',async()=>{
    const client={query:vi.fn(async()=>({rows:[]})),release:vi.fn()},repository=new AgroRepository({connect:async()=>client});
    await expect(repository.transaction(async tx=>{await tx.query('SELECT $1',['owner']);throw Error('synthetic');})).rejects.toThrow('synthetic');
    expect(client.query.mock.calls.map(c=>c[0])).toEqual(['BEGIN','SELECT $1','ROLLBACK']);expect(client.release).toHaveBeenCalledOnce();
});
it('lock distribuído é liberado mesmo após falha do processamento',async()=>{
    const client={query:vi.fn(async sql=>({rows:sql.includes('pg_try')?[{locked:true}]:[]})),release:vi.fn()};
    await expect(new AgroRepository({connect:async()=>client}).withDeviceLock('device',async()=>{throw Error('synthetic');})).rejects.toThrow('synthetic');
    expect(client.query.mock.calls.at(-1)[0]).toContain('pg_advisory_unlock');expect(client.release).toHaveBeenCalledOnce();
});
it('lock ocupado não entra no processamento nem desbloqueia lock de outro worker',async()=>{
    const client={query:vi.fn(async()=>({rows:[{locked:false}]})),release:vi.fn()},work=vi.fn();
    expect(await new AgroRepository({connect:async()=>client}).withDeviceLock('device',work)).toMatchObject({skipped:true});
    expect(work).not.toHaveBeenCalled();expect(client.query).toHaveBeenCalledOnce();
});
it('consultas públicas mantêm escopo do usuário e ignoram heartbeats no histórico agronômico',async()=>{
    const query=vi.fn(async sql=>({rows:sql.includes('COUNT(*) AS total')?[{total:0}]:[],rowCount:0}));
    const repository=new AgroRepository({query});
    await repository.ownedDevice('owner','device');await repository.history('owner','device',now);await repository.previousDecision('owner','device','shadow');
    for(const [sql,params] of query.mock.calls){expect(sql).toContain('"userId"=$1');expect(params[0]).toBe('owner');}
    expect(query.mock.calls[1][0]).toContain('"independent"=true');expect(query.mock.calls[1][0]).toContain('"collectedAt"<=$5');
});
it('INSERT de evento valida a propriedade em SQL e recusa reutilizar chave com outro payload',async()=>{
    const query=vi.fn().mockResolvedValueOnce({rowCount:0,rows:[]}).mockResolvedValueOnce({rows:[{deviceId:'other',type:'RAIN'}]});
    const repository=new AgroRepository({query});
    await expect(repository.createEvent('owner',{deviceId:'device',idempotencyKey:'event-key',type:'RAIN',value:0,unit:'mm',occurredAt:new Date(now).toISOString(),timeZone:'UTC'})).rejects.toThrow('AGRO_EVENT_CONFLICT');
    expect(query.mock.calls[0][0]).toContain('d."userId"=$2');expect(query.mock.calls[0][1][1]).toBe('owner');
});
it('contagem de recomendações usa somente transições promovidas no fuso do período',async()=>{
    const query=vi.fn(async sql=>({rows:sql.includes('COUNT(*) AS total')?[{total:'2'}]:[]}));
    const repository=new AgroRepository({query});
    const result=await repository.aggregates('owner',new Date(now),new Date(now),new Date(now+1),'America/Recife',{minIdeal:40,maxIdeal:70},'2026-10-01','2026-10-31');
    expect(result.decisions).toBe(2);const [sql,params]=query.mock.calls[1];
    expect(sql).toContain('"kind"=\'TRANSITION\'');expect(sql).toContain('"mode"=\'agro-4\'');expect(params.slice(-3)).toEqual(['America/Recife','2026-10-01','2026-10-31']);
});
it('DDL novo protege User antes de criar tabelas; schema original fica separado',()=>{
    const sql=fs.readFileSync(new URL('../prisma/agro/migrations/20261108000000_phase1/migration.sql',import.meta.url),'utf8');
    expect(sql.indexOf('AGRO_DATABASE_MUST_BE_SEPARATE')).toBeLessThan(sql.indexOf('CREATE TABLE'));
    expect(sql).not.toMatch(/(?:ALTER TABLE|DROP TABLE|CREATE TABLE) "User"/);
    expect(sql).not.toMatch(/DROP (?:TABLE|COLUMN|SCHEMA)|TRUNCATE/);
    expect(sql).toContain('AgroReading_independent_check');expect(sql).toContain('FOREIGN KEY ("userId", "deviceId", "pollId")');expect(sql.trim().endsWith('COMMIT;')).toBe(true);
});
