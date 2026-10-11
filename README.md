# 🌱 Hidrape Dashboard IoT — Plataforma SaaS Agrícola

Dashboard inteligente para monitoramento agrícola em tempo real, com integração IoT via Blynk, análise climática (Open-Meteo), dados de satélite (NASA POWER), motor de IA agronômica (Google Gemini) e arquitetura robusta no backend.

![Status](https://img.shields.io/badge/status-em%20desenvolvimento-brightgreen)
![Node](https://img.shields.io/badge/node-%3E%3D18-blue)
![Database](https://img.shields.io/badge/database-Supabase%20%2F%20PostgreSQL-336791)
![ORM](https://img.shields.io/badge/ORM-Prisma-2D3748)
![License](https://img.shields.io/badge/license-Propriet%C3%A1rio-red)

---

## 🚀 Funcionalidades

- **📊 Dashboard em Tempo Real** — Monitoramento de umidade do solo com gráficos interativos (Live & Histórico).
- **🌤️ Inteligência Climática** — Previsão do tempo, evapotranspiração (ET₀) e dados meteorológicos integrados via Open-Meteo.
- **🛰️ Satélite NASA POWER** — Estimativa regional de saturação superficial relativa (GWETTOP), com datas e indisponibilidade explícitas. Não é uma medição do talhão.
- **🤖 Motor Agro v3** — Pipeline determinístico com entradas e decisão registradas:
  - **Qualidade:** percentual numérico 0–100, datas válidas e distintas, leitura há até 30 minutos; ao menos 5 leituras ao longo de 1h para recomendar manejo.
  - **Anomalias:** suspeita de congelamento com tolerância e janela real; saltos requerem confirmação. Chuva/irrigação legítima pode causar salto; o sistema não afirma defeito automaticamente.
  - **Tendência:** regressão linear observada em pontos percentuais/hora. Extrapolação limitada ao histórico disponível, até 24h. Ausência de tendência resulta em `null`, não em taxa inventada. Não há treinamento de ML ou autocalibração em produção.
  - **Risco e confiança:** bloqueio explícito de recomendações com dados inválidos, antigos, anomalias graves ou cultura sem limites; risco fica desconhecido. Scores são operacionais, não probabilidades calibradas.
- **🧠 Gemini opcional** — Organiza frases aprovadas pelo motor por IDs; validação aceita apenas permutação completa, preservando o aviso principal. Não gera números ou recomendações livres. Falhas, quotas e respostas inválidas retornam o diagnóstico determinístico.
- **🔐 Autenticação JWT** — Senhas com bcrypt e sessão em cookie HttpOnly; nenhum token retornado no JSON ou persistido no localStorage.
- **⚙️ Configuração por usuário** — Cultura, cidade/UF, coordenadas, fuso IANA e limites explícitos para “Personalizado”. Sem fuso, relatórios usam UTC e mostram o aviso para configurar.
- **📍 Mapa de localização** — Não há produto NDVI nem limites medidos do talhão. Foram removidos polígonos, mapas de calor e séries históricas artificiais das telas operacionais.

As faixas de cultura são referências do **percentual do sensor calibrado**, não teor volumétrico de água. ET₀/chuva em mm e GWETTOP regional não são convertidos em porcentagem do sensor. O motor não calcula lâmina, volume ou duração de irrigação. Volume teórico mensal por ET₀ × área é um indicador meteorológico, não uma prescrição.

---

## 📁 Estrutura do Projeto

```text
dashboard-hidrape/
├── server.js              # Servidor Express principal
├── prisma/
│   └── schema.prisma      # Modelagem do Banco de Dados (Supabase/PostgreSQL)
├── package.json           # Dependências e scripts
├── .env                   # Variáveis de ambiente
│
├── controllers/           # Lógica de negócio (API)
│   ├── authController.js  # Autenticação e registro
│   ├── sensorController.js# Dados dos sensores IoT
│   └── agroController.js  # Orquestração do Motor de IA Agronômico
│
├── services/              # Serviços externos e core da aplicação
│   ├── agroEngine/        # Módulos independentes do Motor Agro (ML, Anomalias, Qualidade, etc.)
│   ├── iaService.js       # Integração com Google Gemini
│   ├── emailService.js    # Serviço de e-mail (Nodemailer)
│   └── (outros serviços)
│
├── middleware/            # Middlewares Express (Auth)
│
└── public/                # Frontend SPA (Vanilla JS + CSS)
    ├── index.html         # Página principal (entry point)
    ├── css/
    │   └── style.css      # Estilos (glassmorphism, design responsivo premium)
    ├── js/
    │   └── app.js         # Lógica do frontend (SPA Router, chamadas API, gráficos)
    └── views/
        ├── dashboard.html # Painel principal de operação
        ├── analysis.html  # Painel de Análise Inteligente e cruzamento de dados (IA)
        ├── history.html   # Histórico de dados semanais
        ├── login.html     # Tela de login
        ├── register.html  # Tela de registro
        └── settings.html  # Configurações de perfil e fazenda
```

---

## ⚡ Instalação e Execução

### Pré-requisitos
- Node.js 24 LTS
- Conta no Supabase (PostgreSQL)
- Chave API do Gemini (Google AI Studio)

### 1. Clone o repositório
```bash
git clone https://github.com/hidrapetech-coder/hidrape-dashboard.git
cd hidrape-dashboard
```

### 2. Instale as dependências
```bash
npm install
```

### 3. Configure as variáveis de ambiente
Use `.env.example` como lista de variáveis e preencha segredos privados no ambiente de execução. `JWT_SECRET` requer ao menos 32 caracteres; `ENCRYPTION_KEY` requer exatamente 32 bytes. Chaves públicas antigas são rejeitadas. O servidor falha na inicialização se faltar configuração obrigatória, sem imprimir valores.

Gemini fica desativado por padrão. Para ativá-lo, configure chave/modelo, `GEMINI_ENABLED=true` e Redis disponível. Cota diária UTC e limite de 3 tentativas/minuto por usuário abrangem diagnóstico e resumo mensal; retries também consomem cota. Sem Redis, apenas os resultados determinísticos continuam. Modelo, timeout (1–20s), temperatura e limite de saída são configuráveis.

### 4. Prepare o banco e o cliente Prisma

Veja [MIGRACAO_MOTOR_IA.md](MIGRACAO_MOTOR_IA.md) antes de atualizar um banco existente: há uma baseline e uma migração aditiva. Gerar o cliente não aplica migrations. Não use `db push` indiscriminadamente no banco de produção.

### 5. Execute o servidor
```bash
# Desenvolvimento (com auto-restart)
npm run dev

# Produção
npm start
```
Acesse: `http://localhost:3002`

---

## 🛡️ Segurança e Confiabilidade

- Recomendações suspensas em caso de dados insuficientes/invalidade; a suspeita de congelamento precisa ser conferida no campo.
- Falha climática mantém o sensor disponível com confiança reduzida. Falha do Gemini mantém o diagnóstico determinístico.
- Fontes externas usam prazo total, limites de corpo e validação. NASA antiga/inválida não influencia a tendência do sensor.
- Consultas e snapshots têm escopo do usuário autenticado. Logout remove estado local e respostas antigas de outras sessões são descartadas.
- Relatórios usam datas no fuso configurado, sete dias completos no painel semanal (incluindo dias sem leitura como `null`), cobertura climática e contagem de decisões efetivamente registradas.

### Verificação sem APIs ou banco

```bash
npm test
npm run check:prisma
npm run build
```

Vitest desativa carregamento de `.env` e bloqueia rede; serviços são substituídos por fixtures. A verificação Prisma usa configuração temporária, credenciais sintéticas e rede/arquivos `.env` bloqueados. Valida schema, geração e compatibilidade do override `deepmerge-ts@8` usado por `@prisma/config`. O override altera a mesclagem de Maps em relação à v7; o projeto usa configuração simples de objetos e testa seu carregamento. Reavalie o override ao atualizar Prisma.

[Correções e validações por achado](CORRECOES_MOTOR_IA.md). A revisão original permanece em [REVISAO_MOTOR_IA.md](REVISAO_MOTOR_IA.md).

---

## 🧰 Tecnologias

| Categoria   | Tecnologia                     |
| ----------- | ------------------------------ |
| **Backend** | Node.js, Express               |
| **Banco**   | PostgreSQL (Supabase), Prisma ORM |
| **Auth**    | JWT, bcryptjs                  |
| **Frontend**| HTML5, CSS3, JS Vanilla (SPA), Chart.js |
| **IoT**     | Blynk Cloud API                |
| **Clima**   | Open-Meteo, NASA POWER (Satélite) |
| **IA**      | Google Gemini                  |

---

## 📝 Licença

Projeto proprietário — **Hidrape Tecnologia** © 2026. Todos os direitos reservados.
