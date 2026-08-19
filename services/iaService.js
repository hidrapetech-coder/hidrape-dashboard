const { GoogleGenerativeAI } = require('@google/generative-ai');

// Verifica chave na inicialização
const apiKey = process.env.GEMINI_API_KEY;
let genAI = null;

if (apiKey) {
    genAI = new GoogleGenerativeAI(apiKey);
} else {
    console.warn("⚠️ [IA] GEMINI_API_KEY não configurada no .env. A IA Híbrida não funcionará.");
}

/**
 * Traduz os dados matemáticos do Motor Agro para um laudo agronômico humano.
 * @param {Object} dadosMatematicos - O objeto de previsão e leitura real dos sensores e clima.
 * @param {String} cultura - O tipo de plantação do usuário.
 * @returns {String} Laudo descritivo gerado pela IA.
 */
const traduzirDiagnostico = async (dadosMatematicos, cultura) => {
    if (!genAI) {
        throw new Error('API Key do Gemini ausente.');
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Payload injetado (Apenas números REAIS, zero invenção)
    const payloadContexto = JSON.stringify({
        cultura: cultura || 'Mista',
        leituraSensorSoloAtual: dadosMatematicos._meta.umidadeAtual,
        taxaDeSecagemRealPorHora: dadosMatematicos._meta.dropRealTime,
        probabilidadeDeChuva: dadosMatematicos._meta.rainProb,
        horasRestantesAteSecarCalculado: dadosMatematicos.tempoHoras,
        sateliteNasaUmidadeMacro: dadosMatematicos._meta.satUmidadeMacro
    });

    // Auditoria contra alucinações (Log Rastreável)
    console.log(`\n[AUDIT IA] ======================================`);
    console.log(`[AUDIT IA] Dados INJETADOS no LLM (Verdade Absoluta):`);
    console.log(`[AUDIT IA] Payload: ${payloadContexto}`);
    console.log(`[AUDIT IA] ======================================\n`);

    const prompt = `
Você é um engenheiro agrônomo sênior focado em IoT prestando consultoria rápida num dashboard.
Abaixo estão os dados ESTRITAMENTE numéricos calculados pela nossa engine matemática.

DADOS BRUTOS (FATO):
${payloadContexto}

SUAS REGRAS INEGOCIÁVEIS:
1. NUNCA invente números, temperaturas ou porcentagens que não estejam no bloco DADOS BRUTOS acima.
2. Se faltar algum dado no bloco (ex: undefined ou null), diga explicitamente: "Faltam dados de X no momento" e não invente valores.
3. Não use a palavra "eu". Fale diretamente sobre o status da terra e da cultura.
4. Explique o cenário para o agricultor de forma clara, técnica porém acessível, em no máximo 3 parágrafos curtos.
5. Foco principal: A terra está bebendo a água rápido demais? Há risco iminente? A chuva vai salvar a lavoura ou precisa ligar o pivô de irrigação?

Traduza os dados para um laudo conciso e utilitário agora:
`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Erro na API do Gemini:", error.message);
        throw new Error("Serviço de IA Generativa temporariamente indisponível.");
    }
};

module.exports = {
    traduzirDiagnostico
};
