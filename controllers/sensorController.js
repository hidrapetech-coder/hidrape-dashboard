const prisma = require('../lib/prisma');
const { decrypt } = require('../lib/encryption');
const redis = require('../lib/redis');
const cache = require('../lib/cache');

const { getCropConfig } = require('../config/cultures');

const { evaluate } = require('../services/agroEngine');
const { parseSensorValue, createBlynkSource } = require('../services/iot/blynk');
const { sendWhatsApp } = require('../services/iot/notifications');
const agro4 = require('../services/agro4/runtime');
const rules = require('../config/agro');
const { timeZoneFor } = require('../lib/time');
const testarEEnviarWhatsApp = async (user, umidade, decision, eligible) => {
    if (!eligible || !user.whatsappPhone || !user.callmebotApiKey || !['IRRIGAR','EXCESSO_UMIDADE'].includes(decision.action)) return;
    const key = `wpp_alert:v3:${user.id}`;
    let locked = false;
    try {
        locked = await redis.set(key,decision.action,'EX',1800,'NX') === 'OK';
        if (!locked) return;
        await sendWhatsApp({whatsappPhone:user.whatsappPhone,callmebotApiKey:decrypt(user.callmebotApiKey)},decision);
    } catch { console.warn('[WhatsApp] Alerta indisponível.'); }
};

// @route   GET /api/sensores/umidade
// @desc    Busca dado ao vivo (Blynk ou fallback global) + Grava DB + Dispara IA
// @access  Private
exports.getLiveSystem = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        if(!user) return res.status(404).json({error: 'Usuário não encontrado'});

        if (agro4.isPromoted()) {
            try { return res.json(await agro4.getRuntime().live(user)); }
            catch(error) { return res.status(503).json({error:'Leitura persistida indisponível; aguarde a ingestão ou confira o dispositivo.',sensorState:error.sensorState}); }
        }

        if (!user.blynkToken) return res.status(403).json({ error: 'Configure seu Token do Blynk no dashboard para visualizar seus sensores ao vivo.' });
        const token = decrypt(user.blynkToken);
        const blynkUrl = process.env.BLYNK_URL || 'https://blynk.cloud/external/api/get';

        let valor = 0;
        try {
            const collected=await createBlynkSource({getUrl:blynkUrl,connectionTimeoutMs:3000,timeoutMs:4000,retries:0}).collect({token,pin:'V0'});
            if (collected.status!=='ONLINE') throw new Error('SENSOR_UNAVAILABLE');
            valor=collected.value;
        } catch(apiErr) {
            await cache.write(`sensor:health:${user.id}`,1800,{online:false});
            console.warn('[Sensores] Leitura inválida ou sensor indisponível.');
            return res.status(503).json({ error: 'Sensor IoT Offline ou Sem Comunicação' });
        }

        await cache.write(`sensor:health:${user.id}`,1800,{online:true});
        // Lógica de Diagnóstico IA
        const limits = getCropConfig(user);
        const statusIA = !limits.supported ? 'INDEFINIDO' : valor <= limits.minIdeal ? 'SECO' : valor > limits.maxIdeal ? 'ENCHARCADO' : 'IDEAL';

        // Desacoplamento Leitura/Escrita
        const ultimaLeitura = await prisma.sensor.findFirst({
            where: { userId: user.id },
            orderBy: { data: 'desc' }
        });

        let deveSalvar = true;
        if (ultimaLeitura) {
            const minPassados = (Date.now() - ultimaLeitura.data.getTime()) / (1000 * 60);
            const varUmidade = Math.abs(ultimaLeitura.umidade - valor);
            if (minPassados < 15 && varUmidade < 2) {
                deveSalvar = false;
            }
        }

        let timestampLeitura = ultimaLeitura ? ultimaLeitura.data : new Date();
        if (deveSalvar) {
            const novaLeitura = await prisma.sensor.create({
                data: { userId: user.id, umidade: valor, status: statusIA }
            });
            timestampLeitura = novaLeitura.data;
        }

        // Verificar / Disparar Whatsapp Inteligente (Await obrigatório em Serverless)
        const history = await prisma.sensor.findMany({where:{userId:user.id,data:{gte:new Date(Date.now()-rules.historyHours*3600000)}},orderBy:{data:'desc'},take:rules.historyLimit});
        // A leitura ao vivo também precisa passar pelo gate, mesmo quando o histórico é gravado a cada 15 minutos.
        const liveTime = Date.now();
        const liveHistory = [{data:new Date(liveTime),umidade:valor},...history.filter(r=>new Date(r.data).getTime() !== liveTime)];
        const snapshot = evaluate(user,liveHistory,null,null,liveTime);
        await testarEEnviarWhatsApp(user,valor,snapshot.engineData.recommendation,snapshot.engineData.confidence.eligible);

        // Retornar ao App
        return res.json({
            umidade: valor,
            status: snapshot.engineData.confidence.eligible ? statusIA : "INDEFINIDO",
            diagnostico: snapshot.recomendacao,
            previsao: snapshot,
            timestamp: new Date(liveTime),
            storedAt: timestampLeitura
        });

    } catch (error) {
        console.error('[API] Operação indisponível.');
        res.status(500).send('Erro no servidor');
    }
};

// @route   GET /api/sensores/historico
// @desc    Obter histórico do banco de dados (paginado/filtro)
// @access  Private
exports.getHistorico = async (req, res) => {
    try {
        const userId = req.user.id;
        const limit = Number(req.query.limit ?? 20), page = Number(req.query.page ?? 1);
        if (!Number.isInteger(limit) || limit < 1 || limit > 200 || !Number.isInteger(page) || page < 1 || page > 10000) return res.status(400).json({error:'Paginação inválida'});
        const user = await prisma.user.findUnique({where:{id:userId}});
        if (!user) return res.status(404).json({error:'Usuário não encontrado'});

        if (agro4.isPromoted()) return res.json(await agro4.getRuntime().history(user,prisma,{limit,page,zone:timeZoneFor(user)}));
        
        // Paginação via Prisma
        const startIndex = (page - 1) * limit;

        const results = await prisma.sensor.findMany({
            where: { userId },
            orderBy: { data: 'desc' }, // Mais novos primeiro
            skip: startIndex,
            take: limit
        });

        const total = await prisma.sensor.count({ where: { userId } });

        // Para facilitar no client, revertemos para dar do mais antigo pro mais novo (para o gráfico chart.js)
        const formatados = results.map(r => ({
            umidade: r.umidade,
            status: r.status,
            timeLabel: new Date(r.data).toLocaleTimeString('pt-BR', { hour12: false, timeZone:timeZoneFor(user) }),
            dataFull: r.data
        })).reverse();

        res.json({
            data: formatados,
            meta: {
                total,
                limit,
                page,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('[API] Operação indisponível.');
        res.status(500).send('Erro no servidor');
    }
};

exports.parseSensorValue = parseSensorValue;
