const { GoogleGenAI, Type } = require('@google/genai');
const { z } = require('zod');
const redis = require('../lib/redis');

const culturaSchema = z.string()
    .trim()
    .max(50, "Cultura muito longa, possível injeção")
    .regex(/^[a-zA-ZáéíóúÁÉÍÓÚãõÃÕçÇ\s-]+$/, "Cultura contém caracteres inválidos")
    .catch("Mista");

// Configurações
const apiKey = process.env.GEMINI_API_KEY;
const isEnabled = process.env.GEMINI_ENABLED === 'true';
const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const TIMEOUT_MS = parseInt(process.env.GEMINI_TIMEOUT_MS) || 15000;
const MAX_CALLS = parseInt(process.env.GEMINI_MAX_CALLS_PER_USER_DAY) || 20;

let ai = null;
if (apiKey && isEnabled) {
    ai = new GoogleGenAI({ apiKey: apiKey });
} else {
    console.warn("⚠️ [IA] GEMINI_API_KEY ou GEMINI_ENABLED falso. IA Híbrida não funcionará.");
}

// Circuit Breaker State
let circuitBreaker = {
    failures: 0,
    lastFailure: null,
    isOpen: false
};

const checkCircuitBreaker = () => {
    if (!circuitBreaker.isOpen) return true;
    const now = Date.now();
    // Tenta fechar o circuito após 5 minutos
    if (now - circuitBreaker.lastFailure > 5 * 60 * 1000) {
        circuitBreaker.isOpen = false;
        circuitBreaker.failures = 0;
        console.log("[IA Circuit Breaker] Circuito fechado (restaurado). Tentando novamente.");
        return true;
    }
    return false;
};

const registerFailure = () => {
    circuitBreaker.failures += 1;
    circuitBreaker.lastFailure = Date.now();
    if (circuitBreaker.failures >= 3) {
        circuitBreaker.isOpen = true;
        console.error("[IA Circuit Breaker] Circuito ABERTO devido a múltiplas falhas. IA bloqueada temporariamente.");
    }
};

const checkRateLimit = async (userId) => {
    if (!userId) return true;
    const key = `rate_limit_ia:${userId}`;
    const calls = await redis.incr(key);
    if (calls === 1) {
        await redis.expire(key, 24 * 60 * 60); // 24h
    }
    return calls <= MAX_CALLS;
};

const runWithTimeout = (promise, ms) => {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`Timeout de ${ms}ms atingido.`));
        }, ms);
    });
    return Promise.race([
        promise,
        timeoutPromise
    ]).finally(() => clearTimeout(timeoutId));
};

/**
 * Traduz os dados matemáticos do Motor Agro para um laudo agronômico estruturado.
 */
