const prisma = require('../lib/prisma');

/**
 * Função utilitária para Auditoria de Acessos Críticos
 * Registra atividade do usuário de forma estruturada para segurança e depuração.
 * Deve ser invocada com await antes da resposta.
 */
exports.logAudit = async (req, statusCode) => {
    try {
        const logData = {
            userId: req.user ? req.user.id : null,
            email: req.user ? req.user.email : (req.body ? req.body.email : null),
            rota: req.originalUrl,
            metodo: req.method,
            ip: req.ip || req.connection?.remoteAddress || '127.0.0.1',
            userAgent: req.headers['user-agent'] || 'Unknown',
            statusCode: statusCode,
            timestamp: new Date()
        };

        await prisma.log.create({ data: logData });
    } catch (err) {
        console.error('[Audit Log Error]:', err.message);
    }
};
