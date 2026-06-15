# Exibir Titular da Conta na Origem do Histórico do Caixa Operacional

## Diagnóstico

Hoje o histórico mostra apenas o **nome da instituição** (ex.: "PagSeguro Internet S.A." ou "BetPix365") porque o componente `HistoricoMovimentacoes` consome apenas `getOrigemLabel(tx)`, que devolve só o campo `primary`.

A boa notícia: a função `getOrigemInfo(tx)` em `src/pages/Caixa.tsx` **já calcula** o titular/parceiro no campo `secondary` para todos os casos relevantes:

- `BOOKMAKER` → `secondary = parceiros[bookmaker.parceiro_id]` (titular da casa)
- `PARCEIRO_CONTA` → `secondary = conta.titular` (titular do banco)
- `PARCEIRO_WALLET` → `secondary = parceiros[wallet.parceiro_id]` (titular da wallet)
- `AJUSTE_SALDO` e `SWAP_*` também já devolvem `secondary`

E `getOrigemInfo` já está sendo passado pela cadeia de props:
`Caixa.tsx` → `CaixaTabsContainer` → `HistoricoMovimentacoes` (prop opcional já declarada).

Logo, o trabalho é **puramente de UI no `HistoricoMovimentacoes.tsx`**: passar a consumir `getOrigemInfo` (e por simetria `getDestinoInfo`) e renderizar o `secondary` como rótulo "Titular: …". Nenhuma alteração de schema, RPC, lógica financeira ou backfill.

## Mudanças

### 1. `src/components/caixa/HistoricoMovimentacoes.tsx`

Substituir o uso de `getOrigemLabel` / `getDestinoLabel` por wrappers locais que leem `info.primary` e `info.secondary` quando `getOrigemInfo` / `getDestinoInfo` estão disponíveis (fallback para os labels atuais).

a) **Linha do fluxo "Origem → Destino" (linha 1107)**
   - Renderizar `Origem (Titular)` → `Destino (Titular)`, com o titular em fonte menor / muted ao lado, ex.:
     ```
     BetPix365 · Maria Santos  →  PagSeguro · João Silva
     ```
   - Implementação: pequeno helper `renderEndpoint(info)` que retorna `<span>{primary}{secondary && <em className="text-faint">· {secondary}</em>}</span>`.

b) **Chip "Origem:" do bloco Scan (linhas 1119–1127)**
   - Atualmente: `Origem: {scanOrigemPrimary}`.
   - Passar a usar `scanOrigemInfo = getOrigemInfo(tx)` e renderizar:
     ```
     Origem: PagSeguro Internet S.A.
     Titular: João Silva
     ```
     Ou, mais compacto numa única chip: `Origem: PagSeguro · Titular: João Silva`.
   - Atualizar `title` (tooltip) para incluir o titular.
   - Critério `scanOrigemValid` continua igual (baseado em `primary !== 'Origem'`).

c) **Compatibilidade**
   - `getOrigemInfo` / `getDestinoInfo` já são props opcionais. Manter fallback:
     ```ts
     const origemInfo = getOrigemInfo ? getOrigemInfo(tx) : { primary: getOrigemLabel(tx) };
     ```
   - Nenhum outro consumidor precisa mudar.

### 2. Verificação

- Abrir Caixa Operacional → Histórico → registro de Scan com origem em conta bancária (R$ 262,54) e outro com origem em bookmaker (R$ 235,00) → confirmar que ambos exibem **Titular: …**.
- Conferir registros normais (Depósito / Saque) onde origem ou destino sejam contas bancárias com múltiplos titulares no mesmo banco → confirmar diferenciação visual.

## Fora do escopo

- Nenhum backfill: os dados já existem (`parceiro_id` em bookmakers/wallets e `titular` em `contas_bancarias`).
- Nenhuma mudança em outras telas (Projeto, Parceiros) — se desejado depois, o mesmo padrão se aplica trocando `Label` por `Info`.
- Nenhuma alteração em lógica financeira, saldo, ledger ou RPCs.

## Diagrama do fluxo de dados (já existente)

```text
cash_ledger.origem_*  ──►  getOrigemInfo (Caixa.tsx)
                              │  primary  = banco / bookmaker / wallet
                              │  secondary = titular / parceiro
                              ▼
                    HistoricoMovimentacoes  ──►  UI (novo render)
```
