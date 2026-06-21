## Objetivo

Quando o usuário usa **Importar Jogo** (ExploradorEventoPicker → `daily_events`), capturar e persistir as **logos de time mandante, visitante e liga**, e exibi-las no header do **card de aposta pós-registro** (ex.: `🇩🇪 ALEMANHA  ×  🇨🇮 COSTA DO MARFIM`).

Quando o evento for digitado manualmente, os campos ficam `null` e o card cai no layout atual (sem logos) — zero regressão.

---

## 1. Schema — migration

`daily_events` já tem `home_team_logo`, `away_team_logo`, `league_logo`. `team_logos` (cache) também já existe. Precisamos só persistir o snapshot no momento do registro.

Adicionar à `public.apostas_unificada`:

```sql
ALTER TABLE public.apostas_unificada
  ADD COLUMN IF NOT EXISTS home_team           text,
  ADD COLUMN IF NOT EXISTS away_team           text,
  ADD COLUMN IF NOT EXISTS home_team_logo_url  text,
  ADD COLUMN IF NOT EXISTS away_team_logo_url  text,
  ADD COLUMN IF NOT EXISTS league_logo_url     text,
  ADD COLUMN IF NOT EXISTS daily_event_id      uuid REFERENCES public.daily_events(id) ON DELETE SET NULL;
```

Todos `nullable`, sem default. Snapshot — não há FK obrigatória (se o evento for removido do catálogo, o card continua mostrando logos). `daily_event_id` é só para auditoria/futura re-sincronização opcional.

Sem mudanças em RLS, grants, triggers ou lógica financeira. Snapshot puro de apresentação.

---

## 2. Captura — propagar do importador até o service

### 2.1. Estender `MappedEventFields`
`src/components/surebet/utils/mapDailyEventToFormFields.ts`:

```ts
export interface MappedEventFields {
  esporte: string;
  evento: string;
  dataAposta: string;
  // novos
  homeTeam: string | null;
  awayTeam: string | null;
  homeTeamLogoUrl: string | null;
  awayTeamLogoUrl: string | null;
  leagueLogoUrl: string | null;
  dailyEventId: string | null;
}
```

Preencher a partir do `DailyEvent` (campos já existem). `evento` continua sendo `"HOME X AWAY"` (compat).

### 2.2. Guardar no estado do modal
`SurebetModalRoot.tsx` (linha ~2253): adicionar 6 `useState<string|null>` (`homeTeam`, `awayTeam`, `homeTeamLogoUrl`, `awayTeamLogoUrl`, `leagueLogoUrl`, `dailyEventId`) e atualizá-los no `onSelect`.

**Reset:** se o usuário editar manualmente o campo `evento` depois de importar (texto fugir do padrão capturado), limpar os 6 campos — para não persistir snapshot que não corresponde mais ao que está escrito. Detecção simples: `useEffect` comparando `evento` atual vs `\`${homeTeam} X ${awayTeam}\`.toUpperCase()`.

### 2.3. Passar ao service
`CriarApostaInput` e `AtualizarApostaInput` em `src/services/aposta/types.ts`:

```ts
home_team?: string | null;
away_team?: string | null;
home_team_logo_url?: string | null;
away_team_logo_url?: string | null;
league_logo_url?: string | null;
daily_event_id?: string | null;
```

`ApostaService.criarAposta` / `atualizarAposta`: incluir essas colunas no insert/update da `apostas_unificada` (passthrough — sem validação, sem invariante, sem tocar em ledger).

### 2.4. Outros pontos de entrada
- `NovaEntradaDialog`, `ApostaDialog`, `ProjetoDuploGreenTab`, `ProjetoValueBetTab`, `ProjetoPunterTab`, `ProjetoFreebetsTab` — onde houver o `ExploradorEventoPicker` (ou equivalente). Replicar o mesmo padrão de captura ou centralizar via hook `useDailyEventCapture()` para evitar duplicação (recomendado).
- Verificação rápida: `rg "ExploradorEventoPicker"` antes da implementação para listar todos os call sites.

---

## 3. Render — card de aposta

### 3.1. Tipo `Aposta`
Adicionar os campos opcionais ao tipo consumido por `ApostaCard.tsx` (`src/types/apostasUnificada.ts` se existir, senão na interface local).

### 3.2. Header do card
`src/components/projeto-detalhe/ApostaCard.tsx`, ponto onde renderiza `displayEvento` (linha ~394):

```tsx
{hasTeamLogos ? (
  <div className="flex items-center gap-2 min-w-0">
    <TeamLogo url={aposta.home_team_logo_url} alt={aposta.home_team} />
    <span className="truncate font-semibold uppercase">{aposta.home_team}</span>
    <span className="text-muted-foreground">×</span>
    <TeamLogo url={aposta.away_team_logo_url} alt={aposta.away_team} />
    <span className="truncate font-semibold uppercase">{aposta.away_team}</span>
  </div>
) : (
  <span className="truncate font-semibold uppercase">{displayEvento}</span>
)}
```

`hasTeamLogos = !isMultipla && aposta.home_team && aposta.away_team && (aposta.home_team_logo_url || aposta.away_team_logo_url)`.

### 3.3. Componente `TeamLogo`
Novo `src/components/ui/team-logo.tsx`, espelho do `BookmakerLogo`:
- `size="h-5 w-5"` default.
- Fallback: ícone `Shield` (lucide) em container `bg-muted/30 rounded`.
- `onError` esconde a imagem quebrada e mostra fallback (URLs da API morrem).

### 3.4. Badge de liga (opcional, escopo dessa fase)
Se `league_logo_url` existir, exibir miniatura `h-3.5 w-3.5` ao lado do badge "Futebol" no segundo nível do card. Não-bloqueante; podemos adiar.

---

## 4. Compatibilidade & retroatividade

- **Apostas antigas**: ficam com os 6 campos `null` → caem no fallback `displayEvento` (string atual). Nenhuma migration de dados retroativa — inferir time só do texto `"ALEMANHA X COSTA DO MARFIM"` não é confiável (acentos, abreviações, "vs", etc.). Aceitar que só apostas novas terão logos.
- **Edição de aposta liquidada**: passthrough também no `atualizarAposta` (sem lógica adicional — campos puramente cosméticos).
- **Export**: incluir `home_team`/`away_team` no CSV/XLSX se `ExportMenu` listar colunas, opcional.

---

## 5. Validação

1. Migration aplicada — confirmar via `\d apostas_unificada` que as 6 colunas existem.
2. Importar jogo → registrar surebet/aposta simples → conferir no banco: `SELECT evento, home_team, away_team, home_team_logo_url FROM apostas_unificada ORDER BY created_at DESC LIMIT 1;`.
3. Conferir card em `Todas Apostas` exibe `[logo] HOME × [logo] AWAY`.
4. Quebrar URL de logo (substituir por inválida via devtools) → fallback `Shield` aparece, card não quebra.
5. Aposta digitada manualmente → card mostra string como hoje.
6. Aposta antiga (pré-migration) → mesmo fallback.

---

## Fora de escopo

- Backfill retroativo de logos para apostas antigas.
- Cache local/CDN de logos (já existe `team_logos` no backend).
- Exibir logos no modal de criação enquanto edita (só no card pós-registro, conforme pedido).
- Mexer em qualquer cálculo, ledger, KPI, RPC ou trigger.
