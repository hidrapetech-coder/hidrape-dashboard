const axios = require('axios');
const Sensor = require('../models/Sensor');
const User = require('../models/User');

// --- IA DE DIAGNÓSTICO (SISTEMA BASEADO EM REGRAS) ---
const gerarDiagnostico = (umidade, tipoPlantacao) => {
    // Definir os thresholds baseados no tipo
    let limites = { minIdeal: 40, maxIdeal: 60 }; // Default

    switch(tipoPlantacao.toLowerCase()) {
        case 'milho': limites = { minIdeal: 40, maxIdeal: 70 }; break;
        case 'feijão': limites = { minIdeal: 40, maxIdeal: 60 }; break;
        case 'hortaliças': limites = { minIdeal: 50, maxIdeal: 80 }; break;
        case 'cana-de-açúcar': limites = { minIdeal: 35, maxIdeal: 60 }; break;
    }

    let statusIA = '';
    let recomendacaoIA = '';

    if (umidade < limites.minIdeal) {
        statusIA = 'SECO';
        recomendacaoIA = `Solo da cultura de ${tipoPlantacao.toLowerCase()} com umidade abaixo do ideal. Irrigação necessária`;
    } else if (umidade > limites.maxIdeal) {
        statusIA = 'ENCHARCADO';
        recomendacaoIA = `Excesso de umidade detectado na cultura de ${tipoPlantacao.toLowerCase()}. Suspenda a irrigação`;
    } else {
        statusIA = 'IDEAL';
        recomendacaoIA = `Umidade do solo adequada para a cultura de ${tipoPlantacao.toLowerCase()}`;
    }

    return { statusIA, recomendacaoIA };
};

// --- CONTROLE DE ALERTA WHATSAPP (MEMÓRIA / TEMP) ---
// Em produção massiva seria Redis ou BD. Aqui manteremos em memória por Id
const alertasPorUser = {}; // user_id: { lastStatus: 'IDEAL', timer: 0 }

const testarEEnviarWhatsApp = async (user, umidade, statusIA, recomendacaoIA) => {
    // 1. O usuário tem whatsapp configurado?
    if(!user.whatsappPhone || !user.callmebotApiKey) return;

    // 2. Transição de status
    const historicoAlerta = alertasPorUser[user._id] || { lastStatus: null, timer: 0 };
    
    // Se mudou de estado OU se já faz muito tempo que enviou aviso (evitar spam 30min)
    const mudouEstado = historicoAlerta.lastStatus !== statusIA;
    const cooldownPassou = (Date.now() - historicoAlerta.timer) > (30 * 60 * 1000);

    // O status é critico? (Só alertar SECO ou ENCHARCADO)
    if(statusIA !== 'IDEAL' && (mudouEstado || cooldownPassou)) {
        
        try {
            const mensagem = encodeURIComponent(`🚨 ALERTA HIDRAPE [${user.tipoPlantacao}]: ${recomendacaoIA} (Umidade atual: ${umidade}%)`);
            const url = `https://api.callmebot.com/whatsapp.php?phone=${user.whatsappPhone}&text=${mensagem}&apikey=${user.callmebotApiKey}`;
            
            await axios.get(url);
            console.log(`[WhatsApp] Alerta Inteligente enviado p/ ${user.nome} - Status: ${statusIA}`);
            
            // Atualizar status
            alertasPorUser[user._id] = { lastStatus: statusIA, timer: Date.now() };

        } catch (error) {
            console.error(`[WhatsApp Error] - User ${user.nome}:`, error.message);
        }
    } else if (statusIA === 'IDEAL' && mudouEstado && historicoAlerta.lastStatus !== null) {
        // Enviar aviso de que normalizou? Pode ser muito spam.
        // Vamos setar o status e timer para não mandar msg atoa
        alertasPorUser[user._id] = { lastStatus: 'IDEAL', timer: Date.now() };
    }
};

// @route   GET /api/sensores/umidade
// @desc    Busca dado ao vivo (Blynk ou fallback global) + Grava DB + Dispara IA
// @access  Private
exports.getLiveSystem = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if(!user) return res.status(404).json({error: 'Usuário não encontrado'});

        // Determinar chave Blynk (Usar a do usuário ou fallback global)
        const token = user.blynkToken || process.env.BLYNK_TOKEN;
        const blynkUrl = process.env.BLYNK_URL || 'https://blynk.cloud/external/api/get';

        let valor = 0;
        try {
            // Verifica primeiro se o hardware está de fato online no Blynk
            const urlConn = blynkUrl.replace('/get', '/isHardwareConnected');
            const connRes = await axios.get(`${urlConn}?token=${token}`, { timeout: 3000 });
            
            // O Blynk retorna "true" ou "false" (ou booleano) indicando status da placa
            if (connRes.data === false || connRes.data === 'false') {
                throw new Error("Hardware is disconnected in Blynk cloud");
            }

            const response = await axios.get(`${blynkUrl}?token=${token}&V0`, { timeout: 4000 });
            valor = parseFloat(response.data);
            if(isNaN(valor)) {
                throw new Error("Valor retornado pelo Blynk não é numérico");
            }
        } catch(apiErr) {
            console.warn(`[Sensores] Erro ao bater Blynk (Sensor Offline). User: ${user.email}`);
            return res.status(503).json({ error: 'Sensor IoT Offline ou Sem Comunicação' });
        }

        // Lógica de Diagnóstico IA
        const { statusIA, recomendacaoIA } = gerarDiagnostico(valor, user.tipoPlantacao);

        // Salvar Leitura no DB
        const novaLeitura = new Sensor({
            userId: user._id,
            umidade: valor,
            status: statusIA
        });
        await novaLeitura.save();

        // Verificar / Disparar Whatsapp Inteligente
        testarEEnviarWhatsApp(user, valor, statusIA, recomendacaoIA);

        // Retornar ao App
        return res.json({
            umidade: valor,
            status: statusIA,
            diagnostico: recomendacaoIA,
            timestamp: novaLeitura.data
        });

    } catch (error) {
        console.error(error.message);
        res.status(500).send('Erro no servidor');
    }
};

// @route   GET /api/sensores/historico
// @desc    Obter histórico do banco de dados (paginado/filtro)
// @access  Private
exports.getHistorico = async (req, res) => {
    try {
        const userId = req.user.id;
        const limit = parseInt(req.query.limit) || 20; // Default 20 para o frontend grafico
        const page = parseInt(req.query.page) || 1;
        
        // Paginação via Mongoose
        const startIndex = (page - 1) * limit;

        const results = await Sensor.find({ userId })
            .sort({ data: -1 }) // Mais novos primeiro
            .skip(startIndex)
            .limit(limit);

        const total = await Sensor.countDocuments({ userId });

        // Para facilitar no client, revertemos para dar do mais antigo pro mais novo (para o gráfico chart.js)
        const formatados = results.map(r => ({
            umidade: r.umidade,
            status: r.status,
            timeLabel: new Date(r.data).toLocaleTimeString('pt-BR', { hour12: false }),
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
        console.error(error.message);
        res.status(500).send('Erro no servidor');
    }
};
