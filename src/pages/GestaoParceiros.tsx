import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, LogOut, Eye, EyeOff, Edit, Trash2, LayoutGrid, List, FileText, Copy } from "lucide-react";
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
import ParceiroFinanceiroDialog from "@/components/parceiros/ParceiroFinanceiroDialog";
import BookmakerDialog from "@/components/bookmakers/BookmakerDialog";
import { formatCPF, maskCPFPartial, maskEmail } from "@/lib/validators";

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

export default function GestaoParceiros() {
  const [parceiros, setParceiros] = useState<Parceiro[]>([]);
  const [roiData, setRoiData] = useState<Map<string, ParceiroROI>>(new Map());
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [showCPF, setShowCPF] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingParceiro, setEditingParceiro] = useState<Parceiro | null>(null);
  const [viewMode, setViewMode] = useState(false);
  const [viewType, setViewType] = useState<"cards" | "list">("cards");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [parceiroToDelete, setParceiroToDelete] = useState<string | null>(null);
  const [financeiroDialogOpen, setFinanceiroDialogOpen] = useState(false);
  const [selectedParceiroFinanceiro, setSelectedParceiroFinanceiro] = useState<{
    id: string;
    nome: string;
  } | null>(null);
  const [vinculoDialogOpen, setVinculoDialogOpen] = useState(false);
  const [preselectedVinculo, setPreselectedVinculo] = useState<{
    parceiroId: string;
    bookmakerId: string;
  } | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkAuth();
    fetchParceiros();
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
      
      // Fetch ROI data after fetching partners
      await fetchROIData();
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

      // Fetch financial data from cash_ledger
      const { data: financialData, error: financialError } = await supabase
        .from("cash_ledger")
        .select("*")
        .eq("user_id", user.id)
        .in("tipo_transacao", ["DEPOSITO", "SAQUE"])
        .eq("status", "CONFIRMADO");

      if (financialError) throw financialError;

      // Fetch bookmaker counts and balances
      const { data: bookmakersData, error: bookmakersError } = await supabase
        .from("bookmakers")
        .select("parceiro_id, saldo_atual, status")
        .eq("user_id", user.id);

      if (bookmakersError) throw bookmakersError;

      // Calculate ROI per partner
      const roiMap = new Map<string, ParceiroROI>();
      
      // Process financial transactions
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

      // Process bookmaker data
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

      // Combine all data
      parceiroFinancials.forEach((financials, parceiroId) => {
        const bookmakerInfo = parceiroBookmakers.get(parceiroId) || { count: 0, countLimitadas: 0, saldo: 0 };
        const lucro = financials.sacado - financials.depositado;
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

      // Add partners with bookmakers but no transactions
      parceiroBookmakers.forEach((bookmakerInfo, parceiroId) => {
        if (!roiMap.has(parceiroId)) {
          roiMap.set(parceiroId, {
            parceiro_id: parceiroId,
            total_depositado: 0,
            total_sacado: 0,
            lucro_prejuizo: 0,
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleDeleteClick = (id: string) => {
    setParceiroToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!parceiroToDelete) return;

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
  };

  const handleOpenFinanceiro = (parceiro: Parceiro) => {
    setSelectedParceiroFinanceiro({
      id: parceiro.id,
      nome: parceiro.nome,
    });
    setFinanceiroDialogOpen(true);
  };

  const handleCreateVinculo = (parceiroId: string, bookmakerId: string) => {
    setPreselectedVinculo({ parceiroId, bookmakerId });
    setVinculoDialogOpen(true);
  };

  const handleVinculoDialogClose = () => {
    setVinculoDialogOpen(false);
    setPreselectedVinculo(null);
    fetchParceiros(); // Refresh to update bookmaker counts
  };

  const maskCPF = (cpf: string) => {
    if (showCPF) return formatCPF(cpf);
    return maskCPFPartial(cpf);
  };

  const filteredParceiros = parceiros.filter((parceiro) => {
    const matchesSearch =
      parceiro.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      parceiro.cpf.includes(searchTerm);
    const matchesStatus =
      statusFilter === "todos" || parceiro.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

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
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-4xl font-bold">Gestão de Parceiros</h1>
              <p className="text-muted-foreground mt-2">
                Gerencie seus parceiros, contas bancárias e wallets crypto
              </p>
            </div>
            <Button onClick={handleLogout} variant="outline">
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total de Parceiros
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Ativos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{stats.ativos}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Inativos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600">{stats.inativos}</div>
            </CardContent>
          </Card>
        </div>

        {/* Toolbar */}
        <Card className="mb-6">
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
                     onClick={() => setShowCPF(!showCPF)}
                     className="shrink-0"
                   >
                     {showCPF ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                Nenhum parceiro encontrado. Clique em "Novo Parceiro" para adicionar.
              </p>
            </CardContent>
          </Card>
        ) : viewType === "cards" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredParceiros.map((parceiro) => (
              <Card 
                key={parceiro.id} 
                className={`hover:shadow-lg transition-shadow relative ${
                  parceiro.status === "inativo" ? "bg-warning/10 border-warning/30" : ""
                }`}
              >
                <CardHeader>
                  <div className="flex justify-between items-start gap-3">
                    <div 
                      className="flex items-center gap-3 flex-1 cursor-pointer group"
                      onClick={() => handleView(parceiro)}
                      title="Clique para ver detalhes completos"
                    >
                      <div className={`relative w-12 h-12 rounded-full flex items-center justify-center overflow-hidden border-2 transition-all ${
                        parceiro.status === "inativo"
                          ? "bg-gradient-to-br from-warning/20 to-warning/5 border-warning/30 group-hover:border-warning/60"
                          : "bg-gradient-to-br from-primary/20 to-primary/5 border-primary/30 group-hover:border-primary/60"
                      }`}>
                        <span className={`text-lg font-bold ${
                          parceiro.status === "inativo" ? "text-warning" : "text-primary"
                        }`}>
                          {parceiro.nome.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1">
                        <CardTitle className="text-base group-hover:text-primary transition-colors">{parceiro.nome}</CardTitle>
                        {parceiro.email && (
                          <p className="text-sm text-muted-foreground mt-1">
                            <span className="font-medium">Email:</span> {showCPF ? parceiro.email : maskEmail(parceiro.email)}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground mt-0.5 font-mono">
                          <span className="font-medium">CPF:</span> {maskCPF(parceiro.cpf)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Badge
                        variant={parceiro.status === "ativo" ? "default" : "secondary"}
                        className={parceiro.status === "inativo" ? "bg-warning/20 text-warning border-warning/30" : ""}
                      >
                        {parceiro.status.toUpperCase()}
                      </Badge>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleOpenFinanceiro(parceiro)}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Ver informações completas</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm pt-2 border-t mt-2">
                    {/* Contas Bancárias */}
                    {parceiro.contas_bancarias && parceiro.contas_bancarias.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">Contas Bancárias</p>
                        <div className="space-y-1.5">
                          {parceiro.contas_bancarias.map((conta: any) => (
                            <div key={conta.id} className="flex items-center justify-between text-xs bg-accent/30 rounded p-2">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{conta.banco} - {conta.titular}</p>
                                {conta.pix_key && (
                                  <p className="text-[10px] text-muted-foreground font-mono truncate">
                                    PIX: {conta.pix_key}
                                  </p>
                                )}
                              </div>
                              {conta.pix_key && (
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(conta.pix_key);
                                    toast({ title: "PIX copiado!" });
                                  }}
                                  className="ml-2 p-1 hover:bg-accent rounded transition-colors"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Wallets Crypto */}
                    {parceiro.wallets_crypto && parceiro.wallets_crypto.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">Wallets Crypto</p>
                        <div className="space-y-1.5">
                          {parceiro.wallets_crypto.map((wallet: any) => (
                            <div key={wallet.id} className="flex items-center justify-between text-xs bg-accent/30 rounded p-2">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{wallet.exchange || wallet.network}</p>
                                <p className="text-[10px] text-muted-foreground font-mono truncate">
                                  {wallet.endereco.slice(0, 8)}...{wallet.endereco.slice(-8)}
                                </p>
                              </div>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(wallet.endereco);
                                  toast({ title: "Endereço copiado!" });
                                }}
                                className="ml-2 p-1 hover:bg-accent rounded transition-colors"
                              >
                                <Copy className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Bookmakers */}
                    {roiData.has(parceiro.id) && (
                      <p className="text-muted-foreground">
                        <span className="font-medium">Bookmakers:</span>{" "}
                        {(roiData.get(parceiro.id)?.num_bookmakers || 0) + (roiData.get(parceiro.id)?.num_bookmakers_limitadas || 0)}
                      </p>
                    )}
                  </div>
                  {roiData.has(parceiro.id) && (
                    <div className="pt-3 border-t mt-3">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Lucro/Prejuízo</p>
                        <p className={`text-lg font-bold ${
                          roiData.get(parceiro.id)!.lucro_prejuizo >= 0 ? "text-green-600" : "text-red-600"
                        }`}>
                          {formatCurrency(roiData.get(parceiro.id)!.lucro_prejuizo)}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2 mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleEdit(parceiro)}
                    >
                      <Edit className="mr-1 h-4 w-4" />
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-red-600 hover:text-red-700"
                      onClick={() => handleDeleteClick(parceiro.id)}
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      Excluir
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {filteredParceiros.map((parceiro) => (
                  <div 
                    key={parceiro.id} 
                    className={`p-4 transition-colors ${
                      parceiro.status === "inativo" 
                        ? "bg-warning/5 hover:bg-warning/10" 
                        : "hover:bg-accent/50"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div 
                        className="flex-1 cursor-pointer"
                        onClick={() => handleView(parceiro)}
                      >
                        <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                          parceiro.status === "inativo"
                            ? "bg-gradient-to-br from-warning/20 to-warning/5 border-warning/30"
                            : "bg-gradient-to-br from-primary/20 to-primary/5 border-primary/30"
                        }`}>
                          <span className={`text-sm font-bold ${
                            parceiro.status === "inativo" ? "text-warning" : "text-primary"
                          }`}>
                            {parceiro.nome.charAt(0).toUpperCase()}
                          </span>
                        </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-base">{parceiro.nome}</h3>
                              <Badge 
                                variant={parceiro.status === "ativo" ? "default" : "secondary"} 
                                className={`text-xs ${parceiro.status === "inativo" ? "bg-warning/20 text-warning border-warning/30" : ""}`}
                              >
                                {parceiro.status}
                              </Badge>
                            </div>
                            <div className="flex flex-col gap-0.5 mt-1 text-sm text-muted-foreground">
                              {parceiro.email && (
                                <span className="truncate max-w-[300px]">
                                  <span className="font-medium">Email:</span> {showCPF ? parceiro.email : maskEmail(parceiro.email)}
                                </span>
                              )}
                              <span className="font-mono">
                                <span className="font-medium">CPF:</span> {maskCPF(parceiro.cpf)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        {/* Contas Bancárias */}
                        {parceiro.contas_bancarias && parceiro.contas_bancarias.length > 0 && (
                          <div className="space-y-1">
                            {parceiro.contas_bancarias.map((conta: any) => (
                              <div key={conta.id} className="flex items-center gap-2 bg-accent/30 rounded px-2 py-1.5 text-xs">
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium truncate max-w-[150px]">{conta.banco}</p>
                                  {conta.pix_key && (
                                    <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[150px]">
                                      {conta.pix_key}
                                    </p>
                                  )}
                                </div>
                                {conta.pix_key && (
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(conta.pix_key);
                                      toast({ title: "PIX copiado!" });
                                    }}
                                    className="p-1 hover:bg-accent rounded"
                                  >
                                    <Copy className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Wallets Crypto */}
                        {parceiro.wallets_crypto && parceiro.wallets_crypto.length > 0 && (
                          <div className="space-y-1">
                            {parceiro.wallets_crypto.map((wallet: any) => (
                              <div key={wallet.id} className="flex items-center gap-2 bg-accent/30 rounded px-2 py-1.5 text-xs">
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium truncate max-w-[150px]">{wallet.exchange || wallet.network}</p>
                                  <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[150px]">
                                    {wallet.endereco.slice(0, 6)}...{wallet.endereco.slice(-6)}
                                  </p>
                                </div>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(wallet.endereco);
                                    toast({ title: "Endereço copiado!" });
                                  }}
                                  className="p-1 hover:bg-accent rounded"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        {roiData.has(parceiro.id) && (
                          <>
                            <div className="text-center px-3 py-2 bg-accent rounded-lg">
                              <div className="font-bold text-foreground">
                                {(roiData.get(parceiro.id)?.num_bookmakers || 0) + (roiData.get(parceiro.id)?.num_bookmakers_limitadas || 0)}
                              </div>
                              <div className="text-xs">Bookmakers</div>
                            </div>
                            <div className="text-center px-3 py-2 bg-accent rounded-lg">
                              <div className={`font-bold ${
                                roiData.get(parceiro.id)!.lucro_prejuizo >= 0 ? "text-green-600" : "text-red-600"
                              }`}>
                                {formatCurrency(roiData.get(parceiro.id)!.lucro_prejuizo)}
                              </div>
                              <div className="text-xs">Lucro</div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1"
                              onClick={() => handleOpenFinanceiro(parceiro)}
                            >
                              <FileText className="h-4 w-4" />
                              Informações
                            </Button>
                          </>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(parceiro)}
                        >
                          <Edit className="mr-1 h-4 w-4" />
                          Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => handleDeleteClick(parceiro.id)}
                        >
                          <Trash2 className="mr-1 h-4 w-4" />
                          Excluir
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

        <ParceiroDialog
          open={dialogOpen}
          onClose={handleDialogClose}
          parceiro={editingParceiro}
          viewMode={viewMode}
        />

        {selectedParceiroFinanceiro && (
          <ParceiroFinanceiroDialog
            open={financeiroDialogOpen}
            onOpenChange={setFinanceiroDialogOpen}
            parceiroId={selectedParceiroFinanceiro.id}
            parceiroNome={selectedParceiroFinanceiro.nome}
            roiData={roiData.get(selectedParceiroFinanceiro.id) || null}
            onCreateVinculo={handleCreateVinculo}
          />
        )}

        <BookmakerDialog
          open={vinculoDialogOpen}
          onClose={handleVinculoDialogClose}
          bookmaker={
            preselectedVinculo
              ? {
                  parceiro_id: preselectedVinculo.parceiroId,
                  bookmaker_catalogo_id: preselectedVinculo.bookmakerId,
                }
              : null
          }
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
