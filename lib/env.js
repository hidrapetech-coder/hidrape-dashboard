const { z } = require('zod');
require('dotenv').config();

const envSchema = z.object({
  JWT_SECRET: z.string().min(8, "JWT_SECRET deve ter no mínimo 8 caracteres").default("default_secret_key_12345"),
  DATABASE_URL: z.string().url("DATABASE_URL inválida").default("postgresql://dummy:dummy@localhost:5432/dummy"),
  DIRECT_URL: z.string().url("DIRECT_URL inválida").default("postgresql://dummy:dummy@localhost:5432/dummy"),
  FRONTEND_URL: z.string().url("FRONTEND_URL inválida").default("http://localhost:3000"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  ENCRYPTION_KEY: z.string().length(32, "ENCRYPTION_KEY deve ter exatamente 32 caracteres (usado para AES-256)").default("12345678901234567890123456789012"),
  ALLOWED_ORIGINS: z.string().default("*"),
  REDIS_URL: z.string().url("REDIS_URL inválida (requer Upstash ou compatível)").optional(),
  NODE_ENV: z.string().default("development")
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error("❌ ERRO FATAL: Variáveis de ambiente inválidas ou ausentes:");
  console.error(_env.error.format());
  process.exit(1);
}

module.exports = _env.data;
