# Plano de Auditoria Forense Completa: Caixa Operacional (Origem vs. Destino V6)

Investigação sistêmica para identificar por que depósitos em bookmakers estão sendo classificados como "Despesa Externa" no histórico do Caixa Operacional, especialmente em operações multimoeda/crypto.

## 1. Diagnóstico e Investigação do Caso André
- **Reconstrução do Fluxo**: Localizar o lançamento no workspace afetado (André/Tiago) via `financial_events` e `cash_ledger`.
- **Mapeamento de Dados**: Extrair `origem_tipo`, `destino_tipo`, `finalidade`, `tipo_uso`, `moeda` e metadados.
- **Ponto de Ruptura**: Identificar se a classificação errônea ocorre na persistência do evento (Trigger V6) ou na projeção de leitura do histórico.

## 2. Auditoria de Regressão Sistêmica
- **Histórico de Código**: Analisar alterações recentes no gatilho `fn_cash_ledger_generate_financial_events` e na RPC `get_caixa_historico`.
- **Conflito de Lógica**: Verificar se condicionais de `tipoMoeda === 'CRYPTO'` ou mapeamento de `investidor` estão sobrescrevendo a natureza econômica de `DEPÓSITO`.
- **Origem vs. Destino**: Validar se o sistema está inferindo "Despesa" apenas porque a origem é uma Wallet externa, ignorando o destino `BOOKMAKER`.

## 3. Correção na Camada de Classificação (SSOT)
- **Blindagem do Gatilho**: Garantir que `financial_events` receba a classificação correta baseada no par (Origem, Destino, Finalidade).
- **Padronização do Histórico**: Atualizar a lógica de exibição para usar a taxonomia canônica da transação, não inferências voláteis da UI.
- **Tratamento Multimoeda**: Assegurar que conversões cambiais não alterem o tipo do evento.

## 4. Validação e Matriz de Testes
- **Matriz de Cobertura**:
  - `Wallet USDT -> Bookmaker USD` (Deve ser DEPÓSITO)
  - `Investidor BRL -> Bookmaker USD` (Deve ser DEPÓSITO)
  - `Caixa -> Despesa Externa` (Deve ser DESPESA)
  - `Reversão de Depósito Crypto` (Deve ser REVERSÃO)
- **Auditoria de Dados Históricos**: Identificar outros registros afetados pela regressão para eventual backfill/reprocessamento.

## Detalhes Técnicos
- **Trigger**: `supabase/migrations/..._fn_cash_ledger_generate_financial_events.sql`
- **RPC Histórico**: `get_caixa_historico` ou `fetch_caixa_transactions`.
- **Invariante**: Se `destino_tipo === 'BOOKMAKER'`, a operação é obrigatoriamente um Depósito (ou Reversão de Saque).
