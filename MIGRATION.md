# Guia de Migração e Limpeza de Histórico (Fase 0)

O repositório `hidrape-dashboard` continha arquivos com credenciais reais (`test-pooler.js`) e dados sensíveis de payload JWT (`response.json`) em seu histórico de commits. Apenas deletar os arquivos do `HEAD` (último commit) não é suficiente, pois eles permanecem acessíveis no histórico do Git.

Para remover completamente esses arquivos de **todo o histórico**, usaremos a ferramenta oficial recomendada pelo Git: `git filter-repo`.

> [!WARNING]
> Este é um procedimento destrutivo que reescreve a história do Git (os hashes dos commits vão mudar). Todos os membros da equipe precisarão fazer um clone limpo após este processo, pois `git pull` em clones antigos causará conflitos irreversíveis.

## Pré-requisitos

1. **Garantir a Rotação de Senha:** Confirme que a senha do banco de dados (Supabase) já foi rotacionada no painel. A limpeza do histórico não protege contra atacantes que já clonaram o repositório enquanto ele estava público.
2. **Tornar o Repositório Privado (Temporariamente):** Vá nas configurações do GitHub e mude a visibilidade do repositório para "Private" até que a limpeza seja concluída.
3. **Instalar o `git filter-repo`**:
   - Requer Python 3 instalado.
   - Instalação via pip: `pip install git-filter-repo`
   - Instalação via Homebrew (Mac): `brew install git-filter-repo`

## Passo a Passo da Limpeza

1. **Faça um clone fresco (bare) do repositório:**
   ```bash
   git clone --bare https://github.com/hidrapetech-coder/hidrape-dashboard.git
   cd hidrape-dashboard.git
   ```

2. **Execute o filtro para remover os arquivos sensíveis:**
   ```bash
   git filter-repo --invert-paths --path test-pooler.js --path response.json
   ```
   *Este comando varre todo o histórico e expurga qualquer menção a esses dois arquivos.*

3. **Inspecione o repositório local:**
   Opcionalmente, confira se o arquivo realmente sumiu do histórico usando `git log --all -- test-pooler.js` (não deve retornar nada).

4. **Faça o Force-Push de volta para o GitHub:**
   ```bash
   git push origin --force --all
   git push origin --force --tags
   ```

5. **Exclua o clone bare local e clone o repositório normalmente de novo:**
   ```bash
   cd ..
   rm -rf hidrape-dashboard.git
   git clone https://github.com/hidrapetech-coder/hidrape-dashboard.git
   cd hidrape-dashboard
   ```

## Ações para os outros Desenvolvedores

Avise a equipe:
> "O histórico do Git foi reescrito por motivos de segurança. Apaguem seus clones locais antigos e façam um novo `git clone`."
