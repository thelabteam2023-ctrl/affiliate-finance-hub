import { useState, useEffect } from "react";
import { FolderOpen, Layers, DollarSign, LayoutDashboard, ExternalLink } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { InvestidorProjetosTab } from "./InvestidorProjetosTab";
import { InvestidorParticipacoesList } from "./InvestidorParticipacoesList";

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
  tipo_deal: "FIXO" | "PROGRESSIVO";
  base_calculo: "LUCRO" | "APORTE";
  percentual_fixo: number;
  faixas_progressivas: Array<{ limite: number; percentual: number }>;
  ativo: boolean;
}

interface Investidor {
  id: string;
  nome: string;
  cpf: string;
  status: string;
  observacoes?: string;
  created_at: string;
}

interface InvestidorDetalhesDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  investidor: Investidor | null;
  roi?: InvestidorROI;
  deal?: InvestidorDeal;
}

const formatCurrency = (value: number, currency: "BRL" | "USD" = "BRL") => {
  return new Intl.NumberFormat(currency === "BRL" ? "pt-BR" : "en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
  }).format(value);
};

const formatCPF = (cpf: string) => {
  const cleanCPF = cpf.replace(/\D/g, "");
  if (cleanCPF.length === 11) {
    return cleanCPF.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  } else if (cleanCPF.length === 14) {
    return cleanCPF.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return cpf;
};

export function InvestidorDetalhesDrawer({
  open,
  onOpenChange,
  investidor,
  roi,
  deal,
}: InvestidorDetalhesDrawerProps) {
  const [activeTab, setActiveTab] = useState("visao-geral");
  const [projetosCount, setProjetosCount] = useState(0);
  const [participacoesCount, setParticipacoesCount] = useState(0);

  useEffect(() => {
    if (open && investidor) {
      setActiveTab("visao-geral");
      fetchCounts();
    }
  }, [open, investidor]);

  const fetchCounts = async () => {
    if (!investidor) return;

    // Contar projetos vinculados
    const { count: projCount } = await supabase
      .from("projetos")
      .select("id", { count: "exact", head: true })
      .eq("investidor_id", investidor.id);

    setProjetosCount(projCount || 0);

    // Contar participações
    const { count: partCount } = await supabase
      .from("participacao_ciclos")
      .select("id", { count: "exact", head: true })
      .eq("investidor_id", investidor.id);

    setParticipacoesCount(partCount || 0);
  };

  if (!investidor) return null;

  // Calcular métricas
  const totalAportesFiat = roi?.aportes_fiat_brl || 0;
  const totalLiquidacoesFiat = roi?.liquidacoes_fiat_brl || 0;
  const saldoFiat = totalAportesFiat - totalLiquidacoesFiat;

  const totalAportesCrypto = roi?.aportes_crypto_usd || 0;
  const totalLiquidacoesCrypto = roi?.liquidacoes_crypto_usd || 0;
  const saldoCrypto = totalAportesCrypto - totalLiquidacoesCrypto;

  const roiPercentual = roi?.roi_percentual || 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto" showClose>
        <SheetHeader className="space-y-4 pb-4">
          <div className="flex items-center gap-4">
            <div
              className={`relative w-14 h-14 rounded-full flex items-center justify-center border-2 ${
                investidor.status === "inativo"
                  ? "bg-gradient-to-br from-warning/20 to-warning/5 border-warning/40"
                  : "bg-gradient-to-br from-primary/20 to-primary/5 border-primary/40"
              }`}
            >
              <span
                className={`text-xl font-bold ${
                  investidor.status === "inativo" ? "text-warning" : "text-primary"
                }`}
              >
                {investidor.nome.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1">
              <SheetTitle className="text-xl">{investidor.nome}</SheetTitle>
              <p className="text-sm text-muted-foreground font-mono mt-1">
                {formatCPF(investidor.cpf)}
              </p>
            </div>
            <Badge
              variant={investidor.status === "ativo" ? "default" : "secondary"}
              className={
                investidor.status === "inativo"
                  ? "bg-warning/20 text-warning border-warning/40"
                  : "bg-primary/20 text-primary border-primary/40"
              }
            >
              {investidor.status.toUpperCase()}
            </Badge>
          </div>
        </SheetHeader>

        <Separator className="my-4" />

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-4 mb-6">
            <TabsTrigger value="visao-geral" className="text-xs">
              <LayoutDashboard className="h-3.5 w-3.5 mr-1.5" />
              Visão Geral
            </TabsTrigger>
            <TabsTrigger value="projetos" className="text-xs">
              <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
              Projetos
              {projetosCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">
                  {projetosCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="participacoes" className="text-xs">
              <Layers className="h-3.5 w-3.5 mr-1.5" />
              Ciclos
              {participacoesCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">
                  {participacoesCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="financeiro" className="text-xs">
              <DollarSign className="h-3.5 w-3.5 mr-1.5" />
              Financeiro
            </TabsTrigger>
          </TabsList>

          {/* Visão Geral Tab */}
          <TabsContent value="visao-geral" className="space-y-4">
            {/* KPIs Cards */}
            <div className="grid grid-cols-2 gap-4">
              <Card className="bg-card/50">
                <CardContent className="pt-4 pb-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Projetos Ativos
                  </p>
                  <p className="text-2xl font-bold mt-1">{projetosCount}</p>
                </CardContent>
              </Card>
              <Card className="bg-card/50">
                <CardContent className="pt-4 pb-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Participações
                  </p>
                  <p className="text-2xl font-bold mt-1">{participacoesCount}</p>
                </CardContent>
              </Card>
            </div>

            {/* Exposição Financeira */}
            <Card className="bg-card/50">
              <CardContent className="pt-4 pb-4 space-y-4">
                <h3 className="text-sm font-semibold">Exposição Financeira</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase">
                      Capital em Operação (FIAT)
                    </p>
                    <p className="text-lg font-bold font-mono text-amber-500">
                      {formatCurrency(saldoFiat, "BRL")}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase">
                      Capital em Operação (CRYPTO)
                    </p>
                    <p className="text-lg font-bold font-mono text-violet-500">
                      {formatCurrency(saldoCrypto, "USD")}
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Total Aportado</p>
                    <p className="text-sm font-semibold font-mono mt-1">
                      {formatCurrency(totalAportesFiat, "BRL")}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Total Recebido</p>
                    <p className="text-sm font-semibold font-mono mt-1">
                      {formatCurrency(totalLiquidacoesFiat, "BRL")}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">ROI</p>
                    <Badge
                      variant="outline"
                      className={`mt-1 font-mono ${
                        roiPercentual > 0
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                          : roiPercentual < 0
                          ? "bg-destructive/10 text-destructive border-destructive/30"
                          : "bg-muted/20 text-muted-foreground"
                      }`}
                    >
                      {roiPercentual > 0 ? "+" : ""}{roiPercentual.toFixed(1)}%
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Acordo */}
            {deal && (
              <Card className="bg-card/50">
                <CardContent className="pt-4 pb-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Acordo de Remuneração</h3>
                    <Badge variant="outline" className="text-[10px]">
                      {deal.tipo_deal}
                    </Badge>
                  </div>

                  {deal.tipo_deal === "FIXO" ? (
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold text-primary">
                        {deal.percentual_fixo}%
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {deal.base_calculo === "APORTE" ? "do valor aportado" : "dos lucros"}
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {deal.faixas_progressivas.map((faixa, idx) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            {idx === 0 ? "Até" : "Acima de"} {formatCurrency(faixa.limite, "BRL")}
                          </span>
                          <span className="font-semibold text-primary">{faixa.percentual}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Observações */}
            {investidor.observacoes && (
              <Card className="bg-card/50">
                <CardContent className="pt-4 pb-4">
                  <h3 className="text-sm font-semibold mb-2">Observações</h3>
                  <p className="text-sm text-muted-foreground">{investidor.observacoes}</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Projetos Tab */}
          <TabsContent value="projetos">
            <InvestidorProjetosTab investidorId={investidor.id} />
          </TabsContent>

          {/* Participações Tab */}
          <TabsContent value="participacoes">
            <InvestidorParticipacoesList investidorId={investidor.id} />
          </TabsContent>

          {/* Financeiro Tab */}
          <TabsContent value="financeiro" className="space-y-4">
            <Card className="bg-card/50">
              <CardContent className="py-8 text-center">
                <DollarSign className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">
                  Para ver o histórico financeiro completo,
                </p>
                <p className="text-sm text-muted-foreground">
                  acesse o Extrato do investidor.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
