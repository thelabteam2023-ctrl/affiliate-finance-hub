import { useState, useEffect } from "react";
import { Plus, Search, LayoutGrid, List, Edit, Trash2, DollarSign, Bitcoin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { InvestidorDialog } from "@/components/investidores/InvestidorDialog";
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

interface Investidor {
  id: string;
  nome: string;
  cpf: string;
  status: string;
  observacoes?: string;
  created_at: string;
}

interface InvestidorROI {
  investidor_id: string;
  // FIAT separado
  aportes_fiat_brl: number;
  aportes_fiat_usd: number;
  liquidacoes_fiat_brl: number;
  liquidacoes_fiat_usd: number;
  // CRYPTO em USD
  aportes_crypto_usd: number;
  liquidacoes_crypto_usd: number;
  // Calculados localmente
  saldo_fiat_brl: number;
  saldo_fiat_usd: number;
  saldo_crypto_usd: number;
  total_aportes_usd: number;
  total_liquidacoes_usd: number;
  roi_percentual: number;
}

export default function GestaoInvestidores() {
  const [investidores, setInvestidores] = useState<Investidor[]>([]);
  const [roiData, setRoiData] = useState<Map<string, InvestidorROI>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedInvestidor, setSelectedInvestidor] = useState<Investidor | null>(null);
  const [dialogMode, setDialogMode] = useState<"view" | "edit" | "create">("create");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [investidorToDelete, setInvestidorToDelete] = useState<Investidor | null>(null);

  const fetchInvestidores = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("investidores")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setInvestidores(data || []);
      
      // Fetch ROI data
      await fetchROIData(user.id);
    } catch (error: any) {
      toast.error("Erro ao carregar investidores", {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchROIData = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("v_roi_investidores")
        .select("*")
        .eq("user_id", userId);

      if (error) throw error;
      
      const roiMap = new Map<string, InvestidorROI>();
      data?.forEach((roi: any) => {
        // Calculate local values
        const aportesFiatBrl = Number(roi.aportes_fiat_brl) || 0;
        const aportesFiatUsd = Number(roi.aportes_fiat_usd) || 0;
        const aportesCryptoUsd = Number(roi.aportes_crypto_usd) || 0;
        const liquidacoesFiatBrl = Number(roi.liquidacoes_fiat_brl) || 0;
        const liquidacoesFiatUsd = Number(roi.liquidacoes_fiat_usd) || 0;
        const liquidacoesCryptoUsd = Number(roi.liquidacoes_crypto_usd) || 0;

        // Saldos
        const saldoFiatBrl = aportesFiatBrl - liquidacoesFiatBrl;
        const saldoFiatUsd = aportesFiatUsd - liquidacoesFiatUsd;
        const saldoCryptoUsd = aportesCryptoUsd - liquidacoesCryptoUsd;

        // Total em USD para ROI (assumindo 1 BRL ≈ para simplificar, ou pode-se ignorar BRL no cálculo USD)
        // Para ROI, vamos considerar apenas USD e Crypto em USD
        const totalAportesUsd = aportesFiatUsd + aportesCryptoUsd;
        const totalLiquidacoesUsd = liquidacoesFiatUsd + liquidacoesCryptoUsd;

        // ROI percentual baseado em USD
        const roiPercentual = totalAportesUsd > 0 
          ? ((totalLiquidacoesUsd - totalAportesUsd) / totalAportesUsd) * 100 
          : 0;

        roiMap.set(roi.investidor_id, {
          investidor_id: roi.investidor_id,
          aportes_fiat_brl: aportesFiatBrl,
          aportes_fiat_usd: aportesFiatUsd,
          liquidacoes_fiat_brl: liquidacoesFiatBrl,
          liquidacoes_fiat_usd: liquidacoesFiatUsd,
          aportes_crypto_usd: aportesCryptoUsd,
          liquidacoes_crypto_usd: liquidacoesCryptoUsd,
          saldo_fiat_brl: saldoFiatBrl,
          saldo_fiat_usd: saldoFiatUsd,
          saldo_crypto_usd: saldoCryptoUsd,
          total_aportes_usd: totalAportesUsd,
          total_liquidacoes_usd: totalLiquidacoesUsd,
          roi_percentual: roiPercentual,
        });
      });
      setRoiData(roiMap);
    } catch (error: any) {
      console.error("Erro ao carregar dados de ROI:", error);
    }
  };

  useEffect(() => {
    fetchInvestidores();
  }, []);

  const handleDelete = async () => {
    if (!investidorToDelete) return;

    try {
      const { error } = await supabase
        .from("investidores")
        .delete()
        .eq("id", investidorToDelete.id);

      if (error) throw error;

      toast.success("Investidor excluído com sucesso");
      fetchInvestidores();
    } catch (error: any) {
      toast.error("Erro ao excluir investidor", {
        description: error.message,
      });
    } finally {
      setDeleteDialogOpen(false);
      setInvestidorToDelete(null);
    }
  };

  const filteredInvestidores = investidores.filter((inv) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      inv.nome.toLowerCase().includes(searchLower) ||
      inv.cpf.includes(searchTerm)
    );
  });

  const formatCPF = (cpf: string) => {
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  };

  const formatCurrency = (value: number, currency: "BRL" | "USD" = "BRL") => {
    return new Intl.NumberFormat(currency === "BRL" ? "pt-BR" : "en-US", {
      style: "currency",
      currency: currency,
    }).format(value);
  };

  const stats = {
    total: investidores.length,
    ativos: investidores.filter((i) => i.status === "ativo").length,
    inativos: investidores.filter((i) => i.status === "inativo").length,
  };

  const renderROICard = (roi: InvestidorROI) => {
    const hasFiatBrl = roi.aportes_fiat_brl > 0 || roi.liquidacoes_fiat_brl > 0;
    const hasFiatUsd = roi.aportes_fiat_usd > 0 || roi.liquidacoes_fiat_usd > 0;
    const hasCrypto = roi.aportes_crypto_usd > 0 || roi.liquidacoes_crypto_usd > 0;

    return (
      <div className="space-y-3">
        {/* FIAT Section */}
        {(hasFiatBrl || hasFiatUsd) && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              FIAT
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <p className="text-muted-foreground">Aportes</p>
                {hasFiatBrl && (
                  <p className="font-semibold text-emerald-600">{formatCurrency(roi.aportes_fiat_brl, "BRL")}</p>
                )}
                {hasFiatUsd && (
                  <p className="font-semibold text-emerald-600">{formatCurrency(roi.aportes_fiat_usd, "USD")}</p>
                )}
              </div>
              <div>
                <p className="text-muted-foreground">Liquidações</p>
                {hasFiatBrl && (
                  <p className="font-semibold text-blue-600">{formatCurrency(roi.liquidacoes_fiat_brl, "BRL")}</p>
                )}
                {hasFiatUsd && (
                  <p className="font-semibold text-blue-600">{formatCurrency(roi.liquidacoes_fiat_usd, "USD")}</p>
                )}
              </div>
              <div>
                <p className="text-muted-foreground">Saldo</p>
                {hasFiatBrl && (
                  <p className={`font-semibold ${roi.saldo_fiat_brl >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {formatCurrency(roi.saldo_fiat_brl, "BRL")}
                  </p>
                )}
                {hasFiatUsd && (
                  <p className={`font-semibold ${roi.saldo_fiat_usd >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {formatCurrency(roi.saldo_fiat_usd, "USD")}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* CRYPTO Section */}
        {hasCrypto && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Bitcoin className="h-3 w-3" />
              CRYPTO (USD)
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <p className="text-muted-foreground">Aportes</p>
                <p className="font-semibold text-emerald-600">{formatCurrency(roi.aportes_crypto_usd, "USD")}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Liquidações</p>
                <p className="font-semibold text-blue-600">{formatCurrency(roi.liquidacoes_crypto_usd, "USD")}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Saldo</p>
                <p className={`font-semibold ${roi.saldo_crypto_usd >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {formatCurrency(roi.saldo_crypto_usd, "USD")}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ROI (only if USD values exist) */}
        {(hasFiatUsd || hasCrypto) && (
          <div className="pt-2 border-t border-border/50">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">ROI (USD)</span>
              <span className={`font-bold ${roi.roi_percentual >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {roi.roi_percentual.toFixed(2)}%
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderROIListItem = (roi: InvestidorROI) => {
    const hasFiatBrl = roi.aportes_fiat_brl > 0 || roi.liquidacoes_fiat_brl > 0;
    const hasFiatUsd = roi.aportes_fiat_usd > 0 || roi.liquidacoes_fiat_usd > 0;
    const hasCrypto = roi.aportes_crypto_usd > 0 || roi.liquidacoes_crypto_usd > 0;

    return (
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs">
        {hasFiatBrl && (
          <>
            <div>
              <span className="text-muted-foreground">Aportes BRL: </span>
              <span className="font-semibold text-emerald-600">{formatCurrency(roi.aportes_fiat_brl, "BRL")}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Liquidações BRL: </span>
              <span className="font-semibold text-blue-600">{formatCurrency(roi.liquidacoes_fiat_brl, "BRL")}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Saldo BRL: </span>
              <span className={`font-semibold ${roi.saldo_fiat_brl >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {formatCurrency(roi.saldo_fiat_brl, "BRL")}
              </span>
            </div>
          </>
        )}
        {hasCrypto && (
          <>
            <div>
              <span className="text-muted-foreground">Aportes Crypto: </span>
              <span className="font-semibold text-emerald-600">{formatCurrency(roi.aportes_crypto_usd, "USD")}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Liquidações Crypto: </span>
              <span className="font-semibold text-blue-600">{formatCurrency(roi.liquidacoes_crypto_usd, "USD")}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Saldo Crypto: </span>
              <span className={`font-semibold ${roi.saldo_crypto_usd >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {formatCurrency(roi.saldo_crypto_usd, "USD")}
              </span>
            </div>
          </>
        )}
        {(hasFiatUsd || hasCrypto) && (
          <div>
            <span className="text-muted-foreground">ROI: </span>
            <span className={`font-semibold ${roi.roi_percentual >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {roi.roi_percentual.toFixed(2)}%
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-4xl font-bold">Gestão de Investidores</h1>
              <p className="text-muted-foreground mt-2">
                Gerencie seus investidores e acompanhe ROI
              </p>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total de Investidores
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
                <div className="text-3xl font-bold text-emerald-600">{stats.ativos}</div>
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setViewMode(viewMode === "cards" ? "list" : "cards")}
                    >
                      {viewMode === "cards" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{viewMode === "cards" ? "Visualizar como lista" : "Visualizar como cards"}</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      onClick={() => {
                        setSelectedInvestidor(null);
                        setDialogMode("create");
                        setDialogOpen(true);
                      }}
                      className="shrink-0"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Novo Investidor</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </CardContent>
          </Card>

          {/* Investidores View */}
          {loading ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">Carregando investidores...</p>
              </CardContent>
            </Card>
          ) : filteredInvestidores.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  {searchTerm ? "Nenhum investidor encontrado" : "Nenhum investidor cadastrado. Clique em \"Novo Investidor\" para adicionar."}
                </p>
              </CardContent>
            </Card>
          ) : viewMode === "cards" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredInvestidores.map((investidor) => (
                <Card
                  key={investidor.id}
                  className={`hover:shadow-lg transition-shadow relative ${
                    investidor.status === "inativo" ? "bg-warning/10 border-warning/30" : ""
                  }`}
                >
                  <CardHeader>
                    <div className="flex justify-between items-start gap-3">
                      <div 
                        className="flex items-center gap-3 flex-1 cursor-pointer group"
                        onClick={() => {
                          setSelectedInvestidor(investidor);
                          setDialogMode("view");
                          setDialogOpen(true);
                        }}
                        title="Clique para ver detalhes completos"
                      >
                        <div className={`relative w-12 h-12 rounded-full flex items-center justify-center overflow-hidden border-2 transition-all ${
                          investidor.status === "inativo"
                            ? "bg-gradient-to-br from-warning/20 to-warning/5 border-warning/30 group-hover:border-warning/60"
                            : "bg-gradient-to-br from-primary/20 to-primary/5 border-primary/30 group-hover:border-primary/60"
                        }`}>
                          <span className={`text-lg font-bold ${
                            investidor.status === "inativo" ? "text-warning" : "text-primary"
                          }`}>
                            {investidor.nome.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <CardTitle className="text-base group-hover:text-primary transition-colors">{investidor.nome}</CardTitle>
                          <p className="text-sm text-muted-foreground mt-0.5 font-mono">
                            <span className="font-medium">CPF:</span> {formatCPF(investidor.cpf)}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant={investidor.status === "ativo" ? "default" : "secondary"}
                        className={investidor.status === "inativo" ? "bg-warning/20 text-warning border-warning/30" : ""}
                      >
                        {investidor.status.toUpperCase()}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* ROI and Financial Data */}
                    {roiData.has(investidor.id) && renderROICard(roiData.get(investidor.id)!)}
                    
                    {investidor.observacoes && (
                      <div className="space-y-2 text-sm pt-2 border-t mt-2">
                        <p className="text-muted-foreground">
                          <span className="font-medium">Observações:</span>{" "}
                          {investidor.observacoes.substring(0, 60)}{investidor.observacoes.length > 60 ? "..." : ""}
                        </p>
                      </div>
                    )}
                    <div className="flex gap-2 mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          setSelectedInvestidor(investidor);
                          setDialogMode("edit");
                          setDialogOpen(true);
                        }}
                      >
                        <Edit className="mr-1 h-4 w-4" />
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-red-600 hover:text-red-700"
                        onClick={() => {
                          setInvestidorToDelete(investidor);
                          setDeleteDialogOpen(true);
                        }}
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
                  {filteredInvestidores.map((investidor) => (
                    <div
                      key={investidor.id}
                      className={`p-4 transition-colors ${
                        investidor.status === "inativo" 
                          ? "bg-warning/5 hover:bg-warning/10" 
                          : "hover:bg-accent/50"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div 
                          className="flex-1 cursor-pointer"
                          onClick={() => {
                            setSelectedInvestidor(investidor);
                            setDialogMode("view");
                            setDialogOpen(true);
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                              investidor.status === "inativo"
                                ? "bg-gradient-to-br from-warning/20 to-warning/5 border-warning/30"
                                : "bg-gradient-to-br from-primary/20 to-primary/5 border-primary/30"
                            }`}>
                              <span className={`text-sm font-bold ${
                                investidor.status === "inativo" ? "text-warning" : "text-primary"
                              }`}>
                                {investidor.nome.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-base">{investidor.nome}</h3>
                                <Badge 
                                  variant={investidor.status === "ativo" ? "default" : "secondary"} 
                                  className={`text-xs ${investidor.status === "inativo" ? "bg-warning/20 text-warning border-warning/30" : ""}`}
                                >
                                  {investidor.status.toUpperCase()}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground mt-1 font-mono">{formatCPF(investidor.cpf)}</p>
                              
                              {/* ROI Data */}
                              {roiData.has(investidor.id) && renderROIListItem(roiData.get(investidor.id)!)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedInvestidor(investidor);
                              setDialogMode("edit");
                              setDialogOpen(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setInvestidorToDelete(investidor);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
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
      </div>

      <InvestidorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        investidor={selectedInvestidor}
        onSuccess={fetchInvestidores}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o investidor <strong>{investidorToDelete?.nome}</strong>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </TooltipProvider>
  );
}
