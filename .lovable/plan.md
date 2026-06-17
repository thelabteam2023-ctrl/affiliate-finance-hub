## Diagnóstico — bug confirmado

O KPI **Fluxo Líquido** da Visão Financeira (-R$ 2.878,04) é a soma de `lucroRealizado` de todos os projetos, calculada em `useWorkspaceLucroRealizado` → `fetchProjetosLucroCanonico`.

O problema está em `src/services/fetchProjetosLucroCanonico.ts`:

- Para cada projeto, `lucroRealizado` é calculado usando `convertOficial = buildConverter(moedaConsolidacao, cotacoesOficiais)`.
- `moedaConsolidacao` é a **moeda do projeto** (USD para Marcio/Italo, BRL para outros).
- Portanto cada `lucroRealizado` fica expresso na moeda do projeto: Marcio = `-$1.236,88` (USD), Italo = `-$1.641,16` (USD), etc.
- Em `useWorkspaceLucroRealizado` (linha 64-67), há um simples `reduce(acc + r.lucroRealizado, 0)` — somando USD e BRL como se fossem o mesmo número e exibindo o resultado com prefixo "R$".

A conta bate: somando os USDs dos projetos dá exatamente $-2.878,04, que o KPI mostra como "R$ -2.878,04". Já a Análise Temporal lê o `cash_ledger` direto convertendo cada linha de USD→BRL via PTAX (R$ 5,09), resultando em ~-R$ 14.634 — esse é o número correto.

## Correção

Converter o `lucroRealizado` de cada projeto da **sua moeda de consolidação** para **BRL** antes de somar.

### Arquivo 1 — `src/services/fetchProjetosLucroCanonico.ts`

- Acrescentar ao tipo `LucroCanonicoResultado` o campo `lucroRealizadoBRL: number`.
- Dentro do loop de cálculo do Lucro Realizado (linhas 286-300), construir um **conversor adicional para BRL** baseado nas cotações oficiais e converter `r.lucroRealizado` (na moeda do projeto) para BRL:
  ```ts
  const convertBRL = buildConverter("BRL", cotacoesOficiais);
  r.lucroRealizadoBRL = convertBRL(r.lucroRealizado, cfg.moeda_consolidacao);
  ```
- O `lucroRealizado` original (na moeda do projeto) permanece intacto para não quebrar consumidores que exibem o número por-projeto.

### Arquivo 2 — `src/hooks/useWorkspaceLucroRealizado.ts`

- Trocar o `reduce` para somar `r.lucroRealizadoBRL` em vez de `r.lucroRealizado` (linhas 64-67):
  ```ts
  const total = Object.values(resultado).reduce(
    (acc, r) => acc + (Number(r.lucroRealizadoBRL) || 0),
    0
  );
  ```
- O retorno continua sendo `lucroRealizado` (renomear para `lucroRealizadoBRL` no consumer não é necessário — o número agora simplesmente está em BRL, que é o que a UI já assume).

## Fora do escopo

- Não tocar nos cards de projeto (Marcio mostra `-$1.236,88` na moeda do projeto, está correto).
- Não tocar na Análise Temporal (já consolida em BRL corretamente).
- Não tocar em `useFinanceiroCalculations` — as linhas 189-190 que filtram `moeda === "BRL"` não alimentam o KPI Fluxo Líquido (só `totalScanPeriodo`/`countScanPeriodo`); podem ficar para uma limpeza futura.

## Validação esperada

Após a correção, o KPI Fluxo Líquido na Visão Financeira deve passar de **-R$ 2.878,04** para algo próximo de **-R$ 14.634,55** (mesmo número da Análise Temporal de jun/26 — usando PTAX ≈ 5,09), confirmando a paridade entre as duas visões.

## Diagrama do fluxo de dados

```text
projetos (Marcio USD, Italo USD, ...)
  └─ fetchProjetosLucroCanonico
       ├─ lucroRealizado   (na moeda do projeto)      ← mantido p/ cards
       └─ lucroRealizadoBRL (convertOficial → BRL)    ← NOVO
            └─ useWorkspaceLucroRealizado.reduce
                 └─ KPI "Fluxo Líquido" (BRL)
```

Quer que eu aplique?
