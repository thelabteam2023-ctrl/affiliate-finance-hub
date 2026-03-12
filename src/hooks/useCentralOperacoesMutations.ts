/**
 * Mutation handlers for CentralOperacoes page.
 * Extracted to reduce the main component from 2100+ lines.
 */

import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getTodayCivilDate } from "@/utils/dateUtils";
import { getFirstLastName } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useCentralOperacoesCache } from "@/hooks/useCentralOperacoesCache";
import type {
  Alerta,
  EntregaPendente,
  PagamentoParceiroPendente,
  PagamentoFornecedorPendente,
  PagamentoOperadorPendente,
  ParceriaAlertaEncerramento,
  SaquePendenteConfirmacao,
  BookmakerDesvinculado,
  ParticipacaoPendente,
} from "@/hooks/useCentralOperacoesData";

export interface DispensaState {
  open: boolean;
  parceriaId: string | null;
  parceiroNome: string;
  motivo: string;
  loading: boolean;
  comissaoJaPaga: boolean;
  valorComissao: number;
  estornar: boolean;
  indicadorNome: string;
}

export interface PerdaLimitadaState {
  open: boolean;
  bookmakerId: string;
  bookmakerNome: string;
  moeda: string;
  saldoAtual: number;
}

export function useCentralOperacoesMutations(fetchData: (isRefresh?: boolean) => void) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { optimisticUpdate, removeFromList, fullRefetch } = useCentralOperacoesCache();

  const handleSaqueAction = useCallback((alerta: Alerta) => {
    const moedaAlerta = alerta.moeda || "BRL";
    const isCrypto = ["USDT", "USDC", "BTC", "ETH", "BNB", "TRX", "SOL", "MATIC", "ADA", "DOT", "AVAX", "LINK", "UNI", "LTC", "XRP"].includes(moedaAlerta);
    navigate("/caixa", {
      state: {
        openDialog: true,
        bookmakerId: alerta.entidade_id,
        bookmakerNome: alerta.titulo,
        parceiroId: alerta.parceiro_id,
        parceiroNome: alerta.parceiro_nome,
        tipoMoeda: isCrypto ? "CRYPTO" : "FIAT",
        moeda: isCrypto ? undefined : moedaAlerta,
        coin: isCrypto ? moedaAlerta : undefined,
      }
    });
  }, [navigate]);

  const handleCancelarLiberacao = useCallback(async (alerta: Alerta) => {
    try {
      const statusRestaurado = alerta.status_anterior || "ativo";
      const { error } = await supabase
        .from("bookmakers")
        .update({
          aguardando_saque_at: null,
          status: statusRestaurado,
          status_pre_bloqueio: null,
        })
        .eq("id", alerta.entidade_id);
      if (error) throw error;
      toast.success(`"${alerta.titulo}" devolvida para Contas Disponíveis`, {
        description: "Você pode vincular a um projeto ou tomar outra decisão.",
      });
      // Optimistic: remove alert from list
      removeFromList('alertas', 'entidade_id', alerta.entidade_id);
    } catch (err) {
      console.error("Erro ao cancelar liberação:", err);
      toast.error("Erro ao cancelar liberação");
    }
  }, [removeFromList]);

  const handleMarcarParaSaque = useCallback(async (casa: BookmakerDesvinculado) => {
    try {
      const { error } = await supabase.rpc('marcar_para_saque', { p_bookmaker_id: casa.id });
      if (error) throw error;
      toast.success(`"${casa.nome}" marcada para saque`);
      // Optimistic: remove from casasDesvinculadas
      removeFromList('casasDesvinculadas', 'id', casa.id);
    } catch (err) {
      console.error("Erro ao marcar para saque:", err);
      toast.error("Erro ao marcar para saque");
    }
  }, [removeFromList]);

  const handleDisponibilizarCasa = useCallback(async (casa: BookmakerDesvinculado) => {
    try {
      const { error } = await supabase.rpc('confirmar_saque_concluido', { p_bookmaker_id: casa.id });
      if (error) throw error;
      toast.success(`"${casa.nome}" disponibilizada para novos projetos`);
      // Optimistic: remove from casasDesvinculadas
      removeFromList('casasDesvinculadas', 'id', casa.id);
    } catch (err) {
      console.error("Erro ao disponibilizar casa:", err);
      toast.error("Erro ao disponibilizar casa");
    }
  }, [removeFromList]);

  const handleAcknowledgeCasaDesvinculada = useCallback(async (casa: BookmakerDesvinculado) => {
    try {
      const { error } = await supabase
        .from("bookmaker_unlinked_acks")
        .insert({
          bookmaker_id: casa.id,
          workspace_id: casa.workspace_id,
          acknowledged_by: user?.id,
          reason: "Usuário reconheceu a pendência",
        });
      if (error) throw error;
      toast.success(`Alerta de "${casa.nome}" removido`);
      // Optimistic: remove from casasDesvinculadas
      removeFromList('casasDesvinculadas', 'id', casa.id);
    } catch (err) {
      console.error("Erro ao registrar acknowledge:", err);
      toast.error("Erro ao confirmar ciência");
    }
  }, [removeFromList, user?.id]);

  const handleSolicitarSaqueCasaDesvinculada = useCallback((casa: BookmakerDesvinculado) => {
    navigate("/caixa", { state: { openDialog: true, bookmakerId: casa.id, bookmakerNome: casa.nome } });
  }, [navigate]);

  const handleEncerrarParceria = useCallback(async (
    parceriaToEncerrar: ParceriaAlertaEncerramento,
    setParceriasEncerramento: React.Dispatch<React.SetStateAction<ParceriaAlertaEncerramento[]>>,
    setEncerrarLoading: (v: boolean) => void,
    setEncerrarDialogOpen: (v: boolean) => void,
    setParceriaToEncerrar: (v: ParceriaAlertaEncerramento | null) => void,
  ) => {
    try {
      setEncerrarLoading(true);
      const hoje = new Date();
      const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
      const { error } = await supabase
        .from("parcerias")
        .update({ status: "ENCERRADA", data_fim_real: hojeStr })
        .eq("id", parceriaToEncerrar.id);
      if (error) throw error;
      toast.success(`Parceria com ${parceriaToEncerrar.parceiroNome} encerrada com sucesso`);
      setParceriasEncerramento(prev => prev.filter(p => p.id !== parceriaToEncerrar.id));
    } catch (error: any) {
      toast.error("Erro ao encerrar parceria: " + error.message);
    } finally {
      setEncerrarLoading(false);
      setEncerrarDialogOpen(false);
      setParceriaToEncerrar(null);
    }
  }, []);

  const handleDispensarPagamento = useCallback(async (
    dispensaState: DispensaState,
    pagamentosParceiros: PagamentoParceiroPendente[],
    resetDispensa: () => void,
  ) => {
    if (!dispensaState.parceriaId || !dispensaState.motivo.trim()) return;
    try {
      const pagData = pagamentosParceiros.find(p => p.parceriaId === dispensaState.parceriaId);

      const { data: parceria } = await supabase
        .from("parcerias")
        .select("valor_comissao_indicador, comissao_paga, indicacao_id, parceiro_id, workspace_id")
        .eq("id", dispensaState.parceriaId)
        .single();

      const { error } = await supabase
        .from("parcerias")
        .update({
          pagamento_dispensado: true,
          dispensa_motivo: dispensaState.motivo.trim(),
          dispensa_at: new Date().toISOString(),
          dispensa_por: user?.id,
          comissao_paga: true,
        })
        .eq("id", dispensaState.parceriaId);
      if (error) throw error;

      if (pagData && user) {
        let indicadorId: string | null = null;
        if (parceria?.indicacao_id) {
          const { data: indicacao } = await supabase
            .from("v_indicacoes_workspace")
            .select("indicador_id")
            .eq("id", parceria.indicacao_id)
            .maybeSingle();
          indicadorId = indicacao?.indicador_id || null;
        }

        const auditRecords: any[] = [
          {
            user_id: user.id,
            workspace_id: pagData.workspaceId,
            tipo: "PAGTO_PARCEIRO_DISPENSADO",
            valor: 0,
            moeda: "BRL",
            status: "CONFIRMADO",
            parceria_id: dispensaState.parceriaId,
            parceiro_id: pagData.parceiroId,
            descricao: `Pagamento dispensado: ${dispensaState.motivo.trim()}`,
            data_movimentacao: new Date().toISOString().split("T")[0],
          },
        ];

        if (dispensaState.comissaoJaPaga && dispensaState.estornar) {
          const valorEstorno = dispensaState.valorComissao;
          const { error: ledgerError } = await supabase
            .from("cash_ledger")
            .insert({
              user_id: user.id,
              workspace_id: pagData.workspaceId,
              tipo_transacao: "ESTORNO_COMISSAO_INDICADOR",
              tipo_moeda: "FIAT",
              moeda: "BRL",
              valor: valorEstorno,
              origem_tipo: "PARCEIRO",
              destino_tipo: "CAIXA_OPERACIONAL",
              data_transacao: getTodayCivilDate(),
              descricao: `Estorno comissão - parceria dispensada (${dispensaState.parceiroNome})`,
              status: "CONFIRMADO",
            });
          if (ledgerError) throw ledgerError;

          auditRecords.push({
            user_id: user.id,
            workspace_id: pagData.workspaceId,
            tipo: "ESTORNO_COMISSAO_INDICADOR",
            valor: valorEstorno,
            moeda: "BRL",
            status: "CONFIRMADO",
            parceria_id: dispensaState.parceriaId,
            parceiro_id: pagData.parceiroId,
            indicador_id: indicadorId,
            descricao: `Estorno comissão: parceria dispensada - ${dispensaState.motivo.trim()}`,
            data_movimentacao: new Date().toISOString().split("T")[0],
          });
        } else if (dispensaState.comissaoJaPaga && !dispensaState.estornar) {
          auditRecords.push({
            user_id: user.id,
            workspace_id: pagData.workspaceId,
            tipo: "COMISSAO_INDICADOR_DISPENSADA",
            valor: 0,
            moeda: "BRL",
            status: "CONFIRMADO",
            parceria_id: dispensaState.parceriaId,
            parceiro_id: pagData.parceiroId,
            indicador_id: indicadorId,
            descricao: `⚠️ Comissão de R$ ${dispensaState.valorComissao.toFixed(2)} já paga ao indicador. Sobrepagamento mantido sem estorno. Motivo dispensa: ${dispensaState.motivo.trim()}`,
            data_movimentacao: new Date().toISOString().split("T")[0],
          });
        } else if (!dispensaState.comissaoJaPaga && parceria?.valor_comissao_indicador && parceria.valor_comissao_indicador > 0) {
          auditRecords.push({
            user_id: user.id,
            workspace_id: pagData.workspaceId,
            tipo: "COMISSAO_INDICADOR_DISPENSADA",
            valor: 0,
            moeda: "BRL",
            status: "CONFIRMADO",
            parceria_id: dispensaState.parceriaId,
            parceiro_id: pagData.parceiroId,
            indicador_id: indicadorId,
            descricao: `Comissão dispensada: parceria não efetivada`,
            data_movimentacao: new Date().toISOString().split("T")[0],
          });
        }

        await supabase.from("movimentacoes_indicacao").insert(auditRecords);
      }

      toast.success(`Pagamento de ${dispensaState.parceiroNome} dispensado${dispensaState.comissaoJaPaga && dispensaState.estornar ? ". Estorno da comissão registrado." : ""}`);
      resetDispensa();
      // Complex mutation — full refetch for consistency
      fullRefetch();
    } catch (err) {
      console.error("Erro ao dispensar pagamento:", err);
      toast.error("Erro ao dispensar pagamento");
    }
  }, [user, fullRefetch]);

  return {
    handleSaqueAction,
    handleCancelarLiberacao,
    handleMarcarParaSaque,
    handleDisponibilizarCasa,
    handleAcknowledgeCasaDesvinculada,
    handleSolicitarSaqueCasaDesvinculada,
    handleEncerrarParceria,
    handleDispensarPagamento,
  };
}
