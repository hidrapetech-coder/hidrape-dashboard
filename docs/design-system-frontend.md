# Design system do workspace Hidrape

Aplicação do briefing de design ao frontend existente em HTML, CSS e JavaScript, mantendo as APIs e o motor agronômico do projeto.

## Direção adotada

A interface serve ao acompanhamento agrícola: ler o sensor, entender a disponibilidade dos dados e consultar a análise antes de tomar decisões. O dashboard é a tela representativa do sistema; a navegação, os tokens, os formulários e as superfícies são compartilhados pelas outras telas.

- Tema escuro neutro, próximo das referências anexadas, com o azul acinzentado da Hidrape para ações e seleção. Verde, amarelo e vermelho indicam estados, acompanhados de texto.
- Helvetica Neue e fontes do sistema, com números tabulares. A fonte não depende de downloads para manter sua hierarquia.
- Navegação agrupada por monitoramento, inteligência e propriedade. Cabeçalho contextual, métricas compactas, gráfico principal e orientação agronômica em paralelo.
- Painéis opacos; translucidez somente no fundo dos diálogos, com fallback opaco. Sem ruído, halos ou animações decorativas de entrada.

```text
Desktop
┌──────────────┬──────────────────────────────────────┐
│ Marca/busca  │ Propriedade / página                 │
│              ├──────────────────────────────────────┤
│ Monitorar    │ Título, conexão e acesso ao histórico│
│ Inteligência │ Leitura + contexto │ Próximo passo   │
│ Propriedade  │ Satélite · Confiança · ET₀           │
│              │ Gráfico da sessão  │ Análise         │
│ Conta/sair   │ Médias da semana   │                 │
└──────────────┴──────────────────────────────────────┘
```

A revisão da direção priorizou o gráfico de umidade e o contexto agronômico, sem introduzir métricas comerciais das referências. O rótulo anterior “uso de água” foi corrigido: o dado representa percentual do sensor, não volume consumido.

## Tokens e componentes

Os tokens ficam em `public/css/style.css`, no `:root`. Os nomes antigos são aliases para preservar os componentes existentes.

| Papel | Valor |
| --- | --- |
| Canvas | `#101113` |
| Superfície | `#181A1E` |
| Superfície elevada | `#23262C` |
| Texto principal / secundário | `#F3F4F6` / `#ADB4BF` |
| Ação / texto da ação | `#94B4C1` / `#101A20` |
| Divisor / borda de controle | `#31353D` / `#686E7A` |
| Foco | `#BDD8E4` |
| Sucesso / atenção / erro | `#64DDA1` / `#F2C56B` / `#FF9399` |

Escala de espaço: 4, 8, 12, 16, 24, 32, 48 e 64 px. Raios: 8 px nos controles, 12 px nos cards e 16 px nos diálogos. Estados de hover, pressão, seleção, foco e desabilitado têm papéis definidos. Botões compartilhados: `.button`, `.button-primary`, `.button-secondary`, `.text-button` e `.icon-btn`; componentes existentes usam os mesmos tokens.

## Comportamento e responsividade

- Busca por nome de página, sem distinção de acentos: botão visível, ⌘K/Ctrl+K, Enter para abrir o primeiro resultado, seta para baixo para selecionar e Escape para fechar.
- Diálogos nativos de busca e NASA: foco contido pelo navegador, fundo inerte e retorno do foco ao acionador.
- Em até 768 px, navegação em painel recolhível, conteúdo de fundo inerte, foco contido no menu e fechamento com Escape, fundo ou seleção de página. Leitura do solo e próximo passo aparecem primeiro, em uma coluna e na mesma ordem semântica. Indicadores auxiliares vêm depois; gráficos ficam em uma coluna. Abaixo de 360 px, os indicadores auxiliares também usam uma coluna.
- Leituras e médias dos gráficos disponíveis em texto. Zero é preservado e ausência é identificada como “sem leitura”. Se Chart.js não carregar, os valores textuais continuam disponíveis.
- Estado de erro oferece orientação de recuperação. Falha climática não apaga uma leitura válida do sensor. Sem observações da NASA, o diálogo apresenta estado vazio.
- Zoom permitido e movimento reduzido respeitado. Campos de configurações têm rótulos associados. Tabela histórica usa região própria de rolagem com acesso por teclado.
- Demonstração claramente identificada, com respostas sintéticas compatíveis com os contratos de leitura da interface. Relatórios reais exigem dados persistidos.

## Validação

- Inspeção visual no Safari em largura ampla e iframe com viewport de 390 px: entrada, dashboard, navegação móvel e configurações.
- Exercitados diálogo NASA, Escape, busca por teclado e navegação até o histórico.
- Testes offline cobrem zero versus ausência, falha climática com sensor válido, vazio de dados, busca sem acentos e controle do menu móvel, além da suíte existente.
- Build recompõe `app.min.js` e `style.min.css`, usados pelo HTML de entrada.

A prévia visual utiliza o modo de demonstração. A validação não depende de credenciais nem testa conectividade com sensores, banco ou serviços externos reais.

## Movimento de interação

A revisão Impeccable adicionou tokens de movimento e um controlador compartilhado que interrompe efeitos anteriores ao repetir uma ação. O foco é acompanhar a chegada de leituras e a abertura de camadas, mantendo os estados finais disponíveis sem animação. A especificação, os tempos e os limites de validação estão em `docs/motion-plan.md`.

## Correções dos três P1

A revisão concentrou a leitura e o próximo passo antes das referências. Faixa da cultura, horário com fuso e atualidade ficam junto à umidade. O estado da conexão permanece visível também no tablet. Estimativa ausente, análise não carregada e sensor sem comunicação têm mensagens diferentes; uma nova consulta pode ser acionada sem remontar a tela. Decisões e evidências em `docs/dashboard-p1.md`.
