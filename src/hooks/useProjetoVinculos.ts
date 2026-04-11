/**
 * Hook centralizado para vínculos de projeto usando React Query
 * 
 * BENEFÍCIOS:
 * - Lifecycle management automático (cancela queries no unmount)
 * - Cache compartilhado entre componentes
 * - Sem toasts "fantasmas" após navegação
 * - Invalidação coordenada com outros hooks
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { preCheckUnlink, executeUnlink, executeLink } from "@/lib/projetoTransitionService";

export interface Vinculo {
  id: string;
  nome: string;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  investidor_id: string | null;
  investidor_nome: string | null;
  instance_identifier: string | null;
  projeto_id: string | null;
  bookmaker_status: string;
  saldo_real: number;
  saldo_em_aposta: number;
  saldo_disponivel: number;
  saldo_freebet: number;
  saldo_bonus: number;
  saldo_operavel: number;
  moeda: string;
  login_username: string;
  login_password_encrypted: string | null;
  bookmaker_catalogo_id: string | null;
  logo_url?: string | null;
  totalApostas: number;
  has_pending_transactions: boolean;
  has_pending_withdrawals: boolean;
  saldo_saque_pendente: number;
  created_at: string | null;
}

export interface BookmakerDisponivel {
  id: string;
  nome: string;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  saldo_atual: number;
  bookmaker_status: string;
  logo_url?: string | null;
  moeda: string;
}

const QUERY_KEY = "projeto-vinculos";

/**
 * Função auxiliar para invalidar TODAS as queries afetadas por mudanças em vínculos.
 * Garante reatividade completa: KPIs, saldos, disponibilidade e exposição
 * são atualizados automaticamente sem necessidade de F5.
 * 
 * DEVE ser chamada após qualquer mutation que afete vínculos.
 */
function invalidateAllVinculoRelatedQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  projetoId: string
) {
  // 1. Vínculos e histórico do projeto
  queryClient.invalidateQueries({ queryKey: [QUERY_KEY, projetoId] });
  queryClient.invalidateQueries({ queryKey: [QUERY_KEY, "historico", projetoId] });

  // 2. Bookmakers disponíveis (lista muda quando vincula/desvincula)
  queryClient.invalidateQueries({ queryKey: ["bookmakers-disponiveis"] });

  // 3. Saldos das bookmakers (saldo operável, disponível, etc.)
  queryClient.invalidateQueries({ queryKey: ["bookmaker-saldos", projetoId] });
  queryClient.invalidateQueries({ queryKey: ["bookmaker-saldos"] });
  queryClient.invalidateQueries({ queryKey: ["saldo-operavel-rpc", projetoId] });

  // 4. KPIs centrais do projeto (lucro, ROI, volume)
  queryClient.invalidateQueries({ queryKey: ["projeto-resultado", projetoId] });
  queryClient.invalidateQueries({ queryKey: ["projeto-breakdowns", projetoId] });

  // 5. Lista de bookmakers (para outros componentes)
  queryClient.invalidateQueries({ queryKey: ["bookmakers", projetoId] });
  queryClient.invalidateQueries({ queryKey: ["bookmakers"] });

  // 6. Exposição financeira e capacidade de aposta
  queryClient.invalidateQueries({ queryKey: ["exposicao-projeto", projetoId] });
  queryClient.invalidateQueries({ queryKey: ["capacidade-aposta", projetoId] });

  // 7. Saldos do parceiro (quando vínculo muda, saldo consolidado muda)
  queryClient.invalidateQueries({ queryKey: ["parceiro-financeiro"] });
  queryClient.invalidateQueries({ queryKey: ["parceiro-consolidado"] });

  // 8. CRÍTICO: Painel de Relacionamentos (contagem de contas/parceiros)
  queryClient.invalidateQueries({ queryKey: ["projeto-painel-contas", projetoId] });

  // 9. Rollover por casa (para SaldoOperavelCard)
  queryClient.invalidateQueries({ queryKey: ["rollover-por-casa", projetoId] });

  // 10. CRÍTICO: Indicadores Financeiros (Fluxo Líquido, Break-Even, etc.)
  queryClient.invalidateQueries({ queryKey: ["projeto-financial-metrics", projetoId] });

  // 11. Dashboard (Evolução do Lucro, Calendário)
  queryClient.invalidateQueries({ queryKey: ["projeto-dashboard-extras", projetoId] });
  queryClient.invalidateQueries({ queryKey: ["projeto-dashboard-apostas", projetoId] });
  queryClient.invalidateQueries({ queryKey: ["projeto-dashboard-calendario", projetoId] });
  
  // 12. Calendário RPC (nova arquitetura)
  queryClient.invalidateQueries({ queryKey: ["calendar-apostas-rpc", projetoId] });

  console.log(`[useProjetoVinculos] Invalidated ALL vinculo-related queries for project ${projetoId}`);
}

