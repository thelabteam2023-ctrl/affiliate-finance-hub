Plano para corrigir a necessidade de F5 após salvar aposta simples, valendo também para Bônus e demais abas financeiras.

## Diagnóstico
O fluxo atual já invalida saldos e alguns KPIs, mas não cobre de forma centralizada as queries operacionais montadas nas abas, especialmente:
- `surebets-tab`, usada pela aba Operações/Surebet e também por apostas simples nesse contexto.
- queries de Bônus e análises associadas.
- `central-operacoes-data`, usada pela Central de Operações.
- algumas chaves com parâmetros adicionais de período/filtro, que precisam ser invalidadas por prefixo.

Por isso a mutação é salva no banco, mas a tela ativa pode continuar mostrando dados antigos até o F5.

## Implementação proposta

1. **Ampliar a invalidação canônica**
   - Atualizar `invalidateCanonicalCaches` para incluir as listas operacionais e módulos financeiros:
     - `surebets-tab`
     - `apostas`
     - `bonus`, `bonus-bets-summary`, `bonus-analytics`, `bonus-bets-juice`
     - `giros-gratis`, `giros-disponiveis`
     - `cashback-manual`
     - `central-operacoes-data`
     - saldos/vínculos relacionados quando aplicável
   - Usar invalidação por prefixo quando a query possui filtros extras, como período/data.

2. **Unificar o hook pós-mutação**
   - Expandir `useInvalidateProjectQueries`/`useInvalidateAfterMutation` para que qualquer ação financeira dispare:
     - KPIs canônicos.
     - saldos de bookmakers.
     - calendário/evolução de lucro.
     - lista da aba ativa.
     - Central de Operações.
     - módulos promocionais, incluindo Bônus.

3. **Corrigir o fluxo do `ApostaDialog`**
   - Após salvar, editar ou excluir aposta simples, aguardar a invalidação completa antes de fechar/retornar sucesso.
   - Trocar chamadas parciais (`invalidateSaldos` + `invalidateCanonicalCaches`) pelo fluxo unificado.
   - Manter as regras atuais de ledger/RPC intactas, sem mexer em saldo diretamente.

4. **Reforçar a aba `ProjetoSurebetTab`**
   - Ajustar `handleDataChange` para invalidar a query `surebets-tab` antes de chamar `refetchSurebets()`.
   - Garantir que operações simples, surebets e múltiplas entradas reapareçam/atualizem automaticamente sem F5.

5. **Cobrir a aba Bônus**
   - Garantir que criação, edição, vínculo/liquidação e ações de bônus invalidem os caches de bônus e também os caches globais que dependem deles:
     - saldos
     - lucro operacional
     - evolução/calendário
     - central de operações
     - cards/analytics de bônus

6. **Validação**
   - Rodar verificação TypeScript.
   - Conferir que a mudança é apenas de sincronização/cache, sem alteração em fórmulas financeiras, RPCs, ledger, saldo físico ou regras de conversão.

## Resultado esperado
Depois de salvar uma aposta simples, uma operação de bônus ou qualquer mutação financeira, a interface deve atualizar automaticamente em menos de 1 segundo, sem precisar usar F5, incluindo:
- aba Operações/Surebet;
- aba Bônus;
- Vínculos/saldos;
- KPIs da Visão Geral;
- calendário/evolução de lucro;
- Central de Operações.