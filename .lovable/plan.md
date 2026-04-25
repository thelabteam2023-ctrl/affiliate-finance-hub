Confirmação da causa

A hipótese está correta: o problema está ligado ao formato de entrada "aposta simples com mais de uma perna" usado dentro da aba Surebet.

Na auditoria do projeto atual encontrei este padrão:

```text
aposta_id: bdb146f6-42a3-4939-a785-6a0e1f871b19
forma_registro: SIMPLES
estrategia: SUREBET
pernas em apostas_pernas: 2
stake por perna: 100 + 100
STAKE no financial_events: 0
PAYOUT no financial_events: 200 + 200
status: LIQUIDADA
```

Isso explica exatamente a inflação: na liquidação entraram os payouts, mas a criação não debitou as stakes das duas pernas. O saldo fica +100 acima do correto em cada casa.

Também encontrei outro registro recente:

```text
aposta_id: fda04e39-3e44-460d-beff-71d8b3dcc64b
forma_registro: SIMPLES
estrategia: SUREBET
sem pernas normalizadas
STAKE: -100
PAYOUT: +200
```

Esse segundo caso não infla saldo, mas está semanticamente errado: uma Surebet não deve nascer como SIMPLES.

Plano de correção

1. Remover o caminho perigoso na aba Surebet
   - O `ApostaDialog` hoje força `forma_registro = SIMPLES` e ainda permite `activeTab="surebet"`.
   - Isso cria a combinação perigosa `SIMPLES + SUREBET`.
   - Vou bloquear esse caminho: dentro da aba Surebet, o botão/fluxo de criação e edição de operações com múltiplas entradas deve usar somente `SurebetDialog` e o motor atômico.

2. Migrar multi-entry do formulário simples para motor atômico quando houver mais de uma casa
   - Se o formulário simples tiver `additionalEntries.length > 0`, ele não poderá mais fazer:
     - insert direto em `apostas_unificada`
     - insert direto em `apostas_pernas`
     - liquidação posterior via `liquidarAposta` do pai
   - Ele deverá montar as pernas reais e chamar uma rotina canônica que usa `criar_surebet_atomica` quando a estratégia for Surebet ou quando estiver no contexto da aba Surebet.
   - Resultado esperado: cada perna gera seu próprio `STAKE` no ledger antes de qualquer payout.

3. Criar uma blindagem no serviço central de apostas
   - Reforçar `ApostaService.criarAposta` para tratar como arbitragem qualquer entrada que tenha:
     - `estrategia = SUREBET`, ou
     - `forma_registro = ARBITRAGEM`, ou
     - 2+ pernas em contexto surebet.
   - Isso impede que uma Surebet disfarçada de simples continue passando pelo caminho de aposta simples.

4. Adicionar guard no banco contra liquidação sem stake
   - Atualizar a RPC `liquidar_perna_surebet_v1` para verificar, antes de criar `PAYOUT`/`VOID_REFUND`, se existe `STAKE` ativo daquela aposta, casa e perna/valor.
   - Se não existir stake correspondente, a liquidação deve falhar com erro explícito, em vez de inflar saldo.
   - Essa proteção é indispensável porque UI sozinha não basta.

5. Adicionar trigger/validação contra `SIMPLES + SUREBET + múltiplas pernas`
   - Criar uma barreira no banco para impedir que uma aposta `estrategia='SUREBET'` seja mantida como `forma_registro='SIMPLES'` quando houver pernas normalizadas.
   - Para novas operações, Surebet multi-perna deve ser `ARBITRAGEM`.
   - Não vou alterar saldos históricos diretamente.

6. Corrigir o fluxo de edição
   - A edição de uma operação que já tem pernas não deve abrir `ApostaDialog` como se fosse aposta simples.
   - Deve abrir o fluxo de Surebet ou bloquear edição direta quando a operação estiver liquidada, usando os caminhos canônicos de reliquidação/exclusão.

7. Auditoria de dados afetados
   - Gerar uma consulta/lista de inconsistências no padrão:

```text
operações com apostas_pernas > 0
+ STAKE ativo = 0
+ PAYOUT/VOID_REFUND ativo > 0
```

   - Separar em categorias:
     - inflou saldo: payout sem stake
     - risco futuro: múltiplas pernas sem stake ainda pendente
     - erro semântico: SUREBET gravada como SIMPLES, mas com ledger equilibrado
   - Seguindo a política anti-retrofix, não farei ajuste em massa automático. Para casos já contaminados, a correção segura será por ajuste explícito controlado (`AJUSTE_SALDO`) após aprovação.

8. Testes e simulações obrigatórias
   - Criar Surebet com 2 pernas via SurebetDialog: deve gerar 2 `STAKE` imediatamente.
   - Liquidar as duas pernas GREEN: deve gerar 2 `PAYOUT`; saldo líquido por casa = +100 quando stake 100 odd 2.00.
   - Criar no formulário simples com entrada adicional dentro/fora da aba Surebet: não pode gerar operação sem stake por perna.
   - Tentar liquidar perna sem stake: deve falhar explicitamente.
   - Excluir operação pendente: deve reverter stakes.
   - Excluir operação liquidada: deve reverter stake + payout sem duplicar.
   - Validar atualização da Visão Geral e saldos sem F5.

Arquivos previstos

```text
src/components/projeto-detalhe/ApostaDialog.tsx
src/components/projeto-detalhe/ProjetoSurebetTab.tsx
src/services/aposta/ApostaService.ts
src/services/aposta/invariants.ts
supabase/migrations/... blindagem da RPC liquidar_perna_surebet_v1 e validações
src/utils/__tests__/... simulações multi-entry/surebet ledger
```

Resultado esperado

Depois da correção, o fluxo perigoso deixa de existir:

```text
ANTES
ApostaDialog na aba Surebet
-> forma_registro SIMPLES
-> cria pai direto
-> cria pernas direto
-> não cria STAKE por perna
-> liquidação cria PAYOUT
-> saldo inflado

DEPOIS
Surebet/multi-perna
-> criar_surebet_atomica
-> cria pai ARBITRAGEM
-> cria pernas
-> cria STAKE por perna
-> liquidação só cria PAYOUT se STAKE existir
-> saldo líquido correto
```

A correção não será apenas visual; será feita em três camadas: frontend, serviço central e banco de dados.