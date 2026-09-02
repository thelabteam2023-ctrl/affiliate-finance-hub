# Banco perdido na importação de parceiros — diagnóstico e correção

## O que foi verificado (código e dados reais)

Modelo do vínculo (banco real, consultado agora):

- `contas_bancarias` tem **duas** representações do banco: `banco_id` (FK) e `banco` (texto com o nome).
- `bancos` é **global para bancos de sistema**: `is_system = true` e `workspace_id = NULL`. Ex.: "Neon Pagamentos S.A." = `f56d3e17…`, código 735, visível em qualquer workspace pela política de leitura. Bancos criados pelo usuário são `is_system = false` e presos ao `workspace_id` de origem.
- Não existe trigger em `contas_bancarias` que preencha `banco_id` a partir do nome (só `updated_at` e unicidade de PIX).

Onde o vínculo se perde no fluxo de portabilidade:

1. **Exportação** (`buildExport.ts`): a query lê apenas `banco, agencia, conta, tipo_conta, titular, moeda, pix_key, pix_keys, observacoes`. O `banco_id` e o código bancário **não são exportados**. O envelope (`schema.ts` → `bankingSchema`) também não tem campo para eles — só o nome.
2. **Importação** (`applyImport.ts`): o insert em `contas_bancarias` grava `banco` (nome) e **nunca grava `banco_id`**. Não há nenhuma tentativa de reconciliar o banco no workspace de destino, nem por nome, nem por código.
3. **Edição** (`ParceiroDialog.tsx`): a conta é carregada com `banco_id: ""` (nulo), o seletor de banco fica vazio e a validação de salvamento (`if (!account.banco_id)`) dispara **"Campo obrigatório no Banco — Por favor, selecione o banco para todas as contas adicionadas."** Esse é exatamente o erro relatado.
4. **Por que "aparece certo" na tela**: as listagens e o perfil do parceiro mostram a coluna de texto `banco`, que veio preenchida na importação. Só a aba Bancário do diálogo depende de `banco_id` (`bancos.find(b => b.id === account.banco_id)`), e nela o rótulo cai para "Banco não selecionado".

Estado atual dos dados (importante, para não corrigir o que não está quebrado): hoje as 59 contas bancárias existentes estão íntegras — nenhuma com `banco_id` nulo, nenhuma com FK órfã e nenhuma apontando para banco de outro workspace. A conta da LOLISA no workspace de destino já tem `banco_id` correto. Ou seja, o defeito está no caminho de importação e reaparece a cada nova importação de contas; não há hoje um lastro de registros quebrados a reparar. Se aparecer algum registro nesse estado, ele será tratado pela reconciliação descrita abaixo.

## Correção proposta

**1. Exportar identidade estável do banco (não o ID cru)**
Adicionar ao envelope, por conta: `banco_codigo` (código FEBRABAN, vindo de `bancos.codigo`) e `banco_is_system`. O ID do workspace de origem só será usado quando o banco for de sistema (aí ele é global e válido em qualquer workspace). Campos opcionais → pacotes antigos continuam válidos.

**2. Reconciliar o banco na importação (`applyImport.ts`)**
Antes de inserir a conta, resolver o `banco_id` no workspace de destino nesta ordem:
1. banco de sistema pelo código exportado;
2. banco de sistema pelo nome normalizado;
3. banco do próprio workspace de destino (não sistema) por código/nome;
4. sem correspondência → criar banco do workspace (`is_system = false`, `workspace_id` do destino, `user_id` do importador) com nome/código do pacote.
Só então inserir a conta com `banco_id` **e** `banco` preenchidos e coerentes. Se a criação do banco falhar, a conta é importada mesmo assim (nome preservado) e o relatório de importação registra a linha como "banco não reconciliado", em vez de falhar em silêncio.

**3. Tornar a edição resiliente (`ParceiroDialog.tsx`)**
Ao carregar contas sem `banco_id`, tentar resolver pelo nome (`banco`) contra a lista de bancos já carregada e preencher o seletor. Se não resolver, manter a exigência de escolher o banco, mas com mensagem que aponta a conta específica. Isso cobre também qualquer registro legado importado antes da correção — ao salvar, o `banco_id` é gravado e o registro se autocura.

**4. Compatibilidade retroativa**
Pacotes `.labbet` já gerados (sem código do banco) continuam importáveis: a reconciliação por nome normalizado resolve o caso comum (bancos de sistema), e o passo 4 cobre bancos personalizados.

## O que não muda

Nenhum dado financeiro, saldo, lançamento ou aposta. Nada de backfill em massa. A deduplicação de contas na importação (banco+agência+conta+moeda) e a regra de PIX único por workspace permanecem como estão.

## Validação

- Exportar a LOLISA de um workspace com conta Neon e importar em workspace limpo: conferir no banco que a conta nasce com `banco_id` do banco de sistema e `banco` coerente.
- Abrir Editar Parceiro → aba Bancário: o banco aparece selecionado no seletor e "Salvar Alterações" conclui sem o erro de campo obrigatório.
- Repetir com um banco personalizado (não sistema) do workspace de origem: deve ser criado no destino e vinculado.
- Reimportar o mesmo pacote: nenhuma conta duplicada, nenhum banco duplicado.
- Importar um pacote antigo (sem código do banco): reconciliação por nome funciona.
- Conta legada com `banco_id` nulo (simulada em ambiente de teste): abre com o banco resolvido pelo nome e salva normalmente.
- Comparar parceiro criado manualmente × parceiro importado: mesma estrutura de registro em `contas_bancarias`.

## Detalhes técnicos

Arquivos tocados: `src/lib/partnerPortability/schema.ts` (campos opcionais `banco_codigo`, `banco_is_system`), `src/lib/partnerPortability/buildExport.ts` (join com `bancos`), `src/lib/partnerPortability/applyImport.ts` (resolver `banco_id` + criação condicional em `bancos`), `src/components/parceiros/ParceiroDialog.tsx` (resolução por nome ao carregar). Testes novos em `src/lib/partnerPortability/__tests__/` para a função de reconciliação (código → nome → workspace → criação).
