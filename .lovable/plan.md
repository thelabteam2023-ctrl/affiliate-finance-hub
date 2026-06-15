## Objetivo

Garantir que CPF, endereço de wallet cripto e chave PIX/conta bancária sejam **únicos apenas dentro do mesmo workspace** — nunca globalmente nem por `user_id`. Cada workspace é um ambiente operacional independente.

## Diagnóstico

Auditei as restrições de unicidade nas três tabelas envolvidas:

**Banco de dados (já correto, workspace-scoped):**
- `parceiros_cpf_workspace_unique` → UNIQUE (cpf, workspace_id) ✔
- Trigger `validate_wallet_endereco_unique` em `wallets_crypto` → escopo `workspace_id` via JOIN com `parceiros` ✔
- Trigger `validate_pix_key_unique` em `contas_bancarias` → escopo `workspace_id` via JOIN com `parceiros` ✔
- Nenhum índice UNIQUE global em `wallets_crypto.endereco` ou `contas_bancarias.pix_key`.

**Frontend (incorreto — escopo por `user_id`, não por `workspace_id`):**
Em `src/components/parceiros/ParceiroDialog.tsx`:
- Linha 391: checagem de CPF duplicado filtra por `user_id` (bloqueia entre workspaces do mesmo dono).
- Linha 449: checagem de telefone duplicado, idem.
- Linha 1024: checagem de endereço de wallet usa `parceiros.user_id` (bloqueia mesmo dono em outro workspace).

Resultado: o owner do workspace é bloqueado ao recadastrar um CPF/telefone/wallet que ele já possui em outro workspace seu, mesmo o DB permitindo. O erro do screenshot vem dessa validação client-side (ou da trigger em outro caso, que permanece correta — bloqueia só dentro do mesmo workspace).

## Mudanças

### 1. `src/components/parceiros/ParceiroDialog.tsx`
Substituir os 3 filtros `.eq("user_id", user.id)` (e `parceiros.user_id`) pelo `workspaceId` ativo (já disponível no componente via `useTabWorkspace`/contexto — confirmar e importar se necessário):

- **CPF (linha 388-392):** `.eq("workspace_id", workspaceId).eq("cpf", cleanCpf)`
- **Telefone (linha 446-450):** `.eq("workspace_id", workspaceId).eq("telefone", cleanTelefone)`
- **Wallet endereço (linha 1020-1024):** trocar o `parceiros!inner(user_id)` por `parceiros!inner(workspace_id)` com `.eq("parceiros.workspace_id", workspaceId)`.

Cada bloco também passa a abortar (com mensagem clara) se `workspaceId` estiver indisponível, em vez de cair em validação global silenciosa.

### 2. Triggers de banco — manter como estão
Já estão corretamente escopados ao workspace. Nenhuma migration necessária.

### 3. Auditoria complementar (read-only, sem código)
Conferir que não existem outros pontos no app fazendo `.eq("user_id", ...)` em `parceiros`, `wallets_crypto` ou `contas_bancarias` para validação de duplicata. A varredura inicial mostrou apenas os 3 casos acima como bloqueadores; demais ocorrências (linhas 668, 1085 e `BancoSelect.tsx:79`) são apenas para preenchimento de `user_id` em inserts e permanecem.

### 4. Sem alteração de regra dentro do mesmo workspace
A unicidade **dentro do workspace** (mesmo CPF/wallet/PIX em parceiros diferentes do mesmo workspace) continua bloqueada pelos triggers — esse é o comportamento desejado. O ajuste é exclusivamente para liberar o **mesmo registro em workspaces diferentes**.

## Resultado esperado
- Mesma pessoa (CPF), mesma wallet e mesma chave PIX podem ser cadastradas independentemente em cada workspace.
- Isolamento operacional preservado: saldos, ledger, auditoria continuam por `workspace_id`.
- Erro "Este endereço de wallet já está cadastrado para outro parceiro" passa a aparecer apenas quando o conflito é real dentro do mesmo workspace.
