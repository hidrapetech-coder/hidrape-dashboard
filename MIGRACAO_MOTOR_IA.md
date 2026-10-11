# Implantação das correções do Motor Agro

Esta sessão alterou somente arquivos locais. Não leu `.env`, não conectou ao banco, não executou migrations em produção e não fez deploy.

## Banco existente

O repositório não tinha migrations versionadas. `prisma/migrations/0_baseline/migration.sql` representa o schema anterior às correções; a migração `20261010000000_agro_configuration` apenas adiciona `User.timeZone`, `minIdeal`, `maxIdeal` e uma constraint para o par de limites. Os campos novos são opcionais. Nenhum dado legado é sobrescrito.

1. Em staging, com backup e credenciais desse ambiente, compare o schema real à baseline antes de marcá-la como já aplicada. Se há diferenças, resolva-as antes de continuar. Não rode o SQL da baseline sobre tabelas já existentes.
2. Somente depois da comparação, registre a baseline existente:

   ```bash
   npx prisma migrate resolve --applied 0_baseline
   ```

3. Aplique a migração aditiva, gere o cliente e execute a validação de integração em staging:

   ```bash
   npx prisma migrate deploy
   npx prisma generate
   npm test
   npm run build
   ```

4. Implante backend e frontend juntos. O código novo requer as três colunas; aplicar a migração antes do código mantém compatibilidade com o backend antigo. Aplique o mesmo procedimento a produção somente na etapa de implantação autorizada.

Para **banco vazio**, `migrate deploy` aplica baseline e alteração aditiva; não marque a baseline como aplicada antes de criar as tabelas.

## Configuração

- Runtime: Node.js 24. Instale a partir de `package-lock.json` (`npm ci`); o cliente Prisma precisa ser gerado no ambiente de build. Na CI, o install baixa os binários públicos do Prisma com geração automática desativada; em seguida, os testes e o smoke test são isolados e bloqueiam rede. Não há segredos de aplicação na workflow.
- Configure segredos JWT/AES privados, URLs válidas do banco e origens CORS explícitas. A validação não imprime os valores. A rotação de chaves comprometidas é uma operação separada; preserve a capacidade de decifrar/recriar integrações existentes.
- Em Configurações, confirme o fuso IANA da propriedade (por exemplo `America/Recife`), cidade/UF, coordenadas retornadas e limites de “Personalizado”. Cadastros existentes sem fuso usam UTC explicitamente. Localizações legadas que receberam São Paulo por default precisam ser confirmadas pelo proprietário; o banco não permite distinguir esses defaults de uma escolha legítima.
- Verifique no dispositivo que V0 publica percentual calibrado 0–100. Leituras brutas 0–1023/4095 são rejeitadas. Não converter sem calibração.
- Gemini pode permanecer desativado; o diagnóstico continua útil. Ativação requer chave/modelo válidos e Redis disponível. As tentativas estão limitadas por usuário/dia UTC, minuto e lock de concorrência.
- Configure a função Vercel com prazo suficiente para a requisição completa e valide no preview (orçamento recomendado: 60s). HTTP climático/NASA: 8s em paralelo; Gemini: até 20s incluindo um retry; Redis: 2s por comando. O limite efetivo da conta/função e a latência do banco não foram verificados. A configuração legada `builds/routes` foi preservada; não foi introduzida uma combinação incompatível de `functions` e `builds`.
- Recursos estáticos sem hash agora revalidam cache; o JS carregado usa `v=13`.

## Verificação antes de liberar

Em staging, valide cadastro/login, troca e remoção de integrações, configuração personalizada, falhas de sensores/clima, relatório cruzando meia-noite no fuso escolhido e disponibilidade de migrations/cliente Prisma. Verifique ausência de token no JSON e no localStorage. Os testes locais cobrem contratos com mocks; não certificam SQL executado, Redis real, latência em Vercel ou precisão agronômica em campo.

O motor v3 usa tendência linear condicional e faixas de referência. Não oferece autocalibração, prescrição de volume/duração nem NDVI. Limiar de congelamento/salto e confiança precisam de validação em campo. Uma suspeita bloqueada exige conferência física, não prova defeito do sensor.
