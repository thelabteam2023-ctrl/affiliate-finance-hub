## Diagnóstico

Pelo print, o card mostra:
- Título: `0` (linha 1) + `1X2` (linha 2)
- Bullet: `• Futebol` + badge `SUREBET` + `1-2` + `Pendente`
- Pernas: ambas `@2.00` / `R$ 100,00` — sem prefixo `Lay`, sem `Resp:`, sem comissão.

Isto revela 3 falhas independentes:

### Bug 1 — Perna lay renderizada como back

`SurebetCard` já tem o branch `isLayPerna = perna.tipo === "lay"` (linha 311) e renderiza `Lay @odd`. O fato de não aparecer significa que **`perna.tipo` está chegando vazio/`"back"`** no card.

Causa provável: o loader da aba (Surebet/DuploGreen/Apostas/Bonus/ValueBet/Punter) que monta `pernasRaw` para o `SurebetCard` está lendo `apostas_pernas` mas:
- (a) não inclui `tipo`, `comissao`, `liability` no `select`, ou
- (b) inclui no `select` mas não copia esses campos no mapeamento para o objeto `SurebetPerna`.

Já corrigimos isso em `ProjetoDuploGreenTab.tsx`. Falta auditar as **outras 5 abas** (Surebet, Apostas, Bonus, ValueBet, Punter, Freebets) com o mesmo padrão.

Além disso, o valor exibido (`R$ 100,00` na perna lay em vez de `R$ 101,42`) indica que `stake_total` da perna lay não está sendo persistido com o valor da responsabilidade — provavelmente o motor está gravando `stake = stake informado (100)` em vez de `stake = liability (101.42)` na perna lay. Precisamos confirmar no payload da RPC.

### Bug 2 — Evento e mercado

O campo `evento` foi salvo literalmente como `"0"` e `mercado` como `"1X2"`. Olhando `SurebetCard` linha 1076/1089, o card já renderiza `surebet.evento` e `surebet.mercado` — o problema é **no momento do salvamento**: o `ProjetoDuploGreenTab` (e possivelmente outras abas) está enviando `evento: "0"` para a RPC, provavelmente porque está usando o valor errado do form (ex.: `score` / `linha` em vez de `evento`).

### Bug 3 — "0" sobre o campo Mercado no formulário

Sem reprodução visual confirmada. Investigar apenas após Bugs 1 e 2; se não reproduzir, pedir print focado.

---

## Plano de execução

### Etapa 1 — Auditoria de Lay-fields em todas as abas (Bug 1)

Para cada loader abaixo, garantir que o `select` de `apostas_pernas` inclui `tipo, comissao, liability, stake_total, odd_media, fonte_saldo` **e** que o mapeamento para `pernasRaw` copia esses campos:

```text
src/components/projeto-detalhe/
├── ProjetoSurebetTab.tsx       ← REFERÊNCIA (já funciona)
├── ProjetoDuploGreenTab.tsx    ← já corrigido na rodada anterior
├── ProjetoApostasTab.tsx       ← AUDITAR
├── ProjetoBonusTab.tsx         ← AUDITAR
├── ProjetoValueBetTab.tsx      ← AUDITAR
├── ProjetoPunterTab.tsx        ← AUDITAR
└── ProjetoFreebetsTab.tsx      ← AUDITAR
```

Para cada um:
1. Localizar `from("apostas_pernas").select(...)`.
2. Garantir colunas: `id, aposta_id, ordem, bookmaker_id, bookmaker_nome, selecao, odd, stake, stake_total, odd_media, moeda, tipo, comissao, liability, fonte_saldo, resultado, lucro_prejuizo, payout, ev_recebido, stake_consolidado, pl_consolidado, cotacao_snapshot`.
3. No mapeamento que monta `pernasRaw`, propagar `tipo: row.tipo, comissao: row.comissao, liability: row.liability`.

### Etapa 2 — Validar persistência da liability na perna lay

1. Abrir `SurebetModalRoot.handleSave` e seguir o payload de `pernas` enviado à RPC.
2. Confirmar: para perna `tipo='lay'`, o que vai em `apostas_pernas.stake_total`? Deve ser `liability` (101.42) — não o `stake` declarado (100). E `apostas_pernas.stake` deve guardar o stake nominal (100) para histórico.
3. Se incorreto, ajustar o build do payload em `surebetCurrencyEngine` / `SurebetModalRoot` (apenas presentation/payload, sem mexer em RPC).
4. Atualizar `SurebetCard` para a perna lay exibir `Resp: R$ X` usando `perna.liability ?? perna.stake_total` em vez de `perna.stake`.

### Etapa 3 — Evento/Mercado salvos errados (Bug 2)

1. No `ProjetoDuploGreenTab` (e demais abas afetadas), procurar o `handleSave` / `mutate` que chama a RPC de criação de surebet/aposta.
2. Verificar quais campos do form são lidos como `evento` e `mercado`. Provavelmente está sendo passado `placar`/`score`/`linha` no slot de `evento`.
3. Padronizar para usar exatamente `formData.evento` e `formData.mercado` (mesmo nome usado no `ProjetoSurebetTab`).
4. Confirmar via Network tab que o payload da RPC contém os strings corretos antes/depois do fix.

### Etapa 4 — Bug 3 (investigativo)

1. Reproduzir cenário (2 pernas, perna 2 lay 2.00 com 2.8% comissão) com DevTools aberto.
2. Inspecionar área do header buscando elementos numéricos órfãos (badges, contadores de debug).
3. Se nada for visto, **não chutar** — relatar ao usuário e pedir print com zoom.

### Etapa 5 — Validação visual

1. Após Etapas 1–3, criar nova surebet via DuploGreen com o mesmo cenário do print.
2. Confirmar no card:
   - Título = evento real (ex.: `Flamengo x Vasco`), subtítulo = `1X2` ou mercado real.
   - Perna 1: `@2.00 — R$ 100,00`.
   - Perna 2: `Lay @2.00 — Resp: R$ 101,42` (com cor distinta).
3. Screenshot antes/depois.

---

## Arquivos prováveis a alterar

- `src/components/projeto-detalhe/ProjetoApostasTab.tsx`
- `src/components/projeto-detalhe/ProjetoBonusTab.tsx`
- `src/components/projeto-detalhe/ProjetoValueBetTab.tsx`
- `src/components/projeto-detalhe/ProjetoPunterTab.tsx`
- `src/components/projeto-detalhe/ProjetoFreebetsTab.tsx`
- `src/components/projeto-detalhe/ProjetoDuploGreenTab.tsx` (mapping de evento/mercado)
- `src/components/projeto-detalhe/SurebetCard.tsx` (exibir `Resp:` quando lay + usar `liability ?? stake_total`)
- `src/components/surebet/SurebetModalRoot.tsx` (payload: gravar liability em `stake_total` da perna lay; corrigir slots de evento/mercado se necessário)

## Não-objetivos

- Não tocar em RPCs/triggers (anti-retrofix).
- Não recalcular nada client-side (Surebet P&L Determinism).
- Não introduzir UPDATEs em `saldo_atual` / `saldo_freebet`.

## Critério de aceite

- Card AXB do print exibe `Lay @2.00` (cor distinta) com `Resp: R$ 101,42` para a perna 2.
- Título do card mostra evento e mercado reais (não `0` / `1X2` literal).
- Nenhuma regressão em abas Surebet/Apostas/Bonus/ValueBet/Punter/Freebets.
