

## Separar Resultado Cambial do Lucro Operacional

Atualmente o `GANHO_CAMBIAL` e `PERDA_CAMBIAL` (gerados na Conciliação de Saldos quando o valor confirmado difere do nominal) são somados ao **Lucro Operacional** da Visão Geral, contaminando:

- KPI "Lucro Operacional"
- Gráfico "Evolução do Lucro"
- Calendário (heatmap diário)
- Cards de breakdown

Isso causa divergência com a Performance por Estratégia (que já exclui FX) e gera ruído conceitual: FX é evento de **tesouraria/câmbio**, não de **operação de aposta**.

## Objetivo

Tornar a **Visão Geral 100% operacional** (somente resultados de apostas + bônus + cashback + giros + ajustes operacionais). Resultado Cambial passa a viver exclusivamente no módulo **Indicadores Financeiros** / **Caixa**, onde já é a métrica natural.

## Mudanças

### 1. Serviço canônico — `src/services/fetchProjetoExtras.ts`
Remover `GANHO_CAMBIAL` e `PERDA_CAMBIAL` da agregação de extras.

Atualizar a fórmula canônica:
```text
LUCRO_OPERACIONAL =
  Σ apostas_liquidadas
  + Σ cashback
  + Σ giros_gratis
  + Σ bônus_creditados (exceto FREEBET)
  + Σ eventos_promocionais
  - Σ perdas_cancelamento_bonus
  + Σ ajustes_pos_limitacao
  + Σ ajustes_saldo
  + Σ conciliações
  - Σ perdas_operacionais
  // REMOVIDO: ± resultado_cambial
```

### 2. RPC server-side — `get_projetos_lucro_operacional`
Remover `GANHO_CAMBIAL` e `PERDA_CAMBIAL` do bloco de `cash_ledger` agregado por moeda. Garante que `fetchProjetosLucroOperacionalKpi` (consumido pelo card kanban e pelo dashboard financeiro do workspace) também fique alinhado.

Migração SQL: `DROP FUNCTION` + `CREATE OR REPLACE` da RPC sem os dois tipos.

### 3. Hook de breakdown — `src/hooks/useKpiBreakdowns.ts`
Aplicar o mesmo filtro client-side de FX para que os cards de breakdown da Visão Geral fiquem coerentes com o gráfico/calendário.

### 4. Re-export — `VisaoGeralCharts.tsx`
Já consome via `ExtraLucroEntry`; nenhuma mudança direta — herda o filtro do serviço.

### 5. Indicadores Financeiros — manter intacto
O módulo de Indicadores Financeiros / Caixa continua exibindo `GANHO_CAMBIAL` e `PERDA_CAMBIAL` normalmente (lá é o lugar correto). Nenhuma alteração nesse fluxo.

### 6. Memória do projeto
Atualizar `mem://architecture/canonical-projeto-extras-service.md` documentando que FX está **EXCLUÍDO** do Lucro Operacional, e adicionar regra core no `mem://index.md`:
> "Resultado Cambial (GANHO/PERDA_CAMBIAL) NÃO entra no Lucro Operacional da Visão Geral. Vive em Indicadores Financeiros/Caixa."

## Resultado Esperado

- Visão Geral, Evolução do Lucro, Calendário e cards passam a refletir **apenas operação pura de apostas**.
- Performance por Estratégia e KPI Lucro Operacional ficam 100% reconciliados (sem o "buraco" do FX).
- Lucro Real (Indicadores Financeiros) continua incluindo FX implicitamente via fluxo de caixa confirmado — é o lugar correto para visualizar o impacto cambial.
- Card kanban de projetos (consome `fetchProjetosLucroCanonico`) — verificar se também usa essa engine; se sim, herda automaticamente.

## Arquivos afetados

- `src/services/fetchProjetoExtras.ts` (remover FX da agregação)
- `src/hooks/useKpiBreakdowns.ts` (filtro alinhado)
- Nova migration: redefinir `get_projetos_lucro_operacional` sem FX
- `mem://architecture/canonical-projeto-extras-service.md` + `mem://index.md`

