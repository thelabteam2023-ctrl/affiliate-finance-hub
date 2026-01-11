import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface FreebetRecebidaCompleta {
  id: string;
  bookmaker_id: string;
  bookmaker_nome: string;
  parceiro_nome: string | null;
  logo_url: string | null;
  valor: number;
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
}

export interface BookmakerEstoque {
  id: string;
  nome: string;
  parceiro_nome: string | null;
  logo_url: string | null;
  saldo_freebet: number;
  freebets_count: number;
  freebets_pendentes: number;
  freebets_liberadas: number;
  proxima_expiracao: string | null;
}

export interface EstoqueMetrics {
  saldoDisponivel: number;
  totalRecebido: number;
  totalUtilizado: number;
  totalPendentes: number;
  proximasExpirar: number;
  casasComFreebet: number;
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
          id, bookmaker_id, valor, motivo, data_recebida, data_validade,
          utilizada, data_utilizacao, aposta_id, status, origem, qualificadora_id,
          bookmakers!freebets_recebidas_bookmaker_id_fkey (
            nome, parceiro_id,
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
        };
      });

      setFreebets(formatted);

      // Fetch bookmakers with freebet balance
      const { data: bookmakers, error: bookmakersError } = await supabase
        .from("bookmakers")
        .select(`
          id, nome, saldo_freebet,
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
          freebets_count: 0,
          freebets_pendentes: 0,
          freebets_liberadas: 0,
          proxima_expiracao: null,
        });
      });

      // Aggregate freebet counts per bookmaker
      formatted.forEach(fb => {
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

  // Calculate metrics
  const metrics = useMemo((): EstoqueMetrics => {
    const saldoDisponivel = bookmakersEstoque.reduce((acc, bk) => acc + bk.saldo_freebet, 0);
    const freebetsLiberadas = freebets.filter(fb => fb.status === "LIBERADA");
    const totalRecebido = freebetsLiberadas.reduce((acc, fb) => acc + fb.valor, 0);
    const totalUtilizado = freebetsLiberadas.filter(fb => fb.utilizada).reduce((acc, fb) => acc + fb.valor, 0);
    const totalPendentes = freebets.filter(fb => fb.status === "PENDENTE").length;
    const proximasExpirar = freebets.filter(fb => 
      fb.diasParaExpirar !== null && fb.diasParaExpirar <= 7 && fb.diasParaExpirar > 0 && !fb.utilizada
    ).length;
    const casasComFreebet = bookmakersEstoque.length;

    return {
      saldoDisponivel,
      totalRecebido,
      totalUtilizado,
      totalPendentes,
      proximasExpirar,
      casasComFreebet,
    };
  }, [freebets, bookmakersEstoque]);

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

      // Get workspace_id from bookmaker
      const { data: bookmaker, error: bkError } = await supabase
        .from("bookmakers")
        .select("workspace_id")
        .eq("id", data.bookmaker_id)
        .single();

      if (bkError) throw bkError;

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
          workspace_id: bookmaker.workspace_id,
          utilizada: false,
        });

      if (error) throw error;

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
      const { error } = await supabase
        .from("freebets_recebidas")
        .delete()
        .eq("id", id);

      if (error) throw error;

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
  };
}
