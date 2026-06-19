# Plano — Auditoria de Hidratação de Apostas ARBITRAGEM por Aba

## Contexto

Ao registrar uma operação pelo formulário **Arbitragem (Surebet)** estando na aba **Duplo Green**, o card hidratado aparece quebrado: cabeçalho mostra `AXN • Futebol • 1×2 ⚡DG 1-2 ⏱Pendente` mas a linha de rodapé exibe **`Stake: R$ 0,00`** e nenhuma perna (sem Casa/Odd/Stake/Lucro). O mesmo formulário, salvando pela aba **Surebet**, hidrata corretamente. Suspeita: cada aba tem seu próprio loader de pernas/raw_pernas e a aba Duplo Green ficou desatualizada em relação ao contrato esperado por `SurebetCard`.

## Objetivo

Mapear, aba por aba, **o que cada loader busca em `apostas_pernas` e como monta o objeto passado ao `SurebetCard`**, identificando divergências que causem hidratação vazia (stake 0, pernas sem casa/odd, sem agrupamento por seleção, sem `raw_pernas`, sem `instance_identifier`/`logo_url`, sem `tipo`/`comissao` da Fase Lay).

## Achados preliminares (baseline)

Comparativo já confirmado entre **Surebet** (referência correta) e **Duplo Green** (quebrada):

```text
                                  Surebet  DuploGreen
groupPernasBySelecao(pernasRaw)     OK        FALTA
raw_pernas                          OK        FALTA
stake_total || stake fallback       OK        só stake_total
instance_identifier na perna        OK        FALTA
logo_url na perna                   OK        FALTA
moeda_operacao / stake_consolidado  OK        FALTA
pl_consolidado / consolidation_*    OK        FALTA
tipo (back|lay) / comissao          FALTA     FALTA  (ambas, Fase Lay)
```

A combinação `stake_total = 0` + ausência de `raw_pernas`/`groupPernasBySelecao` explica o card vazio mostrado no print: o `SurebetCard` recebe `pernas` cru, não acha agrupamento por seleção válido e o footer cai no fallback `stake_total = 0`.

## Investigação por aba

Para cada aba abaixo, abrir o loader e validar contra o contrato de `SurebetCard` (campos `pernas` agrupadas + `raw_pernas` + totais consolidados + `forma_registro: "ARBITRAGEM"`):

1. **Surebet** — `src/components/projeto-detalhe/ProjetoSurebetTab.tsx` (linhas ~383–460). **Referência correta**; nada a alterar nessa etapa.
2. **Duplo Green** — `src/components/projeto-detalhe/ProjetoDuploGreenTab.tsx` (~400–452). Loader minimalista, sem `groupPernasBySelecao`, sem `raw_pernas`, sem campos de consolidação. **Principal suspeito.**
3. **Apostas (geral)** — `src/components/projeto-detalhe/ProjetoApostasTab.tsx`. Validar se ARBITRAGEM hidrata via mesma rotina de Surebet ou se tem caminho próprio.
4. **Bônus** — `src/components/projeto-detalhe/bonus/BonusApostasTab.tsx`. Mesma checagem; bônus pode estar ignorando `tipo`/`comissao`/snapshot e ainda exigir `bonus_id`.
5. **Value Bet** — `src/components/projeto-detalhe/ProjetoValueBetTab.tsx`. Suporta ARBITRAGEM via formulário também (link `/janela/surebet/novo?tab=valuebet`).
6. **Punter** — `src/components/projeto-detalhe/ProjetoPunterTab.tsx`. Mesma análise.
7. **Freebets** — `src/components/projeto-detalhe/freebets/FreebetApostasList.tsx` / `FreebetApostaCard.tsx`. Validar se renderiza ARBITRAGEM via `SurebetCard` ou via componente próprio.

Para cada loader, registrar em uma tabela: campos selecionados no `select(...)`, transformação aplicada, presença de `groupPernasBySelecao`, presença de `raw_pernas`, `stake_total` fallback, campos de consolidação multi-moeda, e campos da Fase Lay (`tipo`, `comissao`, liability).

## Hipóteses a confirmar

- H1: aba Duplo Green não chama `groupPernasBySelecao(pernasRaw)`, então `SurebetCard` não enxerga pernas agrupadas e o footer fica zerado.
- H2: `stake_total` é gravado como `0` na criação via aba DG (o formulário não persiste `stake_total` para `forma_registro=ARBITRAGEM` quando vindo de `tab=duplogreen`), e o loader não tem fallback para `arb.stake` nem soma das pernas.
- H3: faltam `raw_pernas` e os campos de consolidação (`stake_consolidado`, `pl_consolidado`, `consolidation_currency`, `moeda_operacao`), então o `SurebetCard` cai no modo "sem dados" e exibe `R$ 0,00`.
- H4: as pernas não trazem `instance_identifier` nem `logo_url`, o que em outras abas só piora a UI mas aqui pode estar mascarando uma perna sem `bookmaker_nome` válido.
- H5: nenhuma aba propaga ainda `tipo` (back/lay) e `comissao` no loader — bug latente da Fase Lay que vai aparecer assim que a primeira lay for criada.

## Validação

- Repetir o fluxo do print: criar via formulário Arbitragem com `tab=duplogreen` e inspecionar (a) registro em `apostas_unificada` (campos `stake_total`, `stake`, `pl_consolidado`) e (b) registros em `apostas_pernas` (ordem, stake, odd, fonte_saldo).
- Confirmar visualmente que o mesmo `id` renderiza corretamente quando aberto pela aba **Surebet**, isolando o problema ao loader da aba DG.
- Logar o objeto passado ao `SurebetCard` em DG vs Surebet para comparar shape.

## Entregáveis desta investigação

- Documento com o comparativo final (tabela aba × campos) marcando OK/FALTA.
- Lista de correções pontuais por aba (apenas leitura/hidratação, sem mexer em RPCs nem no formulário).
- Recomendação de extrair o mapeamento de pernas ARBITRAGEM para um util único (`mapPernasArbitragem`) consumido por todas as abas, eliminando drift entre loaders.

## Fora de escopo

- Alterar RPCs (`liquidar_perna_surebet_v1`, `fn_recalc_pai_surebet`).
- Alterar o formulário de criação/edição (Fase 1 já consolidada).
- Reescrever o `SurebetCard` ou redesenhar layout além do necessário para acomodar `tipo`/`comissao`.
- Backfill em produção; validações usam dados mockados/locais quando preciso.
