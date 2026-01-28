/**
 * Hook para obter histórico e indicadores operacionais de contas de um projeto
 * 
 * REGRA CRÍTICA: Contadores históricos NUNCA diminuem.
 * Representam o passado operacional do projeto, não o estado atual.
 * 
 * Dados vêm de:
 * - bookmakers (vínculos atuais)
 * - projeto_bookmaker_historico (vínculos históricos)
 * - project_bookmaker_link_bonuses (bônus ativos)
 * - parceiros (parceiros únicos)
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ContaHistorico {
  id: string;
  nome: string;
  parceiroNome: string | null;
  dataVinculacao: string | null;
  foiLimitada: boolean;
}

interface ParceiroHistorico {
  id: string;
  nome: string;
  totalContas: number;
}

interface HistoricoContasResult {
  // BLOCO A — Estado Atual
  contasAtuais: number;
  contasAtivas: number;
  contasLimitadas: number;
  parceirosAtivos: number;
  
  // BLOCO B — Histórico Consolidado (NUNCA diminui)
  historicoTotalContas: number;       // Total de contas já usadas
  historicoContasLimitadas: number;   // Total de contas que já foram limitadas
  historicoParceirosUnicos: number;   // Total de parceiros únicos que já passaram pelo projeto
  
  // BLOCO B — Dados detalhados para tooltips
  historicoContasLista: ContaHistorico[];
  historicoContasLimitadasLista: ContaHistorico[];
  historicoParceirosLista: ParceiroHistorico[];
  
  // BLOCO C — Indicadores Operacionais
  casasComBonus: number;              // Casas (bookmaker_catalogo) com bônus ativo
  contasComBonus: number;             // Contas (bookmakers) com bônus ativo
  parceirosComContasVinculadas: number; // Parceiros que têm contas atualmente vinculadas
  
  // BLOCO C — Dados detalhados para tooltips
  casasComBonusLista: { id: string; nome: string }[];
  contasComBonusLista: { id: string; nome: string; parceiroNome: string | null }[];
  parceirosAtivosLista: { id: string; nome: string; totalContas: number }[];
  
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useProjetoHistoricoContas(projetoId: string): HistoricoContasResult {
  // Query principal unificada
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["projeto-painel-contas", projetoId],
    queryFn: async () => {
      // 1. Buscar bookmakers atualmente vinculados com dados do catálogo
      const { data: bookmarkersAtuais, error: bookmarkersError } = await supabase
        .from("bookmakers")
        .select(`
          id, 
          nome,
          status, 
          parceiro_id, 
          bookmaker_catalogo_id,
          created_at,
          parceiros!bookmakers_parceiro_id_fkey (id, nome),
          bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (id, nome)
        `)
        .eq("projeto_id", projetoId);
      
      if (bookmarkersError) throw bookmarkersError;

      // 2. Buscar histórico de vínculos
      const { data: historicoData, error: historicoError } = await supabase
        .from("projeto_bookmaker_historico")
        .select(`
          id, 
          bookmaker_id, 
          parceiro_id, 
          status_final,
          bookmaker_nome,
          parceiro_nome,
          data_vinculacao
        `)
        .eq("projeto_id", projetoId)
        .order("data_vinculacao", { ascending: true });
      
      if (historicoError) throw historicoError;

      // 3. Buscar bônus ativos (creditados)
      const { data: bonusData, error: bonusError } = await supabase
        .from("project_bookmaker_link_bonuses")
        .select("id, bookmaker_id, status")
        .eq("project_id", projetoId)
        .eq("status", "credited");
      
      if (bonusError) throw bonusError;

      // ============ BLOCO A — Estado Atual ============
      const contasAtuais = bookmarkersAtuais?.length || 0;
      const contasAtivas = bookmarkersAtuais?.filter(b => 
        b.status?.toUpperCase() === "ATIVO"
      ).length || 0;
      const contasLimitadas = bookmarkersAtuais?.filter(b => 
        b.status?.toUpperCase() === "LIMITADA"
      ).length || 0;
      
      // Parceiros ativos = parceiros únicos com contas atualmente vinculadas
      const parceirosIdsAtuais = new Set(
        bookmarkersAtuais?.map(b => b.parceiro_id).filter(Boolean) || []
      );
      const parceirosAtivos = parceirosIdsAtuais.size;

      // ============ BLOCO B — Histórico Consolidado ============
      // Mapa para construir lista de contas históricas
      const contasHistoricoMap = new Map<string, ContaHistorico>();
      
      // Adicionar do histórico primeiro
      historicoData?.forEach(h => {
        if (h.bookmaker_id) {
          contasHistoricoMap.set(h.bookmaker_id, {
            id: h.bookmaker_id,
            nome: h.bookmaker_nome || "Conta sem nome",
            parceiroNome: h.parceiro_nome || null,
            dataVinculacao: h.data_vinculacao,
            foiLimitada: h.status_final?.toLowerCase() === "limitada"
          });
        }
      });
      
      // Adicionar/atualizar com dados atuais
      bookmarkersAtuais?.forEach(b => {
        const existing = contasHistoricoMap.get(b.id);
        const parceiroNome = (b as any).parceiros?.nome || null;
        contasHistoricoMap.set(b.id, {
          id: b.id,
          nome: b.nome,
          parceiroNome: parceiroNome,
          dataVinculacao: existing?.dataVinculacao || b.created_at,
          foiLimitada: existing?.foiLimitada || b.status?.toLowerCase() === "limitada"
        });
      });
      
      const historicoContasLista = Array.from(contasHistoricoMap.values())
        .sort((a, b) => {
          if (!a.dataVinculacao) return 1;
          if (!b.dataVinculacao) return -1;
          return new Date(a.dataVinculacao).getTime() - new Date(b.dataVinculacao).getTime();
        });
      
      const historicoTotalContas = historicoContasLista.length;
      
      const historicoContasLimitadasLista = historicoContasLista.filter(c => c.foiLimitada);
      const historicoContasLimitadas = historicoContasLimitadasLista.length;
      
      // Parceiros únicos histórico
      const parceirosMap = new Map<string, { nome: string; contas: Set<string> }>();
      
      historicoData?.forEach(h => {
        if (h.parceiro_id && h.parceiro_nome) {
          const existing = parceirosMap.get(h.parceiro_id);
          if (existing) {
            if (h.bookmaker_id) existing.contas.add(h.bookmaker_id);
          } else {
            parceirosMap.set(h.parceiro_id, {
              nome: h.parceiro_nome,
              contas: new Set(h.bookmaker_id ? [h.bookmaker_id] : [])
            });
          }
        }
      });
      
      bookmarkersAtuais?.forEach(b => {
        if (b.parceiro_id) {
          const parceiroNome = (b as any).parceiros?.nome || "Parceiro";
          const existing = parceirosMap.get(b.parceiro_id);
          if (existing) {
            existing.contas.add(b.id);
          } else {
            parceirosMap.set(b.parceiro_id, {
              nome: parceiroNome,
              contas: new Set([b.id])
            });
          }
        }
      });
      
      const historicoParceirosLista: ParceiroHistorico[] = Array.from(parceirosMap.entries())
        .map(([id, data]) => ({
          id,
          nome: data.nome,
          totalContas: data.contas.size
        }))
        .sort((a, b) => b.totalContas - a.totalContas);
      
      const historicoParceirosUnicos = historicoParceirosLista.length;

      // ============ BLOCO C — Indicadores Operacionais ============
      // Bookmakers com bônus ativo
      const bookmakersComBonusIds = new Set(
        bonusData?.map(b => b.bookmaker_id) || []
      );
      const contasComBonus = bookmakersComBonusIds.size;
      
      // Contas com bônus - lista detalhada
      const contasComBonusLista = bookmarkersAtuais
        ?.filter(b => bookmakersComBonusIds.has(b.id))
        .map(b => ({
          id: b.id,
          nome: b.nome,
          parceiroNome: (b as any).parceiros?.nome || null
        })) || [];
      
      // Casas (bookmaker_catalogo) com bônus = extrair catalogo_ids únicos das contas com bônus
      const catalogosComBonusMap = new Map<string, string>();
      bookmarkersAtuais
        ?.filter(b => bookmakersComBonusIds.has(b.id) && b.bookmaker_catalogo_id)
        .forEach(b => {
          const catalogoNome = (b as any).bookmakers_catalogo?.nome || b.nome;
          if (b.bookmaker_catalogo_id) {
            catalogosComBonusMap.set(b.bookmaker_catalogo_id, catalogoNome);
          }
        });
      
      const casasComBonusLista = Array.from(catalogosComBonusMap.entries())
        .map(([id, nome]) => ({ id, nome }));
      const casasComBonus = casasComBonusLista.length;
      
      // Parceiros com contas vinculadas (atualmente) - lista detalhada
      const parceirosAtivosMap = new Map<string, { nome: string; contas: number }>();
      bookmarkersAtuais?.forEach(b => {
        if (b.parceiro_id) {
          const parceiroNome = (b as any).parceiros?.nome || "Parceiro";
          const existing = parceirosAtivosMap.get(b.parceiro_id);
          if (existing) {
            existing.contas++;
          } else {
            parceirosAtivosMap.set(b.parceiro_id, { nome: parceiroNome, contas: 1 });
          }
        }
      });
      
      const parceirosAtivosLista = Array.from(parceirosAtivosMap.entries())
        .map(([id, data]) => ({
          id,
          nome: data.nome,
          totalContas: data.contas
        }))
        .sort((a, b) => b.totalContas - a.totalContas);
      
      const parceirosComContasVinculadas = parceirosAtivosLista.length;

      return {
        // BLOCO A
        contasAtuais,
        contasAtivas,
        contasLimitadas,
        parceirosAtivos,
        // BLOCO B
        historicoTotalContas,
        historicoContasLimitadas,
        historicoParceirosUnicos,
        historicoContasLista,
        historicoContasLimitadasLista,
        historicoParceirosLista,
        // BLOCO C
        casasComBonus,
        contasComBonus,
        parceirosComContasVinculadas,
        casasComBonusLista,
        contasComBonusLista,
        parceirosAtivosLista,
      };
    },
    enabled: !!projetoId,
    staleTime: 5000, // 5 segundos - permite reatividade após invalidação
    gcTime: 60 * 1000, // 1 minuto cache
    refetchOnWindowFocus: false,
  });

  return {
    // BLOCO A — Estado Atual
    contasAtuais: data?.contasAtuais || 0,
    contasAtivas: data?.contasAtivas || 0,
    contasLimitadas: data?.contasLimitadas || 0,
    parceirosAtivos: data?.parceirosAtivos || 0,
    
    // BLOCO B — Histórico Consolidado
    historicoTotalContas: data?.historicoTotalContas || 0,
    historicoContasLimitadas: data?.historicoContasLimitadas || 0,
    historicoParceirosUnicos: data?.historicoParceirosUnicos || 0,
    historicoContasLista: data?.historicoContasLista || [],
    historicoContasLimitadasLista: data?.historicoContasLimitadasLista || [],
    historicoParceirosLista: data?.historicoParceirosLista || [],
    
    // BLOCO C — Indicadores Operacionais
    casasComBonus: data?.casasComBonus || 0,
    contasComBonus: data?.contasComBonus || 0,
    parceirosComContasVinculadas: data?.parceirosComContasVinculadas || 0,
    casasComBonusLista: data?.casasComBonusLista || [],
    contasComBonusLista: data?.contasComBonusLista || [],
    parceirosAtivosLista: data?.parceirosAtivosLista || [],
    
    isLoading,
    isError,
    refetch,
  };
}