/**
 * Hook principal para vínculos do projeto
 * Usa React Query para lifecycle management automático
 */
export function useProjetoVinculos(projetoId: string | undefined) {
  const queryClient = useQueryClient();

  // Query principal para vínculos ativos
  const vinculosQuery = useQuery({
    queryKey: [QUERY_KEY, projetoId],
    queryFn: async (): Promise<Vinculo[]> => {
      if (!projetoId) return [];

      // FONTE ÚNICA DE VERDADE: usar RPC get_bookmaker_saldos para saldos
      const { data: saldosData, error: saldosError } = await supabase.rpc("get_bookmaker_saldos", {
        p_projeto_id: projetoId
      });

      if (saldosError) {
        console.error("[useProjetoVinculos] Erro na RPC:", saldosError);
        throw saldosError;
      }

      // Buscar dados complementares (credenciais, status, etc) que a RPC não retorna
      const bookmakerIds = (saldosData || []).map((s: any) => s.id);
      
      let credentialsMap: Record<string, { 
        status: string; 
        login_username: string; 
        login_password_encrypted: string | null;
        bookmaker_catalogo_id: string | null;
        created_at: string | null;
        investidor_id: string | null;
        investidor_nome: string | null;
        instance_identifier: string | null;
      }> = {};
      let apostasCount: Record<string, number> = {};

      if (bookmakerIds.length > 0) {
        // Buscar credenciais e status das bookmakers
        const { data: bookmarkersDetails } = await supabase
          .from("bookmakers")
          .select("id, status, login_username, login_password_encrypted, bookmaker_catalogo_id, created_at, investidor_id, instance_identifier, investidores(nome)")
          .in("id", bookmakerIds);

        if (bookmarkersDetails) {
          bookmarkersDetails.forEach((b: any) => {
            credentialsMap[b.id] = {
              status: b.status,
              login_username: b.login_username,
              login_password_encrypted: b.login_password_encrypted,
              bookmaker_catalogo_id: b.bookmaker_catalogo_id,
              created_at: b.created_at || null,
              investidor_id: b.investidor_id || null,
              investidor_nome: b.investidores?.nome || null,
              instance_identifier: b.instance_identifier || null,
            };
          });
        }

        // Contar apostas por bookmaker
        // 1. Apostas simples: bookmaker_id está diretamente em apostas_unificada
        const { data: apostasSimples } = await supabase
          .from("apostas_unificada")
          .select("bookmaker_id")
          .eq("projeto_id", projetoId)
          .not("bookmaker_id", "is", null)
          .in("bookmaker_id", bookmakerIds);

        if (apostasSimples) {
          apostasSimples.forEach((a: any) => {
            if (a.bookmaker_id) {
              apostasCount[a.bookmaker_id] = (apostasCount[a.bookmaker_id] || 0) + 1;
            }
          });
        }

        // 2. Apostas em pernas (Surebets/Arbitragem e Múltiplas): bookmaker_id está em apostas_pernas
        // Estas apostas têm bookmaker_id NULL no registro pai
        const { data: apostasIds } = await supabase
          .from("apostas_unificada")
          .select("id")
          .eq("projeto_id", projetoId)
          .is("bookmaker_id", null);

        if (apostasIds && apostasIds.length > 0) {
          const parentIds = apostasIds.map((a: any) => a.id);
          // Buscar pernas em batches para evitar limites de query
          const BATCH_SIZE = 200;
          for (let i = 0; i < parentIds.length; i += BATCH_SIZE) {
            const batch = parentIds.slice(i, i + BATCH_SIZE);
            const { data: pernasData } = await supabase
              .from("apostas_pernas")
              .select("bookmaker_id")
              .in("aposta_id", batch)
              .in("bookmaker_id", bookmakerIds);

            if (pernasData) {
              pernasData.forEach((p: any) => {
                if (p.bookmaker_id) {
                  apostasCount[p.bookmaker_id] = (apostasCount[p.bookmaker_id] || 0) + 1;
                }
              });
            }
          }
        }
      }

      // Mapear para interface Vinculo
      return (saldosData || []).map((s: any) => {
        const creds = credentialsMap[s.id] || {
          status: "ativo",
          login_username: "",
          login_password_encrypted: null,
          bookmaker_catalogo_id: null,
          created_at: null,
          investidor_id: null,
          investidor_nome: null,
          instance_identifier: null,
        };

        return {
          id: s.id,
          nome: s.nome,
          parceiro_id: s.parceiro_id,
          parceiro_nome: s.parceiro_nome || null,
          projeto_id: projetoId,
          bookmaker_status: creds.status,
          saldo_real: Number(s.saldo_real) || 0,
          saldo_em_aposta: Number(s.saldo_em_aposta) || 0,
          saldo_disponivel: Number(s.saldo_disponivel) || 0,
          saldo_freebet: Number(s.saldo_freebet) || 0,
          saldo_bonus: Number(s.saldo_bonus) || 0,
          saldo_operavel: Number(s.saldo_operavel) || 0,
          moeda: s.moeda || "BRL",
          login_username: creds.login_username,
          login_password_encrypted: creds.login_password_encrypted,
          bookmaker_catalogo_id: creds.bookmaker_catalogo_id,
          logo_url: s.logo_url || null,
          totalApostas: apostasCount[s.id] || 0,
          has_pending_transactions: Boolean(s.has_pending_transactions),
          has_pending_withdrawals: Boolean(s.has_pending_withdrawals),
          saldo_saque_pendente: Number(s.saldo_saque_pendente) || 0,
          created_at: creds.created_at,
          investidor_id: creds.investidor_id,
          investidor_nome: creds.investidor_nome,
          instance_identifier: creds.instance_identifier,
        };
      });
    },
    enabled: !!projetoId,
    staleTime: 30 * 1000, // 30 segundos
    gcTime: 5 * 60 * 1000, // 5 minutos
    refetchOnWindowFocus: false, // Evitar refetch em cascata
  });

  // Query para histórico
  const historicoQuery = useQuery({
    queryKey: [QUERY_KEY, "historico", projetoId],
    queryFn: async () => {
      if (!projetoId) return { total: 0, devolvidas: 0 };

      const { data, error } = await supabase
        .from("projeto_bookmaker_historico")
        .select("id, data_desvinculacao")
        .eq("projeto_id", projetoId);

      if (error) throw error;

      const total = data?.length || 0;
      const devolvidas = data?.filter(h => h.data_desvinculacao !== null).length || 0;
      return { total, devolvidas };
    },
    enabled: !!projetoId,
    staleTime: 60 * 1000, // 1 minuto
  });

  // Função para invalidar cache - usa a função centralizada para garantir reatividade completa
  const invalidate = () => {
    if (projetoId) {
      invalidateAllVinculoRelatedQueries(queryClient, projetoId);
    }
  };

  return {
    vinculos: vinculosQuery.data || [],
    isLoading: vinculosQuery.isLoading,
    isError: vinculosQuery.isError,
    error: vinculosQuery.error,
    refetch: vinculosQuery.refetch,
    
    historicoCount: historicoQuery.data || { total: 0, devolvidas: 0 },
    
    invalidate,
  };
}

