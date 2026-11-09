# ADR-0002 — Projeto Supabase independente para o agro

## Estado e contexto

Aceito e provisionado em 9 de novembro de 2026, após autorização do dono para provedor, organização e custo adicional zero por mês cotado pelo conector. Projeto `hidrape-agro-fase1`, referência `qexppwhxrpotzkifsgun`, região `us-east-1`.

O dono autorizou subir somente o banco novo. O projeto existente `ydlvhejbivcuwvcjxlsx` foi identificado por metadados e excluído de todos os comandos SQL/migrations. Nenhum dado, segredo ou configuração dele foi consultado ou alterado.

O agro usa conexão PostgreSQL do backend; não usa Supabase Auth nem Data API no navegador. `userId` é referência opaca validada pela API/repositório. O worker confiável precisa processar vários produtores.

## Decisão e trade-offs

- **Projeto independente**, em vez de schema no banco de login ou branch de produção: isola credenciais, conexões, papéis e migrations, ao custo de administrar outro ciclo de vida/conexão. Região igual à do projeto atual; latência do worker ainda será validada.
- **RLS em 11 tabelas e revogação de privilégios de `PUBLIC`, `anon`, `authenticated`, `service_role`**. Não introduzir acesso público nem política com `auth.uid()`, pois a autoridade de identidade está na API existente.
- **Papel `hidrape_agro_runtime` NOLOGIN**, sem senha, superuser, criação de banco/papel, replicação ou bypass de RLS. SELECT em todas; INSERT exceto no marcador; UPDATE só em `Talhao`, `AgroDevice`, `AgroDelivery`; sem DELETE/TRUNCATE/CREATE no schema `public`. Futuro login técnico receberá esse papel.
- Políticas limitadas ao papel técnico confiável, que processa produtores pelo repositório. **Não impõem isolamento de linhas por produtor a esse papel**: a responsabilidade continua nas consultas/validações da API. Acesso direto de produtores exigiria outro desenho.
- **Cinco índices de FK aditivos**, correspondentes ao schema Prisma. Não remover índices por avisos de falta de uso em um banco recém-criado.

Não conectar a aplicação como `postgres`. Não alterar credenciais, URLs de autenticação ou padrão `agro-3` da API. Nenhuma senha operacional foi criada ou redefinida nesta etapa.

## Migrations e manutenção

Fundação/permissões foram aplicadas atomicamente via Supabase; índices em outra migration. Migrations antigas intactas, dois diretórios agro novos. O histórico Supabase foi conferido. O histórico Prisma ainda requer `migrate resolve --applied` com conexão administrativa agro exclusiva, conforme o relatório. Não preencher esse controle manualmente ou repetir DDL.

## Testes, limites e rollback

Conferidos permissões, RLS e marcador. Smoke sintético validou gravação, unidades, valor/timestamp, FK cruzada, idempotência e negações de acesso. Checagem separada após ROLLBACK confirmou dez tabelas vazias, somente marcador presente e associação temporária de teste restaurada. Sem apontamentos de segurança do advisor.

SQL pelo conector não comprova TLS/conexão direta do cliente, locks entre processos, quotas/dispositivo ou worker. Manter API no legado, worker desligado e banco agro preservado até validar. Não executar down migration, apagar projeto/dados ou tocar no projeto de login.

## Referências

- [Relatório do provisionamento](../PROVISIONAMENTO_AGRO_SUPABASE.md)
- [RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Papéis e privilégios](https://supabase.com/docs/guides/database/postgres/roles)
- [PostgreSQL 17: associação e SET](https://www.postgresql.org/docs/17/sql-grant.html)
