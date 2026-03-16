# Memory: finance/wallet-crypto-credit-received-amount-standard
Updated: 2026-03-16

## Regra de Crédito em Wallet: Valor Recebido, Não Solicitado

### Problema Corrigido

Ao confirmar saques CRYPTO (Bookmaker → Wallet), o campo `qtd_coin` mantinha o valor **solicitado** (ex: 500 USDT) em vez do valor **realmente recebido** (ex: 483.78 USDT). Como a view `v_saldo_parceiro_wallets` usa `qtd_coin` para calcular o saldo, as wallets ficavam com saldo inflado.

Adicionalmente, as entradas de PERDA_CAMBIAL/GANHO_CAMBIAL eram criadas com `destino_wallet_id` vinculado, mas sem `transit_status = 'CONFIRMED'`, o que as impedia de serem contabilizadas na view — porém criava risco de dupla contagem caso o transit_status fosse corrigido.

### Correção Aplicada

1. **`qtd_coin` atualizado para valor recebido**: Na confirmação do saque crypto (`ConfirmarSaqueDialog.tsx`), o `qtd_coin` agora é atualizado para o valor realmente recebido (`qtdCoinRecebidaNum`).

2. **PERDA/GANHO_CAMBIAL sem `destino_wallet_id`**: As entradas de diferença cambial são registros contábeis puros — NÃO devem impactar o saldo da wallet. O `destino_wallet_id` foi removido.

3. **Migration de correção**: Dados históricos corrigidos via migration que:
   - Atualizou `qtd_coin = valor_confirmado` em todos os saques com divergência
   - Removeu `destino_wallet_id` de todas as entradas PERDA/GANHO_CAMBIAL crypto

### Regra de Ouro
> "A wallet é creditada com o valor que REALMENTE chegou, nunca com o valor solicitado."
> "`qtd_coin` = valor real recebido; `valor_confirmado` = auditoria do mesmo valor."
> "PERDA/GANHO_CAMBIAL NUNCA tem `destino_wallet_id` — é registro contábil puro."
