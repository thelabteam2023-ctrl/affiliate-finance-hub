import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FreebetRecebidaCompleta, BookmakerEstoque, UseFreebetEstoqueProps } from "./types";
import { FREEBET_ESTOQUE_KEYS } from "./types";

interface EstoqueData {
  freebets: FreebetRecebidaCompleta[];
  bookmakersEstoque: BookmakerEstoque[];
}

async function fetchEstoqueData(
  projetoId: string,
  dataInicio?: Date,
  dataFim?: Date
): Promise<EstoqueData> {
  // 1. Fetch freebets via derived view (ledger-based state)
  let query = supabase
    .from("v_freebets_disponibilidade" as any)
    .select(`
      id, bookmaker_id, valor, moeda_operacao, motivo, data_recebida, data_validade,
      utilizada_derivada, data_utilizacao, aposta_id, status, origem, qualificadora_id, tem_rollover,
      valor_restante
    `)
    .eq("projeto_id", projetoId)
    .order("data_recebida", { ascending: false });

  if (dataInicio) query = query.gte("data_recebida", dataInicio.toISOString());
  if (dataFim) query = query.lte("data_recebida", dataFim.toISOString());

  const { data: freebetsData, error: freebetsError } = await query;
  if (freebetsError) throw freebetsError;

  // We need bookmaker details separately since view doesn't join
  const bookmakerIds = [...new Set((freebetsData || []).map((fb: any) => fb.bookmaker_id))];
  let bookmakerDetailsMap = new Map<string, any>();
  
  if (bookmakerIds.length > 0) {
    const { data: bkDetails } = await supabase
      .from("bookmakers")
      .select(`
        id, nome, moeda, parceiro_id,
        parceiros!bookmakers_parceiro_id_fkey (nome),
        bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url)
      `)
      .in("id", bookmakerIds);
    
    (bkDetails || []).forEach((bk: any) => {
      bookmakerDetailsMap.set(bk.id, bk);
    });
  }

  const hoje = new Date();
  const formatted: FreebetRecebidaCompleta[] = (freebetsData || []).map((fb: any) => {
    let diasParaExpirar: number | null = null;
    if (fb.data_validade) {
      const validade = new Date(fb.data_validade);
      diasParaExpirar = Math.ceil((validade.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    }
    const bk = bookmakerDetailsMap.get(fb.bookmaker_id);
    return {
      id: fb.id,
      bookmaker_id: fb.bookmaker_id,
      bookmaker_nome: bk?.nome || "Desconhecida",
      parceiro_nome: bk?.parceiros?.nome || null,
      logo_url: bk?.bookmakers_catalogo?.logo_url || null,
      valor: fb.valor,
      moeda: fb.moeda_operacao || bk?.moeda || "BRL",
      motivo: fb.motivo,
      data_recebida: fb.data_recebida,
      data_validade: fb.data_validade,
      // HARDENING: usar estado derivado do ledger, não flag manual
      utilizada: fb.utilizada_derivada || false,
      data_utilizacao: fb.data_utilizacao,
      aposta_id: fb.aposta_id,
      status: fb.status || "LIBERADA",
      origem: fb.origem || "MANUAL",
      qualificadora_id: fb.qualificadora_id,
      diasParaExpirar,
      tem_rollover: fb.tem_rollover || false,
      // NEW: valor_restante derivado do ledger
      valor_restante: fb.valor_restante ?? fb.valor,
    };
  });

  // 5. Aggregate freebet counts per bookmaker
  allFreebets.forEach(fb => {
    let bk = bookmakerEstoqueMap.get(fb.bookmaker_id);
    if (!bk) {
      // Bookmaker not in map yet (edge case) - add from freebet data
      bk = {
        id: fb.bookmaker_id,
        nome: fb.bookmaker_nome,
        parceiro_nome: fb.parceiro_nome,
        logo_url: fb.logo_url,
        saldo_freebet: 0,
        saldo_nominal: 0,
        moeda: fb.moeda,
        freebets_count: 0,
        freebets_pendentes: 0,
        freebets_liberadas: 0,
        proxima_expiracao: null,
      };
      bookmakerEstoqueMap.set(fb.bookmaker_id, bk);
    }
    bk.freebets_count++;
    if (fb.status === "PENDENTE") {
      bk.freebets_pendentes++;
    } else if (fb.status === "LIBERADA" && !fb.utilizada) {
      bk.freebets_liberadas++;
      bk.saldo_nominal += fb.valor;
      if (fb.data_validade) {
        if (!bk.proxima_expiracao || new Date(fb.data_validade) < new Date(bk.proxima_expiracao)) {
          bk.proxima_expiracao = fb.data_validade;
        }
      }
    }
  });

  // 6. Filter: only show bookmakers that have active freebets or positive balance
  const activeEstoque = Array.from(bookmakerEstoqueMap.values()).filter(
    bk => bk.freebets_liberadas > 0 || bk.freebets_pendentes > 0 || bk.saldo_nominal > 0
  );

  return {
    freebets: allFreebets,
    bookmakersEstoque: activeEstoque,
  };
}

export function useFreebetEstoqueQuery({ projetoId, dataInicio, dataFim }: UseFreebetEstoqueProps) {
  return useQuery({
    queryKey: FREEBET_ESTOQUE_KEYS.withDates(projetoId, dataInicio, dataFim),
    queryFn: () => fetchEstoqueData(projetoId, dataInicio, dataFim),
    enabled: !!projetoId,
    staleTime: 30_000, // 30s - dados de estoque não mudam a cada segundo
  });
}
