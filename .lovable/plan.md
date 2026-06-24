# Plano — Faceted Filter Bar (Proposta B)

Substituir os 3 SmartFilters atuais (`SaquesSmartFilter`, `SaqueProcessamentoSmartFilter`, `CasasLimitadasSmartFilter`) por **um único componente reutilizável** no padrão Linear/Stripe, com facetas multi-seleção, saved views e persistência por usuário.

## Escopo

**Dentro:** Central de Operações → cards Financeiros (Aguardando Confirmação, Pendentes de Processamento, Casas Limitadas).
**Fora desta entrega:** outras telas (Financeiro, Apostas, etc.). A base fica pronta para reuso em uma fase 2.

## Arquitetura

Novo módulo em `src/components/central-operacoes/filter-bar/`:

```text
filter-bar/
├── OperacoesFilterBar.tsx       ← shell visual (totalizador + facetas + busca + ordenação)
├── FacetPopover.tsx             ← popover pesquisável com multi-select + soma por valor
├── SavedViewsBar.tsx            ← chips de views salvas + "Nova view"
├── useOperacoesFilter.ts        ← hook genérico (estado, persistência, derivação)
├── useSavedViews.ts             ← CRUD de views salvas (localStorage por usuário)
└── types.ts                     ← FacetConfig, FilterState, SavedView, ItemAdapter
```

## Modelo genérico

```ts
type FacetKey = "parceiro" | "casa" | "moeda" | "projeto" | "idade";

interface ItemAdapter<T> {
  getParceiro: (item: T) => string | null;
  getCasa: (item: T) => string | null;
  getMoeda: (item: T) => string;
  getProjeto: (item: T) => string | null;
  getValor: (item: T) => number;
  getCreatedAt: (item: T) => string;
  getSearchText: (item: T) => string;
}
```

Cada card passa seu adapter — `SaqueCardGrid`, `SaqueProcessamentoCardGrid`, `CasasLimitadasCardGrid` continuam recebendo a lista já filtrada e não mudam.

## Layout final

```text
┌─ Saques Aguardando Confirmação ─────────────────────────────────────┐
│ Pendente:  R$ 2.340,51 BRL    US$ 559,51 USD                       │
│                                                                     │
│ [ Meus saques ] [ Atrasados >30d ] [ +Nova view ]                  │
│                                                                     │
│ [+ Filtro ▾] [Parceiro: 2 ×] [Casa: Bet365 ×]   ⌕ buscar…  ↕ valor│
│                                                                     │
│ ... cards ...                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

**Facetas:** Parceiro, Casa, Moeda, Projeto, Idade (Hoje / 7d / 30d / >30d).
Cada chip mostra **label + count** e abre popover com lista pesquisável (multi-seleção, contagem por item, total por moeda no rodapé).

**Ordenação:** toggle de 2 estados (data ↑↓ / valor ↑↓) em vez de Select de 4 opções.

**Busca textual:** colapsada, secundária. Atalho `/` foca, `Esc` limpa.

## Persistência

- `localStorage` chave `central-ops:filter:<cardId>:<userId>` → último estado.
- `localStorage` chave `central-ops:views:<userId>` → array de saved views.
- Defaults: nenhum filtro, ordenação "mais antigo primeiro".

## Saved Views (v1 simples)

- Botão "Salvar view atual" no menu da barra → pede nome → grava em localStorage.
- Click no chip da view → aplica todos os filtros + ordenação.
- Long-press / menu de contexto → renomear / remover.
- Sem sincronização com backend nesta fase (decisão: começar local, migrar depois se houver demanda multi-device).

## Migração dos cards existentes

`src/pages/CentralOperacoes.tsx`:

```tsx
<OperacoesFilterBar
  cardId="saques-aguardando"
  items={saquesPendentes}
  adapter={saqueAdapter}
  facets={["parceiro","casa","moeda","projeto","idade"]}
>
  {(filtered) => <SaqueCardGrid saques={filtered} onConfirmar={...} />}
</OperacoesFilterBar>
```

Os 3 SmartFilters antigos ficam deprecated no commit e são removidos após confirmação visual.

## Componentes shadcn aproveitados

`Popover`, `Command` (cmdk — já no projeto), `Badge`, `Button`, `Input`, `Tooltip`. Sem novas dependências.

## Animações

- Framer Motion já no projeto: chip aplicado → `layout` transition no totalizador (números animam).
- Faceta abrindo: fade + slide 4px (já default do Popover).

## Testes

- `useOperacoesFilter.test.ts`: aplicar/remover faceta, combinação AND entre facetas, OR dentro da mesma faceta, ordenação, persistência.
- `useSavedViews.test.ts`: CRUD, isolamento por usuário.
- Smoke test visual: render dos 3 cards com a barra nova.

## Entrega faseada (ordem dos commits)

1. **Hook + tipos + adapter** (`useOperacoesFilter`, `types.ts`) com testes.
2. **`FacetPopover`** isolado (componente puro, testável).
3. **`OperacoesFilterBar`** sem saved views — substitui os 3 SmartFilters.
4. **`SavedViewsBar`** + `useSavedViews` (camada opcional por cima).
5. Limpeza: remover `SaquesSmartFilter`, `SaqueProcessamentoSmartFilter`, `CasasLimitadasSmartFilter`.

## Riscos & mitigações

| Risco | Mitigação |
|---|---|
| Quebrar ordenação atual usada por operadores | Default = "mais antigo primeiro" (igual hoje) |
| Saved views poluindo localStorage entre usuários | Chave inclui `userId` do `useAuth` |
| Faceta "Casa" gera lista enorme | Popover já tem busca interna (cmdk) |
| Operador acostumado com input no topo | Busca textual continua, só fica à direita |

## Critérios de aceite

- Os 3 cards usam o mesmo componente.
- Totalizador reage a qualquer filtro aplicado.
- Filtros persistem ao recarregar a página.
- Ao menos 1 saved view padrão sugerida ("Atrasados >30d") aparece na primeira visita.
- Atalho `/` foca busca em qualquer um dos 3 cards focados.
- Nenhuma regressão nos handlers `onConfirmar`, `onProcessar`, `onCancelar`, `onSacar`.
