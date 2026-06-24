# Plano: Melhorias UX/UI — Transferência Cripto Parceiro → Parceiro

## Contexto

No fluxo `Nova Transação → Transferência → Parceiro → Parceiro` com moeda CRYPTO, após selecionar o parceiro de destino e sua wallet, o operador não tem como copiar o endereço diretamente do diálogo. Hoje precisa sair do fluxo, abrir outra área e copiar manualmente — lento e propenso a erro (rede errada, endereço errado, parceiro errado).

Objetivo: tornar a wallet de destino totalmente visível, copiável e auditável dentro do próprio modal, além de eliminar gargalos correlatos (matching de rede, confirmação visual, prevenção de auto-transferência).

## Escopo (apenas frontend / UX)

Arquivos-alvo principais:
- `src/components/caixa/CaixaTransacaoDialog.tsx` (modal Nova Transação — bloco DESTINO crypto)
- `src/components/caixa/WalletSearchSelect.tsx` (visualização do item selecionado)
- Reaproveitar `CopyableAddress` já existente (padrão `CryptoTransactionCard`)

Fora de escopo: regras de saldo, RPC, ledger, conversões.

---

## 1. Painel "Destino confirmado" (substitui o select colapsado)

Depois que o parceiro + wallet de destino estiverem selecionados, renderizar abaixo do select um card compacto fixo com:

```
┌─────────────────────────────────────────────┐
│  DESTINO CONFIRMADO                  ✓      │
│  JULIANA COSTA DE OLIVEIRA                  │
│  PRINCIPAL JULIANA · Ethereum (ERC20)       │
│  0xE350a1...c93607        [ Copiar ] [QR]   │
│  Rede compatível com origem ✓               │
└─────────────────────────────────────────────┘
```

Elementos:
- Pessoa (parceiro) — Nível 1
- Wallet name + rede formatada (`formatNetworkName`) — Nível 2
- Endereço truncado (`truncateAddress`) com tooltip exibindo o endereço completo — Nível 3
- Botão "Copiar" (ícone `Copy`) que copia o endereço **completo** via `navigator.clipboard.writeText`
- Feedback: troca para ícone `Check` verde + toast "Wallet copiada" por 2s
- Botão secundário "QR" abre popover com QR code do endereço (usar `qrcode.react` se já presente, senão deixar como follow-up opcional)

Componente reaproveitável: `CopyableAddress` já existe no padrão crypto institucional — usar ele.

## 2. Validação visual de rede (prevenção de erro)

- Comparar `network` da wallet de origem com a de destino.
- Match → badge verde "Rede compatível ✓".
- Mismatch → badge âmbar "⚠ Redes diferentes: ERC20 → TRC20. Confirme antes de prosseguir" e desabilitar `Registrar Transação` até o usuário marcar checkbox "Estou ciente do risco".

## 3. Bloqueio de auto-transferência

Se `origem.parceiro_id === destino.parceiro_id` E `origem.wallet_id === destino.wallet_id`:
- Mostrar mensagem inline vermelha: "Origem e destino não podem ser a mesma wallet."
- Desabilitar submit.

## 4. Melhorias no `WalletSearchSelect` (destino)

- Mostrar o endereço truncado **dentro do trigger** já selecionado (hoje só aparece na lista).
- Adicionar mini-ícone `Copy` no trigger ao lado direito (clique stopPropagation → copia sem abrir o popover).
- Na lista, destacar wallets cuja `network` casa com a origem (ordem: compatíveis primeiro, demais abaixo de divisor).

## 5. Atalhos operacionais

- Botão "Usar mesma wallet usada na última transferência para este parceiro" (busca rápida no histórico recente) — opcional, atrás de feature flag se complicar.
- `Cmd/Ctrl + C` com o painel "Destino confirmado" focado copia o endereço.

## 6. Feedback e acessibilidade

- Toast via hook `useToast` já existente.
- `aria-live="polite"` no painel para anunciar "Wallet copiada".
- Foco visível em botão Copiar (ring primary).

---

## Detalhes técnicos

**`CaixaTransacaoDialog.tsx`** — localizar o bloco do destino CRYPTO em `Parceiro → Parceiro` e, após `<WalletSearchSelect ... value={walletDestinoId}>`, inserir condicional:

```tsx
{walletDestinoSelecionada && (
  <DestinoConfirmadoCard
    parceiroNome={parceiroDestino?.nome}
    wallet={walletDestinoSelecionada}
    origemNetwork={walletOrigemSelecionada?.network}
  />
)}
```

**Novo componente** `src/components/caixa/DestinoConfirmadoCard.tsx`:
- Props: `parceiroNome`, `wallet { label, exchange, network, endereco }`, `origemNetwork`.
- Usa `CopyableAddress`, `formatNetworkName`, `truncateAddress` de `@/utils/cryptoUtils`.
- Sem lógica de negócio; só apresentação + clipboard.

**Sem mudanças** em RPC, hooks de dados, ledger ou cache (invalidações continuam como estão).

---

## Critérios de aceitação

1. Após selecionar wallet de destino, o endereço completo é copiável em 1 clique com feedback visual.
2. Endereço exibido truncado mas tooltip/cópia entrega valor completo.
3. Redes incompatíveis bloqueiam submit até confirmação explícita.
4. Mesma wallet origem=destino bloqueia submit.
5. Nenhuma regressão em FIAT (painel só aparece quando `tipoMoeda === 'CRYPTO'` e ambos lados preenchidos).

## Entregáveis

- `src/components/caixa/DestinoConfirmadoCard.tsx` (novo)
- Edits em `src/components/caixa/CaixaTransacaoDialog.tsx`
- Edits leves em `src/components/caixa/WalletSearchSelect.tsx` (cópia inline no trigger + ordenação por compatibilidade de rede)

QR code fica como follow-up opcional para não inflar o escopo.
