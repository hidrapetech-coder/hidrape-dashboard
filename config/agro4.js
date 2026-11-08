const { z } = require('zod');

const defaults = Object.freeze({ mode:'agro-3', pollMinutes:5, readingHeartbeatMinutes:15, decisionHeartbeatMinutes:15, changePoints:2, missingCommunicationLimit:3, freshnessMinutes:30, retries:2, timeoutMs:4000 });
const integer = (fallback, min, max) => z.coerce.number().int().min(min).max(max).default(fallback);
const schema = z.object({
    AGRO4_MODE:z.enum(['agro-3','shadow','agro-4']).default('agro-3'),
    AGRO_DATABASE_URL:z.string().url(),
    AGRO_DATABASE_ACK:z.literal('dedicated-agro'),
    AGRO_WORKER_SECRET:z.string().min(32),
    AGRO_POLL_MINUTES:integer(5,1,1440),
    AGRO_READING_HEARTBEAT_MINUTES:integer(15,1,1440),
    AGRO_DECISION_HEARTBEAT_MINUTES:integer(15,1,1440),
    AGRO_CHANGE_POINTS:z.coerce.number().positive().max(100).default(2),
    AGRO_MISSING_COMMUNICATION_LIMIT:integer(3,1,100),
    AGRO_SOURCE_RETRIES:integer(2,0,5),
    AGRO_SOURCE_TIMEOUT_MS:integer(4000,100,20000),
    AGRO_BLYNK_SERVER_URL:z.string().url().default('https://blynk.cloud').refine(raw=>{
        const u=new URL(raw);return u.protocol==='https:' && !u.username && !u.password && !u.search && !u.hash && u.pathname==='/' && (u.hostname==='blynk.cloud' || u.hostname.endsWith('.blynk.cloud'));
    }),
    AGRO4_CUTOVER_AT:z.preprocess(v=>v===''?undefined:v,z.string().datetime({offset:true}).optional()),
    AGRO_WORKER_API_URL:z.preprocess(v=>v===''?undefined:v,z.string().url().refine(raw=>{
        const u=new URL(raw);return !u.username && !u.password && !u.search && !u.hash && (u.protocol==='https:' || (u.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(u.hostname)));
    }).optional())
});

// Portas, credenciais e schemas diferentes não comprovam bancos separados.
const databaseIdentity = raw => {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const user = decodeURIComponent(url.username);
    const project = host.match(/^db\.([^.]+)\.supabase\.co$/)?.[1] ||
        (host.endsWith('.pooler.supabase.com') ? user.match(/\.([^.]+)$/)?.[1] : null);
    return `${project ? 'supabase:'+project : host}/${decodeURIComponent(url.pathname).replace(/^\//,'')}`;
};
const readConfig = (env = process.env) => {
    const mode = env.AGRO4_MODE || 'agro-3';
    if (mode === 'agro-3') return defaults; // Nenhuma credencial agro é exigida pelo login legado.
    const result = schema.safeParse(env);
    if (!result.success) throw new Error('AGRO_CONFIG_INVALID: '+[...new Set(result.error.issues.map(i=>i.path[0]))].join(', '));
    const value = result.data;
    const target = new URL(value.AGRO_DATABASE_URL);
    if (!['postgres:','postgresql:'].includes(target.protocol)) throw new Error('AGRO_DATABASE_URL_INVALID');
    for (const original of [env.DATABASE_URL,env.DIRECT_URL].filter(Boolean)) {
        if (databaseIdentity(original) === databaseIdentity(value.AGRO_DATABASE_URL)) throw new Error('AGRO_DATABASE_MUST_BE_SEPARATE');
    }
    if (value.AGRO_READING_HEARTBEAT_MINUTES < value.AGRO_POLL_MINUTES) throw new Error('AGRO_HEARTBEAT_BELOW_POLL');
    if (mode === 'agro-4' && !value.AGRO4_CUTOVER_AT) throw new Error('AGRO4_CUTOVER_AT_REQUIRED');
    return Object.freeze({
        ...defaults, mode, databaseUrl:value.AGRO_DATABASE_URL, workerSecret:value.AGRO_WORKER_SECRET,
        pollMinutes:value.AGRO_POLL_MINUTES, readingHeartbeatMinutes:value.AGRO_READING_HEARTBEAT_MINUTES,
        decisionHeartbeatMinutes:value.AGRO_DECISION_HEARTBEAT_MINUTES, changePoints:value.AGRO_CHANGE_POINTS,
        missingCommunicationLimit:value.AGRO_MISSING_COMMUNICATION_LIMIT, retries:value.AGRO_SOURCE_RETRIES,
        timeoutMs:value.AGRO_SOURCE_TIMEOUT_MS, blynkServerUrl:value.AGRO_BLYNK_SERVER_URL, cutoverAt:value.AGRO4_CUTOVER_AT || null, workerApiUrl:value.AGRO_WORKER_API_URL || null
    });
};
module.exports = { readConfig, defaults, databaseIdentity };
