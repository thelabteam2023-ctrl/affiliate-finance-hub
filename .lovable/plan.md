## Objetivo
Eliminar a ambiguidade visual entre múltiplas contas da mesma casa (ex: ALAWIN JOSE vs ALAWIN MARIA) na aba "Desempenho por Casa" do painel de detalhes do parceiro, exibindo o `instance_identifier` que já existe no dado mas não é renderizado.

## Arquivo único alterado
`src/components/parceiros/ParceiroDetalhesPanel.tsx`

## Mudanças

### 1. Helper local `nomeExibicao(bm)` (topo do componente)
```ts
const nomeExibicao = (bm: { bookmaker_nome: string; instance_identifier?: string | null }) =>
  bm.instance_identifier ? `${bm.bookmaker_nome} · ${bm.instance_identifier}` : bm.bookmaker_nome;
```

### 2. Card mobile (linha ~219)
Manter o `bookmaker_nome` em destaque e adicionar uma 2ª linha discreta com o identificador:
```tsx
<p className="text-sm font-medium truncate">{bm.bookmaker_nome}</p>
{bm.instance_identifier && (
  <p className="text-[10px] text-muted-foreground truncate uppercase tracking-wide">
    {bm.instance_identifier}
  </p>
)}
```

### 3. Tabela desktop (linha ~1352)
Mesma estrutura: nome em cima, identificador em `text-[10px] text-muted-foreground` logo abaixo, condicional ao `instance_identifier` existir.

### 4. Triggers de modais (linhas 1417, 1464, 1465, 1467, 1510-1512)
Substituir `bm.bookmaker_nome` por `nomeExibicao(bm)` nos parâmetros passados a:
- `setHistoricoDialog({ ..., bookmakerNome: nomeExibicao(bm), ... })`
- `onNewTransacao?.(bm.bookmaker_id, nomeExibicao(bm), ...)` (depósito e saque)
- `setPerdaDialog({ ..., bookmakerNome: nomeExibicao(bm), ... })`

Assim o título do modal exibe `ALAWIN · JOSE` em vez de apenas `ALAWIN`, eliminando a ambiguidade também dentro das ações.

## O que NÃO muda
- Hook de dados (campo `instance_identifier` já vem populado).
- Lógica de busca/filtro (linhas 542-543 já consideram o identificador).
- Estilos globais ou outros componentes.
- Banco de dados / RPCs.

## Resultado esperado
Na aba "Desempenho por Casa" da Gestão de Parceiros, contas duplicadas (ex: ALAWIN com diferentes titulares/moedas) ficarão visualmente distintas tanto na lista quanto nos modais de Histórico, Depósito, Saque e Registrar Perda.