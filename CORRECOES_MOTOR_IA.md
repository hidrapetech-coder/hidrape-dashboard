# Correções do Motor de IA — 10/10/2026

As correções abaixo foram aplicadas à árvore local após autorização para implementação. Este registro complementa a [revisão original](REVISAO_MOTOR_IA.md), que permanece como diagnóstico histórico, e não representa uma nova certificação agronômica.

**Resultado da validação:** 84 testes passaram em 5 arquivos; build do frontend, verificação de sintaxe, validação e geração isolada do Prisma passaram; `npm audit` terminou com zero vulnerabilidades em todas as severidades. Nenhuma API operacional, banco ou deploy foi executado. Não foram lidos, impressos ou gravados valores de `.env`.

## Situação por achado

“Corrigido” significa implementação local e validação por testes/inspeção. Integração real e liberação dependem do procedimento de implantação ao final.

| ID | Situação | Correção e arquivos principais | Evidência local / limite |
| --- | --- | --- | --- |
| IA-01 | Corrigido no código; rotação pendente, se aplicável | `lib/env.js`: removidos fallbacks públicos de JWT/AES e URLs fictícias; validação encerra inicialização e informa somente nomes dos campos inválidos. | `tests/controllers.test.js`: segredos ausentes/padrões públicos impedem inicialização sem expor valores. Chaves realmente usadas em produção não foram consultadas. |
| IA-02 | Corrigido | `dataQuality.js`, `riskAndConfidence.js`, `decisionMaker.js`, `agroEngine/index.js`: elegibilidade explícita; histórico inválido, antigo, insuficiente, desconexão conhecida e anomalias graves bloqueiam orientação de manejo. | `tests/agroEngine.test.js`: ausências, tipos inválidos, duplicatas, congelamento, desconexão e dados antigos. Previsões e tempo ficam nulos quando bloqueados. |
| IA-03 | Conversão insegura removida | `mlPredictor.js`, `decisionMaker.js`: removida conversão direta de ET₀/chuva em pontos percentuais e espera por chuva presumidamente suficiente. Tendência usa regressão do segmento observado de secagem. | Teste confirma que ET₀/NASA não multiplicam a taxa. Balanço hídrico físico requer solo, profundidade radicular, calibração e validação de campo; não foi implementado. |
| IA-04 | Corrigido | `decisionMaker.js`: leitura no limite inferior recebe `IRRIGAR`, condicionada à elegibilidade; zero mm não justifica aguardar chuva. | Regressão de fronteira em `tests/agroEngine.test.js`. A recomendação não prescreve volume/duração nem aciona equipamento. |
| IA-05 | Corrigido | `weatherService.js`, `climateAnalyzer.js`: timestamps Unix absolutos, janela futura de 12 horas com cobertura contínua, ET₀ do dia local e soma de chuva em mm sem ponderação por probabilidade. | Testes de offsets, períodos passados, lacunas e valores ausentes. |
| IA-06 | Corrigido por restrição da geração | `iaService.js`: Gemini retorna apenas ordenação de IDs de frases determinísticas aprovadas; JSON e conjunto de IDs são validados, primeira frase é fixa e resposta é reconstruída localmente. | `tests/iaService.test.js`: lixo, IDs inválidos, truncamento, bloqueio e baixa confiança retornam fallback. Texto livre, novos números e aconselhamento novo não são aceitos. |
| IA-07 | Corrigido | `sensorController.js`, `dataQuality.js`: apenas números finitos 0–100; parsing completo, zero preservado, hardware explicitamente online e histórico normalizado sem mutação. | Testes rejeitam leituras brutas, null, strings parciais e valores fora de faixa antes de persistência/alerta. A calibração física do dispositivo permanece pendente. |
| IA-08 | Corrigido | `agroEngine/index.js` centraliza decisão para controller, sensor e alertas; `public/js/app.js` usa o snapshot canônico, representa indisponibilidade e descarta respostas de outra sessão. | Testes de controller/frontend; falha não aparece como `IDEAL`. JS servido foi recompilado. |
| IA-09 | Corrigido | `httpJson.js`, `cache.js`, `weatherService.js`, `satelliteService.js`: prazo total, limite de corpo, status/JSON validados, cache opcional e degradação para ausência explícita. | `tests/httpJson.test.js` e testes de fonte/controller: timeout destrói transporte, Redis indisponível não pendura NASA, clima falho conserva diagnóstico determinístico. |
| IA-10 | Corrigido | `iaService.js`, `reportController.js`: mensal e diagnóstico compartilham cota por usuário; cache inclui usuário, fatos, modelo e parâmetros. | Teste confirma cota compartilhada e isolamento. Lua é exercitada por contrato simulado, sem Redis real. |
| IA-11 | Corrigido | `authController.js`, `middleware/auth.js`, `app.js`: sessão exclusivamente por cookie HttpOnly, sem token no JSON; limpeza de JWT legado no navegador; usuário removido é recusado. | Testes de login, cabeçalho Bearer recusado, usuário excluído e limpeza de estado entre sessões. |
| IA-12 | Corrigido por remoção dos dados sintéticos | Frontend e `geo.html`: retirados heatmaps NDVI aleatórios, polígonos presumidos e séries NASA fabricadas; mapa apresenta localização e imagem, sem alegar diagnóstico vegetal. | `tests/frontend.test.js`: uma observação gera um ponto; fonte indisponível não produz dados fictícios. Não foi implementado NDVI real. |
| IA-13 | Corrigido | `riskAndConfidence.js`, `decisionMaker.js`: acima do máximo da cultura produz risco alto e `EXCESSO_UMIDADE`, com orientação de conferir drenagem e evitar adicionar água. | Teste explícito de excesso. |
| IA-14 | Corrigido; configuração legada exige conferência | `cultures.js` normaliza Unicode e bloqueia cultura desconhecida; schema/configurações passam a aceitar limites personalizados e fuso. Cadastro exige cidade/UF; coordenadas são numéricas e null não vira zero; remoção de integração respeita coluna não nula. | Testes de cultura, configuração, cadastro e geocodificação incompleta. Migração aditiva preparada, não aplicada; defaults antigos de São Paulo não podem ser distinguidos automaticamente de escolha legítima. |
| IA-15 | Corrigido no comportamento; calibração pendente | `config/agro.js` centraliza políticas; anomalias consideram duração real e tolerância, reconhecem recuperação após salto; regressão exige amostras, extensão e ajuste mínimos, reinicia após reposição e limita extrapolação ao histórico. Intervalo fictício removido. | Testes de congelamento recente, oscilação, chuva/salto, poucos pontos, recuperação e horizonte. Limiares e scores são políticas operacionais, não probabilidades calibradas. |
| IA-16 | Corrigido | `satelliteService.js`: rejeita sentinelas/null/datas inválidas, verifica idade e domínio 0–1; identifica observação, recuperação e unidade relativa, com histórico real. | Testes de NASA inválida/antiga/cache falho. Dado regional é contexto, não medida do talhão ou umidade volumétrica. |
| IA-17 | Corrigido | `time.js`, `agroController.js`, `reportController.js`: agrupamentos por data/fuso explícito, consultas agregadas parametrizadas por usuário, ausência distinta de zero; clima histórico do período com cobertura; contagem de registros reais `IRRIGAR`; Zod inválido retorna 400. | Testes de meia-noite, consultas inválidas, cobertura parcial e null. SQL PostgreSQL não foi executado em banco real. Registros não equivalem a irrigações executadas nem a eventos únicos. |
| IA-18 | Corrigido | `iaService.js`: AbortController e prazo total, retry explícito limitado, retry interno do SDK desativado, Retry-After limitado ao orçamento, circuito com reset e uma sonda após cooldown; parâmetros configuráveis e validados. | Testes de cancelamento, 429/5xx, truncamento, cooldown e configuração inválida; assinaturas do SDK instalado conferidas. Transporte real do provedor não foi chamado. |
| IA-19 | Corrigido | Redis obrigatório para geração paga, cota atômica/lock por usuário e cache versionado; snapshots isolados e revalidados por idade, leitura, saúde e configuração; atualização invalida cache após persistir. | Testes de concorrência, isolamento, indisponibilidade e snapshot de outro usuário. Comandos Redis reais não foram executados. |
| IA-20 | Corrigido na auditoria; aprendizagem não implementada | `observability.js` aguarda gravação; snapshot contém versão, entradas brutas/normalizadas, regras, fontes, qualidade, decisões e previsões. Falha de log é genérica e não derruba resposta. | Controller testa espera de gravação. Alegações de autoaprendizagem foram retiradas; não há treinamento por feedback, nem confirmação da persistência em produção. |
| IA-21 | Corrigido no lockfile auditado | Dependências compatíveis atualizadas, nodemon removido em favor de Node `--watch`; override pontual de `deepmerge-ts` em `@prisma/config`; Node 24 e cliente Prisma como dependência de runtime. | `npm audit`: zero vulnerabilidades. Prisma config/validate/generate passaram com o override. Reavaliar override na próxima atualização do Prisma e manter auditorias recorrentes. |
| IA-22 | Corrigido | Suíte offline ampliada, `vitest.config.mjs`, bloqueio de rede/segredos nos helpers, scripts de teste/Prisma e workflow CI com build, checagem dos assets e auditoria. | 84 testes em 5 arquivos passaram. CI foi escrita e inspecionada, mas não executada no GitHub nesta sessão. |

