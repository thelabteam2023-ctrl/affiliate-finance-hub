import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { usePromotionalCurrencyConversion } from "@/hooks/usePromotionalCurrencyConversion";
import { useWorkspace } from "@/hooks/useWorkspace";

export interface FreebetRecebidaCompleta {
  id: string;
  bookmaker_id: string;
  bookmaker_nome: string;
  parceiro_nome: string | null;
  logo_url: string | null;
  valor: number;
  moeda: string; // CRÍTICO: moeda da freebet (herdada da bookmaker)
  motivo: string;
  data_recebida: string;
  data_validade: string | null;
  utilizada: boolean;
  data_utilizacao: string | null;
  aposta_id: string | null;
  status: "PENDENTE" | "LIBERADA" | "NAO_LIBERADA";
  origem: "MANUAL" | "QUALIFICADORA" | "PROMOCAO";
  qualificadora_id: string | null;
  diasParaExpirar: number | null;
  tem_rollover: boolean;
}

export interface BookmakerEstoque {
  id: string;
  nome: string;
  parceiro_nome: string | null;
  logo_url: string | null;
  saldo_freebet: number;
  moeda: string;
  freebets_count: number;
  freebets_pendentes: number;
  freebets_liberadas: number;
  proxima_expiracao: string | null;
}

export interface EstoqueMetrics {
  saldoDisponivel: number;
  totalRecebido: number;
  totalUtilizado: number;
  proximasExpirar: number;
  casasComFreebet: number;
  moedaConsolidacao: string;
  /** Breakdown por moeda original */
  saldoPorMoeda?: { moeda: string; valor: number }[];
  recebidoPorMoeda?: { moeda: string; valor: number }[];
}

interface UseFreebetEstoqueProps {
  projetoId: string;
  dataInicio?: Date;
  dataFim?: Date;
}

