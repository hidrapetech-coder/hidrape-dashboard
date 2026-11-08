# Decisões do dono — Fase 1

Registro das decisões fornecidas em 8 de novembro de 2026, após a análise do commit `930c2cd0e52771f1608229162fe66d340b462a08`.

- Fase alvo: **1**, implementação local em branch e worktree próprios.
- Banco e funcionamento do login: preservar integralmente. Sem migrations, rotação de segredos ou mudanças no cliente/schema de autenticação.
- Ingestão: worker externo, independente do acesso à interface, inicialmente Blynk, consulta nominal a cada **5 minutos** por dispositivo ativo.
- Persistência: variação de **2 pontos percentuais** ou heartbeat de **15 minutos**. O log deduplicado também usa heartbeat operacional configurável de 15 minutos.
- Comunicação: **3 consultas efetivamente realizadas** sem confirmação pedem investigação. Ausência de execução do worker não equivale a defeito físico.
- Qualidade: manter bloqueio para medição com mais de **30 minutos**; consulta e heartbeat não comprovam nova medição.
- Armazenamento: PostgreSQL agro **dedicado**, ainda sem provisionamento confirmado. Preparar integração, schema, DDL e operação; não conectar nem aplicar migrations nesta entrega.
- Multi-talhão/multipropriedade: preparar a estrutura; fluxo funcional limitado ao dispositivo e talhão principais.
- Dados calibrados e eventos reais: disponibilidade não confirmada. Nenhuma importação automática, treinamento, autocalibração ou prescrição quantitativa.
- Modo calibrado da Fase 4: **não autorizado** nesta entrega.

Decisões de engenharia: reutilizar `pg`, Zod e Axios já instalados; não adicionar dependências. O worker exige conexão direta ou pooler de **sessão**, necessária ao lock distribuído de sessão. Os limites do provedor devem ser conferidos antes da ativação.

A prioridade de preservar o login prevalece sobre o encerramento global por configuração agro inválida: o worker recusa inicialização inválida; o processo HTTP preserva a autenticação e deixa a integração agro indisponível, com mensagem genérica.
