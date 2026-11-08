# Visão geral compacta no desktop

A partir de 769 px, os oito painéis ocupam três faixas: umidade e próximo passo; três referências; dois gráficos e leitura agronômica. A altura acompanha a janela. Em alturas extremas ou com zoom, a página pode rolar para preservar a legibilidade; não há bloqueio de rolagem ou corte global do conteúdo.

Os resumos mantêm leitura, faixa, horário, atualidade e atualização do sensor. Os detalhes ficam em diálogos nativos abertos pela área livre do card ou por um botão com nome acessível. Controles internos continuam executando suas próprias ações. A NASA mantém seu diálogo existente. Os demais detalhes são cópias dos valores presentes na abertura, sem mover os nós originais, duplicar IDs ou disparar novas consultas. Gráficos são recriados com uma cópia dos pontos atuais e liberados ao fechar. Escape, botão de fechar e retorno de foco seguem o diálogo nativo.

No mobile, os novos controles e o resumo adicional ficam ocultos. A ordem, os textos completos e o layout anterior permanecem no fluxo da página.

## Verificação

- Safari, demonstração com dados simulados: oito painéis e rodapé visíveis em 1440 × 715, 1366 × 650 e 1024 × 600 CSS px. Conferidos espaçamento, títulos, indicadores e gráficos.
- Mobile de 390 px: disposição vertical, faixa e horário completos preservados; novos controles de expansão ausentes.
- Conferidos diálogos de umidade, próximo passo e gráfico, incluindo explicação completa, valores textuais, gráfico ampliado e fechamento por Escape.
- Avaliações independentes de estrutura e detecção antes da implementação. Detecção final de layout em HTML e CSS: sem apontamentos (`[]`).
- 107 testes offline passaram, incluindo abertura pelo card, leitura atual na reabertura, preservação dos nós originais, isolamento dos controles internos, comportamento móvel e liberação do gráfico do diálogo.
- Build de produção concluído. Nenhuma alteração de API, backend ou banco de dados.
