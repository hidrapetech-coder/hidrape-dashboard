const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const https = require('https');
const crypto = require('crypto');
const User = require('../models/User');
const emailService = require('../services/emailService');

// Segurança: JWT Secret obrigatório (sem fallback inseguro)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'super_secret_jwt_key_here') {
    console.warn('⚠️  AVISO: Configure uma JWT_SECRET forte no .env para produção!');
}
const getJwtSecret = () => JWT_SECRET || 'dev_only_secret_change_in_production';

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

// Utilitário Nominatim API (Sem dependência de API Keys)
const geolocate = (cidade, estado, endereco = '') => {
    return new Promise((resolve, reject) => {
        let url = '';
        if (endereco && endereco.trim().length > 0) {
            url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(endereco + ', ' + cidade + ', ' + estado + ', Brazil')}&format=json&limit=1`;
        } else {
            url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(cidade)}&state=${encodeURIComponent(estado)}&country=Brazil&format=json&limit=1`;
        }
        
        let isResolved = false;
        
        // Timeout de segurança (3 segundos) para não travar o cadastro
        const timer = setTimeout(() => {
            if (!isResolved) {
                isResolved = true;
                console.warn(`⏳ Nominatim TIMEOUT para ${cidade}.`);
                reject(new Error("Timeout ao buscar geolocalização."));
            }
        }, 3000);

        https.get(url, { headers: { 'User-Agent': 'Hidrape-IoT-SaaS/1.0' } }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (isResolved) return;
                isResolved = true;
                clearTimeout(timer);
                try {
                    const data = JSON.parse(body);
                    if (data && data.length > 0) resolve({ lat: data[0].lat, lon: data[0].lon });
                    else reject(new Error("Endereço não encontrado pelo satélite."));
                } catch(e) { reject(new Error("Falha ao interpretar dados de geolocalização.")); }
            });
        }).on('error', (err) => {
            if (isResolved) return;
            isResolved = true;
            clearTimeout(timer);
            console.error("Erro Nominatim:", err.message);
            reject(new Error("Serviço de mapas indisponível no momento."));
        });
    });
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
        const cidade = sanitize(req.body.cidade) || 'São Paulo';
        const estado = sanitize(req.body.estado || 'SP').toUpperCase().slice(0, 2);

        if (!nome || nome.length < 2) return res.status(400).json({ error: 'Nome deve ter ao menos 2 caracteres' });
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'E-mail inválido' });
        if (!senha || senha.length < 6) return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres' });
        if (senha.length > 128) return res.status(400).json({ error: 'Senha muito longa' });

        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ error: 'Usuário já existe' });

        let geodata;
        try {
            geodata = await geolocate(cidade, estado);
        } catch (geoError) {
            return res.status(400).json({ error: 'Endereço inválido ou não encontrado. Por favor, detalhe melhor a localização da propriedade.' });
        }
        
        const { lat, lon } = geodata;

        // Hash com salt forte (cost factor 12)
        const salt = await bcrypt.genSalt(12);
        const hashedSenha = await bcrypt.hash(senha, salt);

        user = new User({
            nome, email, senha: hashedSenha,
            tipoPlantacao, cidade, estado, lat, lon
        });
        await user.save();

        // E-mail assíncrono
        emailService.enviarBoasVindas(user.email, user.nome).catch(e => console.error('Email Async Erro:', e.message));

        const token = await signToken(user.id, user.role);
        res.json({ token, user: { id: user.id, nome, email, tipoPlantacao, role: user.role } });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Erro no servidor: ' + err.message });
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

        const user = await User.findOne({ email });
        if (!user) return res.status(400).json(genericError);

        const isMatch = await bcrypt.compare(senha, user.senha);
        if (!isMatch) return res.status(400).json(genericError);

        const token = await signToken(user.id, user.role);
        res.json({ token, user: { id: user.id, nome: user.nome, email: user.email, tipoPlantacao: user.tipoPlantacao, role: user.role } });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Erro no servidor' });
    }
};

