# Fase 1 agro — preparação e operação

## Situação desta entrega

Implementação local, desativada por padrão. Nenhum banco, Redis, Blynk, WhatsApp, Vercel ou outro serviço operacional foi chamado. Nenhuma migration, instalação, deploy ou push foi executado. As decisões aprovadas estão em `docs/decisoes-agro4-fase1.md`.

O banco real, o provisionamento agro e os dados calibrados permanecem **não verificados**. A existência de schema e testes locais não significa que a coleta esteja operando em produção.

## Proteção da autenticação

- `prisma/schema.prisma`, `prisma/migrations/`, `lib/prisma.js`, `lib/encryption.js`, controllers e middleware de autenticação permanecem intactos.
- O novo `lib/agroDb.js` não importa o cliente do login e não usa `DATABASE_URL` como fallback.
- O worker não carrega `.env`, `lib/env.js`, `lib/prisma.js` ou `server.js`. Recebe somente seu ambiente operacional injetado pelo supervisor.
- Configuração opt-in recusa URLs que identifiquem o mesmo banco, inclusive diferenças apenas de usuário, porta/schema ou pooler Supabase conhecido.
- Antes de disponibilizar uma conexão para escrita, o pool exige o marcador agro e recusa a tabela `User` em schemas não sistêmicos. O DDL também verifica isso antes de criar tabelas.
- URL e marcador não substituem provisionamento correto: usar banco/projeto dedicado e papéis sem privilégios no banco de autenticação. Não executar GRANT/REVOKE/DDL no banco protegido como parte desta fase.
- Se as variáveis novas estiverem inválidas, o worker encerra com erro genérico. No processo HTTP, a integração nova falha fechada sem impedir cadastro/login/sessões/recuperação.

## Arquitetura

```text
Login/cookies existentes ── autenticação e autorização HTTP existentes
                                  │ identidade estável; sem copiar senha/JWT
                                  ▼
POST dispositivo principal ── configuração agro + credenciais IoT cifradas
                                  │
                   PostgreSQL agro dedicado
                   Propriedade → Talhao → Dispositivo
                         Coletas / Leituras / Eventos
                         Avaliações / Decisões / Entregas / Execuções
                                  ▲
worker externo ── Blynk / contexto climático ── avaliação agro-3 + agro-4
       │
       └── API curta autenticada de autorização atual do dispositivo
                                  │
                     shadow: apenas grava comparação
                     promovido: API lê persistido; worker solicita alertas
```

`Talhao` reaproveita o conceito/campos principais do modelo legado no armazenamento novo. Não altera nem movimenta os registros existentes. A persistência usa consultas parametrizadas com `pg`, já dependência do projeto. O schema Prisma separado documenta/valida a modelagem e gera seu DDL; nenhum cliente novo é gerado sobre o cliente de autenticação em runtime.

## Contrato temporal e qualidade

- `collectedAt`: instante da consulta realizada pelo worker.
- `lastSeenAt`: instante em que a origem confirmou hardware online; não é timestamp físico de medição.
- `lastMeasurementAt` / `observedAt`: somente timestamp de medição confirmado pela fonte. Permanecem `null` se desconhecidos.
- `AgroPoll`: trilha de cada ciclo, idempotente por dispositivo + instante agendado.
- `AgroReading`: persistência por mudança/heartbeat ou nova medição confirmada. `independent=true` exige medição válida, com timestamp distinto. Heartbeat sem evidência não alimenta histórico agronômico.
- `UNCONFIRMED`, `INVALID`, `STALE`, `CONFLICT`, `OUT_OF_ORDER`, `API_ERROR` e `OFFLINE` permanecem distintos. Falhas da API podem deixar comunicação desconhecida; não comprovam defeito físico.
- O adaptador Blynk atual consulta valor e conectividade, mas não recebe timestamp de medição. Portanto, seus valores ficam **UNCONFIRMED**, visíveis como consultas, com manejo suspenso no novo motor. Não alterar firmware nem inferir horário por variação de valor nesta fase.
- As políticas do agro-3 de quantidade, duração do histórico, congelamento e salto continuam vigentes. Evento de campo explica um salto, mas não remove esses gates.

### Snapshot e decisão

