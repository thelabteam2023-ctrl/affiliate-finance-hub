# Plano: Auditoria e Blindagem da Arquitetura Financeira V6 (Fase de Execução)

A auditoria confirmou que as três operações principais (**Ajuste Manual**, **Reconciliação** e **Reportar Scan**) estão integradas à V6 para bookmakers, mas identificou lacunas em tipos secundários que podem causar "vazamentos" de saldo. Este plano foca na blindagem dessas lacunas.

### 1. Blindagem do Gatilho V6 (`fn_cash_ledger_generate_financial_events`)

Precisamos estender o trigger para cobrir os tipos identificados na auditoria:
- **`PERDA_ATIVO`**: Quando uma perda de ativo (ex: erro de rede) ocorre em uma bookmaker, ela deve abater o saldo operacional.
- **`TRANSFERENCIA`**: Atualmente, transferências envolvendo bookmakers (BK -> Wallet, Conta -> BK) não estão gerando eventos financeiros na V6, o que causa divergência no patrimônio.
- **`APORTE_FINANCEIRO`**: Aportes diretos em bookmakers (Broker) precisam ser capturados pela V6.

### 2. Remediação Histórica

Após atualizar o trigger, realizaremos uma varredura para identificar registros destes tipos que ficaram "órfãos" (sem `financial_event`) desde a implantação da V6 e geraremos os eventos retroativos para restaurar a paridade do patrimônio.

### 3. Padronização de Idempotência

Consolidar o padrão de chaves de idempotência para evitar duplicidade em futuras manutenções.

## Detalhes Técnicos

### Arquivos e Tabelas
- **Trigger**: `fn_cash_ledger_generate_financial_events`
- **Tabelas**: `public.cash_ledger`, `public.financial_events`, `public.bookmaker_balance_audit`

### Alterações no SQL (Migration)
- Adicionar bloco para `PERDA_ATIVO` (mapeando para tipo_evento `LOSS`).
- Adicionar blocos para `TRANSFERENCIA` (detectando se a origem ou o destino é uma bookmaker e gerando débito/crédito correspondente).
- Adicionar bloco para `APORTE_FINANCEIRO` (mapeando para tipo_evento `DEPOSITO`).

### Validação
- Testar transferência BK -> Conta e confirmar abate no saldo da BK.
- Testar Reportar Perda de Ativo na BK e confirmar atualização do patrimônio.
- Verificar logs de auditoria de saldo.
