import { useState, useEffect, useMemo, useCallback } from "react";
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
import { ParceiroListaSidebar } from "@/components/parceiros/ParceiroListaSidebar";
import { ParceiroDetalhesPanel } from "@/components/parceiros/ParceiroDetalhesPanel";
import { formatCPF, maskCPFPartial } from "@/lib/validators";
import { useParceiroFinanceiroCache } from "@/hooks/useParceiroFinanceiroCache";
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
  const [vinculoParceiroId, setVinculoParceiroId] = useState<string | null>(null);
  const [vinculoBookmakerId, setVinculoBookmakerId] = useState<string | null>(null);
  const [selectedParceiroDetalhes, setSelectedParceiroDetalhes] = useState<string | null>(null);

  const parceiroCache = useParceiroFinanceiroCache();

  const handleSelectParceiroDetalhes = useCallback((id: string) => {
    setSelectedParceiroDetalhes(id);
    parceiroCache.selectParceiro(id);
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

  useEffect(() => {
    checkAuth();
    fetchParceiros();
    fetchParceriasStatus();
  }, []);

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
      const { data: financialData, error: financialError } = await supabase
        .from("cash_ledger")
        .select("*")
        .in("tipo_transacao", ["DEPOSITO", "SAQUE"])
        .eq("status", "CONFIRMADO");

      if (financialError) throw financialError;

      const { data: bookmakersData, error: bookmakersError } = await supabase
        .from("bookmakers")
        .select("parceiro_id, saldo_atual, saldo_usd, moeda, status");

      if (bookmakersError) throw bookmakersError;

      const roiMap = new Map<string, ParceiroROI>();
      
      // Multi-currency financial aggregation
      const parceiroFinancials = new Map<string, { 
        depositado: SaldosPorMoeda; 
        sacado: SaldosPorMoeda;
      }>();
      
      financialData?.forEach((tx) => {
        // Determine execution currency based on 3-layer model
        let moedaExec: string;
        if (tx.tipo_moeda === "CRYPTO") {
          moedaExec = "USD"; // Crypto transactions are treated as USD
        } else if (tx.moeda_destino && tx.tipo_transacao === "DEPOSITO") {
          moedaExec = tx.moeda_destino;
        } else if (tx.moeda_origem && tx.tipo_transacao === "SAQUE") {
          moedaExec = tx.moeda_origem;
        } else {
          moedaExec = tx.moeda || "BRL";
        }
        
        // Use execution layer values when available
        const valorExec = Number(tx.valor_destino) || Number(tx.valor_origem) || Number(tx.valor) || 0;
        
        if (tx.tipo_transacao === "DEPOSITO" && tx.origem_parceiro_id) {
          const current = parceiroFinancials.get(tx.origem_parceiro_id) || { 
            depositado: createEmptySaldos(), 
            sacado: createEmptySaldos() 
          };
          current.depositado[moedaExec] = (current.depositado[moedaExec] || 0) + valorExec;
          parceiroFinancials.set(tx.origem_parceiro_id, current);
        } else if (tx.tipo_transacao === "SAQUE" && tx.destino_parceiro_id) {
          const current = parceiroFinancials.get(tx.destino_parceiro_id) || { 
            depositado: createEmptySaldos(), 
            sacado: createEmptySaldos() 
          };
          current.sacado[moedaExec] = (current.sacado[moedaExec] || 0) + valorExec;
          parceiroFinancials.set(tx.destino_parceiro_id, current);
        }
      });

      // Aggregate bookmaker balances by currency
      const parceiroBookmakers = new Map<string, { 
        count: number; 
        countLimitadas: number; 
        saldo: SaldosPorMoeda;
      }>();
      
      bookmakersData?.forEach((bm) => {
        if (!bm.parceiro_id) return;
        const current = parceiroBookmakers.get(bm.parceiro_id) || { 
          count: 0, 
          countLimitadas: 0, 
          saldo: createEmptySaldos() 
        };
        if (bm.status === "ativo") {
          current.count += 1;
        } else if (bm.status === "limitada") {
          current.countLimitadas += 1;
        }
        
        // Use bookmaker's native currency for balance
        const moedaNativa = bm.moeda || "BRL";
        const saldoNativo = Number(bm.saldo_atual) || 0;
        current.saldo[moedaNativa] = (current.saldo[moedaNativa] || 0) + saldoNativo;
        
        parceiroBookmakers.set(bm.parceiro_id, current);
      });

      // Calculate ROI per partner using multi-currency formula
      parceiroFinancials.forEach((financials, parceiroId) => {
        const bookmakerInfo = parceiroBookmakers.get(parceiroId) || { 
          count: 0, 
          countLimitadas: 0, 
          saldo: createEmptySaldos() 
        };
        
        // Calculate resultado per currency: Sacado + Saldo - Depositado
        const resultadoPorMoeda = createEmptySaldos();
        const moedasUtilizadas: string[] = [];
        
        SUPPORTED_FIAT.forEach(moeda => {
          const sacado = financials.sacado[moeda] || 0;
          const saldo = bookmakerInfo.saldo[moeda] || 0;
          const depositado = financials.depositado[moeda] || 0;
          resultadoPorMoeda[moeda] = sacado + saldo - depositado;
          
          if (sacado !== 0 || saldo !== 0 || depositado !== 0) {
            moedasUtilizadas.push(moeda);
          }
        });
        
        // ROI calculation (using BRL as base for simplicity, with fallback)
        const depositadoBRL = financials.depositado["BRL"] || 0;
        const resultadoBRL = resultadoPorMoeda["BRL"] || 0;
        const roi = depositadoBRL > 0 ? (resultadoBRL / depositadoBRL) * 100 : 0;
        
        roiMap.set(parceiroId, {
          parceiro_id: parceiroId,
          depositado_por_moeda: financials.depositado,
          sacado_por_moeda: financials.sacado,
          saldo_por_moeda: bookmakerInfo.saldo,
          resultado_por_moeda: resultadoPorMoeda,
          moedas_utilizadas: moedasUtilizadas,
          roi_percentual: roi,
          num_bookmakers: bookmakerInfo.count,
          num_bookmakers_limitadas: bookmakerInfo.countLimitadas,
        });
      });

      // Add partners with only bookmakers (no transactions)
      parceiroBookmakers.forEach((bookmakerInfo, parceiroId) => {
        if (!roiMap.has(parceiroId)) {
          const moedasUtilizadas = SUPPORTED_FIAT.filter(m => (bookmakerInfo.saldo[m] || 0) !== 0);
          
          roiMap.set(parceiroId, {
            parceiro_id: parceiroId,
            depositado_por_moeda: createEmptySaldos(),
            sacado_por_moeda: createEmptySaldos(),
            saldo_por_moeda: bookmakerInfo.saldo,
            resultado_por_moeda: bookmakerInfo.saldo, // Resultado = saldo when no deposits
            moedas_utilizadas: moedasUtilizadas,
            roi_percentual: 0,
            num_bookmakers: bookmakerInfo.count,
            num_bookmakers_limitadas: bookmakerInfo.countLimitadas,
          });
        }
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

  const handleDialogClose = () => {
    const editedParceiroId = editingParceiro?.id;
    setDialogOpen(false);
    setEditingParceiro(null);
    setViewMode(false);
    fetchParceiros();
    fetchSaldosData();
    if (editedParceiroId) {
      parceiroCache.invalidateCache(editedParceiroId);
    }
  };

  const handleVinculoDialogClose = () => {
    const parceiroId = vinculoParceiroId;
    setVinculoDialogOpen(false);
    setVinculoParceiroId(null);
    setVinculoBookmakerId(null);
    fetchParceiros();
    if (parceiroId) {
      parceiroCache.invalidateCache(parceiroId);
    }
  };

  const handleCreateVinculo = (parceiroId: string, bookmakerCatalogoId: string) => {
    setVinculoParceiroId(parceiroId);
    setVinculoBookmakerId(bookmakerCatalogoId);
    setVinculoDialogOpen(true);
  };

  // Auto-select first partner when list loads and none is selected
  useEffect(() => {
    if (!selectedParceiroDetalhes && parceiros.length > 0) {
      const firstParceiroId = parceiros[0].id;
      setSelectedParceiroDetalhes(firstParceiroId);
      parceiroCache.selectParceiro(firstParceiroId);
    }
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
                onToggleSensitiveData={() => setShowSensitiveData(!showSensitiveData)}
                onCreateVinculo={handleCreateVinculo}
                parceiroStatus={parceiros.find(p => p.id === selectedParceiroDetalhes)?.status}
                hasParceria={parceriasData.has(selectedParceiroDetalhes || '')}
                diasRestantes={parceriasData.get(selectedParceiroDetalhes || '')?.dias_restantes ?? null}
                onViewParceiro={() => {
                  const parceiro = parceiros.find(p => p.id === selectedParceiroDetalhes);
                  if (parceiro) {
                    setEditingParceiro(parceiro);
                    setViewMode(true);
                    setDialogOpen(true);
                  }
                }}
                onEditParceiro={() => {
                  const parceiro = parceiros.find(p => p.id === selectedParceiroDetalhes);
                  if (parceiro) {
                    setEditingParceiro(parceiro);
                    setViewMode(false);
                    setDialogOpen(true);
                  }
                }}
                onDeleteParceiro={() => {
                  if (selectedParceiroDetalhes) {
                    setParceiroToDelete(selectedParceiroDetalhes);
                    setDeleteDialogOpen(true);
                  }
                }}
                parceiroCache={parceiroCache}
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
          key={`vinculo-${vinculoDialogOpen}-${vinculoParceiroId || 'none'}-${vinculoBookmakerId || 'none'}`}
          open={vinculoDialogOpen}
          onClose={handleVinculoDialogClose}
          bookmaker={null}
          defaultParceiroId={vinculoParceiroId || undefined}
          defaultBookmakerId={vinculoBookmakerId || undefined}
          lockParceiro={!!vinculoParceiroId}
          lockBookmaker={!!vinculoBookmakerId}
        />

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
