# Plano: Unificar "Saldo Irrecuperável" e "Scan" em um único conceito (Ocorrência de Scan)

## Diagnóstico — por que hoje existe redundância

Hoje o mesmo evento operacional ("a casa baniu/limitou a conta e o saldo travou") é registrado por **três caminhos diferentes**, sem comunicação entre si:

| Fluxo | Origem | O que grava | Marca a ocorrência como scan? |
|---|---|---|---|
| `ReportarScanDialog` (Caixa) | manual no Caixa | `cash_ledger` com descrição `[SCAN CASA]` / `[SCAN PARCEIRO]`, tipo `PERDA_OPERACIONAL` | **Não cria ocorrência** |
| `RegistrarPerdaRapidaDialog` (Parceiros) | botão "Registrar perda" | cria **ocorrência** + acumula em `bookmakers.saldo_irrecuperavel` | sub_motivo `saldo_irrecuperavel` (texto interno, sem UI clara) |
| Ocorrência aberta resolvida com perda | módulo de Ocorrências | gera `cash_ledger`; se `sub_motivo='saldo_irrecuperavel'`, **também** soma em `bookmakers.saldo_irrecuperavel` | igual acima |

Consequências:
- O auditor que olha "Perdas confirmadas" vê o lançamento via ledger, mas **não consegue clicar e abrir a ocorrência** — o ledger não guarda o `ocorrencia_id`.
- O campo `bookmakers.saldo_irrecuperavel` virou um *memo* que sobrevive depois de a perda já ter sido reconhecida no ledger → conta duas vezes para o usuário leigo (sai do patrimônio via perda + ainda figura em "estoque irrecuperável").
- O `ReportarScanDialog` do Caixa não cria ocorrência nenhuma — então uma casa "scaneada" pelo caixa não dispara fluxo de tentativa de recuperação, sem rastro de quem reportou, sem SLA.
- `sub_motivo='saldo_irrecuperavel'` é uma string interna não exposta ao usuário; mesmo se a ocorrência aparece, não tem badge "Scan".

A leitura correta: **"saldo irrecuperável" é apenas o efeito de um Scan da casa**. Não é uma categoria independente — é uma classe de ocorrência. A solução é tratar Scan como tipo de ocorrência de primeira classe e descontinuar o acumulador.

## Modelo proposto

### 1. Ocorrência ganha a classificação canônica de Scan
Hoje a tabela `ocorrencias` já tem `tipo`, `sub_motivo`, `resultado_financeiro`. Padronizar:

- **`sub_motivo`** passa a usar dois valores oficiais novos: `SCAN_CASA` e `SCAN_PARCEIRO` (em maiúsculas, para destacar de `documento_pendente`, `conta_suspensa` etc. que são minúsculos hoje).
- Manter o legado `saldo_irrecuperavel` como **alias na leitura** (mapeia para `SCAN_CASA`) por compatibilidade dos registros antigos.
- Resolução **sempre** com `resultado_financeiro='perda_confirmada'` quando o operador confirma o scan; isso aciona a criação automática do `cash_ledger` que já existe.

### 2. Caixa: Reportar Scan vira atalho que cria a ocorrência
`ReportarScanDialog.tsx`:
- Hoje grava diretamente no `cash_ledger`.
- Passa a **criar uma ocorrência** (`tipo='SCAN'` ou tipo existente equivalente, `sub_motivo='SCAN_CASA'/'SCAN_PARCEIRO'`, `valor_perda`, `bookmaker_id`/`conta_bancaria_id`, `parceiro_id`) e **resolver imediatamente** com `resultado_financeiro='perda_confirmada'`.
- O ledger é gerado pelo mesmo trigger/handler que já existe para ocorrências resolvidas → uma única porta de entrada para perdas de scan.
- O ledger passa a guardar `ocorrencia_id` (campo já existente em `cash_ledger` pelo padrão atual; se não existir, é um JSON pequeno em `meta`/`contexto_metadata`).

### 3. Parceiros: Registrar Perda Rápida usa o mesmo fluxo
`RegistrarPerdaRapidaDialog.tsx`:
- Já cria ocorrência. Trocar `categoria/sub_motivo` para `SCAN_CASA` (ou `SCAN_PARCEIRO` se for via conta bancária do parceiro).
- **Remover** o passo que escreve em `bookmakers.saldo_irrecuperavel`.

### 4. `useOcorrencias.ts` deixa de acumular `saldo_irrecuperavel`
- Remover os três blocos que fazem `update({ saldo_irrecuperavel: ... })` na resolução, edição e reversão (linhas 425, 670, 753 atuais).
- A perda já é reconhecida pelo `cash_ledger` — não precisa de acumulador paralelo.

