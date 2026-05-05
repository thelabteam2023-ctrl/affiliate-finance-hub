/**
 * Hook para buscar pernas de apostas da tabela normalizada apostas_pernas
 * 
 * Substitui a leitura do campo JSONB `pernas` da tabela apostas_unificada.
 * Benefícios:
 * - Índices nativos por bookmaker_id
 * - Queries SQL simples sem jsonb_array_elements
 * - Auditável externamente
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ApostaPerna, ApostaPernaResultado } from "@/types/apostasPernas";
import type { SupportedCurrency } from "@/types/currency";

export interface PernaComBookmaker extends ApostaPerna {
  /** ID lógico da perna (Leg) no banco */
  pernaId?: string;
  bookmaker_nome?: string;
  bookmaker_logo_url?: string;
  parceiro_nome?: string;
  parceiro_id?: string;
  moeda_bookmaker?: string;
  data_aposta?: string;
  status_aposta?: string;
  estrategia?: string;
  forma_registro?: string;
}

interface UseApostasPernasOptions {
  apostaIds?: string[];
  bookmakerIds?: string[];
  projetoId?: string;
  status?: string[];
  resultados?: ApostaPernaResultado[];
  enabled?: boolean;
}

 // Helper para mapear row de entrada para PernaComBookmaker (compatibilidade)
 function mapRowToPerna(row: Record<string, unknown>): PernaComBookmaker {
   const bookmakers = row.bookmakers as Record<string, unknown> | undefined;
   const perna = row.apostas_pernas as Record<string, unknown> | undefined;
   const apostasUnificada = perna?.apostas_unificada as Record<string, unknown> | undefined;
   const catalogo = bookmakers?.bookmakers_catalogo as Record<string, unknown> | undefined;
   const parceiros = bookmakers?.parceiros as Record<string, unknown> | undefined;
 
   // No novo modelo, 'id' retornado para a UI é o da entrada para garantir unicidade,
   // mas guardamos o 'perna_id' lógico para ações de liquidação.
   return {
     id: row.id as string, 
     pernaId: row.perna_id as string, // ID lógico (Leg)
     aposta_id: perna?.aposta_id as string,
     bookmaker_id: row.bookmaker_id as string,
     ordem: (perna?.ordem as number) || 0,
     selecao: (perna?.selecao as string) || "N/A",
     selecao_livre: (row.selecao_livre as string | null) || (perna?.selecao_livre as string | null),
     odd: row.odd as number,
     stake: row.stake as number,
     moeda: (row.moeda || "BRL") as SupportedCurrency,
     stake_brl_referencia: row.stake_brl_referencia as number | null,
     cotacao_snapshot: row.cotacao_snapshot as number | null,
     cotacao_snapshot_at: row.cotacao_snapshot_at as string | null,
     resultado: perna?.resultado as ApostaPernaResultado | null,
     lucro_prejuizo: row.lucro_prejuizo as number | null,
     lucro_prejuizo_brl_referencia: row.lucro_prejuizo_brl_referencia as number | null,
     gerou_freebet: (row.fonte_saldo === 'FREEBET') as boolean,
     valor_freebet_gerada: null, // Campo derivado da perna
     created_at: row.created_at as string,
     updated_at: row.updated_at as string,
     // Dados enriquecidos do bookmaker
     bookmaker_nome: bookmakers?.nome as string | undefined,
     bookmaker_logo_url: catalogo?.logo_url as string | undefined,
     parceiro_id: bookmakers?.parceiro_id as string | undefined,
     parceiro_nome: parceiros?.nome as string | undefined,
     moeda_bookmaker: bookmakers?.moeda as string | undefined,
     // Dados da aposta pai
     data_aposta: apostasUnificada?.data_aposta as string | undefined,
     status_aposta: apostasUnificada?.status as string | undefined,
     estrategia: apostasUnificada?.estrategia as string | undefined,
     forma_registro: apostasUnificada?.forma_registro as string | undefined,
   };
 }
 
 /**
  * Busca pernas de apostas (agora mapeado de apostas_perna_entradas para suporte multi-casas)
  */
 export function useApostasPernas(options: UseApostasPernasOptions = {}) {
   const { apostaIds, bookmakerIds, projetoId, status, resultados, enabled = true } = options;
 
   return useQuery({
     queryKey: ["apostas-pernas-entries", apostaIds, bookmakerIds, projetoId, status, resultados],
     queryFn: async (): Promise<PernaComBookmaker[]> => {
       // Query normalizada — busca entradas e faz join com as pernas lógicas
       const selectQuery = `
         *,
         bookmakers (id, nome, moeda, parceiro_id, bookmakers_catalogo (logo_url), parceiros (id, nome)),
         apostas_pernas (
           id, aposta_id, ordem, selecao, selecao_livre, resultado,
           apostas_unificada (id, projeto_id, status, data_aposta, estrategia, forma_registro)
         )
       `;
 
       let query = supabase.from("apostas_perna_entradas").select(selectQuery);
 
       if (apostaIds && apostaIds.length > 0) {
         query = query.in("apostas_pernas.aposta_id", apostaIds);
       }
       if (bookmakerIds && bookmakerIds.length > 0) {
         query = query.in("bookmaker_id", bookmakerIds);
       }
       if (resultados && resultados.length > 0) {
         query = query.in("apostas_pernas.resultado", resultados);
       }
 
       query = query.order("created_at", { ascending: false }).limit(10000);
 
       const { data, error } = await query;
 
       if (error) {
         console.error("[useApostasPernas] Erro:", error);
         throw error;
       }
 
       // Filtra por projeto se necessário (pós-query devido ao join aninhado)
       let mapped = (data || []) as Record<string, any>[];
       
       if (projetoId) {
         mapped = mapped.filter(row => row.apostas_pernas?.apostas_unificada?.projeto_id === projetoId);
       }
       
       if (status && status.length > 0) {
         mapped = mapped.filter(row => status.includes(row.apostas_pernas?.apostas_unificada?.status));
       }
 
       return mapped.map(mapRowToPerna);
     },
     enabled,
   });
 }

