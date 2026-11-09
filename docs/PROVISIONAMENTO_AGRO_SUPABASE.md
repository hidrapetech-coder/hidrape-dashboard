# Provisionamento agro Supabase — 9 de novembro de 2026

## Recurso criado

| Campo | Resultado |
|---|---|
| Projeto | `hidrape-agro-fase1` |
| Referência | `qexppwhxrpotzkifsgun` |
| Organização autorizada | `hidrapetech-coder's Org` (`dkedamsvpjjtdplfmzus`) |
| Região / estado | `us-east-1` / `ACTIVE_HEALTHY` |
| PostgreSQL informado pelo provedor | `17.11.0.018` |
| Cotação aceita | Custo adicional zero por mês para criação; não é promessa sobre uso/alterações futuras. |
| Painel | [Abrir projeto agro](https://supabase.com/dashboard/project/qexppwhxrpotzkifsgun) |
| Host direto informado | `db.qexppwhxrpotzkifsgun.supabase.co`, sem credenciais neste relatório. |

O projeto existente `ydlvhejbivcuwvcjxlsx` foi visto apenas na listagem de metadados da conta para evitar confusão de destino. **Nenhuma consulta SQL, migration, alteração de configuração ou acesso a dados foi enviado a ele.** Nenhum `.env`, segredo ou credencial existente foi lido. API/worker/Vercel não foram configurados ou implantados nesta etapa.

## Estrutura e permissões

Onze tabelas: `AgroStorageIdentity`, `AgroProperty`, `Talhao`, `AgroDevice`, `AgroPoll`, `AgroReading`, `AgroEvaluation`, `AgroDecision`, `AgroEvent`, `AgroDelivery`, `AgroWorkerRun`.

- Fundação em `prisma/agro/migrations/20261108000000_phase1/migration.sql`, preservada.
- Permissões novas em `prisma/agro/migrations/20261109000000_private_runtime/migration.sql`.
- Cinco índices novos em `prisma/agro/migrations/20261109000100_fk_indexes/migration.sql`, refletidos no schema agro.
- RLS nas 11 tabelas; `PUBLIC`, `anon`, `authenticated`, `service_role` sem privilégios de dados nelas.
- Papel técnico `hidrape_agro_runtime` **NOLOGIN**, sem senha ou atributos administrativos. SELECT em todas; INSERT exceto marcador; UPDATE só em `Talhao`, `AgroDevice`, `AgroDelivery`; sem DELETE/TRUNCATE/CREATE no schema.

Esse papel representa permissões do backend confiável, não uma credencial de conexão já pronta. Escopo de produtor permanece na API/repositório. Nenhum acesso de frontend direto foi habilitado; worker desligado.

## Histórico remoto verificado

| Versão Supabase | Nome | Conteúdo |
|---|---|---|
| `20261109145952` | `agro_phase1_foundation_private_runtime` | Fundação + permissões em uma transação, sem intervalo de tabelas publicamente acessíveis. |
| `20261109150142` | `agro_phase1_fk_indexes` | Cinco índices cobrindo os sete avisos iniciais de FK sem índice. |

Os limites BEGIN/COMMIT dos arquivos de fundação/permissões foram agrupados em uma transação. Nenhum schema ou migration de autenticação foi aplicado.

## Verificações SQL reais

| Verificação | Resultado |
|---|---|
| Estado inicial | `public` vazio, sem migrations; referência/nome/organização novos conferidos. |
| Marcador / `User` | Marcador `hidrape-agro4-dedicated` presente; nenhuma tabela `User` no banco agro. |
| Permissões/RLS | Conferidos 11 conjuntos de privilégios e 11 políticas; papéis públicos sem SELECT/INSERT/UPDATE/DELETE. |
| Papel runtime | Sem LOGIN, superuser, criação de banco/papel, replicação, bypass; sem DELETE/TRUNCATE/CREATE. |
| Smoke `deploy/agro-worker/verify-database.sql` | Gravações/updates permitidos, poll duplicado ignorado, FK cruzada rejeitada, percentual/timestamp/unidade inválidos bloqueados, marcador e poll imutáveis pelo runtime, DELETE e leituras públicas negados. |
| Após ROLLBACK | Dez tabelas de dados com zero linhas; apenas uma linha em `AgroStorageIdentity`. Opção temporária SET da associação de teste restaurada para false. |
| Advisor de segurança | Nenhum apontamento. |
| Advisor de desempenho | Avisos de FK resolvidos. Restam nove INFO de índices não usados em banco sem carga; nenhum índice removido. [Orientação do provedor](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index). |

A primeira execução do smoke foi recusada antes de inserir dados: PG17 criou a associação administrativa com `SET=false`. O script passou a habilitar SET apenas dentro da transação, revertendo também essa opção. O executor MCP interrompeu a tentativa no erro. Outros clientes devem parar em erro (por exemplo `psql -v ON_ERROR_STOP=1`). O indicador de asserções aprovadas aparece antes do ROLLBACK; o estado final foi verificado por outra consulta.

Revisão independente estática corrigiu esse indicador, que antes poderia aparecer após erro em clientes que continuam a execução. Não restaram bloqueadores no escopo revisado.

## Histórico Prisma antes de migrate deploy futuro

O histórico remoto aplicado é do Supabase; não foi usado `prisma migrate deploy` nem criada manualmente a tabela de histórico Prisma. **Não repetir o DDL no banco já provisionado.**

Após configurar uma conexão administrativa **exclusiva do agro**, verificar novamente o destino e usar o procedimento oficial de reconciliação em ambiente isolado, sem `.env` do servidor. Comandos futuros, **não executados**:

```sh
./node_modules/.bin/prisma migrate resolve --applied 20261108000000_phase1 --schema prisma/agro/schema.prisma
./node_modules/.bin/prisma migrate resolve --applied 20261109000000_private_runtime --schema prisma/agro/schema.prisma
./node_modules/.bin/prisma migrate resolve --applied 20261109000100_fk_indexes --schema prisma/agro/schema.prisma
./node_modules/.bin/prisma migrate status --schema prisma/agro/schema.prisma
```

Usar somente `AGRO_DATABASE_URL` administrativo do destino agro confirmado. Nunca usar `DATABASE_URL`/`DIRECT_URL` do login como alternativa. Futuras migrations devem escolher um histórico consistente e preservar grants/RLS. Papel e políticas já existem; não reaplicar a migration de permissões. [Referência oficial do procedimento](https://www.prisma.io/docs/orm/prisma-migrate/workflows/baselining).

## Próximos passos operacionais

1. Criar/configurar com segurança login técnico exclusivo, conceder-lhe o papel runtime com herança apropriada e obter a conexão direta/sessão nova. Nenhuma senha foi gerada, redefinida, lida ou exposta pelo agente.
2. Validar TLS, conexão do processo, permissões e locks entre sessões. O SQL do conector não certifica isso.
3. Configurar `AGRO_DATABASE_URL`, `AGRO_DATABASE_ACK`, segredo, API e hospedagem do worker; reconciliar o histórico Prisma administrativo acima.
4. Executar cadastro, coleta, falhas, concorrência e observação em sombra. Blynk continua sem timestamp de medição confirmado; não contornar esse bloqueio para recomendar manejo.

O banco está provisionado e estruturado, ainda sem leituras operacionais. API padrão `agro-3`, dados existentes no fluxo legado. Nenhuma mudança no banco do login.

Rollback: manter worker desligado/API no legado e preservar banco/evidências. Não fazer down migration, apagar projeto ou dados. [ADR-0002](adr/0002-postgresql-agro-supabase-privado.md).

## Verificações locais após o provisionamento

Implementação versionada no commit local `eef5057`: duas migrations agro novas, cinco índices no schema e smoke SQL. Documentação desta etapa está em commit separado, na mesma branch dedicada; nenhuma alteração na branch principal.

- `npm test -- --configLoader native --no-cache --no-fsModuleCache --pool=threads`: **204 testes, 12 arquivos, aprovados**; sem rede ou `.env`.
- `npm run check:prisma`: validate/generate dos dois schemas aprovados em temporários offline.
- `npm run build`: aprovado, sem mudanças nos assets versionados.
- `git diff --check`: aprovado; schema/migrations de autenticação, cliente Prisma legado e arquivos de login intactos contra a base.

Sem novas dependências, instalação, push, merge ou deploy da aplicação. As migrations remotas descritas foram autorizadas e executadas exclusivamente no banco agro novo.
