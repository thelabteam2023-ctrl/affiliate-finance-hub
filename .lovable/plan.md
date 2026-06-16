## Objetivo

Remover a faixa "Alertas" (Em disputa · Perdas) entre Exposição & Perdas e Composição de Custos. A informação já está exibida de forma completa dentro do bloco **Exposição & Perdas** (com detalhamento por ocorrência), então o strip é redundante.

## Mudanças

### 1. `src/pages/Financeiro.tsx`
- Remover o JSX `<AlertStrip ... />` dentro da tab `overview` (entre o grid Posição/Exposição e o `ComposicaoCustosCard`).
- Remover o hook `useExposicaoFinanceira` chamado no nível da página (era usado **apenas** para alimentar o AlertStrip; o `ExposicaoFinanceiraCard` faz sua própria chamada internamente).
- Remover o import `useExposicaoFinanceira`.
- Remover o import `AlertStrip`.

### 2. `src/components/financeiro/AlertStrip.tsx`
- Apagar o arquivo (sem outros consumidores).

## Validação

- Build TS limpo (sem imports órfãos).
- Tab Visão Financeira: KpiRail à esquerda + Posição/Exposição + Composição de Custos, sem faixa intermediária.
- Exposição & Perdas continua mostrando Em disputa e Perdas com detalhamento.

## Fora de escopo

- KpiRail, dialogs de detalhamento e demais blocos permanecem inalterados.
