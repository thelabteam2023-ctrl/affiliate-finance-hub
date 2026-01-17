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
  healthCheck,
} from './ApostaService';

// Exportar tipos
export type {
  CriarApostaInput,
  AtualizarApostaInput,
  LiquidarApostaInput,
  PernaInput,
  ApostaServiceResult,
  ValidationResult,
  InvariantViolation,
} from './types';

// Exportar constantes
export { DOMAIN_INVARIANTS } from './types';

// Exportar validadores (para uso em testes/debugging)
export {
  validateInvariants,
  validateUpdateInvariants,
  formatViolations,
  isInvariantViolation,
} from './invariants';
