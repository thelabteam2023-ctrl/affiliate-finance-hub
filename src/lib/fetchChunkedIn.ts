/**
 * UTILITÁRIO DE FETCH COM .in() CHUNKED
 * 
 * Resolve o problema de URL too long (HTTP 400) quando se passa
 * muitos IDs numa cláusula .in() do Supabase REST API.
 * 
 * Divide os IDs em chunks e faz múltiplas queries paralelas.
 */

const CHUNK_SIZE = 200; // ~200 UUIDs por chunk para ficar bem abaixo do limite de URL

/**
 * Busca registros usando .in() com chunking automático.
 * 
 * @param queryFactory - Função que recebe um array de IDs e retorna a query Supabase
 * @param ids - Array completo de IDs para filtrar
 * @param chunkSize - Tamanho de cada chunk (default: 200)
 * @returns Array com TODOS os registros combinados
 */
export async function fetchChunkedIn<T = any>(
  queryFactory: (idsChunk: string[]) => any,
  ids: string[],
  chunkSize: number = CHUNK_SIZE
): Promise<T[]> {
  if (ids.length === 0) return [];
  
  // Se cabe em um único chunk, query direta
  if (ids.length <= chunkSize) {
    const { data, error } = await queryFactory(ids);
    if (error) throw error;
    return (data || []) as T[];
  }

  // Dividir em chunks e executar em paralelo
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }

  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const { data, error } = await queryFactory(chunk);
      if (error) throw error;
      return (data || []) as T[];
    })
  );

  return results.flat();
}
