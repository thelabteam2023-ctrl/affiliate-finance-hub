## TL;DR (correção do relato)

Você está certo — eu rotulei errado no plano anterior. A segunda entrada da perna X **não é Vave de novo**, é **HUGEWIN – WALLYSON AUGUSTO ALVES DE LIMA**. Confirmado no banco:

```text
ordem | selecao | entrada                                      | stake | odd  | moeda
  1   | Casa    | SPORTMARKET — Reginaldo Santos               | 181   | 2.24 | EUR
  2   | Empate  | VAVE — Juliana Costa de Oliveira             |  50   | 3.50 | USD   ← já aparece
  2   | Empate  | HUGEWIN — Wallyson Augusto Alves de Lima     |  84   | 3.45 | USD   ← SUMIDA
  3   | Fora    | PARIMATCH — Juliana Costa de Oliveira        | 731   | 3.28 | BRL
```

Ou seja: a perna X tem **duas casas, parceiros diferentes (Juliana + Wallyson), mesmo selecao "Empate", mesma moeda USD**. A HUGEWIN do Wallyson foi gravada corretamente em `apostas_perna_entradas` e simplesmente não é lida pelo card.

Isso reforça o diagnóstico — e tem uma implicação extra que eu ainda não tinha levantado: **exposure por parceiro está sendo subestimada** enquanto a sub-entrada não aparece, porque o cálculo no front se baseia no que ele consegue ler. Wallyson "some" das telas de exposição/risco até o fix entrar.

---

## O que muda no plano (delta sobre a versão anterior)

Todo o resto do plano técnico continua igual (o fix é frontend, helper `mapPernaWithEntries.ts`, 7 consumidores, etc.). Adiciono e/ou reforço os pontos abaixo:

### 1. Renderização da sub-entrada deve mostrar a casa + parceiro corretos

No `SurebetCard`, cada item de `entries[]` precisa montar o label exatamente igual ao da linha principal:

```
{bookmaker.nome}{instance_identifier ? ` (${instance_identifier})` : ''} — {parceiro.nome}
```

No exemplo: a sub-linha da perna X tem que sair como `HUGEWIN — WALLYSON AUGUSTO ALVES DE LIMA`, **não** repetir o nome do parceiro/casa da entrada principal. O `bookmakerMap` (já carregado em todos os tabs) tem `parceiro:parceiros(nome)` — só precisa ser usado também nas sub-entradas.

### 2. Validação extra durante QA — checklist específico do caso real

Subir o fix em preview e confirmar visualmente, na ordem:

1. Abrir `NORUEGA X SENEGAL` na aba Apostas do projeto.
2. Perna X deve renderizar **duas linhas**:
   - VAVE — Juliana Oliveira · US$ 50,00 · @3.50
   - HUGEWIN — Wallyson Augusto · US$ 84,00 · @3.45
3. Stake total da perna X = US$ 134,00 (50 + 84). Odd média ponderada ≈ 3.4814.
4. Stake total da operação deve permanecer **R$ 399,24** (igual antes do fix, pois a stake já era contabilizada no agregado pai pela RPC). Se mudar, é bug.
5. Reabrir o modal de edição: as duas casas precisam vir preenchidas (já vinham, o `fetchLinkedPernas` está correto).
6. Salvar sem alterar nada e voltar para o card → continua mostrando as duas linhas.

### 3. Exposição por parceiro (P1, separado deste fix)

Como Wallyson estava invisível em todas as telas, vale uma auditoria curta:
- Verificar se `usePernasBookmakerPendentes` / dashboards de bookmaker / cards de exposição usam o mesmo path quebrado.
- Se sim, eles também passam a contemplar a HUGEWIN do Wallyson após o fix — mas precisamos **conferir KPIs antes/depois** para garantir que não estávamos compensando o erro em outro lugar (memória de anti-retrofix: nada de mass update; só leitura).

### 4. Memória de projeto (nome ajustado)

Salvar em `mem://architecture/surebet-perna-read-with-entradas-standard` com exemplo concreto:

> "Cada perna pode ter N entradas em `apostas_perna_entradas`, cada uma com **bookmaker + parceiro próprios** (ex.: NORUEGA X SENEGAL, perna X = VAVE/Juliana + HUGEWIN/Wallyson). Toda leitura de perna para renderização DEVE trazer essas entradas + join com bookmakers/parceiros. A 'entrada principal' denormalizada em `apostas_pernas` é só conveniência de saldo; nunca substitui a leitura das entradas."

---

## Pergunta de gate (mesma de antes)

Confirma seguir com o fix em **um lote para todos os 7 consumidores** (Apostas, Surebet, Bônus, Freebets, Punter, DuploGreen, ValueBet) ou prefere que eu comece só pelos dois que cobrem o card do print (`ProjetoApostasTab` + `ProjetoSurebetTab`) e valide com você antes de propagar?
