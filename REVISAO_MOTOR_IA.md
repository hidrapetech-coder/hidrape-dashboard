# Revisão aprofundada — Motor Agro + Gemini

Data: 10/10/2026 (America/Recife). Base: commit `1706259`, árvore inicialmente limpa. Escopo: código local, contratos, suíte existente, reproduções com mocks e auditoria de dependências. Nenhum código de produção foi alterado.

> Atualização posterior: após autorização, correções foram implementadas localmente. Veja [CORRECOES_MOTOR_IA.md](CORRECOES_MOTOR_IA.md) para situação dos 22 achados, validações e pendências de implantação. O texto abaixo preserva o diagnóstico anterior às correções.

## 1. Resumo executivo

1. **Nota técnica: 4/10**, avaliação qualitativa de confiabilidade e segurança; não representa acurácia agronômica medida.
2. Foram consolidados **22 achados: 1 crítico condicional, 11 altos e 10 médios**.
3. O risco crítico é aceitar chaves JWT/AES públicas como fallback quando falta configuração; a configuração real não foi consultada.
4. Sensores congelados, saltos e dados antigos ainda podem gerar `IRRIGAR`; a interface também apresenta ausência de dados como estado normal.
5. Há decisões apoiadas em conversões não calibradas entre mm e porcentagem, chuva fora da janela correta e chuva inexistente no limite exato.
6. O texto do Gemini pode contradizer a decisão, o resumo mensal contorna a cota diária e o frontend apresenta dados sintéticos como observados.
7. Há bons fundamentos: módulos pequenos, consultas com escopo por usuário, índices, DTO de usuário, cultura por enum e saída Gemini inserida como texto.
8. Os **7 testes existentes passaram**; **41 verificações adicionais resultaram em 37 expectativas não atendidas e 4 controles passando**, sem serviços reais.
9. O motor precisa das contenções prioritárias abaixo antes de ser tratado como orientação confiável de manejo; não foi encontrado comando de acionamento físico de irrigação.

## 2. Mapa do motor

### Fluxo efetivamente implementado

```text
public/index.html -> public/js/app.min.js (equivale à minificação de app.js)
  |
  +-> GET /api/sensores/umidade
  |     apiLimiter por IP -> auth JWT -> User pelo req.user.id
  |     -> decrypt(blynkToken)
  |     -> Blynk isHardwareConnected [3 s] -> Blynk V0 [4 s]
  |     -> parseFloat -> diagnóstico simples por faixa da cultura
  |     -> Sensor.findFirst -> Sensor.create se >=15 min OU variação >=2 pp
  |     -> possível WhatsApp/CallMeBot -> resposta umidade/status/diagnóstico
  |     [este caminho NÃO passa por qualidade/anomalias/confiança]
  |
  +-> GET /api/agro/clima
  |     apiLimiter -> auth -> User
  |     -> NASA POWER GWETTOP [Redis por coordenadas, TTL 12 h]
  |     -> Open-Meteo [Redis por usuário, TTL 10 min]
  |     -> Sensor.findFirst (status online/stale/offline)
  |     -> Sensor.findMany (20 últimos, ordem desc, filtro userId)
  |     -> Data Quality -> Anomaly Detection -> Climate Analyzer
  |     -> regressão linear / fallback ET0 -> Risk & Confidence -> Decision Maker
  |     -> AgroLog.create (iniciado sem await)
  |     -> engineData + adaptação legada previsao/status/tempoHoras
  |
  +-> GET /api/agro/insights-ia
  |     apiLimiter -> auth -> repete coleta e cálculo do motor acima
  |     -> hash(engineData, umidadeAtual, cultura), Redis usuário+hash, TTL 3 h
  |     -> circuit breaker local -> INCR/EXPIRE cota usuário em 24 h
  |     -> cultura sanitizada -> prompt + systemInstruction
  |     -> Gemini generateContent [Promise.race, padrão 15 s]
  |     -> JSON.parse(response.text) -> laudo_textual -> cache -> resposta
  |     -> frontend createTextNode/textContent
  |     em erro: HTTP 503 { fallback:true }, sem diagnóstico matemático no corpo
  |     dashboard reaproveita /clima; análise mantém o card matemático anterior
  |
  +-> GET /api/agro/media-semanal
  |     auth -> Sensor userId, últimos 7 dias -> seg-sex -> cache 1 h
  |
  +-> GET /api/reports/monthly
        auth -> valida ano/mês -> SQL parametrizado por userId
        -> Open-Meteo últimos 92 dias -> indicadores
        -> Gemini gerarResumoMensal se >=10 leituras
        [sem cota individual e sem cache de resumo]
```

O endpoint agro **não coleta Blynk**: utiliza o histórico que a visita à rota de sensores grava. No dashboard, `updateIoT()` e `updateAgro()` começam independentemente (`public/js/app.js:1790`), permitindo que o primeiro cálculo use o histórico anterior à coleta. Na análise, essas chamadas são sequenciais (`public/js/app.js:2264`, `public/js/app.js:2312`). Não foi encontrado coletor agendado no backend listado.

### Arquivos confirmados no diretório e responsabilidades

| Arquivo | Responsabilidade |
|---|---|
| `server.js:146` | Registro das rotas, rate limits, auth, middleware HTTP e exportação serverless. |
| `middleware/auth.js:7` | Verifica JWT HS256 e revogação por alteração de senha; obtém identidade autenticada. |
| `middleware/validation.js:4` | Schemas de cadastro/configuração e enum de culturas. |
| `controllers/authController.js:34` | DTO seguro, geolocalização, cadastro/configuração de cultura, localização e credenciais IoT. |
| `controllers/sensorController.js:69` | Aquisição Blynk, persistência seletiva, diagnóstico por faixa e alertas WhatsApp. |
| `controllers/agroController.js:28` | Open-Meteo, status do sensor, pipeline, caches, adaptação legada e endpoints agro. |
| `services/agroEngine/dataQuality.js:6` | Pontua idade, quantidade, faixa da última leitura e diferença entre as duas últimas. |
| `services/agroEngine/anomalyDetection.js:6` | Detecta igualdade exata de leituras e divergência entre queda de umidade e probabilidade de chuva. |
| `services/agroEngine/climateAnalyzer.js:7` | Extrai ET₀, chuva, temperatura/vento/umidade, satélite e multiplicador de secagem. |
| `services/agroEngine/mlPredictor.js:7` | Mínimos quadrados, corte após aumento >3 pp, fallback ET₀, projeções 6/12/24 h e tempo até limite. |
| `services/agroEngine/riskAndConfidence.js:8` | Pontua confiança e risco com descontos e limiares fixos. |
| `services/agroEngine/decisionMaker.js:8` | Escolhe `VERIFICAR_SENSOR`, `IRRIGAR`, `AGUARDAR`, `ATENÇÃO`, `MONITORAR`; produz explicações. |
| `services/agroEngine/observability.js:9` | Grava subconjunto da decisão em AgroLog. |
| `services/iaService.js:80` | Prompt e JSON do diagnóstico; em `:160`, resumo mensal em texto. |
| `services/satelliteService.js:12` | NASA POWER GWETTOP, filtragem de -999, cache e fallback. |
| `controllers/reportController.js:30` | Relatório mensal, agregação SQL, clima histórico e segunda entrada para Gemini. |
| `config/cultures.js:4` | Limites de quatro culturas, fallback Personalizado/desconhecida e Kc fixo. |
| `lib/env.js:4`, `lib/encryption.js:8` | Validação de configuração e AES-256-CBC dos tokens armazenados. |
| `lib/prisma.js:1`, `lib/redis.js:1` | Clientes compartilhados de banco e cache. |
| `prisma/schema.prisma:14` | User, Sensor, Talhao, AgroLog, ModelCalibration; índices por usuário/data. |
| `public/js/app.js:515` | Cálculos adicionais no cliente; dashboard `:1468`, análise `:2228`, relatório `:2630`. |
| `public/js/app.min.js:1`, `public/index.html:103` | Artefato efetivamente carregado. Comparação local confirmou correspondência com a transformação do build. |
| `public/views/dashboard.html:59`, `public/views/analysis.html:78`, `public/views/geo.html:7`, `public/views/monthly-report.html:1` | Exibição dos indicadores, diagnósticos, mapas e resumos. |
| `public/views/register.html:1`, `public/views/settings.html:1` | Configuração apresentada ao usuário. |
| `scripts/build.js:6`, `vercel.json:3` | Minificação e encaminhamento para função/static. |
| `tests/agroEngine.test.js:1` | Único arquivo de testes encontrado em `tests/`; sete casos. |

`services/emailService.js` é dependência do cadastro, mas não calcula o motor. `middleware/audit.js` registra autenticação, não uma trilha completa das decisões agro. Não existem diretórios `routes/` ou `middlewares/`; as rotas estão em `server.js` e os middlewares em `middleware/`.

### Contratos e método real

- O contrato implícito do histórico é `{umidade:number em %, data:Date/ISO}`, ordenado desc. Prisma entrega tipos numéricos/Date para linhas normais; módulos isolados não validam o contrato completo.
- O preditor é **regressão linear simples sobre o trecho recente**, com fallback heurístico. Não há treinamento persistente, uso de `ModelCalibration`, validação fora da amostra ou ajuste automático. `modelType` informa sempre `DETERMINISTIC_FALLBACK`, inclusive quando houve regressão.
- Há piso zero nas previsões e teto de 48 h no tempo até estresse. Não há teto 100 nas previsões nem limite máximo de taxa. O ±15% varia a taxa; não é intervalo de confiança estatístico calibrado.
- A chuva não altera a curva de umidade prevista: só muda a decisão posterior. ET₀ e cultura influenciam o fallback; cultura define o limite. Com regressão positiva, Kc/ET₀ não entram diretamente na taxa-base, apenas há multiplicadores climáticos heurísticos.
- `engineData` omite taxa, método, limite e déficit do preditor; parte aparece em `_meta`. O prompt omite `confidence` e `risk`, embora inclua qualidade, anomalias, clima, previsões, decisão e motivos.

## 3. Achados

Severidade considera impacto e alcançabilidade observados no código. **Confirmado** significa reprodução offline ou fluxo inequívoco; não significa incidente em produção. Os testes Txx e seu código completo estão na seção 6 e no apêndice. Um mesmo defeito pode quebrar várias expectativas; **37 falhas não equivalem a 37 vulnerabilidades**.

### Tabela de achados

