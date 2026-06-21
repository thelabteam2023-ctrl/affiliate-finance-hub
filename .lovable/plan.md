# Plano de Melhorias — Ledger LAY + Edição de Apostas Resolvidas

Dois problemas independentes foram diagnosticados. O plano os ataca em fases isoladas, cada uma com valor próprio. Cada fase é reversível e pode ser pausada entre elas.

---

## Fase 1 — Ledger correto para pernas LAY (risco real = liability)

### Objetivo
Fazer o débito no `financial_events` refletir a **responsabilidade** (liability) da perna LAY, não o stake. Incluir comissão da exchange no payout do GREEN.

### O que muda no negócio
- Perna BACK: continua debitando `stake` (sem mudança).
- Perna LAY: passa a debitar `stake × (odd − 1)` (liability).
- GREEN em LAY: payout = `stake × (1 − comissao)` (devolve a liability bloqueada + ganho líquido de comissão).
- RED em LAY: nenhum payout (liability já foi consumida — comportamento atual já correto na ausência de payout).
- VOID em LAY: devolve a liability inteira (`stake × (odd − 1)`).

### Mudanças técnicas
1. **Banco — `criar_surebet_atomica`**
   - Ler `tipo` e `comissao` do JSON da perna.
   - Calcular `v_valor_debito = CASE WHEN tipo='lay' THEN stake*(odd-1) ELSE stake END`.
   - Persistir `tipo` e `comissao` em `apostas_pernas` e em `apostas_perna_entradas`.
   - Idempotency key ganha sufixo `_lay` quando aplicável para evitar colisão com lançamentos antigos.

2. **Banco — `liquidar_perna_surebet_v1` (e `liquidar_aposta_v4` no caminho LAY)**
   - GREEN LAY: emitir `PAYOUT` = `liability + (stake × (1 − comissao))` (devolve risco + lucro líquido).
   - VOID LAY: emitir `VOID_REFUND` = `liability`.
   - RED LAY: sem evento (liability já consumida).
   - `lucro_prejuizo` da perna recalculado conforme regras acima.

3. **Frontend — `ApostaService.criarAposta` / `useSurebetService`**
   - Propagar `tipo` e `comissao` no payload da RPC (`PernaInput` → JSON).
   - `surebetBalanceValidator` passa a validar contra liability quando `tipo='lay'`.

4. **Backfill — não fazer**
   Política anti-retrofix vigente. Apostas LAY anteriores ficam com débito antigo; correção só para novos lançamentos. Documentar em memória.

### Validação
- Caso de teste: BACK R$ 100 odd 2,00 + LAY R$ 96,53 odd 2,10 comissão 2,8%.
  - Ledger esperado: −100,00 (BACK) e −106,18 (LAY).
- GREEN no LAY: payout esperado = 106,18 + (96,53 × 0,972) = **+200,00** (≈ devolução completa).
- GREEN no BACK: payout segue a regra atual (stake × odd = 200).
- Verificar `pl_consolidado` do pai pela RPC `fn_recalc_pai_surebet`.

---

## Fase 2 — Edição segura de aposta LIQUIDADA

### Objetivo
Eliminar saldo fantasma e dessincronização de snapshots quando o usuário edita uma aposta já resolvida.

### Mudanças técnicas

1. **Plugar a RPC correta**
   - `ApostaService.atualizarAposta` passa a detectar `status='LIQUIDADA'` e rotear para a RPC `editar_aposta_liquidada_v4` (que hoje está órfã) em vez de fazer `UPDATE` direto.
   - `UPDATE` direto fica restrito a campos não-financeiros (evento, esporte, mercado, modelo, observações).

2. **Refatorar `editar_aposta_liquidada_v4` para REVERSAL + relançamento**
   - Trocar o `AJUSTE` líquido único por: **REVERSAL** de todos os eventos da aposta no(s) bookmaker(s) afetado(s), seguido de **STAKE + PAYOUT** novos com o estado pós-edição.
   - Mantém auditoria 1:1 (cada evento antigo tem seu reverso explícito).
   - Cobrir também o caminho LAY introduzido na Fase 1 (liability + comissão).

3. **Recalcular snapshots na edição**
   - Atualizar `lucro_realizado`, `roi_realizado`, `pl_consolidado`, `valor_retorno`, `roi_real` na mesma transação.
   - Disparar `fn_recalc_pai_surebet` quando for perna de surebet.

4. **Guard na UI**
   - Modal de edição passa a exibir aviso quando `status='LIQUIDADA'`:
     "Esta aposta já foi resolvida. A edição irá reverter os lançamentos financeiros e gerar novos. Deseja continuar?"
   - Confirmação dupla (segundo clique) antes do submit.
   - Botão de edição em apostas resolvidas ganha ícone de alerta.

5. **Bloqueio explícito de campos perigosos**
   - `bookmaker_id` em aposta resolvida só pode ser editado se não houver eventos derivados (cashback, freebet gerada, etc.). Caso contrário, exigir deleção + recriação.

### Validação
- Editar odd de GREEN: ledger ganha 2 eventos (REVERSAL do PAYOUT antigo + PAYOUT novo). Saldo da bookmaker permanece coerente com `pl_consolidado` recalculado.
- Editar stake de RED: REVERSAL do STAKE antigo + STAKE novo. Saldo bate.
- Snapshots `lucro_realizado` / `roi_realizado` refletem novos valores imediatamente.
- View `v_financial_audit` continua sem divergências após edição.

---

## Fase 3 — Observabilidade e prevenção

1. **Probe de integridade pós-edição**
   - Estender `src/utils/integrityProbe.ts` para validar, após cada edição/liquidação, que `SUM(financial_events.valor) por bookmaker = bookmaker.saldo_atual`.
   - Alerta no console (e no `__INTEGRITY_LOG__`) quando divergir.

2. **Teste automatizado**
   - `surebetLayEqualization.test.ts` ganha cenário com comissão e liability > stake.
   - Novo `editarApostaLiquidada.test.ts`: cobre GREEN→RED, mudança de stake/odd, troca de bookmaker.

3. **Memória do projeto**
   - Registrar:
     - `mem://finance/lay-liability-as-ledger-debit-standard` (Fase 1)
     - `mem://architecture/editar-aposta-liquidada-reversal-standard` (Fase 2)
     - `mem://finance/snapshot-recalc-on-edit-standard` (Fase 3)

---

## Ordem de execução sugerida

1. Fase 1 isolada → validar com novo trade real e log de integridade.
2. Fase 2 isolada → validar editando uma aposta legada simples (BACK GREEN → RED).
3. Fase 2 + LAY combinado → editar uma aposta LAY criada já na Fase 1.
4. Fase 3 (observabilidade + testes + memória).

Cada fase entra em uma migration separada para revisão independente.

---

## Fora de escopo (explícito)

- **Backfill de apostas LAY antigas**: política anti-retrofix.
- **Mudança visual da perna LAY**: já resolvido (`Lay @odd` em vermelho + `Resp`).
- **Recalcular `pl_consolidado` de surebets pai antigas**: só novos lançamentos.
- **Adicionar comissão em perna BACK**: bookmakers tradicionais não cobram comissão sobre lucro; manter como está.

---

## Pergunta antes de implementar

Confirma esta ordem (Fase 1 → 2 → 3 em migrations separadas), ou prefere começar pela Fase 2 (edição segura) primeiro, já que afeta TODAS as apostas e não só LAY?
