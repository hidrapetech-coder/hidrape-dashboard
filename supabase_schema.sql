-- Tabela de Usuários
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL,
    "tipoPlantacao" TEXT DEFAULT 'Personalizado',
    cidade TEXT DEFAULT 'São Paulo',
    estado TEXT DEFAULT 'SP',
    lat TEXT DEFAULT '-23.5505',
    lon TEXT DEFAULT '-46.6333',
    "tamanhoFazenda" NUMERIC DEFAULT 10,
    "blynkToken" TEXT DEFAULT '',
    "whatsappPhone" TEXT DEFAULT '',
    "callmebotApiKey" TEXT DEFAULT '',
    "criadoEm" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "resetPasswordToken" TEXT,
    "resetPasswordExpire" TIMESTAMP WITH TIME ZONE,
    role TEXT DEFAULT 'user'
);

-- Tabela de Sensores
CREATE TABLE sensors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "userId" UUID REFERENCES users(id) ON DELETE CASCADE,
    umidade NUMERIC NOT NULL,
    status TEXT NOT NULL,
    data TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Logs (Auditoria)
CREATE TABLE logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "userId" UUID REFERENCES users(id) ON DELETE SET NULL,
    email TEXT,
    rota TEXT NOT NULL,
    metodo TEXT NOT NULL,
    ip TEXT NOT NULL,
    "userAgent" TEXT,
    "statusCode" INTEGER,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
