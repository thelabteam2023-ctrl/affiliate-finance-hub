# Memory: analytics/withdrawal-lead-time-metric-implementation
Updated: 2026-02-05

## Implementação de Métricas de Tempo de Saque

### Modelo de Dados

| Campo | Descrição | Preenchimento |
|-------|-----------|---------------|
| `data_transacao` | Data da **solicitação** do saque | Usuário (no formulário de saque) |
| `data_confirmacao` | Data do **recebimento** real | Usuário (na conciliação) |
| `created_at` | Timestamp de criação do registro | Automático |

### Cálculo de Métricas

```sql
-- Tempo médio de saque por bookmaker
SELECT 
  origem_bookmaker_id,
  AVG(EXTRACT(DAY FROM (data_confirmacao - data_transacao))) as dias_medios
FROM cash_ledger
WHERE tipo_transacao = 'SAQUE'
  AND status = 'CONFIRMADO'
  AND data_confirmacao IS NOT NULL
GROUP BY origem_bookmaker_id
```

### Fluxo UI

1. **Solicitação de Saque** (`CaixaTransacaoDialog`):
   - `data_transacao` = data informada pelo usuário (pode ser retroativa)

2. **Confirmação de Saque** (`ConfirmarSaqueDialog`):
   - Campo "Data de Recebimento" adicionado
   - Default = hoje
   - Permite lançamento retroativo (ex: recebido em 22/02 mas registrando agora)
   - Salvo em `data_confirmacao`

### Regra de Negócio

> "Métricas de tempo de saque são calculadas exclusivamente a partir de datas informadas pelo usuário,
> nunca de timestamps automáticos do sistema."

Isso permite:
- Lançamentos retroativos precisos
- Métricas confiáveis mesmo com atrasos no registro
- Auditoria temporal correta
