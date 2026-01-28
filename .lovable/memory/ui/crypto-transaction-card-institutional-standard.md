# Memory: ui/crypto-transaction-card-institutional-standard
Updated: 2026-01-28

## Padrão Institucional para Cards de Movimentação Crypto

O componente `CryptoTransactionCard` implementa uma visão financeira institucional para movimentações crypto, compatível com auditoria e reconciliação contábil.

### Regras de Identidade (3 Níveis)

Toda movimentação crypto deve exibir:

```
Pessoa → Wallet → Endereço
```

Exemplo:
```
Marina do Rosário
Trust Wallet
0x7480...1c8e25
```

**Proibições:**
- Nunca exibir apenas "Trust Wallet" (sem pessoa)
- Nunca exibir endereço sem wallet
- Nunca exibir wallet sem pessoa

### Regras de Ativo e Rede

O badge "CRYPTO" foi substituído por 3 camadas:

| Camada | Exemplo |
|--------|---------|
| Tipo | Transferência Recebida |
| Ativo | USDT |
| Rede | ERC20 |

Visualmente: `[Transferência Recebida] [USDT] [ERC20]`

**Obrigatório:** Toda transação crypto DEVE exibir ativo e rede.

### Modelo de Dados

```typescript
interface CryptoTransactionData {
  id: string;
  type: "sent" | "received";
  asset: string | null;      // USDT, ETH, BTC...
  network: string | null;    // ERC20, TRC20, BSC...
  amount: number;
  amount_usd: number | null;
  date: string;
  description: string | null;
  status: string;
  from: CryptoParty;
  to: CryptoParty;
}

interface CryptoParty {
  owner_name: string | null;   // Nível 1: Pessoa
  wallet_name: string | null;  // Nível 2: Wallet
  address: string | null;      // Nível 3: Endereço
}
```

### Layout do Card

```
┌──────────────────────────────────────────────────────────────┐
│ [Tipo] [Ativo] [Rede]                              28/01/26  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ORIGEM                    →    $97.00    ←       DESTINO   │
│  Marina do Rosário                           Marina Rosário  │
│  Trust Wallet                                  Trust Wallet  │
│  0xC7c4...03A939                             0x7480...1c8e25 │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Mapeamento de Redes

| Código | Display |
|--------|---------|
| ETH, ERC20 | Ethereum |
| BSC, BEP20 | BNB Chain |
| TRC20, TRON | Tron |
| SOL | Solana |
| POLYGON, MATIC | Polygon |
| ARB | Arbitrum |
| OP | Optimism |

### Componentes

- `CryptoTransactionCard`: Card principal
- `PartyIdentity`: Exibe os 3 níveis de identidade
- `CopyableAddress`: Endereço com botão de cópia

### Transformação de Dados

A função `transformToCryptoCard()` no `ParceiroMovimentacoesTab` converte `Transacao` para `CryptoTransactionData`, buscando informações de wallets e parceiros nas coleções de cache.
