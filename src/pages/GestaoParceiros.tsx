import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useCotacoes } from "@/hooks/useCotacoes";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Eye, EyeOff, Edit, Trash2, LayoutGrid, List, Users, UserSearch } from "lucide-react";
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
  const [showSensitiveData, setShowSensitiveData] = useState(false);
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
  const [activeTab, setActiveTab] = useState("parceiros");

  // Reset sensitive data visibility when changing tab or partner
  const handleTabChange = (newTab: string) => {
    setShowSensitiveData(false);
    setActiveTab(newTab);
  };

  const handleSelectParceiroDetalhes = (id: string) => {
    setShowSensitiveData(false);
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

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="parceiros" className="gap-2">
                <Users className="h-4 w-4" />
                Parceiros
              </TabsTrigger>
              <TabsTrigger value="detalhes" className="gap-2">
                <UserSearch className="h-4 w-4" />
                Detalhes
              </TabsTrigger>
            </TabsList>

            {/* Tab: Parceiros (Visão Geral) */}
            <TabsContent value="parceiros" className="space-y-6">

              {/* Toolbar */}
              <Card className="border-border bg-gradient-surface">
                <CardContent className="pt-6">
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                      <Input
                        placeholder="Buscar por nome ou CPF..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos os status</SelectItem>
                        <SelectItem value="ativo">Ativos</SelectItem>
                        <SelectItem value="inativo">Inativos</SelectItem>
                      </SelectContent>
                    </Select>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setShowSensitiveData(!showSensitiveData)}
                          className="shrink-0"
                        >
                          {showSensitiveData ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Visualizar dados sensíveis</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setViewType(viewType === "cards" ? "list" : "cards")}
                        >
                          {viewType === "cards" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{viewType === "cards" ? "Visualizar como lista" : "Visualizar como cards"}</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          onClick={() => setDialogOpen(true)}
                          className="shrink-0"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Novo Parceiro</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </CardContent>
              </Card>

              {/* Parceiros View */}
              {filteredParceiros.length === 0 ? (
                <Card className="border-border bg-gradient-surface">
                  <CardContent className="py-12 text-center">
                    <Users className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
                    <p className="text-muted-foreground">
                      Nenhum parceiro encontrado. Clique em "+" para adicionar.
                    </p>
                  </CardContent>
                </Card>
              ) : viewType === "cards" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredParceiros.map((parceiro) => {
                    const roi = roiData.get(parceiro.id);
                    return (
                      <Card 
                        key={parceiro.id} 
                        className={`border-border bg-gradient-surface hover:shadow-lg transition-all relative ${
                          parceiro.status === "inativo" ? "opacity-70" : ""
                        }`}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex justify-between items-start gap-3">
                            <div 
                              className="flex items-center gap-3 flex-1 cursor-pointer group"
                              onClick={() => handleView(parceiro)}
                            >
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                                parceiro.status === "inativo"
                                  ? "bg-warning/10 border-warning/30 group-hover:border-warning/60"
                                  : "bg-primary/10 border-primary/30 group-hover:border-primary/60"
                              }`}>
                                <span className={`text-sm font-bold ${
                                  parceiro.status === "inativo" ? "text-warning" : "text-primary"
                                }`}>
                                  {parceiro.nome.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <CardTitle className="text-base group-hover:text-primary transition-colors truncate">
                                  {parceiro.nome}
                                </CardTitle>
                                <p className="text-xs text-muted-foreground font-mono">
                                  {maskCPF(parceiro.cpf)}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={parceiro.status === "ativo" ? "default" : "secondary"}
                                className={parceiro.status === "inativo" ? "bg-warning/20 text-warning border-warning/30" : ""}
                              >
                                {parceiro.status}
                              </Badge>
                              {parceriasData.has(parceiro.id) && (
                                <ParceiroStatusIcon
                                  diasRestantes={parceriasData.get(parceiro.id)!.dias_restantes}
                                  pagamentoRealizado={parceriasData.get(parceiro.id)!.pagamento_parceiro_realizado}
                                />
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          {/* Lucro/Prejuízo - Sem ROI */}
                          {roi && (
                            <div 
                              className="py-3 px-4 -mx-4 mb-4 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={() => {
                                setSelectedParceiroDetalhes(parceiro.id);
                                setActiveTab("detalhes");
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">Lucro/Prejuízo</span>
                                <span className={`text-lg font-bold ${
                                  showSensitiveData 
                                    ? (roi.lucro_prejuizo >= 0 ? "text-success" : "text-destructive")
                                    : "text-muted-foreground"
                                }`}>
                                  {maskCurrency(roi.lucro_prejuizo)}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground text-center mt-1">
                                Clique para ver detalhes
                              </p>
                            </div>
                          )}

                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => handleEdit(parceiro)}
                            >
                              <Edit className="mr-1 h-3.5 w-3.5" />
                              Editar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDeleteClick(parceiro.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <Card className="border-border bg-gradient-surface">
                  <CardContent className="p-0">
                    <div className="divide-y divide-border">
                      {filteredParceiros.map((parceiro) => {
                        const roi = roiData.get(parceiro.id);
                        return (
                          <div 
                            key={parceiro.id} 
                            className={`p-4 transition-colors ${
                              parceiro.status === "inativo" 
                                ? "bg-warning/5 hover:bg-warning/10" 
                                : "hover:bg-muted/30"
                            }`}
                          >
                            <div className="flex items-center gap-4">
                              <div 
                                className="flex-1 cursor-pointer"
                                onClick={() => handleView(parceiro)}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 ${
                                    parceiro.status === "inativo"
                                      ? "bg-warning/10 border-warning/30"
                                      : "bg-primary/10 border-primary/30"
                                  }`}>
                                    <span className={`text-xs font-bold ${
                                      parceiro.status === "inativo" ? "text-warning" : "text-primary"
                                    }`}>
                                      {parceiro.nome.charAt(0).toUpperCase()}
                                    </span>
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <h3 className="font-medium">{parceiro.nome}</h3>
                                      <Badge 
                                        variant={parceiro.status === "ativo" ? "default" : "secondary"} 
                                        className={`text-xs ${parceiro.status === "inativo" ? "bg-warning/20 text-warning border-warning/30" : ""}`}
                                      >
                                        {parceiro.status}
                                      </Badge>
                                      {parceriasData.has(parceiro.id) && (
                                        <ParceiroStatusIcon
                                          diasRestantes={parceriasData.get(parceiro.id)!.dias_restantes}
                                          pagamentoRealizado={parceriasData.get(parceiro.id)!.pagamento_parceiro_realizado}
                                        />
                                      )}
                                    </div>
                                    <p className="text-xs text-muted-foreground font-mono">
                                      {maskCPF(parceiro.cpf)}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {/* Lucro sem ROI */}
                              {roi && (
                                <div 
                                  className="px-4 py-2 bg-muted/30 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                                  onClick={() => {
                                    setSelectedParceiroDetalhes(parceiro.id);
                                    setActiveTab("detalhes");
                                  }}
                                >
                                  <div className={`font-bold ${
                                    showSensitiveData 
                                      ? (roi.lucro_prejuizo >= 0 ? "text-success" : "text-destructive")
                                      : "text-muted-foreground"
                                  }`}>
                                    {maskCurrency(roi.lucro_prejuizo)}
                                  </div>
                                  <div className="text-xs text-muted-foreground">Lucro/Prejuízo</div>
                                </div>
                              )}

                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEdit(parceiro)}
                                >
                                  <Edit className="mr-1 h-3.5 w-3.5" />
                                  Editar
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteClick(parceiro.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Tab: Detalhes do Parceiro */}
            <TabsContent value="detalhes" className="space-y-0">
              <Card className="border-border bg-gradient-surface overflow-hidden">
                <div className="grid grid-cols-[240px_1fr] h-[calc(100vh-240px)] min-h-[480px]">
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
                  />
                </div>
              </Card>
            </TabsContent>
          </Tabs>
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
