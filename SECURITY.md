# Política de Segurança (Security Policy)

Este documento detalha as políticas de segurança aplicadas no repositório `hidrape-dashboard`. Levamos a segurança e a proteção de dados (LGPD) de nossos usuários a sério.

## 1. Tratamento de Credenciais
- **Senhas:** Nunca são armazenadas em texto puro. Utilizamos `bcrypt` com custo (cost factor) 12 para aumentar o custo de ataques de força bruta.
- **Tokens e Chaves de Terceiros (Blynk, CallMeBot, APIs):** Todas as integrações sensíveis salvas no banco de dados utilizam criptografia forte em repouso (AES-256-CBC). O frontend não tem acesso a essas chaves, sendo mascaradas nas requisições (ex: `hasBlynkToken: true`).

## 2. Autenticação e Autorização (JWT & Cookies)
- O sistema utiliza JSON Web Tokens (JWT) para gestão de sessão.
- **Cookies httpOnly:** Os tokens JWT são trafegados **exclusivamente via cookies httpOnly** e `SameSite=Strict`.
- **Sem LocalStorage:** Nenhum token de acesso é armazenado no `localStorage`, reduzindo a exposição do token a JavaScript; isso não elimina riscos de XSS.
- **Proteção de Força Bruta:** Contas são bloqueadas temporariamente por 15 minutos após 5 tentativas falhas de login contínuas.
- **Revogação por Troca de Senha:** Alterações de senha revogam imediatamente todas as sessões anteriores geradas antes da troca.

## 3. Segurança do Frontend (CSP)
- A Política de Segurança de Conteúdo (CSP) restringe o carregamento e a execução de recursos (como scripts e imagens) apenas a origens explicitamente permitidas.
- **Bloqueio de Execução Inline:** O uso de scripts embutidos no HTML (diretiva `'unsafe-inline'`) está expressamente proibido para garantir mitigação contra ataques de injeção de código (XSS).
- **Aviso de Compatibilidade (Drop do IE11):** Devido à adoção estrita da CSP moderna (nível 2/3), não suportamos navegadores defasados como o Internet Explorer 11.

## 4. Reporte de Vulnerabilidades
Se você descobrir alguma falha ou vulnerabilidade neste sistema, por favor, envie um e-mail para **security@hidrape.com.br**. Não crie Issues públicas sobre falhas críticas não corrigidas.

## 5. Motor Agro e execução isolada

O motor não aceita entradas de umidade fora de 0–100 nem valores parcialmente numéricos. Leituras suspeitas suspendem recomendações. A IA generativa só pode ordenar frases aprovadas; texto livre do provedor nunca é enviado ao usuário.

Os segredos JWT e AES não possuem defaults; os defaults públicos antigos são rejeitados. Produção exige origens CORS explícitas. Endpoints aceitam autenticação por cookie; clientes legados que enviam Bearer precisam migrar. Falhas de fontes externas são registradas por evento, sem URLs com tokens, prompts ou conteúdo de erros dos provedores.

Redis indisponível bloqueia tentativas pagas e envio de alertas; leituras e diagnóstico determinístico continuam quando o banco responde. Cotas do Gemini são atômicas, compartilhadas pelos endpoints e por usuário; o circuit breaker de disponibilidade é local a cada processo.

A remoção de defaults não rotaciona segredos já expostos. A rotação do JWT invalida sessões. A chave AES não deve ser simplesmente substituída em um banco com integrações cifradas: requer recifragem ou novo cadastro de tokens. Essa operação e a limpeza de histórico de `MIGRATION.md` não são executadas por testes ou migrations do motor.