const traduzirDiagnostico = async (payloadIA, userId) => {
    if (!ai) throw new Error('Serviço de IA Desativado ou Sem Chave.');
    if (!checkCircuitBreaker()) throw new Error("Circuit Breaker aberto (IA indisponível)");

    const isAllowed = await checkRateLimit(userId);
    if (!isAllowed) {
        console.warn(`[IA] Limite diário atingido para usuário ${userId}`);
        throw new Error("Limite diário de IA atingido.");
    }

    const { engineData, cultura, umidadeAtual, satUmidadeMacro } = payloadIA;
    const culturaSanitizada = culturaSchema.parse(cultura || 'Mista');
    
    const contextData = JSON.stringify({
        cultura: culturaSanitizada,
        umidadeSoloAtual: umidadeAtual,
        umidadeSatelite: satUmidadeMacro,
        qualidadeSensores: engineData?.dataQuality?.score,
        anomalias: engineData?.anomalies || [],
        clima: engineData?.climateAnalysis,
        previsoesFuturas: engineData?.predictions,
        decisaoMotor: engineData?.recommendation?.action,
        motivosMotor: engineData?.recommendation?.explanation
    });

    const systemInstruction = `Você é um engenheiro agrônomo sênior focado em IoT prestando consultoria rápida num dashboard.
SUAS REGRAS INEGOCIÁVEIS:
1. NUNCA invente números, previsões, temperaturas ou porcentagens que não estejam no payload fornecido.
2. Se a qualidade do sensor for baixa ou as anomalias forem severas, SUA PRIMEIRA FRASE DEVE SER UM AVISO sobre confiabilidade.
3. Não use a palavra "eu". Fale diretamente sobre o status da terra e da cultura.
4. Diferencie sempre dado observado, estimativa e dado indisponível.
5. Seu objetivo é estruturar o pensamento do Motor de Regras e traduzir para o agricultor num laudo textual coeso.`;

    const prompt = `Gere o laudo baseado nestes DADOS BRUTOS (FATO):\n${contextData}`;

    try {
        const promise = ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        laudo_textual: {
                            type: Type.STRING,
                            description: "O texto final do laudo agronômico, formatado em Markdown, com até 3 parágrafos."
                        },
                        risco_identificado: {
                            type: Type.STRING,
                            description: "Breve resumo do principal risco (se houver) ou 'Nenhum'."
                        }
                    },
                    required: ["laudo_textual", "risco_identificado"]
                }
            }
        });

        const response = await runWithTimeout(promise, TIMEOUT_MS);
        
        // Log metadata (Tokens)
        if (response.usageMetadata) {
            console.log(`[IA Token Usage] in: ${response.usageMetadata.promptTokenCount}, out: ${response.usageMetadata.candidatesTokenCount}`);
        }

        const jsonResult = JSON.parse(response.text);
        
        // Retornamos o laudo de forma transparente p/ o antigo (se for string, adaptamos)
        // O código frontend antigo quer uma string ou ele injeta a string inteira.
        // O app.js na linha 1520 faz: ${iaData.diagnostico}
        return jsonResult.laudo_textual;

    } catch (error) {
        registerFailure();
        console.error("Erro na chamada ao Gemini GenAI:", error.message);
        throw error; // Repassa pro controller usar fallback
    }
};

const gerarResumoMensal = async (contexto) => {
    if (!ai) throw new Error('Serviço de IA Desativado.');
    if (!checkCircuitBreaker()) throw new Error("Circuit Breaker aberto");

    const culturaSanitizada = culturaSchema.parse(contexto.cultura || 'Mista');

    const prompt = `DADOS OBSERVADOS/ESTIMADOS (NÃO INVENTE NADA FORA DISSO):
- Mês: ${contexto.mes}
- Cultura: ${culturaSanitizada}
- Leituras na Faixa Ideal: ${contexto.pctIdeal}%
- Leituras em Déficit (Seco): ${contexto.pctDeficit}%
- Chuva acumulada: ${contexto.chuvaAcumulada} mm
- Evapotranspiração (ET0) potencial: ${contexto.et0Acumulada} mm
- Recomendações emitidas: ${contexto.recomendacoesEmitidas}`;

    const systemInstruction = `Você é um engenheiro agrônomo especialista em irrigação.
Seu objetivo é escrever a "Leitura do Mês" para o relatório do produtor.
REGRAS:
1. Resuma focado em MANEJO HÍDRICO.
2. Forneça 1 ou 2 pontos de atenção reais baseados nos números.
3. NÃO afirme que X litros ou Y Reais foram economizados.
4. Máximo de 2 parágrafos.`;

    try {
        const promise = ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "text/plain"
            }
        });

        const response = await runWithTimeout(promise, TIMEOUT_MS);
        return response.text;
    } catch (error) {
        registerFailure();
        console.error("Erro na API do Gemini (Resumo Mensal):", error.message);
        throw new Error("Serviço de IA indisponível.");
    }
};

module.exports = {
    traduzirDiagnostico,
    gerarResumoMensal
};
