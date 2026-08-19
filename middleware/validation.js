const { z } = require('zod');

// Schema para Registro de Usuário
const registerSchema = z.object({
    nome: z.string().min(2, 'Nome deve ter ao menos 2 caracteres').max(50),
    email: z.string().email('E-mail inválido').trim().toLowerCase(),
    senha: z.string().min(6, 'Senha deve ter ao menos 6 caracteres').max(100),
    tipoPlantacao: z.enum(['Milho', 'Feijão', 'Hortaliças', 'Cana-de-açúcar', 'Personalizado']).optional(),
    cidade: z.string().max(100).optional(),
    estado: z.string().length(2).optional()
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
    cidade: z.string().max(100).optional(),
    estado: z.string().length(2).optional(),
    endereco: z.string().max(255).optional(),
    blynkToken: z.string().max(100).optional(),
    whatsappPhone: z.string().max(20).optional(),
    callmebotApiKey: z.string().max(50).optional(),
    tamanhoFazenda: z.union([z.string(), z.number()]).optional()
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
        const errors = err.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
        }));
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