export function useFreebetEstoque({ projetoId, dataInicio, dataFim }: UseFreebetEstoqueProps) {
  const [freebets, setFreebets] = useState<FreebetRecebidaCompleta[]>([]);
  const [bookmakersEstoque, setBookmakersEstoque] = useState<BookmakerEstoque[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { workspaceId } = useWorkspace();

  // Hook centralizado para conversão de moeda
  const { converterParaConsolidacao, config: currencyConfig } = usePromotionalCurrencyConversion(projetoId);

  const fetchEstoque = useCallback(async () => {
    if (!projetoId) {
      setFreebets([]);
      setBookmakersEstoque([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch freebets recebidas
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

      if (dataInicio) {
        query = query.gte("data_recebida", dataInicio.toISOString());
      }
      if (dataFim) {
        query = query.lte("data_recebida", dataFim.toISOString());
      }

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
          // CRÍTICO: moeda_operacao tem prioridade, fallback para moeda da bookmaker
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

      // Também buscar freebets originadas do módulo de bônus (project_bookmaker_link_bonuses)
      let bonusFreebetQuery = supabase
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

      const { data: bonusFreebets } = await bonusFreebetQuery;

      // IDs já presentes para evitar duplicatas
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
      setFreebets(allFreebets);

      // Fetch bookmakers with freebet balance
      const { data: bookmakers, error: bookmakersError } = await supabase
        .from("bookmakers")
        .select(`
          id, nome, moeda, saldo_freebet,
          parceiros!bookmakers_parceiro_id_fkey (nome),
          bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url)
        `)
        .eq("projeto_id", projetoId)
        .gt("saldo_freebet", 0);

      if (bookmakersError) throw bookmakersError;

      // Calculate estoque per bookmaker
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

      // Aggregate freebet counts per bookmaker
      allFreebets.forEach(fb => {
        const bk = bookmakerEstoqueMap.get(fb.bookmaker_id);
        if (bk) {
          bk.freebets_count++;
          if (fb.status === "PENDENTE") {
            bk.freebets_pendentes++;
          } else if (fb.status === "LIBERADA" && !fb.utilizada) {
            bk.freebets_liberadas++;
            // Track próxima expiração
            if (fb.data_validade) {
              if (!bk.proxima_expiracao || new Date(fb.data_validade) < new Date(bk.proxima_expiracao)) {
                bk.proxima_expiracao = fb.data_validade;
              }
            }
          }
        }
      });

      setBookmakersEstoque(Array.from(bookmakerEstoqueMap.values()));
    } catch (err: any) {
      console.error("Error fetching freebet estoque:", err);
      setError(err.message);
      toast.error("Erro ao carregar estoque de freebets");
    } finally {
      setLoading(false);
    }
  }, [projetoId, dataInicio, dataFim]);

  useEffect(() => {
    fetchEstoque();
  }, [fetchEstoque]);

  /**
   * MÉTRICAS COM CONVERSÃO PARA MOEDA DE CONSOLIDAÇÃO
   */
  const metrics = useMemo((): EstoqueMetrics => {
    // Maps para agregação por moeda
    const saldoPorMoedaMap = new Map<string, number>();
    const recebidoPorMoedaMap = new Map<string, number>();
    
    // CRÍTICO: Converter saldos para moeda de consolidação
    const saldoDisponivel = bookmakersEstoque.reduce((acc, bk) => {
      // Acumula na moeda original
      saldoPorMoedaMap.set(bk.moeda, (saldoPorMoedaMap.get(bk.moeda) || 0) + bk.saldo_freebet);
      return acc + converterParaConsolidacao(bk.saldo_freebet, bk.moeda);
    }, 0);
    
    const freebetsLiberadas = freebets.filter(fb => fb.status === "LIBERADA");
    
    const totalRecebido = freebetsLiberadas.reduce((acc, fb) => {
      // Acumula na moeda original
      recebidoPorMoedaMap.set(fb.moeda, (recebidoPorMoedaMap.get(fb.moeda) || 0) + fb.valor);
      return acc + converterParaConsolidacao(fb.valor, fb.moeda);
    }, 0);
    
    const totalUtilizado = freebetsLiberadas
      .filter(fb => fb.utilizada)
      .reduce((acc, fb) => acc + converterParaConsolidacao(fb.valor, fb.moeda), 0);
    
    const proximasExpirar = freebets.filter(fb => 
      fb.diasParaExpirar !== null && fb.diasParaExpirar <= 7 && fb.diasParaExpirar > 0 && !fb.utilizada
    ).length;
    const casasComFreebet = bookmakersEstoque.length;

    // Converte Maps para arrays
    const saldoPorMoeda = Array.from(saldoPorMoedaMap.entries())
      .map(([moeda, valor]) => ({ moeda, valor }))
      .filter(item => Math.abs(item.valor) > 0.01);
      
    const recebidoPorMoeda = Array.from(recebidoPorMoedaMap.entries())
      .map(([moeda, valor]) => ({ moeda, valor }))
      .filter(item => Math.abs(item.valor) > 0.01);

    return {
      saldoDisponivel,
      totalRecebido,
      totalUtilizado,
      proximasExpirar,
      casasComFreebet,
      moedaConsolidacao: currencyConfig.moedaConsolidacao,
      saldoPorMoeda,
      recebidoPorMoeda,
    };
  }, [freebets, bookmakersEstoque, converterParaConsolidacao, currencyConfig.moedaConsolidacao]);

  // Create freebet
  const createFreebet = async (data: {
    bookmaker_id: string;
    valor: number;
    motivo: string;
    data_recebida: string;
    data_validade?: string;
    status: "PENDENTE" | "LIBERADA" | "NAO_LIBERADA";
    origem?: "MANUAL" | "QUALIFICADORA" | "PROMOCAO";
  }) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      if (!workspaceId) throw new Error("Workspace não definido nesta aba");

      const { error } = await supabase
        .from("freebets_recebidas")
        .insert({
          projeto_id: projetoId,
          bookmaker_id: data.bookmaker_id,
          valor: data.valor,
          motivo: data.motivo,
          data_recebida: data.data_recebida,
          data_validade: data.data_validade || null,
          status: data.status,
          origem: data.origem || "MANUAL",
          user_id: user.id,
          workspace_id: workspaceId,
          utilizada: false,
        });

      if (error) throw error;

      // Se status LIBERADA, gerar financial_event para incrementar saldo_freebet
      if (data.status === "LIBERADA") {
        // Buscar moeda da bookmaker
        const { data: bkData } = await supabase
          .from("bookmakers")
          .select("moeda")
          .eq("id", data.bookmaker_id)
          .single();

        const { error: rpcError } = await supabase.rpc("process_financial_event", {
          p_bookmaker_id: data.bookmaker_id,
          p_tipo_evento: "FREEBET_CREDIT",
          p_tipo_uso: "FREEBET",
          p_origem: "FREEBET_MANUAL",
          p_valor: data.valor,
          p_moeda: bkData?.moeda || "BRL",
          p_descricao: `Freebet manual: ${data.motivo}`,
        });
        
        if (rpcError) {
          console.error("[useFreebetEstoque] Erro ao creditar freebet no saldo:", rpcError);
          toast.error("Freebet registrada, mas erro ao atualizar saldo");
        }
      }

      toast.success("Freebet registrada com sucesso");
      await fetchEstoque();
      return true;
    } catch (err: any) {
      console.error("Error creating freebet:", err);
      toast.error("Erro ao registrar freebet");
      return false;
    }
  };

  // Update freebet
  const updateFreebet = async (id: string, data: Partial<FreebetRecebidaCompleta>) => {
    try {
      const updateData: any = {};
      if (data.valor !== undefined) updateData.valor = data.valor;
      if (data.motivo !== undefined) updateData.motivo = data.motivo;
      if (data.data_recebida !== undefined) updateData.data_recebida = data.data_recebida;
      if (data.data_validade !== undefined) updateData.data_validade = data.data_validade;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.utilizada !== undefined) updateData.utilizada = data.utilizada;
      if (data.data_utilizacao !== undefined) updateData.data_utilizacao = data.data_utilizacao;
      if (data.origem !== undefined) updateData.origem = data.origem;

      const { error } = await supabase
        .from("freebets_recebidas")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;

      toast.success("Freebet atualizada com sucesso");
      await fetchEstoque();
      return true;
    } catch (err: any) {
      console.error("Error updating freebet:", err);
      toast.error("Erro ao atualizar freebet");
      return false;
    }
  };

  // Delete freebet
  const deleteFreebet = async (id: string) => {
    try {
      // Buscar dados da freebet antes de deletar para reverter o saldo
      const freebet = freebets.find(fb => fb.id === id);
      
      const { error } = await supabase
        .from("freebets_recebidas")
        .delete()
        .eq("id", id);

      if (error) throw error;

      // Se era LIBERADA e não utilizada, reverter o saldo_freebet
      if (freebet && freebet.status === "LIBERADA" && !freebet.utilizada) {
        const { error: rpcError } = await supabase.rpc("process_financial_event", {
          p_bookmaker_id: freebet.bookmaker_id,
          p_tipo_evento: "FREEBET_EXPIRE",
          p_tipo_uso: "FREEBET",
          p_origem: "EXCLUSAO_FREEBET",
          p_valor: -freebet.valor, // negativo para debitar
          p_moeda: freebet.moeda,
          p_descricao: `Reversão por exclusão de freebet: ${freebet.motivo}`,
        });

        if (rpcError) {
          console.error("[useFreebetEstoque] Erro ao reverter saldo_freebet:", rpcError);
          toast.error("Freebet removida, mas erro ao reverter saldo");
        }
      }

      toast.success("Freebet removida com sucesso");
      await fetchEstoque();
      return true;
    } catch (err: any) {
      console.error("Error deleting freebet:", err);
      toast.error("Erro ao remover freebet");
      return false;
    }
  };

  return {
    freebets,
    bookmakersEstoque,
    metrics,
    loading,
    error,
    refresh: fetchEstoque,
    createFreebet,
    updateFreebet,
    deleteFreebet,
    // Expor configuração de moeda para transparência na UI
    moedaConsolidacao: currencyConfig.moedaConsolidacao,
    cotacaoInfo: {
      fonte: currencyConfig.fonte,
      taxa: currencyConfig.cotacaoAtual,
      disponivel: currencyConfig.disponivel,
    },
  };
}
