const mongoose = require('mongoose');
const Sensor = require('./models/Sensor');
require('dotenv').config();

async function run() {
    let uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/iot-saas';
    // Se for mock, nao tem banco de dados de vdd ativo no terminal a menos q a app esteja rodando
    // A app roda usando MongoMemoryServer quando usa 127.0.0.1. Entao se for localhost, nao da pra acessar de fora!
    console.log("URI: ", uri);
    process.exit(0);
}
run();
