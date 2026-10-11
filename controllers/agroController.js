const prisma = require('../lib/prisma');
const satellite = require('../services/satelliteService');
const { fetchWeather } = require('../services/weatherService');
const ia = require('../services/iaService');
const cache = require('../lib/cache');
const rules = require('../config/agro');
const { getCropConfig } = require('../config/cultures');
const { evaluate } = require('../services/agroEngine');
const { logAgroDecision } = require('../services/agroEngine/observability');
const { timeZoneFor, localDate } = require('../lib/time');
const buildSnapshot = async user => {
    const now = Date.now();
    const [history, weather, sat] = await Promise.all([
        prisma.sensor.findMany({where:{userId:user.id,data:{gte:new Date(now-rules.historyHours*3600000)}},orderBy:{data:'desc'},take:rules.historyLimit}),
        fetchWeather(user), user.cidade?.trim() ? satellite.fetchSateliteData(user.lat,user.lon) : Promise.resolve(null)
    ]);
    const health = await cache.read(`sensor:health:${user.id}`);
    const previsao = evaluate({...user,sensorOnline:health?.online},history,weather,sat,Date.now());
    // Log e cache finalizam durante a requisição serverless.
    await logAgroDecision(user.id,previsao.engineData);
    const result = {clima:weather,cidade:user.cidade,previsao,satelite:sat,sensorState:previsao.sensorState,snapshotId:previsao.snapshotId};
    await cache.write(`agro:snapshot:${user.id}:${result.snapshotId}`,60,result);
    return result;
};
exports.getClimaEDashboard = async (req,res) => {
    try {
        const user = await prisma.user.findUnique({where:{id:req.user.id}});
        if (!user) return res.status(404).json({error:'Usuário não encontrado'});
        res.json(await buildSnapshot(user));
    } catch { console.error('[Agro] Snapshot indisponível.'); res.status(503).json({error:'Não foi possível obter os dados do motor.',fallback:true}); }
};
exports.getInsightsIA = async (req,res) => {
    try {
        const user = await prisma.user.findUnique({where:{id:req.user.id}});
        if (!user) return res.status(404).json({error:'Usuário não encontrado'});
        const id = req.query.snapshotId;
        if (id !== undefined && (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id))) return res.status(400).json({error:'Snapshot inválido'});
        let snapshot = id ? await cache.read(`agro:snapshot:${user.id}:${id}`) : null;
        if (snapshot && Date.now()-Date.parse(snapshot.previsao.engineData.evaluatedAt) > 60000) snapshot = null;
        if (snapshot) {
            const [latest, health] = await Promise.all([
                prisma.sensor.findFirst({where:{userId:user.id},orderBy:{data:'desc'}}),
                cache.read(`sensor:health:${user.id}`)
            ]);
            const inputs = snapshot.previsao.engineData.inputs;
            const last = inputs.readings[0];
            if (health?.online === false || !latest || !last || new Date(latest.data).toISOString() !== last.data || latest.umidade !== last.umidade ||
                Date.now()-Date.parse(last.data) > rules.freshnessMinutes*60000 || inputs.culture !== user.tipoPlantacao ||
                JSON.stringify(inputs.limits) !== JSON.stringify(getCropConfig(user))) snapshot = null;
        }
        // Sem cache compartilhado, devolve um snapshot novo junto ao diagnóstico.
        snapshot ||= await buildSnapshot(user);
        const diagnostico = await ia.traduzirDiagnostico({engineData:snapshot.previsao.engineData},user.id);
        res.json({diagnostico,snapshotId:snapshot.snapshotId,previsao:snapshot.previsao});
    } catch { res.status(503).json({error:'Dados indisponíveis; conferir sensor e tentar novamente.',fallback:true}); }
};
exports.getMediaSemanal = async (req,res) => {
    try {
        const user = await prisma.user.findUnique({where:{id:req.user.id}});
        if (!user) return res.status(404).json({error:'Usuário não encontrado'});
        const zone = timeZoneFor(user), today = localDate(Date.now(),zone);
        const start = new Date(today+'T12:00:00Z'); start.setUTCDate(start.getUTCDate()-6);
        const first = start.toISOString().slice(0,10);
        const rows = await prisma.$queryRaw`
            SELECT to_char(("data" AT TIME ZONE 'UTC') AT TIME ZONE ${zone}, 'YYYY-MM-DD') AS dia,
                   AVG("umidade") AS media
            FROM "Sensor" WHERE "userId" = ${user.id}
              AND "data" >= ${new Date(Date.now()-8*86400000)} AND "data" <= ${new Date()}
              AND "umidade" BETWEEN 0 AND 100
            GROUP BY dia ORDER BY dia`;
        const values = new Map(rows.map(r => [r.dia,Number(r.media)]));
        const result = Array.from({length:7},(_,i) => {
            const date = new Date(first+'T12:00:00Z'); date.setUTCDate(date.getUTCDate()+i);
            const key = date.toISOString().slice(0,10);
            return {data:key,dia:date.toLocaleDateString('pt-BR',{timeZone:'UTC',weekday:'short'}),media:values.has(key) ? Math.round(values.get(key)) : null,timeZone:zone};
        });
        res.json(result);
    } catch { res.status(503).json({error:'Histórico indisponível'}); }
};
