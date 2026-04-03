import { useState, useEffect, useMemo, useCallback } from "react";
import { useTabWorkspace } from "@/hooks/useTabWorkspace";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useCotacoes } from "@/hooks/useCotacoes";
import { useTopBar } from "@/contexts/TopBarContext";
import { Users } from "lucide-react";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
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
import { useParceirosData, type Parceiro, type ParceiroROI, type SaldoParceiro, type SaldoCryptoRaw, type ParceriaStatus } from "@/hooks/useParceirosData";

// Lista de moedas FIAT suportadas
const SUPPORTED_FIAT: string[] = FIAT_CURRENCIES.map(c => c.value);

// Record dinâmico para saldos por moeda
type SaldosPorMoeda = Record<string, number>;

export default function GestaoParceiros() {
  // ==================== REACT QUERY: Cache + Deduplicação ====================
  const { parceiros, roiData, saldosData: saldosDataBase, saldosCryptoRaw, parceriasData, loading, refetch: refetchParceiros } = useParceirosData();
  
  // Mutable copy of saldosData for crypto price updates
  const [saldosData, setSaldosData] = useState<Map<string, SaldoParceiro>>(new Map());
  
  // Sync saldosData when base data changes
  useEffect(() => {
    setSaldosData(new Map(saldosDataBase));
  }, [saldosDataBase]);
  
  const [showSensitiveData, setShowSensitiveData] = useState(true);
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
  const { setContent: setTopBarContent } = useTopBar();
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
    
    // Start from saldosDataBase (source of truth for fiat), not stale saldosData
    const saldosMap = new Map<string, SaldoParceiro>(saldosDataBase);
    
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
  }, [cryptoPrices, saldosCryptoRaw, saldosDataBase]);

  // Auth check on workspace change
  useEffect(() => {
    if (workspaceId) {
      const checkAuth = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) navigate("/auth");
      };
      checkAuth();
    }
  }, [workspaceId, navigate]);

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
      refetchParceiros();
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
      refetchParceiros();
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
    refetchParceiros();
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
    refetchParceiros();
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
        resultado_por_moeda: roi?.resultado_por_moeda || ({} as Record<string, number>),
        moedas_utilizadas: roi?.moedas_utilizadas || [],
        has_parceria: parceriasData.has(p.id),
      };
    });
  }, [parceiros, roiData, parceriasData]);

  // Inject title into global TopBar
  useEffect(() => {
    setTopBarContent(
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 cursor-default">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <span className="font-semibold text-sm">Gestão de Parceiros ⭐</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Gerencie seus parceiros e analise performance financeira
        </TooltipContent>
      </Tooltip>
    );
    return () => setTopBarContent(null);
  }, [setTopBarContent]);

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
   * └─ PageBody (flex-1 = preenche espaço restante)
   *     ├─ SidebarParceiros (w-fixo, scroll próprio)
   *     └─ MainPanel (flex-1, organiza header + tabs + viewport)
   */

  return (
    <TooltipProvider>
      {/* PageRoot: altura total, flex-col, sem overflow */}
      <div className="h-full flex flex-col bg-background">

        {/* PageBody: flex-1 ocupa espaço restante, min-h-0 permite shrink */}
        <div className="flex-1 min-h-0 px-4 pt-2 pb-4">
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
                onEditParceiro={(id) => {
                  const parceiro = parceiros.find(p => p.id === id);
                  if (parceiro) {
                    setEditingParceiro(parceiro);
                    setViewMode(false);
                    setDialogOpen(true);
                  }
                }}
                onDeposito={(id) => {
                  handleSelectParceiroDetalhes(id);
                  setTransacaoBookmaker(null);
                  setTransacaoTipo("DEPOSITO");
                  setTransacaoEntryPoint("affiliate_deposit");
                  setTransacaoDialogOpen(true);
                }}
                onSaque={(id) => {
                  handleSelectParceiroDetalhes(id);
                  setTransacaoBookmaker(null);
                  setTransacaoTipo("SAQUE");
                  setTransacaoEntryPoint("affiliate_deposit");
                  setTransacaoDialogOpen(true);
                }}
                onTransferencia={(id) => {
                  handleSelectParceiroDetalhes(id);
                  setTransacaoBookmaker(null);
                  setTransacaoTipo("TRANSFERENCIA");
                  setTransacaoEntryPoint("affiliate_deposit");
                  setTransacaoDialogOpen(true);
                }}
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
                saldoBanco={selectedParceiroDetalhes ? (saldosData.get(selectedParceiroDetalhes)?.saldo_fiat ?? 0) : 0}
                saldoCrypto={selectedParceiroDetalhes ? (saldosData.get(selectedParceiroDetalhes)?.saldo_crypto_usd ?? 0) : 0}
              />
            </div>
          </Card>
        </div>

        {/* Dialogs */}
        {dialogOpen && (
          <ParceiroDialog
            open={dialogOpen}
            onClose={handleDialogClose}
            parceiro={editingParceiro}
            viewMode={viewMode}
          />
        )}

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

        {transacaoDialogOpen && (
          <CaixaTransacaoDialog
            open={transacaoDialogOpen}
            onClose={handleTransacaoClose}
            onSuccess={handleTransacaoClose}
            defaultTipoTransacao={transacaoTipo}
            defaultOrigemBookmakerId={transacaoBookmaker && transacaoTipo === "SAQUE" ? transacaoBookmaker.id : undefined}
            defaultDestinoBookmakerId={transacaoBookmaker && transacaoTipo === "DEPOSITO" ? transacaoBookmaker.id : undefined}
            defaultOrigemParceiroId={transacaoTipo === "DEPOSITO" ? selectedParceiroDetalhes || undefined : undefined}
            defaultDestinoParceiroId={transacaoTipo === "SAQUE" ? selectedParceiroDetalhes || undefined : undefined}
            defaultTipoMoeda="FIAT"
            defaultMoeda={transacaoBookmaker?.moeda || "BRL"}
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
