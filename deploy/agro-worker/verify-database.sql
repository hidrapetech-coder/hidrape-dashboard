-- Somente banco agro novo/staging. Dados sintéticos, sempre ROLLBACK.
-- Executor deve parar no primeiro erro (psql: -v ON_ERROR_STOP=1).
BEGIN;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relname='User' AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
  ) OR NOT EXISTS (
    SELECT 1 FROM public."AgroStorageIdentity" WHERE id='hidrape-agro4-dedicated'
  ) THEN RAISE EXCEPTION 'AGRO_DATABASE_MUST_BE_SEPARATE'; END IF;
END $$;
-- PG17 cria a associação administrativa com SET=false. Habilitar só nesta
-- transação de teste; o ROLLBACK também desfaz essa opção de associação.
GRANT hidrape_agro_runtime TO postgres WITH SET TRUE;
SET LOCAL ROLE hidrape_agro_runtime;
DO $$
DECLARE
  property_id text := 'synthetic-' || gen_random_uuid()::text;
  plot_id text := 'synthetic-' || gen_random_uuid()::text;
  device_id text := 'synthetic-' || gen_random_uuid()::text;
  poll_id text := 'synthetic-' || gen_random_uuid()::text;
  evaluation_id text := 'synthetic-' || gen_random_uuid()::text;
  decision_id text := 'synthetic-' || gen_random_uuid()::text;
  delivery_id text := 'synthetic-' || gen_random_uuid()::text;
  owner_id text := 'synthetic-provision-owner';
  at_time timestamptz := now();
  affected integer;
BEGIN
  INSERT INTO public."AgroProperty" (id,"userId",name) VALUES (property_id,owner_id,'Ensaio sintético');
  INSERT INTO public."Talhao" (id,"userId","propertyId",config) VALUES (plot_id,owner_id,property_id,'{}');
  INSERT INTO public."AgroDevice" (id,"userId","talhaoId","primaryKey",credential,state)
    VALUES (device_id,owner_id,plot_id,device_id,'','{}');
  INSERT INTO public."AgroPoll" (id,"userId","deviceId","scheduledAt","collectedAt",value,unit,source,quality,"communicationConfirmed","measurementConfirmed")
    VALUES (poll_id,owner_id,device_id,at_time,at_time,0,'sensor_percent','BLYNK','UNCONFIRMED',true,false);
  INSERT INTO public."AgroPoll" (id,"userId","deviceId","scheduledAt","collectedAt",value,unit,source,quality,"communicationConfirmed","measurementConfirmed")
    VALUES (gen_random_uuid()::text,owner_id,device_id,at_time,at_time,0,'sensor_percent','BLYNK','UNCONFIRMED',true,false)
    ON CONFLICT ("deviceId","scheduledAt") DO NOTHING;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'DUPLICATE_POLL_ACCEPTED'; END IF;
  INSERT INTO public."AgroReading" (id,"userId","deviceId","pollId",value,unit,source,quality,independent,reason,"observedAt","collectedAt")
    VALUES (gen_random_uuid()::text,owner_id,device_id,poll_id,0,'sensor_percent','BLYNK','UNCONFIRMED',false,'HEARTBEAT',null,at_time);
  BEGIN
    INSERT INTO public."Talhao" (id,"userId","propertyId",config) VALUES (gen_random_uuid()::text,'synthetic-other-owner',property_id,'{}');
    RAISE EXCEPTION 'CROSS_OWNER_REFERENCE_ACCEPTED';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    INSERT INTO public."AgroPoll" (id,"userId","deviceId","scheduledAt","collectedAt",value,unit,source,quality,"communicationConfirmed","measurementConfirmed")
      VALUES (gen_random_uuid()::text,owner_id,device_id,at_time+interval '5 minutes',at_time,101,'sensor_percent','BLYNK','UNCONFIRMED',true,false);
    RAISE EXCEPTION 'INVALID_PERCENT_ACCEPTED';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public."AgroReading" (id,"userId","deviceId","pollId",value,unit,source,quality,independent,reason,"observedAt","collectedAt")
      VALUES (gen_random_uuid()::text,owner_id,device_id,poll_id,30,'sensor_percent','BLYNK','VALID',true,'MEASUREMENT',null,at_time);
    RAISE EXCEPTION 'INDEPENDENT_WITHOUT_TIMESTAMP_ACCEPTED';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public."AgroEvent" (id,"userId","deviceId","idempotencyKey",type,origin,value,unit,"occurredAt","timeZone")
      VALUES (gen_random_uuid()::text,owner_id,device_id,gen_random_uuid()::text,'RAIN','USER',1,'minutes',at_time,'UTC');
    RAISE EXCEPTION 'INVALID_EVENT_UNIT_ACCEPTED';
  EXCEPTION WHEN check_violation THEN NULL; END;
  INSERT INTO public."AgroEvent" (id,"userId","deviceId","idempotencyKey",type,origin,value,unit,"occurredAt","timeZone")
    VALUES (gen_random_uuid()::text,owner_id,device_id,gen_random_uuid()::text,'RAIN','USER',0,'mm',at_time,'UTC');
  INSERT INTO public."AgroEvaluation" (id,"userId","deviceId","pollId",mode,"createdAt",payload,comparison)
    VALUES (evaluation_id,owner_id,device_id,poll_id,'shadow',at_time,'{}','{}');
  INSERT INTO public."AgroDecision" (id,"userId","deviceId","evaluationId",action,"riskLevel",kind,mode,"createdAt")
    VALUES (decision_id,owner_id,device_id,evaluation_id,'VERIFICAR_SENSOR','UNKNOWN','TRANSITION','shadow',at_time);
  INSERT INTO public."AgroDelivery" (id,"userId","deviceId","decisionId",status)
    VALUES (delivery_id,owner_id,device_id,decision_id,'PENDING');
  INSERT INTO public."AgroWorkerRun" (id,"startedAt","finishedAt",counters)
    VALUES (gen_random_uuid()::text,at_time,at_time,'{"synthetic":true}');
  UPDATE public."Talhao" SET nome='Ensaio sintético' WHERE id=plot_id;
  UPDATE public."AgroDevice" SET state='{"synthetic":true}' WHERE id=device_id;
  UPDATE public."AgroDelivery" SET status='UNKNOWN' WHERE id=delivery_id;
  BEGIN
    DELETE FROM public."AgroProperty" WHERE id='synthetic-nonexistent';
    RAISE EXCEPTION 'RUNTIME_DELETE_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public."AgroStorageIdentity" (id) VALUES ('synthetic-forbidden-marker');
    RAISE EXCEPTION 'RUNTIME_MARKER_WRITE_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public."AgroPoll" SET value=0 WHERE id=poll_id;
    RAISE EXCEPTION 'RUNTIME_POLL_UPDATE_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM id FROM public."AgroStorageIdentity";
    RAISE EXCEPTION 'ANON_TABLE_ACCESS_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM id FROM public."AgroStorageIdentity";
    RAISE EXCEPTION 'AUTHENTICATED_TABLE_ACCESS_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT 'SQL_ASSERTIONS_PASSED_ROLLBACK_FOLLOWS' AS result;
ROLLBACK;
