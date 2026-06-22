
# Plano: alinhar conversão com o donut de Posição de Capital — e remover a linha problemática

## Diagnóstico que motiva o plano

O donut "Posição de Capital" mostra **R$ 39.167** como total do workspace LABBET. Esse número usa **uma fonte única e consistente** de conversão:

- **Origem**: `src/components/caixa/PosicaoCapital.tsx` (linhas 137, 158, 172, 190, 203)
- **Funções**: `convertToBRL()` e `convertUSDtoBRL()` do hook `useCotacoes()`
- **Aplicado a**: cada bucket (Bookmakers, Caixa Operacional, Wallets Parceiros, Contas Parceiros) é convertido **na hora**, na moeda nativa de cada item

Já o card `PosicaoCapitalCard` (com a linha problemática "Fundos fora de projetos") recebe `patrimonioAtual` **já convertido** pela função `calc.formatCurrency` do `Financeiro.tsx`, que usa uma rota de conversão diferente (`convertUnified` em `src/pages/Financeiro.tsx:91`). E a engine canônica do Resultado Teórico (`fetchProjetosLucroCanonico`) usa uma **terceira** fonte: `cotacao_snapshot` congelada por operação no banco.

→ Três fontes de cotação no mesmo card. Por isso "Fundos fora" pode dar **−R$ 982**: não é falta de saldo, é **incompatibilidade de cotação** entre as três engines.

---

## Decisão arquitetural proposta

**Remover a linha "Fundos fora de projetos"** do card e converter o `PosicaoCapitalCard` num modelo **fechado por construção**, onde a aritmética **não pode** não bater.

### Modelo novo (3 linhas, todas consistentes)

```text
Composição do Patrimônio Atual            R$ 39.167,52
├ Capital próprio investido                R$ 34.906,00   (do hook usePosicaoCapital)
└ Resultado da operação (acumulado)        R$  4.261,52   (= Patrimônio − Capital, FECHA SEMPRE)
       ↳ clicável → drawer "Origem por projeto"

Freebet em estoque (informativo)            R$ XX,XX
```

A linha "Resultado da operação" passa a ser **calculada por subtração** usando o mesmo Patrimônio que o donut mostra. Por construção, **Capital + Resultado = Patrimônio**. Não há resíduo, não há "fundos fora", não há dúvida.

O drawer clicável continua mostrando a **origem por projeto** (engine canônica), mas com um aviso explícito quando a soma dos projetos diverge do "Resultado da operação" calculado por subtração. Essa divergência (que era a antiga "fundos fora") passa a ser **uma nota de auditoria dentro do drawer**, não um KPI no card.

---

## Por que esta solução é melhor

| Antes | Depois |
|---|---|
| 3 fontes de cotação no mesmo card | 1 fonte (a do donut) |
| Linha "Fundos fora" mostra negativo, confunde | Linha removida |
| Resultado Teórico vinha da engine canônica (snapshot) | Resultado = subtração, fecha sempre |
| Drift cambial vira "vazamento" visual | Drift cambial fica isolado no drawer como nota informativa |
| Usuário não sabe se é bug ou normal | Card transmite segurança; divergência é exposta sob demanda |

---

## Mudanças propostas (arquivos)

### 1. `src/pages/Financeiro.tsx`
- Trocar o cálculo de `patrimonioTotal` (linha 373-377) para usar **exatamente** os mesmos números que alimentam o donut `<PosicaoCapital>` (já passados pelas props `saldosFiat`, `saldosBookmakers`, etc.), aplicando `convertToBRL`/`convertUSDtoBRL` do `useCotacoes`.
- Garantir que `<PosicaoCapital>` e `<PosicaoCapitalCard>` recebam o **mesmo valor** de patrimônio.

### 2. `src/components/financeiro/PosicaoCapitalCard.tsx`
- **Remover** as linhas:
  - "Resultado teórico (atual)" (linha 264-272)
  - "↳ Capital exposto nas casas" (linha 273-281)
  - "Fundos fora de projetos" (linha 282-290)
- **Adicionar** uma única linha "Resultado da operação (acumulado)" calculada como `patrimonioAtual − capitalLiquidoAcumulado`.
- Manter a linha clicável que abre o `ResultadoPorProjetoDrawer` — agora com foco único "origem por projeto".
- Manter "Freebet em estoque (informativo)" como hoje.
- Remover toda a lógica de `resultadoTeorico`, `capitalExposto`, `fundosForaDeProjetos` do componente.

### 3. `src/components/financeiro/ResultadoPorProjetoDrawer.tsx`
- Acrescentar **um único bloco** no rodapé chamado "Reconciliação com o Patrimônio":
  ```text
  Resultado da operação (Patrimônio − Capital):   R$ 4.261,52
  Soma do Lucro Operacional dos projetos:          R$ X.XXX,XX
  ─────────────────────────────────────────
  Divergência:                                    R$ XXX,XX
  
  Causas conhecidas:
  • Drift cambial (cotação atual vs snapshot por operação)
  • Saldos sem projeto_id_snapshot (caixa, parceiros)
  • Projetos arquivados com saldo residual
  ```
- Esse bloco substitui a antiga "fundos fora" como ferramenta de auditoria, mas **não polui o card**.

### 4. Hook `useResultadoPorProjeto.ts`
- Sem mudanças no cálculo principal.
- Apenas expor um campo extra `divergenciaComPatrimonio = patrimonio − capital − somaLucroOperacionalProjetos` para o bloco de reconciliação do drawer.

---

## O que NÃO muda
- Engine canônica de Lucro Operacional dos projetos — preservada.
- Cards individuais de projeto — preservados.
- KPI "Lucro Operacional" do dashboard — preservado.
- Donut "Posição de Capital" — preservado, vira a **fonte única de verdade** do patrimônio.
- Cálculos de aportes/liquidações — preservados.

---

## Critérios de aceite
1. `<PosicaoCapital>` (donut) e `<PosicaoCapitalCard>` (lista) mostram **exatamente** o mesmo `patrimonioAtual` em BRL — diferença ≤ R$ 0,01.
2. No card, **Capital próprio + Resultado da operação = Patrimônio Atual** (igualdade exata, por construção).
3. Linha "Fundos fora de projetos" deixa de existir.
4. Drawer "Origem por projeto" continua funcional; ao fim mostra bloco de reconciliação que pode ter divergência (sem alarmar o usuário no card).
5. Tooltips atualizados explicando o novo modelo: "Resultado da operação = todo o ganho ou perda implícito no patrimônio que não é capital próprio".

---

## Nota de honestidade
Esta proposta **esconde** a divergência cambial entre engines em vez de **resolvê-la**. A resolução real exigiria padronizar as três fontes de cotação (donut, KPI, engine canônica) numa só — projeto grande, mexe em SQL, RPCs e múltiplos hooks. O caminho proposto entrega **confiança visual imediata** (o card sempre fecha) e **transparência sob demanda** (o drawer mostra a divergência para quem quiser auditar), sem mexer em engine.

Se você preferir o caminho **fundamentalista** (unificar as 3 fontes de cotação na engine canônica), me avise — é uma trilha separada, mais demorada, com risco de mexer em valores históricos.

---

## Decisão necessária
Confirma que posso seguir com a **remoção da linha "Fundos fora de projetos"** e a **adoção do modelo de 3 linhas** com cálculo por subtração? Ou prefere o caminho fundamentalista de unificar as engines?
