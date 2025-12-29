import { useState, useEffect } from "react";
import { Plus, Search, LayoutGrid, List, ChartBar, User } from "lucide-react";
import { useActionAccess } from "@/hooks/useModuleAccess";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { InvestidorDialog } from "@/components/investidores/InvestidorDialog";
import { InvestidorPainelCard } from "@/components/investidores/InvestidorPainelCard";
import { InvestidorExtratoDialog } from "@/components/investidores/InvestidorExtratoDialog";
import { InvestidorDetalhesDrawer } from "@/components/investidores/InvestidorDetalhesDrawer";
import { RelatorioROI } from "@/components/caixa/RelatorioROI";
import { HistoricoInvestidor } from "@/components/caixa/HistoricoInvestidor";
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  aportes_fiat_brl: number;
  aportes_fiat_usd: number;
  liquidacoes_fiat_brl: number;
  liquidacoes_fiat_usd: number;
  aportes_crypto_usd: number;
  liquidacoes_crypto_usd: number;
  saldo_fiat_brl: number;
  saldo_fiat_usd: number;
  saldo_crypto_usd: number;
  total_aportes_usd: number;
  total_liquidacoes_usd: number;
  roi_percentual: number;
}

interface InvestidorDeal {
  id: string;
  investidor_id: string;
  tipo_deal: "FIXO" | "PROGRESSIVO";
  base_calculo: "LUCRO" | "APORTE";
  percentual_fixo: number;
  faixas_progressivas: Array<{ limite: number; percentual: number }>;
  ativo: boolean;
}

