## Contexto

Hoje o modelo de wallets crypto já suporta 3 camadas de saldo (`balance_total`, `balance_locked`, `balance_available`) e um `transit_status` (`PENDING`, `CONFIRMED`, `FAILED`, `REVERSED`) no `cash_ledger`. A view `v_saldo_parceiro_wallets` expõe `saldo_locked` e `saldo_disponivel`.

O problema é de **consistência de leitura**: alguns módulos usam `saldo_disponivel`, outros somam ledger sem filtrar `transit_status`, e o dialog "Visualizar Parceiro → Cripto" mostra apenas o disponível — escondendo o capital em trânsito. Também faltam estados para operações "presas" (endereço incorreto, expiradas, intervenção manual).

## Objetivo

Padronizar em todo o sistema a exibição de três blocos semânticos por wallet / parceiro / caixa:

- **Disponível** — já conciliado, pode ser usado em operações
- **Em Trânsito** — pendente de conciliação (pode falhar, ser revertido, cancelado)
- **Total Potencial** — Disponível + Em Trânsito, sempre com marcador visual de que parte é condicional

Nenhum módulo deve tratar "Em Trânsito" como disponível para operar.

## 1. Modelo de dados — extensões

### 1.1 Ampliar `transit_status`

Estados atuais: `PENDING`, `CONFIRMED`, `FAILED`, `REVERSED`.
Adicionar:

| Novo status | Uso |
|---|---|
| `STUCK` | Operação parada por tempo indeterminado (blockchain, exchange), sem decisão ainda |
| `WRONG_ADDRESS` | Enviada para endereço incorreto — requer intervenção |
| `EXPIRED` | Passou do SLA definido sem conciliação |
| `MANUAL_REVIEW` | Sinalizada pelo operador para investigação |
| `CANCELLED` | Cancelamento explícito antes de qualquer confirmação |

Regra: qualquer status ≠ `CONFIRMED` **mantém** o valor em `balance_locked`. Somente `CONFIRMED` efetiva o débito. `FAILED`, `REVERSED`, `CANCELLED` liberam o lock. `STUCK`, `WRONG_ADDRESS`, `EXPIRED`, `MANUAL_REVIEW` **continuam travando** o saldo (não some do patrimônio, mas também não está disponível).

### 1.2 Campos auxiliares em `cash_ledger`

- `transit_reason` (text, nullable) — motivo textual quando status ≠ CONFIRMED
- `transit_expected_at` (timestamptz, nullable) — ETA para conciliação (usado por job de EXPIRED)
- `transit_updated_at` (timestamptz) — última mudança de status
- `transit_updated_by` (uuid) — quem alterou

### 1.3 View unificada

Criar/atualizar `v_saldo_parceiro_wallets` (e uma nova `v_saldo_parceiro_consolidado`) para expor **sempre 3 colunas**:

```
saldo_disponivel   -- CONFIRMED líquido
saldo_em_transito  -- Σ locks com status ≠ CONFIRMED/FAILED/REVERSED/CANCELLED
saldo_total        -- disponivel + em_transito
```

Detalhamento opcional por sub-status em `saldo_transito_breakdown` (jsonb).

### 1.4 Job de expiração

Cron diário: transações `PENDING` com `transit_expected_at < now() - interval '48h'` → `EXPIRED` + notificação em Central de Ocorrências.

## 2. Camada de leitura no frontend

### 2.1 Hook único

Estender `useWalletTransitBalance` (ou criar `useParceiroSaldoConsolidado`) para retornar sempre:

```ts
{ disponivel, emTransito, total, breakdown: { pending, stuck, wrongAddress, expired, manualReview } }
```

Todos os módulos passam a consumir este hook — proibido somar ledger direto para exibição de saldo.

### 2.2 Componente `SaldoTrifasico`

Novo componente compartilhado em `src/components/wallets/SaldoTrifasico.tsx` com 3 variantes:

- **`compact`** — inline: `Disp $76 · Trânsito $45 · Total ≈$121` (usado em cards de listagem)
- **`stacked`** — 3 linhas com ícones (Central de Ocorrências, Caixa Operacional)
- **`detailed`** — bloco com breakdown por sub-status + tooltip explicando cada estado (dialog Visualizar Parceiro)

Cores semânticas: Disponível = `text-success`, Trânsito = `text-warning`, Total = `text-muted-foreground` com sufixo `≈` e ícone de alerta se `emTransito > 0`.

