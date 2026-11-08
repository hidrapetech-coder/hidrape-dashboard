# Entrega local — Agro Fase 1

Data: 8 de novembro de 2026. Base: `930c2cd0e52771f1608229162fe66d340b462a08`.

Branch: `feat/agro-4-fase-1-fundacao`. Worktree: `/private/tmp/hidrape-agro4-fase1`.

## Resultado

Implementada a Fase 1 local: persistência agro independente, decisões deduplicadas, eventos autenticados, worker externo, sincronização de autorização/configuração, modo sombra e transição opt-in da API. O padrão continua `AGRO4_MODE=agro-3`.

Nenhum acesso operacional a banco, Redis, Blynk, WhatsApp ou Vercel; nenhuma migration aplicada, instalação, deploy ou push. A branch principal permanece na base original. Nenhuma senha/JWT foi copiado para o domínio agro.

## Commits e arquivos

| Commit | Alteração e arquivos principais |
|---|---|
| `ddeb6a0` | Caracterização antes de alterar lógica: `tests/agro3.characterization.test.js`, seis testes de decisão, snapshot, persistência seletiva e bloqueio de salto. |
| `f380c97` | Isolamento: `config/agro4.js`, `lib/agroDb.js`, `prisma/agro/schema.prisma`, migration agro própria, `services/agro4/{domain,credentials,repository}.js`; validação offline dos dois schemas em `scripts/check-prisma-offline.js`; testes de domínio/persistência e ignore do cliente opcional. |
| `d0e180f` | Hashes canônicos em `services/agro4/domain.js`, com regressão em `tests/agro4.domain.test.js`, para suportar reordenação de chaves pelo JSONB. |
| `cb63c35` | `workers/agro.js`, `services/agro4/{worker,authorization,controlPlane,context}.js`, `services/iot/{blynk,notifications}.js`, script `worker:agro` e factories reutilizáveis em clima/satélite; testes de ingestão/controle. Inclui sincronização de revisões, reinício da janela de histórico após troca de token e investigação de comunicação. |
| `a308ca2` | `controllers/agro4Controller.js`, `services/agro4/runtime.js`, integração dos controllers de sensor/agro/mensal, rotas em `server.js`, validação isolada em `lib/env.js` e testes de API. |
| `ef2df43` | `public/js/app.js`, `app.min.js`, `public/index.html` com `v=17`, texto do mensal e testes de DOM: horário desconhecido permanece desconhecido, investigação explícita e semântica de decisões separada do legado. |

A documentação desta entrega acrescenta variáveis vazias/defaults em `.env.example`, seção no README, decisões aprovadas e `MIGRACAO_AGRO4_FASE_1.md`. Nenhuma dependência foi adicionada ou alterada.

## Verificações executadas

| Verificação | Resultado |
|---|---|
| Linha de base: `npm test -- --configLoader native --no-cache --no-fsModuleCache --pool=threads` | **107 testes, 5 arquivos, aprovados**. |
| Caracterização antes da lógica nova | **6 testes aprovados**. |
| Mesmo comando da suíte após implementação/revisão | **193 testes, 11 arquivos, aprovados**, exit 0. |
| `npm run check:prisma` | Os dois schemas passaram em validate/generate, em diretório temporário, com URLs sintéticas e bloqueio de `.env`/rede. |
| Geração de DDL `check:prisma -- --agro-migration` | Migration nova gerada a partir de schema vazio, offline; DDL complementado com guardas e constraints antes do commit; nenhuma aplicação. |
| `npm run build` | Assets recompostos; CSS compilado não apresentou mudança no Git. |
| `node --check` | 20 fontes verificadas e JS minificado aprovados. |
| `git diff --check` | Aprovado. |
| Comparação de arquivos protegidos com a base | Sem alterações em schema/migrations de autenticação, `lib/prisma.js`, criptografia legada, controller/middleware de autenticação e telas de entrada/recuperação. |

Testes novos cobrem consultas versus medições, zero/null, heartbeat, limites operacionais aprovados, idempotência e concorrência, erros de fonte, perfil/credenciais atualizados, revogação, isolamento, eventos, snapshot compacto, entrega incerta e revalidação da idade antes do envio.

