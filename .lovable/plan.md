## Objetivo

Dar mais espaço ao campo **Evento** (nomes longos como "URUGUAY X CAPE VERDE" são truncados) e reduzir **Mercado** (textos costumam ser curtos: "Resultado Final", "Over 2.5"), sem quebrar o layout do header em outros formulários (ApostaDialog também usa o mesmo header).

## Mudança

Arquivo único: `src/components/apostas/BetFormHeaderV2.tsx` (linhas 226–353).

### 1. Trocar grid uniforme por grid de 12 colunas
- Hoje: `grid grid-cols-4 gap-3` (cada campo = 25%).
- Novo: `grid grid-cols-12 gap-3` com proporções:
  - **Esporte** → `col-span-2` (~17%) — Select curto, "Futebol" cabe folgado.
  - **Evento** → `col-span-5` (~42%) — quase dobra de tamanho; comporta nomes longos sem corte.
  - **Mercado** → `col-span-3` (~25%) — encolhe levemente.
  - **Data/Hora** → `col-span-2` (~17%) — DateTimePicker continua legível ("21/06 19:00" cabe).

### 2. Ajuste fino de tipografia (defensivo)
- No `<Input>` do **Evento**, manter `text-xs uppercase text-center`, mas remover `text-center` quando o texto não couber não ajuda — mantenho centralizado e adiciono `truncate` no input nativo já é automático; o tooltip on-hover já mostra o texto completo (linhas 297–301), então a descobribilidade está preservada.
- No `<Input>` do **Mercado**, manter `text-xs text-center`; ele agora ocupa menos espaço, mas o placeholder "Ex: Resultado Final" continua visível em ~25% da largura.

### 3. Sem alterações em
- `SurebetModalRoot.tsx` — só consome o header.
- `ApostaDialog.tsx` — herda a nova proporção automaticamente, o que é desejável (mesma queixa se aplica lá).
- Lógica, validações, tooltips de overflow e badges de review.

## Resultado visual

```text
Antes:  [ Esporte 25% ][ Evento 25% ][ Mercado 25% ][ Data 25% ]
Depois: [ Esp 17% ][   Evento 42%    ][ Mercado 25% ][ Data 17% ]
```

"URUGUAY X CAPE VERDE" passa a caber inteiro no campo Evento; Mercado segue confortável para os textos curtos típicos; Esporte e Data/Hora encolhem só o necessário sem perder legibilidade.

## Fora de escopo

- Não mexer no tamanho de fonte (o usuário ofereceu como alternativa; a redistribuição de largura já resolve sem perder legibilidade).
- Não mexer no header em mobile/responsivo além do que o grid de 12 colunas já entrega.
