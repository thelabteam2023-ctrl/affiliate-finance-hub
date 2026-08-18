# Plano de Ação: Consistência de Perda Promocional nos Indicadores (V16)

Foi detectado que o lançamento de "Perda Promocional" (categoria `PROMO_LIMIT`) via módulo de Bônus impacta o saldo contábil, mas não é refletido na **Evolução do Lucro** e nos **KPIs de Performance de Bônus**.

## Causa Raiz
A RPC `get_projeto_lucro_operacional_daily` (base do gráfico e KPIs operacionais) ignora eventos do `cash_ledger` que não sejam explicitamente mapeados como operacionais. Atualmente, o motivo `PROMO_LIMIT` é tratado apenas como um ajuste de saldo, sem vínculo com a série temporal de lucro do projeto ou com a agregação de estratégia de bônus.

## Objetivos
1.  **Integridade do Lucro**: Garantir que perdas por limitação promocional reduzam o Lucro Operacional real.
2.  **Performance de Estratégia**: Refletir a perda na aba Bônus (Por Casa e Geral).
3.  **SSOT Financeiro**: Manter um único evento no Ledger (`PERDA_OPERACIONAL`) que alimente todas as visões.

## Detalhes Técnicos

### 1. Banco de Dados (PostgreSQL)
- **RPC `get_projeto_lucro_operacional_daily`**:
    - Adicionar um novo bloco `bonus_losses_daily` para capturar registros do `cash_ledger` onde `ajuste_motivo = 'PROMO_LIMIT'`.
    - Garantir que esses valores sejam subtraídos do lucro diário, respeitando a moeda de consolidação.
- **RPC `get_projeto_lucro_operacional` (ou similar)**:
    - Atualizar a agregação de bônus para incluir débitos de `PROMO_LIMIT` vinculados a bônus.

### 2. Backend / Ledger Logic
- **`useProjectBonuses.ts`**:
    - Ao finalizar um bônus com `completed_with_limit`, a `PERDA_OPERACIONAL` gerada deve incluir no `auditoria_metadata` o `bonus_id` e a tag `origem: 'BONUS'`.
    - Isso permite que a aba Bônus filtre esses prejuízos na visão "Por Casa".

### 3. Frontend (UI/Analytics)
- **`ExtratoProjetoTab.tsx`**:
    - Adicionar rótulo específico para `PROMO_LIMIT` (ex: "Perda Promocional (Limite de Saque)").
- **`BonusPerformanceCard` / Analytics**:
    - Ajustar os hooks de performance para subtrair as perdas promocionais do lucro bruto gerado pelos bônus.

## Plano de Teste
1.  Registrar bônus de €200.
2.  Finalizar com "Restrição de Ganho", informando saque permitido de €30.61.
3.  Verificar se a perda de €169.39 aparece no extrato como saída.
4.  Validar se o gráfico de Evolução do Lucro na Visão Geral caiu exatamente €169.39 na data da finalização.
5.  Confirmar na aba Bônus que a performance daquela casa específica foi reduzida pelo mesmo valor.
