---
description: Envia todas as alterações do projeto para o GitHub (commit + push)
---

# Deploy — Enviar Alterações para o GitHub

Este workflow envia todas as mudanças feitas no projeto para o repositório GitHub.

## Passos

1. Verificar o status das alterações pendentes:

// turbo
```bash
git -C "f:\HIDRAPE TECNOLOGIA\Código\Software\dashboard-hidrape" status --short
```

Se não houver alterações, informar ao usuário que está tudo atualizado e encerrar.

2. Adicionar todos os arquivos alterados ao staging:

```bash
git -C "f:\HIDRAPE TECNOLOGIA\Código\Software\dashboard-hidrape" add .
```

3. Criar o commit com uma mensagem descritiva. A mensagem deve resumir as alterações feitas na sessão atual. Use o formato:

```bash
git -C "f:\HIDRAPE TECNOLOGIA\Código\Software\dashboard-hidrape" commit -m "tipo: descrição curta das mudanças"
```

Tipos válidos para a mensagem:
- `feat:` — nova funcionalidade
- `fix:` — correção de bug
- `style:` — mudanças visuais/CSS
- `refactor:` — refatoração de código
- `docs:` — documentação
- `chore:` — manutenção geral

4. Enviar para o GitHub:

// turbo
```bash
git -C "f:\HIDRAPE TECNOLOGIA\Código\Software\dashboard-hidrape" push
```

5. Confirmar o sucesso ao usuário, mostrando:
   - Quantos arquivos foram alterados
   - A mensagem do commit
   - Link do repositório: https://github.com/hidrapetech-coder/hidrape-dashboard