/**
 * Busca pernas de uma única aposta
 */
export function usePernasDeAposta(apostaId: string | null) {
  return useApostasPernas({
    apostaIds: apostaId ? [apostaId] : [],
    enabled: !!apostaId,
  });
}

/**
 * Busca pernas pendentes de bookmakers específicos
 */
export function usePernasBookmakerPendentes(bookmakerIds: string[]) {
  return useApostasPernas({
    bookmakerIds,
    resultados: ["PENDENTE"],
    enabled: bookmakerIds.length > 0,
  });
}

/**
 * Busca todas as pernas de um projeto para análises
 */
export function usePernasProjetoAnalise(projetoId: string | null) {
  return useQuery({
    queryKey: ["apostas-pernas-analise", projetoId],
    queryFn: async (): Promise<PernaComBookmaker[]> => {
      if (!projetoId) return [];

      const { data, error } = await supabase
        .from("apostas_pernas")
        .select(`
          *,
          bookmakers (id, nome, moeda, parceiro_id, bookmakers_catalogo (logo_url), parceiros (id, nome)),
          apostas_unificada (id, projeto_id, status, data_aposta, estrategia, forma_registro)
        `)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[usePernasProjetoAnalise] Erro:", error);
        throw error;
      }

      // Filtra por projeto pós-query
      const filtered = ((data || []) as Record<string, unknown>[]).filter((row) => {
        const aposta = row.apostas_unificada as Record<string, unknown> | undefined;
        return aposta?.projeto_id === projetoId;
      });

      return filtered.map(mapRowToPerna);
    },
    enabled: !!projetoId,
  });
}

/**
 * Agrupa pernas por aposta_id para facilitar renderização
 */
export function agruparPernasPorAposta(
  pernas: PernaComBookmaker[]
): Map<string, PernaComBookmaker[]> {
  const map = new Map<string, PernaComBookmaker[]>();
  
  for (const perna of pernas) {
    const existing = map.get(perna.aposta_id) || [];
    existing.push(perna);
    map.set(perna.aposta_id, existing);
  }

  for (const [key, value] of map.entries()) {
    map.set(key, value.sort((a, b) => a.ordem - b.ordem));
  }

  return map;
}

/**
 * Busca pernas diretamente por IDs de apostas (para uso pontual)
 */
export async function fetchPernasByApostaIds(
  apostaIds: string[]
): Promise<PernaComBookmaker[]> {
  if (apostaIds.length === 0) return [];

  const { data, error } = await supabase
    .from("apostas_pernas")
    .select(`
      *,
      bookmakers (id, nome, moeda, parceiro_id, bookmakers_catalogo (logo_url), parceiros (id, nome))
    `)
    .in("aposta_id", apostaIds)
    .order("ordem", { ascending: true });

  if (error) {
    console.error("[fetchPernasByApostaIds] Erro:", error);
    throw error;
  }

  return ((data || []) as Record<string, unknown>[]).map(mapRowToPerna);
}
