# Plano — Auto-foco do fluxo de SAQUE

## Diagnóstico

O auto-foco do SAQUE depende de uma **cadeia de 3+ `useEffect`** (linhas 1183–1394 de `CaixaTransacaoDialog.tsx`) — cada passo abre o próximo:

**SAQUE FIAT:**
```text
ParceiroDestino → ContaBancáriaDestino → BookmakerOrigem → Valor
   (1185)            (1214)                  (1234)
```

**SAQUE CRYPTO (fluxo invertido):**
```text
TipoMoeda=CRYPTO → BookmakerOrigem → Coin → ParceiroDestino → WalletDestino → Valor
   (1257)            (auto)            (1316)    (1356)            (1381)
```

Cada um desses efeitos usa o **mesmo padrão frágil**: `setTimeout(150) → ref.current?.open()`. Se o ref ainda não estiver montado (porque o JSX que o contém é condicional ao passo anterior e React ainda não fez commit), a chamada vira no-op silencioso e a corrente **quebra para sempre** — nenhum retry.

A reordenação recente do JSX (Proposta A/B) aumentou a probabilidade de remount/atraso de commit, expondo o problema que antes era apenas intermitente.

Já corrigi o efeito `moeda → parceiro` com retry+rAF (`tryOpenParceiroSelect`). Os 5 efeitos restantes do SAQUE ainda usam o padrão frágil.

## Mudanças propostas

### 1. Centralizar o helper de retry
Generalizar `tryOpenParceiroSelect` em uma função utilitária dentro do componente:
```text
tryOpenRef(refGetter, mode: 'open' | 'focus' | 'click')
```
- até 15 tentativas, 60ms cada
- double-rAF antes da ação
- aceita ref de `ParceiroSelectRef`, `BookmakerSelectRef` ou `HTMLButtonElement`

### 2. Substituir 5 pontos do SAQUE pelo helper

| Linha | Efeito | Ref alvo | Mudança |
|---|---|---|---|
| 1204–1208 | SAQUE FIAT: parceiro → conta | `contaBancariaSelectRef` | retry com `focus+click` |
| 1225–1229 | SAQUE FIAT: conta → bookmaker | `bookmakerSelectRef` | retry com `open` |
| 1356–1361 | SAQUE CRYPTO: parceiro → wallet | `walletCryptoSelectRef` | retry com `focus+click` |
| 1386–1391 | SAQUE CRYPTO: wallet → bookmaker | `bookmakerSelectRef` | retry com `open` |
| 1257+    | SAQUE CRYPTO: tipoMoeda=CRYPTO → bookmaker | `bookmakerSelectRef` | retry com `open` |

### 3. Garantia anti-quebra
- Manter os `prev*.current` guards (evita re-disparo em loops).
- Manter os early returns por fluxo de defaults/affiliate (não interferir em pré-preenchimento).
- Não alterar a lógica de quais campos abrem qual — só a **forma** de chamar.

### 4. Validação
1. SAQUE FIAT manual: selecionar tipo→moeda→parceiro destino → conta deve abrir sozinha → bookmaker deve abrir sozinha → foco no Valor.
2. SAQUE CRYPTO manual: selecionar tipo→CRYPTO → bookmaker abre → escolher coin → parceiro abre → wallet abre → foco no Quantidade.
3. SAQUE com bookmaker pré-setado (entryPoint affiliate): cadeia deve respeitar early returns e ir direto ao Valor.
4. SAQUE com 1 conta/wallet única do parceiro: auto-seleção continua funcionando + cadeia segue.

## Detalhes técnicos

- Sem alteração de assinaturas de componente, sem alteração de schema.
- Sem alteração na estrutura visual (Proposta B mantém intocada).
- Toda mudança fica em `src/components/caixa/CaixaTransacaoDialog.tsx`, no bloco de efeitos de auto-foco (linhas 1183–1394).
- O helper substitui apenas o trecho que chama `.focus/.click/.open` — todo o resto do efeito (guards, side-effects de estado, atualização de `prev*.current`) permanece igual.

## Risco

Baixo. A mudança torna a sequência **mais resiliente**, nunca menos. Se o ref nunca aparecer (caso impossível em fluxo normal), o helper desiste após ~900ms sem efeitos colaterais.