## Revisão independente

Revisão estática com GPT-6 Astra, diferente do modelo de implementação. Três achados foram corrigidos: configuração/credenciais desatualizadas, investigação não exposta e medição que poderia envelhecer antes do envio. A verificação focal posterior não identificou bloqueadores remanescentes nesses pontos. A revisão não executou testes nem infraestrutura.

## Migração, flags e ativação

Procedimento completo, variáveis/defaults e rollback: **`MIGRACAO_AGRO4_FASE_1.md`**.

- Migration nova somente em `prisma/agro/migrations/20261108000000_phase1/`, usando datasource exclusivo `AGRO_DATABASE_URL`. Migrations antigas intactas.
- Primeiro provisionar/validar PostgreSQL agro dedicado, conexão direta/sessão, permissões e segredos. Não usar o banco do login como alternativa.
- Iniciar por `shadow`, cadastrar explicitamente o dispositivo principal e executar o worker por supervisor externo. O worker exige `AGRO_WORKER_API_URL` e segredo próprio; consulta autorização atual sem carregar credenciais do banco de autenticação.
- Para promover: `AGRO4_MODE=agro-4` e mesmo `AGRO4_CUTOVER_AT` explícito na API/worker. Antes do corte, sombra/legado; depois, API lê persistido e worker assume avaliação/solicitação de alertas.
- Rollback: parar o worker e voltar a `agro-3`. Preservar os dados novos, sem down migration ou alteração do banco de login. A série legada pode precisar recuperar cobertura suficiente antes de permitir manejo.

Por prioridade da regra do dono, configuração agro inválida não encerra o processo HTTP de login. O worker independente recusa inicialização inválida; os recursos agro falham fechados.

## Limitações e configurações externas pendentes

1. PostgreSQL agro provisionado, endpoint direto/sessão, TLS, papéis, capacidade, SQL e locks reais ainda não validados.
2. Segredo dedicado, URL HTTPS da API atualizada, cadastro do dispositivo e supervisor do worker ainda precisam de configuração externa.
3. Quotas Blynk da conta, servidor regional, latência e capacidade da API de controle precisam ser confirmados.
4. O adaptador Blynk atual não confirma timestamp da medição: registra consultas/heartbeats sem fabricar amostras independentes. No motor novo, recomendações permanecem suspensas nessas condições.
5. Dados calibrados, precisão agronômica, retenção/exclusão histórica entre bancos, entrega real de mensagens, Redis e ambiente Vercel não foram validados.
6. `SENT` é aceitação HTTP pelo provedor, não confirmação no telefone. Estados `UNKNOWN`/`SENDING` não causam reenvio automático; exigem investigação operacional.
7. Multi-propriedade/talhão funcional completo, backtest, calibração, NDVI e prescrição quantitativa permanecem fora da Fase 1.

## Checklist

- [x] Somente Fase 1; padrão agro-3 e promoção explícita.
- [x] Caracterização anterior e testes antigos preservados.
- [x] Migrations aditivas isoladas, nenhuma executada.
- [x] Nenhum segredo real lido, impresso ou gravado.
- [x] Nenhum limite de precisão agronômica inventado; políticas operacionais aprovadas documentadas.
- [x] `null` diferente de zero; origem/unidade/instantes explícitos.
- [x] Nenhuma prescrição quantitativa ou autocalibração introduzida.
- [x] Modo sombra, rollback, bloqueios externos e revisão independente documentados.

## Complemento — preparação antes da operação real

Solicitado pelo dono após a entrega local da Fase 1, em 8 de novembro de 2026. Continua na mesma branch/worktree, sem avançar para outra fase ou modificar a arquitetura principal. A skill `architecture-designer` orientou a análise de domínios, dependências, alternativas, falhas e rollback; o plano foi apresentado antes do desenvolvimento. Decisão em [ADR-0001](docs/adr/0001-preparacao-offline-worker-agro.md).

Commit `95a4cef` — `feat(agro): prepare isolated offline rehearsal and worker packaging`:

