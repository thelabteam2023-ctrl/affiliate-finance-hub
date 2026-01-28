/**
 * Ponto de entrada do Serviço de Apostas
 * 
 * ESTE É O ÚNICO PONTO DE ACESSO AUTORIZADO PARA MANIPULAR APOSTAS.
 * 
 * Componentes que precisam criar/atualizar/deletar apostas DEVEM:
 * 1. Importar deste módulo
 * 2. Usar as funções expostas
 * 3. Tratar erros retornados
 * 
 * NUNCA fazer inserções diretas em apostas_unificada ou apostas_pernas.
 */

// Exportar serviço principal
export {
  criarAposta,
  atualizarAposta,
  deletarAposta,
  liquidarAposta,
  liquidarSurebet,
  liquidarSurebetSimples,
  reliquidarAposta,
  healthCheck,
} from './ApostaService';

// Re-exportar tipo de input para liquidação de surebet
export type { LiquidarSurebetPernaInput } from './ApostaService';

// Exportar tipos
export type {
  CriarApostaInput,
  AtualizarApostaInput,
  LiquidarApostaInput,
  PernaInput,
  SelecaoMultipla,
  ApostaServiceResult,
  ValidationResult,
  InvariantViolation,
} from './types';

// Exportar constantes
export { DOMAIN_INVARIANTS } from './types';

// Re-exportar FonteSaldo do apostaConstants para conveniência
export { FONTE_SALDO, FONTE_SALDO_LABELS, FONTES_SALDO_LIST } from '@/lib/apostaConstants';
export type { FonteSaldo } from '@/lib/apostaConstants';

// Exportar validadores (para uso em testes/debugging)
export {
  validateInvariants,
  validateUpdateInvariants,
  formatViolations,
  isInvariantViolation,
} from './invariants';
