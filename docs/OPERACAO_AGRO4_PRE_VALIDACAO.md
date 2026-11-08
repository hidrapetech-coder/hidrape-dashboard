# Preparação da Fase 1 antes da operação real

## O que está pronto localmente

Ensaio executável, checagem sem conexão, templates de container/supervisão e roteiro de staging. São complementos da Fase 1; não iniciam Fase 2, calibração, treinamento ou novas regras agronômicas. [ADR e análise de arquitetura](adr/0001-preparacao-offline-worker-agro.md).

O banco e o fluxo de login permanecem protegidos. Não fornecer ao worker `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`, `REDIS_URL` ou integrações legadas. A entrada nova recusa esses nomes mesmo vazios. Somente a API existente tem acesso ao cadastro; o worker solicita autorização pelo canal dedicado já implementado.

## Ensaio sem serviços

Com as dependências já instaladas, na raiz da branch da Fase 1:

```sh
node workers/agro-rehearsal.js
# Atalho equivalente:
npm run worker:agro:rehearsal
```

Não configurar variáveis ou arquivo `.env` para o ensaio. Ele ignora configuração operacional, usa relógio virtual e dados fixos, bloqueia rede/`.env`/adaptadores reais e não grava arquivos ou envia mensagens. O relatório JSON tem `kind=ENSAIO_SINTETICO_OFFLINE`, `passed` e evidências por cenário. Exit 0 significa invariantes aprovados; exit 1 indica falha. O bloqueio é uma defesa do processo de desenvolvimento, não um sandbox para executar código hostil.

| Cenário | Evidência esperada |
|---|---|
| Blynk sem timestamp, com valor zero | Quatro consultas, dois registros por heartbeat, zero amostras independentes, manejo suspenso. |
| Replay do mesmo intervalo | Uma consulta, repetição ignorada. |
| Três consultas sem comunicação | Investigação requerida, sem afirmar defeito físico. |
| Executor sem rodar por 60 minutos | Nenhuma consulta fabricada, sem aumentar falhas de comunicação. |
| Medição antiga | `STALE`, manejo e envio bloqueados. |
| Falha de um dispositivo | Outro proprietário processado; escopo preservado. |
| Revogação | Nenhuma consulta e remoção da credencial sintética em memória. |
| Timeout de envio simulado | Uma tentativa, estado `UNKNOWN`, sem reenvio automático. |

As medições confirmadas da última fixture são **sintéticas**, não uma capacidade nova do Blynk. O adaptador real continua sem timestamp confirmado; recomendações novas continuam suspensas nessa situação. O adaptador de memória não valida SQL, rollback transacional, persistência ou locks entre processos.

## Checagem de configuração sem conexão

```sh
node workers/agro-start.js --check-config
# Atalho equivalente:
npm run worker:agro:check
```

A checagem lê apenas o ambiente do processo, não `.env` nem serviços; não imprime valores. Sem configuração, deve falhar com código 1. Em ambiente dedicado configurado, exit 0 indica somente sintaxe/regras locais válidas. Não comprova que o banco é separado, permissões, TLS, migration, conectividade, disponibilidade ou quotas. A guarda real do pool continua verificando o marcador agro e a ausência da tabela `User` ao conectar.

Variáveis de aplicação permanecem as já documentadas em [`MIGRACAO_AGRO4_FASE_1.md`](../MIGRACAO_AGRO4_FASE_1.md). Sem novas variáveis no backend ou alteração em `lib/env.js`. A execução normal `npm run worker:agro` agora passa por essa entrada antes de carregar os adaptadores. `--once` conserva o ciclo único. O daemon original continua disponível como módulo interno.

## Container e supervisão — executar somente na etapa operacional

Arquivos em [`deploy/agro-worker/`](../deploy/agro-worker/). Docker não está disponível no ambiente desta entrega: imagem, parser Compose, registry, instalação dentro da imagem e parada real **não foram executados nem validados**.

