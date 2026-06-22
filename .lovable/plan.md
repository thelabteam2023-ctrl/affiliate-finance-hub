## Resposta direta à dúvida

> "Por que 4,80? Quem definiu? PTAX é do caixa; Cotação de Trabalho é por projeto."

Você está certo, e o exemplo do plano anterior estava **mal rotulado** da minha parte. Olhando o código que está rodando:

- `Financeiro.tsx` constrói `convertUnified` a partir de `useMultiCurrencyConversion`, que por sua vez consome `useCotacoes`. Essa fonte é **a cotação live do workspace** — FastForex como primária e **PTAX como fallback** (mesma cadeia usada pelo Caixa Operacional). Não é Cotação de Trabalho.
- `usePosicaoCapital` recebe esse `convertUnified` e converte **tudo** (aportes, liquidações, patrimônio) na **taxa de agora**.
- **Cotação de Trabalho é de projeto** (`ProjectCurrencyContext` / `useProjetoCurrency`) e não tem por que aparecer numa tela workspace-level como o card de Posição de Capital. O plano anterior misturou os dois conceitos — desconsidere essa parte.

Então o "4,80" do meu exemplo era genérico. Na prática quem está mandando é a **PTAX/FastForex de hoje**, aplicada igualmente aos dois lados da conta — e é justamente isso que zera artificialmente a variação cambial.

---

## Regra correta de cotação por camada (oficializar)

| Camada | Onde vive | Cotação que manda | Por quê |
|---|---|---|---|
| Operação dentro de um **projeto** (apostas, P&L de surebet, bônus consolidado) | `ProjectCurrencyContext` | **Cotação de Trabalho do projeto** (snapshot por operação) | Já é padrão (`cotacao-snapshot-per-operation-standard`, `volume-snapshot-cotacao-trabalho-standard`). Isola o projeto do ruído de mercado. |
| **Caixa Operacional / Financeiro / Posição de Capital** (visão workspace) | `useCotacoes` → FastForex + **PTAX** fallback | **PTAX** (live) para marcação a mercado **+ snapshot do evento** para valores históricos | É dinheiro real, fora de projeto. PTAX é a referência oficial e neutra do workspace. |

Cotação de Trabalho **não** entra no card de Posição de Capital. Vou deixar isso explícito no código e em memória.

---

## Plano corrigido para o card "Posição de Capital"

### Problema real
Hoje aportes e patrimônio são marcados na **mesma taxa de hoje** → variação cambial passiva some, e o "Resultado Operacional Acumulado" engole esse ruído.

### Solução em 3 linhas honestas

```text
Patrimônio Atual (PTAX hoje)
  ├─ Capital próprio investido (PTAX da data de cada aporte/liquidação)
  ├─ Resultado operacional realizado (fonte canônica, sem FX)
  └─ Variação cambial não realizada (saldo em moeda estrangeira × ΔPTAX)
```

Identidade: `Capital_histórico + Resultado_realizado + FX_não_realizada = Patrimônio_PTAX_hoje`.

### Onde cada número vem

1. **Capital próprio investido (histórico)**
   - Fonte: `cash_ledger` (APORTE / APORTE_FINANCEIRO / APORTE_DIRETO / LIQUIDACAO), CONFIRMADO.
   - Conversão: usar o **valor consolidado já gravado** no evento (snapshot do dia). Fallback: PTAX da `data_transacao` via `exchange_rate_history`. Último recurso: PTAX de hoje (marcar como aproximado no tooltip).
   - **Não usar `convertUnified` (taxa de hoje) para esse valor.**

2. **Resultado operacional realizado**
   - Reusar a fonte canônica que já alimenta a Visão Geral (`fetchProjetosLucroCanonico` / RPC equivalente) agregada no nível workspace.
   - Já exclui GANHO/PERDA_CAMBIAL (memória `canonical-operational-profit-standard`).
   - Sempre acumulado.

3. **Variação cambial não realizada**
   - Calculada por diferença: `Patrimônio_PTAX_hoje − Capital_histórico − Resultado_realizado`.
   - Tooltip: "Efeito de reavaliar saldos em moeda estrangeira pela PTAX de hoje. Só vira ganho/prejuízo de verdade quando a moeda volta para BRL."
   - Se o workspace é 100% BRL nativo, fica ~0 e pode ser ocultada por threshold (ex.: > 0,1% do patrimônio).

4. **Freebet em estoque** — segue como linha informativa, fora da soma (já corrigido o label).

### ROI do rodapé
Passa a usar a base histórica:
`ROI = Resultado Operacional Realizado / Capital Próprio Investido (histórico)` — para de oscilar quando a PTAX muda.

---

## Detalhes técnicos

**Arquivos**
- `src/hooks/usePosicaoCapital.ts`
  - Ler também `valor_consolidado` / `cotacao_snapshot` (ou equivalente PTAX-no-dia) do `cash_ledger`.
  - Retornar duas séries de capital: `capitalHistorico` (snapshot) e `capitalMarkToMarket` (PTAX hoje — para diagnóstico).
  - Remover dependência de `convertUnified` para o número exibido; manter só como fallback.
- Novo `src/hooks/useResultadoOperacionalWorkspace.ts` (ou reuso direto de `fetchProjetosLucroCanonico` agregando todos os projetos do workspace).
- `src/components/financeiro/PosicaoCapitalCard.tsx`
  - 3 linhas no bloco "Composição do Patrimônio Atual": Capital (histórico) / Resultado realizado / FX não realizada.
  - Atualizar tooltips deixando claro: "valores históricos = PTAX da data; patrimônio = PTAX de hoje; a diferença é FX não realizada".
  - Recalcular ROI com as novas bases.
  - Manter o toggle Acumulado/Período do bloco superior intocado.
- `src/pages/Financeiro.tsx`: passar `cotacaoUSD` (PTAX live) e o agregador de resultado operacional ao hook; não passar mais `convertUnified` como cotação primária.

**Não muda**
- Engine de bookmakers, ledger, RPCs.
- Cotação de Trabalho continua isolada nos projetos.
- Caixa Operacional, KPIs da Visão Geral.

**Memórias a registrar depois de aprovado**
- `mem://finance/workspace-financial-fx-rate-standard` — "Telas workspace-level usam PTAX (live para marcação a mercado, PTAX-no-dia para histórico). Cotação de Trabalho é exclusiva de projeto."
- `mem://finance/posicao-capital-fx-decomposition-standard` — "Patrimônio = Capital histórico + Resultado realizado + FX não realizada."

---

## Confirmações antes de implementar

1. PTAX como referência oficial do workspace está OK? (alternativa: usar FastForex primário e PTAX só como fallback, igual hoje — mas com snapshot por data para o histórico).
2. Para o capital histórico, posso assumir que o `cash_ledger` já tem `valor_consolidado`/`cotacao_snapshot` confiáveis para aportes/liquidações antigos? Se não tiver para registros legados, faço fallback para PTAX da `data_transacao` via `exchange_rate_history`.
3. Ocultar a linha de "Variação cambial" quando estiver ~0 (workspace 100% BRL), ou sempre exibir mesmo zerada?
