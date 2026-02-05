 # Memory: finance/transit-status-bookmaker-to-wallet-rule
 Updated: 2026-02-05
 
 ## Regra de Transit Status para Saques BOOKMAKER → WALLET
 
 ### Problema Corrigido
 O sistema estava setando `transit_status = 'CONFIRMED'` imediatamente para saques CRYPTO de Bookmaker → Wallet, causando crédito indevido na wallet antes da confirmação real do recebimento.
 
 ### Fluxo Correto (Imutável)
 
 ```
 SAQUE BOOKMAKER → WALLET (CRYPTO):
 ├── 1. Registro: transit_status = 'PENDING'
 ├── 2. Bookmaker: status = 'SAQUE_PENDENTE'
 ├── 3. Wallet: NÃO creditada (view ignora PENDING)
 ├── 4. Conciliação: Usuário confirma recebimento
 ├── 5. Update: transit_status = 'CONFIRMED'
 └── 6. Wallet: Creditada (view considera CONFIRMED)
 ```
 
 ### Lógica de Transit Status (CaixaTransacaoDialog.tsx)
 
 | Cenário | transit_status |
 |---------|----------------|
 | WALLET → WALLET | CONFIRMED (instantâneo) |
 | WALLET → BOOKMAKER | PENDING (aguarda blockchain) |
 | BOOKMAKER → WALLET (SAQUE) | PENDING (aguarda confirmação) |
 | CAIXA → WALLET | CONFIRMED (interno) |
 
 ### Condição Corrigida
 
 ```typescript
 // ANTES (incorreto):
 const isTransacaoCryptoDeWallet = tipoMoeda === "CRYPTO" && origemWalletId;
 
 // DEPOIS (correto):
 const isTransacaoCryptoDeWallet = tipoMoeda === "CRYPTO" && (origemWalletId || destinoWalletId);
 ```
 
 ### Regra de Ouro
 > "Wallet só é creditada quando `transit_status = 'CONFIRMED'`"
 > "Saque de Bookmaker para Wallet SEMPRE começa como PENDING"