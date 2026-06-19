# Hidratação de "Chance Contra" (Lay) — Plano de Auditoria e Correção da Camada de Exibição

## Parte 1 — Mapeamento

### 1.1 Fonte de dados compartilhada (chave do plano)

Existe **um hook central único** que todos os módulos abaixo usam para ler pernas registradas:

- `src/hooks/useApostasPernas.ts` → `useApostasPernas / usePernasDeAposta / usePernasProjetoAnalise / fetchPernasByApostaIds`
- Tipo central: `src/types/apostasPernas.ts` → `ApostaPerna` / `PernaComBookmaker`
- Mapper central: `mapRowToPerna()` dentro do hook
- Componente visual compartilhado: `src/components/projeto-detalhe/ApostaPernasResumo.tsx` (interface `Perna`)

**Diagnóstico crítico:** hoje `select("*")` traz fisicamente as colunas `tipo` e `comissao` da tabela `apostas_pernas` (criadas na migration 20260619021644), mas `mapRowToPerna()` **não as projeta** para o objeto `ApostaPerna`, e a interface TS **não as declara**. Resultado: toda a camada de UI recebe `tipo=undefined` e `comissao=undefined`, e silenciosamente cai no comportamento "back, 0%".

Mesma situação em `src/types/apostasPernas.ts` (interface `ApostaPerna`, `ApostaPernaInsert`, `ApostaPernaUpdate`, helper `pernaArbitragemToInsert`).

E em `src/components/projeto-detalhe/ApostaPernasResumo.tsx` (interface `Perna` usada por todas as listagens — não tem `tipo`/`comissao`).

### 1.2 Módulos consumidores (cards/listagens)

| Módulo | Arquivo do card | Hook/query | Como exibe stake/lucro |
|---|---|---|---|
| Surebet (histórico) | `SurebetCard.tsx` | `usePernasDeAposta` via `ProjetoSurebetTab.tsx` | Mistura: usa `lucro_prejuizo` salvo no banco e recalcula cenário a partir de `stake_total / odd` (linhas 800-870). **Recalcula no frontend.** |
| Apostas gerais | `ApostaCard.tsx` | `usePernasDeAposta` via `ProjetoApostasTab.tsx` | `aposta.lucro_prejuizo` direto + `stake_total`/`odd_final` para display. Recálculo mínimo. |
| Duplo Green | `ProjetoDuploGreenTab.tsx` (usa `ApostaCard`) | `useApostasPernas` | Mesmo `ApostaCard` — segue herdar correção do helper. |
| ValueBet | `ProjetoValueBetTab.tsx` (usa `ApostaCard`) | já lê `lay_*` no nível **aposta** (campos legados back/lay do schema antigo) | Cards: helper. KPIs internos: recalcula `lay_stake * (1 - lay_comissao/100)` (linhas 544, 649). **Não é per-perna — é o modelo legado lay-único da aposta; fora do escopo.** |
| Punter | `ProjetoPunterTab.tsx` | idem ValueBet | idem |
| Freebets / Extração | `freebets/FreebetApostaCard.tsx`, `FreebetExtracaoView.tsx`, `ProjetoFreebetsTab.tsx` | `usePernasDeAposta` + tipo legado da aposta | `getOperationType` (linha 118) ainda olha campos antigos `lay_odd` no nível aposta. Per-perna: usa helper. |
| Bônus | `bonus/BonusApostasTab.tsx` (usa `ApostaCard`) | `useApostasPernas` | herda helper |
| Resumo compartilhado | `ApostaPernasResumo.tsx` (3 variantes: card / list / compact) | recebe `Perna[]` via prop | Só renderiza `odd` e `stake`; **nenhum cálculo financeiro**. Apenas rótulo. |
| `ResultadoPill.tsx` | renderiza P&L estimado | recebe props da aposta pai (modelo legado back+lay no nível aposta) | Recalcula com `comissao` — **modelo antigo aposta-única**, não consome `tipo` da perna. Fora do escopo. |
| Timeline | `ferramentas/PernaTimeline.tsx` | recebe perna direto | Exibe odd/stake — só rótulo. |

### 1.3 O que aparece errado hoje quando chegar uma perna lay

1. **Em todos os cards** (Surebet, Duplo Green, Bônus, Apostas gerais): rótulo "Stake R$ X" para uma perna que na verdade comprometeu **liability = stake × (odd − 1)**. O usuário lê "apostei 100" quando na verdade arriscou 200.
2. **SurebetCard cenários (linhas 800-870)**: o cálculo `payoutLocal = stake * odd` superestima retorno e inverte o cenário vencedor — em lay, a perna "ganha" quando a seleção **perde**, não quando vence.
3. **ApostaPernasResumo (todas as variantes)**: não diferencia visualmente back/lay, mesmo problema da calculadora antes do fix.
4. **% de retorno** em qualquer card que faça `lucro/stake`: usa base errada (deveria ser `lucro/liability` para lay).

## Parte 2 — Plano de Correção

### Estratégia: corrigir do centro para fora

**Prioridade 1 — Hidratação (sem isso o resto é inerte)**

