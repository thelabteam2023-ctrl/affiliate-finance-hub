

## Reset Total — Voltar ao Estado "Acabei de Depositar nas Casas"

### O que você quer (entendido literalmente)

Apagar TUDO do Projeto 00 (LABBET ONE) e voltar ao estado anterior à vinculação. Manter apenas:
- **Saldos bancários** no Caixa Operacional (contas + depósitos para as contas).
- **Saldos das bookmakers** (`saldo_atual`) — o capital que está nas casas hoje.

Apagar:
- Todas apostas, surebets, bônus, cashback, giros grátis.
- **Todas as freebets** (recebidas e estoque).
- **Todos os eventos do ledger** ligados ao Projeto 00 (depósitos virtuais, baselines, ajustes, conciliações, FX, bônus creditados, estornos).
- **Todas as freebets do ledger** (eventos de tipo FREEBET).
- Vínculo bookmaker ↔ projeto (`projeto_id = NULL`).
- Marco zero / snapshots de cotação do projeto.

Você disse: *"é uma simulação, não estou preocupado em quebrar regras"* — então faremos **hard delete cirúrgico** ignorando policies de imutabilidade do ledger (anti-retrofix, balance-sync-trigger-exclusive). Será irreversível.

### Estado final esperado

```text
PROJETO 00 (LABBET ONE)
├─ Apostas/Surebets/Bônus/Cashback/Giros: 0
├─ Freebets recebidas/estoque: 0
├─ Vínculo com bookmakers: nenhum (projeto_id = NULL)
├─ Eventos no ledger: 0 (com projeto_id_snapshot = Projeto 00)
└─ Marco zero: limpo

BOOKMAKERS (5 casas)
├─ saldo_atual: PRESERVADO (ALAWIN MXN 3.456, AMUNRA USD 100, etc.)
├─ saldo_freebet: ZERADO em todas (você quer apagar freebets)
├─ projeto_id: NULL (desvinculadas — necessário para você re-vincular limpo)
└─ Cadastro da casa: PRESERVADO

CAIXA OPERACIONAL
├─ Contas bancárias: PRESERVADAS
├─ Aportes/depósitos para contas: PRESERVADOS
└─ Saldos bancários: INTACTOS
```

### Plano de execução

#### Etapa 1 — Auditoria pré-reset (read-only, para você confirmar o escopo)

Rodar SQL que lista exatamente o que será apagado:
- Quantas apostas, surebets (pais + pernas), bônus, cashback, giros, freebets recebidas, freebets estoque.
- Quantos eventos no `cash_ledger` com `projeto_id_snapshot = Projeto 00` (separados por `tipo_transacao` e `balance_type`).
- Quantos eventos em `financial_events` derivados desses ledger entries.
- Snapshot atual de `bookmakers.saldo_atual` e `saldo_freebet` das 5 casas (para você comparar antes/depois).

Você aprova o relatório antes de prosseguir.

#### Etapa 2 — Migration de hard delete cirúrgico

Uma única migration SQL atômica (transação única) que executa, na ordem:

```sql
BEGIN;

-- 1. Apagar pernas de surebet do projeto
DELETE FROM surebet_pernas WHERE surebet_id IN (
  SELECT id FROM surebets WHERE projeto_id = '80d16390...'
);

-- 2. Apagar surebets pais
DELETE FROM surebets WHERE projeto_id = '80d16390...';

-- 3. Apagar apostas (simples, múltiplas, valuebet, bonus, duplogreen, punter)
DELETE FROM apostas WHERE projeto_id = '80d16390...';

-- 4. Apagar bônus, cashback, giros
DELETE FROM bonus WHERE projeto_id = '80d16390...';
DELETE FROM cashback_manual WHERE projeto_id = '80d16390...';
DELETE FROM giros_gratis WHERE projeto_id = '80d16390...';

-- 5. Apagar freebets (recebidas e estoque) ligadas ao projeto OU às casas vinculadas
DELETE FROM freebets_recebidas WHERE projeto_id = '80d16390...';
DELETE FROM freebets_estoque WHERE bookmaker_id IN (
  SELECT id FROM bookmakers WHERE projeto_id = '80d16390...'
);

-- 6. Apagar financial_events derivados (ANTES do ledger por causa de FK)
DELETE FROM financial_events WHERE projeto_id_snapshot = '80d16390...';
DELETE FROM financial_events WHERE balance_type = 'FREEBET' 
  AND bookmaker_id IN (SELECT id FROM bookmakers WHERE projeto_id = '80d16390...');

-- 7. Apagar TODOS eventos do cash_ledger do projeto + freebets das casas
DELETE FROM cash_ledger WHERE projeto_id_snapshot = '80d16390...';
DELETE FROM cash_ledger WHERE balance_type = 'FREEBET'
  AND (origem_bookmaker_id IN (SELECT id FROM bookmakers WHERE projeto_id = '80d16390...')
    OR destino_bookmaker_id IN (SELECT id FROM bookmakers WHERE projeto_id = '80d16390...'));

-- 8. Apagar reservas de saldo, audit trails e snapshots do projeto
DELETE FROM bookmaker_balance_reservations WHERE projeto_id = '80d16390...';
DELETE FROM bookmaker_balance_audit WHERE bookmaker_id IN (
  SELECT id FROM bookmakers WHERE projeto_id = '80d16390...'
);

-- 9. Zerar saldo_freebet (mantém saldo_atual REAL intacto) e desvincular casas
UPDATE bookmakers
   SET saldo_freebet = 0,
       projeto_id = NULL
 WHERE projeto_id = '80d16390...';

-- 10. Limpar marco_zero e snapshots do próprio projeto
UPDATE projetos
   SET marco_zero_at = NULL
 WHERE id = '80d16390...';

COMMIT;
```

