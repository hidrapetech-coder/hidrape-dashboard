const jwt = require('jsonwebtoken');

const env = require('../lib/env');

const getJwtSecret = () => env.JWT_SECRET;

module.exports = async function(req, res, next) {
    // Obter token do cookie (novo padrão) ou cabeçalhos
    const token = req.cookies?.token || req.header('x-auth-token') || req.header('Authorization')?.replace('Bearer ', '');

    // Verifica se não há token
    if (!token) {
        return res.status(401).json({ error: 'Nenhum token, autorização negada' });
    }

    // Validar token
    try {
        const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
        req.user = decoded;

        const prisma = require('../lib/prisma');
        const dbUser = await prisma.user.findUnique({ where: { id: req.user.id } });
        
        if (dbUser && dbUser.passwordChangedAt) {
            const changedTimestamp = parseInt(dbUser.passwordChangedAt.getTime() / 1000, 10);
            if (decoded.iat < changedTimestamp) {
                return res.status(401).json({ error: 'Token revogado por troca de senha' });
            }
        }

        next();
    } catch (err) {
        res.status(401).json({ error: 'Token inválido ou expirado' });
    }
};