Cada ciclo guarda uma avaliação compacta e a comparação com agro-3. O snapshot retém ID, versão, hash canônico das regras/configuração e referência ao histórico: dispositivo, intervalo, contagem, limite, instante de corte e hash. As observações ficam separadas e imutáveis; não são copiadas integralmente no JSON.

Decisões são gravadas apenas em transição de ação/nível de risco ou heartbeat. Heartbeats não contam como novas recomendações no mensal. O `snapshotId` emitido pelo worker é preservado na versão compacta; ele identifica as entradas completas avaliadas, não um hash literal do JSON compacto.

Replay futuro precisa preservar leituras, eventos, versões do código, regras e configuração pelo mesmo prazo das avaliações. A remoção de evidências por retenção quebra essa capacidade. Backfill/replay histórico/backtest e política definitiva de retenção não são implementados nesta fase.

## Flags e variáveis

Todas estão documentadas também em `.env.example`. Não colocar valores reais na documentação ou no Git.

| Variável | Default / finalidade |
|---|---|
| `AGRO4_MODE` | `agro-3`; opções `agro-3`, `shadow`, `agro-4` |
| `AGRO_DATABASE_URL` | Sem fallback; PostgreSQL agro dedicado, conexão direta ou de sessão |
| `AGRO_DATABASE_ACK` | Opt-in exige `dedicated-agro`, após verificar o destino |
| `AGRO_WORKER_SECRET` | Segredo dedicado de pelo menos 32 caracteres; cifra autenticada das credenciais IoT e autenticação do canal de worker |
| `AGRO_POLL_MINUTES` | `5`, política operacional aprovada |
| `AGRO_READING_HEARTBEAT_MINUTES` | `15`, não pode ser menor que o intervalo de consulta |
| `AGRO_DECISION_HEARTBEAT_MINUTES` | `15`, registro periódico de estado sem nova transição |
| `AGRO_CHANGE_POINTS` | `2`, pontos percentuais do sensor |
| `AGRO_MISSING_COMMUNICATION_LIMIT` | `3`, consultas sem confirmação para investigar |
| `AGRO_SOURCE_RETRIES` | `2`, retries de erro transitório com backoff; não repetir erro de valor/formato |
| `AGRO_SOURCE_TIMEOUT_MS` | `4000` por chamada; timeout e cancelamento |
| `AGRO_BLYNK_SERVER_URL` | `https://blynk.cloud`; permite servidor regional HTTPS sob `blynk.cloud` |
| `AGRO4_CUTOVER_AT` | Obrigatório para `agro-4`: instante ISO com offset; API permanece legada antes dele |
| `AGRO_WORKER_API_URL` | Obrigatória para iniciar o worker; HTTPS da API para autorização atual e heartbeat; HTTP apenas em loopback local |

O timeout/retry e o cache são controles de engenharia, não critérios de precisão agronômica. A regra de medição antiga em 30 minutos não foi flexibilizada.

Os locks usam sessão PostgreSQL estável. Não usar pooler em modo transação. URLs conhecidas de pooler Supabase na porta 6543 e `pgbouncer=true` são recusadas. Outros proxies/modos precisam ser confirmados pelo operador; não são detectáveis apenas pelo nome da URL.

## Provisionamento e migration — somente procedimento, não executado

1. Confirmar um PostgreSQL **dedicado**, com backup e ambiente de staging próprios. Confirmar que o destino não atende autenticação e não contém `User`.
2. Criar acesso restrito aos dados agro e verificar conexão direta/sessão, TLS, limites de conexão, retenção e supervisão. O pool da aplicação usa no máximo duas conexões por processo.
3. Revisar `prisma/agro/schema.prisma` e `prisma/agro/migrations/20261108000000_phase1/migration.sql`. O DDL é transacional, cria somente tabelas/índices/constraints agro e insere o marcador do banco dedicado.
4. Em etapa de infraestrutura autorizada, fornecer exclusivamente `AGRO_DATABASE_URL` do destino validado e aplicar a migration usando **o schema agro**:

   ```sh
   ./node_modules/.bin/prisma migrate deploy --schema prisma/agro/schema.prisma
   ```

   Esse comando é documentação de operação futura. **Não usar o schema padrão e não aplicar a nova estrutura no banco de login.** A migration fica sob `prisma/agro/migrations/` para manter datasource e histórico totalmente separados das migrations antigas.

