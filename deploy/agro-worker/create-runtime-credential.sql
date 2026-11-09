-- Executar uma única vez, somente no projeto qexppwhxrpotzkifsgun.
-- Senha gerada no servidor e guardada criptografada no Vault; nunca retornada.
BEGIN;
DO $$
DECLARE generated_password text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relname='User' AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
  ) OR NOT EXISTS (
    SELECT 1 FROM public."AgroStorageIdentity" WHERE id='hidrape-agro4-dedicated'
  ) THEN RAISE EXCEPTION 'AGRO_DATABASE_MUST_BE_SEPARATE'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='hidrape_agro_app') OR
     EXISTS (SELECT 1 FROM vault.secrets WHERE name='agro_runtime_database_url') THEN
    RAISE EXCEPTION 'AGRO_CREDENTIAL_ALREADY_EXISTS_DO_NOT_ROTATE';
  END IF;
  generated_password := replace(gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text,'-','');
  CREATE ROLE hidrape_agro_app LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  EXECUTE format('ALTER ROLE hidrape_agro_app PASSWORD %L',generated_password);
  GRANT hidrape_agro_runtime TO hidrape_agro_app WITH INHERIT TRUE;
  GRANT CONNECT ON DATABASE postgres TO hidrape_agro_app;
  ALTER ROLE hidrape_agro_app SET search_path = pg_catalog, public;
  ALTER ROLE hidrape_agro_app SET statement_timeout = '10s';
  PERFORM vault.create_secret(
    'postgresql://hidrape_agro_app:' || generated_password || '@db.qexppwhxrpotzkifsgun.supabase.co:5432/postgres?sslmode=verify-full',
    'agro_runtime_database_url',
    'Conexao exclusiva do runtime agro, papel restrito. Nunca usar no banco do login.'
  );
END $$;
COMMIT;
