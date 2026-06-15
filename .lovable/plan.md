# Plano: corrigir "Saldo anterior" e titular ausente no drawer de Perdas

## Investigação

### 1. De onde vem o texto "Saldo anterior: 235.00"
Consultando o banco diretamente, a `cash_ledger.descricao` real é:

```
[SCAN CASA] Impossibilitado de sacar | Saldo anterior: 235.00
```

O sufixo `| Saldo anterior: X` é gravado pelo fluxo de **SCAN de casa** (perda operacional disparada quando uma bookmaker é marcada como saldo travado/perda). Serve como **marcador técnico** registrando qual era o saldo da conta no momento exato da baixa — útil em auditoria, mas:

- **Redundante na UI**: o card já exibe o valor da perda em destaque (`R$ 235,00`), que coincide com esse "Saldo anterior" na maioria dos casos.
- **Ruidoso**: o usuário lê duas vezes o mesmo número.
- **Foge do padrão**: as demais perdas (ocorrências, parceiros) não têm esse anexo.

**Decisão:** manter o dado no banco (não tocar no ledger nem no SCAN), mas **remover o sufixo só na apresentação**. O auditor que precisar ver a descrição original ainda a tem no `cash_ledger`.

### 2. Por que o titular (ex.: Ariane) não aparece nas Casas de Apostas
Bug real em `src/hooks/useExposicaoFinanceira.ts`:

- O `parceiroIds` (linha ~144) é alimentado **apenas** por `o.parceiro_id` direto das ocorrências.
- O `parceiro_id` que liga **bookmaker → titular** chega depois, dentro de `bmMap`, **após** a query de `parceiros` já ter rodado em paralelo.
- Resultado: `parceiroMap` não contém o dono da casa → `titular` resolve para `null` → o drawer não renderiza "Titular: …".

Para contas bancárias funciona porque o `parceiro_id` veio inline na resposta de `contas_bancarias` e o map é montado depois, mas mesmo lá o nome só aparece quando o parceiro foi referenciado por uma ocorrência. **Mesmo bug**.

## Implementação

### A. Cleanup da descrição em `limparTituloPerda`
Em `src/hooks/useExposicaoFinanceira.ts`, ampliar a função:

```ts
titulo = titulo.replace(/\s*\|\s*Saldo anterior:?\s*[-\d.,]+\s*$/i, "").trim();
```

Aplicar **depois** do strip do prefixo `[SCAN CASA]`. Cobre `| Saldo anterior: 235.00`, `| Saldo anterior 235,00`, com ou sem ponto final.

### B. Fix do titular ausente
Refatorar o fetch de `parceiros` para ser **sequencial após** os fetches de bookmakers/contas/wallets:

1. Manter as 4 queries paralelas atuais (ocorrências abertas, ocorrências de perda, bookmakers irrecuperáveis, ledger).
2. Buscar `bmInfoRes`, `contasInfoRes`, `walletsInfoRes` em paralelo (como hoje).
3. **Só então** coletar `parceiroIds` somando: parceiros das ocorrências + `bmInfo.parceiro_id` + `contasInfo.parceiro_id` + `walletsInfo.parceiro_id`.
4. Disparar `parceirosInfoRes` com esse set completo.

Custo: uma micro-latência extra (mais um round-trip), mas o payload final fica correto e elimina a necessidade de joins aninhados frágeis.

Como o `titular` já é resolvido em `bmMap[id].parceiro_id ? parceiroMap[pid] : null`, o fix se propaga automaticamente para:
- `detalhes.disputaBookmakers` (drawer "Em disputa · Casas")
- `detalhes.perdas` categoria `casa` (drawer "Perdas confirmadas")
- `detalhes.disputaWallets` e `disputaContasParceiros` também ganham consistência.

### C. UI: garantir que "Titular" apareça
Nenhuma mudança visual necessária — a `PerdasList` já renderiza `Titular: {p.origem_titular}` quando presente. Após o fix B, a linha aparece automaticamente.

## Fora de escopo
- Não alterar o SCAN nem o ledger.
- Não mexer no fluxo de ocorrências, valores, totais ou conversão de moeda.
- Não criar tabelas nem migrations.

## Resultado esperado no card da BET PIX 365
**Antes**
```
Impossibilitado de sacar | Saldo anterior: 235.00
● Casa de Apostas · BET PIX 365
04/06/2026                        R$ 235,00
```

**Depois**
```
Impossibilitado de sacar
● Casa de Apostas · BET PIX 365 · Titular: Ariane
04/06/2026                        R$ 235,00
```
