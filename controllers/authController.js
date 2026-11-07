const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getJson, validCoordinates } = require('../lib/httpJson');
const { getCropConfig } = require('../config/cultures');
const cache = require('../lib/cache');
const redis = require('../lib/redis');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const emailService = require('../services/emailService');
const { encrypt } = require('../lib/encryption');
const audit = require('../middleware/audit');

const env = require('../lib/env');

const getJwtSecret = () => env.JWT_SECRET;

// Helper: Assinar JWT com expiração
const signToken = (userId, role) => {
    return new Promise((resolve, reject) => {
        jwt.sign(
            { user: { id: userId, role } },
            getJwtSecret(),
            { expiresIn: '1d', algorithm: 'HS256' },
            (err, token) => err ? reject(err) : resolve(token)
        );
    });
};

// Helper: Sanitizar input de texto (anti-injection)
const sanitize = (str) => {
    if (typeof str !== 'string') return '';
    return str.trim().replace(/[<>"'`;]/g, '');
};

// DTO (Data Transfer Object) Helper: Garante que NENHUMA informação confidencial vaze ao frontend
const toSafeUser = (user) => {
    return {
        id: user.id,
        nome: user.nome,
        email: user.email,
        tipoPlantacao: user.tipoPlantacao,
        cidade: user.cidade,
        estado: user.estado,
        tamanhoFazenda: user.tamanhoFazenda,
        role: user.role,
        lat: user.lat, lon: user.lon, timeZone: user.timeZone,
        minIdeal: user.minIdeal, maxIdeal: user.maxIdeal, cropConfig: getCropConfig(user),
        hasBlynkToken: !!user.blynkToken,
        hasCallmebotApiKey: !!user.callmebotApiKey,
        hasWhatsappPhone: !!user.whatsappPhone
    };
};

// Utilitário Nominatim API (Sem dependência de API Keys)
const geolocate = async (cidade, estado, endereco = '') => {
    const params = new URLSearchParams({ q:[endereco,cidade,estado,'Brazil'].filter(Boolean).join(', '), format:'json',limit:'1' });
    const data = await getJson(`https://nominatim.openstreetmap.org/search?${params}`, { timeout:3000, headers:{'User-Agent':'Hidrape-IoT-SaaS/1.0'} });
    const rawLat = data?.[0]?.lat, rawLon = data?.[0]?.lon;
    const numeric = value => typeof value === 'number' || typeof value === 'string' && /^[-+]?\d+(?:\.\d+)?$/.test(value.trim());
    if (!numeric(rawLat) || !numeric(rawLon)) throw new Error('GEOLOCATION_UNAVAILABLE');
    const lat = Number(rawLat), lon = Number(rawLon);
    if (!validCoordinates(lat,lon)) throw new Error('GEOLOCATION_UNAVAILABLE');
    return {lat,lon};
};

// @route   POST /api/auth/register
// @desc    Cadastrar usuário
exports.register = async (req, res) => {
    try {
        // Validação de input
        const nome = sanitize(req.body.nome);
        const email = (req.body.email || '').trim().toLowerCase();
        const senha = req.body.senha || '';
        const tipoPlantacao = sanitize(req.body.tipoPlantacao) || 'Personalizado';
        const cidade = sanitize(req.body.cidade);
        if (!cidade || !req.body.estado) return res.status(400).json({error:'Cidade e UF são obrigatórias.'});
        const estado = sanitize(req.body.estado).toUpperCase().slice(0, 2);

        if (!nome || nome.length < 2) return res.status(400).json({ error: 'Nome deve ter ao menos 2 caracteres' });
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'E-mail inválido' });
        if (!senha || senha.length < 6) return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres' });
        if (senha.length > 128) return res.status(400).json({ error: 'Senha muito longa' });

        let user = await prisma.user.findUnique({ where: { email } });
        if (user) return res.status(400).json({ error: 'Usuário já existe' });

        let geodata;
        try {
            geodata = await geolocate(cidade, estado);
        } catch (geoError) {
            return res.status(400).json({ error: 'Endereço inválido ou não encontrado. Por favor, detalhe melhor a localização da propriedade.' });
        }
        
        const lat = parseFloat(geodata.lat);
        const lon = parseFloat(geodata.lon);

        // Hash com salt forte (cost factor 12)
        const salt = await bcrypt.genSalt(12);
        const hashedSenha = await bcrypt.hash(senha, salt);

        user = await prisma.user.create({
            data: {
                nome, email, senha: hashedSenha,
                tipoPlantacao, cidade, estado, lat, lon, timeZone:req.body.timeZone || null
            }
        });

        // E-mail assíncrono
        emailService.enviarBoasVindas(user.email, user.nome).catch(e => console.error('[Email] Envio indisponível.'));

        const token = await signToken(user.id, user.role);
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000 // 1 dia
        });
        res.status(201).json({ user: toSafeUser(user) });

    } catch (err) {
        console.error('[API] Operação indisponível.');
        res.status(500).json({ error: 'Erro no servidor' });
    }
};

