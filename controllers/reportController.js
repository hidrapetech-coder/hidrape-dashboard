const prisma = require('../lib/prisma');
const ia = require('../services/iaService');
const { getCropConfig } = require('../config/cultures');
const { getJson, validCoordinates } = require('../lib/httpJson');
const { timeZoneFor, localDate } = require('../lib/time');
const cache = require('../lib/cache');
const { z } = require('zod');
const querySchema = z.object({year:z.string().regex(/^\d{4}$/).transform(Number).pipe(z.number().min(2000).max(2100)),month:z.string().regex(/^(0?[1-9]|1[0-2])$/).transform(Number)});
const climateHistory = async (user,start,end,zone) => {
    if (!user.cidade?.trim() || !validCoordinates(user.lat,user.lon) || start > end) return null;
    const key = `monthly:weather:v3:${user.id}:${user.lat}:${user.lon}:${zone}:${start}:${end}`;
    const stored = await cache.read(key); if (stored) return stored;
    try {
        const params = new URLSearchParams({latitude:user.lat,longitude:user.lon,start_date:start,end_date:end,daily:'precipitation_sum,et0_fao_evapotranspiration,temperature_2m_mean',timezone:zone});
        const result = await getJson(`https://archive-api.open-meteo.com/v1/archive?${params}`);
        if (!Array.isArray(result?.daily?.time) || result.error) return null;
        await cache.write(key,3600,result); return result;
    } catch { return null; }
};
const aggregateClimate = (raw,start,end) => {
    const rows = [], seen = new Set();
    const valid = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;
    for (const [i,date] of (Array.isArray(raw?.daily?.time) ? raw.daily.time : []).entries()) {
        if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < start || date > end || seen.has(date)) continue;
        seen.add(date);
        const rain = raw.daily.precipitation_sum?.[i], eto = raw.daily.et0_fao_evapotranspiration?.[i], temp = raw.daily.temperature_2m_mean?.[i];
        rows.push({data:date,chuva:valid(rain)?rain:null,et0:valid(eto)?eto:null,temp:typeof temp === 'number' && Number.isFinite(temp)?temp:null});
    }
    const expected = Math.max(0,Math.round((Date.parse(end)-Date.parse(start))/86400000)+1);
    const complete = expected > 0 && rows.length === expected && rows.every(r => r.chuva !== null && r.et0 !== null);
    return {rows,expected,covered:rows.filter(r=>r.chuva!==null&&r.et0!==null).length,complete,
        rain:complete?rows.reduce((s,r)=>s+r.chuva,0):null,eto:complete?rows.reduce((s,r)=>s+r.et0,0):null};
};
exports.getMonthlyReport = async (req,res) => {
    try {
        const parsed = querySchema.safeParse(req.query);
        if (!parsed.success) return res.status(400).json({error:parsed.error.issues[0].message});
        const user = await prisma.user.findUnique({where:{id:req.user.id}});
        if (!user) return res.status(404).json({error:'Usuário não encontrado'});
        const {year,month} = parsed.data, prefix = `${year}-${String(month).padStart(2,'0')}`;
        const zone = timeZoneFor(user), start = prefix+'-01', end = new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
        const today = localDate(Date.now(),zone);
        if (start > today) return res.status(400).json({error:'Mês futuro não permitido'});
        const limits = getCropConfig(user);
        // Prisma DateTime no Postgres é timestamp sem fuso e armazena UTC. Converter antes de agrupar.
        const rows = await prisma.$queryRaw`
            SELECT to_char(("data" AT TIME ZONE 'UTC') AT TIME ZONE ${zone}, 'YYYY-MM-DD') AS dia,
                AVG("umidade") AS avg_umidade, COUNT(*) AS total_dia,
                SUM(CASE WHEN "umidade" <= ${limits.minIdeal} THEN 1 ELSE 0 END) AS qtd_seco,
                SUM(CASE WHEN "umidade" > ${limits.maxIdeal} THEN 1 ELSE 0 END) AS qtd_encharcado,
                SUM(CASE WHEN "umidade" > ${limits.minIdeal} AND "umidade" <= ${limits.maxIdeal} THEN 1 ELSE 0 END) AS qtd_ideal
            FROM "Sensor" WHERE "userId" = ${user.id}
                AND "data" >= ${new Date(Date.parse(start)-86400000)} AND "data" < ${new Date(Date.parse(end)+2*86400000)}
                AND "data" <= ${new Date()} AND "umidade" BETWEEN 0 AND 100
                AND to_char(("data" AT TIME ZONE 'UTC') AT TIME ZONE ${zone}, 'YYYY-MM') = ${prefix}
            GROUP BY dia ORDER BY dia`;
        const decisions = await prisma.$queryRaw`
            SELECT COUNT(*) AS total FROM "AgroLog" WHERE "userId" = ${user.id} AND "recomendacao" = 'IRRIGAR'
                AND "timestamp" >= ${new Date(Date.parse(start)-86400000)} AND "timestamp" < ${new Date(Date.parse(end)+2*86400000)}
                AND to_char(("timestamp" AT TIME ZONE 'UTC') AT TIME ZONE ${zone}, 'YYYY-MM') = ${prefix}`;
        const total = rows.reduce((sum,r)=>sum+Number(r.total_dia),0);
        const pct = field => total && limits.supported ? Math.round(rows.reduce((sum,r)=>sum+Number(r[field]),0)*100/total) : null;
        const endAvailable = end < today ? end : today;
        const climate = aggregateClimate(await climateHistory(user,start,endAvailable,zone),start,endAvailable);
        const count = Number(decisions[0]?.total ?? 0);
        const context = {pctIdeal:pct('qtd_ideal'),pctDeficit:pct('qtd_seco'),chuvaAcumulada:climate.rain,et0Acumulada:climate.eto,recomendacoesEmitidas:count};
        const summary = total >= 10 ? await ia.gerarResumoMensal(context,user.id) : 'Dados insuficientes para interpretar o mês. Valores ausentes não são zero.';
        res.json({timeZone:zone,timeZoneConfigured:!!user.timeZone,coverage:{climateDays:climate.covered,expectedDays:climate.expected,complete:climate.complete,partialMonth:endAvailable!==end},
            kpis:{totalLeituras:total,pctIdeal:context.pctIdeal,pctDeficit:context.pctDeficit,pctExcesso:pct('qtd_encharcado'),chuvaAcumulada:climate.rain,et0Acumulada:climate.eto,recomendacoesCount:count,
                volumeTeorico:climate.eto !== null && user.tamanhoFazenda > 0 ? Math.round(climate.eto*user.tamanhoFazenda*10) : null,limites:limits},
            graficos:{solo:rows.map(r=>({data:r.dia,umidade:Number(r.avg_umidade)})),clima:climate.rows},ia:{resumo:summary}});
    } catch { console.error('[Monthly] Relatório indisponível.'); res.status(503).json({error:'Erro ao processar relatório mensal'}); }
};
exports.aggregateClimate = aggregateClimate;
