const { z } = require('zod');
require('dotenv').config();

const envSchema = z.object({
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

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error("❌ ERRO FATAL: Variáveis de ambiente inválidas ou ausentes:");
  console.error(_env.error.issues.map(issue => issue.path.join(".")));
  process.exit(1);
}

module.exports = _env.data;
