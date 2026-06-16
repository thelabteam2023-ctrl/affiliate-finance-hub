## Decisão confirmada

- **Composição de Custos** continua mostrando as 5 famílias (CAC, Comissões, Bônus, Infra, Operadores) — está correta para a visão executiva.
- **Aba Despesas Administrativas** continua escopada só a `despesas_administrativas` — está correta para gestão operacional.
- **Não vamos misturar**. Só corrigir os bugs reais.

---

## Bugs a corrigir

### Bug 1 — `filterByPeriod` expande qualquer intervalo para mês cheio (CRÍTICO)

**Arquivo:** `src/hooks/useFinanceiroCalculations.ts`, linhas 81–89.

```ts
const start = dataInicio ? startOfMonth(parseLocalDate(dataInicio)) : new Date(0);
const end   = dataFim   ? endOfMonth(parseLocalDate(dataFim))     : new Date();
```

**Impacto:** Quando o usuário escolhe "Mês atual" (01→hoje), "1 dia", "7 dias" ou um custom curto, o filtro silenciosamente expande para o **mês inteiro** (inclusive datas futuras do mês corrente). Isso afeta TODOS os cálculos do `useFinanceiroCalculations`:
- Composição de Custos (5 categorias)
- Movimentação de capital (depósitos/saques/scan)
- Drill-downs (Custos Aquisição, Comissões, Bônus, Infraestrutura, Operadores)

**Correção:** trocar para `startOfDay`/`endOfDay`, respeitando o intervalo real recebido do filtro do dashboard. Sem mudar nenhuma fonte de dados nem nenhuma agregação.

```ts
const start = dataInicio ? startOfDay(parseLocalDate(dataInicio)) : new Date(0);
const end   = dataFim   ? endOfDay(parseLocalDate(dataFim))     : new Date();
```

### Bug 2 — `totalCustosAnterior` ignora o filtro do usuário e força "mês anterior do calendário civil"

**Arquivo:** `src/hooks/useFinanceiroCalculations.ts`, linhas 344–351.

Hoje, o cálculo de "vs anterior" sempre compara contra o mês civil anterior (`subMonths(new Date(), 1)`), independente do filtro selecionado. Resultado: se o usuário está vendo "Ano" ou "Tudo" ou um custom, o `% vs anterior` no header da Composição não faz sentido.

**Correção:** calcular o período anterior como uma janela do mesmo tamanho do filtro ativo, terminando logo antes de `dataInicio`. Para `tudo`/sem filtro, esconder o badge "vs anterior" (ou exibir "—").

### Bug 3 — `totalCustosAnterior` só soma `despesas + despesasAdmin + pagamentosOperador` (faltam categorias)

Mesmo bloco (linhas 347–350): o anterior soma 3 fontes, mas a Composição atual soma 5 famílias derivadas dessas mesmas fontes. O resultado bate por coincidência (porque CAC/Comissões/Bônus saem todas de `despesas`), mas é frágil — se um dia adicionarmos uma nova família (ex.: retenção), o "vs anterior" diverge.

**Correção:** reusar o mesmo somatório de `composicaoCustos` aplicado à janela anterior, em vez de duplicar a lógica.

---

## Escopo do que NÃO muda

- Composição de Custos continua com as 5 famílias.
- Aba Despesas Administrativas continua só com `despesas_administrativas`.
- Nenhuma alteração de UI, layout, copy ou tooltip.
- Nenhuma migration de banco.
- Nenhuma mudança em RPC, ledger ou cálculo canônico.

## Validação após o fix

1. Selecionar "Mês atual" → Composição deve mostrar 01→hoje (sem incluir o resto do mês).
2. Selecionar "7 dias" → Composição deve refletir só os últimos 7 dias.
3. Selecionar um custom de 3 dias → idem.
4. Selecionar "Tudo" → badge "vs anterior" some/neutro.
5. Comparar manualmente Infraestrutura (Composição) vs total da aba Admin filtrando o mesmo período — devem bater para a parcela Infra+RH.

Posso aplicar as 3 correções?
