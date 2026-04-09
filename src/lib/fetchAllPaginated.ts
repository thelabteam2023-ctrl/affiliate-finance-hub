/**
 * UTILITÁRIO DE FETCH PAGINADO
 * 
 * Resolve o problema de truncamento do Supabase (default 1000 linhas).
 * Busca TODOS os registros em batches usando .range(), garantindo integridade
 * e consistência entre todas as abas do sistema.
 * 
 * USO:
 * ```ts
 * const data = await fetchAllPaginated(
 *   supabase.from("apostas_unificada").select("*").eq("projeto_id", id)
 * );
 * ```
 */

import type { PostgrestFilterBuilder } from "@supabase/postgrest-js";

const BATCH_SIZE = 1000;

/**
 * Busca TODOS os registros de uma query Supabase paginando automaticamente.
 * Substitui .limit(N) para garantir que nenhum dado seja truncado.
 * 
 * @param queryBuilder - Query Supabase SEM .limit() e SEM .range()
 * @param batchSize - Tamanho de cada batch (default: 1000)
 * @returns Array com TODOS os registros
 */
export async function fetchAllPaginated<T = any>(
  queryBuilder: PostgrestFilterBuilder<any, any, any>,
  batchSize: number = BATCH_SIZE
): Promise<T[]> {
  const allResults: T[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await queryBuilder
      .range(offset, offset + batchSize - 1);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allResults.push(...(data as T[]));
      if (data.length < batchSize) {
        hasMore = false;
      } else {
        offset += batchSize;
      }
    }
  }

  return allResults;
}

/**
 * Versão que retorna count junto com os dados.
 * Útil para validação de integridade.
 */
export async function fetchAllWithCount<T = any>(
  queryBuilder: PostgrestFilterBuilder<any, any, any>,
  batchSize: number = BATCH_SIZE
): Promise<{ data: T[]; count: number }> {
  const data = await fetchAllPaginated<T>(queryBuilder, batchSize);
  return { data, count: data.length };
}
