require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');

const app = express();

// ==========================================
// CAMADA DE SEGURANÇA
// ==========================================

// 1. Helmet — Headers HTTP de Segurança (CSP, HSTS, X-Frame, MIME sniffing)
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com", "https://unpkg.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://fonts.googleapis.com"],
            imgSrc: ["'self'", "data:", "blob:", "https://a.tile.openstreetmap.org", "https://b.tile.openstreetmap.org", "https://c.tile.openstreetmap.org", "https://tile.openstreetmap.org", "https://unpkg.com", "https://cdnjs.cloudflare.com", "https://server.arcgisonline.com", "https://tilecache.rainviewer.com"],
            connectSrc: ["'self'", "https://api.open-meteo.com", "https://blynk.cloud", "https://nominatim.openstreetmap.org", "https://api.rainviewer.com"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"]
        }
    },
    crossOriginEmbedderPolicy: false, // permite fontes externas
    crossOriginResourcePolicy: { policy: "cross-origin" }, // modificado para permitir tiles de terceiros
    referrerPolicy: { policy: "strict-origin-when-cross-origin" }
}));

// 2. CORS Restritivo
const allowedOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:3000',
    'http://localhost:3002',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3002'
].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        // Permitir requisições sem origem (como apps mobile ou curl) se em dev
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Bloqueado pelo CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'x-auth-token', 'Authorization'],
    credentials: true,
    maxAge: 86400 // Cache preflight 24h
}));

// 3. Rate Limiting — Proteção contra Brute Force
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10, // máx 10 tentativas de login por IP
    message: { error: 'Muitas tentativas de login. Aguarde 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 5, // máx 5 cadastros por hora por IP
    message: { error: 'Muitos cadastros a partir deste IP. Tente novamente mais tarde.' },
    standardHeaders: true,
    legacyHeaders: false
});

const forgotPasswordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 3, // máx 3 recuperações por hora por IP
    message: { error: 'Muitas requisições de recuperação de senha. Tente mais tarde.' },
    standardHeaders: true,
    legacyHeaders: false
});

const resetPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 5, // máx 5 tentativas de reset (caso digite senha fraca várias vezes)
    message: { error: 'Muitas tentativas de alteração de senha. Tente mais tarde.' },
    standardHeaders: true,
    legacyHeaders: false
});

const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: 120, // 120 req/min para APIs em geral
    standardHeaders: true,
    legacyHeaders: false
});

// 4. Middlewares Core
app.use(express.json({ limit: '1mb' })); // Limita payload JSON (anti-DoS)
app.use(mongoSanitize()); // Defesa ativa contra NoSQL Injection
app.set('trust proxy', 1); // Confia em proxies (ex: Nginx, Heroku) para capturar IPs reais de Rate Limit
app.disable('x-powered-by'); // Oculta Express

// 5. Injetar Auditoria (Globamente na API)
const audit = require('./middleware/audit');
app.use('/api', audit);

// Força No-Cache para arquivos HTML e JS em SPA
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
})); // Serve a SPA

const PORT = process.env.PORT || 3000;
let MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/iot-saas';

// Inicia o Banco de Dados (Nuvem ou RAM Automático)
const iniciarBanco = async () => {
    try {
        mongoose.set('strictQuery', false);
        
        const isVercel = process.env.VERCEL || process.env.NODE_ENV === 'production';
        if (isVercel && (!process.env.MONGO_URI || process.env.MONGO_URI.includes('127.0.0.1'))) {
            throw new Error("ERRO CRÍTICO: MONGO_URI não configurada! Na Vercel/Produção, você DEVE configurar a variável MONGO_URI apontando para um banco real (ex: MongoDB Atlas). O banco em memória não funciona em Serverless.");
        }

        if (MONGO_URI.includes('127.0.0.1') || MONGO_URI.includes('localhost')) {
            console.log('⏳ Iniciando instalação/boot do MongoDB Integrado...');
            const mongoServer = await MongoMemoryServer.create();
            MONGO_URI = mongoServer.getUri();
            console.log('✨ Servidor MongoDB Invisível Criado!');
        }

        await mongoose.connect(MONGO_URI);
        console.log(`✅ Conectado com Sucesso no MongoDB: ${MONGO_URI}`);

        if (!process.env.VERCEL) {
            app.listen(PORT, () => {
                console.log(`=========================================`);
                console.log(`🚀 Plataforma SaaS IoT rodando na porta ${PORT}`);
                console.log(`   - Acesso em http://localhost:${PORT}`);
                console.log(`=========================================`);
            });
        }
    } catch (err) {
        console.error('❌ Erro Crítico na inicialização do Banco:', err.message);
        if (!process.env.VERCEL) {
            process.exit(1);
        }
    }
};

iniciarBanco();

// Definição das Rotas da API
const authController = require('./controllers/authController');
const sensorController = require('./controllers/sensorController');
const agroController = require('./controllers/agroController');
const auth = require('./middleware/auth');
const { validate, registerSchema, loginSchema, updateSchema, forgotPasswordSchema, resetPasswordSchema } = require('./middleware/validation');
const checkRole = require('./middleware/checkRole');

app.post('/api/auth/register', registerLimiter, validate(registerSchema), authController.register);
app.post('/api/auth/login', loginLimiter, validate(loginSchema), authController.login);
app.post('/api/auth/forgot-password', forgotPasswordLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
app.post('/api/auth/reset-password', resetPasswordLimiter, validate(resetPasswordSchema), authController.resetPassword);
app.get('/api/auth/me', auth, authController.getMe);
app.put('/api/auth/config', auth, validate(updateSchema), authController.updateConfig);

app.get('/api/admin/stats', auth, checkRole('admin'), (req, res) => {
    res.json({ message: 'Acesso Administrativo Autorizado', data: 'Dados Sensíveis de Plataforma' });
});

app.get('/api/sensores/umidade', apiLimiter, auth, sensorController.getLiveSystem);
app.get('/api/sensores/historico', apiLimiter, auth, sensorController.getHistorico);

app.get('/api/agro/clima', apiLimiter, auth, agroController.getClimaEDashboard);
app.get('/api/agro/media-semanal', apiLimiter, auth, agroController.getMediaSemanal);
app.get('/api/agro/insights-ia', apiLimiter, auth, agroController.getInsightsIA);

app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Exporta o app para ambientes Serverless (ex: Vercel)
module.exports = app;
