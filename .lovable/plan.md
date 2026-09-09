# Erro ao editar arbitragem: "operator does not exist: event_scope = text"

## O que está acontecendo (confirmado no banco)

A trava de saldo negativo que instalamos criou um efeito colateral. Dentro dela há uma
comparação entre o campo "escopo do lançamento" (que é um tipo próprio do banco) e um
texto comum. Essa comparação só é executada quando um lançamento financeiro **já
existente é alterado** — exatamente o que acontece ao editar uma arbitragem (mudar casa,
odd, stake) ou reliquidar.

Por isso:
- Criar aposta nova funciona (caminho de inserção não passa por essa linha).
- Editar/salvar arbitragem quebra com "operator does not exist: event_scope = text".

Verificado: o campo `event_scope` de `financial_events` é um tipo enumerado; a trava
`fn_guard_saldo_bookmaker_nao_negativo` compara `COALESCE(OLD.event_scope,'REAL')` com
uma variável declarada como texto. As demais rotinas que usam esse campo comparam com
literais e não têm o problema.

A queixa de "saldo não reconhecido na edição pré-liquidação" ainda **não está
diagnosticada** — provavelmente é o mesmo erro aparecendo como falha genérica, mas isso
será confirmado nos testes antes de qualquer mudança adicional.

## Correção

1. Corrigir a trava para comparar sempre em texto (`::text` nas leituras de
   `OLD.event_scope`/`NEW.event_scope`), sem alterar nenhuma regra de negócio da trava.
2. Rodar uma varredura em todas as rotinas do banco procurando o mesmo padrão de
   comparação entre tipo enumerado e variável de texto, e corrigir se houver outras.
3. Testar diretamente no banco, com uma aposta de arbitragem real, os fluxos:
   - editar antes da liquidação (casa, odd, stake, várias pernas, várias entradas);
   - editar depois da liquidação (recálculo de saldo e lucro);
   - trocar a casa entre parceiros diferentes (caso Sônia → Luiz, SMAN365);
   - reliquidar e reverter.
   Conferindo em cada caso: sem erro de SQL, sem lançamento duplicado, saldo da casa
   igual à soma dos lançamentos.
4. Se o teste da edição pré-liquidação mostrar validação de saldo indevida (estorno
   temporário sendo barrado pela trava), tratar como item separado com diagnóstico
   próprio antes de mexer.
5. Teste de regressão automatizado cobrindo edição de aposta liquidada com troca de
   casa, para essa quebra não voltar.

## O que não muda

A regra de saldo não-negativo continua em vigor com o mesmo comportamento: débito
que jogue a casa para o vermelho é recusado; casas já negativas aceitam correção para
cima; estornos, reversões e ajustes seguem liberados. As 255 casas negativas antigas
permanecem intocadas.

## Detalhes técnicos

- Migração recriando `fn_guard_saldo_bookmaker_nao_negativo()` com
  `v_scope := COALESCE(NEW.event_scope::text, 'REAL')` e
  `COALESCE(OLD.event_scope::text,'REAL') IS DISTINCT FROM v_scope`.
- Varredura: `pg_get_functiondef` de todas as funções do schema `public` cruzada com
  colunas de tipo enumerado (`event_scope`, `app_role`, `ocorrencia_*`,
  `announcement_*`, `parceria_status`, etc.) procurando comparação com variável `TEXT`.
- Testes de banco em `supabase/tests/triggers/` (novo arquivo
  `08_edit_surebet_guard_saldo.sql`) e teste unitário do parser de erro em
  `src/lib/__tests__/saldoGuard.test.ts`.
