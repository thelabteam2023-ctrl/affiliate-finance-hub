import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
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

export function useCashbackManual({ projetoId, dataInicio, dataFim }: UseCashbackManualOptions) {
  const { user } = useAuth();
  const { workspaceId } = useWorkspace();
  
  const [registros, setRegistros] = useState<CashbackManualComBookmaker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Hook centralizado para conversão de moeda
  const { 
    config: currencyConfig, 
    converterParaConsolidacao,
    loading: currencyLoading 
  } = usePromotionalCurrencyConversion(projetoId);

  // Fetch registros de cashback manual
  const fetchRegistros = useCallback(async () => {
    if (!projetoId) return;

    try {
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

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setRegistros((data || []) as CashbackManualComBookmaker[]);
    } catch (err) {
      console.error("Erro ao buscar cashback manual:", err);
      setError("Erro ao carregar cashback");
    }
  }, [projetoId, dataInicio, dataFim]);

  // Fetch all data
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    await fetchRegistros();
    setLoading(false);
  }, [fetchRegistros]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  /**
   * MÉTRICAS COM CONVERSÃO PARA MOEDA DE CONSOLIDAÇÃO
   * 
   * REGRA: Valores são convertidos para a moeda de consolidação do projeto
   * usando a cotação configurada (Trabalho ou PTAX).
   * Isso garante que totais sejam matematicamente corretos, mesmo com
   * casas em diferentes moedas.
   */
  const metrics: CashbackManualMetrics = useMemo(() => {
    // Converter cada valor para moeda de consolidação antes de somar
    const totalRecebido = registros.reduce((acc, r) => {
      const moedaOrigem = r.moeda_operacao || r.bookmaker?.moeda || "BRL";
      const valorOriginal = Number(r.valor);
      const valorConvertido = converterParaConsolidacao(valorOriginal, moedaOrigem);
      return acc + valorConvertido;
    }, 0);
    
    const totalLancamentos = registros.length;
    const mediaPorLancamento = totalLancamentos > 0 ? totalRecebido / totalLancamentos : 0;

    return {
      totalRecebido,
      totalLancamentos,
      mediaPorLancamento,
    };
  }, [registros, converterParaConsolidacao]);

  /**
   * DADOS POR BOOKMAKER COM CONVERSÃO
   * 
   * Agrupa por catálogo da casa e converte valores para moeda de consolidação.
   * A moeda exibida será sempre a moeda de consolidação do projeto.
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

      // CRÍTICO: Converter valor para moeda de consolidação
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
          // IMPORTANTE: A moeda agora é a de consolidação, não da casa
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

        // Bloquear se a casa não pertence ao projeto
        if (!bookmaker || bookmaker.projeto_id !== projetoId) {
          toast.error("Esta casa não está vinculada a este projeto");
          console.error("Tentativa de lançar cashback em casa não vinculada:", {
            bookmaker_id: data.bookmaker_id,
            projeto_id: projetoId,
            bookmaker_projeto_id: bookmaker?.projeto_id
          });
          return false;
        }

        const moedaOperacao = bookmaker.moeda || "BRL";
        const dataCredito = data.data_credito || new Date().toISOString().split("T")[0];

        // Calcular valor_brl_referencia para moedas não-BRL
        let valorBRLReferencia: number | null = null;
        let cotacaoSnapshot: number | null = null;
        
        if (moedaOperacao !== "BRL") {
          // Para USD/USDT, usar cotação aproximada (em produção, buscar de API de câmbio)
          // Por enquanto, tentar buscar cotação do workspace ou usar estimativa
          try {
            const { data: cotacaoData } = await supabase
              .from("cash_ledger")
              .select("cotacao")
              .eq("workspace_id", workspaceId)
              .not("cotacao", "is", null)
              .order("created_at", { ascending: false })
              .limit(1)
              .single();
            
            if (cotacaoData?.cotacao) {
              cotacaoSnapshot = Number(cotacaoData.cotacao);
              valorBRLReferencia = data.valor * cotacaoSnapshot;
            }
          } catch {
            // Se não encontrar cotação, usar estimativa conservadora (5.5 para USD)
            cotacaoSnapshot = 5.5;
            valorBRLReferencia = data.valor * cotacaoSnapshot;
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
          })
          .select()
          .single();

        if (insertError) throw insertError;

        // 3. Registrar via ledger (trigger atualiza saldo automaticamente)
        // CRÍTICO: Se falhar aqui, precisamos reverter o cashback_manual
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
          // ROLLBACK: Deletar o registro de cashback_manual já criado
          console.error("[Cashback] Falha ao registrar no ledger:", ledgerResult.error);
          await supabase
            .from("cashback_manual")
            .delete()
            .eq("id", novoCashback.id);
          
          toast.error(`Erro ao registrar cashback: ${ledgerResult.error || "Falha no ledger financeiro"}`);
          return false;
        }

        // 4. Atualizar o registro de cashback_manual com o ID do ledger
        if (ledgerResult.entryId) {
          await supabase
            .from("cashback_manual")
            .update({ cash_ledger_id: ledgerResult.entryId })
            .eq("id", novoCashback.id);
        }

        toast.success("Cashback lançado com sucesso! Saldo atualizado.");
        await fetchRegistros();
        return true;
      } catch (err) {
        console.error("Erro ao criar cashback:", err);
        toast.error("Erro ao lançar cashback");
        return false;
      }
    },
    [projetoId, user, workspaceId, fetchRegistros]
  );

  // Deletar lançamento de cashback (reverte saldo)
  // PROTEÇÃO: Valida vínculo projeto-bookmaker antes de estornar
  const deletarCashback = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        // 1. Buscar registro completo para validações
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

        // 2. Buscar bookmaker e verificar vínculo com projeto
        const { data: bookmaker } = await supabase
          .from("bookmakers")
          .select("moeda, workspace_id, projeto_id, nome")
          .eq("id", registro.bookmaker_id)
          .single();

        if (!bookmaker) {
          toast.error("Bookmaker não encontrada. Registro será removido sem estorno.");
          // Apenas remove o registro, sem estorno (bookmaker deletada)
          await supabase.from("cashback_manual").delete().eq("id", id);
          await fetchRegistros();
          return true;
        }

        // 3. PROTEÇÃO: Verificar se bookmaker ainda está vinculada ao projeto do cashback
        const bookmakerVinculada = bookmaker.projeto_id === registro.projeto_id;
        
        if (!bookmakerVinculada) {
          // Bookmaker foi desvinculada - NÃO estornar (evita alteração misteriosa de saldo)
          console.warn(`[deletarCashback] Bookmaker ${bookmaker.nome} desvinculada do projeto. Removendo registro SEM estorno.`);
          toast.warning(`Bookmaker "${bookmaker.nome}" foi desvinculada. Registro removido sem alterar saldo.`);
          
          await supabase.from("cashback_manual").delete().eq("id", id);
          await fetchRegistros();
          return true;
        }

        // 4. Bookmaker vinculada - Estornar via ledger (trigger atualiza saldo automaticamente)
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
          console.error("[deletarCashback] Falha no estorno:", estornoResult.error);
          toast.error(`Erro ao estornar: ${estornoResult.error}`);
          return false;
        }

        // 5. Deletar registro após estorno bem-sucedido
        const { error: deleteError } = await supabase
          .from("cashback_manual")
          .delete()
          .eq("id", id);

        if (deleteError) throw deleteError;

        toast.success("Cashback removido e saldo ajustado");
        await fetchRegistros();
        return true;
      } catch (err) {
        console.error("Erro ao deletar cashback:", err);
        toast.error("Erro ao remover cashback");
        return false;
      }
    },
    [projetoId, workspaceId, user, fetchRegistros]
  );

  return {
    registros,
    metrics,
    porBookmaker,
    loading: loading || currencyLoading,
    error,
    refresh: fetchAll,
    criarCashback,
    deletarCashback,
    // Expor configuração de moeda para componentes que precisam
    moedaConsolidacao: currencyConfig.moedaConsolidacao,
    cotacaoInfo: {
      fonte: currencyConfig.fonte,
      taxa: currencyConfig.cotacaoAtual,
      disponivel: currencyConfig.disponivel,
    },
  };
}
