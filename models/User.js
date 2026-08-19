const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    nome: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    senha: {
        type: String,
        required: true
    },
    tipoPlantacao: {
        type: String,
        required: true,
        default: 'Personalizado'
    },
    cidade: {
        type: String,
        required: true,
        default: 'São Paulo'
    },
    estado: {
        type: String,
        required: true,
        default: 'SP'
    },
    lat: {
        type: String,
        required: false,
        default: '-23.5505'
    },
    lon: {
        type: String,
        required: false,
        default: '-46.6333'
    },
    tamanhoFazenda: {
        type: Number,
        required: false,
        default: 10 // Padrão de 10 Hectares
    },
    blynkToken: {
        type: String,
        required: false, // Se não tiver, usaremos o global do .env
        default: ''
    },
    whatsappPhone: {
        type: String,
        required: false,
        default: ''
    },
    callmebotApiKey: {
        type: String,
        required: false,
        default: ''
    },
    criadoEm: {
        type: Date,
        default: Date.now
    },
    resetPasswordToken: {
        type: String,
        required: false
    },
    resetPasswordExpire: {
        type: Date,
        required: false
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    }
});

module.exports = mongoose.model('User', UserSchema);
