
## Pedido

Auto-distribuir as casas-clone do plano com:
- **3 casas/dia**
- **Casa não repete em ≤3 dias**
- **CPF não repete em ≤5 dias**
- **Tudo dentro dos 23 primeiros dias do mês**
- Abrir uma **janela de simulação** (preview) — usuário decide se aplica manualmente no calendário ou não

## Onde mexer

1. **Novo:** `src/lib/auto-scheduler.ts` — algoritmo puro
2. **Novo:** `src/components/planejamento/SimulacaoDistribuicaoDialog.tsx` — janela de preview
3. **Editar:** `src/components/planejamento/PlanejamentoCalendario.tsx` — botão "Simular distribuição"

## Algoritmo (`auto-scheduler.ts`)

Entrada:
```ts
{
  celulas: CelulaDisponivel[],          // do usePlanoCelulasDisponiveis
  campanhasExistentes: Campanha[],      // ocupação atual no mês
  mesAno: Date,                         // mês alvo
  config: {
    casasPorDia: 3,
    cooldownCasaDias: 3,
    cooldownCpfDias: 5,
    diaLimite: 23,                      // só agenda dias 1..23
  }
}
```

Lógica greedy:
```text
dias = [dia 1 .. dia 23] do mês alvo
ocupacao = inicializar a partir de campanhasExistentes
  (mapa: dia -> {casas:Set, cpfs:Set})
ultimoUsoCasa = mapa casa -> dia
ultimoUsoCpf  = mapa cpf -> dia

resultado = []
warnings = []

para cada dia D em ordem:
  para slot 1..3:
    candidatas = celulas_disponiveis ordenadas por:
      1) menos vezes agendada
      2) maior gap desde ultimoUsoCasa
      3) maior gap desde ultimoUsoCpf
    pick = primeira que satisfaz:
      - casa ∉ ocupacao[D].casas
      - cpf  ∉ ocupacao[D].cpfs
      - (D - ultimoUsoCasa[casa]) > cooldownCasaDias
      - (D - ultimoUsoCpf[cpf])  > cooldownCpfDias
    se pick:
      resultado.push({celula, dia:D})
      atualizar ocupacao + ultimoUso*
      remover de celulas_disponiveis
    senão:
      warnings.push(`Dia D slot S: nenhuma célula compatível`)

celulas restantes não agendadas → warnings ("X células não couberam")
return { agendamentos, warnings, estatisticas }
```

## Janela de simulação (`SimulacaoDistribuicaoDialog`)

Layout do Dialog (max-w-3xl):

```text
┌──────────────────────────────────────────────┐
│ Simular Distribuição                       X │
├──────────────────────────────────────────────┤
│ [Casas/dia: 3] [Cooldown casa: 3d]           │
│ [Cooldown CPF: 5d] [Dia limite: 23]          │
│                       [Recalcular]            │
├──────────────────────────────────────────────┤
│ Resumo: 45/48 agendadas · 3 não couberam     │
├──────────────────────────────────────────────┤
│  Dia 1  ┃ 🟡 Bet365(CPF1) 🟢 Pinn(CPF2) ...  │
│  Dia 2  ┃ 🟢 Stake(CPF2) 🟡 1xBet(CPF1) ...  │
│  Dia 3  ┃ ...                                 │
│  ...                                          │
│  Dia 23 ┃ ...                                 │
├──────────────────────────────────────────────┤
│ ⚠ Warnings:                                  │
│  - Amunra: cooldown CPF impediu agendamento  │
├──────────────────────────────────────────────┤
│         [Fechar]  [Aplicar no calendário]    │
└──────────────────────────────────────────────┘
```

- Cada item mostra logo + nome da casa + badge CPF colorido (mesma palette `CPF_COLORS` já existente)
- Inputs no topo permitem ajustar parâmetros e clicar **Recalcular** sem fechar
- Botão **Aplicar no calendário** cria as campanhas em batch (`useUpsertCampanha` + `marcarCelulaAgendada`), com `Promise.all` em chunks de 5 e UM `invalidateQueries` ao final (padrão batch-refresh já adotado)
- Botão **Fechar** descarta a simulação sem efeito colateral

## Botão no calendário

Adicionar ao header do `PlanejamentoCalendario` (próximo aos filtros existentes):
```text
[Plano: Abril ▾] [Simular distribuição 🪄]
```
Habilitado apenas quando há plano selecionado e há células disponíveis.

## Detalhes técnicos

- Sem nada novo no banco — usa hooks existentes
- A simulação é 100% client-side; só persiste ao clicar "Aplicar"
- Os parâmetros default ficam memorizados em `useState` no Dialog (não persistem entre sessões nesta versão)
- Validação: se `celulas.length > 23 * casasPorDia` → aviso amarelo no resumo ("plano excede capacidade da janela")
- Re-simulação é instantânea (algoritmo greedy é O(n·d))

## Fora de escopo

- Persistir presets de configuração
- Pular fins de semana / feriados
- Re-otimização global (ILP) — fica greedy mesmo