**Notas sobre a migration:**
- `saldo_atual` das casas é **mantido** (você quer preservar o capital depositado).
- `saldo_freebet` é **zerado** (você quer apagar freebets).
- Triggers de sync de saldo serão temporariamente irrelevantes pois deletamos os events ANTES de mexer em saldos (não há nada para "ressincronizar contra").
- Caixa Operacional (`contas_bancarias`, eventos sem `projeto_id_snapshot`) **não é tocado**.
- DELETE em `cash_ledger` ignora policies anti-retrofix conforme sua autorização explícita ("é simulação").

#### Etapa 3 — Validação pós-reset

SQL de conferência:

```sql
-- Esperado: tudo zero
SELECT 
  (SELECT COUNT(*) FROM apostas WHERE projeto_id = '80d16390...') AS apostas,
  (SELECT COUNT(*) FROM surebets WHERE projeto_id = '80d16390...') AS surebets,
  (SELECT COUNT(*) FROM bonus WHERE projeto_id = '80d16390...') AS bonus,
  (SELECT COUNT(*) FROM cashback_manual WHERE projeto_id = '80d16390...') AS cashback,
  (SELECT COUNT(*) FROM giros_gratis WHERE projeto_id = '80d16390...') AS giros,
  (SELECT COUNT(*) FROM freebets_recebidas WHERE projeto_id = '80d16390...') AS freebets,
  (SELECT COUNT(*) FROM cash_ledger WHERE projeto_id_snapshot = '80d16390...') AS ledger_events,
  (SELECT COUNT(*) FROM bookmakers WHERE projeto_id = '80d16390...') AS casas_vinculadas;

-- Esperado: 5 casas com saldo_atual preservado, saldo_freebet=0, projeto_id=NULL
SELECT nome, moeda, saldo_atual, saldo_freebet, projeto_id 
  FROM bookmakers 
 WHERE id IN (SELECT id FROM bookmakers ...as 5 originais);
```

#### Etapa 4 — Invalidação de caches no frontend

Após a migration, limpar todos os caches do React Query relevantes via uma chamada no console (ou recarregar a página). Lista de keys a invalidar (mesma do `useResetOperacional`): `projeto-resultado`, `projeto-breakdowns`, `projeto-painel-contas`, `bookmaker-saldos`, `bookmaker-saldos-financeiro`, `parceiro-financeiro`, `parceiro-consolidado`, `apostas`, `cashback-manual`, `giros-gratis`, `bonus`, `calendar-apostas-rpc`, `freebet-estoque`.

### Avisos importantes

1. **Irreversível.** Após a migration, não há rollback. O ledger não terá mais histórico do Projeto 00.
2. **Quebra de policies aceita por você.** Estamos ignorando `incidente-contaminacao-financeira-0904`, `safe-balance-reset-policy`, `balance-sync-trigger-exclusive-standard` por ser simulação.
3. **Caixa Operacional intocado.** Contas bancárias e seus depósitos permanecem 100% como estão.
4. **Cadastro das 5 bookmakers preservado.** Apenas o vínculo com o projeto é removido e o saldo_freebet zerado.
5. **Re-vinculação posterior.** Quando você re-vincular as casas ao Projeto 00, o trigger `fn_ensure_deposito_virtual_on_link` vai gerar novo `DEPOSITO_VIRTUAL BASELINE` automaticamente com o `saldo_atual` atual de cada casa — comportamento correto e esperado, e a fórmula canônica do Extrato (já aplicada) vai excluir esses BASELINEs do KPI de Depósitos.

### Arquivos envolvidos

- **Migration nova** (hard delete atômico, descrita na Etapa 2).
- **Sem alterações de código frontend** — toda a UI já reflete o estado do banco automaticamente após invalidar caches.
- **Memory** atualizada: nota em `.lovable/memory/governance/` registrando que esta operação foi autorizada como exceção pontual de simulação para o Projeto 00, sem precedente para outras operações em produção.

