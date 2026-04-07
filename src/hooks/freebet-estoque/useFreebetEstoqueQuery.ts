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
  // 1. Fetch freebets_recebidas
  let query = supabase
    .from("freebets_recebidas")
    .select(`
      id, bookmaker_id, valor, moeda_operacao, motivo, data_recebida, data_validade,
      utilizada, data_utilizacao, aposta_id, status, origem, qualificadora_id, tem_rollover,
      bookmakers!freebets_recebidas_bookmaker_id_fkey (
        nome, moeda, parceiro_id,
        parceiros!bookmakers_parceiro_id_fkey (nome),
        bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url)
      )
    `)
    .eq("projeto_id", projetoId)
    .order("data_recebida", { ascending: false });

  if (dataInicio) query = query.gte("data_recebida", dataInicio.toISOString());
  if (dataFim) query = query.lte("data_recebida", dataFim.toISOString());

  const { data: freebetsData, error: freebetsError } = await query;
  if (freebetsError) throw freebetsError;

  const hoje = new Date();
  const formatted: FreebetRecebidaCompleta[] = (freebetsData || []).map((fb: any) => {
    let diasParaExpirar: number | null = null;
    if (fb.data_validade) {
      const validade = new Date(fb.data_validade);
      diasParaExpirar = Math.ceil((validade.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    }
    return {
      id: fb.id,
      bookmaker_id: fb.bookmaker_id,
      bookmaker_nome: fb.bookmakers?.nome || "Desconhecida",
      parceiro_nome: fb.bookmakers?.parceiros?.nome || null,
      logo_url: fb.bookmakers?.bookmakers_catalogo?.logo_url || null,
      valor: fb.valor,
      moeda: fb.moeda_operacao || fb.bookmakers?.moeda || "BRL",
      motivo: fb.motivo,
      data_recebida: fb.data_recebida,
      data_validade: fb.data_validade,
      utilizada: fb.utilizada || false,
      data_utilizacao: fb.data_utilizacao,
      aposta_id: fb.aposta_id,
      status: fb.status || "LIBERADA",
      origem: fb.origem || "MANUAL",
      qualificadora_id: fb.qualificadora_id,
      diasParaExpirar,
      tem_rollover: fb.tem_rollover || false,
    };
  });

  // 2. Fetch freebets from bonus module (project_bookmaker_link_bonuses)
  const { data: bonusFreebets } = await supabase
    .from("project_bookmaker_link_bonuses")
    .select(`
      id, bookmaker_id, bonus_amount, status, created_at,
      bookmakers!project_bookmaker_link_bonuses_bookmaker_id_fkey (
        nome, moeda, parceiro_id,
        parceiros!bookmakers_parceiro_id_fkey (nome),
        bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url)
      )
    `)
    .eq("project_id", projetoId)
    .eq("tipo_bonus", "FREEBET");

  const existingIds = new Set(formatted.map(f => f.id));
  const bonusFormatted: FreebetRecebidaCompleta[] = (bonusFreebets || [])
    .filter((bf: any) => !existingIds.has(bf.id))
    .map((bf: any) => ({
      id: bf.id,
      bookmaker_id: bf.bookmaker_id,
      bookmaker_nome: bf.bookmakers?.nome || "Desconhecida",
      parceiro_nome: bf.bookmakers?.parceiros?.nome || null,
      logo_url: bf.bookmakers?.bookmakers_catalogo?.logo_url || null,
      valor: bf.bonus_amount || 0,
      moeda: bf.bookmakers?.moeda || "BRL",
      motivo: "Bônus Freebet",
      data_recebida: bf.created_at,
      data_validade: null,
      utilizada: false,
      data_utilizacao: null,
      aposta_id: null,
      status: bf.status === "credited" ? "LIBERADA" as const : "PENDENTE" as const,
      origem: "PROMOCAO" as const,
      qualificadora_id: null,
      diasParaExpirar: null,
      tem_rollover: false,
    }));

  const allFreebets = [...formatted, ...bonusFormatted];

  // 3. Fetch bookmakers with freebet balance OR that have freebets_recebidas records
  // This ensures bookmakers aren't hidden due to saldo_freebet desync
  const bookmakerIdsFromFreebets = [...new Set(allFreebets.map(fb => fb.bookmaker_id))];
  
  const { data: bookmakers, error: bookmakersError } = await supabase
    .from("bookmakers")
    .select(`
      id, nome, moeda, saldo_freebet,
      parceiros!bookmakers_parceiro_id_fkey (nome),
      bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url)
    `)
    .eq("projeto_id", projetoId)
    .or(
      `saldo_freebet.gt.0${bookmakerIdsFromFreebets.length > 0 ? `,id.in.(${bookmakerIdsFromFreebets.join(",")})` : ""}`
    );

  if (bookmakersError) throw bookmakersError;

  // 4. Build bookmaker estoque map
  const bookmakerEstoqueMap = new Map<string, BookmakerEstoque>();
  (bookmakers || []).forEach((bk: any) => {
    bookmakerEstoqueMap.set(bk.id, {
      id: bk.id,
      nome: bk.nome,
      parceiro_nome: bk.parceiros?.nome || null,
      logo_url: bk.bookmakers_catalogo?.logo_url || null,
      saldo_freebet: bk.saldo_freebet || 0,
      moeda: bk.moeda || "BRL",
      freebets_count: 0,
      freebets_pendentes: 0,
      freebets_liberadas: 0,
      proxima_expiracao: null,
    });
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
      if (fb.data_validade) {
        if (!bk.proxima_expiracao || new Date(fb.data_validade) < new Date(bk.proxima_expiracao)) {
          bk.proxima_expiracao = fb.data_validade;
        }
      }
    }
  });

  // 6. Filter: only show bookmakers that have active freebets or positive balance
  const activeEstoque = Array.from(bookmakerEstoqueMap.values()).filter(
    bk => bk.freebets_liberadas > 0 || bk.freebets_pendentes > 0 || bk.saldo_freebet > 0
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