1. `src/types/apostasPernas.ts`: adicionar `tipo: 'back' | 'lay'` e `comissao: number` em `ApostaPerna`, `ApostaPernaInsert`, `ApostaPernaUpdate`, e propagar no helper `pernaArbitragemToInsert`.
2. `src/hooks/useApostasPernas.ts` → `mapRowToPerna`: projetar `tipo` (default `'back'`) e `comissao` (default `0`) a partir da row. Aplicar default robusto para legado (toda perna histórica = back/0).
3. `src/components/projeto-detalhe/ApostaPernasResumo.tsx`: estender interface `Perna` com `tipo?` e `comissao?`.

**Prioridade 2 — Helper compartilhado de derivação financeira (novo, evita duplicação)**

Criar `src/utils/pernaLayHelpers.ts` reaproveitando a matemática já validada de `surebetCurrencyEngine.ts`:

```text
isLay(perna)              → tipo === 'lay'
exposureOf(perna)         → lay ? stake*(odd-1) : stake
labelExposicao(perna)     → lay ? 'Responsabilidade' : 'Stake'
lucroSeGanhar(perna)      → lay ? stake*(1-comissao) : stake*(odd-1)
lucroSePerder(perna)      → lay ? -(stake*(odd-1))  : -stake
roiBase(perna)            → exposureOf(perna)     // % calculado sempre sobre exposição real
```

Isso vira a fonte única de verdade para qualquer recálculo de UI. Nenhum cálculo lay novo é escrito fora desse helper.

**Prioridade 3 — Visual (rótulo + badge)**

`ApostaPernasResumo.tsx` (3 variantes — card/list/compact): quando `isLay(perna)`:
- Trocar prefixo `@odd` por `Lay @odd` ou pequeno badge `LAY` (vermelho discreto, mesmo tom já usado na calculadora).
- Trocar rótulo `Stake X` por `Resp X` mostrando `exposureOf(perna)` (não a stake bruta). Manter stake como tooltip/segunda linha pequena se necessário.
- Nenhuma outra mudança de layout.

**Prioridade 4 — Cards com recálculo (apenas SurebetCard)**

`SurebetCard.tsx` linhas 800-870 (cálculo de cenários) e linha 853 em diante (`calcularLucroPerna`):
- Substituir `payoutLocal = stake * odd` por uso do helper: numa perna lay vencedora, retorno é `stake*(1-comissao)`; numa perna lay perdedora, é `-liability`.
- O cenário "perna X ganha" tem semântica diferente para lay (a seleção perde) — usar `lucroSeGanhar` por perna em vez de fórmula inline.
- Manter caminho back-only intocado (mesmo princípio do fix da calculadora: branch novo só se `algumaPernaLay`).

Os demais cards (ApostaCard, FreebetApostaCard, BonusApostasTab) **não recalculam financeiramente per-perna** — consomem `lucro_prejuizo` já gravado pelas RPCs de liquidação (que já tratam lay nesta fase 2 separada). Para eles, **apenas o rótulo visual de exposição** muda via `ApostaPernasResumo` — sem nenhuma lógica matemática nova.

### Resumo de arquivos alterados

```text
Prioridade 1 (hidratação)
  src/types/apostasPernas.ts
  src/hooks/useApostasPernas.ts
  src/components/projeto-detalhe/ApostaPernasResumo.tsx  (interface)

Prioridade 2 (helper)
  src/utils/pernaLayHelpers.ts                            (novo)

Prioridade 3 (visual)
  src/components/projeto-detalhe/ApostaPernasResumo.tsx  (render)

Prioridade 4 (recálculo)
  src/components/projeto-detalhe/SurebetCard.tsx
```

ValueBet, Punter, Freebets, ResultadoPill: **fora deste escopo** — operam no modelo legado lay-no-nível-da-aposta, que não é o `tipo`/`comissao` per-perna introduzido na calculadora. Ficam para uma fase separada se o usuário quiser unificar os dois modelos.

### Validação por módulo (antes/depois)

Para cada módulo corrigido, mock local de uma perna: `odd=2.00, stake=100, comissao=2.8%, tipo='lay'`.

- Hoje (back default): card mostra "Stake R$ 100,00 @2.00", lucro cenário positivo +R$ 100.
- Depois: card mostra badge `LAY` + "Resp R$ 100,00 @2.00", lucro cenário se seleção perde = +R$ 97,20; se vence = −R$ 100,00.

Apresentar screenshot/diff por card antes de ir para o próximo.

## O que não muda

- Layout dos cards (só insere badge LAY + troca rótulo Stake→Resp quando lay).
- RPCs de liquidação (`liquidar_perna_surebet_v1`, `fn_recalc_pai_surebet`) — fase 2 separada.
- Modelo legado lay-no-nível-aposta (ValueBet/Punter/Freebets/ResultadoPill).
- Nenhum dado de teste lay no banco — validação com mock local.

## Aprovação

Confirmar para eu começar pela Prioridade 1 (hidratação central + helper), validar com mock, e seguir módulo por módulo.