// @route   POST /api/auth/login
// @desc    Autenticar usuário & obter token
exports.login = async (req, res) => {
    try {
        const email = (req.body.email || '').trim().toLowerCase();
        const senha = req.body.senha || '';

        if (!email || !senha) return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });

        // Mensagem genérica para não revelar se o e-mail existe
        const genericError = { error: 'Credenciais inválidas' };

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            await audit.logAudit(req, 401);
            return res.status(400).json(genericError);
        }

        if (user.lockedUntil && user.lockedUntil > new Date()) {
            await audit.logAudit(req, 403);
            return res.status(400).json({ error: 'Muitas tentativas falhas. Conta bloqueada temporariamente (15 min).' });
        }

        const isMatch = await bcrypt.compare(senha, user.senha);
        if (!isMatch) {
            const failedAttempts = user.failedLoginAttempts + 1;
            let lockedUntil = null;
            if (failedAttempts >= 5) {
                lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
            }
            await prisma.user.update({
                where: { id: user.id },
                data: { failedLoginAttempts: failedAttempts, lockedUntil }
            });
            await audit.logAudit(req, 401);
            return res.status(400).json(genericError);
        }

        if (user.failedLoginAttempts > 0) {
            await prisma.user.update({
                where: { id: user.id },
                data: { failedLoginAttempts: 0, lockedUntil: null }
            });
        }

        const token = await signToken(user.id, user.role);
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000 // 1 dia
        });
        
        req.user = user; // para o log capturar o userId
        await audit.logAudit(req, 200);
        
        res.json({ user: toSafeUser(user) });

    } catch (err) {
        console.error('[API] Operação indisponível.');
        res.status(500).json({ error: 'Erro no servidor' });
    }
};

// @route   POST /api/auth/logout
// @desc    Fazer logout (limpar cookie)
// @access  Public
exports.logout = (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Logout realizado com sucesso' });
};

// @route   GET /api/auth/me
// @desc    Obter dados do usuário logado
// @access  Private
exports.getMe = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        if(!user) return res.status(404).json({error: 'Usuário não encontrado'});
        
        res.json(toSafeUser(user));
    } catch (err) {
        console.error('[API] Operação indisponível.');
        res.status(500).send('Erro no servidor');
    }
};

// @route   PUT /api/auth/config
// @desc    Atualizar perfil/configurações do usuário
// @access  Private
exports.updateConfig = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        if(!user) return res.status(404).json({error: 'Usuário não encontrado'});

        const updatedData = {};

        // Sanitizar inputs
        if(req.body.nome) updatedData.nome = sanitize(req.body.nome);
        if(req.body.tipoPlantacao) updatedData.tipoPlantacao = sanitize(req.body.tipoPlantacao);
        if(req.body.tamanhoFazenda !== undefined) {
            const size = parseFloat(req.body.tamanhoFazenda);
            if (!isNaN(size) && size > 0) updatedData.tamanhoFazenda = size;
        }
        
        if(req.body.cidade || req.body.estado || req.body.endereco !== undefined) {
            updatedData.cidade = sanitize(req.body.cidade) || user.cidade;
            updatedData.estado = sanitize(req.body.estado || '').toUpperCase().slice(0, 2) || user.estado;
            const endereco = req.body.endereco !== undefined ? sanitize(req.body.endereco) : '';
            
            try {
                const geo = await geolocate(updatedData.cidade, updatedData.estado, endereco);
                updatedData.lat = geo.lat;
                updatedData.lon = geo.lon;
            } catch (geoError) {
                return res.status(400).json({ error: 'Endereço inválido ou não encontrado pelo satélite. Verifique e tente novamente.' });
            }
            

        }

        if(req.body.blynkToken !== undefined) updatedData.blynkToken = req.body.blynkToken ? encrypt(sanitize(req.body.blynkToken)) : "";
        if(req.body.whatsappPhone !== undefined) updatedData.whatsappPhone = sanitize(req.body.whatsappPhone);
        if(req.body.callmebotApiKey !== undefined) updatedData.callmebotApiKey = req.body.callmebotApiKey ? encrypt(sanitize(req.body.callmebotApiKey)) : "";

        for (const field of ['timeZone','minIdeal','maxIdeal']) if (req.body[field] !== undefined) updatedData[field] = req.body[field];
        const merged = {...user, ...updatedData};
        if ((merged.minIdeal != null || merged.maxIdeal != null) && !getCropConfig({...merged,tipoPlantacao:'Personalizado'}).supported) return res.status(400).json({error:'Configure limites entre 0 e 100, com mínimo menor que máximo.'});
        const updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: updatedData
        });

        await cache.remove(`sensor:health:${user.id}`, `weekly:${user.id}`, `weather:v3:${user.id}:${user.lat}:${user.lon}`);
        // Resposta sem dados sensíveis
        res.json(toSafeUser(updatedUser));
    } catch (err) {
        console.error('[API] Operação indisponível.');
        res.status(500).json({ error: 'Erro no servidor' });
    }
};

