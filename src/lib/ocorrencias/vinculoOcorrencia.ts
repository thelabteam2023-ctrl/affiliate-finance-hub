/**
 * SSOT — Vínculo bookmaker ↔ projeto no contexto de uma Ocorrência.
 *
 * Contexto (bug crítico "bookmaker desvinculada"):
 * Ocorrências criadas fora do contexto de um projeto nascem com
 * `projeto_id = NULL`. Comparar `bookmaker.projeto_id !== ocorrencia.projeto_id`
 * de forma estrita fazia o sistema concluir, erradamente, que a casa havia sido
 * DESVINCULADA — mesmo com o vínculo ativo. Isso produzia assimetria financeira:
 * a resolução debitava o saldo, mas reabrir/cancelar não estornava.
 *
 * Regra canônica:
 *  - Sem snapshot na ocorrência  → vale o projeto ATUAL da casa.
 *      • casa com projeto  → vinculada
 *      • casa sem projeto  → desvinculada (saldo já saiu via Saque Virtual)
 *  - Com snapshot na ocorrência  → compara snapshot × projeto atual da casa.
 */

export interface VinculoInput {
  ocorrenciaProjetoId?: string | null;
  bookmakerProjetoId?: string | null;
}

export interface VinculoResultado {
  /** Projeto que deve receber a perda (snapshot > projeto atual da casa). */
  projetoEfetivo: string | undefined;
  /** true somente quando a casa realmente não pertence ao projeto da ocorrência. */
  desvinculada: boolean;
  /** Conveniência: inverso de `desvinculada`. */
  vinculada: boolean;
}

export function resolverVinculoOcorrencia({
  ocorrenciaProjetoId,
  bookmakerProjetoId,
}: VinculoInput): VinculoResultado {
  const snapshot = ocorrenciaProjetoId || null;
  const atual = bookmakerProjetoId || null;

  const vinculada = snapshot ? atual === snapshot : !!atual;

  return {
    projetoEfetivo: snapshot || atual || undefined,
    desvinculada: !vinculada,
    vinculada,
  };
}
