# Memory: finance/freebet-availability-lifo-physical-balance
Updated: 2026-04-16

## Padrão: View v_freebets_disponibilidade — LIFO + Saldo Físico

### Decisão Arquitetural
A view `v_freebets_disponibilidade` distribui o `bookmakers.saldo_freebet` (saldo físico, fonte da verdade) entre as freebets ativas usando **LIFO** (Last In, First Out — mais recentes primeiro).

### Por que LIFO e não FIFO
Freebets antigas tendem a já ter sido consumidas em apostas históricas. O `saldo_freebet` físico atual reflete os **últimos créditos**, então deve ser atribuído às freebets mais recentes para evitar marcar incorretamente como "Liberada" uma freebet antiga já gasta.

### Por que NÃO derivar do ledger
Tentativas anteriores de calcular consumo via SUM(STAKE + REVERSAL) no ledger falharam porque:
- REVERSALs históricos têm sinais variados (alguns invertidos por bugs antigos)
- Stakes de apostas LIQUIDADAS GREEN com freebet (SNR) não devem ser revertidas, mas a soma bruta as conta como consumo perpétuo
- Acumula erros de motores antigos

### Regra
1. `saldo_freebet` físico do bookmaker = **teto absoluto** da soma de `valor_restante`
2. LIFO: freebets ordenadas por `data_recebida DESC` absorvem o saldo
3. Freebets canceladas (FREEBET_EXPIRE detectado) → status `CANCELADA`, restante 0
4. Após distribuição, freebets com restante=0 e status CANCELADA podem ser marcadas `utilizada=true` para limpeza da UI

### Validação
21 de 21 bookmakers do workspace ficaram consistentes (`saldo_freebet ≈ SUM(valor_restante)`).
