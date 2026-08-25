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
        statusSensor: dadosMatematicos._meta.sensorState ? dadosMatematicos._meta.sensorState.status : 'desconhecido',
        dadosValidos: dadosMatematicos._meta.sensorState ? dadosMatematicos._meta.sensorState.hasValidData : false,
        idadeDadosMinutos: dadosMatematicos._meta.sensorState ? dadosMatematicos._meta.sensorState.dataAgeMinutes : null,
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
2. Se o statusSensor for "offline" ou "stale", ou se dadosValidos for false:
   - VOCÊ NÃO PODE afirmar que a condição atual do solo está saudável, boa, ideal ou normal.
   - VOCÊ NÃO PODE afirmar umidade atual.
   - Sua única conclusão deve ser avisar que "O sensor está offline (ou desatualizado) e não há dados atuais suficientes para avaliar a condição da lavoura neste momento."
   - Você pode mencionar os dados do satélite ou probabilidade de chuva, mas deixe claro que a leitura local não é confiável no momento.
3. Não use a palavra "eu". Fale diretamente sobre o status da terra e da cultura.
4. Explique o cenário para o agricultor de forma clara, técnica porém acessível, em no máximo 3 parágrafos curtos.
5. Diferencie sempre dado observado, estimativa e dado indisponível.

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
