import { useState, useEffect, useMemo, useCallback } from "react";
import { useTabWorkspace } from "@/hooks/useTabWorkspace";
import { useWorkspaceChangeListener } from "@/hooks/useWorkspaceCacheClear";
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
import { InvestidorPainelCard, InvestidorROIMultiMoeda } from "@/components/investidores/InvestidorPainelCard";
import { InvestidorExtratoDialog } from "@/components/investidores/InvestidorExtratoDialog";
import { InvestidorDetalhesDrawer } from "@/components/investidores/InvestidorDetalhesDrawer";
import { RelatorioROI } from "@/components/caixa/RelatorioROI";
import { HistoricoInvestidor } from "@/components/caixa/HistoricoInvestidor";
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NativeCurrencyKpi, CurrencyEntry } from "@/components/ui/native-currency-kpi";
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

const FIAT_CURRENCIES = ["BRL", "USD", "EUR", "GBP", "MXN", "MYR", "ARS", "COP"] as const;

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
  // SEGURANÇA: workspaceId como dependência para isolamento multi-tenant
  const { workspaceId } = useTabWorkspace();
  
  const [investidores, setInvestidores] = useState<Investidor[]>([]);
  const [roiData, setRoiData] = useState<Map<string, InvestidorROIMultiMoeda>>(new Map());
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
      // Nova view multi-moeda com suporte a 8 moedas FIAT
      const { data, error } = await supabase
        .from("v_roi_investidores_multimoeda")
        .select("*");

      if (error) throw error;
      
      const roiMap = new Map<string, InvestidorROIMultiMoeda>();
      data?.forEach((roi: any) => {
        roiMap.set(roi.investidor_id, {
          investidor_id: roi.investidor_id,
          // FIAT por moeda nativa
          aportes_brl: Number(roi.aportes_brl) || 0,
          liquidacoes_brl: Number(roi.liquidacoes_brl) || 0,
          aportes_usd: Number(roi.aportes_usd) || 0,
          liquidacoes_usd: Number(roi.liquidacoes_usd) || 0,
          aportes_eur: Number(roi.aportes_eur) || 0,
          liquidacoes_eur: Number(roi.liquidacoes_eur) || 0,
          aportes_gbp: Number(roi.aportes_gbp) || 0,
          liquidacoes_gbp: Number(roi.liquidacoes_gbp) || 0,
          aportes_mxn: Number(roi.aportes_mxn) || 0,
          liquidacoes_mxn: Number(roi.liquidacoes_mxn) || 0,
          aportes_myr: Number(roi.aportes_myr) || 0,
          liquidacoes_myr: Number(roi.liquidacoes_myr) || 0,
          aportes_ars: Number(roi.aportes_ars) || 0,
          liquidacoes_ars: Number(roi.liquidacoes_ars) || 0,
          aportes_cop: Number(roi.aportes_cop) || 0,
          liquidacoes_cop: Number(roi.liquidacoes_cop) || 0,
          // Crypto
          aportes_crypto_usd: Number(roi.aportes_crypto_usd) || 0,
          liquidacoes_crypto_usd: Number(roi.liquidacoes_crypto_usd) || 0,
          // Totais USD reference
          total_aportes_usd_ref: Number(roi.total_aportes_usd_ref) || 0,
          total_liquidacoes_usd_ref: Number(roi.total_liquidacoes_usd_ref) || 0,
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

  // SEGURANÇA: Refetch quando workspace muda
  useEffect(() => {
    if (workspaceId) {
      fetchInvestidores();
    }
  }, [workspaceId]);

  // Listener para reset de estados locais na troca de workspace
  useWorkspaceChangeListener(useCallback(() => {
    console.log("[GestaoInvestidores] Workspace changed - resetting local state");
    setInvestidores([]);
    setRoiData(new Map());
    setDealsData(new Map());
    setProjetosCount(new Map());
    setSelectedInvestidor(null);
    setLoading(true);
  }, []));

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

  // Calculate total exposure multi-moeda
  const totalExposureFiat = useMemo((): CurrencyEntry[] => {
    const totals: Record<string, number> = {};
    
    Array.from(roiData.values()).forEach((roi) => {
      for (const currency of FIAT_CURRENCIES) {
        const key = currency.toLowerCase();
        const aportes = Number(roi[`aportes_${key}` as keyof InvestidorROIMultiMoeda]) || 0;
        const liquidacoes = Number(roi[`liquidacoes_${key}` as keyof InvestidorROIMultiMoeda]) || 0;
        const saldo = aportes - liquidacoes;
        if (saldo !== 0) {
          totals[currency] = (totals[currency] || 0) + saldo;
        }
      }
    });
    
    return Object.entries(totals)
      .filter(([_, value]) => value !== 0)
      .map(([currency, value]) => ({ currency, value }));
  }, [roiData]);

  const totalExposureCrypto = useMemo((): CurrencyEntry[] => {
    const total = Array.from(roiData.values()).reduce((sum, roi) => {
      const aportes = Number(roi.aportes_crypto_usd) || 0;
      const liquidacoes = Number(roi.liquidacoes_crypto_usd) || 0;
      return sum + (aportes - liquidacoes);
    }, 0);
    
    if (total === 0) return [];
    return [{ currency: "USDT", value: total }];
  }, [roiData]);

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
                <NativeCurrencyKpi
                  entries={totalExposureFiat}
                  size="lg"
                  variant="default"
                  className="text-amber-500 font-mono"
                  showDashOnZero
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Exposição Crypto
                </CardTitle>
              </CardHeader>
              <CardContent>
                <NativeCurrencyKpi
                  entries={totalExposureCrypto}
                  size="lg"
                  variant="default"
                  className="text-violet-500 font-mono"
                  showDashOnZero
                />
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