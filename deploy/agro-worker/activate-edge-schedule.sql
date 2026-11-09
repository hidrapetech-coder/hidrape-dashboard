-- Somente depois de verificar a função agro-worker no projeto agro novo.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public."AgroStorageIdentity" WHERE id='hidrape-agro4-dedicated') OR
    EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname='User' AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema')
  THEN RAISE EXCEPTION 'AGRO_DATABASE_MUST_BE_SEPARATE'; END IF;
END $$;
SELECT cron.schedule('hidrape-agro-shadow-5min','*/5 * * * *',
  $job$SELECT net.http_post(
    url:='https://qexppwhxrpotzkifsgun.supabase.co/functions/v1/agro-worker',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='agro_edge_job_secret')),
    body:='{}'::jsonb,timeout_milliseconds:=120000
  );$job$);
COMMIT;