| ID | Severidade | Categoria | Arquivo:linha | Descrição e impacto | Evidência | Correção sugerida |
|---|---|---|---|---|---|---|
| IA-01 | Crítico, condicional à configuração | Segurança | `lib/env.js:5`, `lib/env.js:14` | Chaves públicas de fallback permitem falsificar identidade e enfraquecem proteção dos tokens. | T27/T28 | Exigir segredos; falhar no boot; verificar/rotacionar se fallback foi usado. |
| IA-02 | Alto | Correção | `services/agroEngine/riskAndConfidence.js:20`, `services/agroEngine/decisionMaker.js:13` | Congelamento, salto e leitura velha não bloqueiam irrigação. | T01/T02/T03 | Impedimentos explícitos de qualidade e política única de idade. |
| IA-03 | Alto | Correção | `services/agroEngine/mlPredictor.js:58`, `services/agroEngine/decisionMaker.js:28` | Mistura mm/%, chuva tardia e suficiência sem balanço hídrico. Pode atrasar manejo em estresse. | Análise dimensional; T41 | Calibração física, chuva efetiva e chegada antes do horizonte tolerável. |
| IA-04 | Alto | Correção | `services/agroEngine/decisionMaker.js:30` | Déficit zero no limite faz 0 mm ser “chuva suficiente”. | T04 | Exigir chuva positiva e corrigir regra de fronteira. |
| IA-05 | Alto | Correção | `services/agroEngine/climateAnalyzer.js:41`, `services/agroEngine/anomalyDetection.js:55` | Hora local do provedor é interpretada no fuso do servidor. Chuva futura pode sumir. | T12/T13 | Timestamp absoluto, janela válida e offset/timezone explícitos. |
| IA-06 | Alto | Gemini | `services/iaService.js:93`, `services/iaService.js:146` | Resposta pode contrariar o motor ou ter tipo errado; confiança baixa não impõe texto seguro. | T18/T19/T20 | Validar estrutura e semântica; decisão imutável; fallback determinístico. |
| IA-07 | Alto | Correção | `controllers/sensorController.js:90`, `services/agroEngine/dataQuality.js:62` | Ingestão aceita valor bruto/lixo parcial; histórico inválido contamina regressão. | T06/T07/T16/T32 | Validar formato, finitude, escala e histórico inteiro antes de persistir/analisar. |
| IA-08 | Alto | Correção | `controllers/agroController.js:134`, `controllers/sensorController.js:100`, `public/js/app.js:2333` | Estado indisponível vira normal/IDEAL; caminhos paralelos dão orientação sem confiança. | T17/T36; leitura dos emissores | Contrato único para UI/WhatsApp; sem previsões numéricas quando inválido. |
| IA-09 | Alto | Arquitetura | `controllers/agroController.js:32`, `services/satelliteService.js:13` | HTTP de erro vira clima válido; Open-Meteo pode travar; erro Redis na NASA deixa promise pendente. | T25/T31 | Validar HTTP/schema, deadlines, propagar rejeição e degradar explicitamente. |
| IA-10 | Alto | Segurança | `services/iaService.js:160`, `controllers/reportController.js:159` | Resumo mensal não usa cota individual/cache; permite gastos fora do teto configurado. | T22 | Centralizar orçamento por usuário e cache de resumo. |
| IA-11 | Alto | Segurança | `public/js/app.js:811`, `controllers/authController.js:209` | JWT é exposto ao JS e persistido em localStorage, contrariando cookie exclusivo. | Código de login/cadastro/logout | Remover token do JSON/storage e limpar legado. |
| IA-12 | Alto | Correção | `public/js/app.js:2425`, `public/js/app.js:1647` | Série NASA e mapa NDVI fabricados são apresentados como observação e diagnóstico. | T36; PRNG e textos em `:1715` | Mostrar só observações; rotular/remover simulação e afirmações sem dado. |
| IA-13 | Médio | Correção | `services/agroEngine/mlPredictor.js:35`, `services/agroEngine/decisionMaker.js:59` | Limite superior da cultura é ignorado pelo motor; solo excessivamente úmido aparece seguro. | T05 | Modelar excesso/saturação e risco específico. |
| IA-14 | Médio | Correção | `public/js/app.js:583`, `controllers/authController.js:103` | Faixas divergem por Unicode; Personalizado não é configurável; cidade ausente vira São Paulo. | T30/T33/T35 | Configuração única, normalização e localização explícita. |
| IA-15 | Médio | Correção | `services/agroEngine/anomalyDetection.js:24`, `controllers/agroController.js:96` | Janela por contagem não sustenta “24h”; confiança/incerteza não calibradas. | T09/T10/T15/T29/T38 | Janela temporal, observações independentes, métricas de erro e política de reabastecimento. |
| IA-16 | Médio | Correção | `services/satelliteService.js:67`, `services/iaService.js:96` | Validade/proveniência do satélite insuficientes; datas antigas e null podem ser interpretados como leitura. | Fluxo `val !== -999`; UI `:2414` | Faixa/finitude/freshness; preservar unidade, origem e data no prompt/UI. |
| IA-17 | Médio | Correção | `controllers/agroController.js:229`, `controllers/reportController.js:46` | Agregações por fuso errado, ausência vira zero, mês parcial parece inteiro e proxy vira recomendação emitida. | T26/T40; SQL e filtro 92 dias | Timezone da propriedade, cobertura e nulos explícitos; eventos reais. |
| IA-18 | Médio | Gemini | `services/iaService.js:45`, `services/iaService.js:64` | Breaker acumula falhas entre sucessos; timeout não cancela; sem retry configurado. | T23/T24 | Reset/half-open, abort, retry limitado e parâmetros validados. |
| IA-19 | Médio | Arquitetura | `lib/redis.js:22`, `controllers/agroController.js:290` | Redis opcional quebra cota; concorrência duplica Gemini e caches não preservam snapshot. | T37/T39 | Redis obrigatório para IA ou fallback explícito; single-flight e chave versionada. |
| IA-20 | Médio | Arquitetura | `controllers/agroController.js:128`, `services/agroEngine/observability.js:26` | Log sem garantia de conclusão e sem entradas necessárias para reproduzir decisão. | Leitura de create/schema e busca por consumidores | Persistência com ciclo de vida garantido, snapshot e versão; feedback real. |
| IA-21 | Médio | Segurança | `package-lock.json:900`, `package-lock.json:3336` | npm audit identifica 14 pacotes vulneráveis, sem exploit do motor demonstrado. | Auditoria de 10/10/2026 | Atualização dirigida e teste; não aplicar downgrade automático. |
| IA-22 | Médio | Testes | `tests/agroEngine.test.js:7`, `package.json:6` | Sete testes não cobrem a cadeia nem contratos; falta script de teste. | 7/7 passam enquanto reproduções falham | Incorporar regressões isoladas e checks de contrato. |

### IA-01 — Segredos públicos de fallback

**Confirmado no código; exploração em produção é condicional.** `lib/env.js:5` fornece uma chave JWT conhecida e `lib/env.js:14` fornece chave AES conhecida. `middleware/auth.js:18` aceita tokens HS256 assinados pela chave resolvida. Em T28, um JWT de identidade sintética, criado com o fallback, atravessou o middleware com banco mockado. Nenhum token foi impresso ou usado contra serviço real.

**Impacto:** em instalação sem segredos próprios, alguém que conheça um ID pode assumir aquela identidade e acessar laudos/dados protegidos. Se obtiver ciphertexts, a chave AES pública compromete sua confidencialidade. Não afirmo que o deploy utiliza fallback: `.env`, painel Vercel e banco não foram consultados.

**Correção proposta:** remover defaults, exigir segredo forte e testar boot com configuração ausente. Verificar o uso histórico em procedimento separado; se confirmado, rotacionar e invalidar sessões. Diferença ilustrativa, sem aplicação:

```diff
--- a/lib/env.js
+++ b/lib/env.js
@@
-  JWT_SECRET: z.string().min(8, "JWT_SECRET deve ter no mínimo 8 caracteres").default("default_secret_key_12345"),
+  JWT_SECRET: z.string().min(32, "JWT_SECRET obrigatório, mínimo 32 caracteres"),
@@
-  ENCRYPTION_KEY: z.string().length(32, "ENCRYPTION_KEY deve ter exatamente 32 caracteres (usado para AES-256)").default("12345678901234567890123456789012"),
+  ENCRYPTION_KEY: z.string().refine(v => Buffer.byteLength(v, 'utf8') === 32,
+    "ENCRYPTION_KEY obrigatória, exatamente 32 bytes"),
```

### IA-02 — Confiança não bloqueia anomalias que o próprio motor detectou

`riskAndConfidence.js:20` reduz apenas metade da penalidade de qualidade; em `:36`, uma anomalia HIGH subtrai 40. `decisionMaker.js:13` só bloqueia nível LOW (<40 pontos). Com cinco leituras congeladas em 20%, o resultado é **confiança 50/MEDIUM, anomalia HIGH e IRRIGAR** (T01). Com `[20,70,69,68,67]`, intervalo de 15 min, qualidade 85/HIGH e confiança 83/HIGH, a taxa fica 36,8 pp/h e a ação é IRRIGAR (T02).

O detector de salto está em `dataQuality.js:77`; seu booleano `anomaliesDetected` não é convertido em anomalia usada na penalidade grave nem filtra o preditor. Já `getSensorStatus` considera >30 min inválido para tempo real (`agroController.js:74`), mas Data Quality aceita até 6 h como ONLINE. T03, leitura de 6 h, obteve confiança 85/HIGH e IRRIGAR. O `sensorState` apenas é anexado à resposta.

**Impacto:** falso alerta de seca e irrigação indevida sobre dados defeituosos/desatualizados. **Correção:** separar elegibilidade de decisão de pontuação informativa; bloquear recomendação operacional com sensor inválido, obsoleto ou falha grave confirmada; sinalizar salto como evento a confirmar, considerando reposição legítima. Unificar idade máxima e propagar exclusões para o preditor. Não basta ajustar -40 para outro número.

### IA-03 — Unidades incompatíveis e chuva tardia tratada como reposição suficiente

`mlPredictor.js:58` calcula `ET0 * Kc / 24` em mm/h e em `:63` multiplica por 1,5, usando o resultado como **pontos percentuais/hora** ao subtrair da umidade. `decisionMaker.js:28` compara mm com `deficitAtual` em pontos percentuais, com comentário de equivalência empírica 1 mm ≈ 1%. Não existe parâmetro de profundidade, curva do sensor, solo ou capacidade de armazenamento que justifique essa conversão.

