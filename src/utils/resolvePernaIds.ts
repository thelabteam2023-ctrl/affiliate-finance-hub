/**
 * Resolução canônica de IDs de perna para liquidação.
 *
 * A RPC `liquidar_perna_surebet_v1` opera SEMPRE no nível de `apostas_pernas.id`
 * (trata todas as `apostas_perna_entradas` daquela perna atomicamente).
 *
 * Porém as abas montam `entries[]` de formas diferentes:
 *  - Todas as apostas / Surebet: entradas viram pernas sintéticas com
 *    id `${pernaId}__entrada_${entradaId}` OU são pernas reais distintas
 *    agrupadas pela mesma seleção.
 *  - Bônus: `entries[].id` é o id de `apostas_perna_entradas` (NÃO é perna).
 *    Nesse caso a montagem informa `perna_id` explicitamente.
 *
 * Esta função normaliza os três formatos em um Set de ids REAIS de perna.
 */

const ENTRADA_MARKER = "__entrada_";

export function extractRealPernaId(rawId?: string | null): string | null {
  if (!rawId) return null;
  const idx = rawId.indexOf(ENTRADA_MARKER);
  return idx > 0 ? rawId.slice(0, idx) : rawId;
}

export interface ResolvablePerna {
  id?: string | null;
  entries?: Array<{ id?: string | null; perna_id?: string | null }> | null;
}

/**
 * Retorna os ids reais de `apostas_pernas` que devem ser liquidados para
 * a perna agrupada informada — deduplicados (idempotente por perna).
 */
export function resolveRealPernaIds(perna: ResolvablePerna): string[] {
  const ids = new Set<string>();

  const mainId = extractRealPernaId(perna.id);
  if (mainId) ids.add(mainId);

  for (const entry of perna.entries || []) {
    // `perna_id` explícito tem prioridade: significa que `entry.id` é o id da
    // ENTRADA (apostas_perna_entradas), não da perna.
    const pid = entry?.perna_id ? entry.perna_id : extractRealPernaId(entry?.id);
    if (pid) ids.add(pid);
  }

  return Array.from(ids);
}
