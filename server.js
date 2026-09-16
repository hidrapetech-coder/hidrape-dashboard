const env = require('./lib/env');
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis').default || require('rate-limit-redis');
const redisClient = require('./lib/redis');

// Função helper para criar o RedisStore
const createRedisStore = (prefix) => {
    return new RedisStore({
        sendCommand: (...args) => redisClient.call(...args),
        prefix: prefix
    });
};

const app = express();

// ==========================================
// CAMADA DE SEGURANÇA
// ==========================================

// 1. Helmet — Headers HTTP de Segurança (CSP, HSTS, X-Frame, MIME sniffing)
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com", "https://unpkg.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://fonts.googleapis.com"],
            imgSrc: ["'self'", "data:", "blob:", "https://a.tile.openstreetmap.org", "https://b.tile.openstreetmap.org", "https://c.tile.openstreetmap.org", "https://tile.openstreetmap.org", "https://unpkg.com", "https://cdnjs.cloudflare.com", "https://server.arcgisonline.com", "https://tilecache.rainviewer.com"],
            connectSrc: ["'self'", "https://api.open-meteo.com", "https://blynk.cloud", "https://nominatim.openstreetmap.org", "https://api.rainviewer.com", "https://servicodados.ibge.gov.br"],
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
const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map(url => url.trim());

app.use(cors({
    origin: function (origin, callback) {
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

// 3. Rate Limiting — Proteção contra Brute Force (Shared Redis)
const loginLimiter = rateLimit({
    store: createRedisStore('rl:login:'),
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10, // máx 10 tentativas de login por IP
    message: { error: 'Muitas tentativas de login. Aguarde 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        // Bloqueia pelo email tentado ou pelo IP
        return req.body.email ? `${req.ip}:${req.body.email}` : req.ip;
    }
});

const registerLimiter = rateLimit({
    store: createRedisStore('rl:register:'),
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 5, 
    message: { error: 'Muitos cadastros a partir deste IP. Tente novamente mais tarde.' },
    standardHeaders: true,
    legacyHeaders: false
});

const forgotPasswordLimiter = rateLimit({
    store: createRedisStore('rl:forgot:'),
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 3,
    message: { error: 'Muitas requisições de recuperação de senha. Tente mais tarde.' },
    standardHeaders: true,
    legacyHeaders: false
});

const resetPasswordLimiter = rateLimit({
    store: createRedisStore('rl:reset:'),
    windowMs: 15 * 60 * 1000, // 15 min
    max: 5,
    message: { error: 'Muitas tentativas de alteração de senha. Tente mais tarde.' },
    standardHeaders: true,
    legacyHeaders: false
});

const apiLimiter = rateLimit({
    store: createRedisStore('rl:api:'),
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: 120, // 120 req/min para APIs em geral
    standardHeaders: true,
    legacyHeaders: false
});

// 4. Middlewares Core
app.use(express.json({ limit: '1mb' })); // Limita payload JSON (anti-DoS)
app.use(cookieParser());
app.set('trust proxy', 1); // Confia em proxies (ex: Nginx, Heroku) para capturar IPs reais de Rate Limit
app.disable('x-powered-by'); // Oculta Express

// 5. Injetar Auditoria (Globamente na API)


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

// Inicia o servidor local se não estiver na Vercel
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`=========================================`);
        console.log(`🚀 Plataforma SaaS IoT rodando na porta ${PORT}`);
        console.log(`   - Acesso em http://localhost:${PORT}`);
        console.log(`=========================================`);
    });
}

// Definição das Rotas da API
const authController = require('./controllers/authController');
const sensorController = require('./controllers/sensorController');
const agroController = require('./controllers/agroController');
const auth = require('./middleware/auth');
const { validate, registerSchema, loginSchema, updateSchema, forgotPasswordSchema, resetPasswordSchema } = require('./middleware/validation');
const checkRole = require('./middleware/checkRole');

app.post('/api/auth/register', registerLimiter, validate(registerSchema), authController.register);
app.post('/api/auth/login', loginLimiter, validate(loginSchema), authController.login);
app.post('/api/auth/logout', authController.logout);
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

const reportController = require('./controllers/reportController');
app.get('/api/reports/monthly', apiLimiter, auth, reportController.getMonthlyReport);

// 404 para API
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'Endpoint não encontrado' });
});

app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global Error Handler
app.use((err, req, res, next) => {
    if (process.env.NODE_ENV !== 'test') console.error(err.stack);
    res.status(500).json({
        error: 'Erro Interno do Servidor',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Exporta o app para ambientes Serverless (ex: Vercel)
module.exports = app;
