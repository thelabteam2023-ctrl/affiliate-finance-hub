# Confirmação de Saque Cripto — valor recebido volta para o estimado

## Diagnóstico (confirmado no código)

Não existe arredondamento em lugar nenhum desse fluxo. O campo é `type="number" step="0.000001"`, sem máscara, sem `onBlur`, sem formatter, e o `onChange` grava a string crua no estado (`ConfirmarSaqueDialog.tsx`, linhas 687-697). O `Input` compartilhado (`src/components/ui/input.tsx`) também não formata nada.

A causa real é um **reset de estado**, não uma perda de precisão:

```text
useEffect(..., [open, saque, isCryptoWithdrawal])
  → setQtdCoinRecebida(saque.qtd_coin?.toString())   // volta para 100
```

O `saque` é montado como **objeto literal novo a cada render do pai** em `src/pages/Caixa.tsx` (linhas 1588-1626, IIFE inline). Toda vez que a página Caixa re-renderiza (refetch, realtime, atualização de estado qualquer), a identidade de `saque` muda, o efeito dispara de novo e sobrescreve o que o operador digitou pelo valor estimado do saque — no caso, 100 USDT. A sensação de "arredondou no blur" é coincidência de timing com um re-render do pai.

Ou seja: 99.493 nunca chegou a ser convertido — foi **descartado e substituído** por 100. Se o operador confirmar sem reparar, o banco persiste 100 (`qtd_coin`, `valor_confirmado`, `valor_usd`), e a diferença de 0.507 USDT some da conciliação. O risco financeiro descrito é real, mas a origem é o ciclo de vida do componente.

O mesmo dialog usado pela Central de Operações recebe `selectedSaque` (referência estável de state), por isso o problema aparece principalmente pelo Caixa.

## Correção

1. **Isolar o efeito de inicialização (`ConfirmarSaqueDialog.tsx`)**
   - Trocar a dependência `saque` por `saque?.id` e por um guard de "já inicializado para este saque" (ref com o id do saque inicializado).
   - Pré-preencher os campos apenas na transição de fechado→aberto ou quando o id do saque muda; nunca em re-renders subsequentes.
   - Extrair a verificação de parceiro ativo para não depender da identidade do objeto.

2. **Estabilizar o payload no Caixa (`src/pages/Caixa.tsx`)**
   - Substituir a IIFE inline por um `useMemo` derivado de `saqueParaConfirmar` (+ dependências reais), para que o dialog receba a mesma referência entre renders. Defesa em profundidade — vale para qualquer outro efeito futuro.

3. **Preservar precisão explicitamente (blindagem)**
   - Manter o estado como string e converter uma única vez no submit; nenhum `toFixed` no valor persistido.
   - Os `toFixed(6)` existentes são apenas de exibição de diferença e permanecem.

## Verificação

- Digitar 99.493, aguardar/forçar re-render do Caixa, sair do campo: valor permanece 99.493.
- Casos: 99.493 / 100.001 / 100.5 / 0.001 / 1.234567 / 100.
- Após confirmar 99.493: conferir no banco que `cash_ledger.qtd_coin`, `valor_confirmado` e `valor_usd` registram 99.493, e que a diferença de 0.507 gera o ajuste PERDA_CAMBIAL correspondente (comportamento já existente).
- Repetir o mesmo teste pela Central de Operações para garantir paridade entre os dois pontos de entrada.

## Fora de escopo

Nenhuma correção específica para BetAlice / Igor / workspace Luiz Felipe. A alteração é no componente compartilhado e no ponto de montagem do payload.
