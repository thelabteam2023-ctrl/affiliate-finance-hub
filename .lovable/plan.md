## Benchmarking: edição de Aposta Simples → padrão para Surebet

### 1. Fluxo atual — Aposta Simples (REFERÊNCIA)

**Frontend (`ApostaDialog.tsx`, `handleSave`)**

O dialog escolhe o caminho de persistência baseado em uma matriz de mudanças:

```text
┌─────────────────────────────────────────────────────────────────────┐
│ estado anterior │ mudança detectada      │ caminho usado            │
├─────────────────────────────────────────────────────────────────────┤
│ PENDENTE        │ qualquer (stake/odd/.) │ UPDATE direto + sync_    │
│                 │                        │ pending_aposta_stake_v1  │
│ PENDENTE        │ → resultado final      │ liquidar_aposta_v4       │
│ LIQUIDADA       │ → PENDENTE             │ reverter_liquidacao_v4   │
│ LIQUIDADA       │ só resultado mudou     │ reliquidar_aposta_v6     │
│ LIQUIDADA       │ stake/odd/bookmaker    │ atualizar_aposta_        │
│                 │   + resultado          │   liquidada_atomica_v2   │
│ LIQUIDADA       │ só campos descritivos  │ UPDATE direto (preserva  │
│                 │                        │   status/resultado)      │
└─────────────────────────────────────────────────────────────────────┘
```

**Backend / triggers ativos em `apostas_unificada`**
- `tr_aposta_auto_stake_ledger` — INSERT-only: cria evento `STAKE` no `financial_events` ao criar aposta (idempotente por `auto_stake_<id>`).
- `tr_normalize_apostas_unificada_stake_split` — deriva `stake_real`/`stake_freebet` de `stake_total` + `fonte_saldo`.
- `trg_recalc_aposta_consolidado` — recalcula `stake_consolidado`, `pl_consolidado`.
- `tg_apostas_unificada_consistencia_status` — guarda consistência `status`/`resultado`.
- `tg_sync_aposta_simples_resultado_financeiro` — sincroniza ledger ao mudar `resultado` de simples (defesa em profundidade).

**Pontos-chave**
- O dialog **pode fazer UPDATE direto em `apostas_unificada`** porque os triggers são tolerantes (não bloqueiam UPDATE de `stake`/`odd`).
- A integridade financeira é garantida por **RPCs separadas por intenção** (liquidar / reverter / reliquidar / atualizar-liquidada).
- `sync_pending_aposta_stake_v1` resolve o caso pendente: ajusta o evento STAKE existente para refletir a nova stake.
- Recálculo é feito por trigger (`trg_recalc_aposta_consolidado`) → frontend só faz `invalidateCanonicalCaches`.

### 2. Fluxo atual — Surebet (PROBLEMA)

**Frontend (`SurebetDialog.tsx`, ~L2117–2310)**

Existem **dois caminhos paralelos** para "salvar":
- `useSurebetService.atualizarSurebet` — só atualiza campos descritivos + UPDATE direto perna-a-perna em `apostas_pernas` (sem ajustar ledger).
- `editar_surebet_completa_v2` — RPC chamada apenas no fluxo do `SurebetDialog` para edição completa.

**RPC `editar_surebet_completa_v2`**
- Sincroniza `apostas_pernas` (insert/update/delete por id).
- Sincroniza `apostas_perna_entradas`:
  - Em entradas **novas**: cria `STAKE`/`FREEBET_STAKE` no ledger.
  - Em entradas **órfãs**: estorna via `REVERSAL`.
  - Em entradas **atualizadas**: **só faz UPDATE — NÃO ajusta o ledger** se a stake mudou.
- Chama `recalcular_perna_por_entradas` → recálculo do pai por `fn_recalc_pai_surebet`.
- Sobrescreve `status` e `resultado` mesmo que `p_status`/`p_resultado` venham `null` — derruba liquidações existentes.

