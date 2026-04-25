## Diagnóstico encontrado

A falha mais forte está no fluxo de apostas simples com múltiplas entradas/casas, como o jogo **Venezia x Empoli** na aba **Duplo Green**.

No banco, esse jogo está gravado como:

```text
forma_registro: SIMPLES
estrategia: DUPLO_GREEN
bookmaker_id do pai: null
pernas:
  1) AMUNRA, USD, stake 100, odd 2
  2) 7GAMES, BRL, stake 500, odd 2
```

Ou seja: ele é uma **aposta simples multi-entry**, não uma arbitragem/surebet real. Porém, em algumas abas, quando esse tipo de card é renderizado visualmente como `SurebetCard`, o botão **Duplicar** está chamando o formulário errado:

```text
Aposta simples multi-entry -> abre /janela/surebet/novo?duplicateFrom=...
```

O correto é:

```text
Aposta simples multi-entry -> abrir /janela/aposta/novo?duplicateFrom=...
```

Isso explica falhas intermitentes: depende de qual aba/renderização você usa. Na aba **Todas as apostas** e **Surebet**, esse caso já está mais alinhado; em **Duplo Green**, **ValueBet**, **Punter** e **Bônus**, há trechos em que multi-entry simples chama `handleDuplicateSurebet`, o que força o fluxo de formulário de surebet em uma operação que nasceu no formulário simples.

Também encontrei outro risco: ao duplicar uma aposta simples, o clone carrega `__seedPernas` com as pernas originais, mas cada entrada adicional recebe `id` igual ao ID antigo da perna. Na hora de salvar, o insert em `apostas_pernas` não usa esse `id`, então tende a não quebrar, mas deixa o estado do formulário semanticamente errado. O clone deveria carregar entradas sem IDs antigos.

## Solução proposta

### 1. Corrigir o handler de duplicação para aposta simples multi-entry

Ajustar todos os pontos onde uma aposta simples multi-entry é renderizada via `SurebetCard` para continuar usando o formulário correto de origem:

```text
onDuplicate={handleDuplicateSimples ou handleDuplicateAposta}
```

em vez de:

```text
onDuplicate={handleDuplicateSurebet}
```

Aplicar nas abas:

- Duplo Green
- ValueBet
- Punter
- Bônus
- Conferir novamente Todas as apostas e Surebet para manter o padrão correto

Regra final:

```text
forma_registro = SIMPLES  -> duplicar com formulário de Aposta Simples
forma_registro = MULTIPLA -> duplicar com formulário de Múltipla
forma_registro = ARBITRAGEM/SUREBET real -> duplicar com formulário de Surebet
```

### 2. Preservar a estratégia da aba ao duplicar

Nos links de duplicação, incluir a estratégia explícita quando a aba é especializada, por exemplo:

```text
Duplo Green: estrategia=DUPLO_GREEN
ValueBet: estrategia=VALUEBET
Punter: estrategia=PUNTER
Bônus: estrategia=EXTRACAO_BONUS
Freebets: estrategia=EXTRACAO_FREEBET
Surebet: estrategia=SUREBET
```

Isso reduz dependência de inferência posterior e evita clones salvos em estratégia errada.

### 3. Limpar IDs antigos das pernas ao hidratar clone simples

No `ApostaWindowPage`/`ApostaDialog`, ao carregar `__seedPernas` para duplicação:

- manter bookmaker, odd, stake, seleção, moeda, fonte_saldo e snapshots úteis;
- remover `id`, `aposta_id`, `created_at`, `updated_at` das pernas seed;
- gerar IDs locais novos apenas para UI, sem reaproveitar UUIDs reais de `apostas_pernas`.

Isso deixa claro que o clone é novo e evita qualquer risco de edição/sincronização acidental com perna antiga.

### 4. Corrigir duplicação de surebet real

Hoje o `SurebetWindowPage` busca apenas o pai (`apostas_unificada`) e depende do `SurebetModalRoot` buscar pernas usando `surebet.id`. Em duplicação, o objeto montado não contém `id`, então o formulário pode abrir sem pernas.

Ajuste proposto:

- quando `duplicateFrom` existir, buscar também `apostas_pernas` do original;
- passar essas pernas como seed para o `SurebetModalRoot`;
- no modal, em modo duplicação, popular as pernas a partir do seed, mas sem IDs antigos;
- salvar como operação nova.

Isso separa corretamente:

```text
Editar surebet -> usa id original e IDs das pernas
Duplicar surebet -> usa dados originais como seed, sem IDs antigos
```

### 5. Padronizar abertura de janelas

Criar/usar helpers de duplicação em `windowHelper.ts` para evitar URLs manuais divergentes:

```text
openDuplicateApostaWindow
openDuplicateMultiplaWindow
openDuplicateSurebetWindow
```

Com isso, as abas deixam de montar URLs manualmente e a regra fica centralizada.

### 6. Revisar atualização após salvar clone

Garantir que, ao salvar a duplicação, os eventos cross-window invalidem as listas/KPIs corretos em todas as abas:

- `APOSTA_SAVED` para simples;
- `APOSTA_MULTIPLA_SAVED` para múltipla;
- `SUREBET_SAVED` para surebet real;
- invalidar caches canônicos e saldos após salvar.

### 7. Testes práticos após correção

Testar manualmente os cenários principais:

1. **Duplo Green**: duplicar o Venezia x Empoli multi-entry.
   - Deve abrir formulário simples.
   - Deve carregar AMUNRA e 7GAMES como entradas.
   - Deve salvar novo clone como `DUPLO_GREEN`.
   - Deve aparecer na aba Duplo Green.

2. **ValueBet/Punter/Bônus**: duplicar aposta simples single-entry e multi-entry.
   - Single-entry e multi-entry devem abrir o formulário simples.
   - Estratégia deve permanecer fixa conforme a aba.

3. **Surebet real**: duplicar operação de arbitragem real.
   - Deve abrir formulário de surebet.
   - Deve carregar todas as pernas.
   - Deve salvar como nova operação sem reaproveitar IDs antigos.

4. **Todas as apostas**: duplicar simples, múltipla e surebet.
   - Cada tipo deve abrir seu formulário correto.

## Arquivos a alterar

- `src/components/projeto-detalhe/ProjetoDuploGreenTab.tsx`
- `src/components/projeto-detalhe/ProjetoValueBetTab.tsx`
- `src/components/projeto-detalhe/ProjetoPunterTab.tsx`
- `src/components/projeto-detalhe/bonus/BonusApostasTab.tsx`
- `src/components/projeto-detalhe/ProjetoApostasTab.tsx` apenas para revisão/centralização
- `src/components/projeto-detalhe/ProjetoSurebetTab.tsx` apenas para revisão/centralização
- `src/pages/ApostaWindowPage.tsx`
- `src/pages/SurebetWindowPage.tsx`
- `src/components/surebet/SurebetModalRoot.tsx`
- `src/lib/windowHelper.ts`

## Resultado esperado

A ação **Duplicar** passa a respeitar a origem real da operação, e não apenas o componente visual usado no card. Assim, uma aposta simples multi-casa renderizada como card estilo surebet continuará sendo duplicada no formulário de aposta simples, preservando entradas, estratégia, cotação/snapshots e visibilidade na aba correta.