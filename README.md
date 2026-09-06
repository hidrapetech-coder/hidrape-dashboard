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
- **🛰️ Satélite NASA POWER** — Monitoramento da tendência regional de umidade superficial direto do satélite.
- **🤖 Motor Agro (v2.0)** — Processamento avançado que cruza dados de IoT, Clima e Satélite com módulos de:
  - **Data Quality:** Avaliação da integridade dos dados dos sensores.
  - **Anomaly Detection:** Filtro inteligente de ruídos e falhas nos sensores.
  - **ML Predictor:** Previsão da taxa de secagem e estimativa do momento ideal para irrigação.
  - **Risk & Confidence:** Cálculo do nível de risco e confiabilidade para evitar falsos alertas.
- **🧠 Laudos por IA Generativa** — Diagnóstico agronômico traduzido para linguagem natural (via Gemini AI).
- **🔐 Autenticação JWT** — Sistema de login seguro com bcrypt e sessões criptografadas.
- **⚙️ Configuração por Usuário** — Personalização de tipo de cultura (faixas ideais), limites e configurações de cidade/UF.

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
- Node.js >= 18
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
Crie um arquivo `.env` na raiz baseado nas configurações abaixo:
```env
PORT=3002
JWT_SECRET=sua_chave_secreta_aqui
BLYNK_TOKEN=seu_token_blynk
BLYNK_URL=https://blynk.cloud/external/api/get

# Supabase / Prisma DB
DATABASE_URL="postgres://user:pass@host:5432/db?pgbouncer=true"
DIRECT_URL="postgres://user:pass@host:5432/db"

# IA
GEMINI_API_KEY=sua_chave_do_google_gemini
```

### 4. Sincronize o Banco de Dados (Prisma)
```bash
npx prisma db push
npx prisma generate
```

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

- **Sensores Blindados:** O novo módulo `anomalyDetection.js` protege o sistema contra dados congelados ou variações absurdas (ruído elétrico), evitando acionamentos indevidos.
- **Confiança (Confidence Score):** Se um sensor falha, a IA relata baixa confiança em vez de gerar um laudo falso/perigoso.
- **Banco de Dados Seguro:** Migração para PostgreSQL via Supabase garante integridade relacional, com Prisma como ORM.
- **Auth:** Senhas com hash (bcrypt) e rotas protegidas por JWT.

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
