# Plano de Testes Controlados — Paridade Visão Financeira ⇄ Análise Temporal

## Princípio inviolável

**Zero efeito colateral em dados reais.** Todos os testes rodam em **Vitest + jsdom** com **mocks completos** do cliente Supabase e da engine canônica. Nenhuma chamada HTTP sai da máquina, nenhuma linha do banco é lida ou escrita, nenhum workspace real é tocado. Os "dados" são fixtures TypeScript hard-coded dentro dos arquivos de teste.

## Stack

- Vitest (já configurado em `vitest.config.ts`)
- `@testing-library/react` para o smoke test do hook
- `vi.mock()` para isolar `@/integrations/supabase/client` e `@/services/fetchProjetosLucroCanonico`
- Nenhuma dependência nova

## Arquivos a criar

```text
src/hooks/__tests__/
  useFinanceiroMensal.parity.test.ts         (núcleo: paridade canônica)
  useFinanceiroMensal.fallback.test.ts       (modo legado sem cotações)
  useFinanceiroMensal.pendentes.test.ts      (status filter)
  useFinanceiroMensal.edges.test.ts          (sem projetos, multi-moeda, baseline)
src/test/fixtures/
  financeiroMensal.fixtures.ts               (factories: makeFinData, makeCanonicoResult)
```

Todos isolados em `__tests__/` — não impactam build de produção (Vite ignora por padrão e `tsconfig` já contempla via `vitest/globals`).

## Cenários de teste (controlados)

### 1. `useFinanceiroMensal.parity.test.ts` — Paridade canônica

Mocka `fetchProjetosLucroCanonico` para retornar valores determinísticos por mês. Valida:

- Para cada mês `k` na janela, `result[k].fluxoLiquido === Σ(lucroRealizadoBRL dos projetos)` retornado pelo mock.
- `resultadoLiquido === fluxoLiquido − custoTotal` **exato** (sem arredondamento intermediário).
- `margemOperacional === (resultadoLiquido / (fluxoLiquido + custoTotal)) * 100` quando base > 0; `null` caso contrário.
- Custo Total continua sendo derivado de `finData` (não é tocado pela refatoração).

**Caso de regressão Abril**: fixture com fluxo canônico = 9.403,71 → resultado deve dar exatamente esse valor, não 17.490,18.

### 2. `useFinanceiroMensal.fallback.test.ts` — Modo legado

Sem `cotacoesOficiais`, o hook deve cair no fallback `cash_ledger`:

- Mock de `finData.cashLedger` com 1 SAQUE + 1 DEPOSITO + 1 DEPOSITO_VIRTUAL BASELINE + 1 DEPOSITO_VIRTUAL MIGRACAO.
- Esperado: BASELINE **ignorado**, MIGRACAO **subtraído**, SAQUE somado.
- `fetchProjetosLucroCanonico` **não pode ser chamado** (`expect(mock).not.toHaveBeenCalled()`).

### 3. `useFinanceiroMensal.pendentes.test.ts` — Status filter (documentação executável)

Como o filtro `status=CONFIRMADO` vive dentro de `fetchProjetosLucroCanonico` (que está mockado), este teste valida a **contratualidade**: o mock simula a engine retornando **apenas confirmados**. O teste então confirma:

- Linhas PENDENTE jogadas no fallback `cashLedger` **com `cotacoesOficiais` ausente** devem ser filtradas? → **Atenção**: o fallback atual NÃO filtra status. Este teste vai *documentar* o comportamento e, se necessário, abrimos issue para alinhar.
- Quando `cotacoesOficiais` presente, o fallback é desligado e o filtro fica garantido pela engine canônica. ✅

### 4. `useFinanceiroMensal.edges.test.ts` — Edge cases

- **Workspace sem projetos** → Supabase mock retorna `[]`; fluxo de todos os meses = 0; sem crash.
- **USD = 0** (cotação ainda carregando) → query desabilitada; hook retorna fluxo = 0; nunca chama a engine.
- **Multi-moeda**: fixture canônica devolve `lucroRealizadoBRL` já convertido; o hook **não** re-converte. Teste garante que `convertToBRL` recebido nas props **não é aplicado** sobre o fluxo canônico.
- **Mês sem atividade** → fluxo 0, custo 0, resultado 0, margem `null` (não `NaN`, não `Infinity`).
- **Janela 6m / 12m / 24m** → tamanho do array retornado bate com `meses` (+1 se `incluirBaseline`).
- **Baseline** → primeiro mês marcado `isBaseline: true`, com fluxo zerado independentemente do mock.

### 5. Snapshot de contrato (opcional)

Snapshot mínimo do shape de `MesFinanceiro` para detectar mudanças acidentais de campo (quebraria PDF/XLSX exports).

## Estrutura de mocks (template)

```ts
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockResolvedValue({ data: [{ id: "p1" }, { id: "p2" }], error: null }),
    })),
  },
}));

vi.mock("@/services/fetchProjetosLucroCanonico", () => ({
  fetchProjetosLucroCanonico: vi.fn(async ({ dataInicio }) => {
    // Devolve fluxo por mês determinístico a partir de dataInicio
    return {
      p1: { lucroRealizadoBRL: FIXTURE[dataInicio] ?? 0, /* ... */ },
      p2: { lucroRealizadoBRL: 0, /* ... */ },
    };
  }),
}));
```

`renderHook` envolto em `QueryClientProvider` com `QueryClient` fresh por teste (`retry: false`, `gcTime: 0`) para isolamento total.

## Garantias de segurança (checklist anti-vazamento)

- [ ] Nenhum import direto de variáveis de ambiente reais (`VITE_SUPABASE_URL` etc.) nos testes.
- [ ] `vi.mock` declarado **no topo** do arquivo, antes de qualquer import do código produtivo (hoisting garantido pelo Vitest).
- [ ] `beforeEach(() => vi.clearAllMocks())` em todos os arquivos.
- [ ] Nenhum teste roda `await supabase.from(...)` real — sempre via mock.
- [ ] Sem migrations, sem `supabase--insert`, sem chamadas a edge functions.
- [ ] Rodam offline (`network: false` implícito por jsdom + mocks).

## Execução

```bash
bunx vitest run src/hooks/__tests__/useFinanceiroMensal.*.test.ts
```

Resultado esperado: todos verdes em < 2s. Falhas indicam regressão real na engine de paridade.

## Fora de escopo

- Testes E2E (Playwright/Cypress) tocando preview real — fora do princípio de isolamento.
- Testes contra `fetchProjetosLucroCanonico` real — esse serviço já tem cobertura própria; aqui ele é **fronteira mockada**.
- Validação visual do gráfico (`GraficoMensalDialog`) — separado, não bloqueia paridade numérica.
- Mudança em qualquer arquivo de produção.

## Critério de aceite

1. `bunx vitest run` passa 100% verde.
2. Nenhuma chamada de rede registrada (auditável via `vi.fn` spies).
3. Cobertura mínima dos 4 cenários (paridade, fallback, edges, contrato).
4. Caso Abril (R$ 9.403,71) explicitamente verificado em fixture.
