-- Exclusivo do NOVO projeto agro. Não executar em projeto existente de login.
-- No primeiro provisionamento, aplicar com a fundação na mesma transação.
BEGIN;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relname='User' AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
  ) OR NOT EXISTS (
    SELECT 1 FROM public."AgroStorageIdentity" WHERE id='hidrape-agro4-dedicated'
  ) THEN RAISE EXCEPTION 'AGRO_DATABASE_MUST_BE_SEPARATE'; END IF;
END $$;

-- Papel de permissões, sem senha e sem capacidade de iniciar sessão.
-- Um login técnico exclusivo poderá recebê-lo quando o worker for configurado.
CREATE ROLE hidrape_agro_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO hidrape_agro_runtime;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'AgroStorageIdentity','AgroProperty','Talhao','AgroDevice','AgroPoll','AgroReading',
    'AgroEvaluation','AgroDecision','AgroEvent','AgroDelivery','AgroWorkerRun'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role',table_name);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO hidrape_agro_runtime',table_name);
    IF table_name<>'AgroStorageIdentity' THEN
      EXECUTE format('GRANT INSERT ON TABLE public.%I TO hidrape_agro_runtime',table_name);
    END IF;
    IF table_name IN ('Talhao','AgroDevice','AgroDelivery') THEN
      EXECUTE format('GRANT UPDATE ON TABLE public.%I TO hidrape_agro_runtime',table_name);
    END IF;
    -- O backend confiável processa os usuários; não usa Supabase Auth neste banco.
    -- Escopo de usuário permanece nas consultas/validações do repositório agro.
    EXECUTE format('CREATE POLICY agro_backend_only ON public.%I FOR ALL TO hidrape_agro_runtime USING (true) WITH CHECK (true)',table_name);
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
