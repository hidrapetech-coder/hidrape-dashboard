const { randomUUID } = require('node:crypto');

// Todas as consultas escrevem apenas no pool agro dedicado; não importa lib/prisma.
class AgroRepository {
    constructor(pool, client=null) { this.pool=pool;this.client=client; }
    query(sql,params=[]) { return (this.client || this.pool).query(sql,params); }
    async transaction(work) {
        const client=this.client || await this.pool.connect(),repo=new AgroRepository(this.pool,client);
        try { await client.query('BEGIN');const value=await work(repo);await client.query('COMMIT');return value; }
        catch(error) { await client.query('ROLLBACK');throw error; }
        finally { if (!this.client) client.release(); }
    }
    async withDeviceLock(deviceId,work) {
        const client=await this.pool.connect();let locked=false;
        try {
            locked=(await client.query('SELECT pg_try_advisory_lock(hashtext($1),hashtext($2)) AS locked',['hidrape-agro4',deviceId])).rows[0].locked;
            return locked ? await work(new AgroRepository(this.pool,client)) : {skipped:true,reason:'BUSY'};
        } finally {
            try { if (locked) await client.query('SELECT pg_advisory_unlock(hashtext($1),hashtext($2))',['hidrape-agro4',deviceId]); }
            finally { client.release(); }
        }
    }
    async enroll(userId,config,credential) {
        return this.transaction(async repo=>{
            await repo.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',['hidrape-agro4-enroll',userId]);
            const existing=await repo.primaryDevice(userId);
            if (existing) {
                await repo.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',['hidrape-agro4',existing.id]);
                await repo.query('UPDATE "Talhao" SET "config"=$1::jsonb,"cultura"=$2 WHERE "id"=$3 AND "userId"=$4',[JSON.stringify(config),config.tipoPlantacao,existing.talhaoId,userId]);
                await repo.query('UPDATE "AgroDevice" SET "credential"=$1,"active"=true,"state"="state" || $2::jsonb WHERE "id"=$3 AND "userId"=$4',[credential,JSON.stringify({needsEvaluation:true}),existing.id,userId]);
                return {id:existing.id,talhaoId:existing.talhaoId};
            }
            const propertyId=randomUUID(),talhaoId=randomUUID(),id=randomUUID();
            await repo.query('INSERT INTO "AgroProperty" ("id","userId","name") VALUES ($1,$2,$3)',[propertyId,userId,'Propriedade Principal']);
            await repo.query('INSERT INTO "Talhao" ("id","userId","propertyId","cultura","config") VALUES ($1,$2,$3,$4,$5::jsonb)',[talhaoId,userId,propertyId,config.tipoPlantacao,JSON.stringify(config)]);
            await repo.query('INSERT INTO "AgroDevice" ("id","userId","talhaoId","primaryKey","credential","state") VALUES ($1,$2,$3,$4,$5,$6::jsonb)',[id,userId,talhaoId,`${userId}:principal`,credential,JSON.stringify({needsEvaluation:true})]);
            return {id,talhaoId};
        });
    }
    async primaryDevice(userId) {
        return (await this.query('SELECT d.*,t."config" FROM "AgroDevice" d JOIN "Talhao" t ON t."id"=d."talhaoId" AND t."userId"=d."userId" WHERE d."userId"=$1 AND d."primaryKey"=$2',[userId,`${userId}:principal`])).rows[0] || null;
    }
    async ownedDevice(userId,deviceId) {
        return (await this.query('SELECT d.*,t."config" FROM "AgroDevice" d JOIN "Talhao" t ON t."id"=d."talhaoId" AND t."userId"=d."userId" WHERE d."userId"=$1 AND d."id"=$2 AND d."active"=true',[userId,deviceId])).rows[0] || null;
    }
    async deactivate(userId) {
        return this.transaction(async repo=>{
            const device=await repo.primaryDevice(userId);
            if(!device)return false;
            await repo.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',['hidrape-agro4',device.id]);
            await repo.query('UPDATE "AgroDevice" SET "active"=false,"credential"=$1 WHERE "userId"=$2 AND "id"=$3',['',userId,device.id]);
            return true;
        });
    }
    async listDevices() {
        return (await this.query('SELECT d.*,t."config" FROM "AgroDevice" d JOIN "Talhao" t ON t."id"=d."talhaoId" AND t."userId"=d."userId" WHERE d."active"=true ORDER BY d."id"')).rows;
    }
    async hasPoll(deviceId,scheduledAt) {
        return (await this.query('SELECT 1 FROM "AgroPoll" WHERE "deviceId"=$1 AND "scheduledAt"=$2',[deviceId,scheduledAt])).rowCount>0;
    }
    async saveCollection(device,plan,scheduledAt) {
        const id=randomUUID();
        const result=await this.query('INSERT INTO "AgroPoll" ("id","userId","deviceId","scheduledAt","collectedAt","observedAt","value","unit","source","quality","communicationConfirmed","measurementConfirmed") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT ("deviceId","scheduledAt") DO NOTHING RETURNING "id"',
            [id,device.userId,device.id,scheduledAt,plan.collectedAt,plan.observedAt,plan.value,plan.unit,plan.source,plan.quality,plan.communicationConfirmed,plan.measurementConfirmed]);
        if (!result.rowCount) return null;
        if (plan.persistReading) {
            await this.query('INSERT INTO "AgroReading" ("id","userId","deviceId","pollId","value","unit","source","quality","independent","reason","observedAt","collectedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT ("deviceId","observedAt") DO NOTHING',
                [randomUUID(),device.userId,device.id,id,plan.value,plan.unit,plan.source,plan.quality,plan.independent,plan.reason,plan.reason==='MEASUREMENT' ? plan.observedAt : null,plan.collectedAt]);
        }
        await this.query('UPDATE "AgroDevice" SET "state"=$1::jsonb WHERE "id"=$2 AND "userId"=$3',[JSON.stringify({...plan.state,needsEvaluation:false}),device.id,device.userId]);
        return id;
    }
    async history(userId,deviceId,now) {
        return (await this.query('SELECT "id","value" AS "umidade","observedAt" AS "data" FROM "AgroReading" WHERE "userId"=$1 AND "deviceId"=$2 AND "independent"=true AND "quality"=$3 AND "observedAt">=$4 AND "observedAt"<=$5 AND "collectedAt"<=$5 ORDER BY "observedAt" DESC,"id" DESC LIMIT 200',
            [userId,deviceId,'VALID',new Date(now-24*3600000),new Date(now)])).rows;
    }
    async events(userId,deviceId,start,end) {
        return (await this.query('SELECT * FROM "AgroEvent" WHERE "userId"=$1 AND "deviceId"=$2 AND "occurredAt">=$3 AND "occurredAt"<=$4 AND "receivedAt"<=$4 ORDER BY "occurredAt","id"',[userId,deviceId,start,end])).rows;
    }
    async createEvent(userId,event) {
        // INSERT SELECT garante a propriedade mesmo se chamado fora do controller.
        const result=await this.query('INSERT INTO "AgroEvent" ("id","userId","deviceId","idempotencyKey","type","origin","value","unit","occurredAt","timeZone") SELECT $1,$2,d."id",$4,$5,$6,$7,$8,$9,$10 FROM "AgroDevice" d WHERE d."id"=$3 AND d."userId"=$2 AND d."active"=true ON CONFLICT ("userId","idempotencyKey") DO NOTHING RETURNING *',
            [randomUUID(),userId,event.deviceId,event.idempotencyKey,event.type,'USER',event.value,event.unit,event.occurredAt,event.timeZone]);
        if (result.rowCount) return result.rows[0];
        const prior=(await this.query('SELECT * FROM "AgroEvent" WHERE "userId"=$1 AND "idempotencyKey"=$2',[userId,event.idempotencyKey])).rows[0];
        if (prior && prior.deviceId===event.deviceId && prior.type===event.type && prior.value===event.value && prior.unit===event.unit && new Date(prior.occurredAt).getTime()===Date.parse(event.occurredAt) && prior.timeZone===event.timeZone) return prior;
        throw new Error('AGRO_EVENT_CONFLICT');
    }
    async previousDecision(userId,deviceId,mode) {
        return (await this.query('SELECT * FROM "AgroDecision" WHERE "userId"=$1 AND "deviceId"=$2 AND "mode"=$3 ORDER BY "createdAt" DESC,"id" DESC LIMIT 1',[userId,deviceId,mode])).rows[0] || null;
    }
    async saveEvaluation(device,pollId,snapshot,comparison,mode,kind,now) {
        await this.query('INSERT INTO "AgroEvaluation" ("id","userId","deviceId","pollId","mode","createdAt","payload","comparison") VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)',
            [snapshot.snapshotId,device.userId,device.id,pollId,mode,new Date(now),JSON.stringify(snapshot),JSON.stringify(comparison)]);
        if (!kind) return null;
        const decision={id:randomUUID(),action:snapshot.engineData.recommendation.action,riskLevel:snapshot.engineData.risk.level,kind};
        await this.query('INSERT INTO "AgroDecision" ("id","userId","deviceId","evaluationId","action","riskLevel","kind","mode","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
            [decision.id,device.userId,device.id,snapshot.snapshotId,decision.action,decision.riskLevel,kind,mode,new Date(now)]);
        if (mode==='agro-4' && kind==='TRANSITION' && snapshot.engineData.confidence.eligible && ['IRRIGAR','EXCESSO_UMIDADE'].includes(decision.action)) {
            await this.query('INSERT INTO "AgroDelivery" ("id","userId","deviceId","decisionId","status") VALUES ($1,$2,$3,$4,$5)',[randomUUID(),device.userId,device.id,decision.id,'PENDING']);
        }
        return decision;
    }
    async latestEvaluation(userId,deviceId,cutoverAt) {
        return (await this.query('SELECT "payload" FROM "AgroEvaluation" WHERE "userId"=$1 AND "deviceId"=$2 AND "mode"=$3 AND "createdAt">=$4 ORDER BY "createdAt" DESC LIMIT 1',[userId,deviceId,'agro-4',cutoverAt])).rows[0]?.payload || null;
    }
    async pendingDeliveries(userId,deviceId) {
        return (await this.query('SELECT d.*,e."payload" FROM "AgroDelivery" d JOIN "AgroDecision" c ON c."id"=d."decisionId" AND c."userId"=d."userId" JOIN "AgroEvaluation" e ON e."id"=c."evaluationId" AND e."userId"=d."userId" WHERE d."userId"=$1 AND d."deviceId"=$2 AND d."status" IN ($3,$4) AND d."attempts"<3 ORDER BY e."createdAt"',[userId,deviceId,'PENDING','FAILED'])).rows;
    }
    async deliveryStatus(userId,id,status,now) {
        await this.query('UPDATE "AgroDelivery" SET "status"=$1,"attempts"="attempts"+CASE WHEN $1=$2 THEN 1 ELSE 0 END,"attemptedAt"=CASE WHEN $1=$2 THEN $3 ELSE "attemptedAt" END,"deliveredAt"=CASE WHEN $1=$4 THEN $3 ELSE "deliveredAt" END WHERE "userId"=$5 AND "id"=$6',[status,'SENDING',new Date(now),'SENT',userId,id]);
    }
    async recordRun(start,end,counters) {
        await this.query('INSERT INTO "AgroWorkerRun" ("id","startedAt","finishedAt","counters") VALUES ($1,$2,$3,$4::jsonb)',[randomUUID(),new Date(start),new Date(end),JSON.stringify(counters)]);
    }
    async metrics(userId,start,end,gapMinutes=15) {
        const polls=(await this.query('SELECT ("collectedAt" AT TIME ZONE $4)::date::text AS dia,COUNT(*)::int AS coletas,COUNT(*) FILTER (WHERE "quality"=$5)::int AS sem_confirmacao,COUNT(*) FILTER (WHERE "quality" IN ($6,$7))::int AS falhas FROM "AgroPoll" WHERE "userId"=$1 AND "collectedAt">=$2 AND "collectedAt"<$3 GROUP BY 1 ORDER BY 1',[userId,start,end,'UTC','UNCONFIRMED','OFFLINE','API_ERROR'])).rows;
        const readings=(await this.query('SELECT ("collectedAt" AT TIME ZONE $4)::date::text AS dia,COUNT(*)::int AS registros,COUNT(*) FILTER (WHERE "independent")::int AS medicoes FROM "AgroReading" WHERE "userId"=$1 AND "collectedAt">=$2 AND "collectedAt"<$3 GROUP BY 1 ORDER BY 1',[userId,start,end,'UTC'])).rows;
        const gaps=(await this.query('WITH p AS (SELECT "deviceId","collectedAt",LAG("collectedAt") OVER (PARTITION BY "deviceId" ORDER BY "collectedAt") AS anterior FROM "AgroPoll" WHERE "userId"=$1 AND "collectedAt">=$2 AND "collectedAt"<$3) SELECT "deviceId",anterior,"collectedAt",EXTRACT(EPOCH FROM ("collectedAt"-anterior))/60 AS "minutes" FROM p WHERE "collectedAt"-anterior>make_interval(mins=>$4::int) ORDER BY "collectedAt"',[userId,start,end,gapMinutes])).rows;
        const currentGaps=(await this.query('SELECT d."id" AS "deviceId",MAX(p."collectedAt") AS "lastCollectionAt",EXTRACT(EPOCH FROM ($2::timestamptz-COALESCE(MAX(p."collectedAt"),d."createdAt")))/60 AS minutes FROM "AgroDevice" d LEFT JOIN "AgroPoll" p ON p."deviceId"=d."id" AND p."userId"=d."userId" AND p."collectedAt"<=$2 WHERE d."userId"=$1 AND d."active"=true GROUP BY d."id",d."createdAt" HAVING $2::timestamptz-COALESCE(MAX(p."collectedAt"),d."createdAt")>make_interval(mins=>$3::int)',[userId,end,gapMinutes])).rows;
        return {timeZone:'UTC',polls,readings,gaps,currentGaps,gapBasis:'INTERVAL_BETWEEN_POLLS_NOT_PHYSICAL_DEVICE_FAILURE'};
    }
    async readingCount(userId,cutoverAt) {
        return Number((await this.query('SELECT COUNT(*) AS total FROM "AgroReading" WHERE "userId"=$1 AND "independent"=true AND "quality"=$2 AND "observedAt">=$3',[userId,'VALID',cutoverAt])).rows[0].total);
    }
    async readingPage(userId,cutoverAt,offset,limit) {
        return (await this.query('SELECT "value" AS "umidade","observedAt" AS "data" FROM "AgroReading" WHERE "userId"=$1 AND "independent"=true AND "quality"=$2 AND "observedAt">=$3 ORDER BY "observedAt" DESC,"id" DESC OFFSET $4 LIMIT $5',[userId,'VALID',cutoverAt,offset,limit])).rows;
    }
    async aggregates(userId,cutoverAt,start,end,zone,limits,firstDate,lastDate) {
        const rows=(await this.query('SELECT to_char("observedAt" AT TIME ZONE $5,\'YYYY-MM-DD\') AS dia,AVG("value") AS avg_umidade,COUNT(*) AS total_dia,COUNT(*) FILTER (WHERE "value"<=$6) AS qtd_seco,COUNT(*) FILTER (WHERE "value">$7) AS qtd_encharcado,COUNT(*) FILTER (WHERE "value">$6 AND "value"<=$7) AS qtd_ideal FROM "AgroReading" WHERE "userId"=$1 AND "observedAt">=$2 AND "observedAt">=$3 AND "observedAt"<$4 AND "independent"=true AND "quality"=\'VALID\' GROUP BY 1 ORDER BY 1',[userId,cutoverAt,start,end,zone,limits.minIdeal,limits.maxIdeal])).rows;
        const decisions=Number((await this.query('SELECT COUNT(*) AS total FROM "AgroDecision" WHERE "userId"=$1 AND "createdAt">=$2 AND "createdAt">=$3 AND "createdAt"<$4 AND to_char("createdAt" AT TIME ZONE $5,\'YYYY-MM-DD\') BETWEEN $6 AND $7 AND "mode"=\'agro-4\' AND "kind"=\'TRANSITION\' AND "action"=\'IRRIGAR\'',[userId,cutoverAt,start,end,zone,firstDate,lastDate])).rows[0].total);
        return {rows:rows.filter(row=>row.dia>=firstDate && row.dia<=lastDate),decisions};
    }
}
module.exports={AgroRepository};
