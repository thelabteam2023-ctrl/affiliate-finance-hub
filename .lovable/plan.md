# Plano: Redesign da lista "Perdas confirmadas no período"

## Problemas atuais (vistos no print)
1. **Data em formato cru ISO** com timezone: `2026-06-05T00:00:00+00:00` — ilegível.
2. **Prefixos em colchetes** `[SCAN CASA]`, `[SCAN PARCEIRO]` no meio do título, misturando categoria + descrição.
3. **Badge "Lançamento"** sem utilidade — todo registro listado já é lançamento confirmado.
4. **Sem logo** das casas de apostas / bancos, mesmo havendo dados disponíveis (`bookmakers_catalogo.logo_url`).
5. **Hierarquia visual fraca**: título, origem e titular competem; valor em vermelho não tem ancoragem visual.
6. **Texto da descrição truncado** sem ressalva, e descrição às vezes redundante com a origem.

## Premissas de redesign
- Reaproveitar o padrão visual do projeto (mesmas tokens `--text-primary`, `--bg-card`, `--accent-danger`, badges shadcn discretos).
- Tipar a perda em **categoria semântica** (Casa / Parceiro / Banco / Wallet / Outro) inferida na transformação dos dados, não no título.
- Garantir parsing seguro de datas que podem vir como `YYYY-MM-DD` puro ou ISO completo.

## Etapas

### 1. Enriquecer `PerdaDetalhe` em `useExposicaoFinanceira.ts`
Adicionar campos calculados ao montar a lista (sem mexer no fetch):
- `categoria: "casa" | "parceiro" | "banco" | "wallet" | "outro"` — derivado de `origem_tipo`/origem do ledger ou do `sub_motivo` da ocorrência. Quando o título contém `[SCAN CASA]`/`[SCAN PARCEIRO]`, **remover o prefixo** e usar como `categoria`.
- `descricao_limpa: string` — título sem o prefixo em colchetes, trim, primeira letra maiúscula.
- `bookmaker_nome: string | null` e `bookmaker_id: string | null` — promover para uso de logo.
- `data` continua como string vinda do banco; o componente é responsável pela formatação.

### 2. Novo helper de data
Em `src/lib/format.ts` (ou inline no card): `formatDataBR(value)` que aceita `YYYY-MM-DD` e ISO completo, devolve `dd/MM/yyyy` em pt-BR via `date-fns/format` + `parseISO`. Fallback gracioso para `—`.

### 3. Redesenhar `PerdasList` em `ExposicaoFinanceiraCard.tsx`
Estrutura proposta de cada linha (3 colunas: avatar | conteúdo | valor):

```text
┌──────────────────────────────────────────────────────────────┐
│ [logo]  Impossibilitado de sacar — saldo anterior            │
│  44px   ● Casa de Apostas · BET PIX 365                      │
│         05/06/2026                                R$ 235,00 │
└──────────────────────────────────────────────────────────────┘
```

- **Avatar 36–40 px**: `<img src={logoUrl}>` quando casa de apostas com match em `useBookmakerLogoMap`; senão um ícone semântico em círculo (`Building2` para casa, `Landmark` para banco, `Wallet2` para wallet, `User` para parceiro) com cor de fundo `bg-muted/60`.
- **Título** (`descricao_limpa`) em `text-sm text-foreground font-medium`, sem truncate brutal — `line-clamp-2`.
- **Linha de metadados**: bullet `●` com cor da categoria + `<Badge variant="secondary" className="h-4 text-[10px]">` para a categoria semântica (Casa de Apostas / Parceiro / Banco / Wallet / Outro), seguida de `· {origem_label}` e `· Titular: …` quando houver. Badge "Lançamento" **removido**.
- **Data** em `text-[11px] text-muted-foreground` abaixo dos metadados, formato `dd/MM/yyyy`.
- **Valor** alinhado à direita, `text-base font-semibold text-red-500 tabular-nums`. Se moeda ≠ BRL, segunda linha pequena com valor original (já existe padrão no card).
- **Hover**: `hover:bg-muted/40` + sutil `translate-x-0.5`.

### 4. Espaçamento e padding
Cards de perda dentro do `<Sheet>` passam de `p-3` para `p-3 px-3.5`, gap entre cards `gap-2` → `gap-2.5`, divisor sutil opcional (`border-border/40`).

### 5. Mapeamento de categorias
Tabela usada por badge e cor do bullet:
| Categoria | Label | Cor bullet | Ícone fallback |
|---|---|---|---|
| casa | Casa de Apostas | `text-emerald-500` | Building2 |
| parceiro | Parceiro | `text-blue-500` | User |
| banco | Banco / Processador | `text-amber-500` | Landmark |
| wallet | Wallet Crypto | `text-violet-500` | Wallet2 |
| outro | Outro | `text-muted-foreground` | AlertTriangle |

### 6. Empty state e plural
- "Nenhuma perda confirmada no período selecionado." (já existe — manter).
- Contagem no header do drawer: `{n} perda{n>1?'s':''} · Total {formatCurrency}` para dar âncora numérica.

## Fora de escopo
- Alterar o cálculo do total ou as fontes A/B/C (ledger + ocorrência).
- Mexer nas outras seções do drawer (Em Disputa, Saldo Irrecuperável) — entram em iteração seguinte se necessário.
- Filtros/ordenação dentro do drawer.

## Detalhes técnicos
- `useBookmakerLogoMap().getLogoUrl(bookmaker_nome)` já normaliza nomes — usar direto.
- `date-fns/format(parseISO(d), "dd/MM/yyyy", { locale: ptBR })` com try/catch.
- Sem novas queries: tudo já está no payload de `useExposicaoFinanceira` + cache do logo map.

## Resultado esperado
Drawer fica legível, escaneável em 2 segundos: logo identifica visualmente a casa, badge nomeia a categoria sem precisar ler o título, data em formato BR, valor permanece como âncora visual, ruído eliminado.
