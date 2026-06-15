## Diagnóstico

**Card "Exposição & Perdas"** repete o mesmo número três vezes (`R$ 18.740,32` total, `R$ 18.242,78` em disputa, `R$ 18.242,78` Casas de Apostas) porque hoje só existe um segmento ativo (Bookmakers). O badge "Posição atual" duplica informação que já está implícita (o cabeçalho "Em disputa" já é tempo real).

**Modal "Em disputa · Casas de Apostas"**:
- Não exibe logo da casa (logo só é renderizado na lista de Perdas via `useBookmakerLogoMap`).
- Datas no formato ISO cru (`2026-03-19`) — `OcorrenciasList` imprime `o.data_ocorrencia` direto sem `formatDataBR`.
- Excesso de badges: `status` + `sub_motivo` aparecem como pílulas em snake_case (`em_andamento`, `conta_suspensa`, `verificacao_em_analise`, `documento_pendente`) duplicando o título da ocorrência (que já é "CONTA SOB REVISÃO", "VERIFICAÇÃO PENDENTE" etc.).
- "Titular: ARIANE…" fica numa segunda linha apertada junto da bookmaker, sem hierarquia.

## Proposta

### 1. Card Exposição & Perdas — enxugar redundância

- **Remover** o badge "Posição atual" (`realtimeBadge`) ao lado do título "Em disputa". Manter apenas o ícone do relógio como microcue se necessário, ou nada.
- **Esconder a linha-resumo "Em disputa"** quando existir só 1 segmento com valor > 0 (caso atual: só Bookmakers). O total geral do card já carrega o número; a barra de segmentos vira a única quebra.
- **Sempre que houver ≥2 segmentos**, manter a linha resumo "Em disputa · {total}" como hoje (não regredir o caso multi-segmento).
- **Renomear** "Casas de Apostas" → manter, mas mostrar `count` ocorrências de forma sutil (ex.: `6 contas`) em vez de badge pílula.

### 2. Modal "Em disputa · Casas" — redesenho do item

Substituir `OcorrenciasList` por uma versão dedicada a bookmakers (`DisputaBookmakerList`) — os outros 3 segmentos continuam com a lista atual.

Cada linha do novo card:

```text
┌─────────────────────────────────────────────────────┐
│ [LOGO]  LEGIANO                       R$ 402,43     │
│         Ariane Aparecida              USD 79,60     │
│         Conta sob revisão · 19/03/2026              │
└─────────────────────────────────────────────────────┘
```

- **Logo da bookmaker** (40×40 com fallback para `Building2`) usando `useBookmakerLogoMap` — mesmo padrão da `PerdasList`.
- **Linha 1**: nome da bookmaker (destaque) + valor consolidado (BRL).
- **Linha 2**: titular em case humano (não CAPS LOCK forçado) + valor em moeda original quando ≠ BRL.
- **Linha 3** (meta, `text-[11px] text-muted-foreground`): título da ocorrência humanizado + `·` + data formatada `dd/MM/yyyy` via `formatDataBR`.
- **Remover** os badges `status` e `sub_motivo` da linha — a informação já está no título. Manter `sub_motivo` apenas como *tooltip* opcional no ícone de info.
- Hover sutil (`hover:bg-muted/40`) e borda `border-border/50`, mesmo padrão visual da `PerdasList` (consistência).

### 3. Helpers/dados

- Reaproveitar `formatDataBR` já existente no arquivo.
- Humanizar titular: `toTitleCase(p.parceiro_nome)` (helper local de 1 linha).
- Nenhum schema novo, nenhum hook novo — `OcorrenciaDetalhe` já carrega `bookmaker_nome`, `parceiro_nome`, `titulo`, `data_ocorrencia`, `valor`, `valor_original`, `moeda`.

## Arquivos a alterar

- `src/components/financeiro/ExposicaoFinanceiraCard.tsx`
  - Remover render de `realtimeBadge` na seção "Em disputa".
  - Ocultar a linha resumo "Em disputa" quando `segs.filter(s => s.value > 0).length <= 1`.
  - Adicionar `DisputaBookmakerList` (novo componente local) e usá-lo em `drill === "disputa-bookmakers"`.
  - Manter `OcorrenciasList` para os outros 3 drills.

## Fora de escopo

- Não mexer em `useExposicaoFinanceira` (dados já suficientes).
- Não mexer no container que injeta `realtimeBadge`/`periodBadge` — só ignorar a prop `realtimeBadge`.
- Não mexer nas listas de Perdas / Bancos / Wallets / Caixa.
- Sem migrations.