**Prova dimensional:** se a leitura fosse conteúdo volumétrico, 10 mm distribuídos em 200 mm de solo representam 5 pp; em 1.000 mm, 1 pp. Um sensor resistivo normalizado precisa ainda de calibração própria. O fator 1,5 não estabelece essas unidades. A descrição oficial informa ET₀ como lâmina em mm e chuva como soma da hora, não variação percentual do sensor. [Open-Meteo, definição de variáveis](https://open-meteo.com/en/docs#hourly-parameter-definition)

`climateAnalyzer.js:56` pondera volume por probabilidade de exceder 0,1 mm, sem demonstrar que o volume é uma distribuição condicional adequada para esse produto; considerar isso **heurística não validada**, não expectativa estatística estabelecida. Além disso, a decisão agrega 12 h sem preservar chegada. T41: 30% em milho, déficit 10 pp, chuva de 15 mm somente daqui a 11 h: passa de IRRIGAR para AGUARDAR apesar de estresse já presente. Até 80% do déficit é considerado suficiente.

**Impacto:** subestimação/superestimação de secagem e adiamento de irrigação em estresse. **Correção:** definir o que o % mede e calibrá-lo; manter balanço em unidade física coerente, chuva efetiva, perdas, profundidade e estágio da cultura. Distinguir previsão sem irrigação da decisão de manejo. Na ausência desses parâmetros, apresentar tendência empírica e incerteza, sem afirmar reposição suficiente ou “momento ideal” validado.

### IA-04 — No limite crítico, zero milímetros satisfaz a regra de chuva

`deficitAtual=0` e `hoursUntilStress=0` entram no ramo crítico. A comparação `0 >= 0 * 0.8` é verdadeira. T04 com milho a 40%, chuva/probabilidade zero: **AGUARDAR**, com explicação de que **0 mm reverterão o quadro**. É bug algébrico independente da calibração agronômica.

**Impacto:** falsa justificativa para adiar manejo exatamente no limiar. **Correção mínima**, ainda insuficiente para resolver IA-03:

```diff
--- a/services/agroEngine/decisionMaker.js
+++ b/services/agroEngine/decisionMaker.js
@@
-        if (expectedRainVolume >= (deficit * 0.8)) {
+        if (expectedRainVolume > 0 && expectedRainVolume >= (deficit * 0.8)) {
```

### IA-05 — Janela de chuva deslocada pelo fuso

A requisição usa `timezone=auto` (`agroController.js:30`). Os arrays ISO locais são interpretados com `new Date(timeArray[i])`, ignorando `utc_offset_seconds`. No teste em UTC, às 15:00Z/12:00 Recife, chuva de 10 mm marcada 13:00 local foi considerada passada; o resultado foi 0 mm e 0% (T12). O mesmo erro desloca as “3 horas anteriores” de anomalias. O provedor documenta o offset e oferece timestamps Unix absolutos. [Open-Meteo, parâmetros de tempo](https://open-meteo.com/en/docs)

Se não houver timestamp >= agora, `startIndex` continua zero e recircula o começo da série: T13 recuperou 20 mm de ontem como chuva futura. **Impacto:** irrigação desnecessária antes da chuva ou espera baseada em chuva que já passou. **Correção:** normalizar instantes na fronteira, preferencialmente Unix; representar corretamente o intervalo precedente de precipitação; não usar índice zero como fallback de janela vencida. Testar UTC, Recife e outros fusos brasileiros. ET₀ diário deve também ser selecionado pela data local, evitando `[0]` stale na virada do dia durante cache.

### IA-06 — JSON não garante coerência do Gemini

Há bons guardrails no prompt (`iaService.js:105`): proibição de inventar números, aviso de baixa qualidade e distinção observado/estimado/indisponível. Porém, não há ação enumerada na resposta, validação do texto contra a decisão nem validação Zod após `JSON.parse`. `risco_identificado` é descartado. O payload não inclui `confidence.level/score`, `risk`, horário/validade das fontes, escala do sensor ou versão do motor.

T19 forneceu resposta JSON **estruturalmente compatível**, mas “Irrigue imediatamente com 999 litros” para decisão VERIFICAR_SENSOR. O serviço devolveu exatamente esse texto. T20 aceitou objeto no campo `laudo_textual`. T18 confirmou geração mesmo sem histórico/confiança zero. Gerar um aviso com confiança baixa pode ser legítimo; o defeito é permitir texto livre sem obrigação verificável de preservar o impedimento. As previsões construídas a partir de 50% fictícios também são enviadas como DADOS BRUTOS (FATO).

T21 confirma um ponto positivo: JSON malformado, truncado e texto ausente são rejeitados; o controller responde 503. Não foi provocada alucinação real nem filtro real de segurança; os testes demonstram **ausência de defesa caso a resposta venha inadequada**. O SDK declarar schema não substitui validação de valores, conforme a própria documentação. [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output)

**Correção:** manter decisão e números operacionais em campos determinísticos imutáveis; para impedimentos, responder aviso determinístico antes de chamar o LLM. Incluir confiança e proveniência, pt-BR explícito, proibição de contrariar ação e de adicionar volume/duração. Validar tipos, tamanho, campos obrigatórios, término/bloqueio e coerência. Não confiar apenas em regex de palavras para detectar orientação invertida.

Exemplo **somente estrutural**, que não resolve sozinho a contradição semântica:

```diff
--- a/services/iaService.js
+++ b/services/iaService.js
@@
-        const jsonResult = JSON.parse(response.text);
+        const jsonResult = z.object({
+            laudo_textual: z.string().trim().min(1).max(2000),
+            risco_identificado: z.string().trim().min(1).max(500)
+        }).strict().parse(JSON.parse(response.text));
```

### IA-07 — Dados inválidos atravessam ingestão e histórico

`sensorController.js:90` usa `parseFloat` e rejeita só NaN. `1023raw` vira 1023; números negativos/maiores que 100 não são bloqueados. T32 mostrou **persistência + tentativa de alerta mockada**, retornando 1023% e ENCHARCADO. Não há conversão/calibração 0–1023/0–4095: se o firmware já entrega percentuais calibrados, valores normais funcionam; o contrato do firmware não foi disponibilizado.

Data Quality verifica apenas o intervalo da última leitura. Em T16, `[50,51,200,199,198]` resultou em qualidade 100, confiança 90 e secagem de **177,6 pp/h**. Logo, um bruto inválido gravado pode continuar influenciando quando a leitura atual já voltou ao normal. T11 expôs previsão >100% mesmo com qualidade INVALID; os cálculos continuam e são enviados na resposta.

Nos testes de contrato de módulo, `null`, `undefined`, NaN e string não são corretamente invalidados (T06); `null` age como zero e NaN pode produzir MONITORAR. Strings mudam a regressão por concatenação em `sumY += y` (T07: 4 vs 0,29 pp/h). **Alcançabilidade delimitada:** Prisma Float não nulo e o parser atual reduzem a chance desses tipos específicos chegarem pelo caminho normal; bruto >100 e histórico contaminado são alcançáveis pelo fluxo Blynk mostrado.

**Correção:** parsing integral conforme contrato do provedor, `Number.isFinite`, faixa/unidade explícitas e calibração antes da gravação. Validar todas as observações, datas e duplicatas. Dados inválidos devem resultar em previsão indisponível, não em curva “corrigida” por clamp silencioso. Registrar descarte com motivo sem expor token.

### IA-08 — A proteção não chega a todos os canais de orientação

`agroController.js:134` inicializa status normal e não mapeia VERIFICAR_SENSOR. Em T17, sem histórico, retorna confiança 0, ação VERIFICAR_SENSOR, **status normal e 34,78 h até estresse**, calculadas a partir de 50% arbitrários. O dashboard tem ramo `indisponivel` (`app.js:1538`), que esse controller nunca produz; a análise inicia rótulo IDEAL e só trata crítico/alerta (`:2333`). T36 executou a função de apresentação com mocks e confirmou IDEAL.

Separadamente, `/sensores/umidade` e WhatsApp emitem diagnóstico de irrigação baseado só no valor atual (`sensorController.js:100`, `:126`). Não consultam o gate do Motor Agro. A análise também chama os cálculos locais sem `sensorState` e usa `window._latestUmid || 50` (`app.js:2561`, `:2576`), convertendo umidade real zero em 50 e podendo reaproveitar estado anterior após falha de coleta.

**Impacto:** texto de sensor inválido ao lado de selo saudável; contagem de horas fictícia; alerta operacional que ignora a confiança calculada. **Correção:** UI, texto, horário e alertas devem derivar da mesma decisão versionada. `null` para previsão indisponível; zero continua zero; limpar estado ao trocar usuário/falhar coleta. Remover diagnósticos paralelos ou limitar sua finalidade a descrição observacional.

Contenção no adaptador legado — exige atualizar consumidores para aceitar `null`:

```diff
--- a/controllers/agroController.js
+++ b/controllers/agroController.js
@@
     else if (recommendation.action === 'AGUARDAR') statusAntigo = 'alerta';
+    else if (recommendation.action === 'VERIFICAR_SENSOR') statusAntigo = 'indisponivel';
@@
-        tempoHoras: predictor.hoursUntilStress,
+        tempoHoras: statusAntigo === 'indisponivel' ? null : predictor.hoursUntilStress,
```

### IA-09 — Falha externa vira dado normal ou espera sem conclusão

**Open-Meteo:** `agroController.js:32` não verifica status HTTP, schema, timeout/deadline, tamanho do corpo ou interrupção da resposta. T31 enviou HTTP 429 com JSON de erro: foi cacheado por 10 min e devolvido como HTTP 200 com **IRRIGAR**. O Climate Analyzer preenche 25 °C, 50% de umidade do ar, ET₀ zero e sem chuva (`climateAnalyzer.js:9`); a confiança não contabiliza ausência de clima. Falha de rede rejeitada derruba `/clima` com 500, sem resultado determinístico degradado.

**NASA/Redis:** `new Promise(async resolve => ...)` em `satelliteService.js:13` não propaga rejeições do executor assíncrono. Em T25, `redis.get` rejeitou: houve rejeição não tratada e a promise externa permaneceu pendente. O `try/catch` do controller não a resgata. O fallback repete acesso Redis e também pode rejeitar sem resolução. Esses awaits ocorrem antes de consultar cache de clima/Gemini.

**Impacto:** orientação com clima inventado, indisponibilidade e consumo de duração da função. **Correção:** cliente externo com status/schema/deadline, abort/destruição, limite de corpo e marcação de ausência. Usar função `async` normal para cache e somente envolver callbacks HTTP em Promise com `resolve/reject`. Cache indisponível deve ter política explícita e não bloquear fontes que poderiam degradar.

Não se concluiu que 15 s de Gemini excedem o limite Vercel. `vercel.json:1` não declara `maxDuration` e não foi lida a configuração do projeto. Os limites atuais variam por plano/runtime; o problema comprovado é **ausência de orçamento total**, agravada por chamadas sequenciais e esperas sem término. [Limites oficiais de Vercel Functions](https://vercel.com/docs/functions/limitations)

### IA-10 — Endpoint mensal contorna orçamento de Gemini

`traduzirDiagnostico` usa `checkRateLimit(userId)`; `gerarResumoMensal` não recebe identidade nem checa cota (`iaService.js:160`). `reportController.js:159` o chama a cada GET elegível, sem cache. T22 simulou cota esgotada (21 chamadas): resumo ainda chamou o gerador e contador não foi consultado.

**Impacto:** usuário autenticado com >=10 leituras pode consumir chamadas pagas além de `GEMINI_MAX_CALLS_PER_USER_DAY`. Existe rate limit geral de **120 req/min por IP** (`server.js:106`); portanto não é ausência absoluta de limitação, mas falta do orçamento por usuário prometido na configuração. `maxOutputTokens` também não é definido.

**Correção:** serviço único para todas as chamadas com identidade obrigatória, reserva de cota atômica, limite de saída e de concorrência; cache por usuário/período/versão/hash dos dados mensais. A janela atual é 24 h desde o primeiro INCR, não “dia civil” do agricultor. Decidir e documentar qual regra se deseja.

### IA-11 — JWT no localStorage apesar de cookies httpOnly

Login e cadastro retornam `token` em JSON (`authController.js:145`, `:209`); a SPA grava `localStorage.setItem('jwt', currentToken)` (`app.js:811`, `:1009`). Logout (`:339`) limpa variáveis e cookie, mas não remove o item; middleware aceita token em cabeçalhos (`auth.js:9`). `setupAuthFetch` já usa cookies, tornando a cópia desnecessária.

**Impacto:** script executado na origem pode extrair um bearer token reutilizável; a cópia persiste após logout até expiração/revogação aplicável. **Não foi demonstrado XSS explorável**, e a saída Gemini usa inserção segura como texto. O defeito é uma exposição adicional confirmada, contrariando `SECURITY.md:11`–`:12`.

**Correção:** retirar token do JSON e gravação em storage; limpar a chave legada no boot/logout e revisar necessidade de aceitar cabeçalhos. Exemplo de mudança a replicar nos dois fluxos:

```diff
--- a/controllers/authController.js
+++ b/controllers/authController.js
@@
-        res.json({ user: toSafeUser(user), token });
+        res.json({ user: toSafeUser(user) });
--- a/public/js/app.js
+++ b/public/js/app.js
@@
-            currentToken = data.token;
             currentUser = data.user;
-            localStorage.setItem('jwt', currentToken);
+            localStorage.removeItem('jwt');
```

### IA-12 — Apresentação fabrica observações e conclusões agronômicas

`app.js:2425` transforma um único ponto NASA em sete datas, com `Math.sin` e valores diferentes. T36: único ponto 50 em 09/10 virou `[51,52,49,48,50,52,50]`, de 03/10 a 09/10. A tela diz “Últimos 7 dias observados por satélite” (`views/analysis.html:604`). Não são observações retornadas pela NASA.

O dashboard cria 600 pontos pseudoaleatórios (`app.js:1647`), denomina a camada NDVI (`:1681`) e interpreta cores como queda de fotossíntese, vigor ou vegetação saudável (`:1715`). O fluxo NASA solicita apenas GWETTOP, não bandas de refletância ou NDVI. Isso ocorre no caminho normal, não só no `demoData`. O polígono também é gerado, não um limite medido da propriedade; o DTO nem retorna lat/lon (`authController.js:34`) enquanto o mapa os procura e usa fallback São Paulo (`app.js:1608`).

**Impacto:** agricultor pode direcionar manejo por manchas inventadas ou acreditar em uma tendência temporal inexistente. **Correção:** exibir somente datas/valores recebidos; não interpolar como dado observado. Remover afirmações de NDVI/fotossíntese até haver fonte e método reais, ou mostrar simulação claramente identificada sem recomendação espacial. Expor coordenadas apropriadas no DTO quando necessário e pedir limites reais para análise por área.

### IA-13 — Excesso de umidade não participa do motor de risco

`predictMoisture` usa `minIdeal`, mas não `maxIdeal`. `makeDecision` considera somente déficit e chuva. T05 com milho a 95%, acima do máximo configurado 70%, retornou MONITORAR e “Condições estáveis e dentro da faixa segura”, risco LOW. O diagnóstico simples do sensor diria ENCHARCADO.

**Impacto:** falsa tranquilização e inconsistência diante de excesso hídrico. **Correção:** transportar ambos os limites e modelar risco de excesso separadamente do risco de seca; não declarar segurança geral com base exclusivamente em horas até déficit. As faixas precisam de validação de escala/solo, conforme IA-03.

### IA-14 — Configuração e culturas divergem entre camadas

As quatro culturas do enum de registro têm correspondência no backend; Personalizado e cultura desconhecida caem em 40–60%, Kc 1,0 (`config/cultures.js:9`). Não há campos de limites personalizados em `User` nem na rota de atualização. Isso não é personalização de faixa por usuário, apenas seleção de tabela fixa.

O frontend contém literais Unicode decompostos para hortaliças e cana (`app.js:583`), diferentes dos valores compostos aceitos pelo backend. T35 provou **Hortaliças: mínimo 40 no frontend vs 50 no backend; Cana-de-açúcar: 40 vs 35**. `toLowerCase()` não normaliza Unicode. Correção provisória; preferir tabela única servida pelo backend:

```diff
--- a/public/js/app.js
+++ b/public/js/app.js
@@
-    switch ((tipo || '').toLowerCase()) {
+    switch ((tipo || '').normalize('NFC').toLowerCase()) {
@@
-        case 'hortaliças': return { min: 50, max: 80, center: 65 };
-        case 'cana-de-açúcar': return { min: 35, max: 60, center: 47.5 };
+        case 'hortaliças': return { min: 50, max: 80, center: 65 };
+        case 'cana-de-açúcar': return { min: 35, max: 60, center: 47.5 };
```

Cidade é opcional (`validation.js:9`); T33 confirmou aceite sem cidade e o controller atribui São Paulo/SP (`authController.js:103`). Isso pode gerar clima válido de local errado. Recomenda-se estado explícito “localização não configurada”. Na atualização, `geolocate` retorna strings (`:80`) e `updateConfig` as passa sem conversão para campos Float (`:265`); incompatibilidade de contrato a corrigir com parsing finito/faixas. A rejeição efetiva pelo Prisma de produção **não foi executada**. A remoção de tokens usa null (`:278`, `:280`) embora os campos Prisma sejam String não opcionais — ajustar contrato de ausência.

### IA-15 — Detecção e confiança não refletem duração, independência ou calibração

Cinco pontos iguais em quatro minutos já geram mensagem “não mudou nas últimas 24h” (T15); a janela só tem teto de idade e não duração mínima. Na cadência normal de gravação de 15 min, cinco pontos podem cobrir apenas 1 h e vinte pontos 4 h 45 min. Igualdade é exata, sem tolerância: quantização pode causar falso congelamento; pequena oscilação num sensor travado pode impedir detecção. Salto legítimo de 30 para 65% recebe penalidade mesmo com reposição plausível (T38); não foi simulado evento agronômico real.

`CLIMATE_MISMATCH` usa **probabilidade prevista** >80%, não precipitação observada (`anomalyDetection.js:63`), e compara essa janela de 3 h com a queda entre extremos de até 24 h (`:66`). Portanto não comprova que o solo secou durante chuva efetiva. A anotação deve expressar suspeita e comparar intervalos compatíveis, com precipitação observada/evento de irrigação quando disponível. Os limiares 25 pp/30 min, aumento de 3 pp e margem de 15% não têm justificativa experimental encontrada; não foram declarados incorretos para todas as propriedades, mas carecem de calibração.

T09: cinco timestamps idênticos/dados diferentes dão confiança HIGH apesar de regressão degenerada; o denominador zero cai em fallback, evitando divisão por zero, mas sem penalidade correspondente. T08 aceita timestamp futuro como online. T10 mostra falta de normalização da ordem (0,667 h vs 4,667 h ao inverter histórico); a consulta atual ordena desc, portanto esse último é defeito de contrato defensivo, não desordem confirmada no Prisma. Data inválida na última leitura cai em INVALID, mas datas inválidas em pontos antigos não são validadas.

`riskAndConfidence.js:27` exige 50 pontos para sair de “histórico parcial”, porém o controller entrega no máximo 20. A mensagem de “calibração em andamento” não corresponde a processo implementado. Não há erro residual, validação temporal ou evidência para a margem fixa de 15%. O preditor trata a última leitura como o presente, sem projetar o tempo já decorrido desde sua data.

**Impacto:** falsas anomalias e precisão aparente para amostras curtas/irregulares. **Correção:** relógio injetável, janela por tempo, ordenação/duplicatas, mínimo de cobertura, estado de reposição hídrica, avaliação de resíduos e backtest por cultura/solo. Risco de manejo e risco de decisão inválida devem ser diferentes — atualmente LOW confidence vira “risco 80” sem dizer se há seca real.

### IA-16 — Satélite sem validação suficiente de validade e significado

`satelliteService.js:67` só elimina o número -999: null passa e `null * 100` vira zero; valores fora de [0,1] também passam. O primeiro valor disponível pode ter quase 30 dias e ainda influenciar multiplicador (`climateAnalyzer.js:86`). O prompt recebe o número sem data/fonte (`iaService.js:96`); o frontend considera qualquer objeto satélite disponível, inclusive `{umidadeMacro:null, fonte:'Indisponível'}` (`app.js:2413`), e exibe `null%`.

A multiplicação de GWETTOP por 100 é aceitável **como porcentagem de saturação relativa regional**, não comprova equivalência com % do sensor local. A NASA distingue GWET* adimensionais de conteúdo volumétrico; converter para lâmina requer profundidade e outras informações. [NASA/GMAO, unidades de umidade](https://gmao.gsfc.nasa.gov/gmao-products/merra-2/faq_merra-2/)

**Impacto:** dado ausente/antigo tratado como região seca e divergência indevida entre escalas. **Correção:** validação de número/intervalo, `observedAt`, idade máxima, unidade e resolução; preservar metadados no prompt. Comparação direta em `app.js:714` deve ser calibrada ou removida. O fallback do serviço sem dados é uma boa intenção, mas a UI e o prompt precisam respeitá-lo.

### IA-17 — Estatísticas temporais e mensais misturam ausência, data e proxy

T26: leitura `2026-10-05T01:00Z` (domingo 22h em Recife) foi atribuída à segunda-feira em UTC (`agroController.js:229`). A resposta representa últimos sete dias móveis somente seg-sex, sem datas; descarta fins de semana e retorna zero quando não há leitura (`:241`). Esses zeros aparecem em gráficos; algumas funções os filtram, não todas as interpretações.

O mensal monta limites pelo fuso do servidor (`reportController.js:46`) e usa `DATE_TRUNC('day', data)` sem fuso de propriedade (`:54`), enquanto clima é por data local. Só busca últimos 92 dias, mas aceita qualquer ano/mês. Um mês parcialmente coberto é marcado válido com apenas uma data; não há indicador de cobertura. `null` climático vira zero (`:116`). `recomendacoesEmitidas` enviado ao Gemini é contagem de dias com mais leituras SECO do que IDEAL (`:81`), não quantidade de decisões ou alertas emitidos.

A média de leituras também não é média de tempo: a ingestão registra mais pontos quando há variação >=2 pp. **Hipótese a quantificar com dados de campo:** os percentuais mensais podem super-representar períodos de instabilidade; a implementação permite esse viés.

T40 revelou ainda query inválida devolvendo 500: Zod 4 fornece `issues`, mas o controller acessa `error.errors[0]` (`:37`). Correção pontual:

```diff
--- a/controllers/reportController.js
+++ b/controllers/reportController.js
@@
-            return res.status(400).json({ error: parseResult.error.errors[0].message });
+            return res.status(400).json({ error: parseResult.error.issues[0].message });
```

**Correção geral:** timezone persistido por propriedade, limites UTC derivados dele, datas nas respostas e `null` para ausência. Escolher fonte histórica pelo período, reportar cobertura completa/parcial e contar eventos AgroLog quando se disser “recomendações emitidas”. Nomear corretamente métricas por amostra ou ponderá-las por tempo.

### IA-18 — Resiliência do Gemini incompleta

O breaker é global ao módulo/instância, compartilhado entre usuários e entre diagnóstico/resumo, mas não entre instâncias serverless. Sucessos não zeram falhas. T23 executou falha/sucesso/falha/sucesso/falha; a próxima chamada foi bloqueada. Pode indisponibilizar todos os usuários da instância por falhas espaçadas; cold starts ignoram esse estado.

`runWithTimeout` apenas rejeita Promise.race. T24 confirmou ausência de `abortSignal`/HTTP timeout no request do SDK; a operação subjacente não recebe cancelamento. Não foi medida cobrança após timeout. Não há retry/backoff configurado para 429/5xx; conferido também no SDK instalado, cujo caminho `apiCall` só retenta se houver `retryOptions` (`node_modules/@google/genai/dist/node/index.cjs:13936`).

Modelo e enable/timeout/cota são configuráveis (`iaService.js:12`); `temperature`, `maxOutputTokens` e orçamento de raciocínio não são definidos. Não existe limite efetivo de três parágrafos além da descrição do schema. `parseInt(...) || default` aceita negativos e substitui zero silenciosamente. No resumo mensal nem há log de tokens.

**Correção:** validar configuração, cancelar no SDK com deadline total, classificar erros, resetar sucessos e controlar half-open. Fazer retries limitados com jitter/Retry-After dentro do orçamento total, sem repetir indiscriminadamente respostas inválidas. Definir limite de saída e avaliar temperatura em fixtures; temperatura baixa não prova fidelidade.

Quanto ao nome `gemini-2.5-flash`: a documentação consultada em 10/10/2026 informa ausência de data de desligamento, mas acesso à família 2.5 restrito a usuários que já a utilizavam. **Não é correto declarar o modelo desligado nem garantir acesso neste projeto**. Verificação de habilitação deve ocorrer em ambiente autorizado, sem chamada paga nesta revisão. [Depreciações oficiais Gemini](https://ai.google.dev/gemini-api/docs/deprecations/)

### IA-19 — Redis/cache têm contratos e concorrência incompletos

`REDIS_URL` é opcional (`lib/env.js:16`), mas o fallback (`lib/redis.js:22`) não implementa `incr/expire`. T37: IA habilitada sem Redis falha em `redis.incr is not a function`, embora o app permita iniciar. Não se deve “resolver” desativando cotas silenciosamente em produção.

T39: duas requisições concorrentes com mesmo payload fazem duas gerações porque ambas passam pelo cache miss antes de setex. Cache de IA inclui `dataQuality.lastUpdate`; cada nova observação pode invalidá-lo mesmo com números quase iguais. O hash não inclui versão do prompt/modelo: troca de `GEMINI_MODEL` pode reaproveitar laudo anterior por até 3 h. Há dois snapshots de sensor (findFirst e findMany) e duas execuções da pipeline entre `/clima` e `/insights-ia`, podendo texto/tempo/status referir-se a estados diferentes.

O par `INCR`/`EXPIRE` não é atômico: interrupção entre eles pode deixar chave sem TTL. Isso é **risco de falha concorrente**, não incidente reproduzido. O cache semanal não é invalidado ao gravar sensor. Cache climático é invalidado antes de salvar a nova localização (`authController.js:274`), sem await; há possibilidade de regravação com coordenadas antigas. Não foi detectado compartilhamento de cache privado entre usuários.

**Correção:** identidade e snapshot únicos por avaliação, configuração Redis coerente, single-flight distribuído com expiração segura, cotas atômicas, chave de modelo/prompt/política e política de invalidação explícita. Consultas de sensores usam índice `[userId,data]`; o núcleo com 20 pontos não bloqueia materialmente CPU. Gargalos maiores são rede sequencial, recomputação/logs e queries de histórico sem teto (`sensorController.js:148`, `agroController.js:217`).

O comentário de “no máximo 1000 registros” na média semanal não corresponde a um `take`/limite. `getHistorico` aceita `limit/page` via parseInt sem mínimo/máximo. Recomenda-se schema de query com teto e agregação no banco para médias; não foi feito benchmark de volume real nem alegado DoS comprovado.

### IA-20 — Trilha insuficiente e escrita sem garantia serverless

`logAgroDecision(...).catch(...)` não é aguardado (`agroController.js:128`). Sem integração de ciclo de vida, não há garantia de gravação antes do encerramento da execução serverless. **Perda efetiva de log em produção não foi testada.** O módulo captura erros sem derrubar o usuário, o que é bom, mas não oferece métrica durável da falha.

`dadosUtilizados` armazena só score/status (`observability.js:26`), sem observações, clima, fonte/data NASA, cultura, parâmetros/versão, taxa, deadline ou resposta Gemini. Não permite recomputar a decisão. `acaoProdutor`, `resultadoReal`, `erroPrevisao` e `ModelCalibration` existem no schema, mas não foi encontrado código que os preencha/consuma. `talhaoId` fica null; o fluxo atual é por usuário, não por talhão.

**Impacto:** difícil distinguir erro de sensor, algoritmo, clima ou geração; promessa de feedback/calibração não sustentada. **Correção:** snapshot mínimo versionado e rastreável, retenção/redação de dados, resultado de geração e métricas de falha/latência/cache; await apropriado ou tarefa durável suportada pelo runtime. Evitar duas gravações idênticas por visita à tela. Logs atuais incluem email/nome em falhas Blynk/WhatsApp (`sensorController.js:95`, `:53`), exigindo finalidade/retenção; não foram encontrados prompts completos ou chaves explicitamente logadas no caminho normal.

### IA-21 — Dependências com advisories conhecidos

Executado `npm audit --json --ignore-scripts`, sem instalação, `audit fix` ou alteração de lockfile. A primeira consulta falhou por DNS no sandbox; a segunda, autorizada para rede, concluiu com **exit 1 por vulnerabilidades**: **14 pacotes**, 1 crítico, 9 altos e 4 moderados; 332 dependências contabilizadas. Os números são de pacotes afetados, não de exploits independentes.

| Pacote resolvido no lock | Severidade npm | Uso/relevância observada |
|---|---|---|
| `proxy-addr 2.0.7` | Crítico | Transitivo Express. O advisory exige confiança por sub-rede IPv6 mal definida; aqui há `trust proxy = 1`, não essa sub-rede. **Exploração específica não demonstrada.** |
| `axios 1.18.1` | Alto | Blynk, WhatsApp e histórico climático; advisories de redirecionamentos/DoS e gadgets dependentes de pré-condições. URLs principais são fixas. |
| `source-map-js 1.2.1` | Alto | Dependência de runtime instalada; não encontrado processamento de source map do usuário pelo motor. |
| `express 4.22.2`, `body-parser 1.20.6`, `qs 6.15.3` aninhado | Moderado | Entrada HTTP; há qs 6.16.0 direto, mas isso não elimina cópias aninhadas afetadas. |
| `ip-address 10.5.0` | Moderado | Transitivo; não demonstrado uso vulnerável como controle de SSRF neste motor. |
| `@prisma/config 6.19.3`, `deepmerge-ts 7.1.5`, `prisma 6.19.3` | Alto | Marcados dev no lock, relacionados a ferramentas/configuração. `@prisma/client` é importado no runtime mas declarado dev no package; conferir política de instalação no deploy. |
| `brace-expansion 5.0.9`, `braces 3.0.3`, `chokidar 3.6.0`, `nodemon 3.1.14` | Alto | Árvore dev; não prova exposição de produção. |

**Correção:** atualizar árvore/lock em mudança dedicada, testar compatibilidade e confirmar dependências necessárias em runtime. Não aplicar sugestões automáticas de downgrade de Prisma/nodemon: o audit as indicou como correções semver-major, sem avaliar compatibilidade. A nota crítica do pacote **não foi copiada como severidade crítica do sistema** porque a pré-condição específica não está configurada. [Advisory proxy-addr](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), [advisory Axios/redirecionamento](https://github.com/advisories/GHSA-mghh-pgcx-3jjj), [advisory qs](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g).

### IA-22 — Suíte deixa passar as falhas da cadeia

Só existem dois testes de preditor e cinco de decisão. Os últimos injetam confiança pronta (`agroEngine.test.js:9`), de modo que o teste de LOW não verifica se uma falha real do sensor chega a LOW. Não há testes de Data Quality, Anomaly Detection, Climate Analyzer, Risk & Confidence, controllers, Gemini, Redis, satélite, timezone ou UI. Não há script `test` em `package.json:6`.

**Impacto:** mudanças e correções podem preservar testes verdes enquanto a orientação continua incorreta. **Correção:** testar cadeia real de funções puras e contratos de integração, com relógio/controladores mockados e bloqueio de rede. Não depender de testes que somente repetem constantes atuais de fórmulas não calibradas. Os casos desta revisão devem ser refinados e incorporados após concordância sobre a política de segurança e agronomia.

### Áreas verificadas sem falha direta encontrada

- **Isolamento de consultas:** rotas agro/sensores/mensal têm `auth`; IDs vêm de `req.user.id`, não de query/body. As consultas de sensores, usuário e SQL mensal possuem escopo de usuário. T34 tentou `query.userId=u2` com identidade u1 e observou apenas u1 em queries/cache. Isso não neutraliza IA-01 nem constitui teste de penetração real.
- **SQL:** Prisma e tagged template `$queryRaw` com parâmetros, sem concatenação de input no SQL mensal. Índices `[userId,data]` e `[userId,timestamp]` existem. Sem evidência de N+1 por leitura; há queries redundantes por requisição e ausência de teto em alguns históricos.
- **SSRF:** destinos Open-Meteo/NASA/Nominatim são fixos; coordenadas passam por parseFloat e cidade/endereço por encodeURIComponent. BLYNK_URL é configuração do servidor, não URL enviada na requisição. Não encontrei caminho comprovado para escolher host arbitrário via campos do usuário. Tokens/telefone em query precisam ser codificados com URLSearchParams; não declarei SSRF sem demonstração.
- **Prompt injection:** nome/cidade/notas não entram no laudo; cultura entra por enum HTTP e validação adicional no serviço. Regex isolada não é defesa universal contra instruções, mas não foi confirmado vetor de prompt injection pelas rotas atuais. Não foi feito teste adversarial com Gemini real.
- **Exposição ao frontend:** `toSafeUser` retorna flags de integrações, não Blynk/Gemini/CallMeBot keys. Diagnóstico Gemini usa createTextNode/textContent, sem renderização de HTML do modelo. Isso é bom para XSS; Markdown solicitado aparece literalmente.
- **Erros/segredos:** controller agro retorna erro genérico, sem stack ao cliente; não há log explícito de GEMINI_API_KEY/BLYNK_TOKEN/JWT_SECRET no caminho normal. Exceção adjacente: cadastro retorna `err.message` (`authController.js:149`), que deve ser genérico para não revelar detalhes internos. Respostas reais dos provedores e logs de produção não foram acessados.
- **Autenticação:** algoritmo HS256 é fixado; bcrypt cost 12, cookies httpOnly/SameSite Strict, bloqueio por tentativas e verificação de alteração de senha estão implementados. JWT é assinado, não sessão “criptografada”; a persistência adicional no storage é IA-11. Usuário inexistente não é bloqueado no próprio middleware (`auth.js:24`/`:31`), embora controllers principais retornem 404; endurecer sem alegar vazamento confirmado.
- **Fallbacks úteis:** ausência de histórico gera ação VERIFICAR_SENSOR dentro do núcleo; denominador zero de regressão retorna fallback, evitando divisão por zero; JSON inválido do Gemini vira 503; frontend normalmente mantém resultado de `/clima` se só Gemini falhar. Os defeitos estão na propagação/validação e indisponibilidade conjunta, não na inexistência total de fallback.

## 4. Divergências README × código

| Promessa/documento | Implementação encontrada | Avaliação |
|---|---|---|
| `README.md:15`: tempo real | Coleta Blynk por GET da tela, escrita seletiva e motor sobre histórico; sem job de ingestão encontrado. | Monitoramento dependente do dashboard aberto; não evidência de coleta contínua autônoma. |
| `README.md:16`: clima + ET₀ | Integração existe; uso em taxa mistura unidades e defaults não marcam ausência. | Entrega parcial, IA-03/05/09. |
| `README.md:17`: tendência regional de satélite | GWETTOP regional existe; UI pode fabricar série de sete dias e mapas. | IA-12/16; representação de “umidade real na coordenada exata” em `views/dashboard.html:194` exagera a fonte. |
| `README.md:19`: integridade dos sensores | Último valor/idade/count; histórico todo não é validado. | IA-02/07/15. |
| `README.md:20` e `:123`: filtro de ruído/congelamento que evita acionamentos indevidos | Flags/descontos, sem exclusão do histórico ou bloqueio necessário. | Não cumpre proteção alegada; não há acionamento físico encontrado, há recomendações/WhatsApp. |
| `README.md:21`: ML Predictor/momento ideal | Regressão simples e heurísticas, sem treino/calibração/backtest; chuva não entra na projeção. | Estima tendência/limiar, não valida “ideal”. |
| `README.md:22` e `:124`: confiança evita laudo perigoso | LOW bloqueia decisão pura, mas defeitos não chegam a LOW; Gemini/UI podem ignorar sinalização. | IA-02/06/08. |
| `README.md:23`: laudo traduz diagnóstico | Prompt inclui decisão, mas texto não é validado contra ela. | Entrega tradução sem garantia de fidelidade. |
| `README.md:24`: sessões criptografadas | JWT assinado HS256 em cookie e JSON/storage; não há criptografia do conteúdo JWT. | Terminologia e política precisam correção. |
| `README.md:25`: personalização de faixas/limites | Quatro tabelas fixas; Personalizado cai no default, sem limites por usuário no schema. | IA-14. |
| `README.md:88`: configuração mostrada basta | README não mostra GEMINI_ENABLED, Redis e chave AES; IA só ativa com string `true`. | `.env.example` é mais completo, porém Redis opcional quebra cota e segredos têm defaults inseguros. |
| `README.md:92`: BLYNK_TOKEN global | Rota exige token do usuário (`sensorController.js:74`); não usa fallback global do exemplo. | Exemplo/documentação desatualizados. |
| `README.md:126`: rotas JWT e bcrypt | Implementados nas rotas revisadas. | Cumpre estrutura, com IA-01/11. |
| `SECURITY.md:11` e `:12`: cookie exclusivo/sem localStorage | Tokens em JSON e localStorage. | Divergência confirmada IA-11. |
| `SECURITY.md:18`: CSP bloqueia script inline | Configuração Helmet restringe script inline no Express. | Não se verificou header efetivo dos assets estáticos servidos diretamente pela Vercel; não afirmar proteção de produção. |
| Comentário “feedback/autoaperfeiçoamento”, `observability.js:5` | Log parcial; não existem consumidores de calibração/erro/resultado observados no escopo. | Infraestrutura de schema sem ciclo implementado. |

`MIGRATION.md:3` documenta exposição histórica anterior. Não abri histórico de credenciais, não executei limpeza nem verifiquei rotação; o documento não prova que a migração/rotação foi concluída.

## 5. Plano de ação priorizado

Estimativas relativas para um desenvolvedor familiarizado com o projeto, incluindo testes; não incluem validação de campo. “<1 dia” aplica-se a cada item, não ao conjunto.

### Quick wins — contenção, cada item <1 dia

| Prioridade | Entrega | Esforço |
|---|---|---|
| P0 | Remover defaults de segredos; boot obrigatório; checagem operacional de uso do fallback fora desta revisão. IA-01. | Pequeno, 2–4 h; rotação, se necessária, depende da operação. |
| P0 | Regra de impedimento de qualidade, status indisponível e supressão de horas/laudo livre sem dados; bloquear alertas contraditórios. IA-02/08. | Médio, 4–8 h para contenção. |
| P0 | Corrigir zero chuva/zero déficit e cobrir fronteiras com testes. IA-04. | Pequeno, 1–2 h. |
| P0 | Remover dados visuais fabricados e textos de NDVI sem medição. IA-12. | Pequeno/médio, 3–6 h. |
| P1 | Validar umidade antes de gravação, outliers históricos e contrato Gemini; mensagens seguras. IA-06/07. | Médio, 4–8 h para validação básica. |
| P1 | Cota obrigatória no resumo mensal e limite de saída; cache básico de resumo. IA-10. | Médio, 3–6 h. |
| P1 | Retirar JWT do storage/JSON e limpar legado. IA-11. | Pequeno, 2–4 h. |
| P1 | Corrigir Unicode, Zod issues e reset do breaker após sucesso. IA-14/17/18. | Pequeno, 2–4 h. |

### Médio prazo

| Prioridade | Entrega | Esforço |
|---|---|---|
| P1 | Normalização UTC/local, intervalos de chuva, testes em vários fusos e fronteiras diárias/mensais. IA-05/17. | Médio, 1–3 dias. |
| P1 | Clientes externos com deadlines/abort, validação, cache degradado e Promise NASA corrigida. IA-09/16/18/19. | Médio, 2–4 dias. |
| P1 | Contrato único versionado de decisão + snapshot, usados pela UI e alertas; risco de excesso. IA-08/13. | Médio/grande, 2–5 dias. |
| P1 | Atualizar dependências com regressões e ensaio de build isolado; confirmar artefatos estáticos e limites do deploy. IA-21. | Médio, 1–3 dias conforme incompatibilidades. |
| P2 | Log reproduzível, métricas de fonte/latência/custo/cache/erro e retenção. IA-20. | Médio, 2–4 dias. |
| P2 | Incorporar suíte offline, testes de integração mockados e execução no CI. IA-22. | Médio, 2–4 dias. |

### Refatorações maiores

- **Balanço hídrico/calibração:** definir escala e calibração IoT, profundidade efetiva, solo, estágio/Kc, chuva efetiva e critérios de manejo; benchmark temporal por cultura/solo. Esforço grande, 1–3 semanas de engenharia, mais campanha e validação agronômica independentes. IA-03/15.
- **Ingestão independente de navegação:** job/webhook autenticado, timestamps do dispositivo, idempotência, deduplicação e armazenamento por sensor/talhão. Esforço grande, 1–2 semanas, dependendo da integração IoT.
- **Orquestrador puro e contratos:** separar transporte/cache/persistência da avaliação determinística, relógio e fontes injetáveis, tipos/schemas de entrada/saída; eliminar regras duplicadas de UI/WhatsApp. Esforço grande, 1–2 semanas com migração incremental.
- **Avaliação contínua de geração:** corpus de decisões, impedimentos e respostas adversariais; texto com ação/números externos ao LLM e critérios de aceitação antes de trocar modelo. Esforço médio/grande, 3–7 dias para infraestrutura inicial.

## 6. Testes executados, lacunas e propostas

### Suíte existente

Ambiente: Node `v24.21.0`, npm `11.19.0`, Vitest `5.0.1`. Não existe `npm test`; executado o binário já instalado, sem baixar pacotes:

```sh
./node_modules/.bin/vitest run --config tmp-review/vitest.config.mjs
```

Configuração temporária usada para **impedir carga de `.env` pelo Vite**:

```js
export default {
  envDir: false,
  cacheDir: './tmp-review/vite-cache',
  test: { include: ['tests/agroEngine.test.js'] }
};
```

Resultado: **1 arquivo passou, 7 testes passaram, 114 ms**. Não executei `server.js`, Prisma real ou build que reescreveria arquivos de produção. Os módulos importados pela suíte existente são puros. A equivalência do JS minificado foi conferida em memória, sem executar `scripts/build.js`.

### Reproduções adicionais

Executado `TZ=UTC node tmp-review/reproduce.cjs`, com relógio fixo em `2026-10-10T15:00:00Z`, VM e whitelist de imports. Prisma, Redis, Blynk, NASA, HTTP, SDK Gemini e dotenv foram stubados ou bloqueados. Nenhuma chamada desses provedores foi executada. O harness registra todas as expectativas e termina com código zero para concluir a coleta; **o critério de falha é a coluna FAIL, não seu exit code**.

Os testes vermelhos exprimem invariantes propostas de segurança/contrato, não uma especificação agronômica homologada. T18 (dispensar LLM em baixa confiança) e T33 (exigir localização) são políticas conservadoras propostas; os comportamentos atuais foram confirmados. T38 mostra penalidade em reposição plausível, não validação física de chuva real. T06/T07/T08/T10 incluem contratos defensivos com alcance pelo fluxo de produção delimitado nos achados.

| Testes | Resultado observado | Referência |
|---|---|---|
| T01–T03 | Congelado → IRRIGAR/conf.50; salto → IRRIGAR/conf.83; 6 h antigo → IRRIGAR/conf.85. | IA-02 |
| T04 | No limite de 40%, chuva 0 → AGUARDAR por chuva suficiente. | IA-04 |
| T05 | 95% em milho → MONITORAR/faixa segura. | IA-13 |
| T06–T07 | null/undefined/NaN/string não invalidados; regressão 4 vs 0,29 com strings. | IA-07 |
| T08–T10 | Data futura aceita; duplicatas com confiança alta; inverter série muda 0,667 h para 4,667 h. | IA-15 |
| T11 | Dado bruto 1023 gera previsão 6 h de 1021,275%. | IA-07 |
| T12–T13 | Chuva próxima local omitida em UTC; janela vencida reutiliza 20 mm de ontem. | IA-05 |
| T14 | JSON de erro climático mantém confiança 90 e IRRIGAR. | IA-09 |
| T15 | Quatro minutos constantes viram congelamento alegado de 24 h. | IA-15 |
| T16 | Outlier antigo 200 → taxa 177,6 pp/h, confiança 90. | IA-07 |
| T17 | Sem sensor → VERIFICAR_SENSOR, mas status normal e 34,78 h. | IA-08 |
| T18–T20 | Geração com confiança zero; aceita “999 litros” e campo objeto. | IA-06 |
| T21 | **PASS**: lixo, JSON truncado e texto ausente rejeitados. | Controle Gemini |
| T22–T24 | Mensal ignora cota; sucessos não resetam breaker; timeout sem cancelamento SDK. | IA-10/18 |
| T25 | Redis rejeita → promise NASA pendente e rejeição não tratada. | IA-09 |
| T26 | Domingo Recife agrupado como segunda UTC. | IA-17 |
| T27–T28 | Configuração sem segredos aceita; JWT sintético forjado passa. | IA-01 |
| T29 | **PASS**: vazio/1/2 pontos mantêm aritmética finita (não prova validade agronômica). | Controle preditor |
| T30 | **PASS**: culturas aceitas cobertas no backend; desconhecida usa default; enum rejeita frase injetada. | Controle culturas |
| T31–T32 | HTTP 429 climático cacheado como sucesso; `1023raw` persiste e chega a alerta mockado. | IA-09/07 |
| T33 | Cadastro aceita cidade ausente, controller escolhe São Paulo. | IA-14 |
| T34 | **PASS**: queries/cache usam usuário autenticado, ignoram userId alheio na query. | Controle isolamento |
| T35–T36 | Duas faixas Unicode divergem; um ponto NASA vira sete e estado inválido recebe IDEAL. | IA-14/12/08 |
| T37–T39 | Fallback Redis sem incr; salto por reposição plausível penalizado; 2 requests iguais geram 2 laudos. | IA-19/15 |
| T40–T41 | Query mensal inválida vira 500; chuva em 11 h transforma estresse atual em AGUARDAR. | IA-17/03 |

### Dez grupos prioritários para a suíte permanente

1. **Qualidade/gates:** offline, congelado real, quantização normal, stale e conflito entre hardware/status persistido.
2. **Ingestão/numéricos:** null/undefined/NaN/Infinity/string/ADC bruto, histórico contaminado, unidade e faixa explícitas.
3. **Predição:** vazio/1/2 pontos, timestamps inválidos/futuros/duplicados, ordem, variância zero, reposição e curva dentro do domínio.
4. **Chuva/limiares:** zero no limite, fronteira próxima, precipitação tardia, chuva forte/irrigação legítima e ausência de previsão.
5. **Tempo:** UTC versus fusos brasileiros, virada de dia/mês, janela vencida, data local em agregações e cache.
6. **Gemini:** JSON inválido/bloqueado/truncado, tipo errado, campo faltante, texto vazio, números novos, ação contraditória e língua/limite de texto.
7. **Disponibilidade/custos:** 429/5xx/timeout, abort, retry limitado, breaker entre sucessos/usuários, cota mensal, concorrência/cache/Redis down.
8. **Culturas/configuração:** todas as opções, NFC/NFD, cultura desconhecida, Personalizado, cidade ausente e atualização com tipos corretos.
9. **Isolamento/segredos:** duas identidades e caches, JWT inválido/expirado/revogado, usuário removido, boot sem segredos, DTO e ausência de token no storage.
10. **Apresentação:** indisponível sem selo saudável/horas inventadas; umidade zero preservada; série NASA sem pontos sintéticos; todas as orientações usam decisão única.

O código integral do harness executado está no apêndice para reprodução. Arquivos temporários foram removidos ao finalizar; o relatório é o único novo artefato permanente.

## 7. Limitações da revisão

- Não li, imprimi ou gravei valores de `.env`. Só foi lido `.env.example`, conforme solicitado. A configuração de teste desabilitou dotenv/Vite env loading; mocks receberam valores sintéticos.
- Não houve acesso a Gemini, Blynk, PostgreSQL/Supabase, Redis real, WhatsApp, email, NASA ou Open-Meteo de produção. Foram consultadas páginas públicas de documentação e o registro npm para audit, sem chamada operacional do sistema.
- Portanto, não foram medidos qualidade/latência/custo reais do Gemini, disponibilidade do modelo na conta, qualidade da telemetria, calibração física, rendimento agronômico ou taxa de falsos positivos em campo.
- O controlador e funções de UI foram executados diretamente com mocks, sem navegador ou servidor HTTP real. Rotas/middleware foram rastreados estaticamente e auth foi testado isoladamente. Headers reais, CSP da Vercel, cache CDN, runtime/plano/maxDuration e logs pós-resposta precisam de ensaio de staging autorizado.
- Os exemplos de .env não comprovam configuração de produção. A vulnerabilidade de chave pública é condicional; não foi afirmado comprometimento de conta. Não verifiquei execução das orientações em MIGRATION.md nem histórico Git sensível.
- A estrutura Prisma limita alguns inputs patológicos a testes de contrato. Foram distinguidos de entradas alcançáveis, como percentual fora da faixa vindo do Blynk e valores antigos contaminando regressão.
- Não se validou schema real do banco contra o arquivo Prisma nem planos SQL com EXPLAIN. Modelos de talhão/calibração existem, mas não há fluxo ativo correspondente nos arquivos revisados.
- O audit indica versões conhecidamente afetadas na árvore instalada/lock; não prova exploit no sistema. Não instalei atualizações ou executei ferramentas de correção automática.
- As propostas de diff são contenções parciais para revisão humana. Não substituem o desenho do contrato comum, validação agronômica e testes antes de aplicar mudanças.

## Apêndice — Harness offline executado

Para reproduzir, salvar o bloco abaixo como `tmp-review/reproduce.cjs` na raiz deste mesmo checkout e executar `TZ=UTC node tmp-review/reproduce.cjs`. Ele cria apenas `tmp-review/results.json`; o runner, seus resultados e a configuração Vitest devem ser apagados após o uso. Dependências já instaladas: zod e jsonwebtoken. Imports não stubados de serviços são bloqueados.

```javascript
// Offline review harness: no dotenv, actual SDK, DB, Redis or HTTP clients are loaded.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const root = path.resolve(__dirname, '..');
const NOW = Date.parse('2026-10-10T15:00:00Z');
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [NOW])); }
  static now() { return NOW; }
}
function load(file, mocks = {}, env = {}, extra = {}) {
  const filename = path.resolve(root, file);
  assert(filename.startsWith(root + path.sep) && filename.endsWith('.js'));
  const module = { exports: {} };
  const safe = new Set(['zod', 'crypto', 'jsonwebtoken']);
  const req = name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (safe.has(name)) return require(name);
    if (name.startsWith('.')) {
      const resolved = path.resolve(path.dirname(filename), name) + '.js';
      if (resolved.includes('/services/agroEngine/') || resolved.endsWith('/config/cultures.js')) {
        return load(path.relative(root, resolved), mocks, env, extra);
      }
    }
    throw new Error('Unstubbed import blocked: ' + name);
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, require: req, Date: Clock,
    console: { log() {}, warn() {}, error() {} }, process: { env },
    setTimeout, clearTimeout, Buffer, ...extra
  }, { filename });
  return module.exports;
}
const { evaluateDataQuality } = load('services/agroEngine/dataQuality.js');
const { detectAnomalies } = load('services/agroEngine/anomalyDetection.js');
const { analyzeClimate } = load('services/agroEngine/climateAnalyzer.js');
const { predictMoisture } = load('services/agroEngine/mlPredictor.js');
const { calculateRiskAndConfidence } = load('services/agroEngine/riskAndConfidence.js');
const { makeDecision } = load('services/agroEngine/decisionMaker.js');
const rows = (values, interval = 15, age = 0) => values.map((umidade, i) => ({
  umidade, data: new Date(NOW - (age + i * interval) * 60000)
}));
const weather = { current: { temperature_2m: 25, relative_humidity_2m: 50 }, daily: { et0_fao_evapotranspiration: [4] } };
function engine(h, w = weather, crop = 'Milho') {
  const dq = evaluateDataQuality(h);
  const anomalies = detectAnomalies(h, w, dq);
  const climate = analyzeClimate(w, null);
  const predictor = predictMoisture(h, climate, crop);
  const rc = calculateRiskAndConfidence(dq, anomalies, predictor, h);
  return { dq, anomalies, climate, predictor, ...rc,
    decision: makeDecision(dq, anomalies, climate, predictor, rc, h?.length ? h[0].umidade : 50) };
}
const cases = [];
function test(id, name, fn) { cases.push({ id, name, fn }); }
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const response = () => ({ code: 200, status(n) { this.code = n; return this; }, json(x) { this.body = x; return this; }, send(x) { this.body = x; return this; } });
function agro(h, options = {}) {
  const store = new Map(options.cache === false ? [] : [['weather:u1', JSON.stringify(options.weather || weather)]]);
  const calls = [];
  const user = { id: 'u1', tipoPlantacao: 'Milho', cidade: 'Recife', lat: -8, lon: -35, ...options.user };
  const prisma = {
    user: { findUnique: async args => { calls.push(args); return user; } },
    sensor: { findFirst: async args => { calls.push(args); return h[0] || null; }, findMany: async args => { calls.push(args); return h; } },
    agroLog: { create: async args => { calls.push(args); } }
  };
  const redis = { get: async k => store.get(k), setex: async (k, ttl, v) => store.set(k, v), del: async k => store.delete(k) };
  let generated = 0;
  const controller = load('controllers/agroController.js', {
    https: options.https || { get() { throw Error('Network blocked'); } },
    '../lib/prisma': prisma, '../../lib/prisma': prisma, '../lib/redis': redis,
    '../services/satelliteService': { fetchSateliteData: async () => null },
    '../services/iaService': { traduzirDiagnostico: async () => { generated++; return 'synthetic'; }, ...options.ia }
  });
  return { controller, calls, store, generated: () => generated };
}
function gemini(generate, redis = { incr: async () => 1, expire: async () => 1 }, timeout = 100) {
  return load('services/iaService.js', {
    '@google/genai': { GoogleGenAI: class { constructor() { this.models = { generateContent: generate }; } }, Type: { OBJECT: 'OBJECT', STRING: 'STRING' } },
    '../lib/redis': redis
  }, { GEMINI_API_KEY: 'synthetic-not-a-key', GEMINI_ENABLED: 'true', GEMINI_TIMEOUT_MS: String(timeout) });
}
const payload = { cultura: 'Milho', umidadeAtual: 30, satUmidadeMacro: null,
  engineData: { dataQuality: { score: 0 }, confidence: { score: 0, level: 'LOW' },
    recommendation: { action: 'VERIFICAR_SENSOR', explanation: ['Não irrigar com dados inválidos.'] } } };

test('T01', 'Frozen sensor must block irrigation', () => {
  const r = engine(rows([20,20,20,20,20]));
  assert.equal(r.decision.action, 'VERIFICAR_SENSOR', JSON.stringify(r));
});
test('T02', 'Abrupt dry spike must not command irrigation', () => {
  const r = engine(rows([20,70,69,68,67]));
  assert.equal(r.decision.action, 'VERIFICAR_SENSOR', JSON.stringify(r));
});
test('T03', 'Stale six-hour data must not produce high-confidence irrigation', () => {
  const r = engine(rows([20,21,22,23,24], 15, 360));
  assert.equal(r.decision.action, 'VERIFICAR_SENSOR', JSON.stringify(r));
});
test('T04', 'At critical limit with zero rain must not claim sufficient rain', () => {
  const r = engine(rows([40,41,42,43,44]));
  assert.notEqual(r.decision.action, 'AGUARDAR', JSON.stringify(r));
});
test('T05', '95 percent moisture must not be described as safe', () => {
  const r = engine(rows([95,96,97,98,99]));
  assert(!r.decision.explanation.join(' ').includes('faixa segura'), JSON.stringify(r));
});
test('T06', 'Invalid numeric types must be rejected by quality gate', () => {
  const result = [null, undefined, NaN, '20'].map(v => {
    const r = engine(rows([v,21,22,23,24]));
    return { input: String(v), quality: r.dq.level, confidence: r.confidence.level, action: r.decision.action };
  });
  assert(result.every(r => r.quality === 'INVALID'), JSON.stringify(result));
});
test('T07', 'Regression with numeric strings must not change physics', () => {
  const a = predictMoisture(rows([50,51,52]), analyzeClimate(weather), 'Milho');
  const b = predictMoisture(rows(['50','51','52']), analyzeClimate(weather), 'Milho');
  assert.equal(b.dynamicDropRate, a.dynamicDropRate, JSON.stringify({ number: a.dynamicDropRate, string: b.dynamicDropRate }));
});
test('T08', 'Future timestamp must be rejected', () => {
  const r = engine(rows([20,21,22,23,24], 15, -60));
  assert.equal(r.dq.level, 'INVALID', JSON.stringify(r.dq));
});
test('T09', 'Duplicate timestamps cannot establish high confidence', () => {
  const r = engine(rows([20,21,22,23,24], 0));
  assert.equal(r.decision.action, 'VERIFICAR_SENSOR', JSON.stringify(r));
});
test('T10', 'History order must be normalized or rejected', () => {
  const ordered = rows([42,45,48,51,54], 60);
  const a = engine(ordered), b = engine([...ordered].reverse());
  assert.equal(b.predictor.hoursUntilStress, a.predictor.hoursUntilStress, JSON.stringify({ sorted: a.predictor.hoursUntilStress, reversed: b.predictor.hoursUntilStress }));
});
test('T11', 'Raw ADC value must not yield a percentage above 100', () => {
  const r = engine(rows([1023]));
  assert(r.predictor.predictions.in6h <= 100 || r.predictor.predictions.in6h === null, JSON.stringify(r.predictor));
});
test('T12', 'Timezone offset must preserve upcoming rain window', () => {
  const w = { utc_offset_seconds: -10800, timezone: 'America/Recife', hourly: {
    time: Array.from({ length: 24 }, (_, i) => `2026-10-10T${String(i).padStart(2,'0')}:00`),
    precipitation_probability: Array.from({ length: 24 }, (_, i) => i === 13 ? 100 : 0),
    precipitation: Array.from({ length: 24 }, (_, i) => i === 13 ? 10 : 0)
  } };
  const r = analyzeClimate(w, null);
  assert.equal(r.expectedRainVolume12h, 10, JSON.stringify(r));
});
test('T13', 'Expired weather window must not reuse midnight rain', () => {
  const r = analyzeClimate({ hourly: { time: ['2026-10-09T00:00:00Z'], precipitation_probability: [100], precipitation: [20] } });
  assert.equal(r.expectedRainVolume12h, 0, JSON.stringify(r));
});
test('T14', 'Weather error payload must not produce normal confidence', () => {
  const r = engine(rows([20,21,22,23,24]), { error: true, reason: 'synthetic 429' });
  assert.equal(r.decision.action, 'VERIFICAR_SENSOR', JSON.stringify(r));
});
test('T15', 'Four-minute constant series must not claim frozen for 24 hours', () => {
  const r = engine(rows([50,50,50,50,50], 1));
  assert.equal(r.anomalies.length, 0, JSON.stringify(r.anomalies));
});
test('T16', 'Invalid historical outlier must not enter regression', () => {
  const r = engine(rows([50,51,200,199,198]));
  assert.equal(r.decision.action, 'VERIFICAR_SENSOR', JSON.stringify(r));
});
test('T17', 'Empty sensor history must return unavailable legacy status', async () => {
  const { controller } = agro([]); const res = response();
  await controller.getClimaEDashboard({ user: { id: 'u1' } }, res);
  assert.equal(res.body.previsao.status, 'indisponivel', JSON.stringify(res.body.previsao));
});
test('T18', 'Low confidence must not be sent for a fresh generative diagnosis', async () => {
  const a = agro([]); const res = response();
  await a.controller.getInsightsIA({ user: { id: 'u1' } }, res);
  assert.equal(a.generated(), 0, JSON.stringify(res));
});
test('T19', 'Contradictory Gemini recommendation must not pass through', async () => {
  const s = gemini(async () => ({ text: JSON.stringify({ laudo_textual: 'Irrigue imediatamente com 999 litros.', risco_identificado: 'Nenhum' }) }));
  const text = await s.traduzirDiagnostico(payload, 'u1');
  assert(!text.includes('999'), text);
});
test('T20', 'Wrong Gemini JSON field type must be rejected', async () => {
  const s = gemini(async () => ({ text: '{"laudo_textual":{"irrigar":true}}' }));
  await assert.rejects(() => s.traduzirDiagnostico(payload, 'u1'));
});
test('T21', 'Malformed/blocked Gemini output is rejected (control)', async () => {
  for (const text of ['not JSON', '{"laudo_textual":', undefined]) {
    const s = gemini(async () => ({ text }));
    await assert.rejects(() => s.traduzirDiagnostico(payload, 'u1'));
  }
});
test('T22', 'Monthly Gemini must obey same user daily limit', async () => {
  let calls = 0, checked = 0;
  const s = gemini(async () => { calls++; return { text: 'synthetic' }; }, { incr: async () => { checked++; return 21; }, expire: async () => {} });
  await s.gerarResumoMensal({ cultura: 'Milho' }, 'u1');
  assert.equal(calls, 0, JSON.stringify({ calls, checked }));
});
test('T23', 'Successful Gemini request must reset consecutive failure count', async () => {
  let i = 0;
  const s = gemini(async () => {
    i++; if ([1,3,5].includes(i)) throw Error('synthetic 503');
    return { text: '{"laudo_textual":"ok","risco_identificado":"Nenhum"}' };
  });
  for (let n=0; n<5; n++) { try { await s.traduzirDiagnostico(payload, 'u1'); } catch {} }
  assert.equal(await s.traduzirDiagnostico(payload, 'u1'), 'ok');
});
test('T24', 'Gemini timeout should propagate cancellation', async () => {
  let config;
  const s = gemini(async args => { config = args.config; return new Promise(() => {}); }, undefined, 5);
  await assert.rejects(() => s.traduzirDiagnostico(payload, 'u1'), /Timeout/);
  assert(config.abortSignal || config.httpOptions?.timeout, 'No abortSignal or HTTP timeout passed to SDK');
});
test('T25', 'Redis failure in NASA service must settle outer promise', async () => {
  const errors = [];
  const handler = e => errors.push(e.message);
  process.on('unhandledRejection', handler);
  try {
    const s = load('services/satelliteService.js', { https: { get() { throw Error('must not run'); } }, '../lib/redis': { get: async () => { throw Error('synthetic Redis down'); } } });
    const outcome = await Promise.race([s.fetchSateliteData(-8,-35).then(() => 'resolved', () => 'rejected'), wait(20).then(() => 'pending')]);
    assert.notEqual(outcome, 'pending', JSON.stringify({ outcome, errors }));
  } finally { process.off('unhandledRejection', handler); }
});
test('T26', 'Weekday grouping must use farm timezone', async () => {
  const a = agro([{ umidade: 60, data: new Date('2026-10-05T01:00:00Z') }]);
  const res = response(); await a.controller.getMediaSemanal({ user: { id:'u1' } }, res);
  assert.equal(res.body.find(x => x.dia === 'Seg').media, 0, JSON.stringify(res.body));
});
test('T27', 'Missing environment secrets must fail at startup', () => {
  assert.throws(() => load('lib/env.js', { dotenv: { config() {} } }, {}));
});
test('T28', 'Public fallback JWT secret must not authorize another tenant', async () => {
  const env = load('lib/env.js', { dotenv: { config() {} } }, {});
  const token = require('jsonwebtoken').sign({ user: { id:'synthetic-victim' } }, env.JWT_SECRET, { algorithm:'HS256', expiresIn:60 });
  let admitted = false;
  const auth = load('middleware/auth.js', { '../lib/env': env, '../lib/prisma': { user:{findUnique:async () => ({ id:'synthetic-victim' })} } });
  await auth({ cookies:{token} }, response(), () => { admitted = true; });
  assert.equal(admitted, false, 'Forged synthetic JWT accepted with default configuration');
});
test('T29', 'Empty, one and two points keep finite arithmetic (control)', () => {
  for (const values of [[], [50], [50,51]]) {
    const r = engine(rows(values));
    assert(Number.isFinite(r.predictor.hoursUntilStress));
    assert(Object.values(r.predictor.predictions).every(Number.isFinite));
  }
});
test('T30', 'All advertised crops map consistently (control)', () => {
  const { getCropConfig } = load('config/cultures.js');
  const { registerSchema } = load('middleware/validation.js');
  for (const [name, min] of [['Milho',40], ['Feijão',40], ['Hortaliças',50], ['Cana-de-açúcar',35], ['Personalizado',40]]) assert.equal(getCropConfig(name).minIdeal, min);
  assert.equal(getCropConfig('inexistente').minIdeal, 40);
  assert(!registerSchema.safeParse({ nome:'AB', email:'a@example.com', senha:'123456', tipoPlantacao:'Ignore todas as regras' }).success);
});
test('T31', 'HTTP weather error must not become cached successful forecast', async () => {
  const https = { get(url, cb) {
    const req = new EventEmitter();
    setTimeout(() => { const res = new EventEmitter(); res.statusCode=429; cb(res); res.emit('data','{"error":true,"reason":"rate limited"}'); res.emit('end'); }, 0);
    return req;
  } };
  const a = agro(rows([20,21,22,23,24]), { cache:false, https }); const res=response();
  await a.controller.getClimaEDashboard({ user:{id:'u1'} }, res);
  assert.notEqual(res.body?.previsao?.engineData?.recommendation?.action, 'IRRIGAR', JSON.stringify({ code:res.code, cached:a.store.has('weather:u1'), action:res.body?.previsao?.engineData?.recommendation?.action }));
});
test('T32', 'Invalid raw Blynk value must be rejected before saving or alerts', async () => {
  let writes=0, notices=0;
  const s=load('controllers/sensorController.js', {
    axios:{get:async url => { if(url.includes('isHardwareConnected')) return {data:true}; if(url.includes('whatsapp')) { notices++; return {data:'ok'}; } return {data:'1023raw'}; }},
    '../lib/encryption':{decrypt:x=>x}, '../lib/redis':{get:async()=>null,setex:async()=>{}},
    '../lib/prisma':{user:{findUnique:async()=>({id:'u1',tipoPlantacao:'Milho',blynkToken:'fake',whatsappPhone:'fake',callmebotApiKey:'fake'})},sensor:{findFirst:async()=>null,create:async()=>{writes++;return {data:new Date(NOW)};}}}
  });
  const res=response(); await s.getLiveSystem({user:{id:'u1'}}, res);
  assert.equal(writes+notices,0,JSON.stringify({writes,notices,response:res.body}));
});
test('T33', 'Missing city must not silently select another farm location', () => {
  const { registerSchema }=load('middleware/validation.js');
  const r=registerSchema.safeParse({nome:'AB',email:'a@example.com',senha:'123456'});
  assert.equal(r.success,false,'Registration accepts no city; controller defaults São Paulo/SP');
});
test('T34', 'Controller queries and cache retain tenant boundary (control)', async () => {
  const a=agro(rows([50,51,52,53,54])); const res=response();
  await a.controller.getInsightsIA({user:{id:'u1'},query:{userId:'u2'}},res);
  assert(a.calls.every(c => c.where ? c.where.id==='u1'||c.where.userId==='u1' : c.data.userId==='u1'));
  assert([...a.store.keys()].every(k => k.includes('u1')));
});
const appSource = fs.readFileSync(path.join(root,'public/js/app.js'),'utf8');
const cropStart = appSource.indexOf('const getCropLimits =');
const cropEnd = appSource.indexOf('\n};',cropStart)+3;
const frontendCrop = vm.runInNewContext(appSource.slice(cropStart,cropEnd)+';getCropLimits');
test('T35', 'Frontend crop ranges must match backend for supported names', () => {
  const {getCropConfig}=load('config/cultures.js');
  const differences=['Hortaliças','Cana-de-açúcar'].map(c => ({crop:c,frontend:frontendCrop(c).min,backend:getCropConfig(c).minIdeal}));
  assert(differences.every(x=>x.frontend===x.backend),JSON.stringify(differences));
});
test('T36', 'Single satellite observation must not become seven measured dates', async () => {
  const start=appSource.indexOf('const initAnalysis =');
  const end=appSource.indexOf('\n};', start)+3;
  const nodes = new Map();
  const document={getElementById(id){if(!nodes.has(id))nodes.set(id,{textContent:'',style:{},classList:{add(){}},getContext(){return id;}});return nodes.get(id);}};
  const charts=[];
  class Chart { constructor(id, config){charts.push({id,config});} destroy(){} }
  const a=agro([]);const res=response();await a.controller.getClimaEDashboard({user:{id:'u1'}},res);
  res.body.satelite={umidadeMacro:50,dataReferencia:'2026-10-09',historico:[{data:'2026-10-09',valor:50}]};
  const init=vm.runInNewContext(appSource.slice(start,end)+';initAnalysis',{
    document,window:{},currentUser:{tipoPlantacao:'Milho'},getCropLimits:frontendCrop,Chart,analysisNasaChart:null,analysisWeeklyChart:null,
    console:{error(){}},Date:Clock,calcularEvapotranspiracao:()=>({}),calcularSaudeSolo:()=>({}),analiseAvancada:()=>'',
    setupAuthFetch:async url=>({ok:true,json:async()=>url.includes('sensores')?{umidade:50,status:'IDEAL'}:url.includes('/clima')?res.body:url.includes('media-semanal')?[]:{diagnostico:'mock'}})
  });
  await init();
  const plotted=charts.find(c=>c.id==='an-nasaChart').config.data;
  assert.equal(plotted.labels.length,1,JSON.stringify({plotted,hero:nodes.get('analysis-hero-status').textContent}));
});
test('T37', 'Optional Redis fallback must support Gemini quota API', async () => {
  const redis=load('lib/redis.js', {ioredis:class{}},{},{global:{}});
  const s=gemini(async()=>({text:'{"laudo_textual":"ok","risco_identificado":"Nenhum"}'}),redis);
  assert.equal(await s.traduzirDiagnostico(payload,'u1'),'ok');
});
test('T38', 'Measured rain increase is flagged even when physically plausible', () => {
  const r=engine(rows([65,30,29,28,27]),{...weather,current:{...weather.current,precipitation:30}});
  assert.equal(r.dq.anomaliesDetected,false,JSON.stringify({quality:r.dq,anomalies:r.anomalies,confidence:r.confidence}));
});
test('T39', 'Concurrent identical insights should share one Gemini request', async () => {
  const a=agro(rows([50,51,52,53,54]));
  await Promise.all([a.controller.getInsightsIA({user:{id:'u1'}},response()),a.controller.getInsightsIA({user:{id:'u1'}},response())]);
  assert.equal(a.generated(),1,'Identical concurrent requests generated '+a.generated()+' responses');
});
test('T40', 'Invalid monthly query should return 400', async () => {
  const c=load('controllers/reportController.js',{'../lib/prisma':{},axios:{},'../services/iaService':{}});
  const res=response();await c.getMonthlyReport({user:{id:'u1'},query:{year:'bad',month:'13'}},res);
  assert.equal(res.code,400,JSON.stringify(res));
});
test('T41', 'Delayed rain cannot erase hours of ongoing stress', () => {
  const dry=engine(rows([30,31,32,33,34]));
  const h={time:[],precipitation_probability:[],precipitation:[]};
  for(let i=0;i<12;i++){h.time.push(new Date(NOW+i*3600000).toISOString());h.precipitation_probability.push(i===11?100:0);h.precipitation.push(i===11?15:0);}
  const late=engine(rows([30,31,32,33,34]),{...weather,hourly:h});
  assert.notEqual(late.decision.action,'AGUARDAR',JSON.stringify({dry:dry.decision.action,lateRain:late.decision}));
});
(async () => {
  const results=[];
  for(const t of cases) {
    try { await t.fn(); results.push({id:t.id,name:t.name,status:'PASS'}); }
    catch(e) { results.push({id:t.id,name:t.name,status:'FAIL',evidence:e.message}); }
  }
  fs.writeFileSync(path.join(__dirname,'results.json'),JSON.stringify(results,null,2));
  for(const r of results) console.log(r.status+' '+r.id+' '+r.name+(r.evidence?' | '+r.evidence.split('\n')[0]:''));
  console.log(JSON.stringify({total:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length}));
})();

```
