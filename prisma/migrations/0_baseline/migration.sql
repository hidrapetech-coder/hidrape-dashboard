-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "tipoPlantacao" TEXT NOT NULL DEFAULT 'Personalizado',
    "cidade" TEXT NOT NULL DEFAULT 'São Paulo',
    "estado" TEXT NOT NULL DEFAULT 'SP',
    "lat" DOUBLE PRECISION NOT NULL DEFAULT -23.5505,
    "lon" DOUBLE PRECISION NOT NULL DEFAULT -46.6333,
    "tamanhoFazenda" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "blynkToken" TEXT NOT NULL DEFAULT '',
    "whatsappPhone" TEXT NOT NULL DEFAULT '',
    "callmebotApiKey" TEXT NOT NULL DEFAULT '',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resetPasswordToken" TEXT,
    "resetPasswordExpire" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3),
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "role" TEXT NOT NULL DEFAULT 'user',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Talhao" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nome" TEXT NOT NULL DEFAULT 'Talhão Principal',
    "cultura" TEXT NOT NULL DEFAULT 'Personalizado',
    "tamanhoHectares" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Talhao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sensor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "talhaoId" TEXT,
    "umidade" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sensor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Log" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT,
    "rota" TEXT NOT NULL,
    "metodo" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT,
    "statusCode" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgroLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "talhaoId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dadosUtilizados" TEXT NOT NULL,
    "dataQualityScore" INTEGER NOT NULL DEFAULT 0,
    "anomalies" TEXT,
    "previsao12h" DOUBLE PRECISION,
    "previsao24h" DOUBLE PRECISION,
    "riscoEstresse" DOUBLE PRECISION,
    "nivelConfianca" TEXT NOT NULL DEFAULT 'LOW',
    "recomendacao" TEXT NOT NULL DEFAULT 'MONITORAR',
    "fatoresDecisao" TEXT NOT NULL,
    "acaoProdutor" TEXT,
    "resultadoReal" DOUBLE PRECISION,
    "erroPrevisao" DOUBLE PRECISION,

    CONSTRAINT "AgroLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelCalibration" (
    "id" TEXT NOT NULL,
    "talhaoId" TEXT NOT NULL,
    "dropRateBase" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "climateWeights" TEXT NOT NULL,
    "metricas" TEXT NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelCalibration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_resetPasswordToken_idx" ON "User"("resetPasswordToken");

-- CreateIndex
CREATE INDEX "Sensor_userId_data_idx" ON "Sensor"("userId", "data");

-- CreateIndex
CREATE INDEX "Log_userId_timestamp_idx" ON "Log"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "AgroLog_userId_timestamp_idx" ON "AgroLog"("userId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "ModelCalibration_talhaoId_key" ON "ModelCalibration"("talhaoId");

-- AddForeignKey
ALTER TABLE "Talhao" ADD CONSTRAINT "Talhao_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sensor" ADD CONSTRAINT "Sensor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sensor" ADD CONSTRAINT "Sensor_talhaoId_fkey" FOREIGN KEY ("talhaoId") REFERENCES "Talhao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Log" ADD CONSTRAINT "Log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgroLog" ADD CONSTRAINT "AgroLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgroLog" ADD CONSTRAINT "AgroLog_talhaoId_fkey" FOREIGN KEY ("talhaoId") REFERENCES "Talhao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelCalibration" ADD CONSTRAINT "ModelCalibration_talhaoId_fkey" FOREIGN KEY ("talhaoId") REFERENCES "Talhao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
