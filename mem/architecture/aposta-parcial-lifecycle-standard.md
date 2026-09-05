---
name: Aposta parcialmente liquidada continua ABERTA
description: Regra canônica de ciclo de vida — aposta só é concluída quando 100% das pernas estão resolvidas; nunca gravar status PARCIAL nem resultado 'PENDENTE'
type: feature
---

# Ciclo de vida da operação

Uma aposta (simples, múltipla ou surebet) só é **concluída** quando **todas** as pernas
têm resultado. Enquanto houver perna pendente:

- Banco: `status = 'PENDENTE'` e `resultado = NULL`.
  PROIBIDO gravar `status = 'PARCIAL'` ou a string `resultado = 'PENDENTE'` —
  era isso que jogava a aposta para o Histórico (`liquidar_perna_surebet_v1`, corrigido).
- `deletar_perna_surebet_v1` fecha o pai (`LIQUIDADA` + resultado final) só quando,
  após a exclusão, todas as pernas restantes estão resolvidas.

# Frontend

Toda separação Abertas × Histórico, contadores e KPIs usam o helper único
`src/utils/operacaoLifecycle.ts`:

- `isOperacaoAberta(op)` — `!resultado || resultado === 'PENDENTE' || status ∈ {PENDENTE, PARCIAL}`
- `isOperacaoConcluida(op)` — inverso
- `getProgressoPernas(pernas)` — alimenta o selo "Parcial (x/y)" no `ApostaCard`

PROIBIDO reintroduzir regras locais de aberto/histórico nas abas.
