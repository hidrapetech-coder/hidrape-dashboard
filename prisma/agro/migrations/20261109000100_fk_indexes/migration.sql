-- Somente índices aditivos no banco agro dedicado. Schema de login intacto.
BEGIN;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relname='User' AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
  ) OR NOT EXISTS (
    SELECT 1 FROM public."AgroStorageIdentity" WHERE id='hidrape-agro4-dedicated'
  ) THEN RAISE EXCEPTION 'AGRO_DATABASE_MUST_BE_SEPARATE'; END IF;
END $$;
CREATE INDEX "Talhao_userId_propertyId_idx" ON public."Talhao"("userId","propertyId");
CREATE INDEX "AgroDevice_userId_talhaoId_idx" ON public."AgroDevice"("userId","talhaoId");
CREATE INDEX "AgroReading_userId_deviceId_pollId_idx" ON public."AgroReading"("userId","deviceId","pollId");
CREATE INDEX "AgroDecision_userId_deviceId_evaluationId_idx" ON public."AgroDecision"("userId","deviceId","evaluationId");
CREATE INDEX "AgroDelivery_userId_deviceId_decisionId_idx" ON public."AgroDelivery"("userId","deviceId","decisionId");
COMMIT;