## 3. Pontos de integração

| Módulo | Estado atual | Alvo |
|---|---|---|
| Caixa Operacional → Saldos por Parceiro | Mostra disponível + em trânsito separados | Migrar para `SaldoTrifasico` (padrão) |
| Gestão de Parcerias → Visualizar Parceiro → Crypto | Mostra só `balance_available` como "SALDO ATUAL" | Substituir por `SaldoTrifasico` variante `detailed` |
| Card da wallet em Parceiros | Só disponível | Trifásico compact |
| Conciliação | Já lista PENDING | Adicionar filtros por sub-status (STUCK, WRONG_ADDRESS, EXPIRED) e ações "Marcar como travada", "Endereço incorreto", "Cancelar" |
| Central de Ocorrências | Não avisa transito parado | Novo alerta "Transações em trânsito há +48h" |
| Posição de Capital / Financial Map | Usa `balance_total` | Ajustar para `disponivel` + card informativo "US$ X em trânsito" |
| Validação de saldo em operações (surebet, saques) | Já usa `balance_available` | Manter — proibir uso de total |

## 4. UX — Regras de exibição

1. Sempre que `emTransito > 0`, exibir badge/ícone `⏳` ao lado do total.
2. Total Potencial sempre com prefixo `≈` e cor neutra — nunca em verde.
3. Tooltip padrão: *"Inclui $X aguardando conciliação. Este valor pode não se concretizar (falha, cancelamento, endereço incorreto)."*
4. Em modais de operação (saque, aposta): usar somente Disponível; se usuário tentar operar acima, mostrar mensagem *"Saldo insuficiente — $X está em trânsito e não pode ser usado até conciliação."*
5. Breakdown detalhado só no dialog do parceiro e na Conciliação.

## 5. Cenários cobertos

| Cenário | Status | Efeito no saldo |
|---|---|---|
| Envio confirmado | CONFIRMED | Efetiva débito, remove do trânsito |
| Falha na blockchain | FAILED | Libera lock, volta a disponível |
| Reversão explícita | REVERSED | Libera lock |
| Cancelamento pré-envio | CANCELLED | Libera lock |
| Preso (>48h sem conciliar) | STUCK / EXPIRED | Continua em trânsito, alerta em Central |
| Endereço incorreto | WRONG_ADDRESS | Continua em trânsito, requer decisão manual (recuperar / marcar como perda via AJUSTE_SALDO) |
| Sob revisão | MANUAL_REVIEW | Continua em trânsito, bloqueia auto-expiração |

## 6. Entregáveis (ordem sugerida)

1. **Migração DB** — novos enums de `transit_status`, campos auxiliares, atualização de `v_saldo_parceiro_wallets`, RPC `get_parceiro_saldo_consolidado`.
2. **Hook `useParceiroSaldoConsolidado`** + adaptação do `useWalletTransitBalance`.
3. **Componente `SaldoTrifasico`** (3 variantes) + testes visuais.
4. **Substituição por módulo**: ParceiroDialog (Crypto tab) → Caixa Operacional → Cards de wallet → Posição de Capital.
5. **Conciliação**: novas ações (Marcar como travada / endereço incorreto / cancelar) + filtros por sub-status.
6. **Job cron** de expiração + integração com Central de Ocorrências.
7. **Memória**: atualizar `wallet-transit-balance-architecture.md` com os novos estados e regra "todo módulo lê via hook, nunca soma ledger direto para saldo".

## Detalhes técnicos

- Não alterar `balance_total` diretamente em nenhum ponto — continua sendo função exclusiva de `confirm_wallet_transit` / `lock_wallet_balance` / `unlock_wallet_balance`.
- Adicionar RPC `mark_wallet_transit_status(ledger_id, new_status, reason)` para transições entre estados intermediários (PENDING↔STUCK↔WRONG_ADDRESS↔MANUAL_REVIEW) sem mexer no lock.
- `FAILED`, `REVERSED`, `CANCELLED` continuam usando `revert_wallet_transit` (libera lock).
- Filtro de trânsito na view: `WHERE transit_status NOT IN ('CONFIRMED','FAILED','REVERSED','CANCELLED')`.
- Manter idempotência por `ledger_id` em toda transição.

Confirma a direção antes de eu implementar? Posso começar pela migração (passo 1) e componente compartilhado (passo 3), que destravam os demais.
