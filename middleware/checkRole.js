module.exports = function(roleRequired) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Não autorizado' });
        }

        if (req.user.role !== roleRequired && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Acesso negado: permissão insuficiente' });
        }

        next();
    };
};
