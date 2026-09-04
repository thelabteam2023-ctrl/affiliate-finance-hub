# Saldo real x freebet no formulário: o que existe hoje e o que falta ajustar

## Resposta direta às dúvidas

**Os dois saldos continuam separados — nada foi removido do formulário.**

Abaixo de cada casa selecionada aparece a linha de metadados (`BookmakerMetaRow`):
`PARCEIRO • <saldo real disponível> + 🎁 <freebet>`.

- O valor à esquerda é o **saldo real disponível** (`saldo_disponivel`).
- O trecho `+ 🎁 100,00` só aparece **quando a casa tem freebet > 0**. Foi exatamente
  o que apareceu no seu print: `VICTOR • $0.00 + 🎁 $100.00` — saldo real zero e
  freebet cem.
- O botão **FB** ao lado do campo de stake só aparece quando a casa tem freebet, e é
  ele que define o recurso da entrada. Ligado = entrada de freebet; desligado = entrada
  de saldo real. Nada mudou nessa estrutura.

**A validação é separada por recurso (já corrigido):**
- Entrada real valida contra `saldo_disponivel` (nunca soma freebet).
- Entrada freebet valida contra `saldo_freebet`.
- Backend (`fn_sync_stake_event_v1`) repete a trava antes de gravar, separando
  `saldo_atual` (real) de `saldo_freebet`.

Portanto: real 0 + FB 100 → real bloqueado, FB até 100 permitido. Real 100 + FB 100 →
até 100 em cada recurso, conforme o botão FB. Não há mais soma dos dois saldos em
nenhum ponto de decisão.

## Lacunas encontradas na auditoria (só de exibição, não de trava)

Três textos de "Disponível" ainda mostram o saldo somado (`saldo_operavel`) em vez do
saldo real, o que pode confundir na hora de corrigir o valor:

1. `SurebetTableRow.tsx` — mensagem de erro da sub-entrada (linha ~712).
2. `SurebetColumnsView.tsx` — mensagens da entrada principal (~329) e sub-entrada (~518).
3. `SurebetMobileCard.tsx` — mesmas duas mensagens (~329 e ~526).

E um ponto que ainda decide bloqueio pelo saldo somado, fora do modal novo:

4. `SurebetDialogTable.tsx` (~1786): `isInsuficiente` compara o stake contra
   `saldo_operavel - stakesOutras`, sem separar real de freebet — mesma brecha visual
   que foi fechada no modal principal.

## Correção proposta

- Trocar `saldo_operavel` por `saldo_disponivel` em todas as mensagens de
  "Disponível/Disp." quando a entrada for real; manter `saldo_freebet` quando for FB.
- Padronizar o texto para deixar o recurso explícito:
  `Saldo real insuficiente. Disponível: X (freebet Y não conta)` e
  `Freebet insuficiente. Disponível: Y`.
- Em `SurebetDialogTable`, passar a usar a mesma função pura de validação já usada pelo
  modal (`validateBalance` de `src/utils/surebetBalanceValidation.ts`), eliminando a
  última cópia divergente.
- Sem mudança de layout: os dois saldos continuam na mesma linha, com o 🎁 exibido
  sempre que houver freebet, inclusive com saldo real zerado.

## Riscos

Nenhuma mudança de regra financeira nem de gravação — apenas o número exibido nas
mensagens e a unificação do validador da tabela antiga. O único efeito prático é que
casos que hoje passavam pela conferência da tabela antiga usando freebet como saldo real
passarão a ser bloqueados também ali (comportamento correto, já vigente no modal e no
banco).

## Testes

Cenários manuais na arbitragem, por casa: real 0 + FB 100 (real bloqueado, FB até 100);
real 100 + FB 100 (100 em cada recurso, conforme botão FB); real 50 + FB 100 (real 51
bloqueia, FB 101 bloqueia); sub-entradas na mesma casa somando acima do saldo; e o mesmo
conjunto pela tabela de surebets antiga.
