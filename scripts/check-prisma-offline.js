// Smoke test da ferramenta Prisma e do override de segurança. Sem .env e sem banco.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname,'..');
const work = fs.mkdtempSync(path.join(os.tmpdir(),'hidrape-prisma-check-'));
try {
    fs.writeFileSync(path.join(work,'package.json'), JSON.stringify({name:'hidrape-offline-check',private:true}));
    fs.symlinkSync(path.join(root,'node_modules'),path.join(work,'node_modules'),'dir');
    const guard = path.join(work,'guard.cjs');
    fs.writeFileSync(guard, `const fs=require('node:fs');const read=fs.readFileSync;fs.readFileSync=function(p,...a){if(typeof p==='string'&&/[/\\\\]\\.env(?:$|\\.)/.test(p))throw Error('ENV_FILE_READ_BLOCKED');return read.call(this,p,...a)};require('node:net').Socket.prototype.connect=()=>{throw Error('NETWORK_BLOCKED')};global.fetch=()=>{throw Error('NETWORK_BLOCKED')};`);
    const cli = require.resolve('prisma/build/index.js');
    const env = {PATH:process.env.PATH,TMPDIR:work,NODE_ENV:'test',CHECKPOINT_DISABLE:'1',PRISMA_HIDE_UPDATE_MESSAGE:'1',PRISMA_SKIP_POSTINSTALL_GENERATE:'1',PRISMA_GENERATE_SKIP_AUTOINSTALL:'1',
        DATABASE_URL:'postgresql://synthetic:synthetic@127.0.0.1:1/unused',DIRECT_URL:'postgresql://synthetic:synthetic@127.0.0.1:1/unused',AGRO_DATABASE_URL:'postgresql://synthetic:synthetic@127.0.0.1:1/unused_agro'};
    const run = args => {
        const result=spawnSync(process.execPath,['--require',guard,cli,...args],{cwd:work,env,encoding:'utf8',timeout:60000});
        if(result.status!==0) throw new Error(`Prisma ${args[0]} falhou: ${result.error?.message || result.stderr || result.stdout}`);
        return result.stdout;
    };
    for (const [index,relative] of ['prisma/schema.prisma','prisma/agro/schema.prisma'].entries()) {
        const schema=fs.readFileSync(path.join(root,relative),'utf8');
        const source=schema.replace(/generator client \{[\s\S]*?\}/,`generator client {\n  provider = "prisma-client-js"\n  output = ${JSON.stringify(path.join(work,'client-'+index))}\n}`);
        fs.writeFileSync(path.join(work,'schema.prisma'),source);
        fs.writeFileSync(path.join(work,'prisma.config.cjs'),`module.exports = require(${JSON.stringify(require.resolve('@prisma/config'))}).defineConfig({schema:${JSON.stringify(path.join(work,'schema.prisma'))}});`);
        run(['validate','--config',path.join(work,'prisma.config.cjs')]);
        run(['generate','--config',path.join(work,'prisma.config.cjs')]);
        console.log(`Prisma validate + generate: OK (${relative}; .env e rede bloqueados).`);
        if(index===1 && process.argv.includes('--agro-migration')) {
            const target=path.join(root,'prisma/agro/migrations/20261108000000_phase1');
            if(fs.existsSync(target)) throw Error('Migration agro já existe; não sobrescrever.');
            const sql=run(['migrate','diff','--from-empty','--to-schema-datamodel',path.join(work,'schema.prisma'),'--script']);
            fs.mkdirSync(target,{recursive:true});fs.writeFileSync(path.join(target,'migration.sql'),sql);
            console.log('DDL agro gerado offline; nenhuma migration aplicada.');
        }
        if(index===0 && process.argv.includes('--baseline')) {
        const baseline=source.replace(/  (?:timeZone|minIdeal|maxIdeal)\s+\w+\?\n/g,'');
        fs.writeFileSync(path.join(work,'baseline.prisma'),baseline);
        const sql=run(['migrate','diff','--from-empty','--to-schema-datamodel',path.join(work,'baseline.prisma'),'--script']);
        const target=path.join(root,'prisma/migrations/0_baseline');fs.mkdirSync(target,{recursive:true});fs.writeFileSync(path.join(target,'migration.sql'),sql);
        console.log('Baseline SQL local criado; nenhuma migration aplicada.');
        }
    }
} finally {
    fs.rmSync(work,{recursive:true,force:true}); // apenas diretório temporário criado por este script
}