Os nomes de módulos sem prefixo nesta tabela pertencem a `services/agroEngine/`; os caminhos completos estão na revisão e no código.

## Mudanças de comportamento importantes

- Dados insuficientes ou suspeitos produzem `VERIFICAR_SENSOR`, sem previsão numérica de irrigação. Um salto pode ser chuva/irrigação legítima e exige confirmação; não é diagnóstico definitivo de defeito.
- Tendência linear é empírica e condicional. Previsão distante, ajuste insuficiente e extrapolação além do horizonte suportado ficam indisponíveis. Não há taxa de secagem artificial de fallback.
- Chuva e ET₀ continuam visíveis como contexto meteorológico; não são convertidas em umidade percentual. O volume mensal ET₀ × área é referência meteorológica, não prescrição de irrigação.
- Gemini organiza frases aprovadas. Se estiver desativado, sem Redis, fora da cota ou indisponível, o usuário recebe os fatos determinísticos. Não é mais um redator livre de diagnósticos.
- Culturas desconhecidas e “Personalizado” sem faixa válida bloqueiam manejo. Usuários sem fuso configurado usam UTC explicitamente; o fuso da propriedade precisa ser confirmado.
- A interface apresenta confiança operacional do motor, sem alegar saúde da planta. Mapa de localização não representa NDVI, e NASA regional não representa sensor do talhão.

