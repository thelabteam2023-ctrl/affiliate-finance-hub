# Plano: Correção Forense de Classificação Econômica no Caixa

## 1. Frontend: Blindagem de Labels
Refatorar as funções de resolução de nomes no `Caixa.tsx` para serem baseadas em evidência de ID, não apenas em tags de tipo.

- **getOrigemInfo/getDestinoInfo**: Se houver um ID de bookmaker/wallet/conta, usar esse objeto para o label, mesmo que a coluna `origem_tipo` esteja vazia.
- **Fallback**: Mudar o fallback de "Despesa Externa" para algo mais neutro ou derivado do `tipo_transacao` se não houver destino identificado.

## 2. Banco: Normalização de Metadados
Migration para preencher `origem_tipo` e `destino_tipo` onde estão nulos mas os IDs correspondentes existem.

```sql
UPDATE cash_ledger 
SET destino_tipo = 'BOOKMAKER' 
WHERE destino_bookmaker_id IS NOT NULL AND (destino_tipo IS NULL OR destino_tipo = '');
```

## 3. Backend: Expansão da Cobertura V6
Atualizar o trigger `fn_cash_ledger_generate_financial_events` para cobrir os tipos faltantes:
- `TRANSFERENCIA`: Quando uma ponta for Bookmaker.
- `PERDA_ATIVO`: Mapear como `LOSS` no patrimônio.
- `APORTE_FINANCEIRO` (Aporte Direto): Garantir que o aporte em BK gere evento.

## 4. Validação
- Testar no preview um depósito em bookmaker e verificar o label no histórico.
- Validar via psql se os tipos foram normalizados.
