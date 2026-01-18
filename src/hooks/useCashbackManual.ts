import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { 
  registrarCashbackViaLedger, 
  estornarCashbackViaLedger 
} from "@/lib/ledgerService";
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

  // Métricas calculadas (usando valor_brl_referencia para consistência entre moedas)
  const metrics: CashbackManualMetrics = useMemo(() => {
    // Usar valor_brl_referencia quando disponível, senão usar valor original
    const totalRecebido = registros.reduce((acc, r) => {
      const valorBRL = r.valor_brl_referencia ?? Number(r.valor);
      return acc + valorBRL;
    }, 0);
    const totalLancamentos = registros.length;
    const mediaPorLancamento = totalLancamentos > 0 ? totalRecebido / totalLancamentos : 0;

    return {
      totalRecebido,
      totalLancamentos,
      mediaPorLancamento,
    };
  }, [registros]);

  // Dados por bookmaker (agrupado por catálogo, com breakdown por parceiro)
  const porBookmaker: CashbackManualPorBookmaker[] = useMemo(() => {
    // Primeiro, agrupar por catálogo da casa
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
      // Key é o catálogo ou o nome da casa se não tiver catálogo
      const catalogoId = registro.bookmaker?.bookmaker_catalogo_id || registro.bookmaker_id;
      const key = catalogoId || registro.bookmaker?.nome || "Casa";
      
      const parceiroId = registro.bookmaker?.parceiro_id || null;
      const parceiroNome = registro.bookmaker?.parceiro?.nome || null;
      const parceiroKey = parceiroId || "sem_parceiro";
      
      const existing = catalogoMap.get(key);

      if (existing) {
        existing.totalRecebido += Number(registro.valor);
        existing.totalLancamentos += 1;
        
        // Atualizar breakdown do parceiro
        const parceiroExisting = existing.parceirosMap.get(parceiroKey);
        if (parceiroExisting) {
          parceiroExisting.totalRecebido += Number(registro.valor);
          parceiroExisting.totalLancamentos += 1;
        } else {
          existing.parceirosMap.set(parceiroKey, {
            parceiro_id: parceiroId,
            parceiro_nome: parceiroNome,
            totalRecebido: Number(registro.valor),
            totalLancamentos: 1,
          });
        }
      } else {
        const parceirosMap = new Map();
        parceirosMap.set(parceiroKey, {
          parceiro_id: parceiroId,
          parceiro_nome: parceiroNome,
          totalRecebido: Number(registro.valor),
          totalLancamentos: 1,
        });
        
        catalogoMap.set(key, {
          bookmaker_catalogo_id: registro.bookmaker?.bookmaker_catalogo_id || null,
          bookmaker_nome: registro.bookmaker?.nome || "Casa",
          bookmaker_moeda: registro.bookmaker?.moeda || "BRL",
          logo_url: registro.bookmaker?.bookmakers_catalogo?.logo_url || null,
          totalRecebido: Number(registro.valor),
          totalLancamentos: 1,
          parceirosMap,
        });
      }
    });

    // Converter para array final
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
  }, [registros]);

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
          console.warn("Aviso: Saldo da casa não foi atualizado via ledger:", ledgerResult.error);
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
  const deletarCashback = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        // 1. Buscar registro para reverter saldo
        const { data: registro, error: fetchError } = await supabase
          .from("cashback_manual")
          .select("bookmaker_id, valor")
          .eq("id", id)
          .single();

        if (fetchError) throw fetchError;

        // 2. Estornar via ledger (trigger atualiza saldo automaticamente)
        if (registro) {
          const { data: bookmaker } = await supabase
            .from("bookmakers")
            .select("moeda, workspace_id")
            .eq("id", registro.bookmaker_id)
            .single();
          
          await estornarCashbackViaLedger({
            bookmakerId: registro.bookmaker_id,
            valor: Number(registro.valor),
            moeda: bookmaker?.moeda || 'BRL',
            workspaceId: bookmaker?.workspace_id || workspaceId,
            userId: user?.id || '',
            descricao: "Estorno de cashback manual deletado",
            referenciaId: id,
          });
        }

        // 3. Deletar registro
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
    [projetoId, fetchRegistros]
  );

  return {
    registros,
    metrics,
    porBookmaker,
    loading,
    error,
    refresh: fetchAll,
    criarCashback,
    deletarCashback,
  };
}
