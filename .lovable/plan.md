

## O que vou implementar

Um sistema de **Reverter / Excluir** movimentações direto no Histórico do Caixa Operacional, com regras de segurança baseadas em janela de tempo e tipo de transação.

---

## 1. UI — Histórico de Movimentações

No menu **⋮** que já existe em cada linha (`HistoricoMovimentacoes.tsx`, linha ~860), adicionar 2 novos itens com separador:

```
┌─────────────────────────────┐
│ ✏  Editar data solicitação  │  (já existe)
│ ✏  Editar recebimento       │  (já existe)
├─────────────────────────────┤
│ ↩  Reverter (estorno)       │  ← NOVO
│ 🗑  Excluir movimentação    │  ← NOVO (vermelho)
└─────────────────────────────┘
```

Cada item abre um **AlertDialog** de confirmação mostrando: tipo, valor, origem → destino, e o que vai acontecer.
Itens ficam **desabilitados** com tooltip explicativo quando a transação não é elegível (ex: "Janela de 24h expirada", "Transação reconciliada", "Aporte de investidor — use Estorno em Investidores").

O menu ⋮ passa a aparecer em **todas** as linhas (hoje só aparece em SAQUE confirmado).

---

## 2. Regras de Elegibilidade

| Ação | Janela | Bloqueios |
|---|---|---|
| **Reverter** (cria espelho inverso) | 24h desde `created_at` | `reconciled_at` preenchido · tipos de investidor (APORTE, LIQUIDACAO) · SWAP_IN/OUT (deve reverter o par) |
| **Excluir** (hard delete) | 30 min desde `created_at` | qualquer um dos acima · `financial_events_generated = true` |

Permissão: **owner** ou **admin** do workspace (via `useRole`).

---

## 3. Backend — 2 RPCs novas (migration)

**`reverter_movimentacao_caixa(p_transacao_id uuid, p_motivo text)`**
- Valida janela 24h, role, não reconciliado, tipo elegível
- Insere uma transação espelho com `tipo_transacao` original, valores invertidos (origem↔destino), `referencia_transacao_id` apontando para a original, `descricao = 'ESTORNO: ' + motivo`, `auditoria_metadata.reverted_by`
- Para SWAP: detecta o par via `referencia_transacao_id` e reverte ambos atomicamente
- Não toca em `saldo_atual` (views recalculam)

**`excluir_movimentacao_caixa(p_transacao_id uuid, p_motivo text)`**
- Valida janela 30min, role, sem `financial_events_generated`, sem `reconciled_at`
- Grava registro em `audit_logs` (snapshot completo da row + motivo + user)
- DELETE FROM cash_ledger WHERE id = ...
- Para SWAP: deleta o par junto

Ambas retornam `{ success, message, mirror_id? }`.

---

## 4. Frontend — Hook + Diálogos

**`useReverterMovimentacao.ts`** (novo): chama as RPCs, invalida caches (`invalidateCanonicalCaches` + `caixa-operacional`, `cash_ledger`, `parceiro-saldos`), mostra toast.

**`ReverterMovimentacaoDialog.tsx`** (novo): AlertDialog com input de motivo (obrigatório, mín 5 chars) + preview "será criado um lançamento espelho".

**`ExcluirMovimentacaoDialog.tsx`** (novo): AlertDialog destrutivo com input de motivo + aviso "ação irreversível, será registrada no log de auditoria".

**Helpers** (`src/lib/movimentacaoEligibility.ts`): funções puras `canRevert(tx, role)` e `canDelete(tx, role)` retornando `{ allowed: boolean, reason?: string }` — reutilizadas no menu (estado disabled + tooltip) e nas RPCs (validação dupla client+server).

---

## 5. Riscos cobertos

| Risco | Mitigação |
|---|---|
| Apagar transação já reconciliada | Bloqueio por `reconciled_at` |
| Quebrar saldo de investidor | Bloqueio para APORTE/LIQUIDACAO (forçar fluxo dedicado) |
| Quebrar par de SWAP | Reversão/exclusão atômica do par via `referencia_transacao_id` |
| Reverter operação antiga já fechada contabilmente | Janela 24h |
| Perder histórico em exclusão | Snapshot em `audit_logs` antes do DELETE |
| Diferença cambial em reversão | Espelho usa `cotacao_snapshot_at` da original, não cotação live |
| Cascata em `financial_events` | Exclusão bloqueada quando `financial_events_generated=true`; reversão gera evento espelho |

---

## 6. Arquivos

**Novos:** `useReverterMovimentacao.ts`, `ReverterMovimentacaoDialog.tsx`, `ExcluirMovimentacaoDialog.tsx`, `src/lib/movimentacaoEligibility.ts`, 1 migration SQL com as 2 RPCs.
**Editados:** `src/components/caixa/HistoricoMovimentacoes.tsx` (adicionar itens no menu ⋮ existente).

**Fora do escopo desta fase:** "Editar destino" — fica para fase 2 (basta combinar Reverter + criar nova).

