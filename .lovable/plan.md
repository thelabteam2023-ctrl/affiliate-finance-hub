
# Integração Explorador Esportivo → Formulário de Arbitragem

## Objetivo
Permitir que, ao registrar uma Arbitragem (Surebet), o usuário escolha um jogo já presente no Explorador de Dados Esportivos e tenha **Esporte**, **Evento** e **Data/Hora** do header preenchidos automaticamente — sem digitar nada.

Sem mexer em qualquer regra financeira, motor de Surebet, RPCs, triggers ou tabelas existentes. A entrega é puramente UI + leitura da tabela `public.daily_events` (que já existe e já é consumida pelo `ApiExplorer`).

---

## O que já existe (reaproveitar)

- **Tabela `public.daily_events`** (21 colunas): `sport`, `league_name`, `home_team`, `away_team`, `commence_time`, `event_date`, `status`, `home_team_logo`, `away_team_logo`, `league_logo`, `country`, `continent`, etc. É a mesma fonte usada pela aba "Calendário" do `ApiExplorer`.
- **`src/pages/ApiExplorer.tsx`** já faz `supabase.from('daily_events').select(...)` por data — vamos espelhar o mesmo padrão de query.
- **`src/components/apostas/BetFormHeaderV2.tsx`** — header unificado dos formulários (Arbitragem, Simples, Múltipla). Tem `gameFields` com `onEsporteChange`, `onEventoChange`, `onDataApostaChange`.
- **`src/components/surebet/SurebetCompactForm.tsx`** — formulário que monta o header e detém o estado dos campos do jogo.

---

## Entregáveis

### 1. Hook `useDailyEventsByDate`
`src/hooks/useDailyEventsByDate.ts`

- Recebe uma `Date` (default = hoje) e retorna a lista de jogos do dia ordenados por `commence_time`.
- Usa React Query: `queryKey: ['daily-events', dateKey]`, `staleTime: 5min`.
- Select enxuto (só campos que o seletor precisa exibir/usar): `id, sport, league_name, league_logo, home_team, away_team, home_team_logo, away_team_logo, commence_time, status, country`.
- Filtro por `event_date = dateKey` (e opcional: `status != 'finished'` por padrão, com toggle para mostrar encerrados).

### 2. Componente `ExploradorEventoPicker`
`src/components/surebet/ExploradorEventoPicker.tsx`

Popover/Dialog acionado por um botão pequeno no header (ícone `CalendarDays` + label "Do Explorador").

Conteúdo:
- DatePicker compacto no topo (default = data do header da aposta; se vazio, hoje).
- Campo de busca instantânea (filtra por time, liga ou país no lado cliente).
- Filtros rápidos: Esporte (chips) e "Mostrar encerrados" (toggle).
- Lista virtualizada de cards de partida no mesmo estilo visual do Explorador (logo dos times, "Time A x Time B", liga, hora, badge de status).
- Estado vazio quando não há jogos do dia: CTA "Abrir Explorador" → navega para `/api-explorer`.
- Skeletons enquanto carrega.

Props: `{ onSelect: (event: DailyEvent) => void; defaultDate?: string }`.

### 3. Mapeamento "jogo → campos do formulário"
`src/components/surebet/utils/mapDailyEventToFormFields.ts`

Função pura:
```ts
mapDailyEventToFormFields(ev) => {
  esporte: normalizeEsporte(ev.sport),         // mapeia "soccer" → "Futebol", etc.
  evento: `${ev.home_team} X ${ev.away_team}`, // padrão do form (uppercase)
  dataAposta: ev.commence_time,                 // ISO já no formato do DateTimePicker
  // mercado: NÃO preenche (depende da estratégia do usuário)
}
```

`normalizeEsporte` usa a mesma lista `ESPORTES_BASE` do `BetFormHeaderV2`, com tabela de aliases (`soccer→Futebol`, `basketball→Basquete`, `tennis→Tênis`, etc.). Sport não reconhecido cai em "Outro".

### 4. Wire-up no formulário de Arbitragem
`src/components/surebet/SurebetCompactForm.tsx`

