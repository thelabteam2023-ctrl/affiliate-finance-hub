

## Diagnóstico

O resultado **não está correto**. Há um bug na linha que lê a comissão:

```typescript
exchangeCommission: (parseFloat(exchangeCommission) || 2.8) / 100,
```

Quando o usuário digita "0", `parseFloat("0")` retorna `0`, que é **falsy** em JavaScript. O operador `||` então substitui por `2.8`. Ou seja, **é impossível usar comissão 0%** — o sistema sempre aplica 2.8%.

## Correção

Substituir o `||` por uma checagem explícita de `NaN`:

```typescript
const commVal = parseFloat(exchangeCommission);
exchangeCommission: (isNaN(commVal) ? 2.8 : commVal) / 100,
```

O mesmo padrão de fallback `|| valor` pode existir para `targetExtraction` e `bankroll` na mesma linha — verificar e corrigir também.

## Impacto

Com essa correção, o cenário da screenshot (back=2.0, lay=2.0, comissão=0) passará a exibir **Custo de Extração = 0%** e **R$ 0,00**, que é o resultado matematicamente correto.

