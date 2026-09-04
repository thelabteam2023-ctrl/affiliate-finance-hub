# Aposta Simples liquidada: edição cadastral (data/hora) não persiste

## Evidência coletada (dados reais, sem alteração)

Aposta do print — `REAL SOCIEDAD X RC CELTA DE VIGO`, IVIBET, stake 462, odd 3.6, GREEN, projeto `0171a726…`:

- `data_aposta` continua `2026-09-02 18:07Z` (02/09 15:07 BRT), mesmo depois da tentativa de mudar para 03/09.
- `updated_at` da aposta = `2026-09-03 21:00:04.115231Z`, **exatamente igual** ao `created_at` do evento `PAYOUT` (`payout_simple_…`, metadata `liquidacao_multipla_fallback`) em `financial_events`.
- Ou seja: o Salvar chegou a gravar (a linha foi tocada e o gatilho financeiro disparou), mas a nova data **não** ficou registrada.
- Não há registro em `aposta_edit_audit_logs` para essa aposta.

No código (`src/components/projeto-detalhe/ApostaDialog.tsx`), em **todos** os caminhos de aposta LIQUIDADA (reversão, `reliquidar_aposta_v6`, `atualizar_aposta_liquidada_atomica_v2`), a data e demais campos cadastrais são gravados num **UPDATE separado, posterior à RPC**, e o erro desse UPDATE é engolido com `console.warn` (linhas ~2376, ~2460, ~2540). Isso é uma superfície de falha silenciosa: a RPC conclui, o toast diz "salvo", e a alteração cadastral se perde sem nenhum aviso.

Além disso:

- Não existe um caminho dedicado de "edição cadastral". A classificação de mudança (`houveMudancaFinanceira`) olha só bookmaker/stake/odd/resultado; data, evento, mercado e esporte não têm rota própria.
- No ramo "sem mudança financeira", o payload remove `status`, `resultado`, `odd`, `stake`, `bookmaker_id`, mas **mantém** `stake_real`, `stake_freebet`, `stake_total`, `fonte_saldo`, `usar_freebet` — exatamente colunas que disparam o gatilho `tg_sync_aposta_simples_resultado_financeiro`. Uma simples troca de data pode, portanto, reemitir evento financeiro.
- O Surebet não sofre disso porque grava tudo numa RPC única (`editar_surebet_completa_v3`), incluindo os campos cadastrais.

Ressalva honesta: o motivo exato pelo qual aquele UPDATE final não gravou a data (erro de banco engolido × payload que não chegou a ser enviado) **ainda não está provado**. Por isso a primeira etapa do plano é reproduzir com o erro exposto, e só então aplicar a correção — que já está desenhada para eliminar a classe do problema em qualquer das duas hipóteses.

## Correção proposta

**1. Reproduzir com o erro visível (primeiro passo, antes de qualquer mudança de comportamento)**
Rodar a edição de data no formulário com os erros do UPDATE complementar promovidos a erro real (log + toast), capturando a mensagem exata do banco. Isso confirma a causa em minutos e fica registrado.

**2. Caminho cadastral explícito e único**
Criar `atualizarApostaCadastral` (em `src/services/aposta/`) que grava **somente** campos sem efeito financeiro — `data_aposta`, `evento`, `esporte`, `mercado`, `selecao`, `observacoes`, `estrategia`, `contexto_operacional`, `fonte_entrada` — e nada mais. Se falhar, lança. Nenhum campo de stake/fonte de saldo entra nesse UPDATE, então o gatilho financeiro não é acionado por uma troca de data.

**3. Roteamento por natureza da mudança**
No `handleSave` da Aposta Simples, classificar antes de salvar:

```text
mudou só cadastral      -> atualizarApostaCadastral (sem RPC, sem confirmação de reliquidação)
mudou resultado         -> reliquidar_aposta_v6 (como hoje) + cadastral
mudou stake/odd/casa    -> atualizar_aposta_liquidada_atomica_v2 (como hoje) + cadastral
liquidada -> pendente   -> reverter_liquidacao_v4 (como hoje) + cadastral
```

Em todos os casos financeiros, o passo cadastral passa a usar a mesma função do item 2 e **falha alto**: erro vira toast e impede o "salvo com sucesso" enganoso. A confirmação "Aposta já liquidada" deixa de aparecer quando a alteração é puramente cadastral (não há reversão de ledger envolvida).

**4. Comparação de mudança financeira tolerante a formato**
Comparar stake/odd por diferença numérica com os limiares já usados no projeto (0,01 para stake, 0,00001 para odd) em vez de `!==` cru, para não classificar como financeira uma edição que não mudou valor algum — o que hoje faz uma troca de data cair no caminho de reversão/reemissão do ledger.

## O que não muda

Nenhuma lógica financeira nova: reliquidação, reversão e emissão de eventos continuam exclusivamente nas RPCs existentes. Nada de backfill, nada de correção em massa, nenhum saldo tocado. A aposta do caso só terá a data corrigida pela própria tela, depois da correção.

## Validação

- Aposta liquidada GREEN, mudar só a data 02/09 → 03/09 e salvar: data persiste; `financial_events` da aposta **não** ganha nenhum evento novo; saldo da IVIBET inalterado; nenhum diálogo de confirmação de reliquidação.
- Mesma aposta, mudar só evento/mercado/observação: persiste, sem evento financeiro.
- Mudar resultado GREEN → RED: reliquidação normal, um único par reversão/novo payout, saldo confere com o ledger.
- Mudar stake e data juntos: RPC atômica + data gravada na mesma operação de salvar.
- Liquidada → Pendente: reversão + data gravada.
- Forçar falha no passo cadastral (nome de coluna inválido em ambiente de teste): usuário vê erro, não vê "salvo com sucesso".
- Criação de aposta nova e edição de aposta pendente seguem funcionando igual.
- Comparar saldo do bookmaker × soma do ledger antes e depois de cada cenário (probe de paridade já existente).

## Detalhes técnicos

Arquivos: `src/services/aposta/` (nova função cadastral + export no index), `src/components/projeto-detalhe/ApostaDialog.tsx` (classificação, roteamento, remoção dos `console.warn` silenciosos, guard de confirmação só para mudança financeira). Sem migração de banco. `ApostaMultiplaDialog.tsx` tem o mesmo padrão de UPDATE complementar silencioso e será alinhado à mesma função cadastral para não divergir no futuro.
