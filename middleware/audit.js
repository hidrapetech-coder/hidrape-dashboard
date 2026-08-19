const Log = require('../models/Log');

/**
 * Middleware para Auditoria de Acessos
 * Registra atividade do usuário de forma estruturada para segurança e depuração.
 */
module.exports = async function (req, res, next) {
    const start = Date.now();

    // Intercepta a finalização da resposta para capturar o StatusCode decorrente
    res.on('finish', async () => {
        try {
            const logData = {
                userId: req.user ? req.user.id : null,
                email: req.user ? req.user.email : (req.body ? req.body.email : null),
                rota: req.originalUrl,
                metodo: req.method,
                ip: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent'],
                statusCode: res.statusCode,
                timestamp: new Date()
            };

            // Somente registrar logs de mutação ou acessos críticos (POST, PUT, DELETE) e falhas (4xx, 5xx)
            // Para não sobrecarregar o banco com GETs de rotina em produção massiva.
            if (req.method !== 'GET' || res.statusCode >= 400 || req.originalUrl.includes('/auth/me')) {
                await Log.create(logData);
            }
        } catch (err) {
            console.error('[Audit Log Error]:', err.message);
        }
    });

    next();
};
