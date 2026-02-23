import { useCallback, useMemo } from "react";
import { PERIOD_STALE_TIME, PERIOD_GC_TIME } from "@/lib/query-cache-config";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useInvalidateProjectQueries } from "@/hooks/useInvalidateProjectQueries";
import { 
  registrarCashbackViaLedger, 
  estornarCashbackViaLedger 
} from "@/lib/ledgerService";
import { usePromotionalCurrencyConversion } from "@/hooks/usePromotionalCurrencyConversion";
import {
  CashbackManualComBookmaker,
  CashbackManualFormData,
  CashbackManualMetrics,
  CashbackManualPorBookmaker,
} from "@/types/cashback-manual";

interface UseCashbackManualOptions {
  projetoId: string;
  dataInicio?: Date | null;
  dataFim?: Date | null;
}

// Query key for cashback data
export const CASHBACK_MANUAL_QUERY_KEY = "cashback-manual";

async function fetchCashbackRegistros(
  projetoId: string,
  dataInicio?: Date | null,
  dataFim?: Date | null
): Promise<CashbackManualComBookmaker[]> {
  let query = supabase
    .from("cashback_manual")
    .select(`
      *,
      bookmaker:bookmakers(
        id, 
        nome, 
        moeda, 
        parceiro_id,
        bookmaker_catalogo_id,
        parceiro:parceiros!bookmakers_parceiro_id_fkey(id, nome),
        bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey(logo_url)
      )
    `)
    .eq("projeto_id", projetoId)
    .order("data_credito", { ascending: false });

  if (dataInicio) {
    query = query.gte("data_credito", dataInicio.toISOString().split("T")[0]);
  }
  if (dataFim) {
    query = query.lte("data_credito", dataFim.toISOString().split("T")[0]);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as CashbackManualComBookmaker[];
}

export function useCashbackManual({ projetoId, dataInicio, dataFim }: UseCashbackManualOptions) {
  const { user } = useAuth();
  const { workspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const invalidateProject = useInvalidateProjectQueries();

  // Hook centralizado para conversão de moeda
  const { 
    config: currencyConfig, 
    converterParaConsolidacao,
    loading: currencyLoading 
  } = usePromotionalCurrencyConversion(projetoId);

  // Use React Query for data fetching
  const { 
    data: registros = [], 
    isLoading: loading, 
    error,
    refetch 
  } = useQuery({
    queryKey: [CASHBACK_MANUAL_QUERY_KEY, projetoId, dataInicio?.toISOString(), dataFim?.toISOString()],
    queryFn: () => fetchCashbackRegistros(projetoId, dataInicio, dataFim),
    enabled: !!projetoId,
    staleTime: PERIOD_STALE_TIME,
    gcTime: PERIOD_GC_TIME,
  });

  /**
   * MÉTRICAS COM CONVERSÃO PARA MOEDA DE CONSOLIDAÇÃO
   */
  const metrics: CashbackManualMetrics = useMemo(() => {
    // Agregação por moeda original
    const porMoedaMap = new Map<string, number>();
    
    const totalRecebido = registros.reduce((acc, r) => {
      const moedaOrigem = r.moeda_operacao || r.bookmaker?.moeda || "BRL";
      const valorOriginal = Number(r.valor);
      const valorConvertido = converterParaConsolidacao(valorOriginal, moedaOrigem);
      
      // Acumula na moeda original
      porMoedaMap.set(moedaOrigem, (porMoedaMap.get(moedaOrigem) || 0) + valorOriginal);
      
      return acc + valorConvertido;
    }, 0);
    
    const totalLancamentos = registros.length;
    const mediaPorLancamento = totalLancamentos > 0 ? totalRecebido / totalLancamentos : 0;

    // Converte Map para array de breakdown
    const recebidoPorMoeda = Array.from(porMoedaMap.entries())
      .map(([moeda, valor]) => ({ moeda, valor }))
      .filter(item => Math.abs(item.valor) > 0.01);

    return {
      totalRecebido,
      totalLancamentos,
      mediaPorLancamento,
      recebidoPorMoeda,
    };
  }, [registros, converterParaConsolidacao]);

  /**
   * DADOS POR BOOKMAKER COM CONVERSÃO
   */
  const porBookmaker: CashbackManualPorBookmaker[] = useMemo(() => {
    const catalogoMap = new Map<string, {
      bookmaker_catalogo_id: string | null;
      bookmaker_nome: string;
      bookmaker_moeda: string;
      logo_url: string | null;
      totalRecebido: number;
      totalLancamentos: number;
      parceirosMap: Map<string, { parceiro_id: string | null; parceiro_nome: string | null; totalRecebido: number; totalLancamentos: number }>;
    }>();

    registros.forEach((registro) => {
      const catalogoId = registro.bookmaker?.bookmaker_catalogo_id || registro.bookmaker_id;
      const key = catalogoId || registro.bookmaker?.nome || "Casa";
      
      const parceiroId = registro.bookmaker?.parceiro_id || null;
      const parceiroNome = registro.bookmaker?.parceiro?.nome || null;
      const parceiroKey = parceiroId || "sem_parceiro";

      const moedaOrigem = registro.moeda_operacao || registro.bookmaker?.moeda || "BRL";
      const valorConvertido = converterParaConsolidacao(Number(registro.valor), moedaOrigem);
      
      const existing = catalogoMap.get(key);

      if (existing) {
        existing.totalRecebido += valorConvertido;
        existing.totalLancamentos += 1;
        
        const parceiroExisting = existing.parceirosMap.get(parceiroKey);
        if (parceiroExisting) {
          parceiroExisting.totalRecebido += valorConvertido;
          parceiroExisting.totalLancamentos += 1;
        } else {
          existing.parceirosMap.set(parceiroKey, {
            parceiro_id: parceiroId,
            parceiro_nome: parceiroNome,
            totalRecebido: valorConvertido,
            totalLancamentos: 1,
          });
        }
      } else {
        const parceirosMap = new Map();
        parceirosMap.set(parceiroKey, {
          parceiro_id: parceiroId,
          parceiro_nome: parceiroNome,
          totalRecebido: valorConvertido,
          totalLancamentos: 1,
        });
        
        catalogoMap.set(key, {
          bookmaker_catalogo_id: registro.bookmaker?.bookmaker_catalogo_id || null,
          bookmaker_nome: registro.bookmaker?.nome || "Casa",
          bookmaker_moeda: currencyConfig.moedaConsolidacao,
          logo_url: registro.bookmaker?.bookmakers_catalogo?.logo_url || null,
          totalRecebido: valorConvertido,
          totalLancamentos: 1,
          parceirosMap,
        });
      }
    });

    return Array.from(catalogoMap.values())
      .map((item) => ({
        bookmaker_catalogo_id: item.bookmaker_catalogo_id,
        bookmaker_nome: item.bookmaker_nome,
        bookmaker_moeda: item.bookmaker_moeda,
        logo_url: item.logo_url,
        totalRecebido: item.totalRecebido,
        totalLancamentos: item.totalLancamentos,
        parceiros: Array.from(item.parceirosMap.values()).sort((a, b) => b.totalRecebido - a.totalRecebido),
      }))
      .sort((a, b) => b.totalRecebido - a.totalRecebido);
  }, [registros, converterParaConsolidacao, currencyConfig.moedaConsolidacao]);

  // Criar lançamento de cashback manual
  const criarCashback = useCallback(
    async (data: CashbackManualFormData): Promise<boolean> => {
      if (!user || !workspaceId) {
        toast.error("Usuário não autenticado");
        return false;
      }

      try {
        // 1. VALIDAÇÃO CRÍTICA: Verificar que a casa pertence ao projeto
        const { data: bookmaker, error: bookmakerError } = await supabase
          .from("bookmakers")
          .select("id, moeda, projeto_id")
          .eq("id", data.bookmaker_id)
          .single();

        if (bookmakerError) throw bookmakerError;

        if (!bookmaker || bookmaker.projeto_id !== projetoId) {
          toast.error("Esta casa não está vinculada a este projeto");
          return false;
        }

        // 2. PROTEÇÃO ANTI-DUPLICIDADE: Verificar se já existe cashback igual recente
        const dataCredito = data.data_credito || new Date().toISOString().split("T")[0];
        const { data: existingCashback, error: checkError } = await supabase
          .from("cashback_manual")
          .select("id, created_at")
          .eq("bookmaker_id", data.bookmaker_id)
          .eq("valor", data.valor)
          .eq("data_credito", dataCredito)
          .maybeSingle();

        if (checkError) {
          console.error("[criarCashback] Erro ao verificar duplicidade:", checkError);
        }

        if (existingCashback) {
          toast.error(`Já existe um cashback de mesmo valor (R$ ${data.valor}) para esta casa nesta data.`);
          console.warn("[criarCashback] Cashback duplicado bloqueado:", {
            bookmaker_id: data.bookmaker_id,
            valor: data.valor,
            data_credito: dataCredito,
            existing_id: existingCashback.id,
          });
          return false;
        }

        const moedaOperacao = bookmaker.moeda || "BRL";
        // Calcular valor_brl_referencia
        let valorBRLReferencia: number | null = null;
        let cotacaoSnapshot: number | null = null;
        
        if (moedaOperacao !== "BRL") {
          try {
            const { data: ratesData, error: ratesError } = await supabase.functions.invoke("get-exchange-rates");
            
            if (!ratesError && ratesData?.USDBRL) {
              cotacaoSnapshot = Number(ratesData.USDBRL);
              valorBRLReferencia = data.valor * cotacaoSnapshot;
            } else {
              const { data: projetoData } = await supabase
                .from("projetos")
                .select("cotacao_trabalho")
                .eq("id", projetoId)
                .single();
              
              if (projetoData?.cotacao_trabalho && projetoData.cotacao_trabalho > 0) {
                cotacaoSnapshot = Number(projetoData.cotacao_trabalho);
                valorBRLReferencia = data.valor * cotacaoSnapshot;
              }
            }
          } catch (err) {
            console.error("Erro ao buscar cotação para cashback:", err);
          }
        } else {
          valorBRLReferencia = data.valor;
          cotacaoSnapshot = 1;
        }

        // 2. Inserir registro de cashback
        const { data: novoCashback, error: insertError } = await supabase
          .from("cashback_manual")
          .insert({
            projeto_id: projetoId,
            bookmaker_id: data.bookmaker_id,
            workspace_id: workspaceId,
            user_id: user.id,
            valor: data.valor,
            data_credito: dataCredito,
            observacoes: data.observacoes || null,
            moeda_operacao: moedaOperacao,
            valor_brl_referencia: valorBRLReferencia,
            cotacao_snapshot: cotacaoSnapshot,
            cotacao_snapshot_at: new Date().toISOString(),
            tem_rollover: data.tem_rollover || false,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        // 3. Registrar via ledger
        const ledgerResult = await registrarCashbackViaLedger({
          bookmakerId: data.bookmaker_id,
          valor: data.valor,
          moeda: moedaOperacao,
          workspaceId: workspaceId,
          userId: user.id,
          descricao: `Cashback manual: ${data.observacoes || "Sem observações"}`,
          dataCredito: dataCredito,
          cotacao: cotacaoSnapshot || undefined,
          referenciaId: novoCashback.id,
        });

        if (!ledgerResult.success) {
          await supabase.from("cashback_manual").delete().eq("id", novoCashback.id);
          toast.error(`Erro ao registrar cashback: ${ledgerResult.error || "Falha no ledger financeiro"}`);
          return false;
        }

        // 4. Atualizar o registro com o ID do ledger
        if (ledgerResult.entryId) {
          await supabase
            .from("cashback_manual")
            .update({ cash_ledger_id: ledgerResult.entryId })
            .eq("id", novoCashback.id);
        }

        toast.success("Cashback lançado com sucesso! Saldo atualizado.");
        
        // INVALIDAR CACHE GLOBAL - Atualiza KPIs automaticamente
        await invalidateProject(projetoId);
        
        return true;
      } catch (err) {
        console.error("Erro ao criar cashback:", err);
        toast.error("Erro ao lançar cashback");
        return false;
      }
    },
    [projetoId, user, workspaceId, invalidateProject]
  );

  // Deletar lançamento de cashback (reverte saldo)
  const deletarCashback = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const { data: registro, error: fetchError } = await supabase
          .from("cashback_manual")
          .select("bookmaker_id, valor, projeto_id")
          .eq("id", id)
          .single();

        if (fetchError) throw fetchError;
        if (!registro) {
          toast.error("Registro de cashback não encontrado");
          return false;
        }

        const { data: bookmaker } = await supabase
          .from("bookmakers")
          .select("moeda, workspace_id, projeto_id, nome")
          .eq("id", registro.bookmaker_id)
          .single();

        if (!bookmaker) {
          await supabase.from("cashback_manual").delete().eq("id", id);
          await invalidateProject(projetoId);
          return true;
        }

        const bookmakerVinculada = bookmaker.projeto_id === registro.projeto_id;
        
        if (!bookmakerVinculada) {
          toast.warning(`Bookmaker "${bookmaker.nome}" foi desvinculada. Registro removido sem alterar saldo.`);
          await supabase.from("cashback_manual").delete().eq("id", id);
          await invalidateProject(projetoId);
          return true;
        }

        const estornoResult = await estornarCashbackViaLedger({
          bookmakerId: registro.bookmaker_id,
          valor: Number(registro.valor),
          moeda: bookmaker.moeda || 'BRL',
          workspaceId: bookmaker.workspace_id || workspaceId,
          userId: user?.id || '',
          descricao: "Estorno de cashback manual deletado",
          referenciaId: id,
        });

        if (!estornoResult.success) {
          toast.error(`Erro ao estornar: ${estornoResult.error}`);
          return false;
        }

        const { error: deleteError } = await supabase
          .from("cashback_manual")
          .delete()
          .eq("id", id);

        if (deleteError) throw deleteError;

        toast.success("Cashback removido e saldo ajustado");
        
        // INVALIDAR CACHE GLOBAL - Atualiza KPIs automaticamente
        await invalidateProject(projetoId);
        
        return true;
      } catch (err) {
        console.error("Erro ao deletar cashback:", err);
        toast.error("Erro ao remover cashback");
        return false;
      }
    },
    [projetoId, workspaceId, user, invalidateProject]
  );

  // Editar lançamento de cashback (estorna + recria via ledger)
  const editarCashback = useCallback(
    async (id: string, data: CashbackManualFormData): Promise<boolean> => {
      if (!user || !workspaceId) {
        toast.error("Usuário não autenticado");
        return false;
      }

      try {
        // 1. Buscar registro atual
        const { data: registroAtual, error: fetchError } = await supabase
          .from("cashback_manual")
          .select("bookmaker_id, valor, projeto_id, moeda_operacao, cash_ledger_id")
          .eq("id", id)
          .single();

        if (fetchError || !registroAtual) {
          toast.error("Registro de cashback não encontrado");
          return false;
        }

        // 2. Buscar dados da bookmaker atual (para estorno)
        const { data: bookmakerAtual } = await supabase
          .from("bookmakers")
          .select("moeda, workspace_id")
          .eq("id", registroAtual.bookmaker_id)
          .single();

        // 3. Estornar o cashback antigo via ledger
        if (bookmakerAtual) {
          const estornoResult = await estornarCashbackViaLedger({
            bookmakerId: registroAtual.bookmaker_id,
            valor: Number(registroAtual.valor),
            moeda: bookmakerAtual.moeda || "BRL",
            workspaceId: bookmakerAtual.workspace_id || workspaceId,
            userId: user.id,
            descricao: "Estorno de cashback manual (edição)",
            referenciaId: id,
          });

          if (!estornoResult.success) {
            toast.error(`Erro ao estornar cashback anterior: ${estornoResult.error}`);
            return false;
          }
        }

        // 4. Buscar dados da nova bookmaker
        const { data: bookmakerNova, error: bkErr } = await supabase
          .from("bookmakers")
          .select("id, moeda, projeto_id, workspace_id")
          .eq("id", data.bookmaker_id)
          .single();

        if (bkErr || !bookmakerNova) {
          toast.error("Casa não encontrada");
          return false;
        }

        const moedaOperacao = bookmakerNova.moeda || "BRL";
        const dataCredito = data.data_credito || new Date().toISOString().split("T")[0];

        // 5. Calcular cotação
        let valorBRLReferencia: number | null = null;
        let cotacaoSnapshot: number | null = null;

        if (moedaOperacao !== "BRL") {
          try {
            const { data: ratesData, error: ratesError } = await supabase.functions.invoke("get-exchange-rates");
            if (!ratesError && ratesData?.USDBRL) {
              cotacaoSnapshot = Number(ratesData.USDBRL);
              valorBRLReferencia = data.valor * cotacaoSnapshot;
            } else {
              const { data: projetoData } = await supabase
                .from("projetos")
                .select("cotacao_trabalho")
                .eq("id", projetoId)
                .single();
              if (projetoData?.cotacao_trabalho && projetoData.cotacao_trabalho > 0) {
                cotacaoSnapshot = Number(projetoData.cotacao_trabalho);
                valorBRLReferencia = data.valor * cotacaoSnapshot;
              }
            }
          } catch (err) {
            console.error("Erro ao buscar cotação:", err);
          }
        } else {
          valorBRLReferencia = data.valor;
          cotacaoSnapshot = 1;
        }

        // 6. Atualizar registro
        const { error: updateError } = await supabase
          .from("cashback_manual")
          .update({
            bookmaker_id: data.bookmaker_id,
            valor: data.valor,
            data_credito: dataCredito,
            observacoes: data.observacoes || null,
            moeda_operacao: moedaOperacao,
            valor_brl_referencia: valorBRLReferencia,
            cotacao_snapshot: cotacaoSnapshot,
            cotacao_snapshot_at: new Date().toISOString(),
            tem_rollover: data.tem_rollover || false,
          })
          .eq("id", id);

        if (updateError) throw updateError;

        // 7. Registrar novo valor via ledger
        const ledgerResult = await registrarCashbackViaLedger({
          bookmakerId: data.bookmaker_id,
          valor: data.valor,
          moeda: moedaOperacao,
          workspaceId: workspaceId,
          userId: user.id,
          descricao: `Cashback manual (editado): ${data.observacoes || "Sem observações"}`,
          dataCredito: dataCredito,
          cotacao: cotacaoSnapshot || undefined,
          referenciaId: id,
        });

        if (!ledgerResult.success) {
          toast.error(`Erro ao registrar novo valor: ${ledgerResult.error}`);
          return false;
        }

        // 8. Atualizar ledger_id
        if (ledgerResult.entryId) {
          await supabase
            .from("cashback_manual")
            .update({ cash_ledger_id: ledgerResult.entryId })
            .eq("id", id);
        }

        toast.success("Cashback atualizado com sucesso!");
        await invalidateProject(projetoId);
        return true;
      } catch (err) {
        console.error("Erro ao editar cashback:", err);
        toast.error("Erro ao editar cashback");
        return false;
      }
    },
    [projetoId, workspaceId, user, invalidateProject]
  );

  // Wrapper para refresh que pode ser usado como onClick
  const handleRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    registros,
    metrics,
    porBookmaker,
    loading: loading || currencyLoading,
    error: error ? String(error) : null,
    refresh: handleRefresh,
    criarCashback,
    editarCashback,
    deletarCashback,
    moedaConsolidacao: currencyConfig.moedaConsolidacao,
    cotacaoInfo: {
      fonte: currencyConfig.fonte,
      taxa: currencyConfig.cotacaoAtual,
      disponivel: currencyConfig.disponivel,
    },
  };
}