5. Validar SQL, constraints de usuário/dispositivo, idempotência, transações e locks em staging. A verificação local `check:prisma` valida/gera clientes em diretório temporário com URLs sintéticas, sem aplicar DDL.
6. Injetar as variáveis do worker por ambiente do supervisor. Não fornecer JWT, senha de usuário, `DATABASE_URL`, `DIRECT_URL` ou chave AES do login ao worker. O segredo operacional dedicado precisa ser o mesmo no backend de cadastro agro e no worker.

Rotação de `AGRO_WORKER_SECRET` exige coordenar API e worker. A autorização atual devolve o envelope recifrado com a chave ativa; não trocar a chave AES do login como alternativa. A infraestrutura real e a rotação não foram verificadas/executadas.

## Modo sombra

1. Manter frontend/API e worker inicialmente com `AGRO4_MODE=shadow`, após preparar o banco dedicado e os segredos.
2. Cadastrar explicitamente o dispositivo principal pela rota autenticada `POST /api/agro/dispositivo-principal`, body `{}`. Ela lê a configuração existente e grava somente no banco agro; não altera `User`.
3. Executar o worker externo pelo supervisor:

   ```sh
   npm run worker:agro
   # Ciclo único, somente em ambiente autorizado e configurado:
   npm run worker:agro -- --once
   ```

4. Verificar `AgroWorkerRun`, coletas, estado do dispositivo, avaliações e diferenças de decisão. O modo sombra não substitui a resposta antiga, não envia alertas novos e não muda contagens do relatório legado.
5. Confirmar os limites contratados do Blynk, quantidade de dispositivos e duração dos ciclos. O processamento é sequencial e isolado por dispositivo; se o ciclo ultrapassar cinco minutos, monitorar atraso e dimensionar o executor antes de ampliar a escala. Não há promessa de agendamento de tempo real.

O agendamento/processamento é externo e não depende de uma requisição longa da Vercel. A autorização, entretanto, consulta uma rota curta do backend antes de cada coleta e novamente antes de alertar. Sem esse canal, não usa a cópia antiga das credenciais: registra falha de processamento sem marcar falha física do dispositivo. Dimensionar também capacidade, limites HTTP e disponibilidade dessa API.

A API continua com comportamento legado em `agro-3` e `shadow`, inclusive a regra antiga de gravação 15 minutos/2 pontos. No modo promovido, o GET deixa de adquirir/persistir: lê exclusivamente a ingestão agro, sem fallback automático para escrita antiga. A coexistência em sombra não mistura as duas séries como se fossem medições independentes.

## Promoção

Somente após validação operacional e decisão de promoção:

1. Definir o mesmo `AGRO4_CUTOVER_AT` futuro na API e no worker; configurar `AGRO4_MODE=agro-4` em ambos.
2. Antes do corte, o worker ainda registra sombra e a API responde pelo legado. Coordenar a troca e drenar requisições legadas em curso.
3. Após o corte, o worker registra avaliações promovidas; API/sensor/insights leem essas avaliações. Se não estiverem prontas, a resposta é indisponível; não há chamada substituta ao Blynk ou gravação em `Sensor`/`AgroLog` antigos.
4. Se o worker atrasar ou a configuração divergir, a API suspende previsões/risco/manejo sem recalcular uma nova recomendação na requisição.
5. Histórico e médias preservam dados legados **antes** do corte e usam apenas medições independentes agro após o corte. O mensal mostra transições deduplicadas e, separadamente, a contagem histórica de linhas `IRRIGAR`; nenhuma contagem prova irrigação executada.

**Limitação essencial:** promover o adaptador Blynk `get` atual implica recomendações suspensas enquanto não houver evidência de medição com timestamp. A Fase 1 não contorna esse bloqueio. A promoção não deve ser confundida com certificação agronômica.

## Eventos e operação

Rotas novas usam a sessão existente e identidade do usuário obtida no backend. Não aceitam `userId` ou origem arbitrária no payload.

