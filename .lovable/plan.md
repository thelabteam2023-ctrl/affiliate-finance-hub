

## Problema

No fluxo **Gestão de Parceiros → Financeiro → Depósito**, o `CaixaTransacaoDialog` recebe a bookmaker pré-selecionada (ex: TALISMANIA) mas:

1. Força `defaultTipoMoeda="FIAT"` e `defaultMoeda=bookmaker.moeda` (USD), ignorando o histórico real de funding (USDT) → usuário precisa trocar manualmente para CRYPTO.
2. Não há detecção do **último depósito** para DEPOSITO (só existe para SAQUE via `fetchLastDepositFundingSource`), então o sistema "esquece" que aquela conta é tipicamente abastecida em USDT.
3. Quando o usuário troca a moeda manualmente, a auto-focus chain reabre o popover do BookmakerSelect (apesar do bookmaker já estar travado no destino), causando o re-render e a sensação de "fluxo quebrado" da imagem 2.
4. O alerta "este parceiro não possui contas com saldo em USD" aparece como bloqueio, mas é só a consequência da inferência errada (deveria ser USDT em wallet, não USD em conta).

## Solução

Tornar o dialog **context-aware** para DEPOSITO da mesma forma que já é para SAQUE, e blindar o BookmakerSelect contra re-aberturas quando o destino já está travado.

### 1. Inferência inteligente de moeda no DEPOSITO contextual

**`src/components/caixa/CaixaTransacaoDialog.tsx`**

- Renomear `fetchLastDepositFundingSource` para `fetchLastFundingSource` e parametrizar para aceitar `bookmakerId` + direção (`destino` para DEPOSITO, `destino` para SAQUE).
- No `useEffect` de abertura (linha ~318), adicionar branch para `defaultTipoTransacao === "DEPOSITO" && defaultDestinoBookmakerId`:
  - Buscar o último depósito daquela bookmaker (mesma query já existente).
  - Se encontrar `tipo_moeda = CRYPTO`, sobrescrever `pendingDefaultsRef` com `tipoMoeda: "CRYPTO"` + `coin` detectado.
  - Se não houver histórico, manter o `defaultTipoMoeda` recebido (FIAT/USD) como hoje.

**Hierarquia de inferência (DEPOSITO):**
```
1. Histórico de depósitos da bookmaker → fonte de verdade
2. Saldo disponível do parceiro (se só tem wallet USDT, infere CRYPTO)
3. Fallback: defaultTipoMoeda recebido via props
```

### 2. Validação suave do parceiro (sem bloquear)

- Quando a moeda inferida não tem origem compatível no parceiro, manter o alerta atual ("Este parceiro não possui contas/wallets com saldo em X") **mas não impedir** o usuário de trocar tipoMoeda manualmente.
- Adicionar CTA inline no alerta: "Cadastrar wallet" / "Cadastrar conta" reaproveitando o `ParceiroDialog` que já é importado, abrindo na aba correta (`"crypto"` ou `"bancos"`).

### 3. Travar BookmakerSelect quando vem por contexto

- Adicionar prop `lockBookmakerDestino?: boolean` no `CaixaTransacaoDialog`.
- Quando `defaultDestinoBookmakerId` vem preenchido e `entryPoint === "affiliate_deposit"`, considerar o bookmaker travado.
- Em todos os `bookmakerSelectRef.current?.open()` da auto-focus chain (linhas 998, 1049, 1092, 1226, 1238), adicionar guard:
  ```
  if (destinoBookmakerId && lockBookmakerDestino) return;
  ```
- Visualmente: renderizar o BookmakerSelect em modo read-only (mostra a logo + nome + moeda em badge, sem chevron de abrir popover) quando travado.

### 4. Ajustar a chamada em `GestaoParceiros.tsx`

- No `handleNewTransacao` (linha 285), passar também a logo/contexto se disponível (não obrigatório).
- Na renderização do `<CaixaTransacaoDialog>` (linha 656), **remover** o hard-coded `defaultTipoMoeda="FIAT"`. Deixar `undefined` para que a inferência decida. O `defaultMoeda={transacaoBookmaker?.moeda}` continua como fallback.

### 5. Reordenação visual da seção FLUXO DA TRANSAÇÃO

Sequência guiada (sem mudar componentes, só a cadeia de auto-focus):

```
Bookmaker (travado, vem do contexto)
   ↓ (inferido, sem clique)
Tipo de Moeda (CRYPTO/FIAT auto)
   ↓
Moeda/Coin (auto-selecionado via inferência)
   ↓
Parceiro (já vem do contexto)
   ↓
Conta/Wallet de origem (abre popover)
   ↓
Quantidade/Valor (foco final)
```

## Detalhes técnicos

- **Arquivos editados**:
  - `src/components/caixa/CaixaTransacaoDialog.tsx` — generalizar `fetchLastFundingSource`, novo branch DEPOSITO no useEffect de abertura, guards na auto-focus chain do BookmakerSelect, modo read-only quando travado, prop `lockBookmakerDestino`.
  - `src/pages/GestaoParceiros.tsx` — remover `defaultTipoMoeda="FIAT"` hardcoded; passar `lockBookmakerDestino={true}` quando há `transacaoBookmaker`.
- **Sem migração SQL** — toda a inteligência usa a query já existente em `cash_ledger`.
- **Sem regressão** — fluxos sem contexto (Caixa principal, novo vínculo, etc.) continuam idênticos pois o branch novo só dispara quando há `defaultDestinoBookmakerId` + `DEPOSITO`.
- **Compatível com a regra USDT≈USD** já corrigida — a inferência apenas alinha a UI à verdade contábil.

## Resultado esperado

- TALISMANIA pré-selecionada → sistema detecta histórico USDT → abre direto em CRYPTO/USDT, parceiro já fixado, foca na wallet de origem.
- BookmakerSelect não reabre mais sozinho.
- Alerta de "sem saldo" vira informativo com atalho de cadastro, não bloqueio.
- Redução de ~4 cliques para ~1 (selecionar wallet) + digitar valor.

