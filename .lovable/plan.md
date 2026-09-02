# Ocorrência marcada como "bookmaker desvinculada" — causa raiz e correção

## Evidência no banco (caso real)

Ocorrência localizada: "SUSPENSÃO DA CONTA POR 30 DIAS", workspace `41718476…` (LabBet), criada em 30/07/2026.

```text
ocorrencia.id          = 8b3c55ff-a78b-47d6-8a05-f43d43ca659c
ocorrencia.projeto_id  = NULL          <-- ponto central
ocorrencia.status      = em_andamento
ocorrencia.valor_risco = 6000,00 BRL
bookmaker              = 1XBET (c9b5dbc3…)  parceiro = LUIZ FELIPE DE OLIVEIRA ARAUJO
bookmaker.projeto_id   = 0df88284-5807-4b94-b767-1a3cc794d388  (vinculada, status ativo)
bookmaker.saldo_atual  = 6000,00 BRL
```

A 1xBet **nunca foi desvinculada**: o vínculo com o projeto existe e está ativo, e a casa e a ocorrência estão no mesmo workspace. Não há registro de perda: nenhuma linha em `cash_ledger`, `projeto_perdas` ou `financial_events` referenciando esta ocorrência, e `perda_registrada_ledger = false`. Ou seja, hoje não existe dupla contagem nem perda contabilizada — o saldo de 6.000 está íntegro.

Não há relação com a exportação/importação de parceiros: não existe bookmaker 1xBet duplicada para esse parceiro, o `workspace_id` é o mesmo em ocorrência e casa, e nenhuma ocorrência do sistema aponta para projeto diferente do da casa.

## Causa raiz

A ocorrência foi criada fora do contexto de um projeto. Em `NovaOcorrenciaDialog.tsx` o campo `projeto_id` só é preenchido a partir de `contextoInicial?.projeto_id`; quando a ocorrência nasce pela tela geral de Ocorrências (sem projeto no contexto), grava-se `projeto_id = NULL`, mesmo com a casa vinculada a um projeto.

Em seguida, `ResolucaoFinanceiraDialog.tsx` decide o aviso com igualdade estrita:

```text
setBookmakerDesvinculada(bk.projeto_id !== projeto_id)   // 0df88284… !== null  => true
```

Logo, "desvinculada" é uma **conclusão falsa derivada de `projeto_id` nulo**, não de uma desvinculação real.

## Impacto — divergência entre as três rotas

O backend do hook `useOcorrencias.ts` já trata o caso nulo em **uma** das rotas, mas não nas outras:

| Rota | Linha | Regra atual | Efeito com `projeto_id` NULL |
|---|---|---|---|
| Resolver (débito) | 721-723 | `projeto_id ? igualdade : !!bk.projeto_id` | debita o saldo (correto) |
| Reabrir (estorno) | 866 | igualdade estrita | **não credita de volta** |
| Cancelar (estorno) | 435 | igualdade estrita | **não credita de volta** |

Consequência: numa ocorrência sem `projeto_id`, resolver debita 6.000 da casa, mas reabrir ou cancelar não devolve — o saldo fica permanentemente menor que o real. É assimetria financeira, não só um aviso visual. Além disso o dialog desliga a trava de saldo (`excedeSaldo` ignora quando "desvinculada"), permitindo informar perda maior que o saldo.

Extensão medida: das 26 ocorrências ativas com bookmaker, **15 têm `projeto_id` nulo com a casa vinculada a um projeto** (8 já resolvidas, 2 com perda registrada). Nenhuma ocorrência tem projeto divergente do da casa.

## Correção proposta

1. **Fonte única de verdade do vínculo.** Criar um helper `resolverVinculoOcorrencia(ocorrencia, bookmaker)` que devolve `{ projetoEfetivo, desvinculada }` com a regra canônica: sem snapshot na ocorrência, vale o projeto atual da casa (vinculada); com snapshot, compara-se snapshot × projeto atual. Desvinculada só quando existe snapshot e a casa saiu dele, ou quando a casa não tem projeto algum.
2. **Aplicar o helper nas quatro chamadas**: dialog de resolução, resolver, reabrir e cancelar. Isso elimina a assimetria débito/estorno.
3. **Backfill do snapshot na origem.** Ao criar a ocorrência, gravar `projeto_id` a partir do projeto atual da casa quando não houver projeto no contexto — assim a ocorrência passa a carregar o snapshot correto desde o nascimento.
4. **Regularizar as 15 ocorrências afetadas**: preencher `projeto_id` com o projeto atual da casa apenas nas ocorrências **abertas** e sem perda registrada. As que já foram resolvidas com perda ficam intocadas (política anti-retrofix) e são listadas para conferência manual.
5. **Reativar a trava de saldo** no dialog sempre que a casa estiver realmente vinculada.
6. **Idempotência mantida**: o débito continua passando por `registrarPerdaOperacionalViaLedger` com `perdaId = ocorrencia.id`, e a checagem de `resolucao_via_ajuste`/`ajuste_ledger_id` continua evitando dupla contagem.

## Validação

Caso real LabBet → 1xBet → Luiz Araújo: abrir a resolução deve deixar de exibir o aviso; resolver com perda total deve produzir saldo 6.000 → 0, uma linha no ledger, um `financial_event`, um registro em `projeto_perdas` no projeto `0df88284…` e o P&L do projeto reduzido em 6.000. Reabrir deve restaurar exatamente 6.000. Serão validados também: perda parcial, casa realmente desvinculada (perda só contábil), cancelamento após perda, e ausência de lançamentos duplicados ao repetir a operação.

## Fora de escopo

Motor de liquidação de apostas, correções em massa de histórico financeiro, alteração de saldos por UPDATE direto.