## Validações concluídas

| Comando / verificação | Resultado |
| --- | --- |
| `npm test` | 5 arquivos e 84 testes passaram. |
| `npm audit --json --cache /private/tmp/hidrape-review-npm-cache` | Exit 0; zero vulnerabilidades críticas, altas, médias, baixas ou informativas. |
| `npm run check:prisma` | Schema válido e geração do cliente bem-sucedida em diretório temporário, com configuração sintética e bloqueio de rede/leitura de `.env`. Não conecta ao banco. |
| `node scripts/check-prisma-offline.js --baseline` | SQL da baseline gerado localmente a partir do schema anterior às três colunas novas. Nenhuma migração aplicada. |
| `node scripts/build.js` | Build concluído; `public/js/app.min.js` atualizado. |
| `node --check` nos JS verificados, incluindo `app.js` e `app.min.js` | Sintaxe válida. |
| `git diff --check` | Sem erros de whitespace. |

Os testes cobrem normalização/qualidade, cultura e limites, anomalias, regressão, risco, clima/NASA, parsing Blynk, isolamento, sessão/configurações, relatórios, Gemini/cotas/lock/retry/circuito/abort, HTTP limitado e comportamento real do DOM com JSDOM. São testes com fixtures/mocks e bloqueio de rede: não substituem ensaio agronômico, integração real nem teste de carga.

## Implantação e limitações remanescentes

Siga [MIGRACAO_MOTOR_IA.md](MIGRACAO_MOTOR_IA.md). Antes de liberar o código, compare a baseline ao banco existente, registre-a somente se corresponder e aplique a migração aditiva. O backend novo exige `User.timeZone`, `minIdeal` e `maxIdeal`. **A migração, a rotação de segredos e o deploy não foram executados.**

Verifique em staging SQL/agregações no PostgreSQL, cota/locks no Redis, cookies e configurações, integrações reais e orçamento da função Vercel. A configuração legada `builds/routes` foi mantida; o limite efetivo da conta e a duração sob latência real não foram verificados.

Permanecem trabalhos de produto/pesquisa: calibração por sensor/solo/cultura, validação dos limiares em campo, balanço hídrico físico, NDVI real e aprendizagem com resultados observados. O sistema corrigido não afirma oferecer essas capacidades. Também não é possível inferir nesta revisão se houve comprometimento anterior de segredos ou quais cidades/fusos legados representam a configuração correta de cada propriedade.

## Referências técnicas utilizadas

- [Open-Meteo — Forecast API](https://open-meteo.com/en/docs) e [Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api): unidades, timestamps e consultas históricas.
- [deepmerge-ts v8](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0) e [aviso de segurança](https://github.com/advisories/GHSA-ggr8-5vv4-36mx): atualização pontual; a mudança de comportamento de Map exige reavaliar o override ao atualizar Prisma.
- [Vercel — duração das funções](https://vercel.com/docs/functions/configuring-functions/duration): prazo efetivo deve ser conferido no ambiente de implantação.