export default function GestaoInvestidores() {
  const [investidores, setInvestidores] = useState<Investidor[]>([]);
  const [roiData, setRoiData] = useState<Map<string, InvestidorROI>>(new Map());
  const [dealsData, setDealsData] = useState<Map<string, InvestidorDeal>>(new Map());
  const [projetosCount, setProjetosCount] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  
  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedInvestidor, setSelectedInvestidor] = useState<Investidor | null>(null);
  const [dialogMode, setDialogMode] = useState<"view" | "edit" | "create">("create");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [investidorToDelete, setInvestidorToDelete] = useState<Investidor | null>(null);
  const [extratoDialogOpen, setExtratoDialogOpen] = useState(false);
  const [detalhesDrawerOpen, setDetalhesDrawerOpen] = useState(false);
  const { canCreate } = useActionAccess();

  const fetchProjetosCount = async () => {
    try {
      const { data, error } = await supabase
        .from("projetos")
        .select("id, investidor_id");

      if (error) throw error;
      
      const countMap = new Map<string, number>();
      data?.forEach((projeto) => {
        if (projeto.investidor_id) {
          countMap.set(
            projeto.investidor_id, 
            (countMap.get(projeto.investidor_id) || 0) + 1
          );
        }
      });
      setProjetosCount(countMap);
    } catch (error: any) {
      console.error("Erro ao carregar contagem de projetos:", error);
    }
  };

  const fetchInvestidores = async () => {
    try {
      // RLS policies handle workspace isolation - no need to filter by user_id
      const { data, error } = await supabase
        .from("investidores")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setInvestidores(data || []);
      
      await Promise.all([
        fetchROIData(),
        fetchDealsData(),
        fetchProjetosCount(),
      ]);
    } catch (error: any) {
      toast.error("Erro ao carregar investidores", {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchROIData = async () => {
    try {
      // Views already filter by workspace
      const { data, error } = await supabase
        .from("v_roi_investidores")
        .select("*");

      if (error) throw error;
      
      const roiMap = new Map<string, InvestidorROI>();
      data?.forEach((roi: any) => {
        const aportesFiatBrl = Number(roi.aportes_fiat_brl) || 0;
        const aportesFiatUsd = Number(roi.aportes_fiat_usd) || 0;
        const aportesCryptoUsd = Number(roi.aportes_crypto_usd) || 0;
        const liquidacoesFiatBrl = Number(roi.liquidacoes_fiat_brl) || 0;
        const liquidacoesFiatUsd = Number(roi.liquidacoes_fiat_usd) || 0;
        const liquidacoesCryptoUsd = Number(roi.liquidacoes_crypto_usd) || 0;

        const saldoFiatBrl = aportesFiatBrl - liquidacoesFiatBrl;
        const saldoFiatUsd = aportesFiatUsd - liquidacoesFiatUsd;
        const saldoCryptoUsd = aportesCryptoUsd - liquidacoesCryptoUsd;

        const totalAportesUsd = aportesFiatUsd + aportesCryptoUsd;
        const totalLiquidacoesUsd = liquidacoesFiatUsd + liquidacoesCryptoUsd;

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

  const fetchDealsData = async () => {
    try {
      // RLS policies handle workspace isolation
      const { data, error } = await supabase
        .from("investidor_deals")
        .select("*")
        .eq("ativo", true);

      if (error) throw error;
      
      const dealsMap = new Map<string, InvestidorDeal>();
      data?.forEach((deal: any) => {
        dealsMap.set(deal.investidor_id, {
          id: deal.id,
          investidor_id: deal.investidor_id,
          tipo_deal: deal.tipo_deal,
          base_calculo: deal.base_calculo || "LUCRO",
          percentual_fixo: deal.percentual_fixo || 40,
          faixas_progressivas: deal.faixas_progressivas || [],
          ativo: deal.ativo,
        });
      });
      setDealsData(dealsMap);
    } catch (error: any) {
      console.error("Erro ao carregar deals:", error);
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

  const stats = {
    total: investidores.length,
    ativos: investidores.filter((i) => i.status === "ativo").length,
    inativos: investidores.filter((i) => i.status === "inativo").length,
  };

  // Calculate total exposure
  const totalExposure = {
    fiat: Array.from(roiData.values()).reduce((sum, roi) => sum + roi.saldo_fiat_brl, 0),
    crypto: Array.from(roiData.values()).reduce((sum, roi) => sum + roi.saldo_crypto_usd, 0),
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-4xl font-bold">Gestão de Investidores</h1>
              <p className="text-muted-foreground mt-2">
                Gerencie seus investidores, acordos e acompanhe ROI
              </p>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
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
                <div className="text-3xl font-bold text-emerald-500">{stats.ativos}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Exposição FIAT
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono text-amber-500">
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalExposure.fiat)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Exposição Crypto
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono text-violet-500">
                  {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(totalExposure.crypto)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="investidores" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="investidores" className="flex items-center gap-2">
                <LayoutGrid className="h-4 w-4" />
                Investidores
              </TabsTrigger>
              <TabsTrigger value="roi" className="flex items-center gap-2">
                <ChartBar className="h-4 w-4" />
                ROI Investidores
              </TabsTrigger>
              <TabsTrigger value="historico" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Histórico Investidor
              </TabsTrigger>
            </TabsList>

            <TabsContent value="investidores">
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
                    {canCreate('investidores', 'investidores.create') && (
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
                    )}
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
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {filteredInvestidores.map((investidor) => (
                    <InvestidorPainelCard
                      key={investidor.id}
                      investidor={investidor}
                      roi={roiData.get(investidor.id)}
                      deal={dealsData.get(investidor.id)}
                      projetosCount={projetosCount.get(investidor.id) || 0}
                      onClick={() => {
                        setSelectedInvestidor(investidor);
                        setDialogMode("view");
                        setDialogOpen(true);
                      }}
                      onEdit={() => {
                        setSelectedInvestidor(investidor);
                        setDialogMode("edit");
                        setDialogOpen(true);
                      }}
                      onDelete={() => {
                        setInvestidorToDelete(investidor);
                        setDeleteDialogOpen(true);
                      }}
                      onVerDetalhes={() => {
                        setSelectedInvestidor(investidor);
                        setDetalhesDrawerOpen(true);
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredInvestidores.map((investidor) => (
                    <InvestidorPainelCard
                      key={investidor.id}
                      investidor={investidor}
                      roi={roiData.get(investidor.id)}
                      deal={dealsData.get(investidor.id)}
                      projetosCount={projetosCount.get(investidor.id) || 0}
                      onClick={() => {
                        setSelectedInvestidor(investidor);
                        setDialogMode("view");
                        setDialogOpen(true);
                      }}
                      onEdit={() => {
                        setSelectedInvestidor(investidor);
                        setDialogMode("edit");
                        setDialogOpen(true);
                      }}
                      onDelete={() => {
                        setInvestidorToDelete(investidor);
                        setDeleteDialogOpen(true);
                      }}
                      onVerDetalhes={() => {
                        setSelectedInvestidor(investidor);
                        setDetalhesDrawerOpen(true);
                      }}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="roi">
              <Card className="bg-card/50 backdrop-blur border-border/50">
                <RelatorioROI />
              </Card>
            </TabsContent>

            <TabsContent value="historico">
              <Card className="bg-card/50 backdrop-blur border-border/50">
                <HistoricoInvestidor />
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Dialogs */}
      <InvestidorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        investidor={selectedInvestidor}
        onSuccess={fetchInvestidores}
      />

      {selectedInvestidor && (
        <>
          <InvestidorExtratoDialog
            open={extratoDialogOpen}
            onOpenChange={setExtratoDialogOpen}
            investidor={selectedInvestidor}
          />
          <InvestidorDetalhesDrawer
            open={detalhesDrawerOpen}
            onOpenChange={setDetalhesDrawerOpen}
            investidor={selectedInvestidor}
            roi={roiData.get(selectedInvestidor.id)}
            deal={dealsData.get(selectedInvestidor.id)}
          />
        </>
      )}

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