// @route   POST /api/auth/forgot-password
// @desc    Solicitar recuperação de senha
// @access  Public
exports.forgotPassword = async (req, res) => {
    try {
        const email = req.body.email;
        if (!email) return res.status(400).json({ error: 'E-mail é obrigatório' });

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            // Retornamos OK mesmo se não achar para não vazar emails cadastrados (Prevenção contra User Enumeration)
            return res.json({ message: 'Se o e-mail estiver cadastrado, você receberá um link de recuperação em alguns minutos.' });
        }

        // Gerar token seguro (32 bytes em hex = 64 caracteres)
        const resetToken = crypto.randomBytes(32).toString('hex');
        
        // Criptografar para salvar no banco (SOMENTE O HASH FICA NO DB)
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        const expireDate = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos de validade
        
        await prisma.user.update({
            where: { id: user.id },
            data: {
                resetPasswordToken: hashedToken,
                resetPasswordExpire: expireDate
            }
        });

        // Enviar e-mail (enviamos o token cru, não o hash)
        emailService.enviarRecuperacaoSenha(user.email, user.nome, resetToken).catch(e => console.error('[Email] Envio indisponível.'));

        res.json({ message: 'Se o e-mail estiver cadastrado, você receberá um link de recuperação em alguns minutos.' });
    } catch (err) {
        console.error('[API] Operação indisponível.');
        res.status(500).json({ error: 'Erro no servidor' });
    }
};

// @route   POST /api/auth/reset-password
// @desc    Redefinir a senha usando o token
// @access  Public
exports.resetPassword = async (req, res) => {
    try {
        const { token, senha } = req.body;
        
        if (!token || !senha) {
            return res.status(400).json({ error: 'Token e senha são obrigatórios' });
        }

        // Recriar o hash do token recebido
        const resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');

        // Procurar o user com esse hash e que a validade ainda não expirou
        const user = await prisma.user.findFirst({
            where: {
                resetPasswordToken,
                resetPasswordExpire: { gt: new Date() }
            }
        });

        if (!user) {
            return res.status(400).json({ error: 'Token inválido ou expirado. Solicite uma nova recuperação.' });
        }

        // Hash nova senha (cost 12)
        const salt = await bcrypt.genSalt(12);
        const hashedSenha = await bcrypt.hash(senha, salt);
        
        await prisma.user.update({
            where: { id: user.id },
            data: {
                senha: hashedSenha,
                resetPasswordToken: null,
                resetPasswordExpire: null,
                passwordChangedAt: new Date()
            }
        });

        res.json({ message: 'Senha atualizada com sucesso! Você já pode fazer login com sua nova senha.' });
    } catch (err) {
        console.error('[API] Operação indisponível.');
        res.status(500).json({ error: 'Erro no servidor' });
    }
};

// @route   DELETE /api/auth/me
// @desc    Deletar conta do usuário permanentemente (LGPD)
exports.deleteUser = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

        // Expurgo LGPD
        // 1. Apagar logs que guardam IP ou email (evitar orfandade retentora de PII).
        await prisma.log.deleteMany({
            where: {
                OR: [
                    { userId: userId },
                    { email: user.email }
                ]
            }
        });

        // 2. Apagar conta e dados em cascata (Sensores)
        await prisma.user.delete({ where: { id: userId } });

        // 3. Limpar Caches Redis atrelados
        await redis.del(`weather:${userId}`);
        await redis.del(`weekly:${userId}`);
        await redis.del(`ia:${userId}`);
        await redis.del(`sat:${userId}`);
        await redis.del(`wpp_alert:${userId}`);

        // 4. Invalidação da Sessão (quebra o cookie)
        res.clearCookie('token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
        });

        // Cria log anonimizado
        req.user = { id: 'DELETED', email: 'deleted@hidrape.lgpd' };
        await audit.logAudit(req, 200); 

        res.json({ message: 'Conta e todos os dados foram apagados permanentemente.' });
    } catch (err) {
        console.error('[API] Falha ao excluir conta');
        res.status(500).json({ error: 'Erro no servidor ao apagar conta' });
    }
};
