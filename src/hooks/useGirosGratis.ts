import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { PROJETO_RESULTADO_QUERY_KEY } from "./useProjetoResultado";
import { estornarGiroGratisViaLedger } from "@/lib/ledgerService";
import { useWorkspace } from "@/hooks/useWorkspace";
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

// Extended type to include moeda from bookmaker
interface GiroGratisComMoeda extends GiroGratisComBookmaker {
  bookmaker_moeda?: string;
}

/**
 * Hook refatorado para Giros Grátis
 * 
 * CORREÇÃO CRÍTICA:
 * - Busca a moeda de consolidação do projeto diretamente
 * - NÃO aplica conversão quando moeda origem = moeda destino
 * - Elimina race condition do hook anterior
 */
export function useGirosGratis({ projetoId, dataInicio, dataFim }: UseGirosGratisOptions) {
  const queryClient = useQueryClient();
  const [giros, setGiros] = useState<GiroGratisComMoeda[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [moedaConsolidacao, setMoedaConsolidacao] = useState<string>("BRL");
  const [cotacaoTrabalho, setCotacaoTrabalho] = useState<number | null>(null);
  const { workspaceId } = useWorkspace();

  // Invalidar grupo FINANCIAL_STATE completo após mutação
  const invalidateProjectKPIs = useCallback(() => {
    // KPIs
    queryClient.invalidateQueries({ queryKey: [PROJETO_RESULTADO_QUERY_KEY, projetoId] });
    queryClient.invalidateQueries({ queryKey: ["projeto-breakdowns", projetoId] });
    
    // Saldos
    queryClient.invalidateQueries({ queryKey: ["bookmaker-saldos", projetoId] });
    queryClient.invalidateQueries({ queryKey: ["bookmaker-saldos"] });
    queryClient.invalidateQueries({ queryKey: ["saldo-operavel-rpc", projetoId] });
    
    // Vínculos (giros afetam saldos que aparecem na aba vínculos)
    queryClient.invalidateQueries({ queryKey: ["projeto-vinculos", projetoId] });
    
    // Exposição
    queryClient.invalidateQueries({ queryKey: ["exposicao-projeto", projetoId] });
    
    // Parceiros
    queryClient.invalidateQueries({ queryKey: ["parceiro-financeiro"] });
    queryClient.invalidateQueries({ queryKey: ["parceiro-consolidado"] });
    
    console.log(`[useGirosGratis] Invalidated FINANCIAL_STATE for project ${projetoId}`);
  }, [queryClient, projetoId]);

  // Buscar configuração de moeda do projeto PRIMEIRO
  useEffect(() => {
    if (!projetoId) return;

    const fetchProjectConfig = async () => {
      try {
        const { data, error } = await supabase
          .from("projetos")
          .select("moeda_consolidacao, cotacao_trabalho")
          .eq("id", projetoId)
          .single();

        if (error) throw error;
        
        // CRÍTICO: Garantir que moeda seja lida corretamente
        const moeda = data?.moeda_consolidacao || "BRL";
        console.log("[useGirosGratis] Config do projeto:", { moeda, cotacao: data?.cotacao_trabalho });
        
        setMoedaConsolidacao(moeda);
        setCotacaoTrabalho(data?.cotacao_trabalho || null);
      } catch (err) {
        console.error("[useGirosGratis] Erro ao buscar config:", err);
      }
    };

    fetchProjectConfig();
  }, [projetoId]);

  /**
   * Função de conversão SIMPLIFICADA e SEM RACE CONDITION
   * Recebe moeda de consolidação como parâmetro para evitar closure stale
   */
  const converterValor = useCallback((
    valor: number, 
    moedaOrigem: string, 
    moedaDestino: string,
    cotacao: number | null
  ): number => {
    if (!valor || valor === 0) return 0;

    // Normalizar stablecoins como USD
    const normalizar = (m: string) => ["USD", "USDT", "USDC"].includes(m) ? "USD" : m;
    const origemNorm = normalizar(moedaOrigem);
    const destinoNorm = normalizar(moedaDestino);

    // SEM CONVERSÃO se moedas são iguais
    if (origemNorm === destinoNorm) {
      return valor;
    }

    // Precisa de cotação para converter
    if (!cotacao || cotacao <= 0) {
      console.warn(`[useGirosGratis] Cotação indisponível para ${moedaOrigem} -> ${moedaDestino}`);
      return valor;
    }

    // USD -> BRL
    if (origemNorm === "USD" && destinoNorm === "BRL") {
      return valor * cotacao;
    }

    // BRL -> USD
    if (origemNorm === "BRL" && destinoNorm === "USD") {
      return valor / cotacao;
    }

    return valor;
  }, []);

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
            moeda,
            parceiro_id,
            bookmaker_catalogo_id,
            bookmakers_catalogo (
              logo_url,
              nome
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

      const girosFormatados: GiroGratisComMoeda[] = (data || []).map((g: any) => ({
        ...g,
        bookmaker_nome: g.bookmakers?.nome || "Desconhecido",
        bookmaker_catalogo_nome: g.bookmakers?.bookmakers_catalogo?.nome || g.bookmakers?.nome || "Desconhecido",
        bookmaker_logo_url: g.bookmakers?.bookmakers_catalogo?.logo_url || null,
        parceiro_nome: g.bookmakers?.parceiros?.nome || null,
        bookmaker_moeda: g.bookmakers?.moeda || "BRL",
      }));

      console.log("[useGirosGratis] Giros carregados:", girosFormatados.map(g => ({
        id: g.id,
        valor: g.valor_retorno,
        moeda: g.bookmaker_moeda,
      })));

      setGiros(girosFormatados);
    } catch (err) {
      console.error("Erro ao buscar giros grátis:", err);
      setError("Erro ao carregar dados");
      toast.error("Erro ao carregar giros grátis");
    } finally {
      setLoading(false);
    }
  }, [projetoId, dataInicio, dataFim]);

  // Calcular métricas como MEMOIZAÇÃO para evitar recálculos desnecessários
  // e garantir que usamos o valor mais recente de moedaConsolidacao
  const metrics = useMemo((): GirosGratisMetrics => {
    const confirmados = giros.filter(g => g.status === "confirmado");
    
    console.log("[useGirosGratis] Calculando métricas:", {
      total: confirmados.length,
      moedaConsolidacao,
      cotacaoTrabalho,
    });

    // Agrupar valores por moeda original (sem conversão)
    const porMoeda: Record<string, number> = {};
    
    // CRÍTICO: Usar moedaConsolidacao e cotacaoTrabalho atuais
    const totalRetorno = confirmados.reduce((sum, g) => {
      const moedaOrigem = g.bookmaker_moeda || "BRL";
      const valorOriginal = Number(g.valor_retorno);
      
      // Acumular por moeda original
      porMoeda[moedaOrigem] = (porMoeda[moedaOrigem] || 0) + valorOriginal;
      
      const valorConvertido = converterValor(
        valorOriginal, 
        moedaOrigem, 
        moedaConsolidacao,
        cotacaoTrabalho
      );
      
      console.log(`[useGirosGratis] Conversão: ${g.valor_retorno} ${moedaOrigem} -> ${valorConvertido} ${moedaConsolidacao}`);
      
      return sum + valorConvertido;
    }, 0);
    
    const totalGiros = confirmados
      .filter(g => g.modo === "detalhado")
      .reduce((sum, g) => sum + (g.quantidade_giros || 0), 0);
    
    // Converter para array de RetornoPorMoeda
    const retornoPorMoeda = Object.entries(porMoeda).map(([moeda, valor]) => ({
      moeda,
      valor,
    }));
    
    return {
      totalRetorno,
      totalGiros,
      mediaRetornoPorGiro: totalGiros > 0 ? totalRetorno / totalGiros : 0,
      totalRegistros: confirmados.length,
      registrosSimples: confirmados.filter(g => g.modo === "simples").length,
      registrosDetalhados: confirmados.filter(g => g.modo === "detalhado").length,
      retornoPorMoeda,
    };
  }, [giros, moedaConsolidacao, cotacaoTrabalho, converterValor]);

  const porBookmaker = useMemo((): GirosGratisPorBookmaker[] => {
    const confirmados = giros.filter(g => g.status === "confirmado");
    
    // Agrupar por nome do catálogo (consolidado por casa, não por usuário)
    const grouped = confirmados.reduce((acc, g) => {
      const catalogoNome = (g as any).bookmaker_catalogo_nome || g.bookmaker_nome;
      
      if (!acc[catalogoNome]) {
        acc[catalogoNome] = {
          bookmaker_id: catalogoNome, // Usar nome como chave
          bookmaker_nome: catalogoNome,
          logo_url: g.bookmaker_logo_url,
          parceiro_nome: null, // Não mostrar parceiro na visão consolidada
          total_retorno: 0,
          total_giros: 0,
          total_registros: 0,
          media_retorno: 0,
        };
      }
      
      const moedaOrigem = g.bookmaker_moeda || "BRL";
      const valorConvertido = converterValor(
        Number(g.valor_retorno), 
        moedaOrigem, 
        moedaConsolidacao,
        cotacaoTrabalho
      );
      
      acc[catalogoNome].total_retorno += valorConvertido;
      acc[catalogoNome].total_giros += g.quantidade_giros || 0;
      acc[catalogoNome].total_registros += 1;
      return acc;
    }, {} as Record<string, GirosGratisPorBookmaker>);

    return Object.values(grouped)
      .map(b => ({
        ...b,
        media_retorno: b.total_registros > 0 ? b.total_retorno / b.total_registros : 0,
      }))
      .sort((a, b) => b.total_retorno - a.total_retorno);
  }, [giros, moedaConsolidacao, cotacaoTrabalho, converterValor]);

  const chartData = useMemo((): GirosGratisChartData[] => {
    const confirmados = giros
      .filter(g => g.status === "confirmado")
      .sort((a, b) => new Date(a.data_registro).getTime() - new Date(b.data_registro).getTime());

    const dailyData: Record<string, number> = {};
    
    confirmados.forEach(g => {
      const date = new Date(g.data_registro).toISOString().split('T')[0];
      const moedaOrigem = g.bookmaker_moeda || "BRL";
      const valorConvertido = converterValor(
        Number(g.valor_retorno), 
        moedaOrigem, 
        moedaConsolidacao,
        cotacaoTrabalho
      );
      dailyData[date] = (dailyData[date] || 0) + valorConvertido;
    });

    let acumulado = 0;
    return Object.entries(dailyData).map(([date, valor]) => {
      acumulado += valor;
      return { date, valor, acumulado };
    });
  }, [giros, moedaConsolidacao, cotacaoTrabalho, converterValor]);

  const createGiro = async (formData: GiroGratisFormData): Promise<string | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      if (!workspaceId) throw new Error("Workspace não definido nesta aba");

      const insertData: any = {
        projeto_id: projetoId,
        bookmaker_id: formData.bookmaker_id,
        workspace_id: workspaceId,
        user_id: user.id,
        modo: formData.modo,
        data_registro: formData.data_registro.toISOString(),
        valor_retorno: formData.valor_retorno,
        status: "confirmado", // Trigger gera lançamento financeiro automaticamente
        observacoes: formData.observacoes || null,
        giro_disponivel_id: formData.giro_disponivel_id || null,
      };

      if (formData.modo === "detalhado") {
        insertData.quantidade_giros = formData.quantidade_giros;
        insertData.valor_por_giro = formData.valor_por_giro;
        insertData.valor_total_giros = (formData.quantidade_giros || 0) * (formData.valor_por_giro || 0);
      }

      const { data, error } = await supabase
        .from("giros_gratis")
        .insert(insertData)
        .select("id")
        .single();

      if (error) throw error;

      toast.success("Giro grátis registrado! Saldo da casa atualizado.");
      await fetchGiros();
      invalidateProjectKPIs(); // Atualiza KPIs globais automaticamente
      return (data as any)?.id || null;
    } catch (err) {
      console.error("Erro ao criar giro grátis:", err);
      toast.error("Erro ao registrar giro grátis");
      return null;
    }
  };

  const updateGiro = async (id: string, formData: Partial<GiroGratisFormData>): Promise<boolean> => {
    try {
      // 1. Buscar o giro atual para calcular delta
      const giroAtual = giros.find(g => g.id === id);
      if (!giroAtual) {
        throw new Error("Giro não encontrado");
      }

      const valorAntigo = Number(giroAtual.valor_retorno);
      const valorNovo = formData.valor_retorno !== undefined ? Number(formData.valor_retorno) : valorAntigo;
      const delta = valorNovo - valorAntigo;

      // 2. Se o valor mudou, criar ajuste no ledger
      if (delta !== 0) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Usuário não autenticado");

        const moeda = giroAtual.bookmaker_moeda || "BRL";
        const isAumento = delta > 0;

        // Inserir ajuste no ledger
        // ARQUITETURA: Giros Grátis são eventos operacionais internos
        // NÃO impactam o Caixa Operacional (dinheiro real)
        // São movimentos dentro da bookmaker (promocionais)
        // CRÍTICO: valor_destino/valor_origem DEVE ser preenchido para reconstrução de saldo
        const valorAbs = Math.abs(delta);
        const ledgerData = {
          tipo_transacao: isAumento ? "GIRO_GRATIS" : "GIRO_GRATIS_ESTORNO",
          valor: valorAbs,
          moeda,
          workspace_id: giroAtual.workspace_id,
          user_id: user.id,
          descricao: `Ajuste de giro grátis: ${giroAtual.bookmaker_nome} (${isAumento ? "+" : "-"}${valorAbs.toFixed(2)})`,
          status: "CONFIRMADO",
          impacta_caixa_operacional: false, // Evento promocional - não impacta caixa real
          tipo_moeda: "FIAT",
          // Integridade ledger: preencher valor_destino/valor_origem
          ...(isAumento 
            ? { destino_bookmaker_id: giroAtual.bookmaker_id, valor_destino: valorAbs }
            : { origem_bookmaker_id: giroAtual.bookmaker_id, valor_origem: valorAbs }
          ),
        };

        const { error: ledgerError } = await supabase
          .from("cash_ledger")
          .insert(ledgerData);

        if (ledgerError) {
          console.error("[updateGiro] Erro ao inserir ajuste no ledger:", ledgerError);
          throw new Error("Erro ao ajustar saldo no ledger");
        }

        console.log(`[updateGiro] Ajuste de ${delta} aplicado para ${giroAtual.bookmaker_nome}`);
      }

      // 3. Atualizar o registro
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

      toast.success(delta !== 0 ? "Giro grátis atualizado e saldo ajustado!" : "Giro grátis atualizado!");
      await fetchGiros();
      invalidateProjectKPIs();
      return true;
    } catch (err) {
      console.error("Erro ao atualizar giro grátis:", err);
      toast.error("Erro ao atualizar");
      return false;
    }
  };

  const deleteGiro = async (id: string): Promise<boolean> => {
    try {
      // 1. Buscar dados do giro para estorno
      const giroToDelete = giros.find(g => g.id === id);
      if (!giroToDelete) {
        throw new Error("Giro não encontrado");
      }

      // 2. Buscar dados necessários para o estorno
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // 3. Criar estorno no ledger (débito para reverter o crédito original)
      const moeda = giroToDelete.bookmaker_moeda || "BRL";
      const estornoResult = await estornarGiroGratisViaLedger({
        bookmakerId: giroToDelete.bookmaker_id,
        valor: Number(giroToDelete.valor_retorno),
        moeda,
        workspaceId: giroToDelete.workspace_id,
        userId: user.id,
        descricao: `Estorno de giro grátis: ${giroToDelete.bookmaker_nome}`,
        giroGratisId: id,
      });

      if (!estornoResult.success) {
        throw new Error(estornoResult.error || "Erro ao estornar no ledger");
      }

      // 4. Marcar como cancelado
      const { error } = await supabase
        .from("giros_gratis" as any)
        .update({ 
          status: "cancelado",
          cash_ledger_id: estornoResult.entryId, // Referência ao estorno
        })
        .eq("id", id);

      if (error) throw error;

      toast.success("Giro grátis removido e saldo revertido!");
      await fetchGiros();
      invalidateProjectKPIs();
      return true;
    } catch (err) {
      console.error("Erro ao remover giro grátis:", err);
      toast.error("Erro ao remover giro grátis");
      return false;
    }
  };

  const confirmarGiro = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("giros_gratis" as any)
        .update({ status: "confirmado" })
        .eq("id", id);

      if (error) throw error;

      toast.success("Giro confirmado! Saldo da casa atualizado.");
      await fetchGiros();
      invalidateProjectKPIs();
      return true;
    } catch (err) {
      console.error("Erro ao confirmar giro grátis:", err);
      toast.error("Erro ao confirmar giro");
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
    confirmarGiro,
    moedaConsolidacao,
    cotacaoInfo: {
      fonte: cotacaoTrabalho ? "TRABALHO" : "INDISPONIVEL",
      taxa: cotacaoTrabalho || 0,
      disponivel: !!cotacaoTrabalho,
    },
  };
}
