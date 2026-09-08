---
name: Guard de saldo não-negativo em financial_events
description: Trigger fail-closed que impede débito acima do saldo da casa (real ou freebet), com escape via allow_negative
type: feature
---

`fn_guard_saldo_bookmaker_nao_negativo` (trigger BEFORE INSERT/UPDATE em `financial_events`)
é a única trava canônica contra saldo negativo de casa.

Regras:
- Ignora `event_scope = 'VIRTUAL'`, `allow_negative = true` e `tipo_evento` em (REVERSAL, ESTORNO, AJUSTE).
- Só avalia deltas negativos; faz `SELECT ... FOR UPDATE` na linha de `bookmakers` para serializar
  saques concorrentes na mesma casa.
- Compara contra `saldo_freebet` quando `tipo_uso = 'FREEBET'`, senão contra `saldo_atual`.
- Erro padronizado: `SALDO_INSUFICIENTE: <CASA> — <saldo real|freebet> disponível: X <moeda>, necessário: Y <moeda>.`

O frontend NUNCA é a trava. `CaixaTransacaoDialog` reconsulta o saldo real da casa no banco
(descontando saques PENDENTE) antes de gravar um SAQUE — a lista em memória não vale como validação.

`ConfirmarSaqueDialog` deve fazer MERGE de `auditoria_metadata` (nunca sobrescrever), para não
apagar marcas de `duplicidade_detectada`.

Detecção de duplicidade de saque (`fn_detect_duplicate_withdrawal`): janela de 7 dias sobre
`data_transacao` OU 24h sobre `created_at` (pega lançamento retroativo do mesmo dia operacional).
