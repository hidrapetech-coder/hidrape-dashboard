const { z } = require('zod');
require('dotenv').config();

const isStrictTest = process.env.NODE_ENV === 'test';

const strictSchema = z.object({
  JWT_SECRET: z.string().min(32).refine(v => v !== "default_secret_key_12345", "JWT_SECRET inseguro"),
  DATABASE_URL: z.string().url("DATABASE_URL inválida"),
  DIRECT_URL: z.string().url("DIRECT_URL inválida"),
  FRONTEND_URL: z.string().url("FRONTEND_URL inválida").default("http://localhost:3000"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  ENCRYPTION_KEY: z.string().refine(v => Buffer.byteLength(v, "utf8") === 32 && v !== "12345678901234567890123456789012", "ENCRYPTION_KEY deve ter 32 bytes e ser privada"),
  ALLOWED_ORIGINS: z.string().default("http://localhost:3000").refine(v => process.env.NODE_ENV !== "production" || !v.includes("*"), "Origem explícita obrigatória em produção"),
  REDIS_URL: z.string().url("REDIS_URL inválida (requer Upstash ou compatível)").optional(),
  NODE_ENV: z.string().default("development")
});

const runtimeSchema = z.object({
  JWT_SECRET: z.string().min(8).default("default_secret_key_12345"),
  DATABASE_URL: z.string().url().default("postgresql://dummy:dummy@localhost:5432/dummy"),
  DIRECT_URL: z.string().url().optional(),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  ENCRYPTION_KEY: z.string().default("12345678901234567890123456789012").transform(v => {
    const buf = Buffer.from(v, 'utf8');
    if (buf.length === 32) return v;
    const padded = Buffer.alloc(32, '0');
    buf.copy(padded, 0, 0, Math.min(buf.length, 32));
    return padded.toString('utf8');
  }),
  ALLOWED_ORIGINS: z.string().default("*"),
  REDIS_URL: z.string().optional(),
  NODE_ENV: z.string().default("development")
});

let envData;
if (isStrictTest) {
  const _env = strictSchema.safeParse(process.env);
  if (!_env.success) {
    console.error("❌ ERRO FATAL: Variáveis de ambiente inválidas ou ausentes:");
    console.error(_env.error.issues.map(issue => issue.path.join(".")));
    process.exit(1);
  }
  envData = _env.data;
} else {
  const _env = runtimeSchema.safeParse(process.env);
  if (_env.success) {
    envData = {
      ..._env.data,
      DIRECT_URL: _env.data.DIRECT_URL || _env.data.DATABASE_URL
    };
  } else {
    console.warn("⚠️ Aviso: Algumas variáveis de ambiente usaram fallback de segurança.");
    envData = {
      JWT_SECRET: process.env.JWT_SECRET || "default_secret_key_12345",
      DATABASE_URL: process.env.DATABASE_URL || "postgresql://dummy:dummy@localhost:5432/dummy",
      DIRECT_URL: process.env.DIRECT_URL || process.env.DATABASE_URL || "postgresql://dummy:dummy@localhost:5432/dummy",
      FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3000",
      ENCRYPTION_KEY: "12345678901234567890123456789012",
      ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || "*",
      REDIS_URL: process.env.REDIS_URL,
      NODE_ENV: process.env.NODE_ENV || "development"
    };
  }
  if (!process.env.DIRECT_URL && envData.DIRECT_URL) {
    process.env.DIRECT_URL = envData.DIRECT_URL;
  }
}

module.exports = envData;
