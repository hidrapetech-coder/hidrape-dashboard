# Hidrape

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

O usuário principal é o produtor ou responsável pelo manejo da propriedade. Usa computador e celular para acompanhar a umidade do solo e consultar orientações agronômicas antes de decidir sobre irrigação. Contexto confirmado pelo usuário em 7 de novembro de 2026.

## Product Purpose

Acompanhar a condição hídrica do solo, consultar leituras históricas e reunir dados meteorológicos e análise agronômica para apoiar o manejo. O usuário deve distinguir o que foi medido, o que é referência regional e quando não há dados suficientes para orientar uma decisão.

## Operating Context

A plataforma reúne visão geral, mapa de localização, histórico, análise agronômica, relatório mensal e configuração da propriedade e das integrações. A entrada usa autenticação; a demonstração permite explorar exemplos identificados sem sensores reais.

A implementação existente usa HTML, CSS e JavaScript sem framework no frontend, Chart.js e Leaflet, com API Express e persistência Prisma/PostgreSQL. As integrações documentadas incluem Blynk, Open-Meteo, NASA POWER e Gemini opcional.

## Capabilities and Constraints

- Percentual do sensor calibrado não equivale a teor volumétrico, milímetros de chuva ou saturação regional.
- NASA POWER/GWETTOP é uma estimativa regional de saturação superficial, não uma medição do talhão.
- O motor usa regras e dados observados; recomendações dependem de qualidade, atualidade e limites configurados da cultura.
- Ausência e zero têm significados diferentes. Datas, unidades e disponibilidade precisam acompanhar os dados.
- O score de confiança é operacional, não uma probabilidade estatística.
- A interface não pode apresentar estimativas como prescrição de lâmina, volume ou duração de irrigação.
- A demonstração utiliza exemplos sintéticos; não deve apresentá-los como observações reais.
- Este trabalho de design e movimento preserva APIs, autenticação e banco. O usuário pediu explicitamente que o banco permanecesse sem alterações deste trabalho.

## Brand Commitments

Preservar o nome Hidrape, os ativos de marca existentes e a linguagem em português. O usuário forneceu referências de dashboard escuro e editor modular; a implementação aprovada organiza navegação, contexto e área de trabalho com baixo ruído visual. Detalhes do sistema existente estão em `docs/design-system-frontend.md`.

## Evidence on Hand

- `README.md`: capacidades e limites agronômicos documentados.
- `public/assets/logo.png` e imagens locais: ativos de marca existentes.
- `public/views/` e `public/js/app.js`: telas, fluxos e demonstração identificada.
- `tests/`: regressões offline com exemplos sintéticos; não comprovam conectividade de sensores ou banco real.

## Product Principles

1. Dar prioridade à leitura local e ao contexto necessário para interpretá-la.
2. Expor origem, período e indisponibilidade sem inventar dados.
3. Apoiar a decisão do responsável pelo manejo e explicitar os limites da análise.
4. Manter continuidade entre computador e celular, com ações compreensíveis.
5. Preservar informações e interação mesmo quando serviços visuais ou dados auxiliares falham.

## Accessibility & Inclusion

O briefing exige navegação por teclado, foco visível, rótulos acessíveis, contraste, áreas de toque, zoom, alternativas textuais para gráficos e respeito a movimento reduzido. Estados não devem depender somente de cor.

## Open Decisions

Não foram definidos requisitos específicos de uso sob sol forte, conexão limitada, trabalho offline ou atendimento a múltiplas propriedades. Não inferir essas capacidades da presença do mapa ou da demonstração.
