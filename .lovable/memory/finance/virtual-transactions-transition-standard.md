# Memory: finance/virtual-transactions-transition-standard
Updated: 2026-04-02

## Transações Virtuais (SAQUE_VIRTUAL / DEPOSITO_VIRTUAL)

O sistema utiliza os tipos 'SAQUE_VIRTUAL' e 'DEPOSITO_VIRTUAL' no ledger contábil para gerir a entrada e saída de capital durante o vínculo ou desvínculo de instâncias de bookmaker em projetos.

### Regra Fundamental (v2 — 2026-04-02)

**SAQUE_VIRTUAL e DEPOSITO_VIRTUAL NÃO geram financial_events e NÃO afetam saldo_atual.**

São entradas puramente contábeis para rastrear P&L de projeto. O dinheiro continua fisicamente na bookmaker — o saldo real não muda quando se (des)vincula de projeto.

### Regras

1. **Cálculo Efetivo**: `SAQUE_VIRTUAL = saldo_atual - saques_pendentes + depositos_pendentes`
2. **Idempotência**: Proteção contra duplicidade (ignora transações virtuais idênticas em janelas de 10 segundos)
3. **Sem Supressão**: DEPOSITO_VIRTUAL é SEMPRE criado quando saldo > 0, mesmo em re-vinculação ao mesmo projeto.
4. **Sem Impacto no Saldo**: O trigger `fn_cash_ledger_generate_financial_events` marca transações virtuais como processadas sem gerar eventos. Isso garante que o saldo da bookmaker permanece inalterado após desvinculação.
5. **Ordem Atômica**: Em `executeUnlink`, o SAQUE_VIRTUAL é criado ANTES de desvincular a bookmaker.

### Bug Corrigido (2026-04-02)

- **Causa raiz**: O trigger tratava SAQUE_VIRTUAL/DEPOSITO_VIRTUAL igual a SAQUE/DEPOSITO reais, gerando financial_events que debitavam/creditavam saldo_atual
- **Efeito**: Após desvinculação, saldo ia para 0. A view `v_bookmakers_desvinculados` filtrava por saldo > 0.01, tornando a casa invisível
- **Correção**: (1) Trigger agora ignora transações virtuais; (2) 58 eventos indevidos revertidos via REVERSAL
