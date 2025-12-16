import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useCotacoes } from "@/hooks/useCotacoes";
import { Plus, Search, Eye, EyeOff, Edit, Trash2, LayoutGrid, List, Users } from "lucide-react";
import { ParceiroStatusIcon } from "@/components/parceiros/ParceiroStatusIcon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  total_depositado: number;
  total_sacado: number;
  lucro_prejuizo: number;
  roi_percentual: number;
  num_bookmakers: number;
  num_bookmakers_limitadas: number;
  saldo_bookmakers: number;
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
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [showSensitiveData, setShowSensitiveData] = useState(true);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingParceiro, setEditingParceiro] = useState<Parceiro | null>(null);
  const [viewMode, setViewMode] = useState(false);
  const [viewType, setViewType] = useState<"cards" | "list">("cards");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [parceiroToDelete, setParceiroToDelete] = useState<string | null>(null);
  const [vinculoDialogOpen, setVinculoDialogOpen] = useState(false);
  const [vinculoParceiroId, setVinculoParceiroId] = useState<string | null>(null);
  const [vinculoBookmakerId, setVinculoBookmakerId] = useState<string | null>(null);
  const [selectedParceiroDetalhes, setSelectedParceiroDetalhes] = useState<string | null>(null);

  const handleSelectParceiroDetalhes = (id: string) => {
    setSelectedParceiroDetalhes(id);
  };
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: financialData, error: financialError } = await supabase
        .from("cash_ledger")
        .select("*")
        .eq("user_id", user.id)
        .in("tipo_transacao", ["DEPOSITO", "SAQUE"])
        .eq("status", "CONFIRMADO");

      if (financialError) throw financialError;

      const { data: bookmakersData, error: bookmakersError } = await supabase
        .from("bookmakers")
        .select("parceiro_id, saldo_atual, status")
        .eq("user_id", user.id);

      if (bookmakersError) throw bookmakersError;

      const roiMap = new Map<string, ParceiroROI>();
      
      const parceiroFinancials = new Map<string, { depositado: number; sacado: number }>();
      
      financialData?.forEach((tx) => {
        if (tx.tipo_transacao === "DEPOSITO" && tx.origem_parceiro_id) {
          const current = parceiroFinancials.get(tx.origem_parceiro_id) || { depositado: 0, sacado: 0 };
          current.depositado += Number(tx.valor);
          parceiroFinancials.set(tx.origem_parceiro_id, current);
        } else if (tx.tipo_transacao === "SAQUE" && tx.destino_parceiro_id) {
          const current = parceiroFinancials.get(tx.destino_parceiro_id) || { depositado: 0, sacado: 0 };
          current.sacado += Number(tx.valor);
          parceiroFinancials.set(tx.destino_parceiro_id, current);
        }
      });

      const parceiroBookmakers = new Map<string, { count: number; countLimitadas: number; saldo: number }>();
      
      bookmakersData?.forEach((bm) => {
        if (!bm.parceiro_id) return;
        const current = parceiroBookmakers.get(bm.parceiro_id) || { count: 0, countLimitadas: 0, saldo: 0 };
        if (bm.status === "ativo") {
          current.count += 1;
        } else if (bm.status === "limitada") {
          current.countLimitadas += 1;
        }
        current.saldo += Number(bm.saldo_atual);
        parceiroBookmakers.set(bm.parceiro_id, current);
      });

      parceiroFinancials.forEach((financials, parceiroId) => {
        const bookmakerInfo = parceiroBookmakers.get(parceiroId) || { count: 0, countLimitadas: 0, saldo: 0 };
        
        const lucro = financials.sacado + bookmakerInfo.saldo - financials.depositado;
        const roi = financials.depositado > 0 ? (lucro / financials.depositado) * 100 : 0;
        
        roiMap.set(parceiroId, {
          parceiro_id: parceiroId,
          total_depositado: financials.depositado,
          total_sacado: financials.sacado,
          lucro_prejuizo: lucro,
          roi_percentual: roi,
          num_bookmakers: bookmakerInfo.count,
          num_bookmakers_limitadas: bookmakerInfo.countLimitadas,
          saldo_bookmakers: bookmakerInfo.saldo,
        });
      });

      parceiroBookmakers.forEach((bookmakerInfo, parceiroId) => {
        if (!roiMap.has(parceiroId)) {
          roiMap.set(parceiroId, {
            parceiro_id: parceiroId,
            total_depositado: 0,
            total_sacado: 0,
            lucro_prejuizo: bookmakerInfo.saldo,
            roi_percentual: 0,
            num_bookmakers: bookmakerInfo.count,
            num_bookmakers_limitadas: bookmakerInfo.countLimitadas,
            saldo_bookmakers: bookmakerInfo.saldo,
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: parcerias, error } = await supabase
        .from("parcerias")
        .select("id, parceiro_id, data_fim_prevista, custo_aquisicao_isento, valor_parceiro")
        .eq("user_id", user.id)
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: saldosFiat, error: errorFiat } = await supabase
        .from("v_saldo_parceiro_contas")
        .select("*")
        .eq("user_id", user.id);

      if (errorFiat) throw errorFiat;

      const { data: saldosCrypto, error: errorCrypto } = await supabase
        .from("v_saldo_parceiro_wallets")
        .select("*")
        .eq("user_id", user.id);

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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const handleDeleteClick = async (id: string) => {
    const roiInfo = roiData.get(id);
    const saldoInfo = saldosData.get(id);
    
    const saldoBookmakers = roiInfo?.saldo_bookmakers || 0;
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
    
    const saldoBookmakers = roiInfo?.saldo_bookmakers || 0;
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

      toast({
        title: "Parceiro excluído",
        description: "O parceiro foi removido com sucesso.",
      });
      fetchParceiros();
      setDeleteDialogOpen(false);
      setParceiroToDelete(null);
    } catch (error: any) {
      toast({
        title: "Erro ao excluir parceiro",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleEdit = (parceiro: Parceiro) => {
    setEditingParceiro(parceiro);
    setViewMode(false);
    setDialogOpen(true);
  };

  const handleView = (parceiro: Parceiro) => {
    setEditingParceiro(parceiro);
    setViewMode(true);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingParceiro(null);
    setViewMode(false);
    fetchParceiros();
    fetchSaldosData();
  };

  const handleVinculoDialogClose = () => {
    setVinculoDialogOpen(false);
    setVinculoParceiroId(null);
    setVinculoBookmakerId(null);
    fetchParceiros();
  };

  const handleCreateVinculo = (parceiroId: string, bookmakerCatalogoId: string) => {
    setVinculoParceiroId(parceiroId);
    setVinculoBookmakerId(bookmakerCatalogoId);
    setVinculoDialogOpen(true);
  };

  const maskCPF = (cpf: string) => {
    if (showSensitiveData) return formatCPF(cpf);
    return maskCPFPartial(cpf);
  };

  const maskCurrency = (value: number) => {
    if (showSensitiveData) return formatCurrency(value);
    return "R$ ••••";
  };

  const filteredParceiros = parceiros.filter((parceiro) => {
    const matchesSearch =
      parceiro.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      parceiro.cpf.includes(searchTerm);
    const matchesStatus =
      statusFilter === "todos" || parceiro.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Auto-select first partner when list loads and none is selected
  useEffect(() => {
    if (!selectedParceiroDetalhes && parceiros.length > 0) {
      setSelectedParceiroDetalhes(parceiros[0].id);
    }
  }, [parceiros]);

  // Prepare data for sidebar
  const parceirosParaSidebar = useMemo(() => {
    return parceiros.map(p => ({
      id: p.id,
      nome: p.nome,
      cpf: p.cpf,
      status: p.status,
      lucro_prejuizo: roiData.get(p.id)?.lucro_prejuizo || 0,
      has_parceria: parceriasData.has(p.id),
    }));
  }, [parceiros, roiData, parceriasData]);

  const stats = {
    total: parceiros.length,
    ativos: parceiros.filter((p) => p.status === "ativo").length,
    inativos: parceiros.filter((p) => p.status === "inativo").length,
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Gestão de Parceiros</h1>
              <p className="text-sm text-muted-foreground">
                Gerencie seus parceiros e analise performance financeira
              </p>
            </div>
          </div>

          {/* Partner Details Layout */}
          <Card className="border-border bg-gradient-surface overflow-hidden">
            <div className="grid grid-cols-[340px_1fr] lg:grid-cols-[360px_1fr] h-[calc(100vh-240px)] min-h-[480px]">
              {/* Painel Esquerdo - Lista de Parceiros */}
              <ParceiroListaSidebar
                parceiros={parceirosParaSidebar}
                selectedId={selectedParceiroDetalhes}
                onSelect={handleSelectParceiroDetalhes}
                showSensitiveData={showSensitiveData}
                onAddParceiro={() => setDialogOpen(true)}
              />

              {/* Painel Direito - Detalhes */}
              <ParceiroDetalhesPanel 
                parceiroId={selectedParceiroDetalhes} 
                showSensitiveData={showSensitiveData}
                onToggleSensitiveData={() => setShowSensitiveData(!showSensitiveData)}
                onCreateVinculo={handleCreateVinculo}
                parceiroStatus={parceiros.find(p => p.id === selectedParceiroDetalhes)?.status}
                hasParceria={parceriasData.has(selectedParceiroDetalhes || '')}
                diasRestantes={parceriasData.get(selectedParceiroDetalhes || '')?.dias_restantes ?? null}
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
              />
            </div>
          </Card>
        </div>

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
