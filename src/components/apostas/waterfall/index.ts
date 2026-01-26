/**
 * Componentes e Hooks do Sistema Waterfall de Saldo
 * 
 * ARQUITETURA:
 * O sistema utiliza débito em cascata (waterfall) para apostas:
 * 
 * 1. BONUS → consumido AUTOMATICAMENTE primeiro
 * 2. FREEBET → usado apenas se o toggle "Usar Freebet" estiver ativo
 * 3. REAL → cobre o valor restante
 * 
 * REGRAS DE CRÉDITO (GREEN):
 * - De BONUS: apenas LUCRO retorna para saldo_real
 * - De FREEBET: apenas LUCRO retorna para saldo_real
 * - De REAL: STAKE + LUCRO retorna para saldo_real
 * 
 * COMPONENTES:
 * - FreebetToggle: Toggle visual para ativar uso de freebet
 * - SaldoWaterfallPreview: Mostra prévia de como o stake será distribuído
 * 
 * HOOKS:
 * - useWaterfallDebito: Cálculo e execução do waterfall via RPC
 * - useWaterfallCalculation: Cálculo local para preview rápido
 * 
 * RPCs (Banco de Dados):
 * - calcular_debito_waterfall: Calcula distribuição sem executar
 * - processar_debito_waterfall: Executa débitos atômicos
 * - criar_aposta_atomica_v2: Cria aposta usando waterfall
 * - liquidar_aposta_atomica_v2: Liquida aposta com regras de crédito
 * 
 * COLUNAS ADICIONADAS:
 * - bookmakers.saldo_bonus: Saldo de bônus ativo
 * - apostas_unificada.usar_freebet: Toggle do usuário
 * - cash_ledger.debito_bonus/debito_freebet/debito_real: Breakdown do débito
 * 
 * @module waterfall
 */

export { FreebetToggle } from "./FreebetToggle";
export { SaldoWaterfallPreview, useWaterfallCalculation } from "./SaldoWaterfallPreview";
