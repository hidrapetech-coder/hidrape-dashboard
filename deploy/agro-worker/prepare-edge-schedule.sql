-- Projeto agro novo somente. Não agenda nada antes da função ser verificada.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public."AgroStorageIdentity" WHERE id='hidrape-agro4-dedicated') OR
    EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname='User' AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema')
  THEN RAISE EXCEPTION 'AGRO_DATABASE_MUST_BE_SEPARATE'; END IF;
  IF NOT EXISTS(SELECT 1 FROM vault.secrets WHERE name='agro_edge_job_secret') THEN
    PERFORM vault.create_secret(replace(gen_random_uuid()::text||gen_random_uuid()::text||gen_random_uuid()::text,'-',''),'agro_edge_job_secret','Autenticacao exclusiva Cron -> Edge agro.');
  END IF;
  IF NOT EXISTS(SELECT 1 FROM vault.secrets WHERE name='agro_worker_secret') THEN
    PERFORM vault.create_secret(replace(gen_random_uuid()::text||gen_random_uuid()::text||gen_random_uuid()::text,'-',''),'agro_worker_secret','Autorizacao API -> worker agro; nao reutilizar JWT ou AES do login.');
  END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
COMMIT;
