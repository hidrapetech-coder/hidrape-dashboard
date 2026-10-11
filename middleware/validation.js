const { z } = require('zod');
const { validTimeZone } = require('../lib/time');
const timeZoneSchema = z.string().refine(validTimeZone, 'Fuso IANA inválido');
const stateSchema = z.enum(['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']);

// Schema para Registro de Usuário
const registerSchema = z.object({
    nome: z.string().min(2, 'Nome deve ter ao menos 2 caracteres').max(50),
    email: z.string().email('E-mail inválido').trim().toLowerCase(),
    senha: z.string().min(6, 'Senha deve ter ao menos 6 caracteres').max(100),
    tipoPlantacao: z.enum(['Milho', 'Feijão', 'Hortaliças', 'Cana-de-açúcar', 'Personalizado']).optional(),
    cidade: z.string().trim().min(2).max(100),
    estado: stateSchema,
    timeZone: timeZoneSchema.optional()
}).strict();

// Schema para Login
const loginSchema = z.object({
    email: z.string().email('E-mail inválido').trim().toLowerCase(),
    senha: z.string().min(1, 'Senha é obrigatória')
}).strict();

// Schema para Atualização de Perfil
const updateSchema = z.object({
    nome: z.string().min(2).max(50).optional(),
    tipoPlantacao: z.enum(['Milho', 'Feijão', 'Hortaliças', 'Cana-de-açúcar', 'Personalizado']).optional(),
    cidade: z.string().trim().min(2).max(100).optional(),
    estado: stateSchema.optional(),
    timeZone: timeZoneSchema.optional(),
    endereco: z.string().max(255).optional(),
    blynkToken: z.string().max(100).optional(),
    whatsappPhone: z.string().max(20).optional(),
    callmebotApiKey: z.string().max(50).optional(),
    minIdeal: z.number().min(0).max(100).nullable().optional(),
    maxIdeal: z.number().min(0).max(100).nullable().optional(),
    tamanhoFazenda: z.coerce.number().positive().max(100000).optional()
}).strict();

// Schema para Esqueceu a Senha
const forgotPasswordSchema = z.object({
    email: z.string().email('E-mail inválido').trim().toLowerCase()
}).strict();

// Schema para Redefinir a Senha
const resetPasswordSchema = z.object({
    token: z.string().length(64, 'Token de recuperação inválido'), // Token gerado com 32 bytes em hex = 64 chars
    senha: z.string().min(6, 'A nova senha deve ter ao menos 6 caracteres').max(128, 'Senha muito longa')
}).strict();

const validate = (schema) => (req, res, next) => {
    try {
        // Parse e valida o body (remove campos extras não definidos no schema)
        req.body = schema.parse(req.body);
        next();
    } catch (err) {
        let errors = [];
        if (err && err.issues) {
            errors = err.issues.map(e => ({
                field: e.path.join('.'),
                message: e.message
            }));
        } else if (err && err.errors && Array.isArray(err.errors)) {
            errors = err.errors.map(e => ({
                field: e.path.join('.'),
                message: e.message
            }));
        } else {
            console.error("Erro inesperado na validação:", err);
        }
        return res.status(400).json({ error: 'Falha na validação de dados', details: errors });
    }
};

module.exports = {
    validate,
    registerSchema,
    loginSchema,
    updateSchema,
    forgotPasswordSchema,
    resetPasswordSchema
};