O Dockerfile usa o lockfile existente com `npm ci --omit=dev --ignore-scripts`; não executa `postinstall`, `prisma generate` ou migration. Contexto por lista positiva exclui segredos, `.git`, autenticação e schemas. O runtime não inicia servidor HTTP, roda como `node`, e o Compose usa init, filesystem somente leitura e reinício pelo supervisor. A imagem inclui dependências de produção compartilhadas que o worker não usa; essa escolha evita outro manifesto/lockfile.

O modelo parte de `node:24-bookworm-slim`. Antes do build operacional, selecionar/verificar um digest da imagem base e registrar a versão/digest final e a arquitetura. A tag é mutável; esta entrega não afirma build reproduzível ou imagem auditada. Parâmetros exclusivos do Compose, sem efeito no backend:

| Parâmetro | Valor/efeito |
|---|---|
| `AGRO_WORKER_ENV_FILE` | Caminho obrigatório de arquivo externo, protegido e exclusivo do worker. Não versionar, não reutilizar `.env` do servidor. |
| `AGRO_WORKER_NODE_IMAGE` | Imagem Node 24/digest selecionado para o build. Default do template acima. |
| `AGRO_WORKER_STOP_GRACE_PERIOD` | Janela de parada, default operacional do template `10m`; medir/ajustar em staging. Não é prazo garantido. |

O Compose fixa `AGRO4_MODE=shadow`, mesmo se o ambiente disser `agro-4`. Promoção exige alteração deliberada e o procedimento da Fase 1; não basta mudar um segredo. O arquivo externo só deve conter variáveis agro e ajustes técnicos necessários, nunca `NODE_OPTIONS` arbitrário ou credenciais de login. O Compose pode carregar seu próprio `.env` para interpolação; usar `--env-file /dev/null` nos comandos abaixo evita carregar o `.env` do projeto.

Exemplos **futuros**, após preparar o ambiente de staging (não executados nesta entrega):

```sh
# Definir AGRO_WORKER_ENV_FILE no ambiente do operador antes de usar Compose.
# Validar sintaxe sem renderizar valores de segredos:
docker compose --env-file /dev/null -f deploy/agro-worker/compose.yaml config --quiet
# Baixa imagem/dependências públicas; não faz migration:
docker compose --env-file /dev/null -f deploy/agro-worker/compose.yaml build agro-worker
# Checa configuração; não abre conexões de aplicação:
docker compose --env-file /dev/null -f deploy/agro-worker/compose.yaml run --rm --no-deps agro-worker node workers/agro-start.js --check-config
# Estes comandos passam a acessar os serviços de staging:
docker compose --env-file /dev/null -f deploy/agro-worker/compose.yaml up -d --no-build agro-worker
docker compose --env-file /dev/null -f deploy/agro-worker/compose.yaml stop agro-worker
```

Não montar diretório do servidor, seu `.env`, socket Docker ou volumes com credenciais no worker. Não publicar portas: o worker só usa conexões de saída. Restringir saída ao PostgreSQL agro, API de autorização e provedores necessários na infraestrutura. Logs genéricos/contadores não substituem monitoramento durável.

SIGTERM/SIGINT acordam a espera e encerram o pool após o ciclo atual. A coleta é sequencial: parada pode demorar com muitos dispositivos. Se o supervisor esgotar o grace period, haverá término forçado; locks caem com a sessão, mas uma entrega pode permanecer `SENDING`. Investigar `SENDING`/`UNKNOWN`, sem reenvio automático. Um processo vivo não comprova coleta saudável; monitorar `AgroWorkerRun`, falhas/atrasos por dispositivo, lacunas atuais e duração do ciclo. O heartbeat HTTP só confirma o canal.

`--once` não é teste de saúde: o daemon existente captura falhas de ciclo para continuar em operação contínua. Conferir contadores, registros e logs, não só exit code. Na checagem e no ensaio, exit code tem o significado estrito descrito acima.

## Roteiro de staging e critérios de parada

Preencher evidências sem copiar senhas, tokens, emails, coordenadas ou payload bruto. O resultado permanece **PENDENTE** até cada etapa real ser executada. Não definir percentuais de precisão agronômica sem dados e critérios aprovados.