/**
 * Hook para buscar bookmakers disponíveis (não vinculados a projeto)
 */
export function useBookmakersDisponiveis(enabled: boolean = false) {
  return useQuery({
    queryKey: ["bookmakers-disponiveis"],
    queryFn: async (): Promise<BookmakerDisponivel[]> => {
      // CORREÇÃO: Saldo sempre usa saldo_atual (campo nativo da moeda)
      // O campo saldo_usd NÃO é atualizado corretamente em todos os fluxos
      const getSaldoBookmaker = (b: { saldo_atual?: number | null }) => {
        return Number(b.saldo_atual) || 0;
      };

      const { data, error } = await supabase
        .from("bookmakers")
        .select(`
          id,
          nome,
          parceiro_id,
          status,
          saldo_atual,
          moeda,
          investidor_id,
          parceiros!bookmakers_parceiro_id_fkey (nome),
          bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url)
        `)
        .is("projeto_id", null)
        .is("investidor_id", null); // Excluir contas de investidores - não pertencem ao pool interno

      if (error) throw error;

      // CORREÇÃO: Filtrar status case-insensitive para evitar vazamento
      // de bookmakers limitadas/bloqueadas/encerradas
      const statusBloqueados = ["limitada", "bloqueada", "encerrada"];
      
      return (data || [])
        .filter((v: any) => {
          const status = (v.status || "ativo").toLowerCase();
          return !statusBloqueados.includes(status);
        })
        .map((v: any) => ({
          id: v.id,
          nome: v.nome,
          parceiro_id: v.parceiro_id,
          parceiro_nome: v.parceiros?.nome || null,
          saldo_atual: getSaldoBookmaker({ saldo_atual: v.saldo_atual }),
          bookmaker_status: v.status,
          logo_url: v.bookmakers_catalogo?.logo_url || null,
          moeda: v.moeda || 'BRL',
        }));
    },
    enabled,
    staleTime: 30 * 1000,
  });
}

