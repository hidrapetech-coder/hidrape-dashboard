const mongoose = require('mongoose');

const SensorSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    umidade: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        required: true
    },
    data: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Sensor', SensorSchema);
