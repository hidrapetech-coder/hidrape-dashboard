-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- Exclusivo do banco agro dedicado. Abortar antes de qualquer DDL se houver User.
BEGIN;
DO $$ BEGIN
  IF to_regclass('public."User"') IS NOT NULL OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relname='User' AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
  ) THEN
    RAISE EXCEPTION 'AGRO_DATABASE_MUST_BE_SEPARATE';
  END IF;
END $$;

-- CreateTable
CREATE TABLE "AgroStorageIdentity" (
    "id" TEXT NOT NULL,

    CONSTRAINT "AgroStorageIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgroProperty" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgroProperty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Talhao" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "nome" TEXT NOT NULL DEFAULT 'Talhão Principal',
    "cultura" TEXT NOT NULL DEFAULT 'Personalizado',
    "tamanhoHectares" DOUBLE PRECISION,
    "config" JSONB NOT NULL,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Talhao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgroDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "talhaoId" TEXT NOT NULL,
    "primaryKey" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'BLYNK',
    "pin" TEXT NOT NULL DEFAULT 'V0',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "credential" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgroDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgroPoll" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMPTZ(3) NOT NULL,
    "collectedAt" TIMESTAMPTZ(3) NOT NULL,
    "observedAt" TIMESTAMPTZ(3),
    "value" DOUBLE PRECISION,
    "unit" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "quality" TEXT NOT NULL,
    "communicationConfirmed" BOOLEAN NOT NULL,
    "measurementConfirmed" BOOLEAN NOT NULL,

    CONSTRAINT "AgroPoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgroReading" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "unit" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "quality" TEXT NOT NULL,
    "independent" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "observedAt" TIMESTAMPTZ(3),
    "collectedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AgroReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgroEvaluation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "comparison" JSONB NOT NULL,

    CONSTRAINT "AgroEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgroDecision" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AgroDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgroEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "unit" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "timeZone" TEXT NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgroEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgroDelivery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "attemptedAt" TIMESTAMPTZ(3),
    "deliveredAt" TIMESTAMPTZ(3),

    CONSTRAINT "AgroDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgroWorkerRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "finishedAt" TIMESTAMPTZ(3) NOT NULL,
    "counters" JSONB NOT NULL,

    CONSTRAINT "AgroWorkerRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgroProperty_userId_id_key" ON "AgroProperty"("userId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Talhao_userId_id_key" ON "Talhao"("userId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AgroDevice_primaryKey_key" ON "AgroDevice"("primaryKey");

-- CreateIndex
CREATE INDEX "AgroDevice_active_userId_idx" ON "AgroDevice"("active", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AgroDevice_userId_id_key" ON "AgroDevice"("userId", "id");

-- CreateIndex
CREATE INDEX "AgroPoll_userId_collectedAt_idx" ON "AgroPoll"("userId", "collectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgroPoll_deviceId_scheduledAt_key" ON "AgroPoll"("deviceId", "scheduledAt");

-- CreateIndex
CREATE INDEX "AgroReading_userId_observedAt_idx" ON "AgroReading"("userId", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgroReading_deviceId_observedAt_key" ON "AgroReading"("deviceId", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgroEvaluation_pollId_key" ON "AgroEvaluation"("pollId");

-- CreateIndex
CREATE INDEX "AgroEvaluation_userId_createdAt_idx" ON "AgroEvaluation"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AgroDecision_userId_createdAt_idx" ON "AgroDecision"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgroDecision_deviceId_evaluationId_key" ON "AgroDecision"("deviceId", "evaluationId");

-- CreateIndex
CREATE INDEX "AgroEvent_userId_deviceId_occurredAt_idx" ON "AgroEvent"("userId", "deviceId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgroEvent_userId_idempotencyKey_key" ON "AgroEvent"("userId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "AgroDelivery_decisionId_key" ON "AgroDelivery"("decisionId");

-- AddForeignKey
CREATE UNIQUE INDEX "AgroPoll_userId_deviceId_id_key" ON "AgroPoll"("userId", "deviceId", "id");
CREATE UNIQUE INDEX "AgroEvaluation_userId_deviceId_id_key" ON "AgroEvaluation"("userId", "deviceId", "id");
CREATE UNIQUE INDEX "AgroEvaluation_userId_deviceId_pollId_key" ON "AgroEvaluation"("userId", "deviceId", "pollId");
CREATE UNIQUE INDEX "AgroDecision_userId_deviceId_id_key" ON "AgroDecision"("userId", "deviceId", "id");

ALTER TABLE "Talhao" ADD CONSTRAINT "Talhao_userId_propertyId_fkey" FOREIGN KEY ("userId", "propertyId") REFERENCES "AgroProperty"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgroDevice" ADD CONSTRAINT "AgroDevice_userId_talhaoId_fkey" FOREIGN KEY ("userId", "talhaoId") REFERENCES "Talhao"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgroPoll" ADD CONSTRAINT "AgroPoll_userId_deviceId_fkey" FOREIGN KEY ("userId", "deviceId") REFERENCES "AgroDevice"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgroReading" ADD CONSTRAINT "AgroReading_userId_deviceId_fkey" FOREIGN KEY ("userId", "deviceId") REFERENCES "AgroDevice"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgroReading" ADD CONSTRAINT "AgroReading_userId_deviceId_pollId_fkey" FOREIGN KEY ("userId", "deviceId", "pollId") REFERENCES "AgroPoll"("userId", "deviceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgroEvaluation" ADD CONSTRAINT "AgroEvaluation_userId_deviceId_fkey" FOREIGN KEY ("userId", "deviceId") REFERENCES "AgroDevice"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgroEvaluation" ADD CONSTRAINT "AgroEvaluation_userId_deviceId_pollId_fkey" FOREIGN KEY ("userId", "deviceId", "pollId") REFERENCES "AgroPoll"("userId", "deviceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgroDecision" ADD CONSTRAINT "AgroDecision_userId_deviceId_fkey" FOREIGN KEY ("userId", "deviceId") REFERENCES "AgroDevice"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgroDecision" ADD CONSTRAINT "AgroDecision_userId_deviceId_evaluationId_fkey" FOREIGN KEY ("userId", "deviceId", "evaluationId") REFERENCES "AgroEvaluation"("userId", "deviceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgroEvent" ADD CONSTRAINT "AgroEvent_userId_deviceId_fkey" FOREIGN KEY ("userId", "deviceId") REFERENCES "AgroDevice"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgroDelivery" ADD CONSTRAINT "AgroDelivery_userId_deviceId_fkey" FOREIGN KEY ("userId", "deviceId") REFERENCES "AgroDevice"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgroDelivery" ADD CONSTRAINT "AgroDelivery_userId_deviceId_decisionId_fkey" FOREIGN KEY ("userId", "deviceId", "decisionId") REFERENCES "AgroDecision"("userId", "deviceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AgroPoll" ADD CONSTRAINT "AgroPoll_value_check" CHECK ("value" IS NULL OR ("value">=0 AND "value"<=100));
ALTER TABLE "AgroReading" ADD CONSTRAINT "AgroReading_value_check" CHECK ("value" IS NULL OR ("value">=0 AND "value"<=100));
ALTER TABLE "AgroReading" ADD CONSTRAINT "AgroReading_independent_check" CHECK (NOT "independent" OR ("observedAt" IS NOT NULL AND "value" IS NOT NULL AND "quality"='VALID'));
ALTER TABLE "AgroPoll" ADD CONSTRAINT "AgroPoll_time_check" CHECK ("observedAt" IS NULL OR "observedAt"<="collectedAt");
ALTER TABLE "AgroReading" ADD CONSTRAINT "AgroReading_time_check" CHECK ("observedAt" IS NULL OR "observedAt"<="collectedAt");
ALTER TABLE "AgroEvent" ADD CONSTRAINT "AgroEvent_unit_check" CHECK (
  ("type"='RAIN' AND "unit"='mm' AND "value" IS NOT NULL AND "value">=0) OR
  ("type"='IRRIGATION' AND "unit" IN ('mm','minutes') AND "value" IS NOT NULL AND "value">=0) OR
  ("type" IN ('ACTION_TAKEN','ALERT_IGNORED') AND "unit"='none' AND "value" IS NULL)
);
ALTER TABLE "AgroEvent" ADD CONSTRAINT "AgroEvent_origin_check" CHECK ("origin" IN ('USER','DEVICE','SYSTEM'));
ALTER TABLE "AgroDecision" ADD CONSTRAINT "AgroDecision_kind_check" CHECK ("kind" IN ('TRANSITION','HEARTBEAT'));
INSERT INTO "AgroStorageIdentity" ("id") VALUES ('hidrape-agro4-dedicated');
COMMIT;

