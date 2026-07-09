# Investigação — Isolamento de Workspaces (Gestão de Parceiros)

## 1. Diagnóstico técnico

### 1.1 Como o isolamento é aplicado hoje

**Frontend (cache/estado):**
- `useTabWorkspace` mantém `workspaceId` isolado por aba (sessionStorage). Ao detectar mudança, executa `queryClient.clear()` (limpa TODAS as queries).
- `useUserWorkspaces.switchWorkspace` também chama `queryClient.clear()` + `refreshWorkspace()`.
- `useParceirosData` usa `queryKey: ["parceiros-data", workspaceId]` e filtra `.eq("workspace_id", workspaceId)` na query dos `parceiros`. Refetch automático quando a chave muda.

**Backend (RLS):**
- `parceiros`: coluna `workspace_id` presente, RLS por `get_current_workspace()`.
- `contas_bancarias` e `wallets_crypto`: **não têm coluna `workspace_id`**, mas as policies fazem `EXISTS (SELECT 1 FROM parceiros WHERE parceiros.id = <tabela>.parceiro_id AND parceiros.workspace_id = get_current_workspace())`. Isso significa que só é acessível se o `parceiro_id` pertencer ao workspace corrente.
- `get_current_workspace()` é resolvida via header `x-workspace-id`, que é injetado por `src/lib/workspaceRequestScope.ts` em TODO `fetch` para `/rest/v1` e `/functions/v1`, lendo o `workspaceId` do sessionStorage da aba.

**Modelo de dados relevante:**
- `parceiros.id` é UUID **único por workspace**. Um mesmo CPF cadastrado em dois workspaces = dois `parceiros.id` distintos.
- Logo, `contas_bancarias.parceiro_id` e `wallets_crypto.parceiro_id` são naturalmente escopados a um único workspace via FK.

### 1.2 Resposta às hipóteses do usuário

| Hipótese | Veredito |
|---|---|
| Frontend usa só `partner_id`, ignorando `workspace_id` | **Verdadeiro no código do dialog** (`ParceiroDialog.tsx` linhas 298-301, 322-325, 710, 797, 1178). Mas **não gera vazamento** porque `parceiro_id` é único por workspace (rows separadas). |
| RLS mistura workspaces | **Falso.** RLS em `contas_bancarias`/`wallets_crypto` já valida `parceiros.workspace_id = get_current_workspace()`. |
| Query key sem workspace | **Correto em `useParceirosData`** (inclui `workspaceId`). O carregamento em `ParceiroDialog` (saldos) usa `useEffect` com `parceiroId`, sem React Query — mas os `parceiro_id`s são distintos entre workspaces, então não há colisão. |
| Cache não invalidado ao trocar workspace | **Está invalidado**: dois pontos (`useTabWorkspace` effect e `switchWorkspace`) chamam `queryClient.clear()`. |
| Componente montado reutiliza estado antigo | **Risco real e único cenário plausível de "vazamento visual"**. Ver 1.3. |

### 1.3 Causa raiz plausível do sintoma reportado

**Não é vazamento de dados do backend.** RLS + `x-workspace-id` header garantem que a API só devolve dados do workspace ativo. O que pode acontecer:

1. **Estado do dialog persiste após troca de workspace na mesma aba.** `ParceiroDialog` mantém `bankAccounts`, `cryptoWallets`, `parceiroId` em `useState`. Se o dialog estiver aberto e o usuário trocar de workspace pela sidebar, o `queryClient.clear()` roda mas o dialog não desmonta — ele continua exibindo o snapshot do parceiro carregado antes. O `useEffect([parceiro])` só re-hidrata quando `parceiro` muda.
2. **Prop `parceiro` reutilizada por referência.** A página lista faz filtro por nome; se o mesmo nome existe em dois workspaces, ao abrir "Visualizar" logo depois da troca, a lista pode ainda não ter completado o refetch e passar o objeto antigo por 1 render, antes do react-query devolver a nova lista.
3. **`v_saldo_parceiro_contas` / `v_wallet_crypto_balances`** são consultadas por `parceiro_id` puro. Não há vazamento (parceiro_id é único), mas se `parceiroId` do state estiver defasado durante uma troca de contexto, o saldo mostrado é do parceiro anterior — parece "vazamento", mas é estado stale.

## 2. Correções

### 2.1 Forçar unmount do dialog e das telas de parceiros ao trocar de workspace

Chave `key={workspaceId}` no `<Routes>` da rota `/parceiros` e no `<ParceiroDialog>` para garantir remontagem limpa e descarte de `useState` local.

### 2.2 Fechar dialog automaticamente ao mudar `workspaceId`

Em `ParceiroDialog.tsx`, adicionar `useEffect` que observa `workspaceId` do `useTabWorkspace` e chama `onOpenChange(false)` + `resetForm()` sempre que mudar. Isso elimina o cenário do dialog aberto com dados de outro workspace.

### 2.3 Blindar as consultas do dialog com filtro explícito

Nas queries `v_saldo_parceiro_contas` e `v_wallet_crypto_balances` (ParceiroDialog linhas 298-311, 320-340), adicionar `.eq("workspace_id", workspaceId)` (as views expõem essa coluna — confirmado em `useParceirosData`). Defesa em profundidade: se um `parceiro_id` obsoleto for consultado, ainda assim não devolve nada de outro workspace.

### 2.4 Garantir refetch antes de renderizar o dialog

No wrapper que abre o dialog (página Parceiros), só permitir abrir depois que `useParceirosData().loading === false` E `workspaceId` corresponder ao esperado.

### 2.5 Teste manual documentado

Cenário reproduzível:
1. Cadastrar mesmo CPF em Workspace A e B com dados bancários/wallets distintos.
2. Em uma aba, abrir Visualizar Parceiro no A, deixar aberto, trocar para B pela sidebar.
3. Após correção 2.2: dialog fecha automaticamente.
4. Reabrir o parceiro no B: dados devem ser os do B.

## 3. Escopo dos arquivos

- `src/components/parceiros/ParceiroDialog.tsx` — auto-close on workspace change; filtro workspace nas 2 views.
- `src/pages/Parceiros.tsx` (ou wrapper equivalente) — `key={workspaceId}` no dialog.
- Nenhuma mudança de RLS ou schema — a segurança do backend já está correta.

## 4. Critério de aceite

- Trocar workspace com dialog aberto fecha o dialog.
- Consulta às views devolve `[]` mesmo se `parceiroId` obsoleto for passado (verificável no Network).
- CPF idêntico em dois workspaces exibe conjuntos disjuntos de contas bancárias e wallets.
- Nenhuma requisição de `/rest/v1/contas_bancarias` ou `/rest/v1/wallets_crypto` retorna linhas cujo `parceiro_id` pertença a outro workspace (validável cruzando com `parceiros.workspace_id` no banco).
