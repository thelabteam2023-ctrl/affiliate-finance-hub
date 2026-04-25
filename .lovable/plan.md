Diagnóstico encontrado

O valor `$ 0,00` no select do modal de edição de bônus não parece ser um saldo salvo genericamente no banco. A causa está no payload incompleto enviado ao `BonusDialog` em alguns fluxos.

O componente `BonusDialog` exibe o saldo assim:

```text
saldo = bk.saldo_atual ?? 0
```

Ou seja: se o objeto da casa passado ao modal não contém `saldo_atual`, a UI cai automaticamente em `0`.

Fluxos auditados:

1. `ProjetoBonusTab`
   - Usa `useBookmakerSaldosQuery`, baseado na RPC canônica `get_bookmaker_saldos`.
   - Passa `saldo_atual: bk.saldo_operavel` ao `BonusDialog`.
   - Este fluxo está mais alinhado com a fonte canônica.

2. `GlobalActionsBar`
   - Busca diretamente `bookmakers.saldo_atual`.
   - Não usa a RPC canônica de saldo operável.
   - Pode exibir um saldo diferente do restante do sistema, especialmente quando há stake em aberto/freebet/saldo operável.

3. `VinculoBonusDrawer`
   - Passa para o `BonusDialog` apenas dados básicos da casa:

```text
id, nome, login, senha, catálogo, logo, moeda
```

   - Não passa `saldo_atual` nem `saldo_operavel`.
   - Portanto o `BonusDialog` renderiza `0` por fallback.
   - Este é o fluxo compatível com o print enviado, pois ele mostra o modal de edição aberto a partir do vínculo/histórico de bônus da casa.

4. `BonusBookmakersTab` -> edição de bônus pendente
   - Também passa uma casa sem saldo ao `BonusDialog` no fluxo específico de edição de bônus pendente.
   - Mesmo bug potencial.

Confirmação via banco

Para a casa do print, há dados reais no banco:

```text
HUGEWIN / projeto 80d16390...
saldo_atual: 200.00 USD
bônus: Boas-vindas 100%, status pending, valor 200 USD
```

Logo, o `$ 0,00` exibido no select é um fallback visual/frontend causado por ausência do campo `saldo_atual` no objeto passado ao modal, não uma prova de saldo zerado na casa.

Plano de correção

1. Tornar `BonusDialog` mais seguro e explícito
   - Trocar o fallback silencioso `bk.saldo_atual ?? 0` por uma resolução de saldo com prioridade:

```text
saldo_atual informado
saldo_operavel informado, se adicionarmos esse campo à interface
null/undefined quando não houver saldo carregado
```

   - Quando o saldo não estiver disponível, exibir algo como `saldo indisponível` ou ocultar o valor, em vez de mostrar `$ 0,00` falso.

2. Padronizar o fluxo do `VinculoBonusDrawer`
   - Fazer o drawer buscar o saldo canônico da casa via `useBookmakerSaldosQuery` usando o `projectId`.
   - Ao montar o array de `bookmakers` para o `BonusDialog`, incluir:

```text
saldo_atual: saldo_operavel canônico da RPC
```

   - Assim o modal exibirá o mesmo saldo usado na aba de bônus e vínculos.

3. Corrigir o fluxo de edição de bônus pendente em `BonusBookmakersTab`
   - Ao abrir `BonusDialog` para bônus pendente, anexar o saldo canônico da casa selecionada, vindo de `saldosData`.
   - Evita que o mesmo `$ 0,00` apareça nesse caminho.

4. Revisar `GlobalActionsBar`
   - Substituir a query direta em `bookmakers` por `useBookmakerSaldosQuery`, ou enriquecer o payload com a RPC canônica.
   - Objetivo: todos os lugares que abrem `BonusDialog` usam a mesma fonte de saldo.

5. Ajuste de interface/tipo
   - Expandir a interface `BookmakerOption` do `BonusDialog` para aceitar explicitamente `saldo_operavel?: number`, mantendo compatibilidade com `saldo_atual?: number`.
   - Criar uma pequena função local para formatar saldo sem mascarar dados ausentes como zero.

6. Validação
   - Verificar TypeScript.
   - Reabrir o fluxo de edição do bônus da HUGEWIN/ALAWIN e confirmar que o select mostra o saldo real/canônico, não `$ 0,00`.

Resultado esperado

- O select deixa de exibir `$ 0,00` quando o saldo apenas não foi carregado.
- O modal de bônus passa a mostrar o saldo canônico da casa nos fluxos de vínculo/histórico, bônus pendente e botão global.
- Reduzimos divergência entre `saldo_atual` bruto e `saldo_operavel` usado operacionalmente no restante do sistema.