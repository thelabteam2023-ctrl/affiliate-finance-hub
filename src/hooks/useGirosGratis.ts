import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  GiroGratis, 
  GiroGratisComBookmaker, 
  GirosGratisMetrics, 
  GirosGratisPorBookmaker,
  GirosGratisChartData,
  GiroGratisFormData 
} from "@/types/girosGratis";

interface UseGirosGratisOptions {
  projetoId: string;
  dataInicio?: Date | null;
  dataFim?: Date | null;
}

export function useGirosGratis({ projetoId, dataInicio, dataFim }: UseGirosGratisOptions) {
  const [giros, setGiros] = useState<GiroGratisComBookmaker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<GirosGratisMetrics>({
    totalRetorno: 0,
    totalGiros: 0,
    mediaRetornoPorGiro: 0,
    totalRegistros: 0,
    registrosSimples: 0,
    registrosDetalhados: 0,
  });
  const [porBookmaker, setPorBookmaker] = useState<GirosGratisPorBookmaker[]>([]);
  const [chartData, setChartData] = useState<GirosGratisChartData[]>([]);

  const fetchGiros = useCallback(async () => {
    if (!projetoId) return;
    
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from("giros_gratis" as any)
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
        .neq("status", "cancelado")
        .order("data_registro", { ascending: false });

      if (dataInicio) {
        query = query.gte("data_registro", dataInicio.toISOString());
      }
      if (dataFim) {
        query = query.lte("data_registro", dataFim.toISOString());
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      const girosFormatados: GiroGratisComBookmaker[] = (data || []).map((g: any) => ({
        ...g,
        bookmaker_nome: g.bookmakers?.nome || "Desconhecido",
        bookmaker_logo_url: g.bookmakers?.bookmakers_catalogo?.logo_url || null,
        parceiro_nome: g.bookmakers?.parceiros?.nome || null,
      }));

      setGiros(girosFormatados);

      // Calcular métricas
      const metricsData = calcularMetricas(girosFormatados);
      setMetrics(metricsData);

      // Calcular por bookmaker
      const bookmakerData = calcularPorBookmaker(girosFormatados);
      setPorBookmaker(bookmakerData);

      // Calcular dados do gráfico
      const chart = calcularChartData(girosFormatados);
      setChartData(chart);

    } catch (err) {
      console.error("Erro ao buscar giros grátis:", err);
      setError("Erro ao carregar dados");
      toast.error("Erro ao carregar giros grátis");
    } finally {
      setLoading(false);
    }
  }, [projetoId, dataInicio, dataFim]);

  const calcularMetricas = (data: GiroGratisComBookmaker[]): GirosGratisMetrics => {
    const confirmados = data.filter(g => g.status === "confirmado");
    const totalRetorno = confirmados.reduce((sum, g) => sum + Number(g.valor_retorno), 0);
    const totalGiros = confirmados
      .filter(g => g.modo === "detalhado")
      .reduce((sum, g) => sum + (g.quantidade_giros || 0), 0);
    
    return {
      totalRetorno,
      totalGiros,
      mediaRetornoPorGiro: totalGiros > 0 ? totalRetorno / totalGiros : 0,
      totalRegistros: confirmados.length,
      registrosSimples: confirmados.filter(g => g.modo === "simples").length,
      registrosDetalhados: confirmados.filter(g => g.modo === "detalhado").length,
    };
  };

  const calcularPorBookmaker = (data: GiroGratisComBookmaker[]): GirosGratisPorBookmaker[] => {
    const confirmados = data.filter(g => g.status === "confirmado");
    const grouped = confirmados.reduce((acc, g) => {
      if (!acc[g.bookmaker_id]) {
        acc[g.bookmaker_id] = {
          bookmaker_id: g.bookmaker_id,
          bookmaker_nome: g.bookmaker_nome,
          logo_url: g.bookmaker_logo_url,
          parceiro_nome: g.parceiro_nome,
          total_retorno: 0,
          total_giros: 0,
          total_registros: 0,
          media_retorno: 0,
        };
      }
      acc[g.bookmaker_id].total_retorno += Number(g.valor_retorno);
      acc[g.bookmaker_id].total_giros += g.quantidade_giros || 0;
      acc[g.bookmaker_id].total_registros += 1;
      return acc;
    }, {} as Record<string, GirosGratisPorBookmaker>);

    return Object.values(grouped)
      .map(b => ({
        ...b,
        media_retorno: b.total_registros > 0 ? b.total_retorno / b.total_registros : 0,
      }))
      .sort((a, b) => b.total_retorno - a.total_retorno);
  };

  const calcularChartData = (data: GiroGratisComBookmaker[]): GirosGratisChartData[] => {
    const confirmados = data
      .filter(g => g.status === "confirmado")
      .sort((a, b) => new Date(a.data_registro).getTime() - new Date(b.data_registro).getTime());

    const dailyData: Record<string, number> = {};
    
    confirmados.forEach(g => {
      const date = new Date(g.data_registro).toISOString().split('T')[0];
      dailyData[date] = (dailyData[date] || 0) + Number(g.valor_retorno);
    });

    let acumulado = 0;
    return Object.entries(dailyData).map(([date, valor]) => {
      acumulado += valor;
      return { date, valor, acumulado };
    });
  };

  const createGiro = async (formData: GiroGratisFormData): Promise<boolean> => {
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
        modo: formData.modo,
        data_registro: formData.data_registro.toISOString(),
        valor_retorno: formData.valor_retorno,
        observacoes: formData.observacoes || null,
      };

      if (formData.modo === "detalhado") {
        insertData.quantidade_giros = formData.quantidade_giros;
        insertData.valor_por_giro = formData.valor_por_giro;
      }

      const { error } = await supabase.from("giros_gratis" as any).insert(insertData);

      if (error) throw error;

      toast.success("Giro grátis registrado com sucesso!");
      await fetchGiros();
      return true;
    } catch (err) {
      console.error("Erro ao criar giro grátis:", err);
      toast.error("Erro ao registrar giro grátis");
      return false;
    }
  };

  const updateGiro = async (id: string, formData: Partial<GiroGratisFormData>): Promise<boolean> => {
    try {
      const updateData: any = {};

      if (formData.bookmaker_id !== undefined) updateData.bookmaker_id = formData.bookmaker_id;
      if (formData.modo !== undefined) updateData.modo = formData.modo;
      if (formData.data_registro !== undefined) updateData.data_registro = formData.data_registro.toISOString();
      if (formData.valor_retorno !== undefined) updateData.valor_retorno = formData.valor_retorno;
      if (formData.observacoes !== undefined) updateData.observacoes = formData.observacoes;

      if (formData.modo === "detalhado") {
        updateData.quantidade_giros = formData.quantidade_giros;
        updateData.valor_por_giro = formData.valor_por_giro;
      } else if (formData.modo === "simples") {
        updateData.quantidade_giros = null;
        updateData.valor_por_giro = null;
      }

      const { error } = await supabase
        .from("giros_gratis" as any)
        .update(updateData)
        .eq("id", id);

      if (error) throw error;

      toast.success("Giro grátis atualizado!");
      await fetchGiros();
      return true;
    } catch (err) {
      console.error("Erro ao atualizar giro grátis:", err);
      toast.error("Erro ao atualizar");
      return false;
    }
  };

  const deleteGiro = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("giros_gratis" as any)
        .update({ status: "cancelado" })
        .eq("id", id);

      if (error) throw error;

      toast.success("Registro removido");
      await fetchGiros();
      return true;
    } catch (err) {
      console.error("Erro ao remover giro grátis:", err);
      toast.error("Erro ao remover");
      return false;
    }
  };

  useEffect(() => {
    fetchGiros();
  }, [fetchGiros]);

  return {
    giros,
    loading,
    error,
    metrics,
    porBookmaker,
    chartData,
    refresh: fetchGiros,
    createGiro,
    updateGiro,
    deleteGiro,
  };
}