| Arquivos | Resultado |
|---|---|
| `services/agro4/preflight.js`, `workers/agro-start.js`, `package.json` | Checagem sem conexão, nomes/códigos de problemas sem valores; recusa de credenciais de autenticação no ambiente do worker antes de carregar adaptadores. `worker:agro` usa a entrada nova; `worker:agro:check` só verifica configuração. |
| `workers/agro-rehearsal.js`, `workers/offline/{guard,memory,rehearsal}.js` | `worker:agro:rehearsal`: oito cenários sintéticos com worker/motor existentes, memória descartável e relógio virtual. Guarda bloqueia rede, adaptadores reais, subprocessos e leitura de `.env`. Nenhuma coleta ou mensagem real. |
| `deploy/agro-worker/{Dockerfile,Dockerfile.dockerignore,compose.yaml}` | Templates de container com arquivos explícitos, lockfile sem scripts de instalação, usuário sem root e supervisão opcional; Compose fixa sombra. Sem build ou execução Docker. |
| `tests/agro4.operations.test.js` | Onze testes novos: configuração, entrada, ensaio completo, guarda em subprocesso isolado e imports do pacote em diretório temporário. Não certificam Docker ou SQL. |

Documentação complementar: `docs/OPERACAO_AGRO4_PRE_VALIDACAO.md`, ADR, README e referência no guia de migração. Nenhuma dependência, lockfile, migration, frontend, arquivo de autenticação ou flag padrão mudou nesse complemento. Os parâmetros novos de Compose são exclusivos do operador/template; não são configuração da API e não alteram `lib/env.js`.

| Verificação do complemento | Resultado |
|---|---|
| Suíte antes das alterações | 193 testes, 11 arquivos, aprovados. |
| `npm test -- --configLoader native --no-cache --no-fsModuleCache --pool=threads` | **204 testes, 12 arquivos, aprovados**, exit 0; rede bloqueada e sem carregamento de `.env`. |
| `node workers/agro-rehearsal.js` | Oito cenários aprovados, `ENSAIO_SINTETICO_OFFLINE`, exit 0. |
| `node workers/agro-start.js --check-config`, ambiente vazio | Recusa esperada `AGRO4_DISABLED`, exit 1; sem adaptadores/conexões carregados. Configuração sintética válida e incompatibilidades verificadas nos testes. |
| `npm run check:prisma` | Validate/generate dos dois schemas aprovados, temporários e offline. Nenhuma migration aplicada. |
| `npm run build` | Aprovado; assets não apresentaram mudanças no Git. |
| `node --check` | Seis fontes novas aprovadas. |
| `git diff --check` e comparação dos arquivos protegidos com a base | Aprovados; autenticação/schema/migrations legadas intactos. |

Os comandos npm foram executados com ambiente reduzido, configuração npm privada desabilitada e modo offline, conforme a verificação anterior. O smoke do pacote copia somente fontes explicitamente permitidas para uma pasta temporária, usa as dependências já instaladas e carrega os imports com rede/`.env` bloqueados. Não executa o daemon real.

Revisão independente estática com GPT-6 Astra: um P2 corrigido na reinclusão de descendentes pelo ignore Docker; agora cada diretório reincluído volta a excluir descendentes antes da lista de arquivos, e os `COPY` também enumeram arquivos. A revisão posterior não identificou bloqueadores remanescentes nesse escopo.

**Não validado:** Docker indisponível neste ambiente; imagem, instalação na imagem, parser Compose e supervisão/parada reais permanecem pendentes. Permanecem também todas as verificações de infraestrutura/SQL/dispositivo/campo da entrega original, incluindo a falta de timestamp de medição Blynk. O guia novo contém dez etapas de staging, todas marcadas PENDENTE, com evidências esperadas e critérios de interrupção.

Rollback local do complemento: reverter seus commits sem tocar em dados. Rollback operacional futuro continua parar o worker e retornar API para `agro-3`, preservando o banco agro e o banco de login. Nenhum acesso a serviços reais, instalação, migration aplicada, deploy ou push foi realizado.