**Bloqueios e fontes do erro de integridade**
1. `tg_guard_surebet_pernas_forma_registro` — só permite pernas se `forma_registro = 'ARBITRAGEM'` (correto, mas confunde quando a perna é recriada).
2. `editar_surebet_completa_v2` **muda stake de uma entrada existente sem gerar evento de ajuste** → ledger fica dessincronizado do `saldo_atual` (hoje quebra a paridade Visão Geral × Caixa).
3. `editar_surebet_completa_v2` sobrescreve `status='null'` / `resultado='null'` → quebra reliquidação parcial (perna liquidada vira pendente sem reverter ledger).
4. Recálculo do pai depende exclusivamente da RPC: se o frontend usar `useSurebetService.atualizarSurebet` para uma edição "leve", as pernas são alteradas via UPDATE direto sem chamar `fn_recalc_pai_surebet` → `pl_consolidado` fica desatualizado.
5. Não existe equivalente a `sync_pending_aposta_stake_v1` para entradas de surebet → impossível ajustar stake de perna pendente sem deletar+recriar.
6. Não existe equivalente a `reliquidar_aposta_v6` por perna → mudança de resultado de uma perna isolada não é simétrica ao fluxo de simples.

### 3. Comparativo direto

```text
                        SIMPLES                    SUREBET
──────────────────────────────────────────────────────────────────────────
Edição input stake      UPDATE direto +            RPC monolítica que
                        sync_pending_aposta_       não emite ajuste de
                        stake_v1                   ledger em UPDATE
Recálculo derivado      Trigger                    Só dentro da RPC
                        trg_recalc_aposta_         (perna-a-perna +
                        consolidado                fn_recalc_pai_surebet)
Persistência            Path-by-intent             RPC monolítica única
                        (5 caminhos limpos)        que sobrescreve tudo
Ledger ajuste stake     sync_pending_aposta_       NÃO EXISTE (gera
                        stake_v1                   stake_real ≠ ledger)
Reliquidação resultado  reliquidar_aposta_v6       NÃO EXISTE por perna
Mudança em liquidada    atualizar_aposta_          NÃO EXISTE (tem que
                        liquidada_atomica_v2       excluir e recriar)
Trigger guard           Permissivo em UPDATE       Permissivo, mas RPC
                        de stake/odd               sobrescreve status
UX                      Salva e recalcula          Bloqueia, exige
                        sem fricção                workaround manual
```

### 4. Proposta de padronização (mesmo modelo INPUTS → RECÁLCULO → PROJEÇÃO → UI)

**Arquitetura alvo** — uma RPC por intenção, simétrica à de simples:

```text
SIMPLES                                SUREBET (novo)
────────────────────────────────────────────────────────────────
sync_pending_aposta_stake_v1     →     sync_pending_surebet_entrada_v1
liquidar_aposta_v4               →     liquidar_perna_surebet_v1 (já existe)
reverter_liquidacao_v4           →     reverter_perna_surebet_v1
reliquidar_aposta_v6             →     reliquidar_perna_surebet_v1
atualizar_aposta_liquidada_      →     editar_surebet_completa_v3
   atomica_v2                          (refatorado, ver abaixo)
```

**4.1. Banco — alterações**

1. **Refatorar `editar_surebet_completa_v2` → `_v3`** (DROP + CREATE):
   - Diff de stake/odd/fonte por entrada existente:
     - Se mudou stake: emitir `STAKE_ADJUSTMENT` (delta) com `idempotency_key = 'edit_adj_<entrada_id>_<created_at>'`.
     - Se mudou bookmaker e perna está liquidada: erro estruturado pedindo deleção (mantém invariante).
   - **Não sobrescrever `status`/`resultado`/`lucro_prejuizo` quando os parâmetros vierem `NULL`** — trocar `SET status = p_status` por `SET status = COALESCE(p_status, status)`.
   - Após sincronizar entradas: chamar `fn_recalc_pai_surebet(p_aposta_id)` e gravar campos derivados retornados.
   - Retornar JSONB com `events_created`, `pernas_recalculated`.
