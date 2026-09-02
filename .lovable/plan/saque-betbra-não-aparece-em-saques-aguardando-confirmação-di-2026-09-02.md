# Saque Betbra não aparece em "Saques Aguardando Confirmação" — diagnóstico e correção

## O que foi verificado no banco (dados reais)

Saque real localizado em `cash_ledger`:

```text
id                   = d5200e63-1b57-4de7-a828-7d4b4a8313ad
bookmaker            = BETBRA
parceiro             = DANILO ALEX DE OLIVEIRA RODRIGUES
destino              = conta bancária b467c7fb… (Itaú)
valor                = BRL 2.405,09
workspace            = 41718476… (LabBet)
tipo_transacao       = SAQUE   status = PENDENTE
transit_status       = CONFIRMED   status_valor = CONFIRMADO
financial_events_generated = false   reversed_at = NULL
```

A RPC `get_central_operacoes_data` foi executada com os parâmetros reais do workspace e **retorna o saque normalmente**: `saques_pendentes` traz 2 itens — o Betbra (2.405,09) e o de LOLISA/KIRGO (USD 200). Ou seja, banco, filtros SQL, joins e RLS estão corretos; o registro não está perdido nem inconsistente do lado do servidor.

Também foi verificado que as telas de criação do saque (`CaixaTransacaoDialog`, ambos os caminhos de submit) invalidam `["central-operacoes-data"]`, então o cache é atualizado após registrar.

## Onde o item se perde

O sumiço é **na camada de apresentação da Central**, no `OperacoesFilterBar`:

1. O estado de filtro é persistido por usuário em `localStorage` na chave `central-ops:filter:saques-aguardando:<userId>` e reaplicado em toda visita, sem expirar.
2. `useOperacoesFilter` filtra por facetas (parceiro, casa, moeda, projeto, idade) usando valores literais salvos. Se o usuário já havia selecionado, por exemplo, casa "KIRGO", parceiro "LOLISA" ou uma faixa de idade, **qualquer saque novo que não bata com aqueles valores é ocultado silenciosamente**.
3. O contador do card usa `saquesPendentes.length` (total, 2), enquanto o grid mostra apenas os itens filtrados — a divergência não é sinalizada; a única pista é o texto "Nenhum saque encontrado com os filtros aplicados", que nem aparece quando resta ao menos 1 item.
4. Agravante de idade/ordenação: o adapter usa `data_transacao` (data civil, 00:00 UTC) como `getCreatedAt`, enquanto a RPC também devolve `created_at` (timestamp real). Isso desloca o bucket de idade e a ordenação — um saque criado hoje pode cair no bucket errado. A ordenação padrão é por data ascendente (mais antigos primeiro), empurrando o registro novo para o fim da lista.

Confirmação final do diagnóstico será feita antes das mudanças, lendo o `localStorage` da Central na sessão real (Playwright) para registrar exatamente quais facetas estavam presas.

## Correção proposta

1. **Auto-cura do filtro persistido**: ao hidratar o estado, descartar valores de faceta que não existem mais no conjunto atual de itens. Filtro preso a uma casa/parceiro ausente deixa de ocultar tudo.
2. **Sinalização honesta do card**: quando `filtrados < total`, o card exibe "X de Y" e um botão "Limpar filtros" sempre visível (hoje só aparece o total).
3. **Fonte de data correta**: `saqueAdapter.getCreatedAt` passa a usar `created_at` (com fallback para `data_transacao`), corrigindo bucket de idade, "tempo atrás" e ordenação.
4. **Ordenação padrão**: manter mais antigos primeiro (é o comportamento desejado para fila de confirmação), mas garantir que nada seja truncado — o grid já renderiza todos.
5. **Escopo sistêmico**: os itens 1 e 2 valem para todos os cards que usam o `OperacoesFilterBar` (saques, depósitos, pagamentos, bônus, comissões), não só saques.

## O que não será alterado

Nenhum dado financeiro. Sem UPDATE, DELETE, backfill ou recriação da pendência — o saque Betbra permanece `PENDENTE` e íntegro; qualquer duplicação geraria débito/evento em dobro. A RPC, os filtros SQL e as políticas de acesso ficam como estão, pois foram validados como corretos.

## Validação

- Reproduzir na sessão real: abrir a Central, confirmar filtro preso no `localStorage`, aplicar a correção e ver os 2 saques listados.
- Registrar um novo saque no Caixa (banco e wallet, BRL e cripto) e confirmar que ele aparece na Central sem F5.
- Confirmar um saque e verificar que ele sai da lista, gera o evento financeiro uma única vez e o saldo cai exatamente uma vez.
- Repetir com filtros ativos, com outro workspace e com usuário operador (que usa a visão somente leitura).
