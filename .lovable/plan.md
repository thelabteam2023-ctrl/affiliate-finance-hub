## Problema

Elementos de debug (banner de cotações, ícone de bug, painel de Audit Trace, console.logs) estão visíveis para qualquer usuário autenticado. Isso deve ser restrito apenas ao **proprietário do sistema** (`isSystemOwner`), nunca para admins de workspace ou usuários comuns.

## Solução

O projeto já possui `isSystemOwner` exposto em `useAuth()`. Vou gateá-lo nos pontos críticos:

### 1. `SurebetCard.tsx`
- Importar `useAuth` e obter `isSystemOwner`.
- **Banner amarelo "Usando cotação oficial / Confirmar Taxas"**: só renderiza se `isSystemOwner`.
- **Botão Bug (ícone de inseto)**: só aparece se `isSystemOwner`.
- **Painel `SurebetTracePanel`**: só renderiza se `isSystemOwner`.
- **`console.log` de debug**: envolto em `if (isSystemOwner)`.
- **Lógica de cálculo permanece intacta** — apenas a UI é escondida. O fallback automático para taxa oficial continua funcionando silenciosamente para todos.

### 2. Comportamento para usuários comuns
- O P&L continua sendo calculado corretamente (já que o fallback `getSafeWorkingRate` opera no nível de hook/dados).
- Nenhuma mensagem de "Cotação inválida", "Snapshot taxas", "Contaminação de moeda", etc., será exibida.
- O card aparece limpo, exatamente como um card normal.

### 3. Salvaguarda silenciosa
Quando um admin/usuário comum visualizar uma operação com cotação inválida no banco, o sistema:
- Aplica fallback PTAX automaticamente (sem banner).
- Loga o evento apenas no console se `isSystemOwner` ativo.
- Não bloqueia nenhum fluxo de UX.

### Arquivos afetados
- `src/components/projeto-detalhe/SurebetCard.tsx` (gates condicionais)

### Não afetados (continuam universais)
- `useProjetoCurrency.ts`, `useProjetoWorkingRates.ts`, `exchangeRateGuard.ts` — protegem cálculos para todos.
- `SurebetTracePanel.tsx` — componente continua existindo, apenas não é renderizado para não-owners.
