import { useState, useEffect, useMemo, useCallback } from "react";
import { useTabWorkspace } from "@/hooks/useTabWorkspace";
import { useWorkspaceChangeListener } from "@/hooks/useWorkspaceCacheClear";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useCotacoes } from "@/hooks/useCotacoes";
import { PageHeader } from "@/components/PageHeader";
import { Users } from "lucide-react";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import ParceiroDialog from "@/components/parceiros/ParceiroDialog";
import BookmakerDialog from "@/components/bookmakers/BookmakerDialog";
import type { VinculoCriadoContext } from "@/components/bookmakers/BookmakerDialog";
import { VinculoCriadoConfirmDialog } from "@/components/bookmakers/VinculoCriadoConfirmDialog";
import { CaixaTransacaoDialog } from "@/components/caixa/CaixaTransacaoDialog";
import { ParceiroListaSidebar } from "@/components/parceiros/ParceiroListaSidebar";
import { ParceiroDetalhesPanel } from "@/components/parceiros/ParceiroDetalhesPanel";
import { formatCPF, maskCPFPartial } from "@/lib/validators";
import { useParceiroFinanceiroCache } from "@/hooks/useParceiroFinanceiroCache";
import { getGlobalBookmakersCache } from "@/hooks/useParceiroTabsCache";
import { FIAT_CURRENCIES } from "@/types/currency";

// ============== MULTI-CURRENCY TYPES ==============

// Lista de moedas FIAT suportadas
const SUPPORTED_FIAT: string[] = FIAT_CURRENCIES.map(c => c.value);

// Record dinâmico para saldos por moeda
type SaldosPorMoeda = Record<string, number>;

// Helper para criar objeto de saldos vazio
function createEmptySaldos(): SaldosPorMoeda {
  const saldos: SaldosPorMoeda = {};
  SUPPORTED_FIAT.forEach(moeda => {
    saldos[moeda] = 0;
  });
  return saldos;
}

interface Parceiro {
  id: string;
  nome: string;
  cpf: string;
  email: string | null;
  telefone: string | null;
  status: string;
  created_at: string;
  contas_bancarias: any[];
  wallets_crypto: any[];
}

interface ParceiroROI {
  parceiro_id: string;
  depositado_por_moeda: SaldosPorMoeda;
  sacado_por_moeda: SaldosPorMoeda;
  saldo_por_moeda: SaldosPorMoeda;
  resultado_por_moeda: SaldosPorMoeda;
  moedas_utilizadas: string[];
  roi_percentual: number;
  num_bookmakers: number;
  num_bookmakers_limitadas: number;
}

interface SaldoParceiro {
  parceiro_id: string;
  saldo_fiat: number;
  saldo_crypto_usd: number;
}

interface SaldoCryptoRaw {
  parceiro_id: string;
  coin: string;
  saldo_coin: number;
  saldo_usd: number;
}

interface ParceriaStatus {
  parceiro_id: string;
  dias_restantes: number;
  pagamento_parceiro_realizado: boolean;
}

