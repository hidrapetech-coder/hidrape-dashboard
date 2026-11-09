import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const destination=path.join(root,'supabase/functions/agro-worker');
// Não ler nem empacotar módulos de autenticação/cache legados, mesmo por imports preguiçosos.
const forbidden=new Set(['lib/env','lib/prisma','lib/redis','lib/encryption','server'].map(file=>path.join(root,file)));
const cache=path.join(root,'lib/cache');
const build=await rolldown({input:path.join(root,'workers/supabase/core-entry.mjs'),platform:'node',external:['axios','pg','zod',/^node:/],
    plugins:[{name:'agro-edge-isolation',resolveId(source,importer){
        if(!importer || !source.startsWith('.'))return;
        const target=path.resolve(path.dirname(importer),source).replace(/\.js$/,'');
        if(forbidden.has(target))throw Error('PROTECTED_MODULE_IN_AGRO_EDGE');
        if(target===cache)return '\0agro-edge-no-legacy-cache';
    },load(id){if(id==='\0agro-edge-no-legacy-cache')return 'module.exports=new Proxy({}, {get(){throw Error("AGRO_LEGACY_CACHE_FORBIDDEN");}});';}}]});
try {
    const {output}=await build.generate({format:'esm',exports:'named',sourcemap:false});
    if(output.length!==1 || output[0].type!=='chunk')throw Error('AGRO_EDGE_BUNDLE_INVALID');
    fs.mkdirSync(destination,{recursive:true});
    const externalNames=new Map([['pg','__edge_pg'],['axios','__edge_axios'],['zod','__edge_zod'],['node:crypto','__edge_crypto'],['node:https','__edge_https']]);
    // Imports estáticos compatíveis com o import map Deno; não depender de require local.
    let code=output[0].code.replace('import { createRequire } from "node:module";\n','')
        .replace(/^var __require = .*createRequire\(import\.meta\.url\).*;\n/m,'')
        .replace(/__require\("([^"]+)"\)/g,(_,name)=>{if(!externalNames.has(name))throw Error('UNEXPECTED_EDGE_EXTERNAL');return externalNames.get(name);});
    if(code.includes('__require') || code.includes('createRequire'))throw Error('DYNAMIC_REQUIRE_IN_EDGE_BUNDLE');
    code='import {Buffer} from "node:buffer";\nimport __edge_pg from "pg";\nimport __edge_axios from "axios";\nimport * as __edge_zod from "zod";\nimport * as __edge_crypto from "node:crypto";\nimport * as __edge_https from "node:https";\n'+code;
    fs.writeFileSync(path.join(destination,'core.mjs'),code);
    const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
    const imports=Object.fromEntries(['pg','axios','zod'].map(name=>[name,`npm:${name}@${lock.packages['node_modules/'+name].version}`]));
    fs.writeFileSync(path.join(destination,'deno.json'),JSON.stringify({imports},null,2)+'\n');
    console.log(`Agro Edge: bundle isolado gerado (${code.length} bytes).`);
} finally {await build.close();}