2. **Nova função `sync_pending_surebet_entrada_v1(p_entrada_id)`** — espelho de `sync_pending_aposta_stake_v1`, ajusta o evento `STAKE` da entrada para a nova stake (delta + idempotência).
3. **Trigger `tr_normalize_apostas_perna_entradas_stake_split`** — espelho do trigger de simples, deriva `stake_real`/`stake_freebet` em INSERT/UPDATE.
4. **Trigger `trg_recalc_pai_surebet_on_entrada_change`** — em INSERT/UPDATE/DELETE de `apostas_perna_entradas`, chamar `fn_recalc_pai_surebet` (com guard `app.surebet_recalc_context` para evitar recursão da própria RPC).
5. **Manter `fn_guard_surebet_pernas_forma_registro`** — não tem efeito em fluxo normal de edição.

**4.2. Frontend — alterações**

1. **`useSurebetService.atualizarSurebet`** passa a delegar TUDO para `editar_surebet_completa_v3`. Remover o fluxo "UPDATE direto perna-a-perna" (que hoje quebra paridade financeira).
2. **`SurebetDialog.executeSaveLogic` e `SurebetModalRoot`**:
   - Aplicar a mesma matriz de decisão da aposta simples (PENDENTE / LIQUIDADA / só descritivo / etc.) escolhendo entre `editar_surebet_completa_v3`, `reliquidar_perna_surebet_v1`, `reverter_perna_surebet_v1`.
   - Remover `console.warn` "edição de bookmaker em perna liquidada" — passa a ser erro estruturado vindo da RPC.
3. **Invalidação**: usar `invalidateCanonicalCaches(queryClient, projetoId)` (já existente) em todos os caminhos.

**4.3. Garantias mantidas**

- Idempotência: todo evento usa `idempotency_key` determinístico (`edit_adj_<entrada_id>_<...>`).
- Sem UPDATE direto em campos derivados (`saldo_atual`, `pl_consolidado`, `stake_consolidado`, `lucro_prejuizo`).
- Sem deleção de eventos do ledger — só inserção de eventos compensatórios (mantém política anti-retrofix).
- Workspace isolation preservada (RPC SECURITY DEFINER já filtra por `v_workspace_id` da aposta).

### 5. Plano de testes

| Cenário | Esperado |
|---|---|
| Surebet PENDENTE: alterar stake de uma perna | Saldo da bookmaker reflete delta; pl_consolidado recalcula; UI atualiza sem refresh |
| Surebet PENDENTE: alterar odd | Recálculo do `lucro_esperado`; sem evento financeiro novo |
| Surebet PENDENTE: alterar bookmaker de uma perna | Reversão STAKE no antigo + novo STAKE no novo; saldos consistentes |
| Surebet com 1 perna LIQUIDADA: editar evento/mercado | Status/resultado preservados; sem evento novo |
| Surebet com 1 perna LIQUIDADA: trocar stake/odd da liquidada | Erro estruturado pedindo reliquidação explícita |
| Surebet LIQUIDADA total: alterar resultado de uma perna | `reliquidar_perna_surebet_v1` reverte só o PAYOUT da perna e re-aplica |
| Edição com 2 moedas | `fn_recalc_pai_surebet` mantém pl_consolidado em moeda do projeto |

### 6. Critérios de aceite

- Editar Surebet tem o mesmo "feel" de editar simples: abrir → alterar → salvar → UI atualiza.
- Visão Geral, Caixa Operacional e SaldoAtual da bookmaker permanecem em paridade após qualquer edição (Floor zero + Cotação de Trabalho).
- Nenhum caminho de edição faz UPDATE direto em `saldo_atual`, `pl_consolidado` ou eventos do ledger.
- Snapshot de cotação por entrada continua sendo respeitado (`getSnapshotFields`).
- Hook `useSurebetService` deixa de tocar `apostas_pernas`/`apostas_perna_entradas` diretamente.

### 7. Restrições respeitadas

- **Anti-retrofix**: nenhum bulk update em `cash_ledger` / `financial_events`.
- **Sem remoção ingênua de proteção**: triggers são mantidos; o que muda é a RPC passar a respeitá-los corretamente.
- **Sem duplicação de eventos**: `idempotency_key` por entrada/edição garante unicidade.
- **Memórias do projeto** preservadas: snapshot por operação, Cotação de Trabalho, Surebet P&L sempre via RPC, paridade Floor zero.
