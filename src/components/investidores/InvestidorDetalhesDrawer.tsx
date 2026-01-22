import { useState, useEffect, useMemo } from "react";
import { FolderOpen, Layers, DollarSign, LayoutDashboard } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { InvestidorProjetosTab } from "./InvestidorProjetosTab";
import { InvestidorParticipacoesList } from "./InvestidorParticipacoesList";
import { InvestidorFinanceiroTab } from "./InvestidorFinanceiroTab";
import { NativeCurrencyKpi, CurrencyEntry } from "@/components/ui/native-currency-kpi";
import { InvestidorROIMultiMoeda } from "./InvestidorPainelCard";

const FIAT_CURRENCIES = ["BRL", "USD", "EUR", "GBP", "MXN", "MYR", "ARS", "COP"] as const;

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
  roi?: InvestidorROIMultiMoeda;
  deal?: InvestidorDeal;
}

const formatCurrency = (value: number, currency: string = "BRL") => {
  const locale = currency === "BRL" ? "pt-BR" : "en-US";
  const currencyCode = ["USDT", "USDC"].includes(currency) ? "USD" : currency;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
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

/**
 * Extrai entries de capital em operação FIAT (aportes - liquidações) por moeda nativa
 */
function getFiatExposureEntries(roi: InvestidorROIMultiMoeda | undefined): CurrencyEntry[] {
  if (!roi) return [];

  const entries: CurrencyEntry[] = [];

  for (const currency of FIAT_CURRENCIES) {
    const key = currency.toLowerCase();
    const aportes = Number(roi[`aportes_${key}` as keyof InvestidorROIMultiMoeda]) || 0;
    const liquidacoes = Number(roi[`liquidacoes_${key}` as keyof InvestidorROIMultiMoeda]) || 0;
    const saldo = aportes - liquidacoes;

    if (saldo !== 0) {
      entries.push({ currency, value: saldo });
    }
  }

  return entries;
}

/**
 * Extrai entries de crypto (consolidado em USD)
 */
function getCryptoExposureEntries(roi: InvestidorROIMultiMoeda | undefined): CurrencyEntry[] {
  if (!roi) return [];

  const aportes = Number(roi.aportes_crypto_usd) || 0;
  const liquidacoes = Number(roi.liquidacoes_crypto_usd) || 0;
  const saldo = aportes - liquidacoes;

  if (saldo === 0) return [];
  return [{ currency: "USDT", value: saldo }];
}

/**
 * Extrai detalhes de aportes por moeda para breakdown
 */
function getAportesEntries(roi: InvestidorROIMultiMoeda | undefined): CurrencyEntry[] {
  if (!roi) return [];

  const entries: CurrencyEntry[] = [];

  for (const currency of FIAT_CURRENCIES) {
    const key = currency.toLowerCase();
    const aportes = Number(roi[`aportes_${key}` as keyof InvestidorROIMultiMoeda]) || 0;
    if (aportes !== 0) {
      entries.push({ currency, value: aportes });
    }
  }

  return entries;
}

/**
 * Extrai detalhes de liquidações por moeda para breakdown
 */
function getLiquidacoesEntries(roi: InvestidorROIMultiMoeda | undefined): CurrencyEntry[] {
  if (!roi) return [];

  const entries: CurrencyEntry[] = [];

  for (const currency of FIAT_CURRENCIES) {
    const key = currency.toLowerCase();
    const liquidacoes = Number(roi[`liquidacoes_${key}` as keyof InvestidorROIMultiMoeda]) || 0;
    if (liquidacoes !== 0) {
      entries.push({ currency, value: liquidacoes });
    }
  }

  return entries;
}

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

  // Memoized entries
  const fiatEntries = useMemo(() => getFiatExposureEntries(roi), [roi]);
  const cryptoEntries = useMemo(() => getCryptoExposureEntries(roi), [roi]);
  const aportesEntries = useMemo(() => getAportesEntries(roi), [roi]);
  const liquidacoesEntries = useMemo(() => getLiquidacoesEntries(roi), [roi]);

  // ROI consolidado via USD reference
  const roiPercentual = useMemo(() => {
    if (!roi) return 0;
    const totalAportes = Number(roi.total_aportes_usd_ref) || 0;
    const totalLiquidacoes = Number(roi.total_liquidacoes_usd_ref) || 0;
    return totalAportes > 0
      ? ((totalLiquidacoes - totalAportes) / totalAportes) * 100
      : 0;
  }, [roi]);

  // Crypto values
  const totalAportesCrypto = Number(roi?.aportes_crypto_usd) || 0;
  const totalLiquidacoesCrypto = Number(roi?.liquidacoes_crypto_usd) || 0;
  const saldoCrypto = totalAportesCrypto - totalLiquidacoesCrypto;

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
                    <NativeCurrencyKpi
                      entries={fiatEntries}
                      size="lg"
                      variant="default"
                      className="text-amber-500 font-mono"
                      showDashOnZero
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase">
                      Capital em Operação (CRYPTO)
                    </p>
                    <NativeCurrencyKpi
                      entries={cryptoEntries}
                      size="lg"
                      variant="default"
                      className="text-violet-500 font-mono"
                      showDashOnZero
                    />
                  </div>
                </div>

                <Separator />

                {/* Aportes e Recebidos - FIAT Multi-moeda */}
                <div className="space-y-2">
                  <p className="text-[10px] text-amber-500 uppercase font-medium">FIAT (Multi-moeda)</p>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Aportado</p>
                      <div className="mt-1">
                        <NativeCurrencyKpi
                          entries={aportesEntries}
                          size="sm"
                          variant="default"
                          className="font-mono justify-center"
                          showDashOnZero
                        />
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Recebido</p>
                      <div className="mt-1">
                        <NativeCurrencyKpi
                          entries={liquidacoesEntries}
                          size="sm"
                          variant="default"
                          className="font-mono justify-center"
                          showDashOnZero
                        />
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Saldo</p>
                      <div className="mt-1">
                        <NativeCurrencyKpi
                          entries={fiatEntries}
                          size="sm"
                          variant="auto"
                          className="font-mono justify-center"
                          showDashOnZero
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Aportes e Recebidos - CRYPTO */}
                {(totalAportesCrypto > 0 || totalLiquidacoesCrypto > 0) && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <p className="text-[10px] text-violet-500 uppercase font-medium">CRYPTO (USD)</p>
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase">Aportado</p>
                          <p className="text-sm font-semibold font-mono mt-1">
                            {formatCurrency(totalAportesCrypto, "USD")}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase">Recebido</p>
                          <p className="text-sm font-semibold font-mono mt-1">
                            {formatCurrency(totalLiquidacoesCrypto, "USD")}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase">Saldo</p>
                          <p className={`text-sm font-semibold font-mono mt-1 ${saldoCrypto > 0 ? "text-violet-500" : "text-muted-foreground"}`}>
                            {formatCurrency(saldoCrypto, "USD")}
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <Separator />

                {/* ROI Consolidado */}
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">ROI Consolidado</p>
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
          <TabsContent value="financeiro">
            <InvestidorFinanceiroTab 
              investidorId={investidor.id} 
              investidorNome={investidor.nome} 
            />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
