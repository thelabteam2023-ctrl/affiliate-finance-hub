## Viabilidade

Sim, é totalmente viável — a arquitetura já expõe as duas peças que precisamos:

1. **`equalizedStakesSnapshot[pernaIndex]`** (state em `SurebetModalRoot`) — congela a **stake total da perna** (main + subs) no momento em que a arbitragem é equalizada. É o "alvo" original que o usuário quer respeitar.
2. **`targetPayoutsLocal[pernaIndex]`** (do `useSurebetCalculator`) — payout-alvo dinâmico. Hoje é o que o handler `updateAdditionalEntry` usa, mas ele se recalcula quando o usuário edita a stake principal, o que corrompe o "resto" no cenário descrito pelo usuário (main 100 → 70 já derruba o alvo).

Ou seja: já existe auto-preenchimento parcial em `SurebetModalRoot.tsx:1297-1316`, mas ele usa a **referência errada** (payout dinâmico) e por isso não cobre o caso "reduzi a main de 100 para 70, agora quero completar 30 em outra casa".

## Solução proposta

Trocar a fonte de verdade do cálculo de "stake restante" de `targetPayoutsLocal` para o **snapshot imutável** `equalizedStakesSnapshot`, com fallback para o payout dinâmico quando o snapshot não existir (ex.: usuário ainda não equalizou nada).

### Fórmula unificada

```text
stakeAlvo   = equalizedStakesSnapshot[pernaIndex]        // ex.: 100
stakeUsada  = mainStake + Σ stakes das outras subentradas preenchidas
stakeRestante = max(0, stakeAlvo − stakeUsada)
```

Regras de disparo:
- Só preenche automaticamente quando `stakeRestante > 0` **e** a subentrada em questão está com `stake` vazia/zerada (nunca sobrescreve valor manual).
- Dispara em dois momentos:
  1. Ao digitar a **odd** da nova subentrada (mesmo hook atual em `updateAdditionalEntry`).
  2. No `useEffect` reativo já existente (linhas 1336-1387) que hoje faz auto-fill quando a main muda.
- Se `equalizedStakesSnapshot` estiver vazio para aquela perna, mantém o comportamento atual (fallback payout-based), preservando a lógica que já funciona em cenários sem equalização prévia.

### Mudanças pontuais

Arquivo único: `src/components/surebet/SurebetModalRoot.tsx`

1. **`updateAdditionalEntry` (linhas 1287-1324)**  
   - Substituir o cálculo baseado em `targetPayout`/`remainingPayout/oddVal` por:  
     `stakeRestante = snapshot − mainStake − outrasSubs` (soma de stakes, não payouts).  
   - Só sobrescreve se a subentrada estiver com stake vazia ou o usuário estiver informando a odd pela primeira vez (proteger `isManuallyEdited` como já é feito na main).  
   - Fallback: se `snapshot[pernaIndex]` for 0/indefinido, usar a lógica atual por payout.

2. **`useEffect` de auto-fill reativo (linhas 1336-1387)**  
   - Mesmo swap: preferir snapshot sobre payout dinâmico.  
   - Mantém a checagem "só preenche subs com `stake` vazia" para não sobrescrever nada digitado.

3. **Não alterar** `SurebetTableRow`, engine, RPCs, snapshot capture ou fluxo de gravação. É só troca de referência dentro do handler já existente.

## Cobertura de cenários

| Cenário | Comportamento |
|---|---|
| Arbitragem equalizada, usuário divide perna em N subs | Snapshot preserva 100, distribui restante corretamente conforme user preenche |
| Usuário reduz main de 100→70 e digita odd da sub | Preenche 30 (hoje preenche errado) |
| 3 subentradas na mesma perna | Cada nova sub recebe `restante` = snapshot − todas as outras |
| Usuário digita stake manual na sub | Nunca é sobrescrito (respeita `isManuallyEdited` / stake > 0) |
| Sem snapshot (rascunho novo) | Fallback preserva comportamento atual por payout |
| Edição de aposta já registrada | `equalizedStakesSnapshot` é populado no hydrate; funciona igual |
| Multi-moeda | Snapshot é em stake local por perna — cada perna usa sua própria moeda, sem cross-conversion |

## Fora de escopo

- Não mexe em business logic (engine, RPCs, ledger).  
- Não altera UI/UX visual — apenas o valor auto-preenchido no `Input` de stake da sub.  
- Não altera fluxo de exclusão/edição de aposta (o snapshot já é reconstruído no hydrate; cobertura preservada).
