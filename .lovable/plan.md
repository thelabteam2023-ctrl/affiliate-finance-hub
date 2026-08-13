# Plano de Correção: Ajuste de Saldo (Vínculos) - Arquitetura V6

O diagnóstico confirmou que o tipo de transação `AJUSTE_SALDO` não foi incluído na transição para a arquitetura de eventos financeiros V6, resultando em ajustes que não atualizam o saldo das casas.

## 1. Correção de Infraestrutura (Backend)
Atualizar o gatilho `fn_cash_ledger_generate_financial_events` para processar `AJUSTE_SALDO` da mesma forma que `AJUSTE_MANUAL`.

### Mudanças Técnicas:
- Alterar o bloco de `AJUSTE_MANUAL` para incluir `AJUSTE_SALDO` na condição `IF`.
- Garantir que a idempotência use um prefixo específico para evitar colisões.

## 2. Remediação de Dados (Forense)
Executar uma varredura retroativa na tabela `cash_ledger` para encontrar registros de `AJUSTE_SALDO` que foram marcados como processados (`financial_events_generated = true`), mas que não geraram registros na tabela `financial_events`.

### Ações:
- Identificar registros órfãos.
- Inserir os eventos financeiros faltantes.
- Recalcular o saldo das bookmakers afetadas (automático via trigger de `financial_events`).

## 3. Validação
- **Caso André (Parimatch):** Confirmar se o débito de R$ 760,77 foi aplicado ao saldo real após a migração.
- **Teste de Novo Ajuste:** Realizar um ajuste de centavos em um workspace de teste e verificar a propagação imediata para o patrimônio.

## Detalhes Técnicos (Para aprovação)

```sql
-- Resumo da lógica a ser aplicada:
IF NEW.tipo_transacao IN ('AJUSTE_MANUAL', 'AJUSTE_SALDO') THEN
    -- ... lógica de roteamento de ENTRADA/SAIDA ...
END IF;
```

O impacto visual será a normalização imediata dos saldos na aba "Vínculos" e no Dashboard para todos os ajustes realizados nos últimos dias.
