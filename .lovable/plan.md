
## Decisão
Manter a aba **Participações** no menu **Financeiro** (segregação de acesso: operadores não veem; só perfis financeiros autorizados). Foco: redesenho visual + correções estruturais. Sem mexer no backend (`participacao_ciclos`, RPC `fechar_ciclo`, `PagamentoParticipacaoDialog`).

## Mudanças propostas

### 1. Correção multimoeda (crítica)
- Carregar `projetos.moeda_projeto` no SELECT de `participacao_ciclos`.
- Em todos os KPIs e somas, converter `valor_participacao` para BRL via `convertToBRL` (cotações oficiais já usadas no Financeiro).
- Cada linha continua exibindo o valor na moeda do projeto, com `≈ R$ X` abaixo quando ≠ BRL (padrão `Dual Currency Card Display` da memória).
- Totais consolidados sempre em BRL.

### 2. Remoção de redundâncias visuais
- **KPI strip:** de 4 cards para **2**:
  - "Pendente" (Aguardando + Pronto p/ Pagar, consolidado BRL) — com sub-linha "X aguardando ciclo · Y prontos".
  - "Pago" (mês corrente, com toggle "este mês / total").
- Remover card "Total Ativo" (soma incoerente).
- Remover bucket `RECONHECIDO` da UI (estado sem caminho de criação).
- Corrigir `getBaseCalculoLabel` para refletir `LUCRO_BRUTO` vs `LUCRO_LIQUIDO` reais.

### 3. Novo layout — agrupado por investidor
Hoje é lista plana por status. Proposto: **lista mestre por investidor**, cada investidor é um card colapsável mostrando:
- Header: avatar + nome + total pendente (BRL) + contagem de ciclos.
- Body (expandido): tabela enxuta com linhas por ciclo: `Projeto · Ciclo · Apurado em · Valor (moeda) · Status · [Pagar]`.
- Botão "**Pagar todos do investidor**" no header — abre dialog que processa em sequência (loop sobre `PagamentoParticipacaoDialog`).
- Filtro existente (por investidor) permanece como atalho; novo filtro de **status** (Pendente / Pago) e **período**.

### 4. Histórico separado em sub-tab
Dentro da aba Participações, dois segmented controls no topo:
- **Pendências** (default) — pendentes agrupados por investidor.
- **Histórico** — pagamentos realizados, tabela cronológica com export CSV.

Reduz o scroll vertical pesado de hoje (3 collapsibles empilhados).

### 5. Polimento visual (padrão do sistema)
- Tokens semânticos do `index.css` em todos os acentos (azul/âmbar/esmeralda) — sem hex hardcoded.
- KPI cards padronizados com o mesmo componente já usado em outras abas (consistência).
- Estado vazio ilustrado em vez de texto seco.
- Badge de tipo (BÔNUS / AJUSTE) mantido, agora com filtro acionável.
- Linha do investidor: foto/iniciais + truncagem coerente em mobile.

### 6. Exportação
Novo botão "Exportar" no header → CSV de pendências ou histórico (respeitando filtros), colunas: investidor, projeto, ciclo, data apuração, data pagamento, valor moeda, valor BRL, tipo, status.

## Arquivos a tocar
- `src/components/financeiro/ParticipacaoInvestidoresTab.tsx` — reescrita do layout (KPIs, agrupamento por investidor, sub-tabs).
- `src/components/financeiro/ParticipacaoInvestidorCard.tsx` — **novo** card colapsável por investidor.
- `src/components/financeiro/ParticipacaoHistoricoTable.tsx` — **novo** tabela do histórico + export.
- `src/hooks/useParticipacoesConsolidadas.ts` — **novo** hook que carrega `participacao_ciclos` + `projetos.moeda_projeto`, aplica `convertToBRL`, agrupa por investidor e expõe totais BRL.
- `src/lib/financeiro/exportParticipacoesCSV.ts` — **novo**.
- Sem migrations, sem alterações em RPC.

## Fora de escopo
- Não alterar `participacao_ciclos`, `fechar_ciclo`, ou `PagamentoParticipacaoDialog`.
- Não mover criação manual para Projetos (mantém botão "Nova Participação" na própria aba, já que o acesso é restrito ao Financeiro).
- Não tocar na coluna Participações da Análise Temporal (já está correta).

Aplico?