- `POST /api/agro/dispositivo-principal`: cadastrar/atualizar configuração e credenciais do dispositivo principal; repetir após mudar integração/configuração legada.
- `DELETE /api/agro/dispositivo-principal`: desativar a coleta e remover a cópia cifrada da credencial agro; não apaga histórico nem altera cadastro.
- `POST /api/agro/eventos`: `deviceId`, `idempotencyKey` UUID, `type`, `value`, `unit`, `occurredAt` ISO com offset e `timeZone` IANA.
- `GET /api/agro/eventos?deviceId=...`: eventos das últimas 24 horas do dispositivo do usuário.
- `GET /api/agro/ingestao/metricas`: contadores diários UTC, falhas, registros/medições independentes e lacunas de coleta, incluindo ausência atual de coleta. Lacuna do worker não é falha física do sensor.
- `POST /api/agro/worker/heartbeat`: canal de confirmação com `Authorization: Bearer <segredo dedicado>`. A execução durável é registrada em `AgroWorkerRun`; esta rota não dispara coleta e não expõe credenciais.
- `POST /api/agro/worker/authorization`: somente worker autenticado, body `{deviceId}`; resolve o proprietário pelo cadastro agro, lê a configuração atual e devolve revisões + envelope cifrado. Não retorna senha, JWT ou token IoT em claro e não escreve em `User`.

Eventos: `RAIN` usa `mm`; `IRRIGATION` registra `mm` ou `minutes` **efetivamente observados/informados**; `ACTION_TAKEN` e `ALERT_IGNORED` usam `unit=none`, `value=null`. Não são prescrições. Zero é aceito como registro, mas não explica um aumento de umidade. Causas conflitantes permanecem `UNEXPLAINED`.

Mudanças de configuração/credenciais são sincronizadas pelo worker antes da próxima coleta. Enquanto uma avaliação divergir da configuração ou revisão de autorização atuais, a API bloqueia o manejo. Remover usuário/token desautoriza a coleta; antes do alerta a autorização é conferida novamente. Trocar o token reinicia a janela de histórico usada no cálculo, preservando registros antigos. O cadastro explícito continua necessário para iniciar/reativar um dispositivo desativado.

Desativar explicitamente a integração agro antes de excluir uma conta é uma medida operacional disponível; a autorização também recusa automaticamente conta removida. Exclusão/retenção histórica entre bancos continua requerendo processo próprio; o fluxo de exclusão da autenticação não foi modificado.

## Entregas de alerta

Somente o worker promovido, com dado elegível e decisão compatível, solicita WhatsApp. Transições criam registro técnico de entrega; heartbeat não gera nova mensagem. Entregas antigas/incompatíveis expiram; flags sombra nunca enviam.

`SENT` significa resposta HTTP aceita, não confirmação de leitura/entrega ao telefone. Timeout de envio fica `UNKNOWN`; confirmação de persistência incerta pode deixar `SENDING`. Esses estados exigem investigação e não são reenviados automaticamente, evitando duplicar mensagens potencialmente aceitas. Não há garantia de exatamente uma entrega pelo provedor. A máquina de estados agronômica de alertas pertence à Fase 3.

## Rollback

Parar o worker e voltar a API para `AGRO4_MODE=agro-3`. O legado volta a ser a fonte operacional. Manter o banco agro e suas evidências; não executar down migration, apagar logs ou modificar o banco de login. A leitura em sombra não foi replicada para `Sensor`: o retorno ao legado pode exigir formar novamente histórico suficiente; até lá os gates existentes bloqueiam manejo.

Não executar o procedimento antigo de migration de `User` para habilitar esta fase. Não remover `lib/prisma.js` nem seus fallbacks de compatibilidade.

## Validação e pendências

Complemento anterior à validação real: [ensaio sintético, checagem sem conexão, empacotamento e roteiro de staging](docs/OPERACAO_AGRO4_PRE_VALIDACAO.md). A entrada `npm run worker:agro` agora recusa variáveis legadas de autenticação antes de carregar adaptadores reais. O Compose preparado fixa `shadow`; nenhuma imagem foi construída ou serviço iniciado. A supervisão está preparada como template, com operação ainda pendente.

Testes locais usam fixtures/mocks, bloqueio de rede e nenhum segredo real. `npm run check:prisma` valida os dois schemas e gera clientes em diretório temporário. `npm run build` recompõe os assets; o JS da interface usa `v=17`.

Pendentes: provisionamento, permissões/TLS, SQL real, locks com o endpoint escolhido, limites Blynk, supervisor/monitoramento, horários sincronizados, eventos de campo, retenção/exclusão entre bancos, precisão agronômica e operação de mensagens. Nenhuma dependência foi adicionada; não há deploy ou PR remoto nesta entrega.
