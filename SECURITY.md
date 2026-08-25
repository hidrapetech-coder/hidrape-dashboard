# 🛡️ SECURITY REVIEW — HIDRAPE

Este documento detalha o panorama de segurança atual da aplicação **Hidrape Dashboard SaaS**, bem como as mitigações implementadas e os riscos residuais aceitos.

## 🟢 Corrigido

*   **Rate Limiting**: Separados em fluxos isolados (`loginLimiter`, `registerLimiter`, `forgotPasswordLimiter`, `resetPasswordLimiter`). Isso mitiga ataques de força bruta, spam de emails e *User Enumeration* no fluxo de recuperação.
*   **Recuperação de Senha (Forgot / Reset)**: Implementado fluxo seguro com:
    *   Token criptograficamente forte de 32 bytes via `crypto.randomBytes()`.
    *   Tokens expiram em 15 minutos e são invalidados automaticamente no banco.
    *   O banco armazena apenas o `hash sha256` do token, evitando roubo do banco para reset de senhas.
    *   Mensagens genéricas de erro anti *User Enumeration* no formulário de forgot.
*   **JWT Security**: 
    *   Assinatura algorítmica `algorithms: ['HS256']` forçada na verificação do `jsonwebtoken` (Mitigação de *Algorithm Confusion Attack*).
    *   Redução da validade do token de 5 dias para `1d` (24 horas) para reduzir exposição.
*   **XSS Mitigation**: 
    *   A API sanitiza o backend (anti-NoSQL/HTML injection via `sanitize` e `express-mongo-sanitize`).
    *   A função `escapeHTML()` foi inserida na arquitetura do Vanilla SPA (`app.js`), impedindo a execução arbitrária via `innerHTML` nos locais onde dados do usuário eram renderizados dinamicamente nas views e alertas da IA.
*   **CORS**: Restrito estritamente aos domínios permitidos, removendo a cláusula curinga `.vercel.app` para evitar ataques de domínios bypass arbitrários.
*   **Validação (Zod)**: Todas as requisições de Autenticação e Configuração passam por *Schemas Estritos*, impedindo completamente o *Mass Assignment* e garantindo tipos de dados esperados antes de atingir os controladores.
*   **IDOR (Isolamento Inseguro de Objetos)**: Confirmado como seguro. Todo dado IoT injetado ou consultado faz bind explícito em nível de servidor com o `req.user.id` decodificado e garantido pelo JWT.
*   **Trim de Resposta API (Over-fetching)**: Em rotas de usuário, o backend aplica um helper rigoroso `toSafeUser(DTO)` que remove todos os hashes de senha, tokens de reset e chaves de API (`blynkToken`, `callmebotApiKey`) do payload, repassando ao Frontend apenas metadados (flags) para informar sua presença.
*   **Ocultação Visual**: O painel de Configuração no frontend não carrega as chaves criptográficas ativas. Ele exibe *placeholders* descritivos e as transmite estritamente de maneira unidirecional caso ocorram edições.
*   **Gestão de Secrets e Dependências**: Retiramos as chaves hardcoded e atualizamos pacotes vitais para suprimir falhas apontadas via _npm audit_. Abstivemos de realizar upgrades nocivos (Prisma / Nodemailer legacy break).

## 🟡 Melhorias futuras

*   **Implementação de Refresh Tokens**: A estratégia atual mantem os JWTs no `localStorage` por necessidade do SPA atual, sem bundlers ou workers dedicados. Como não temos um mecanismo de `Refresh Token` silencioso pronto (exigiria arquitetura de persistência e expiração síncrona), os usuários precisarão relogar a cada 24 horas. Uma futura implementação de `HttpOnly Cookies` somado a rotas estritas de `Refresh` aumentaria ainda mais a defesa.
*   **Políticas de Conteúdo Fortificadas (CSP)**: O projeto usa a tag `'unsafe-inline'` no CSP para script e estilo devido ao design da SPA baseada em Vanilla JS carregado sob demanda. Em versões futuras, recomenda-se adotar `nonces` ou migrar a injeção do UI para componentes React/Vite puros.
*   **Blacklist de Senhas Fracas**: As senhas usam *bcrypt cost 12*, mas a aplicação aceita `123456`. Integrar `zxcvbn` para forçar complexidade no frontend/backend.

## 🔴 Problemas restantes

*   **Invalidação Imediata de Sessões Múltiplas**: Em fluxos *stateless* (sem blacklist Redis ou *JTI revogable*), quando o usuário reseta a senha, a sessão JWT ativa antiga em outro aparelho permanece válida até expirar (máx. 24h). Isso é um risco residual aceito pela arquitetura atual baseada 100% em Payload JWT.

---
**Auditoria Concluída e Registrada:**
*As chaves de teste local são expostas na camada `nodemailer/Ethereal`, mas as chaves secretas de produção estão devidamente isoladas via `.env` não versionado.*
