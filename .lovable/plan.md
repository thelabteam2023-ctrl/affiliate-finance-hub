# Auditoria Forense Fase 2: Sincronismo Financeiro (Ocorrência → Saldo)

## 1. Validação da Arquitetura V6
- **Introdução:** A V6 foi introduzida na migration `20260514171239` para centralizar a atualização de saldos em eventos financeiros (`financial_events`).
- **Comportamento Alterado:** Antes, o `cash_ledger` (via trigger `atualizar_saldo_bookmaker_v5`) atualizava o saldo diretamente. Agora, o trigger `atualizar_saldo_bookmaker_v6` marca transações como `V6_AUDIT_ONLY`, delegando o impacto real ao trigger `fn_financial_events_sync_balance`.
- **Cadeia de Sincronização:**
  `Lançamento (Aposta/Transação) -> financial_events -> fn_financial_events_sync_balance -> bookmakers.saldo_atual`.
- **Comprovação:** O `cash_ledger` para `PERDA_OPERACIONAL` apenas registra a auditoria. Como as ocorrências não inserem em `financial_events`, o saldo não é atualizado.

## 2. Investigação: Por que Ocorrências não geram Financial Events?
- **Quem cria:** No sistema atual, `financial_events` são criados principalmente via triggers de apostas (`apostas_unificada`, `apostas_pernas`) ou via RPCs específicas de liquidação.
- **Módulo de Ocorrências:** O fluxo em `src/hooks/useOcorrencias.ts` (função `useResolverOcorrenciaComFinanceiro`) utiliza o `ledgerService.ts`, que insere em `cash_ledger`. Ele **não possui** lógica para inserir em `financial_events`.
- **Lacuna:** O módulo de ocorrências foi mantido na lógica de "Legado Ledger" (v4/v5) e não foi migrado para a arquitetura de eventos (V6).

## 3. Mapeamento de Responsabilidades

| Entidade | Responsabilidade | Fonte de Verdade? | É derivada? |
| :--- | :--- | :--- | :--- |
| **ocorrencias** | Registro operacional da disputa/incidente | Sim (Operacional) | Não |
| **projeto_perdas** | Impacto de lucro no KPI do projeto | Sim (KPI) | Sim (de Ocorrência) |
| **cash_ledger** | Auditoria e histórico de movimentação | Sim (Auditoria) | Não |
| **financial_events** | **Fato Financeiro Canônico** (Sincroniza Saldo) | Sim (Financeiro) | Não |
| **saldo_atual** | Representação do capital disponível | Sim (Persistido) | Sim (de Financial Events) |

## 4. O Caso Lucas Pereira (Sman 365 - R$ 1.422,44)
- **occorrencia_id:** `[A pesquisar via RPC/Logs]`
- **projeto_perda_id:** `[A pesquisar via RPC/Logs]`
- **cash_ledger_id:** `[A pesquisar via RPC/Logs]` (Tipo: PERDA_OPERACIONAL)
- **financial_event_id:** **NÃO EXISTE** (Causa raiz do saldo incorreto)
- **bookmaker_id:** Sman 365
- **projeto_id:** Lucas Pereira

## 5. Diagnóstico da Evolução do Lucro e Patrimônio
- **Gráfico de Evolução:** A query em `src/hooks/useProjetoDashboardData.ts` (RPC `get_projeto_dashboard_data`) consolida dados de `projeto_perdas`. Por isso o gráfico **mostra** a perda, mas o **Patrimônio Total** (que soma os saldos das casas) está **inflado**, pois o saldo da Sman 365 não caiu.

## 6. Arquitetura Proposta (Anti-Duplicidade)
A solução canônica deve ser:
1. **Ocorrência resolvida** -> Gera **UM** `financial_event` do tipo `LOSS`.
2. O trigger `fn_financial_events_sync_balance` atualiza o **Saldo**.
3. O **KPI** de lucro operacional deve passar a ler débitos de `financial_events` (tipo LOSS) em vez de `projeto_perdas`, ou `projeto_perdas` deve ser transformado em uma "view" de eventos de perda para evitar dupla contagem.

## 7. Estratégia de Idempotência e Reversão
- **Idempotência:** Usar `id_ocorrencia` como `referencia_id` no `financial_events` com uma constraint de unicidade.
- **Reversão:** Inserir um novo evento de `LOSS_REVERSAL` (positivo) em vez de apagar o original, mantendo a trilha de auditoria contábil.

---
**PRÓXIMO PASSO:** Após aprovação deste diagnóstico, realizarei a extração dos IDs reais do caso Lucas Pereira para o relatório final antes da implementação.
