# Investigação — Perna composta não renderiza nos cards de listagem

**Objetivo:** identificar, com evidência de log, por que uma perna composta por múltiplas casas (ex: Empate = VAVE + HUGEWIN em Norway × Senegal) aparece completa no modo edição mas incompleta nos cards de "Todas as Apostas", Surebet e Bônus — com rodapé (Lucro Garantido / Total Apostado / ROI) e moeda de conciliação errados.

**Regra-mestre:** nenhuma correção nesta rodada. Entrega é o diagnóstico da Fase 4.

---

## Fase 0 — Reconhecimento (read-only)

Mapear, sem alterar nada:

1. **Modelo de dados da perna composta**
   - Confirmar relação `apostas_unificada` → `apostas_pernas` (1:N) → `apostas_perna_entradas` (1:N) e quais colunas carregam moeda/odd/stake/bookmaker por entrada vs. por perna vs. pai.
   - Validar onde mora `cotacao_snapshot`, `moeda_operacao`, `consolidation_currency`, `stake_consolidado`, `pl_consolidado`.

2. **Tela de edição (referência correta)**
   - Localizar a query usada por `SurebetWindowPage` / `ApostaWindowPage` para hidratar a operação. Confirmar que ela faz eager-load de `apostas_pernas → apostas_perna_entradas` (já se sabe que funciona).

3. **Telas de listagem (suspeitas)**
   - `ProjetoApostasTab` ("Todas as Apostas") — query e mapeamento para `SurebetCard`.
   - Aba **Surebet** do projeto — qual componente/hook, qual query.
   - Aba **Bônus**, **DuploGreen**, **ValueBet**, **Punter** — idem, conferir se cada uma tem sua própria query (padrão conhecido neste projeto).
   - Para cada uma: verificar se o `select` inclui `apostas_perna_entradas` e se o mapper monta `entries[]` em cada `SurebetPerna`.

4. **Cálculo do rodapé do card**
   - Localizar onde `SurebetCard` (ou wrapper) calcula Stake Total / Lucro Garantido / ROI. Confirmar se itera `perna.entries[]` ou apenas `perna.stake/odd`.
   - Confronto com o cálculo do formulário (engine de surebet) para ver se é compartilhado ou duplicado.

5. **Moeda de conciliação**
   - Identificar de onde vem na renderização (campo persistido `consolidation_currency` / `moeda_operacao='MULTI'` vs. inferência client-side). Verificar fallback quando perna tem múltiplas moedas.

**Saída da fase:** tabela "tela × hook × query × inclui entradas? × usa entries no cálculo? × fonte da moeda".

---

## Fase 1 — Instrumentação (logs temporários `// TEMP-DEBUG`)

Adicionar logs marcados, fáceis de remover, em:

- Query da **edição**: dump cru da operação Norway × Senegal incluindo `apostas_pernas[*].apostas_perna_entradas[*]`.
- Query de **cada listagem** afetada (Todas as Apostas, Surebet, Bônus, etc.): mesmo dump, no mesmo ponto (antes do mapper).
- **Mapper** de cada listagem: input cru → output (`SurebetPerna` com/sem `entries[]`).
- **`SurebetCard`**: ao montar, logar `pernas.map(p => ({ id, entriesLen: p.entries?.length, moedas, stakes }))`.
- **Cálculo do rodapé**: input (todas as entries com moeda) e output (Stake Total, Lucro Garantido, ROI, moeda exibida).

Cada log deve incluir um `tag` único (`TEMP-DEBUG:edit-query`, `TEMP-DEBUG:list-query:apostas`, etc.) para grep/remoção em massa.

---

## Fase 2 — Reprodução controlada

Sem inserir dados novos:

1. Abrir, no preview autenticado via Playwright, o projeto **ITALO**:
   - Norway × Senegal → abrir edição → coletar logs.
   - Mesma operação → ver em "Todas as Apostas" → coletar logs.
   - Mesma operação → aba Surebet → coletar logs.
   - Mesma operação → aba Bônus (se aplicável à estratégia "Extração de Bônus") → coletar logs.
2. Repetir tudo para **Ponte Preta × Grêmio Novorizontino**.
3. Consolidar logs em `/tmp/browser/perna-composta/` (arquivos por tela).

---

## Fase 3 — Análise comparativa

Para cada um dos 3 sintomas, comparar lado a lado edição × listagem:

| Sintoma | Pergunta-chave | Evidência decisiva |
|---|---|---|
| Perna incompleta (só Vave) | A 2ª entrada chega no payload do card? | Diff dos dumps crus de query |
| Rodapé errado | O cálculo recebe a 2ª entrada e ignora, ou nem recebe? | Log do input do cálculo |
| Moeda de conciliação perdida | Campo ausente na query, default no componente, ou inferência que assume 1 moeda? | Log da fonte da moeda no render |

Determinar se é **uma causa única** (query da listagem não traz `apostas_perna_entradas` → tudo cai em cascata) ou **causas distintas** (ex: query ok, mas cálculo do rodapé é função separada com bug próprio).

Rodar `git log -p` nos arquivos de query/mapper das listagens para identificar regressão (commit suspeito que removeu `apostas_perna_entradas` do select ou alterou o mapper).

---

## Fase 4 — Diagnóstico (checkpoint, sem corrigir)

Entregar relatório com:

1. **Causa raiz** de cada sintoma (mesma ou distintas), com trecho de log que prova.
2. **Diferença exata** entre query/mapper da edição vs. listagem.
3. **Commit/PR suspeito** da regressão (se identificável).
4. **Escopo do impacto**: lista exata de telas afetadas (Todas as Apostas, Surebet, Bônus, DuploGreen, ValueBet, Punter — confirmar uma a uma).
5. **Proposta de correção** e decisão arquitetural:
   - Centralizar em um hook único compartilhado com a edição, **ou**
   - Replicar o fix (select + mapper de `entries[]`) em cada listagem, seguindo o padrão já aplicado em `ProjetoApostasTab` na rodada anterior.
6. Necessidade ou não de invalidação de cache (`invalidateCanonicalCaches`).
7. Plano de remoção dos `// TEMP-DEBUG`.

**Aguardar aprovação antes da Fase 5 (implementação).**

---

## Regras de execução

- Zero alteração em lógica de leitura/cálculo/render financeira nesta rodada — apenas logs temporários.
- Reprodução automatizada via Playwright contra o preview; nenhum dado novo inserido.
- Tratar os 3 sintomas como hipóteses independentes até a evidência unificar (ou não).
- Respeitar memórias do projeto: snapshot por operação, proibição de recálculo client-side em surebet P&L, paridade com Cotação de Trabalho.

## Detalhes técnicos (referência)

- Arquivos prováveis a instrumentar:
  - `src/pages/SurebetWindowPage.tsx`, `src/pages/ApostaWindowPage.tsx` (edição)
  - `src/components/projeto-detalhe/ProjetoApostasTab.tsx` (já parcialmente corrigido — revalidar)
  - Tabs Surebet/Bônus/DuploGreen/ValueBet/Punter em `src/components/projeto-detalhe/`
  - `SurebetCard` e seu hook de cálculo de rodapé
  - `useApostasPernas` / hooks equivalentes
- Tabelas: `apostas_unificada`, `apostas_pernas`, `apostas_perna_entradas`.
- Chaves a observar no select: `apostas_perna_entradas(id, bookmaker_id, moeda, odd, stake, stake_real, stake_freebet, stake_brl_referencia, cotacao_snapshot, fonte_saldo, tipo, comissao)`.
