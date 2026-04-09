/**
 * UTILITÁRIO DE FETCH PAGINADO
 * 
 * Resolve o problema de truncamento do Supabase (default 1000 linhas).
 * Busca TODOS os registros em batches usando .range(), garantindo integridade.
 */

const BATCH_SIZE = 1000;

/**
 * Busca TODOS os registros de uma query Supabase paginando automaticamente.
 * 
 * IMPORTANTE: Como Supabase query builders são imutáveis após .range(),
 * esta função recebe uma factory que cria a query base (sem .range/.limit).
 * 
 * @param queryFactory - Função que retorna a query Supabase (sem .limit/.range)
 * @param batchSize - Tamanho de cada batch (default: 1000)
 * @returns Array com TODOS os registros
 */
export async function fetchAllPaginated<T = any>(
  queryFactory: () => any,
  batchSize: number = BATCH_SIZE
): Promise<T[]> {
  const allResults: T[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await queryFactory()
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
