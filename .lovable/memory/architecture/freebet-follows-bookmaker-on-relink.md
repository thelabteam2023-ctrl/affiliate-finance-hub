---
name: freebet-follows-bookmaker-on-relink
description: Freebets ativas viajam com a casa entre projetos via desanexação (projeto_id=NULL) na desvinculação e adoção automática na re-vinculação
type: architecture
---

# Freebets seguem a casa entre projetos

## Decisão arquitetural (2026-04-17)

Quando uma bookmaker é desvinculada de um projeto, suas freebets ativas (não utilizadas, status PENDENTE/LIBERADA/NAO_LIBERADA) **não são expiradas** — são desanexadas (`projeto_id = NULL`) preservando todo o histórico (data_recebida, motivo, validade, origem, qualificadora_id).

Quando a casa é re-vinculada a um novo projeto, as freebets órfãs são automaticamente adotadas pelo novo projeto via trigger `tr_adopt_orphan_freebets_on_link`.

## Por que migrar (não expirar nem duplicar)

1. **Saldo físico real**: `bookmakers.saldo_freebet` continua na conta da casa — forçar expiração destruiria valor real do operador.
2. **Auditoria preservada**: a row original mantém data, motivo, validade — duplicar com BASELINE quebraria o ledger LIFO consolidado (`v_freebets_disponibilidade`).
3. **Editabilidade pós-migração**: a freebet adotada é uma row normal de `freebets_recebidas` — pode ser excluída/expirada via fluxo padrão (ROTA 2 de `useFreebetEstoqueMutations.deleteMutation`), que gera `FREEBET_EXPIRADA` no ledger e debita `saldo_freebet`. Resolve o bug histórico onde freebets migradas ficavam "presas".

## Implementação

- **`desvincular_bookmaker_atomico`**: ao final da RPC, executa `UPDATE freebets_recebidas SET projeto_id = NULL` para freebets ativas da casa+projeto. Retorna `freebets_desanexadas` no JSON.
- **`fn_adopt_orphan_freebets_on_link` + `tr_adopt_orphan_freebets_on_link`**: trigger AFTER UPDATE OF projeto_id em bookmakers. Adota órfãs (projeto_id IS NULL) ativas na transição NULL→novo_projeto.
- Trigger separado de `tr_ensure_deposito_virtual_on_link` para isolar responsabilidades (saldo real vs saldo freebet).

## Critérios de "freebet ativa"

```sql
COALESCE(utilizada, false) = false
AND status IN ('PENDENTE', 'LIBERADA', 'NAO_LIBERADA')
```

Freebets já utilizadas, canceladas ou expiradas permanecem com o `projeto_id` original (preservando atribuição histórica de P&L).