### 5. Coluna `bookmakers.saldo_irrecuperavel` é **depreciada** (não dropada agora)
- Mantida no schema para não quebrar leitores (`useProjetoResultado`, `useProjetoDashboardData`, `GestaoProjetos`).
- Os leitores deixam de exibir o número como "estoque" — passam a calcular, quando útil, a soma das **ocorrências de scan abertas/recentes** daquela casa via `ocorrencias`.
- Drop físico fica para uma migration futura, depois de validar que ninguém depende mais do campo.

### 6. UI da aba Financeiro
- **Remover** a seção "Saldo irrecuperável (estoque)" do `ExposicaoFinanceiraCard`.
- "Perdas confirmadas no período" passa a ser a única vitrine de scans (já vem do ledger), agora com badge **"Scan"** quando o ledger tem `ocorrencia_id` cuja ocorrência tem `sub_motivo IN ('SCAN_CASA','SCAN_PARCEIRO')`.
- Card de uma casa "scaneada" no kanban / dashboard de projetos pode exibir um chip "🚫 Scaneada" quando existir ocorrência ativa de `SCAN_CASA` apontando para o bookmaker — leitura derivada, sem acumulador.

### 7. Marcador visual "Casa scaneada"
- Hook leve `useBookmakerScanStatus(bookmakerId)` que devolve `{ isScanned: boolean, dataUltimoScan?: string, valorTotalScans: number }` consultando `ocorrencias` com `sub_motivo IN ('SCAN_CASA')` e `resultado_financeiro='perda_confirmada'`.
- Usar em GestaoProjetos / dashboard do projeto / drawer de perdas.

## Fases de implementação

### Fase 1 — Padronização lógica (sem migration, baixo risco)
1. Atualizar `RegistrarPerdaRapidaDialog` para gravar `sub_motivo='SCAN_CASA'` e **parar** de acumular `saldo_irrecuperavel`.
2. Atualizar `useOcorrencias` para parar de tocar em `saldo_irrecuperavel` (manter leitura legada).
3. Atualizar `useExposicaoFinanceira`: identificar perda como scan quando `descricao` começa com `[SCAN ` ou o `sub_motivo` é `SCAN_*` (incluindo legado `saldo_irrecuperavel`).
4. `PerdasList`: adicionar pequeno badge "Scan" ao lado do "Casa de Apostas".

### Fase 2 — Unificar Caixa
5. Refatorar `ReportarScanDialog` para criar+resolver uma ocorrência em vez de inserir no ledger direto. Mensagem de sucesso muda para "Scan registrado · ocorrência aberta".
6. Backfill **opcional**: nada precisa ser feito retroativamente — perdas antigas no ledger com `[SCAN CASA]` continuam exibindo como scan pela regex de detecção.

### Fase 3 — Remover card "Saldo irrecuperável" do Financeiro
7. Tirar a seção do `ExposicaoFinanceiraCard` (já validado: zero registros com valor > 0 hoje no workspace).
8. Manter `totalIrrecuperavel` no payload do hook para outros consumidores; o card simplesmente não renderiza mais.

### Fase 4 — Limpeza (futura, opcional)
9. Migration para dropar `bookmakers.saldo_irrecuperavel` quando nenhum leitor depender mais — fora do escopo desta entrega.

## Fora de escopo
- Não criar migrations agora.
- Não alterar lógica do `cash_ledger`, triggers de saldo, RPCs financeiros.
- Não tocar em `useProjetoResultado`/`GestaoProjetos` na Fase 1 — eles continuam lendo a coluna até a Fase 4.

## Resultado esperado
- **Um único conceito**: Scan da Casa = Ocorrência com `sub_motivo='SCAN_CASA'` resolvida como perda. Toda a contabilidade passa pelo ledger, com rastro pra ocorrência original.
- Aba Financeiro fica enxuta: Patrimônio · Posição · Lucro · Margem · Custos · **Exposição (Em disputa + Perdas confirmadas)**. Sem "estoque irrecuperável" duplicando informação.
- Operador reporta scan no Caixa **ou** nos Parceiros — mesma estrutura, mesmo destino, mesma auditoria.

## Pergunta de decisão
Antes de implementar a Fase 2, confirme: o `ReportarScanDialog` do Caixa deve **sempre** abrir uma ocorrência (recomendo sim, para ter rastro/auditoria), ou você prefere mantê-lo como lançamento rápido direto no ledger e só padronizar a leitura/badge? A diferença prática é ganho de governança vs. um clique a mais.