| Etapa | Ação futura | Aprovação / interromper quando | Estado |
|---|---|---|---|
| 1. Identificar destinos | Registrar versão da branch, referência privada do banco agro dedicado, endpoint direto/sessão, papéis e TLS. Comparar destinos por processo seguro. | Aprovar somente isolamento comprovado; qualquer dúvida sobre banco de login interrompe antes de conectar/aplicar DDL. Não testar a recusa apontando ao login. | PENDENTE |
| 2. Preservação do login | Confirmar arquivos protegidos intactos e operação normal no ambiente de teste autorizado. Não criar/excluir usuários em produção para esse teste. | Interromper diante de mudança de schema/configuração de autenticação ou regressão. | PENDENTE |
| 3. SQL agro | Após revisão do destino, aplicar exclusivamente migration/schema agro conforme guia da Fase 1. Testar constraints com dados sintéticos no agro de staging. | Propriedade cruzada, duplicação, transação ou marcador incorretos bloqueiam avanço. | PENDENTE |
| 4. Lock e concorrência | Executar dois workers no mesmo intervalo com dispositivo sintético autorizado. | Mesma coleta não duplica; comprovar lock de sessão no endpoint escolhido. Nenhum teste no banco de login. | PENDENTE |
| 5. Autorização | No cadastro de teste, editar configuração, trocar/remover token e desativar agro; simular API indisponível. | Sem credencial anterior após revogação; sem envio quando revisão divergir. Falha da API não vira diagnóstico físico. | PENDENTE |
| 6. Sombra | Cadastrar dispositivo de teste explicitamente e observar polls, avaliações e decisões. | Respostas continuam legadas; worker sombra não envia alertas. Sem timestamp Blynk, `UNCONFIRMED` e zero novas amostras independentes. | PENDENTE |
| 7. Falhas/fontes | Simular timeout/429/503 em bordas de staging e desligamento do executor. | Retry limitado; falha isolada; lacunas do worker distintas de comunicação do dispositivo. Não simular derrubando produção. | PENDENTE |
| 8. Supervisor | Reiniciar/parar durante espera e durante ciclo; verificar retomada e `AgroWorkerRun`. | Sem duplicação, segredos nos logs ou perda de controle; duração de ciclo compatível com 5 minutos e quotas confirmadas. Medir antes de escalar. | PENDENTE |
| 9. Entrega | Usar transporte de teste/controlado, depois destino expressamente de teste. Não forçar promoção para contornar timestamp ausente. | Sombra não envia; sem dado elegível não envia; ambiguidade fica `UNKNOWN`/`SENDING`. Aceitação HTTP não comprova chegada ao telefone. | PENDENTE |
| 10. Corte/rollback | Ensaiar somente em staging o mesmo corte em API/worker e retorno a `agro-3`. | GET promovido não escreve no legado; histórico separa o corte; indisponibilidade suspende manejo. Retorno pode exigir recompor histórico legado. | PENDENTE |

Registrar para cada etapa: responsável, data UTC, versão, referência de ambiente, esperado/observado, resultado e evidência sanitizada. Janela de observação e capacidade final devem ser aprovadas com os resultados reais. Sem evidência de medição válida, não promover para oferecer manejo.

## Rollback

Preparação local: reverter os commits complementares; sem schema ou dados a reverter. Operação futura: parar o worker e voltar API para `AGRO4_MODE=agro-3`, conforme [guia da Fase 1](../MIGRACAO_AGRO4_FASE_1.md#rollback). Preservar banco agro e evidências. Nunca executar down migration ou alteração no banco de login. Aguardar histórico legado suficiente antes de considerar manejo disponível.

## Referências operacionais

- [Docker: contexto e arquivo ignore específico](https://docs.docker.com/build/concepts/context/)
- [Node Docker: usuário sem root e init](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)
- [npm ci: lockfile e scripts](https://docs.npmjs.com/cli/v11/commands/npm-ci/)