/**
 * Hook para adicionar vínculos ao projeto
 */
export function useAddVinculos(projetoId: string, workspaceId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (selectedIds: string[]) => {
      if (selectedIds.length === 0) {
        throw new Error("Selecione pelo menos um vínculo");
      }

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Usuário não autenticado");

      // 0. Buscar saldos ANTES de vincular (para DEPOSITO_VIRTUAL)
      const { data: bmSaldos } = await supabase
        .from("bookmakers")
        .select("id, saldo_atual, moeda")
        .in("id", selectedIds);

      // Update bookmakers with projeto_id and reset status to ativo
      const { error } = await supabase
        .from("bookmakers")
        .update({ projeto_id: projetoId, status: "ativo" })
        .in("id", selectedIds);

      if (error) throw error;

      // Get bookmaker details for history
      const { data: bookmakers } = await supabase
        .from("bookmakers")
        .select("id, nome, parceiro_id, parceiros!bookmakers_parceiro_id_fkey (nome)")
        .in("id", selectedIds);

      // Insert history records
      if (bookmakers && workspaceId) {
        const historicoRecords = bookmakers.map((bk: any) => ({
          user_id: userData.user!.id,
          workspace_id: workspaceId,
          projeto_id: projetoId,
          bookmaker_id: bk.id,
          parceiro_id: bk.parceiro_id,
          bookmaker_nome: bk.nome,
          parceiro_nome: bk.parceiros?.nome || null,
          data_vinculacao: new Date().toISOString(),
          data_desvinculacao: null,
          status_final: null,
        }));

        await supabase
          .from("projeto_bookmaker_historico")
          .upsert(historicoRecords, { onConflict: "projeto_id,bookmaker_id" });

        // executeLink cuida de: atribuir órfãs + DEPOSITO_VIRTUAL
        if (bmSaldos) {
          for (const bm of bmSaldos) {
            await executeLink({
              bookmakerId: bm.id,
              projetoId,
              workspaceId,
              userId: userData.user!.id,
              saldoAtual: bm.saldo_atual,
              moeda: bm.moeda || 'BRL',
            });
          }
        }
      }

      return selectedIds.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} vínculo(s) adicionado(s) ao projeto`);
      // CRÍTICO: Invalidar TODAS as queries afetadas para reatividade completa
      invalidateAllVinculoRelatedQueries(queryClient, projetoId);
    },
    onError: (error: any) => {
      toast.error("Erro ao adicionar vínculos: " + error.message);
    },
  });
}

/**
 * Hook para alterar status de bookmaker
 */
export function useChangeBookmakerStatus(projetoId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ bookmarkerId, newStatus }: { bookmarkerId: string; newStatus: string }) => {
      const statusLower = newStatus.toLowerCase();
      
      const { error } = await supabase
        .from("bookmakers")
        .update({ status: statusLower })
        .eq("id", bookmarkerId);

      if (error) throw error;
      return { bookmarkerId, newStatus: statusLower };
    },
    onSuccess: ({ newStatus }) => {
      toast.success(`Status alterado para ${newStatus}`);
      // CRÍTICO: Invalidar TODAS as queries afetadas para reatividade completa
      // Mudança de status afeta disponibilidade operacional
      invalidateAllVinculoRelatedQueries(queryClient, projetoId);
    },
    onError: (error: any) => {
      toast.error("Erro ao alterar status: " + error.message);
    },
  });
}

/**
 * Hook para remover vínculo (desvincular bookmaker do projeto)
 */
export function useRemoveVinculo(projetoId: string, workspaceId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ bookmakerId, statusFinal, isInvestorAccount }: { bookmakerId: string; statusFinal: string; isInvestorAccount?: boolean }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Usuário não autenticado");
      if (!workspaceId) throw new Error("Workspace não definido");

      // Pre-check: calcula saldo efetivo e identifica pendências
      const check = await preCheckUnlink(bookmakerId);

      if (check.warnings.length > 0) {
        console.warn('[useRemoveVinculo] Warnings:', check.warnings);
      }

      // Se não informado explicitamente, detectar automaticamente
      let investorFlag = isInvestorAccount;
      if (investorFlag === undefined) {
        const { data: bm } = await supabase
          .from("bookmakers")
          .select("investidor_id")
          .eq("id", bookmakerId)
          .single();
        investorFlag = !!(bm?.investidor_id);
      }

      // Executa desvinculação com todas as proteções
      await executeUnlink({
        bookmakerId,
        projetoId,
        workspaceId,
        userId: userData.user.id,
        statusFinal,
        saldoVirtualEfetivo: check.saldoVirtualEfetivo,
        moeda: check.moeda,
        isInvestorAccount: investorFlag,
      });

      return { bookmakerId, statusFinal, warnings: check.warnings };
    },
    onSuccess: ({ statusFinal, warnings }) => {
      if (warnings.length > 0) {
        toast.warning(`Desvinculada com avisos: ${warnings.join('; ')}`);
      } else {
        toast.success(`Bookmaker desvinculada com status: ${statusFinal}`);
      }
      // CRÍTICO: Invalidar TODAS as queries afetadas para reatividade completa
      invalidateAllVinculoRelatedQueries(queryClient, projetoId);
    },
    onError: (error: any) => {
      toast.error("Erro ao desvincular: " + error.message);
    },
  });
}
