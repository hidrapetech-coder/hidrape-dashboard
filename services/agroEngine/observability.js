/**
 * Módulo de Observabilidade (Feedback e Logging Agronômico)
 * 
 * Salva a decisão, os fatores e as previsões no banco de dados para
 * posterior auditoria. Não há atualização automática do modelo.
 */
const prisma = require('../../lib/prisma');

const logAgroDecision = async (userId, engineData) => {
    try {
        // Extração segura de dados
        const {
            dataQuality,
            anomalies,
            predictions,
            risk,
            confidence,
            recommendation
        } = engineData;

        // O schema existente armazena o snapshot serializado em uma coluna Text.
        await prisma.agroLog.create({
            data: {
                userId: userId,
                talhaoId: null, // Pode ser preenchido caso a rota informe o talhão
                dadosUtilizados: JSON.stringify(engineData),
                dataQualityScore: dataQuality?.score || 0,
                anomalies: JSON.stringify(anomalies || []),
                previsao12h: predictions?.in12h ?? null,
                previsao24h: predictions?.in24h ?? null,
                riscoEstresse: risk?.score ?? null,
                nivelConfianca: confidence?.level || 'LOW',
                recomendacao: recommendation?.action || 'MONITORAR',
                fatoresDecisao: JSON.stringify(recommendation?.explanation || [])
            }
        });

    } catch (error) {
        // É crucial que um erro no log não derrube a API do produtor
        console.error('[Observability] Falha ao gravar decisão');
    }
};

module.exports = { logAgroDecision };
