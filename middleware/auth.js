const jwt = require('jsonwebtoken');

const getJwtSecret = () => process.env.JWT_SECRET || 'dev_only_secret_change_in_production';

module.exports = function(req, res, next) {
    // Obter token do cabeçalho
    const token = req.header('x-auth-token') || req.header('Authorization')?.replace('Bearer ', '');

    // Verifica se não há token
    if (!token) {
        return res.status(401).json({ error: 'Nenhum token, autorização negada' });
    }

    // Validar token
    try {
        const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
        req.user = decoded.user;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Token inválido ou expirado' });
    }
};
