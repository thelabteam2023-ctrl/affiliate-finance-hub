# Aposta Simples: edição de liquidadas + apostas com data futura sumindo do histórico

## Diagnóstico

### Caso A — edição de aposta liquidada não persistia
Causa já identificada e corrigida na intervenção anterior: em `ApostaDialog.tsx`, todos os caminhos de aposta LIQUIDADA gravavam os campos cadastrais (inclusive `data_aposta`) num UPDATE separado, posterior à RPC, com o erro engolido por `console.warn`. Hoje esses caminhos usam `atualizarApostaCadastral` (`src/services/aposta/atualizarApostaCadastral.ts`), que grava só campos sem efeito financeiro e lança erro em caso de falha. A persistência da data foi validada no banco após a correção.

Resta um ponto pendente da mesma classe: `ApostaMultiplaDialog.tsx` ainda tem o padrão antigo de UPDATE complementar silencioso.

### Caso B — aposta com data futura some do histórico
Confirmado no código, e é a hipótese que você levantou, só que na forma de um teto de período e não de um `WHERE data <= hoje` explícito.

Em `getDateRangeFromPeriod` (`src/hooks/useTabFilters.ts` e `src/contexts/OperationalFiltersContext.tsx`) **todos** os presets terminam em `endOfDay(now)`:

```text
1dia        -> hoje 00:00  ..  hoje 23:59
7dias       -> D-6         ..  hoje 23:59
mes_atual   -> 1º do mês   ..  hoje 23:59
ano (padrão)-> 1º de jan   ..  hoje 23:59
```

Em `ProjetoApostasTab.tsx` esse range vira `gte/lte` sobre `data_aposta`. Logo, uma aposta com `data_aposta` no dia 4 (futuro) fica fora do `lte` e desaparece — mesmo no preset "Ano", que intuitivamente deveria cobrir o ano inteiro.

Por que só a Simples parece afetada: existe uma segunda query, sem filtro de data, que readiciona as apostas **PENDENTES**. Apostas futuras normalmente estão pendentes e por isso reaparecem. A aposta do seu teste está **LIQUIDADA** com data futura — combinação que nenhuma das duas queries alcança. O mesmo teto de período se aplica às abas de Múltipla e Surebet (mesmo arquivo, mesmas linhas de filtro), então isto não é uma divergência Simples × Surebet: é uma regra de janela de período que nunca previu evento futuro.

Relação entre os dois casos: a correção do Caso A é o que torna o Caso B visível — agora que a data realmente persiste, a aposta efetivamente se move para fora da janela de consulta.

### Campo de data
Formulário, gravação e histórico usam o mesmo campo, `data_aposta`, com conversão de timezone operacional (São Paulo) via `getOperationalDateRangeForQuery`. Não há divergência de campo nem bug de timezone aqui.

## Correção proposta

**1. Presets de período passam a cobrir o período inteiro, não "até agora"**
Em `getDateRangeFromPeriod` (nos dois arquivos, mantendo-os idênticos):

```text
1dia       -> hoje 00:00           .. hoje 23:59
7dias      -> D-6                  .. hoje 23:59
mes_atual  -> 1º do mês            .. último dia do mês 23:59
ano        -> 1º de janeiro        .. 31 de dezembro 23:59
mes_anterior / custom               (inalterados)
```

Assim uma aposta do dia 4 continua dentro de "Mês atual" e "Ano". Os presets curtos ("Hoje", "7 dias") continuam fechando hoje — é o significado deles.

**2. Rede de segurança para eventos futuros fora da janela**
Na aba Apostas, a query complementar hoje é restrita a `status = PENDENTE`. Ela passa a trazer também apostas com `data_aposta > fim da janela`, independentemente de status, quando o período selecionado termina no passado ou no presente. Isso garante que nenhuma aposta futura fique invisível por causa de um preset curto, e a deduplicação por `id` já existente evita repetição.

**3. Indicação visual (opcional, mas recomendada)**
Apostas cuja data do evento é futura ganham um marcador discreto no card ("Evento futuro"), para o usuário entender por que ela aparece fora da leitura habitual do período.

**4. Alinhar `ApostaMultiplaDialog.tsx`**
Trocar o UPDATE complementar silencioso pela mesma `atualizarApostaCadastral`, eliminando a última superfície de falha silenciosa da mesma classe.

## O que não muda

Nenhuma lógica financeira. Reliquidação, reversão, emissão de eventos, saldos e KPIs continuam exclusivamente nas RPCs existentes. Nenhum backfill, nenhuma alteração de dados. Edição puramente cadastral segue sem pedir confirmação de reliquidação e sem gerar evento no ledger.

## Validação

- Aposta liquidada com data alterada de 02/09 para 04/09: persiste, aparece no histórico nos presets "Mês atual" e "Ano", nenhum evento novo em `financial_events`, saldo da casa inalterado.
- Mesma aposta com preset "Hoje": aparece via a rede de segurança de eventos futuros.
- Aposta pendente com data futura: continua aparecendo, como hoje.
- Filtro custom com fim no dia 3: aposta do dia 4 aparece pela rede de segurança; nenhuma outra aposta fora do período entra.
- Mudança de resultado GREEN → RED: reliquidação normal, um único par reversão/novo payout.
- Mudança de stake e data juntos: RPC atômica + data gravada.
- Abas Múltipla e Surebet: mesmo comportamento de período, sem regressão.
- Criação de aposta nova e edição de pendente: inalterados.

## Detalhes técnicos

Arquivos: `src/hooks/useTabFilters.ts` e `src/contexts/OperationalFiltersContext.tsx` (janela dos presets), `src/components/projeto-detalhe/ProjetoApostasTab.tsx` (query complementar de eventos futuros nas três formas de registro), `src/components/projeto-detalhe/ApostaCard.tsx` (marcador de evento futuro), `src/components/projeto-detalhe/ApostaMultiplaDialog.tsx` (uso de `atualizarApostaCadastral`). Sem migração de banco.
