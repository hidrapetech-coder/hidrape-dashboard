const { z } = require('zod');
require('dotenv').config();

const envSchema = z.object({
  JWT_SECRET: z.string().min(32, "JWT_SECRET deve ter no mínimo 32 caracteres").refine(
    (val) => val !== 'super_secret_jwt_key_here' && val !== 'dev_only_secret_change_in_production',
    { message: "JWT_SECRET não pode usar os valores default vulneráveis" }
  ),
  DATABASE_URL: z.string().url("DATABASE_URL inválida"),
  DIRECT_URL: z.string().url("DIRECT_URL inválida"),
  FRONTEND_URL: z.string().url("FRONTEND_URL inválida"),
  SMTP_HOST: z.string().min(1, "SMTP_HOST ausente"),
  SMTP_PORT: z.string().min(1, "SMTP_PORT ausente"),
  SMTP_USER: z.string().min(1, "SMTP_USER ausente"),
  SMTP_PASS: z.string().min(1, "SMTP_PASS ausente"),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY ausente"),
  ENCRYPTION_KEY: z.string().length(32, "ENCRYPTION_KEY deve ter exatamente 32 caracteres (usado para AES-256)"),
  ALLOWED_ORIGINS: z.string().min(1, "ALLOWED_ORIGINS ausente"),
  NODE_ENV: z.string().default("development")
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error("❌ ERRO FATAL: Variáveis de ambiente inválidas ou ausentes:");
  console.error(_env.error.format());
  process.exit(1);
}

module.exports = _env.data;
