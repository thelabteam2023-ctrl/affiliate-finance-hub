# Diagnóstico da Aba Bônus — Observabilidade

## Ativação

Adicione `?debugBonus=1` à URL do projeto **ou** rode no console:

```js
localStorage.setItem("DEBUG_BONUS", "1");
location.reload();
```

Um painel flutuante aparecerá no canto inferior direito enquanto a aba Bônus estiver montada.

## Como coletar snapshot

```js
// JSON completo (também copia para clipboard)
window.__BONUS_DEBUG__.export();

// Ler eventos no console
window.__BONUS_DEBUG__.snapshot();

// Limpar
window.__BONUS_DEBUG__.clear();
```

## Stages instrumentados

| Stage | O que registra |
|---|---|
| `AREA.mount` / `AREA.refreshTrigger` | Montagem e refetch do container |
| `TAB.mount` / `TAB.subTabChange` | projetoId, dateRange, subTab ativa |
| `QUERY.apostas.request/response` | SIMPLES: filtros SQL, rows, ms, amostra |
| `QUERY.multiplas.response` | MULTIPLA: rows, amostra |
| `QUERY.surebets.request/response` | ARBITRAGEM/SUREBET: filtros, rows, amostra |
| `QUERY.pernas.response` | Pernas normalizadas por aposta pai |
| `QUERY.entradas.response` | Total de sub-entradas, quantas pernas multi-entrada |
| `FILTER.dimensional` | Filtros de busca/status/tipo/bookmaker/parceiro (input→output) |
| `FILTER.date` | Corte por `dateRange` no Histórico |
| `FILTER.subTab` | Regra `status !== 'PENDENTE' && !!resultado` |
| `RENDER.list` | Quantidade final em Abertas vs Histórico |

Para cada filtro registramos `inputCount`, `outputCount`, `rule` e até 5 amostras de itens descartados (`id`, `status`, `resultado`, `data_aposta`).

## Procedimento de diagnóstico

1. Abra o projeto afetado com `?debugBonus=1`.
2. Vá para **Bônus → Histórico**.
3. `window.__BONUS_DEBUG__.export()` e anexe o JSON.
4. No snapshot, localize o primeiro stage em que `outputCount < inputCount` sem justificativa esperada — esse é o ponto onde as operações somem.
5. Cruze com a query SQL equivalente diretamente no banco (mesmos filtros do `QUERY.*.request`) para confirmar o universo real.
6. Aplique a correção pontual só depois desse diff antes/depois.

## Custo

Zero quando desligado — todos os métodos fazem early-return em `bonusDebug.enabled`. O painel também retorna `null` sem a flag.