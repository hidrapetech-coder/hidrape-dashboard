# Correções dos três P1 do dashboard

Escopo confirmado: começar por estados/recuperação e resolver estimativa ambígua, contexto da leitura e hierarquia móvel. Preservar visual, dados e contratos existentes. Referência: crítica de 7 de novembro de 2026, `2026-11-07T23-26-45Z__public-views-dashboard-html.md`.

## Estados e recuperação

A orientação recebe um título derivado da ação retornada pelo motor. O tempo fica em uma área subordinada, com razão explícita quando não é estimável. Nenhuma previsão ou recomendação agronômica nova foi calculada no frontend.

| Estado recebido | Apresentação |
| --- | --- |
| Monitorar, sem tendência confiável | Continue acompanhando; ainda sem estimativa de tempo, com a razão |
| Tendência disponível, sem tempo no horizonte observado | Explicação do horizonte do histórico |
| Leitura antiga, histórico insuficiente ou cultura sem faixa | Estimativa suspensa e razão correspondente |
| Tempo zero | Limite inferior atingido, preservando a orientação completa do motor |
| Sensor sem comunicação | Aviso específico e Atualizar dados |
| Integração não configurada | Destino Configurar sensor |
| Sessão expirada | Entrar novamente; novas consultas automáticas são interrompidas |
| Falha da análise com sensor disponível | Leitura preservada e nova tentativa de análise |

Atualizar dados reutiliza os endpoints existentes, sem recriar gráficos ou trocar de página. O controle fica desabilitado e informa Atualizando enquanto a consulta está em andamento. Chamadas simultâneas são compartilhadas; respostas de outra visão ou de outro usuário são descartadas. A cadência continua em 30 segundos para o sensor e 10 minutos para análise. Cada consulta do dashboard tem prazo de 15 segundos. Histórico semanal e interpretação opcional não apagam uma análise válida quando falham.

## Contexto da leitura

A faixa é obtida de `currentUser.cropConfig`; limites ausentes são identificados como não configurados. O horário vem da resposta do sensor ou de seu snapshot, nunca do horário de conclusão do carregamento. A interface mostra a zona configurada; zona ausente ou inválida usa UTC com aviso. Atualidade é calculada a partir do timestamp e considera o estado/limite de atualidade informado pelo motor. Horário ausente ou futuro recebe aviso, sem alegação de leitura recente.

## Ordem operacional

A ordem do DOM e a visual são: contexto, leitura do solo, próximo passo, indicadores auxiliares e gráficos. No desktop os dois primeiros painéis ficam lado a lado; no celular a orientação segue imediatamente a leitura. A saudação é secundária e recolhida em telas estreitas. A conexão permanece visível em todos os tamanhos.

## Evidências

- 104 testes offline aprovados e build concluído.
- Regressões para ausência de tendência, horizonte, tempo zero, leitura antiga, configuração ausente, sessão expirada, fuso inválido, limites incluindo zero e ordem semântica.
- Falha do sensor seguida de análise saudável conserva o erro correto; uma única atualização recupera a tela sem recarregar. Cliques repetidos compartilham a consulta pendente.
- Respostas da visão anterior e de outro usuário não reescrevem a visão corrente. Uma análise anterior também não limpa a leitura de um dashboard aberto depois.
- Inspeção no Safari: largura ampla, iframe 390×680 e iframe 900×680. Conferidos erro simulado, recuperação pelo botão, faixa/horário/atualidade, orientação antes das referências e conexão visível no tablet.
- Toda API usada na verificação visual foi substituída por exemplos sintéticos locais. Não houve acesso ao banco nem chamadas a sensores/serviços reais. Fixtures temporárias foram removidas.

A nota 25/40 permanece como registro histórico da crítica anterior. Não foi executada nova crítica nem atribuída pontuação após esta implementação. O P2 sobre distinção permanente da escala regional permanece fora deste escopo; a crítica original não foi encerrada como se todos os seus achados estivessem resolvidos.
