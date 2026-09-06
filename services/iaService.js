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
    const engineData = dadosMatematicos.engineData || {};
    
    const payloadContexto = JSON.stringify({
        cultura: cultura || 'Mista',
        leituraSensorSoloAtual: dadosMatematicos._meta?.sensorState?.umidadeAtual || 'Indisponível',
        statusSensor: engineData.dataQuality?.sensorStatus || 'desconhecido',
        nivelQualidadeDados: engineData.dataQuality?.level || 'LOW',
        confiancaDaAnalise: engineData.confidence?.level || 'LOW',
        riscoDeEstresse: engineData.risk?.score || 0,
        previsoesFuturas: engineData.predictions || null,
        anomalias: engineData.anomalies || [],
        recomendacaoMotorAgro: engineData.recommendation?.action || 'Desconhecida',
        motivosDaRecomendacao: engineData.recommendation?.explanation || []
    });

    // Auditoria contra alucinações (Log Rastreável)
    console.log(`\n[AUDIT IA] ======================================`);
    console.log(`[AUDIT IA] Dados INJETADOS no LLM (Verdade Absoluta):`);
    console.log(`[AUDIT IA] Payload: ${payloadContexto}`);
    console.log(`[AUDIT IA] ======================================\n`);

    const prompt = `
Você é um engenheiro agrônomo sênior focado em IoT prestando consultoria rápida num dashboard.
Abaixo estão os dados ESTRITAMENTE estruturados calculados pelo nosso Motor Agro.

DADOS BRUTOS (FATO):
${payloadContexto}

SUAS REGRAS INEGOCIÁVEIS:
1. NUNCA invente números, previsões, temperaturas ou porcentagens que não estejam no bloco DADOS BRUTOS acima.
2. Se o nivelQualidadeDados for "INVALID" ou "LOW", ou a confiancaDaAnalise for "LOW":
   - SUA PRIMEIRA FRASE DEVE SER UM AVISO informando que os dados são limitados ou de baixa confiança.
   - VOCÊ NÃO PODE afirmar com certeza a condição atual do solo ou recomendar irrigação com segurança.
   - Sua única conclusão deve ser avisar o agricultor para verificar o sensor físico e usar a experiência em campo.
3. Não use a palavra "eu". Fale diretamente sobre o status da terra e da cultura.
4. Explique o cenário (motivosDaRecomendacao) de forma clara, técnica porém acessível, em no máximo 3 parágrafos curtos.
5. Diferencie sempre dado observado, estimativa e dado indisponível.

Traduza esses resultados analíticos e preditivos para um laudo agronômico prático agora:
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

const gerarResumoMensal = async (contexto) => {
    if (!genAI) {
        throw new Error('API Key do Gemini ausente.');
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
Você é um engenheiro agrônomo especialista em irrigação e análise de dados gerenciais.
Seu objetivo é escrever a "Leitura do Mês" para o relatório do produtor. 

DADOS OBSERVADOS/ESTIMADOS (NÃO INVENTE NADA FORA DISSO):
- Mês: ${contexto.mes}
- Cultura: ${contexto.cultura}
- Leituras na Faixa Ideal: ${contexto.pctIdeal}%
- Leituras em Déficit (Seco): ${contexto.pctDeficit}%
- Chuva acumulada: ${contexto.chuvaAcumulada} mm
- Evapotranspiração (ET0) potencial: ${contexto.et0Acumulada} mm
- Recomendações emitidas (períodos de alerta): ${contexto.recomendacoesEmitidas}

REGRAS:
1. Resuma como foi o mês focado em MANEJO HÍDRICO (O que aconteceu, o que influenciou).
2. Forneça 1 ou 2 pontos de atenção baseados nesses números.
3. NÃO afirme que X litros ou Y Reais foram economizados, nem cite m³ consumidos, pois não medimos isso.
4. Mantenha o tom profissional, direto e em no máximo 2 parágrafos.
`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Erro na API do Gemini (Resumo Mensal):", error.message);
        throw new Error("Serviço de IA Generativa indisponível.");
    }
};

module.exports = {
    traduzirDiagnostico,
    gerarResumoMensal
};
