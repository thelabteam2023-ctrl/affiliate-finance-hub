# Auditoria Forense: Classificação "Despesa Externa" no Caixa Operacional

## Diagnóstico
O problema relatado (depósitos em bookmakers sendo classificados como "Despesa Externa") ocorre devido a uma falha na lógica de resolução de labels no componente `HistoricoMovimentacoes.tsx` e `Caixa.tsx`.

### Causa Raiz
No arquivo `src/pages/Caixa.tsx`, a função `getDestinoInfo` (linhas 1200-1202) retorna `"Despesa Externa"` como fallback sempre que o campo `destino_tipo` da transação está vazio no banco de dados.

A investigação no banco revelou que:
1.  Existem **667 registros** onde `destino_bookmaker_id` está preenchido, mas `destino_tipo` está nulo ou vazio.
2.  Muitos desses registros são `BONUS_CREDITADO`, `GANHO_CAMBIAL` ou `DEPOSITO` restaurados de auditoria.
3.  Mesmo quando o `tipo_transacao` é `DEPOSITO`, se o `destino_tipo` falhar, a UI rotula como "Despesa Externa".

## Plano de Ação

### 1. Blindagem da UI (Frontend)
Alterar a lógica de resolução de labels para priorizar a existência do ID da entidade (`destino_bookmaker_id`, `origem_wallet_id`, etc.) em vez de confiar apenas no enum `destino_tipo`, que pode estar inconsistente em registros legados ou restaurados.

### 2. Correção de Dados (Banco)
Executar uma migração de dados para normalizar os campos `origem_tipo` e `destino_tipo` baseando-se nos IDs presentes. Isso garante integridade para qualquer nova ferramenta que consuma o ledger.

### 3. Blindagem do Gatilho V6 (Backend)
Atualizar o trigger para garantir que, ao processar `TRANSFERENCIA` (que hoje é uma lacuna), ele identifique corretamente o movimento patrimonial.

## Detalhes Técnicos
- **Arquivo:** `src/pages/Caixa.tsx`
- **Funções:** `getOrigemInfo` e `getDestinoInfo`.
- **Lógica:** Se `destino_bookmaker_id` existe, a info deve ser da Bookmaker, independente do `destino_tipo`.

---
**Status:** Pronto para execução.