- Importar o `ExploradorEventoPicker`.
- Passar `extraBadge` (ou novo prop dedicado `headerAction`) ao `BetFormHeaderV2` com o botão de abrir o picker. Alternativa mais limpa: adicionar prop opcional `onPickFromExplorer` no `BetFormHeaderV2` que renderiza o botão entre o título e a Estratégia (à esquerda da Estratégia, que agora está à direita).
- No callback `onSelect`, chamar os setters existentes: `setEsporte`, `setEvento`, `setDataAposta`. Disparar um `toast.success("Jogo importado do Explorador")`.
- Guardar `daily_event_id` em estado local (sem persistir no banco nesta fase — ver "Fase 2" abaixo) só para exibir um chip "Vinculado: Liga" no header e permitir desvincular.

### 5. UX/Detalhes visuais
- Botão do picker: `variant="outline"`, altura 28px, ícone + texto curto "Explorador", visível apenas no formulário de Arbitragem (não em Simples/Múltipla nesta fase).
- Quando um jogo está vinculado: badge discreta `[Liga · 19:00]` ao lado do botão, com `X` para desvincular (limpa só o badge, não os campos já preenchidos).
- Atalho de teclado: `Ctrl+J` abre o picker quando o formulário está focado.
- Sem alteração de altura/largura da janela popup do Surebet (1200x dinâmica) — picker é um Popover que se ancora ao botão.

### 6. Permissões e segurança
- A tabela `daily_events` já existe com 1 policy. **Não criar nem alterar policy nessa fase.** Antes de codar o hook, validar com `supabase--read_query` se `authenticated` consegue ler. Se não, plano se ajusta para criar uma `SELECT` policy permitindo `authenticated` (sem expor para `anon`). Nada de `GRANT` novo enquanto a leitura atual funcionar.
- Sem RLS nova, sem migration nesta fase.

---

## Não inclui (fora de escopo desta fase)

- Persistir vínculo `aposta_unificada.daily_event_id` (precisaria migration + ajuste no motor de salvamento — fica para Fase 2 quando o usuário pedir).
- Integração no formulário de Aposta Simples ou Múltipla (usuário pediu só Arbitragem).
- Preenchimento de Mercado (depende de estratégia/mercados do jogo, que `daily_events` não tem hoje).
- Sincronizar/criar novos eventos esportivos — usamos só o que já está sincronizado pelo `api-monitor`.
- Alterações no `ApiExplorer.tsx`.

---

## Detalhes técnicos (referência)

```text
┌─ src/hooks/
│   └─ useDailyEventsByDate.ts          [novo]
├─ src/components/surebet/
│   ├─ ExploradorEventoPicker.tsx        [novo]
│   ├─ SurebetCompactForm.tsx            [editar — adicionar botão+handler]
│   └─ utils/mapDailyEventToFormFields.ts [novo]
└─ src/components/apostas/
    └─ BetFormHeaderV2.tsx               [editar — prop opcional headerAction OU extraBadge slot]
```

Fluxo:
```text
Header (Arbitragem)
   └─ [Explorador ▾]  clique
        ↓
   Popover ExploradorEventoPicker
        ├─ DatePicker (default = data do form)
        ├─ Busca + filtros
        └─ Lista de daily_events do dia
              └─ clique no jogo
                    ↓
        mapDailyEventToFormFields(ev)
                    ↓
        setEsporte / setEvento / setDataAposta
        toast "Jogo importado"
        badge "Liga · hora" no header
```

---

## Validação ao final
1. Build limpo (`tsc` sem erros).
2. Abrir Arbitragem em `/janela/surebet/novo?projetoId=...`, clicar "Explorador", selecionar um jogo do dia, conferir que `Esporte`, `Evento` e `Data/Hora` foram preenchidos.
3. Trocar a data no picker e confirmar nova lista.
4. Limpar busca + jogo encerrado escondido por padrão; toggle traz de volta.
5. Sem mudanças em valores monetários, motor de cálculo, KPIs ou ledger.
