# 🌱 Hidrape Dashboard IoT — Plataforma SaaS Agrícola

Dashboard inteligente para monitoramento agrícola em tempo real, com integração IoT via Blynk, análise climática, motor de IA agronômica e notificações automatizadas.

![Status](https://img.shields.io/badge/status-em%20desenvolvimento-brightgreen)
![Node](https://img.shields.io/badge/node-%3E%3D18-blue)
![License](https://img.shields.io/badge/license-Propriet%C3%A1rio-red)

---

## 🚀 Funcionalidades

- **📊 Dashboard em Tempo Real** — Monitoramento de umidade do solo com gráficos interativos
- **🌤️ Integração Climática** — Previsão do tempo e dados meteorológicos via Open-Meteo
- **🤖 Motor Agro IA** — Diagnóstico inteligente baseado em tipo de cultura, umidade e clima
- **🔐 Autenticação JWT** — Sistema de login/registro seguro com bcrypt
- **📱 Design Responsivo** — Interface adaptável para desktop e mobile com menu hamburger
- **📈 Histórico de Dados** — Análise temporal com médias semanais
- **⚙️ Configuração por Usuário** — Personalização de tipo de cultura, limites e alertas

---

## 📁 Estrutura do Projeto

```
dashboard-hidrape/
├── server.js              # Servidor Express principal
├── package.json           # Dependências e scripts
├── .env.example           # Template de variáveis de ambiente
├── .gitignore
│
├── controllers/           # Lógica de negócio (API)
│   ├── authController.js  # Autenticação e registro
│   ├── sensorController.js# Dados dos sensores IoT
│   └── agroController.js  # Motor de IA Agronômico
│
├── models/                # Schemas MongoDB
│   ├── User.js            # Modelo de usuário
│   └── Sensor.js          # Modelo de dados do sensor
│
├── middleware/             # Middlewares Express
│   └── auth.js            # Middleware de autenticação JWT
│
├── services/              # Serviços externos
│   └── emailService.js    # Serviço de e-mail (Nodemailer)
│
└── public/                # Frontend SPA
    ├── index.html         # Página principal (entry point)
    ├── css/
    │   └── style.css      # Estilos (glassmorphism, animações)
    ├── js/
    │   └── app.js         # Lógica do frontend (SPA Router)
    └── views/
        ├── dashboard.html # Painel principal
        ├── history.html   # Histórico de dados
        ├── login.html     # Tela de login
        ├── register.html  # Tela de registro
        └── settings.html  # Configurações do usuário
```

---

## ⚡ Instalação e Execução

### Pré-requisitos
- Node.js >= 18
- npm

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
```bash
cp .env.example .env
# Edite o .env com suas credenciais
```

### 4. Execute o servidor
```bash
# Produção
npm start

# Desenvolvimento (com hot-reload)
npm run dev
```

### 5. Acesse
```
http://localhost:3002
```

---

## 🔧 Variáveis de Ambiente

| Variável     | Descrição                          | Exemplo                                    |
| ------------ | ---------------------------------- | ------------------------------------------ |
| `PORT`       | Porta do servidor                  | `3002`                                     |
| `JWT_SECRET` | Chave secreta para tokens JWT      | `sua_chave_secreta_aqui`                   |
| `MONGO_URI`  | URI do MongoDB                     | `mongodb://127.0.0.1:27017/iot-saas`       |
| `BLYNK_TOKEN`| Token do dispositivo Blynk         | `seu_token_blynk`                          |
| `BLYNK_URL`  | URL base da API Blynk              | `https://blynk.cloud/external/api/get`     |

> **Nota:** Se `MONGO_URI` aponta para localhost, o sistema usa MongoDB em memória automaticamente (ideal para desenvolvimento).

---

## 🛡️ Segurança

- Senhas hash com **bcrypt**
- Autenticação via **JWT** (JSON Web Tokens)
- Variáveis sensíveis isoladas em `.env` (não versionado)
- Middleware de autenticação em todas as rotas protegidas

---

## 🧰 Tecnologias

| Categoria   | Tecnologia                     |
| ----------- | ------------------------------ |
| Backend     | Node.js, Express               |
| Banco       | MongoDB, Mongoose, MongoMemory |
| Auth        | JWT, bcryptjs                  |
| Frontend    | HTML5, CSS3, JavaScript (SPA)  |
| IoT         | Blynk Cloud API                |
| E-mail      | Nodemailer                     |
| HTTP Client | Axios                          |

---

## 📝 Licença

Projeto proprietário — **Hidrape Tecnologia** © 2026. Todos os direitos reservados.
