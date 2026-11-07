# Movimento no dashboard Hidrape

Alvo: `public/views/dashboard.html` e seus controles compartilhados. A tela é uma ferramenta de operação: o movimento deve explicar mudanças de estado sem retardar a leitura ou produzir valores intermediários fictícios.

## Tese

- **Momento focal:** o recebimento de uma nova leitura de umidade. O número muda imediatamente para a medição recebida; a barra acompanha a nova posição com transformação, e uma confirmação visual breve indica atualização.
- **Continuidade:** o menu móvel entra pelo lado em que está ancorado; diálogos deixam clara a mudança de camada; a troca de conteúdo não produz coreografias de cards.
- **Feedback:** controles respondem à pressão e mensagens de sucesso recebem uma confirmação pontual.
- **Orçamento:** CSS e Web Animations API, sem nova dependência. Durações curtas, no máximo uma animação por alvo, sem animações de layout, contagem de números, loops decorativos ou espera para usar os controles.

## Estados e acessibilidade

O estado final é aplicado antes de qualquer efeito e continua correto quando animações não estão disponíveis. A abertura ou o fechamento repetido interrompe o movimento anterior, sem callbacks antigos que reabram painéis ou escondam conteúdo. Navegação, mudança de preferência e aba oculta encerram os efeitos em curso.

Com movimento reduzido, remover deslocamento e variação de escala, preservando confirmação curta por cor ou opacidade. Gráficos não devem executar uma animação longa que ignore essa preferência. Nenhum efeito recebe significado de recomendação agronômica por conta própria.

## Limites

Preservar os tokens e a composição já aprovados, as leituras, a autenticação, as APIs e o banco. A crítica é um diagnóstico da versão anterior à aplicação de movimento; melhorias fora desse escopo ficam registradas para decisão posterior.

## Implementação e verificação

- Tokens compartilhados: feedback 100 ms, saída 140 ms, controles 160 ms, camadas 240 ms e atualização da leitura 320 ms.
- Barra de umidade por `scaleX`, mantendo o valor textual exato e imediato. Dado ausente recolhe a barra em vez de representar 100%.
- Menu móvel e diálogos usam efeitos interrompíveis. O menu que sai fica inerte, e Escape devolve o foco ao acionador.
- Mensagens de sucesso recebem uma confirmação breve; nenhum gráfico reconstitui seus dados com animação de valores intermediários.
- Movimento reduzido usa cor/opacidade por 100 ms, sem deslocamento da camada ou percurso da barra. A preferência é observada também quando muda durante a sessão.
- Efeitos em execução são encerrados ao ocultar a aba ou navegar; controles permanecem disponíveis sem Web Animations API.
- 95 testes offline aprovados, incluindo reabertura de diálogo/menu, cancelamento, aba oculta, ausência de suporte e movimento reduzido.
- Conferência no Safari com exemplos identificados: dashboard e barra, busca, reabertura/Escape, diálogo NASA e menu em viewport de 390 px com retorno de foco. Essa inspeção visual não mede taxa de quadros nem substitui ensaio de desempenho em aparelhos reais; movimento reduzido foi exercitado nos testes, sem alterar preferências do sistema do usuário.
- Build recompôs os arquivos minificados usados pelo HTML. Banco e APIs não foram alterados nesta etapa.