export default function GestaoParceiros() {
  const [parceiros, setParceiros] = useState<Parceiro[]>([]);
  const [roiData, setRoiData] = useState<Map<string, ParceiroROI>>(new Map());
  const [saldosData, setSaldosData] = useState<Map<string, SaldoParceiro>>(new Map());
  const [saldosCryptoRaw, setSaldosCryptoRaw] = useState<SaldoCryptoRaw[]>([]);
  const [parceriasData, setParceriasData] = useState<Map<string, ParceriaStatus>>(new Map());
  const [showSensitiveData, setShowSensitiveData] = useState(true);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingParceiro, setEditingParceiro] = useState<Parceiro | null>(null);
  const [viewMode, setViewMode] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [parceiroToDelete, setParceiroToDelete] = useState<string | null>(null);
  const [vinculoDialogOpen, setVinculoDialogOpen] = useState(false);
  const [bookmakerRefreshKey, setBookmakerRefreshKey] = useState(0);
  const [vinculoParceiroId, setVinculoParceiroId] = useState<string | null>(null);
  const [vinculoBookmakerId, setVinculoBookmakerId] = useState<string | null>(null);
  const [editingBookmaker, setEditingBookmaker] = useState<any | null>(null);
  const [transacaoDialogOpen, setTransacaoDialogOpen] = useState(false);
  const [transacaoBookmaker, setTransacaoBookmaker] = useState<{ id: string; nome: string; saldo_atual: number; saldo_usd?: number; moeda: string } | null>(null);
  const [transacaoTipo, setTransacaoTipo] = useState<string>("deposito");
  const [transacaoEntryPoint, setTransacaoEntryPoint] = useState<string | undefined>(undefined);
  const [vinculoCriadoConfirmOpen, setVinculoCriadoConfirmOpen] = useState(false);
  const [vinculoCriadoContext, setVinculoCriadoContext] = useState<VinculoCriadoContext | null>(null);
  // Persistência: Inicializa com o último parceiro selecionado do localStorage
  const [selectedParceiroDetalhes, setSelectedParceiroDetalhes] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('last_selected_partner_id');
    }
    return null;
  });

  const parceiroCache = useParceiroFinanceiroCache();
  
  // SEGURANÇA: workspaceId como dependência para isolamento multi-tenant
  const { workspaceId } = useTabWorkspace();

  // Persistência: Salva no localStorage ao selecionar parceiro
  const handleSelectParceiroDetalhes = useCallback((id: string) => {
    setSelectedParceiroDetalhes(id);
    parceiroCache.selectParceiro(id);
    // Persistir no localStorage para manter contexto entre sessões
    localStorage.setItem('last_selected_partner_id', id);
  }, [parceiroCache.selectParceiro]);

  const navigate = useNavigate();
  const { toast } = useToast();

  const cryptoSymbols = useMemo(() => {
    const symbols = saldosCryptoRaw.map(s => s.coin);
    return [...new Set(symbols)];
  }, [saldosCryptoRaw]);
  
  const { cryptoPrices, getCryptoUSDValue } = useCotacoes(cryptoSymbols);

  useEffect(() => {
    if (saldosCryptoRaw.length === 0) return;
    
    const saldosMap = new Map<string, SaldoParceiro>(saldosData);
    
    saldosMap.forEach((saldo) => {
      saldo.saldo_crypto_usd = 0;
    });
    
    saldosCryptoRaw.forEach((saldo) => {
      if (!saldo.parceiro_id) return;
      const current = saldosMap.get(saldo.parceiro_id) || {
        parceiro_id: saldo.parceiro_id,
        saldo_fiat: 0,
        saldo_crypto_usd: 0,
      };
      const usdValue = getCryptoUSDValue(saldo.coin, saldo.saldo_coin, saldo.saldo_usd);
      current.saldo_crypto_usd += usdValue;
      saldosMap.set(saldo.parceiro_id, current);
    });
    
    setSaldosData(new Map(saldosMap));
  }, [cryptoPrices, saldosCryptoRaw]);

  // SEGURANÇA: Refetch quando workspace muda
  useEffect(() => {
    if (workspaceId) {
      checkAuth();
      fetchParceiros();
      fetchParceriasStatus();
    }
  }, [workspaceId]);

  // Listener para reset de estados locais na troca de workspace
  useWorkspaceChangeListener(useCallback(() => {
    console.log("[GestaoParceiros] Workspace changed - resetting local state");
    setParceiros([]);
    setRoiData(new Map());
    setSaldosData(new Map());
    setSaldosCryptoRaw([]);
    // Persistência: Limpar parceiro selecionado ao trocar workspace
    setSelectedParceiroDetalhes(null);
    localStorage.removeItem('last_selected_partner_id');
    // Limpar TODOS os caches (incluindo globais de abas)
    parceiroCache.invalidateAllCache();
    // Importar e limpar caches de abas
    import('@/hooks/useParceiroTabsCache').then(({ clearAllParceiroTabsCaches }) => {
      clearAllParceiroTabsCaches();
    });
    setLoading(true);
  }, [parceiroCache]));

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    }
  };

  const fetchParceiros = async () => {
    try {
      const { data, error } = await supabase
        .from("parceiros")
        .select(`
          *,
          contas_bancarias(*),
          wallets_crypto(*)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setParceiros(data || []);
      
      await fetchROIData();
      await fetchSaldosData();
    } catch (error: any) {
      toast({
        title: "Erro ao carregar parceiros",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchROIData = async () => {
    try {
      // =====================================================================
      // NOVO: Usar view de resultado operacional PURO
      // Inclui APENAS: apostas + giros + cashback
      // Exclui: depósitos, saques, FX, ajustes
      // =====================================================================
      
      // Step 1: Get bookmakers with their operational results
      const { data: bookmakersData, error: bookmakersError } = await supabase
        .from("bookmakers")
        .select("id, parceiro_id, saldo_atual, moeda, status");

      if (bookmakersError) throw bookmakersError;

      // Step 2: Get operational results from the view
      const bookmakerIds = (bookmakersData || []).map(b => b.id);
      let resultadosOperacionais: Array<{
        bookmaker_id: string;
        resultado_operacional_total: number;
      }> = [];

      if (bookmakerIds.length > 0) {
        const { data: resultados, error: resultadosError } = await supabase
          .from("v_bookmaker_resultado_operacional")
          .select("bookmaker_id, resultado_operacional_total")
          .in("bookmaker_id", bookmakerIds);

        if (resultadosError) throw resultadosError;
        resultadosOperacionais = resultados || [];
      }

      // Build map of bookmaker_id -> resultado
      const resultadoMap = new Map<string, number>();
      resultadosOperacionais.forEach((r) => {
        resultadoMap.set(r.bookmaker_id, Number(r.resultado_operacional_total) || 0);
      });

      // Step 3: Aggregate by partner and currency
      const roiMap = new Map<string, ParceiroROI>();
      const parceiroAggregates = new Map<string, {
        count: number;
        countLimitadas: number;
        saldo: SaldosPorMoeda;
        resultado: SaldosPorMoeda;
      }>();

      bookmakersData?.forEach((bm) => {
        if (!bm.parceiro_id) return;
        
        const current = parceiroAggregates.get(bm.parceiro_id) || {
          count: 0,
          countLimitadas: 0,
          saldo: createEmptySaldos(),
          resultado: createEmptySaldos(),
        };

        // Count bookmakers by status
        if (bm.status === "ativo") {
          current.count += 1;
        } else if (bm.status === "limitada") {
          current.countLimitadas += 1;
        }

        // Use bookmaker's native currency
        const moedaNativa = bm.moeda || "BRL";
        const saldoNativo = Number(bm.saldo_atual) || 0;
        const resultadoOperacional = resultadoMap.get(bm.id) || 0;

        current.saldo[moedaNativa] = (current.saldo[moedaNativa] || 0) + saldoNativo;
        current.resultado[moedaNativa] = (current.resultado[moedaNativa] || 0) + resultadoOperacional;

        parceiroAggregates.set(bm.parceiro_id, current);
      });

      // Step 4: Build ROI data for each partner
      parceiroAggregates.forEach((aggregates, parceiroId) => {
        const moedasUtilizadas = SUPPORTED_FIAT.filter(
          (moeda) => (aggregates.saldo[moeda] || 0) !== 0 || (aggregates.resultado[moeda] || 0) !== 0
        );

        // ROI calculation (using BRL as base for simplicity)
        const resultadoBRL = aggregates.resultado["BRL"] || 0;
        // Note: We don't have deposits here, so ROI is just the result for display
        // Real ROI would need deposit data, but for sidebar we show resultado

        roiMap.set(parceiroId, {
          parceiro_id: parceiroId,
          depositado_por_moeda: createEmptySaldos(), // Not needed for sidebar
          sacado_por_moeda: createEmptySaldos(), // Not needed for sidebar
          saldo_por_moeda: aggregates.saldo,
          resultado_por_moeda: aggregates.resultado,
          moedas_utilizadas: moedasUtilizadas,
          roi_percentual: 0, // Not calculated here
          num_bookmakers: aggregates.count,
          num_bookmakers_limitadas: aggregates.countLimitadas,
        });
      });

      setRoiData(roiMap);
    } catch (error: any) {
      console.error("Erro ao carregar ROI:", error);
    }
  };

  const fetchParceriasStatus = async () => {
    try {
      const { data: parcerias, error } = await supabase
        .from("parcerias")
        .select("id, parceiro_id, data_fim_prevista, custo_aquisicao_isento, valor_parceiro")
        .in("status", ["ATIVA", "EM_ENCERRAMENTO"]);

      if (error) throw error;

      const parceriasComCusto = parcerias?.filter(p => !p.custo_aquisicao_isento && p.valor_parceiro && p.valor_parceiro > 0) || [];
      const parceriaIdsComCusto = parceriasComCusto.map(p => p.id);
      
      const { data: pagamentos } = parceriaIdsComCusto.length > 0 
        ? await supabase
            .from("movimentacoes_indicacao")
            .select("parceria_id")
            .in("parceria_id", parceriaIdsComCusto)
            .eq("tipo", "PAGTO_PARCEIRO")
            .eq("status", "CONFIRMADO")
        : { data: [] };

      const pagamentosSet = new Set((pagamentos || []).map(p => p.parceria_id));

      const parceriasMap = new Map<string, ParceriaStatus>();
      
      parcerias?.forEach((parceria) => {
        if (!parceria.parceiro_id || !parceria.data_fim_prevista) return;
        
        const dataFim = new Date(parceria.data_fim_prevista);
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        dataFim.setHours(0, 0, 0, 0);
        const diffTime = dataFim.getTime() - hoje.getTime();
        const diasRestantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        const valorParceiro = Number(parceria.valor_parceiro) || 0;
        const custoIsento = parceria.custo_aquisicao_isento === true;
        const isGratuita = custoIsento || valorParceiro <= 0;
        
        parceriasMap.set(parceria.parceiro_id, {
          parceiro_id: parceria.parceiro_id,
          dias_restantes: diasRestantes,
          pagamento_parceiro_realizado: isGratuita || pagamentosSet.has(parceria.id),
        });
      });

      setParceriasData(parceriasMap);
    } catch (error: any) {
      console.error("Erro ao carregar status de parcerias:", error);
    }
  };

  const fetchSaldosData = async () => {
    try {
      const { data: saldosFiat, error: errorFiat } = await supabase
        .from("v_saldo_parceiro_contas")
        .select("*");

      if (errorFiat) throw errorFiat;

      const { data: saldosCrypto, error: errorCrypto } = await supabase
        .from("v_saldo_parceiro_wallets")
        .select("*");

      if (errorCrypto) throw errorCrypto;

      const cryptoRaw: SaldoCryptoRaw[] = (saldosCrypto || [])
        .filter((s: any) => s.parceiro_id && s.saldo_coin > 0)
        .map((s: any) => ({
          parceiro_id: s.parceiro_id,
          coin: s.coin,
          saldo_coin: Number(s.saldo_coin || 0),
          saldo_usd: Number(s.saldo_usd || 0),
        }));
      setSaldosCryptoRaw(cryptoRaw);

      const saldosMap = new Map<string, SaldoParceiro>();

      saldosFiat?.forEach((saldo) => {
        if (!saldo.parceiro_id) return;
        const current = saldosMap.get(saldo.parceiro_id) || {
          parceiro_id: saldo.parceiro_id,
          saldo_fiat: 0,
          saldo_crypto_usd: 0,
        };
        current.saldo_fiat += Number(saldo.saldo || 0);
        saldosMap.set(saldo.parceiro_id, current);
      });

      saldosCrypto?.forEach((saldo) => {
        if (!saldo.parceiro_id || Number(saldo.saldo_coin) === 0) return;
        const current = saldosMap.get(saldo.parceiro_id) || {
          parceiro_id: saldo.parceiro_id,
          saldo_fiat: 0,
          saldo_crypto_usd: 0,
        };
        current.saldo_crypto_usd += Number(saldo.saldo_usd || 0);
        saldosMap.set(saldo.parceiro_id, current);
      });

      setSaldosData(saldosMap);
    } catch (error: any) {
      console.error("Erro ao carregar saldos:", error);
    }
  };

  const handleDeleteClick = async (id: string) => {
    const roiInfo = roiData.get(id);
    const saldoInfo = saldosData.get(id);
    
    // Calculate total bookmaker balance from multi-currency saldo
    const saldoPorMoeda = roiInfo?.saldo_por_moeda || {};
    const saldoBookmakers = Object.values(saldoPorMoeda).reduce((sum, v) => sum + (v || 0), 0);
    const saldoFiat = saldoInfo?.saldo_fiat || 0;
    const saldoCrypto = saldoInfo?.saldo_crypto_usd || 0;
    const totalSaldo = saldoBookmakers + saldoFiat + saldoCrypto;

    if (totalSaldo > 0) {
      toast({
        title: "Exclusão bloqueada",
        description: `Este parceiro possui saldo pendente. Realize o saque antes de excluir.`,
        variant: "destructive",
      });
      return;
    }

    setParceiroToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!parceiroToDelete) return;

    const roiInfo = roiData.get(parceiroToDelete);
    const saldoInfo = saldosData.get(parceiroToDelete);
    
    // Calculate total bookmaker balance from multi-currency saldo
    const saldoPorMoeda = roiInfo?.saldo_por_moeda || {};
    const saldoBookmakers = Object.values(saldoPorMoeda).reduce((sum, v) => sum + (v || 0), 0);
    const saldoFiat = saldoInfo?.saldo_fiat || 0;
    const saldoCrypto = saldoInfo?.saldo_crypto_usd || 0;
    const totalSaldo = saldoBookmakers + saldoFiat + saldoCrypto;

    if (totalSaldo > 0) {
      toast({
        title: "Exclusão bloqueada",
        description: "Este parceiro possui saldo pendente. Realize o saque antes de excluir.",
        variant: "destructive",
      });
      setDeleteDialogOpen(false);
      setParceiroToDelete(null);
      return;
    }

    try {
      const { error } = await supabase
        .from("parceiros")
        .delete()
        .eq("id", parceiroToDelete);

      if (error) throw error;

      parceiroCache.invalidateCache(parceiroToDelete);

      toast({
        title: "Parceiro excluído",
        description: "O parceiro foi removido com sucesso.",
      });
      fetchParceiros();
      setDeleteDialogOpen(false);
      
      if (selectedParceiroDetalhes === parceiroToDelete) {
        setSelectedParceiroDetalhes(null);
        parceiroCache.selectParceiro(null);
        // Persistência: Limpar localStorage quando parceiro selecionado é deletado
        localStorage.removeItem('last_selected_partner_id');
      }
      setParceiroToDelete(null);
    } catch (error: any) {
      toast({
        title: "Erro ao excluir parceiro",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // OTIMIZAÇÃO: Só recarrega dados quando houve salvamento real
  const handleDialogClose = useCallback((options?: { saved?: boolean }) => {
    const editedParceiroId = editingParceiro?.id;
    setDialogOpen(false);
    setEditingParceiro(null);
    setViewMode(false);
    
    // Só recarrega dados se houve salvamento (evita reload desnecessário em visualização)
    if (options?.saved) {
      fetchParceiros();
      fetchSaldosData();
      if (editedParceiroId) {
        parceiroCache.invalidateCache(editedParceiroId);
      }
    }
  }, [editingParceiro?.id, parceiroCache]);

  const handleVinculoDialogClose = useCallback(() => {
    const parceiroId = vinculoParceiroId || editingBookmaker?.parceiro_id;
    setVinculoDialogOpen(false);
    setVinculoParceiroId(null);
    setVinculoBookmakerId(null);
    setEditingBookmaker(null);
    fetchParceiros();
    if (parceiroId) {
      parceiroCache.invalidateCache(parceiroId);
      // Invalidar cache de bookmakers para atualizar Casas Vinculadas/Disponíveis
      getGlobalBookmakersCache().delete(parceiroId);
    }
    // Incrementar key para forçar refresh da aba bookmakers
    setBookmakerRefreshKey(prev => prev + 1);
  }, [vinculoParceiroId, editingBookmaker?.parceiro_id, parceiroCache]);

  const handleCreateVinculo = useCallback((parceiroId: string, bookmakerCatalogoId: string) => {
    setEditingBookmaker(null);
    setVinculoParceiroId(parceiroId);
    setVinculoBookmakerId(bookmakerCatalogoId);
    setVinculoDialogOpen(true);
  }, []);

  const handleEditVinculo = useCallback(async (bookmakerId: string) => {
    try {
      const { data, error } = await supabase
        .from("bookmakers")
        .select("*")
        .eq("id", bookmakerId)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("Vínculo não encontrado");

      setEditingBookmaker(data);
      setVinculoParceiroId(null);
      setVinculoBookmakerId(null);
      setVinculoDialogOpen(true);
    } catch (error: any) {
      console.error("Erro ao carregar vínculo:", error);
    }
  }, []);

  const handleNewTransacao = useCallback((bookmakerId: string, bookmakerNome: string, moeda: string, saldoAtual: number, saldoUsd: number, tipo: "deposito" | "retirada") => {
    setTransacaoBookmaker({
      id: bookmakerId,
      nome: bookmakerNome,
      saldo_atual: saldoAtual,
      saldo_usd: saldoUsd,
      moeda,
    });
    setTransacaoTipo(tipo === "deposito" ? "DEPOSITO" : "SAQUE");
    setTransacaoEntryPoint("affiliate_deposit");
    setTransacaoDialogOpen(true);
  }, []);

  const handleVinculoCreated = useCallback((context: VinculoCriadoContext) => {
    // Close vinculo dialog and show confirm
    handleVinculoDialogClose();
    setVinculoCriadoContext(context);
    setVinculoCriadoConfirmOpen(true);
  }, [handleVinculoDialogClose]);

  const handleConfirmDeposit = useCallback(() => {
    if (!vinculoCriadoContext) return;
    setVinculoCriadoConfirmOpen(false);
    setTransacaoBookmaker({
      id: vinculoCriadoContext.bookmakerId,
      nome: vinculoCriadoContext.bookmakerNome,
      saldo_atual: 0,
      moeda: vinculoCriadoContext.moeda,
    });
    setTransacaoTipo("DEPOSITO");
    setTransacaoEntryPoint("affiliate_deposit");
    setTransacaoDialogOpen(true);
  }, [vinculoCriadoContext]);

  const handleTransacaoClose = useCallback(() => {
    setTransacaoDialogOpen(false);
    setTransacaoBookmaker(null);
    setTransacaoEntryPoint(undefined);
    if (selectedParceiroDetalhes) {
      parceiroCache.invalidateCache(selectedParceiroDetalhes);
    }
    fetchParceiros();
  }, [selectedParceiroDetalhes, parceiroCache]);

  // ============== MEMOIZED MODAL HANDLERS ==============
  // Estes handlers são memoizados para evitar re-render do ParceiroDetalhesPanel
  // quando o estado do dialog (dialogOpen, viewMode) muda
  
  const handleViewParceiro = useCallback(() => {
    const parceiro = parceiros.find(p => p.id === selectedParceiroDetalhes);
    if (parceiro) {
      setEditingParceiro(parceiro);
      setViewMode(true);
      setDialogOpen(true);
    }
  }, [parceiros, selectedParceiroDetalhes]);

  const handleEditParceiro = useCallback(() => {
    const parceiro = parceiros.find(p => p.id === selectedParceiroDetalhes);
    if (parceiro) {
      setEditingParceiro(parceiro);
      setViewMode(false);
      setDialogOpen(true);
    }
  }, [parceiros, selectedParceiroDetalhes]);

  const handleDeleteParceiroClick = useCallback(() => {
    if (selectedParceiroDetalhes) {
      setParceiroToDelete(selectedParceiroDetalhes);
      setDeleteDialogOpen(true);
    }
  }, [selectedParceiroDetalhes]);

  // ============== MEMOIZED DERIVED PROPS ==============
  // Evita recriação de objetos/valores a cada render do parent
  
  const handleToggleSensitiveData = useCallback(() => {
    setShowSensitiveData(prev => !prev);
  }, []);

  const currentParceiroStatus = useMemo(() => {
    return parceiros.find(p => p.id === selectedParceiroDetalhes)?.status;
  }, [parceiros, selectedParceiroDetalhes]);

  const currentHasParceria = useMemo(() => {
    return parceriasData.has(selectedParceiroDetalhes || '');
  }, [parceriasData, selectedParceiroDetalhes]);

  const currentDiasRestantes = useMemo(() => {
    return parceriasData.get(selectedParceiroDetalhes || '')?.dias_restantes ?? null;
  }, [parceriasData, selectedParceiroDetalhes]);

  // Persistência: Restaura último parceiro selecionado ou fallback para primeiro
  useEffect(() => {
    if (parceiros.length === 0) return;
    
    // Se já temos um parceiro selecionado que existe na lista, mantém
    if (selectedParceiroDetalhes) {
      const parceiroExiste = parceiros.some(p => p.id === selectedParceiroDetalhes);
      if (parceiroExiste) {
        // Parceiro existe, apenas garantir que o cache está sincronizado
        parceiroCache.selectParceiro(selectedParceiroDetalhes);
        return;
      }
      // Parceiro não existe mais, limpar localStorage
      localStorage.removeItem('last_selected_partner_id');
    }
    
    // Fallback: seleciona o primeiro da lista
    const firstParceiroId = parceiros[0].id;
    setSelectedParceiroDetalhes(firstParceiroId);
    parceiroCache.selectParceiro(firstParceiroId);
    localStorage.setItem('last_selected_partner_id', firstParceiroId);
  }, [parceiros, selectedParceiroDetalhes, parceiroCache.selectParceiro]);

  // Prepare data for sidebar with multi-currency support
  const parceirosParaSidebar = useMemo(() => {
    return parceiros.map(p => {
      const roi = roiData.get(p.id);
      return {
        id: p.id,
        nome: p.nome,
        cpf: p.cpf,
        status: p.status,
        created_at: p.created_at,
        resultado_por_moeda: roi?.resultado_por_moeda || createEmptySaldos(),
        moedas_utilizadas: roi?.moedas_utilizadas || [],
        has_parceria: parceriasData.has(p.id),
      };
    });
  }, [parceiros, roiData, parceriasData]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  /*
   * ARQUITETURA CONTAINER-FIRST
   * 
   * PageRoot (h-full = 100% da viewport disponível)
   * ├─ PageHeader (shrink-0 = altura fixa)
   * └─ PageBody (flex-1 = preenche espaço restante)
   *     ├─ SidebarParceiros (w-fixo, scroll próprio)
   *     └─ MainPanel (flex-1, organiza header + tabs + viewport)
   */
  return (
    <TooltipProvider>
      {/* PageRoot: altura total, flex-col, sem overflow */}
      <div className="h-full flex flex-col bg-background">
        
        {/* PageHeader: altura fixa, nunca comprime */}
        <div className="shrink-0 px-4 pt-6 pb-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <PageHeader
              title="Gestão de Parceiros"
              description="Gerencie seus parceiros e analise performance financeira"
              pagePath="/parceiros"
              pageIcon="Users"
              className="flex-1"
            />
          </div>
        </div>

        {/* PageBody: flex-1 ocupa espaço restante, min-h-0 permite shrink */}
        <div className="flex-1 min-h-0 px-4 pb-6">
          <Card className="h-full border-border bg-gradient-surface overflow-hidden">
            {/* Layout Grid: duas colunas com altura 100% */}
            <div className="h-full grid grid-cols-[340px_1fr] lg:grid-cols-[360px_1fr]">
              
              {/* Sidebar: altura 100%, scroll próprio interno */}
              <ParceiroListaSidebar
                parceiros={parceirosParaSidebar}
                selectedId={selectedParceiroDetalhes}
                onSelect={handleSelectParceiroDetalhes}
                showSensitiveData={showSensitiveData}
                onAddParceiro={() => setDialogOpen(true)}
              />

              {/* MainPanel: altura 100%, gerencia internamente */}
              <ParceiroDetalhesPanel 
                parceiroId={selectedParceiroDetalhes} 
                showSensitiveData={showSensitiveData}
                onToggleSensitiveData={handleToggleSensitiveData}
                onCreateVinculo={handleCreateVinculo}
                onEditVinculo={handleEditVinculo}
                onNewTransacao={handleNewTransacao}
                parceiroStatus={currentParceiroStatus}
                hasParceria={currentHasParceria}
                diasRestantes={currentDiasRestantes}
                onViewParceiro={handleViewParceiro}
                onEditParceiro={handleEditParceiro}
                onDeleteParceiro={handleDeleteParceiroClick}
                parceiroCache={parceiroCache}
                bookmakerRefreshKey={bookmakerRefreshKey}
              />
            </div>
          </Card>
        </div>

        {/* Dialogs */}
        <ParceiroDialog
          open={dialogOpen}
          onClose={handleDialogClose}
          parceiro={editingParceiro}
          viewMode={viewMode}
        />

        <BookmakerDialog
          key={`vinculo-${vinculoDialogOpen}-${editingBookmaker?.id || 'none'}-${vinculoParceiroId || 'none'}-${vinculoBookmakerId || 'none'}`}
          open={vinculoDialogOpen}
          onClose={handleVinculoDialogClose}
          onCreated={handleVinculoCreated}
          bookmaker={editingBookmaker}
          defaultParceiroId={vinculoParceiroId || undefined}
          defaultBookmakerId={vinculoBookmakerId || undefined}
          lockParceiro={!!vinculoParceiroId || !!editingBookmaker}
          lockBookmaker={!!vinculoBookmakerId || !!editingBookmaker}
        />

        <VinculoCriadoConfirmDialog
          open={vinculoCriadoConfirmOpen}
          onOpenChange={setVinculoCriadoConfirmOpen}
          context={vinculoCriadoContext}
          onConfirmDeposit={handleConfirmDeposit}
        />

        {transacaoBookmaker && (
          <CaixaTransacaoDialog
            open={transacaoDialogOpen}
            onClose={handleTransacaoClose}
            onSuccess={handleTransacaoClose}
            defaultTipoTransacao={transacaoTipo}
            defaultOrigemBookmakerId={transacaoTipo === "SAQUE" ? transacaoBookmaker.id : undefined}
            defaultDestinoBookmakerId={transacaoTipo === "DEPOSITO" ? transacaoBookmaker.id : undefined}
            defaultOrigemParceiroId={transacaoTipo === "DEPOSITO" ? selectedParceiroDetalhes || undefined : undefined}
            defaultDestinoParceiroId={transacaoTipo === "SAQUE" ? selectedParceiroDetalhes || undefined : undefined}
            defaultTipoMoeda="FIAT"
            defaultMoeda={transacaoBookmaker.moeda || "BRL"}
            entryPoint={transacaoEntryPoint}
          />
        )}

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Tem certeza que deseja excluir este parceiro?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. Todos os dados associados a este parceiro,
                incluindo contas bancárias e wallets, serão permanentemente removidos.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
