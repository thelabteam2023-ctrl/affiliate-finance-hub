# Diagnóstico Forense — Ajuste de Saldo em Vínculos

## 1. Diagnóstico
Foi identificada uma regressão funcional no fluxo de **Ajuste de Saldo** (Projetos → Vínculos → Casas). O ajuste é registrado no Ledger (`cash_ledger`), mas não produz efeito no saldo real da bookmaker nem no patrimônio do projeto.

## 2. Causa Raiz
A implementação recente da **Arquitetura Financeira V6** (Event-Sourcing) centralizou a atualização de saldos na tabela `financial_events`. No entanto, o gatilho responsável por traduzir lançamentos do Ledger para Eventos Financeiros (`fn_cash_ledger_generate_financial_events`) **não contempla o tipo de transação `AJUSTE_SALDO`**.

Como o trigger legado de atualização direta (`atualizar_saldo_bookmaker_v6`) foi desativado (ou neutralizado para evitar dupla contagem) em favor do novo fluxo, os ajustes de saldo ficaram "órfãos": existem no extrato (Ledger), mas não impactam o saldo (que agora depende de `financial_events`).

## 3. Local Exato
- **Arquivo:** `supabase/migrations/20260812215255_bc3760c0-a4ce-4625-944d-5c49bcfac1b4.sql` (ou versão atual no DB).
- **Função:** `public.fn_cash_ledger_generate_financial_events()`.
- **Falha:** Ausência de um bloco `IF NEW.tipo_transacao = 'AJUSTE_SALDO' ...`.

## 4. Cadeia Causal
1. Usuário executa "Ajustar Saldo".
2. `AjusteSaldoDialog.tsx` chama `registrarAjusteViaLedger`.
3. Registro é inserido em `cash_ledger` com `tipo_transacao = 'AJUSTE_SALDO'`.
4. O trigger `fn_cash_ledger_generate_financial_events` ignora o tipo `AJUSTE_SALDO`.
5. Nenhum registro é criado em `financial_events`.
6. O saldo da bookmaker permanece inalterado, pois a engine V6 só reage a `financial_events`.

## 5. Evidências
- **ID de Exemplo:** `b276a924-90eb-4543-80ea-23244e0a958d` (Ajuste de R$ 760,77 no workspace do André).
- **Status no Ledger:** `financial_events_generated = true` (o trigger rodou e marcou como processado).
- **Busca em Financial Events:** `SELECT * FROM financial_events WHERE metadata->>'ledger_id' = 'b276a924...'` retorna **ZERO** resultados.
- **Divergência:** O saldo da Parimatch no workspace do André deveria ter sido reduzido em R$ 760,77, mas permanece inalterado.

## 6. Hipóteses Descartadas
- **Frontend:** O componente envia os dados corretamente para o `ledgerService`.
- **RLS/Permissões:** O registro no Ledger é criado com sucesso, indicando que o usuário tem permissão.
- **Ocorrências:** A nova implementação de ocorrências funciona bem, mas ao "limpar" o trigger de saldo para usar V6, esqueceu-se de mapear o Ajuste de Saldo.

## 7. Correção Proposta
Atualizar a função `fn_cash_ledger_generate_financial_events` para suportar o tipo `AJUSTE_SALDO`, mapeando-o para o evento `AJUSTE` na tabela `financial_events`.

### Plano de Ação:
1.  **Migração SQL:** Adicionar o bloco de processamento para `AJUSTE_SALDO` na função do trigger.
2.  **Sincronização Retroativa:** Identificar todos os `AJUSTE_SALDO` órfãos (como o do André) e gerar os `financial_events` correspondentes para normalizar os saldos atuais.

## 8. Testes de Regressão
- Validar ajuste positivo (ENTRADA).
- Validar ajuste negativo (SAIDA).
- Verificar se o saldo da bookmaker reflete a mudança após o ajuste.
- Confirmar que a nova funcionalidade de Perdas Operacionais continua operando sem interferência.
