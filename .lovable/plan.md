# Ocorrências × Reconciliação/Ajuste Manual — Análise e Plano

## 1. Situação atual (o que existe hoje)

- **Ocorrências Operacionais** (`ocorrencias`): rastreiam eventos que geram risco/perda em uma casa — tipos: `kyc`, `bloqueio_contas`, `bloqueio_bancario`, `saques`, `depositos`, `financeiro`, `movimentacao_financeira`. Guardam `valor_risco` (exposição) e, ao serem resolvidas, podem gerar `valor_perda` no ledger via `registrarPerdaOperacionalViaLedger`.
- **Reconciliação Forçada** (`ReconciliacaoDialog`) e **Ajuste Manual** (`AjusteManualDialog`): ambos gravam `cash_ledger.tipo_transacao = 'AJUSTE_RECONCILIACAO'`, ajustando o saldo da casa para bater com o extrato real. Nenhum dos dois consulta ou toca em `ocorrencias`.

**Conclusão da análise:** hoje os dois fluxos são independentes. Uma reconciliação/ajuste pode zerar/corrigir o saldo de uma casa que ainda tem ocorrência aberta sinalizando risco — resultando exatamente no cenário "órfão" descrito.

## 2. Cenários de risco identificados

1. **Ocorrência órfã por resolução externa** — usuário reconcilia a casa (ex.: recuperou o saldo, casa devolveu valor bloqueado). A ocorrência continua "Aberto" apontando `valor_risco` inexistente. Central de Operações mostra alerta falso.
2. **Dupla contabilização de perda** — usuário faz Ajuste Manual debitando o saldo perdido e depois resolve a ocorrência como "perda_confirmada", o que dispara `registrarPerdaOperacionalViaLedger` e debita de novo. Resultado: perda dobrada no P&L do projeto.
3. **Divergência de auditoria** — `projeto_perdas` só é populado quando a ocorrência é resolvida. Se a perda foi lançada via ajuste manual, ela nunca aparece no relatório de perdas por ocorrência.
4. **Reconciliação sem contexto** — reconciliar uma casa com ocorrência aberta sem que o operador saiba que existe uma pendência relacionada pode mascarar problemas reais (ex.: saldo veio de outra fonte que não a resolução do incidente).

## 3. Regras de negócio propostas

Princípio: **reconciliação/ajuste NÃO fecha ocorrência automaticamente** (são decisões operacionais distintas), mas o sistema precisa **alertar, vincular e prevenir dupla contagem**.

**R1 — Aviso pré-ajuste.** Ao abrir Reconciliação ou Ajuste Manual em uma casa com ocorrência(s) aberta(s), exibir banner:
> "Esta casa possui N ocorrência(s) em aberto (R$ X de risco). O ajuste pode estar relacionado. Confira antes de prosseguir."
Com CTA "Ver ocorrências".

**R2 — Vinculação opcional.** No formulário de ajuste, quando há ocorrência aberta na casa, oferecer combobox "Vincular a ocorrência (opcional)". Se vinculada:
- Grava `cash_ledger.ocorrencia_id` (nova coluna nullable).
- Marca a ocorrência com `resolucao_via_ajuste = true` e `ajuste_ledger_id`.
- Bloqueia o path de "registrar perda pelo ledger" ao resolver aquela ocorrência (evita R2/dupla contagem).

**R3 — Aviso pré-resolução.** Ao resolver uma ocorrência, se existir `cash_ledger` com `AJUSTE_RECONCILIACAO` na mesma casa entre `ocorrencia.created_at` e agora e SEM `ocorrencia_id`, exibir aviso:
> "Detectamos um ajuste manual de R$ Y neste período. Deseja vincular como resolução em vez de registrar nova perda?" — opções: **Vincular** / **Registrar perda mesmo assim** / **Cancelar**.

**R4 — Job de detecção diária ("órfãos").** Query que lista ocorrências abertas há > 7 dias cuja casa teve ajuste de reconciliação após a abertura sem vínculo. Exposta em `CentralOperacoes` como alerta "Ocorrências possivelmente resolvidas por reconciliação".

**R5 — Nenhum fechamento automático.** Manter decisão humana. Motivo: reconciliação pode representar aporte extra, ganho, transferência — não necessariamente a resolução do incidente.

## 4. Implementação

**Schema (migration)**
- `ALTER TABLE cash_ledger ADD COLUMN ocorrencia_id UUID REFERENCES ocorrencias(id)` (index).
- `ALTER TABLE ocorrencias ADD COLUMN resolucao_via_ajuste BOOLEAN DEFAULT false`, `ADD COLUMN ajuste_ledger_id UUID REFERENCES cash_ledger(id)`.

**Frontend**
- `src/hooks/useOcorrenciasAbertasPorCasa.ts` (novo): retorna ocorrências abertas por `bookmaker_id`.
- `ReconciliacaoDialog.tsx` e `AjusteManualDialog.tsx`:
  - Banner com contagem/valor de ocorrências abertas (R1).
  - Combobox `ocorrencia_id` opcional (R2).
  - Ao submeter, gravar `ocorrencia_id` no ledger e — se vinculado — atualizar a ocorrência.
- `ResolucaoFinanceiraDialog.tsx`:
  - Consulta ajustes recentes sem vínculo (R3) e exibe modal de conciliação.
  - Se o operador escolher "Vincular", pular `registrarPerdaOperacionalViaLedger` e apenas registrar `projeto_perdas` (auditoria) referenciando o `ledger_id` do ajuste.
- `CentralOperacoes` — nova seção "Possíveis órfãos" (R4) usando view/RPC `v_ocorrencias_possivelmente_resolvidas`.

**Backend (RPC/view)**
- View `v_ocorrencias_possivelmente_resolvidas`: join `ocorrencias` abertas × `cash_ledger AJUSTE_RECONCILIACAO` sem `ocorrencia_id` no mesmo `bookmaker_id` posterior a `ocorrencias.created_at`.

## 5. O que este plano NÃO faz

- Não altera `saldo_atual` diretamente (segue via ledger).
- Não fecha ocorrências sozinho.
- Não retroage vínculos em ajustes já feitos — apenas surfaça na tela de "possíveis órfãos" para tratamento manual.

## 6. Entregáveis

1. Migration com colunas e view.
2. Hook `useOcorrenciasAbertasPorCasa`.
3. Ajustes em `ReconciliacaoDialog`, `AjusteManualDialog`, `ResolucaoFinanceiraDialog`.
4. Card "Possíveis órfãos" em Central de Operações.
5. Memória: `mem://architecture/ocorrencias-reconciliacao-sync-standard.md` documentando as regras R1–R5.
