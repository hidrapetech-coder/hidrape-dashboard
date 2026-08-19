const mongoose = require('mongoose');

const LogSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false // Pode ser nulo para logs de login falho
    },
    email: {
        type: String,
        required: false
    },
    rota: {
        type: String,
        required: true
    },
    metodo: {
        type: String,
        required: true
    },
    ip: {
        type: String,
        required: true
    },
    userAgent: {
        type: String
    },
    statusCode: {
        type: Number
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: { expires: '30d' } // Auto-deleta logs após 30 dias (Conforme sugerido no plano)
    }
});

module.exports = mongoose.model('Log', LogSchema);
