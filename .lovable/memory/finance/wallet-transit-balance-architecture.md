# Memory: finance/wallet-transit-balance-architecture
Updated: 2026-01-27

## Arquitetura de Dinheiro em Trânsito para Wallets Crypto

O sistema implementa o conceito de "Dinheiro em Trânsito" para wallets crypto, garantindo que valores enviados mas ainda não confirmados não sejam considerados como saldo disponível.

### Modelo de 3 Camadas de Saldo

Toda wallet crypto possui 3 valores:

| Campo | Descrição |
|-------|-----------|
| `balance_total` | Saldo total confirmado da wallet (em USD) |
| `balance_locked` | Valor em trânsito - enviado mas não confirmado (em USD) |
| `balance_available` | Saldo disponível para uso = `total - locked` |

**Regra Fundamental**: Operações SEMPRE usam `balance_available`, NUNCA `balance_total`.

### Estados de Transação (`transit_status`)

| Status | Significado |
|--------|-------------|
| `PENDING` | Transação enviada para blockchain/destino, aguardando confirmação |
| `CONFIRMED` | Chegou ao destino e foi conciliada |
| `FAILED` | Falhou na blockchain/transferência |
| `REVERSED` | Foi devolvida para a wallet |

### Fluxo de Operações

#### 1. Criação de Transação CRYPTO
```
1. Usuário solicita envio de $100 da wallet
2. Sistema verifica balance_available >= $100
3. RPC lock_wallet_balance() trava $100
4. balance_locked += 100, balance_available -= 100
5. cash_ledger inserido com transit_status = 'PENDING'
```

#### 2. Confirmação (Conciliação)
```
1. Usuário confirma recebimento no destino
2. RPC confirm_wallet_transit() é chamada
3. balance_locked -= 100, balance_total -= 100
4. transit_status atualizado para 'CONFIRMED'
```

#### 3. Falha/Reversão
```
1. Transação falhou na blockchain
2. RPC revert_wallet_transit() é chamada
3. balance_locked -= 100 (libera o valor)
4. transit_status atualizado para 'FAILED' ou 'REVERSED'
5. balance_available volta ao normal
```

### RPCs Implementadas

| RPC | Função |
|-----|--------|
| `get_wallet_balances(wallet_id)` | Retorna os 3 saldos da wallet |
| `lock_wallet_balance(wallet_id, valor_usd, ledger_id?)` | Trava saldo antes de transação |
| `confirm_wallet_transit(ledger_id, valor_confirmado?)` | Confirma e efetiva débito |
| `revert_wallet_transit(ledger_id, status, motivo?)` | Reverte e libera saldo |

### Componentes Frontend

- `useWalletTransitBalance`: Hook para gerenciar operações de trânsito
- `WalletBalanceDisplay`: Componente para exibir os 3 saldos
- `TransacoesEmTransito`: Dashboard para confirmar/reverter transações pendentes

### Integração no CaixaTransacaoDialog

Quando uma transação CRYPTO é criada a partir de uma wallet:
1. O `lockBalance()` é chamado automaticamente antes do insert
2. O campo `transit_status` é setado como 'PENDING'
3. O usuário deve confirmar na aba "Transações em Trânsito"

### View Atualizada

A view `v_saldo_parceiro_wallets` foi atualizada para incluir:
- `saldo_locked`: valor em trânsito
- `saldo_disponivel`: saldo que pode ser usado
