# Memory: architecture/wallet-per-bookmaker-binary-model
Updated: 2026-01-27

## Nova Arquitetura: Wallet por Bookmaker com Modelo Binário

### Problema Resolvido
O sistema anterior usava `contexto_operacional` (NORMAL, FREEBET, BONUS) para controlar decisões financeiras, causando:
1. Bloqueio de formulários ("Contexto operacional obrigatório")
2. KPIs filtrados incorretamente por contexto em vez de origem
3. Acoplamento entre navegação UI e lógica contábil

### Nova Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                    WALLET POR BOOKMAKER                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   saldo_atual = SALDO NORMAL (real + bônus unificado)          │
│   saldo_freebet = ÚNICO POOL SEPARADO                          │
│   saldo_bonus = DEPRECATED (tratado como saldo_atual)          │
│                                                                 │
│   REGRA DE DÉBITO BINÁRIA:                                      │
│   ├── usar_freebet = false → debita saldo_atual                │
│   └── usar_freebet = true  → debita saldo_freebet              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Mudanças Implementadas

| Componente | Antes | Depois |
|------------|-------|--------|
| `contexto_operacional` | Obrigatório, 3 valores | DEPRECATED, sempre 'NORMAL' |
| `fonte_saldo` | Inferido de contexto | Determinado por `usar_freebet` |
| `saldo_bonus` | Pool separado | Unificado em `saldo_atual` |
| Validação | Bloqueia sem contexto | Apenas `estrategia` e `forma_registro` |
| KPIs de Bônus | Filtram por `contexto='BONUS'` | Filtram por `origem='BONUS_*'` no ledger |

### Fluxo de Liquidação

```
SE usar_freebet = FALSE:
└── Debita de saldo_atual (normal)
    └── GREEN: stake + lucro → saldo_atual
    └── RED: stake perdido
    └── VOID: stake retorna → saldo_atual

SE usar_freebet = TRUE:
└── Debita de saldo_freebet
    └── GREEN: APENAS lucro → saldo_atual (SNR)
    └── RED: freebet consumida
    └── VOID: freebet retorna → saldo_freebet
```

### Arquivos Modificados
- `src/components/projeto-detalhe/RegistroApostaFields.tsx` - Validação e sugestões
- `src/services/aposta/types.ts` - Tipos atualizados
- `src/services/aposta/ApostaService.ts` - `inferFonteSaldo` refatorado
- `src/lib/apostaConstants.ts` - Labels e constantes
- `src/types/apostasUnificada.ts` - Tipos de contexto/fonte
- `src/lib/cashOperationalTypes.ts` - Documentação de tipos
- `src/lib/ledgerService.ts` - Comentários e registro de bônus
- `src/components/projeto-detalhe/ApostaDialog.tsx` - Passagem de `usar_freebet`

### Regra de Ouro
> "Bônus é dinheiro NORMAL com tag de origem. Apenas Freebet tem pool separado."
> "usar_freebet toggle é a única verdade financeira para decisões de débito."
