
# Plano: Menu de Ações Rápidas Híbrido para Apostas

## Objetivo
Implementar um sistema de ações rápidas nas linhas de apostas que combina:
- **Dropdown (⋮)** para ações frequentes (alterar status, duplicar, editar)
- **Modal de Confirmação** para ações destrutivas (excluir)

## Arquitetura da Solução

```text
┌─────────────────────────────────────────────────────────────────┐
│  LINHA DA APOSTA                                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Evento • Esporte • Casa • Stake • Odd         [⋮]       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                   │             │
│                                    ┌──────────────▼─────────┐   │
│                                    │  DROPDOWN MENU         │   │
│                                    │  ─────────────────────  │   │
│                                    │  ✏️  Editar            │   │
│                                    │  📋 Duplicar          │   │
│                                    │  ─────────────────────  │   │
│                                    │  ✅ Marcar GREEN       │   │
│                                    │  ❌ Marcar RED         │   │
│                                    │  ⚫ Marcar VOID        │   │
│                                    │  ─────────────────────  │   │
│                                    │  🗑️  Excluir → MODAL   │   │
│                                    └────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Componentes a Criar/Modificar

### 1. Novo Componente: `BetRowActionsMenu`
Componente reutilizável para dropdown de ações em linhas de apostas.

**Localização:** `src/components/apostas/BetRowActionsMenu.tsx`

**Props:**
- `apostaId: string` - ID da aposta
- `apostaType: 'simples' | 'multipla' | 'surebet'` - Tipo da aposta
- `status: string` - Status atual (PENDENTE/LIQUIDADA)
- `resultado: string | null` - Resultado atual
- `onEdit: () => void` - Callback para abrir edição
- `onDuplicate: () => void` - Callback para duplicar
- `onQuickResolve: (resultado: string) => void` - Callback para liquidação rápida
- `onDelete: () => void` - Callback para excluir (abre modal)
- `disabled?: boolean` - Desabilitar ações

**Funcionalidades:**
- Ícone ⋮ (MoreVertical) como trigger
- Submenu para mudança de status (GREEN, RED, MEIO_GREEN, MEIO_RED, VOID)
- Opção "Excluir" em vermelho que abre modal de confirmação
- Stoppage do evento onClick para não disparar edição do card

### 2. Novo Componente: `DeleteBetConfirmDialog`
Modal de confirmação para exclusão de apostas.

**Localização:** `src/components/apostas/DeleteBetConfirmDialog.tsx`

**Props:**
- `open: boolean`
- `onOpenChange: (open: boolean) => void`
- `apostaId: string`
- `apostaInfo: { evento: string; stake: number; bookmaker: string }`
- `onConfirm: () => Promise<void>`
- `isDeleting: boolean`

**Conteúdo:**
- Título: "Excluir Aposta"
- Descrição com dados da aposta (evento, stake, casa)
- Aviso sobre reversão de saldo
- Botões: "Cancelar" / "Excluir" (vermelho)

### 3. Modificação: `ApostaCard.tsx`
Adicionar o botão de ações (⋮) no card/linha.

**Alterações:**
- Importar `BetRowActionsMenu`
- Adicionar novas props: `onDuplicate`, `onDelete`
- Renderizar botão de ações no canto superior direito (modo card) ou no final da linha (modo list)
- Garantir que clique no botão não propague para onClick do card

### 4. Modificação: `ProjetoApostasTab.tsx`
Integrar os novos callbacks e modal de exclusão.

**Alterações:**
- Adicionar estado para modal de exclusão: `deleteDialogOpen`, `apostaToDelete`
- Criar função `handleDelete` usando `deletarAposta` do ApostaService
- Criar função `handleDuplicate` para duplicar aposta
- Passar novos callbacks para `ApostaCard`
- Renderizar `DeleteBetConfirmDialog` no final do componente

### 5. Modificação: `SurebetCard.tsx`
Adicionar mesmo padrão de ações rápidas.

**Alterações:**
- Importar `BetRowActionsMenu`
- Adicionar botão de ações no card
- Integrar callbacks de edição, duplicação e exclusão

## Fluxo de Dados

```text
Usuário clica em ⋮ 
       │
       ▼
┌─────────────────┐
│ Dropdown abre   │
└────────┬────────┘
         │
    ┌────┴────────────────────────┐
    │                             │
    ▼                             ▼
┌────────────┐            ┌────────────────┐
│ Ação Rápida│            │ Excluir        │
│ (Status)   │            │                │
└─────┬──────┘            └───────┬────────┘
      │                           │
      ▼                           ▼
┌─────────────────┐       ┌─────────────────┐
│ reliquidarAposta│       │ Modal Confirma  │
│ (RPC v4)        │       │                 │
└─────────────────┘       └───────┬─────────┘
                                  │
                          ┌───────┴───────┐
                          ▼               ▼
                    ┌──────────┐   ┌──────────┐
                    │ Cancelar │   │ Confirmar│
                    └──────────┘   └────┬─────┘
                                        │
                                        ▼
                                ┌───────────────┐
                                │deletarAposta  │
                                │(RPC v4)       │
                                └───────────────┘
```

## Ações Disponíveis por Status

| Ação | PENDENTE | LIQUIDADA |
|------|----------|-----------|
| Editar | Sim | Sim |
| Duplicar | Sim | Sim |
| Marcar GREEN | Sim | Sim (reliquida) |
| Marcar RED | Sim | Sim (reliquida) |
| Marcar VOID | Sim | Sim (reliquida) |
| Excluir | Sim | Sim |

## Detalhes Técnicos

### Integração com Motor Financeiro v7
- **Liquidação rápida:** Usa `reliquidarAposta()` do ApostaService
- **Exclusão:** Usa `deletarAposta()` que chama RPC `deletar_aposta_v4`
- **Reversão automática:** O motor cuida da reversão de saldo

### Prevenção de Propagação de Eventos
```typescript
onClick={(e) => {
  e.stopPropagation(); // Impede abrir edição do card
}}
```

### Invalidação de Cache
Após qualquer ação:
```typescript
invalidateSaldos(projetoId);
queryClient.invalidateQueries({ queryKey: ["apostas", projetoId] });
```

## Arquivos Afetados

| Arquivo | Ação |
|---------|------|
| `src/components/apostas/BetRowActionsMenu.tsx` | CRIAR |
| `src/components/apostas/DeleteBetConfirmDialog.tsx` | CRIAR |
| `src/components/projeto-detalhe/ApostaCard.tsx` | MODIFICAR |
| `src/components/projeto-detalhe/ProjetoApostasTab.tsx` | MODIFICAR |
| `src/components/projeto-detalhe/SurebetCard.tsx` | MODIFICAR (opcional) |

## Comportamento UX

1. **Acesso rápido:** Ícone ⋮ sempre visível no final de cada linha
2. **Hover state:** Ícone fica mais destacado ao passar o mouse
3. **Dropdown animado:** Usa animações do Radix UI
4. **Cores semânticas:** 
   - GREEN em verde
   - RED em vermelho
   - Excluir em vermelho com ícone de lixeira
5. **Modal de exclusão:**
   - Mostra resumo da aposta
   - Botão de confirmação em vermelho
   - Loading state durante exclusão
   - Toast de sucesso/erro após ação

## Estimativa de Implementação
- Tempo: 20-30 minutos
- Complexidade: Média
- Risco: Baixo (usa componentes e serviços já existentes)
