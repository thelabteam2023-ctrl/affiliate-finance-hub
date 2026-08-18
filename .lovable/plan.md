# Perda Promocional (PROMO_LIMIT): propagação para Lucro e Performance de Bônus

## O que foi confirmado nos dados reais

Consultei o lançamento citado. Ele existe, está correto e é único:

- `cash_ledger`: `AJUSTE_SALDO`, `ajuste_motivo = 'PROMO_LIMIT'`, `ajuste_direcao = 'SAIDA'`, valor **169,39 USD**, projeto AGOSTO, casa OROBET, data 18/08.
- `financial_events`: gerou um evento `AJUSTE` de **-169,39** (chave `ledger_ajuste_<id>`) — o saldo da casa foi debitado corretamente, sem duplicidade.
- O bônus está `finalized` com motivo `completed_with_limit`.

Observação: a moeda registrada é USD (moeda da casa e de consolidação do projeto), não EUR. O valor financeiro está coerente; o símbolo exibido na tela pode ser conferido depois.

## Causa raiz (confirmada)

O evento existe apenas como ajuste de saldo. Três agregadores reconhecem `BONUS_CANCELAMENTO`, mas **nenhum reconhece `PROMO_LIMIT`**:

1. `get_projeto_lucro_operacional_daily` (fonte do gráfico Evolução do Lucro) — filtra `ajuste_motivo = 'BONUS_CANCELAMENTO'`.
2. `get_projetos_lucro_operacional` (KPI canônico de lucro, ambas as assinaturas) — idem, sem nenhuma menção a `PROMO_LIMIT`.
3. `BonusVisaoGeralTab.tsx`, query `bonus-perdas-cancelamento` — idem; alimenta KPIs de bônus, visão Por Casa e o gráfico de resultado líquido.

Ou seja: o evento é canônico e único; falta apenas ser **lido** pelas três agregações. Não é necessário criar nenhum lançamento novo.

## Correção proposta

Princípio: um único evento no ledger, reconhecido por todas as visões. A mudança é de leitura, não de escrita.

### Banco de dados

- `get_projeto_lucro_operacional_daily`: ampliar o bloco `perdas_cancel_daily` para aceitar `ajuste_motivo IN ('BONUS_CANCELAMENTO', 'PROMO_LIMIT')`, mantendo `SAIDA` + `CONFIRMADO` e a mesma conversão por moeda.
- `get_projetos_lucro_operacional` (as duas assinaturas existentes): mesma ampliação no bloco equivalente, com `DROP FUNCTION IF EXISTS` antes de recriar para evitar ambiguidade de assinatura no PostgREST.

O valor já é gravado na moeda da casa e o projeto consolida em USD com Cotação de Trabalho, então nenhuma lógica cambial nova é necessária — reaproveita a conversão já existente nesses blocos.

### Frontend

- `BonusVisaoGeralTab.tsx`: trocar `.eq("ajuste_motivo", "BONUS_CANCELAMENTO")` por `.in("ajuste_motivo", ["BONUS_CANCELAMENTO", "PROMO_LIMIT"])`. Isso propaga automaticamente para os KPIs de bônus, a visão Por Casa e o `BonusResultadoLiquidoChart`, que já consomem esse mesmo array.
- `ExtratoProjetoTab.tsx`: rótulo dedicado para o ajuste com motivo `PROMO_LIMIT` ("Perda Promocional — limite de saque"), distinguindo de um ajuste manual comum.

### Rastreabilidade (para lançamentos futuros)

- `useProjectBonuses.ts`: incluir `bonus_id` e `origem: 'BONUS'` no `auditoria_metadata` do débito de `PROMO_LIMIT`. Hoje o metadata só traz `delta`/`motivo`, o que impede reconciliar o lançamento com o bônus de origem. Não é necessário para o cálculo (casa + projeto já bastam), mas é necessário para auditoria.

## Sem duplicidade

O mesmo registro passa a ser lido por Visão Geral e por Bônus, mas cada agregação soma o ledger **uma vez**. As apostas de bônus vêm de `apostas_unificada` e o débito vem de `cash_ledger` — fontes disjuntas, sem caminho para contar 169,39 duas vezes.

## Validação

1. Evolução do Lucro do projeto AGOSTO deve cair 169,39 no dia 18/08.
2. KPI de lucro da Visão Geral deve variar exatamente o mesmo valor (não o dobro).
3. Aba Bônus → Por Casa: OROBET reduzida em 169,39, com o total da categoria acompanhando.
4. Saldo da casa permanece 194,00 (não deve mudar — já estava debitado).