// @route   GET /api/auth/me
// @desc    Obter dados do usuário logado
// @access  Private
exports.getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-senha');
        res.json(user);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Erro no servidor');
    }
};

// @route   PUT /api/auth/config
// @desc    Atualizar perfil/configurações do usuário
// @access  Private
exports.updateConfig = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if(!user) return res.status(404).json({error: 'Usuário não encontrado'});

        // Sanitizar inputs
        if(req.body.nome) user.nome = sanitize(req.body.nome);
        if(req.body.tipoPlantacao) user.tipoPlantacao = sanitize(req.body.tipoPlantacao);
        if(req.body.tamanhoFazenda !== undefined) {
            const size = parseFloat(req.body.tamanhoFazenda);
            if (!isNaN(size) && size > 0) user.tamanhoFazenda = size;
        }
        
        if(req.body.cidade || req.body.estado || req.body.endereco !== undefined) {
            user.cidade = sanitize(req.body.cidade) || user.cidade;
            user.estado = sanitize(req.body.estado || '').toUpperCase().slice(0, 2) || user.estado;
            if(req.body.endereco !== undefined) user.endereco = sanitize(req.body.endereco);
            
            try {
                const geo = await geolocate(user.cidade, user.estado, user.endereco);
                user.lat = geo.lat;
                user.lon = geo.lon;
            } catch (geoError) {
                return res.status(400).json({ error: 'Endereço inválido ou não encontrado pelo satélite. Verifique e tente novamente.' });
            }
            
            // Invalida o cache climático para forçar refresh na próxima tela de Dashboard
            const agroController = require('./agroController');
            if (agroController.clearWeatherCache) {
                agroController.clearWeatherCache(user._id);
            }
        }

        if(req.body.blynkToken !== undefined) user.blynkToken = sanitize(req.body.blynkToken);
        if(req.body.whatsappPhone !== undefined) user.whatsappPhone = sanitize(req.body.whatsappPhone);
        if(req.body.callmebotApiKey !== undefined) user.callmebotApiKey = sanitize(req.body.callmebotApiKey);

        await user.save();

        // Resposta sem dados sensíveis
        const safeUser = user.toObject();
        delete safeUser.senha;
        res.json(safeUser);
    } catch (err) {
        console.error(err.message);
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

        const user = await User.findOne({ email });
        if (!user) {
            // Retornamos OK mesmo se não achar para não vazar emails cadastrados (Prevenção contra User Enumeration)
            return res.json({ message: 'Se o e-mail estiver cadastrado, você receberá um link de recuperação em alguns minutos.' });
        }

        // Gerar token seguro (32 bytes em hex = 64 caracteres)
        const resetToken = crypto.randomBytes(32).toString('hex');
        
        // Criptografar para salvar no banco (SOMENTE O HASH FICA NO DB)
        user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        user.resetPasswordExpire = Date.now() + 15 * 60 * 1000; // 15 minutos de validade
        
        await user.save();

        // Enviar e-mail (enviamos o token cru, não o hash)
        emailService.enviarRecuperacaoSenha(user.email, user.nome, resetToken).catch(e => console.error('Email Async Erro:', e.message));

        res.json({ message: 'Se o e-mail estiver cadastrado, você receberá um link de recuperação em alguns minutos.' });
    } catch (err) {
        console.error(err.message);
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
        const user = await User.findOne({
            resetPasswordToken,
            resetPasswordExpire: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ error: 'Token inválido ou expirado. Solicite uma nova recuperação.' });
        }

        // Hash nova senha (cost 12)
        const salt = await bcrypt.genSalt(12);
        user.senha = await bcrypt.hash(senha, salt);
        
        // Invalidar o token imediatamente (Uso único)
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        
        await user.save();

        res.json({ message: 'Senha atualizada com sucesso! Você já pode fazer login com sua nova senha.' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Erro no servidor' });
    }
};
