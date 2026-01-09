import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  GiroGratisDisponivel, 
  GiroDisponivelComBookmaker, 
  GirosDisponiveisMetrics,
  GiroDisponivelFormData 
} from "@/types/girosGratisDisponiveis";
import { differenceInDays, parseISO } from "date-fns";

interface UseGirosDisponiveisOptions {
  projetoId: string;
}

export function useGirosDisponiveis({ projetoId }: UseGirosDisponiveisOptions) {
  const [giros, setGiros] = useState<GiroDisponivelComBookmaker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGiros = useCallback(async () => {
    if (!projetoId) return;
    
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("giros_gratis_disponiveis" as any)
        .select(`
          *,
          bookmakers!inner (
            id,
            nome,
            parceiro_id,
            bookmaker_catalogo_id,
            bookmakers_catalogo (
              logo_url
            ),
            parceiros (
              nome
            )
          )
        `)
        .eq("projeto_id", projetoId)
        .order("data_recebido", { ascending: false });

      if (fetchError) throw fetchError;

      const now = new Date();
      const girosFormatados: GiroDisponivelComBookmaker[] = (data || []).map((g: any) => {
        const dataValidade = g.data_validade ? parseISO(g.data_validade) : null;
        const diasRestantes = dataValidade ? differenceInDays(dataValidade, now) : null;
        
        return {
          ...g,
          bookmaker_nome: g.bookmakers?.nome || "Desconhecido",
          bookmaker_logo_url: g.bookmakers?.bookmakers_catalogo?.logo_url || null,
          parceiro_nome: g.bookmakers?.parceiros?.nome || null,
          dias_restantes: diasRestantes,
          prestes_a_expirar: diasRestantes !== null && diasRestantes <= 3 && diasRestantes >= 0,
        };
      });

      setGiros(girosFormatados);
    } catch (err) {
      console.error("Erro ao buscar giros disponíveis:", err);
      setError("Erro ao carregar dados");
      toast.error("Erro ao carregar giros disponíveis");
    } finally {
      setLoading(false);
    }
  }, [projetoId]);

  // Filtrar apenas disponíveis
  const girosDisponiveis = useMemo(() => {
    return giros.filter(g => g.status === "DISPONIVEL");
  }, [giros]);

  // Métricas
  const metrics = useMemo((): GirosDisponiveisMetrics => {
    const disponiveis = girosDisponiveis;
    const casasUnicas = new Set(disponiveis.map(g => g.bookmaker_id));
    
    return {
      totalDisponiveis: disponiveis.length,
      valorTotalDisponivel: disponiveis.reduce((sum, g) => sum + Number(g.valor_total || 0), 0),
      girosProximosExpirar: disponiveis.filter(g => g.prestes_a_expirar).length,
      casasComGiros: casasUnicas.size,
    };
  }, [girosDisponiveis]);

  const createGiro = async (formData: GiroDisponivelFormData): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data: projeto } = await supabase
        .from("projetos")
        .select("workspace_id")
        .eq("id", projetoId)
        .single();

      if (!projeto) throw new Error("Projeto não encontrado");

      const insertData: any = {
        projeto_id: projetoId,
        bookmaker_id: formData.bookmaker_id,
        workspace_id: projeto.workspace_id,
        user_id: user.id,
        quantidade_giros: formData.quantidade_giros,
        valor_por_giro: formData.valor_por_giro,
        motivo: formData.motivo,
        data_recebido: formData.data_recebido.toISOString(),
        data_validade: formData.data_validade?.toISOString() || null,
        observacoes: formData.observacoes || null,
        status: "DISPONIVEL",
      };

      const { error } = await supabase.from("giros_gratis_disponiveis" as any).insert(insertData);

      if (error) throw error;

      toast.success("Promoção de giros registrada!");
      await fetchGiros();
      return true;
    } catch (err) {
      console.error("Erro ao criar giro disponível:", err);
      toast.error("Erro ao registrar promoção");
      return false;
    }
  };

  const updateGiro = async (id: string, formData: Partial<GiroDisponivelFormData>): Promise<boolean> => {
    try {
      const updateData: any = {};

      if (formData.bookmaker_id !== undefined) updateData.bookmaker_id = formData.bookmaker_id;
      if (formData.quantidade_giros !== undefined) updateData.quantidade_giros = formData.quantidade_giros;
      if (formData.valor_por_giro !== undefined) updateData.valor_por_giro = formData.valor_por_giro;
      if (formData.motivo !== undefined) updateData.motivo = formData.motivo;
      if (formData.data_recebido !== undefined) updateData.data_recebido = formData.data_recebido.toISOString();
      if (formData.data_validade !== undefined) updateData.data_validade = formData.data_validade?.toISOString() || null;
      if (formData.observacoes !== undefined) updateData.observacoes = formData.observacoes;

      const { error } = await supabase
        .from("giros_gratis_disponiveis" as any)
        .update(updateData)
        .eq("id", id);

      if (error) throw error;

      toast.success("Promoção atualizada!");
      await fetchGiros();
      return true;
    } catch (err) {
      console.error("Erro ao atualizar giro disponível:", err);
      toast.error("Erro ao atualizar");
      return false;
    }
  };

  const marcarComoUtilizado = async (id: string, resultadoId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("giros_gratis_disponiveis" as any)
        .update({ 
          status: "UTILIZADO",
          giro_gratis_resultado_id: resultadoId,
          data_utilizacao: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;

      toast.success("Promoção marcada como utilizada!");
      await fetchGiros();
      return true;
    } catch (err) {
      console.error("Erro ao marcar como utilizado:", err);
      toast.error("Erro ao atualizar status");
      return false;
    }
  };

  const marcarComoExpirado = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("giros_gratis_disponiveis" as any)
        .update({ status: "EXPIRADO" })
        .eq("id", id);

      if (error) throw error;

      toast.success("Promoção marcada como expirada");
      await fetchGiros();
      return true;
    } catch (err) {
      console.error("Erro ao marcar como expirado:", err);
      toast.error("Erro ao atualizar");
      return false;
    }
  };

  const cancelarGiro = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("giros_gratis_disponiveis" as any)
        .update({ status: "CANCELADO" })
        .eq("id", id);

      if (error) throw error;

      toast.success("Promoção cancelada");
      await fetchGiros();
      return true;
    } catch (err) {
      console.error("Erro ao cancelar giro:", err);
      toast.error("Erro ao cancelar");
      return false;
    }
  };

  useEffect(() => {
    fetchGiros();
  }, [fetchGiros]);

  return {
    giros,
    girosDisponiveis,
    loading,
    error,
    metrics,
    refresh: fetchGiros,
    createGiro,
    updateGiro,
    marcarComoUtilizado,
    marcarComoExpirado,
    cancelarGiro,
  };
}
