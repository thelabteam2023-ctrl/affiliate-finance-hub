import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, TrendingDown } from "lucide-react";
import { subMonths, startOfMonth, endOfMonth } from "date-fns";

interface ROIData {
  investidor: string;
  totalAportesFiat: number;
  totalAportesCryptoUsd: number;
  totalLiquidacoesFiat: number;
  totalLiquidacoesCryptoUsd: number;
  saldoFiat: number;
  saldoCryptoUsd: number;
  roi: number;
}

export function RelatorioROI() {
  const [periodo, setPeriodo] = useState<string>("3");
  const [dadosROI, setDadosROI] = useState<ROIData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchROIData();
  }, [periodo]);

  const fetchROIData = async () => {
    try {
      setLoading(true);
      
      const mesesAtras = parseInt(periodo);
      const dataInicio = startOfMonth(subMonths(new Date(), mesesAtras));
      const dataFim = endOfMonth(new Date());

      // Query usando APORTE_FINANCEIRO e distinguindo por origem_tipo/destino_tipo
      const { data: transacoes, error } = await supabase
        .from("cash_ledger")
        .select("*")
        .eq("tipo_transacao", "APORTE_FINANCEIRO")
        .gte("data_transacao", dataInicio.toISOString())
        .lte("data_transacao", dataFim.toISOString())
        .eq("status", "CONFIRMADO");

      if (error) throw error;

      // Group by investor
      const investidoresMap: { [key: string]: ROIData } = {};

      transacoes?.forEach((t) => {
        const investidor = t.nome_investidor || "Sem nome";
        
        if (!investidoresMap[investidor]) {
          investidoresMap[investidor] = {
            investidor,
            totalAportesFiat: 0,
            totalAportesCryptoUsd: 0,
            totalLiquidacoesFiat: 0,
            totalLiquidacoesCryptoUsd: 0,
            saldoFiat: 0,
            saldoCryptoUsd: 0,
            roi: 0,
          };
        }

        // Distinguir APORTE vs LIQUIDACAO pelo origem_tipo/destino_tipo
        const isAporte = t.origem_tipo === "INVESTIDOR";
        const isLiquidacao = t.destino_tipo === "INVESTIDOR";
        const isCrypto = t.tipo_moeda === "CRYPTO";

        if (isAporte) {
          if (isCrypto) {
            investidoresMap[investidor].totalAportesCryptoUsd += t.valor_usd || t.valor;
          } else {
            investidoresMap[investidor].totalAportesFiat += t.valor;
          }
        } else if (isLiquidacao) {
          if (isCrypto) {
            investidoresMap[investidor].totalLiquidacoesCryptoUsd += t.valor_usd || t.valor;
          } else {
            investidoresMap[investidor].totalLiquidacoesFiat += t.valor;
          }
        }
      });

      // Calculate ROI and saldo
      const dadosCalculados = Object.values(investidoresMap).map((inv) => {
        const totalAportes = inv.totalAportesFiat + inv.totalAportesCryptoUsd;
        const totalLiquidacoes = inv.totalLiquidacoesFiat + inv.totalLiquidacoesCryptoUsd;
        
        inv.saldoFiat = inv.totalAportesFiat - inv.totalLiquidacoesFiat;
        inv.saldoCryptoUsd = inv.totalAportesCryptoUsd - inv.totalLiquidacoesCryptoUsd;
        
        inv.roi = totalAportes > 0 
          ? ((totalLiquidacoes / totalAportes) * 100) - 100 
          : 0;
        return inv;
      });

      setDadosROI(dadosCalculados);
    } catch (error: any) {
      console.error("Erro ao buscar dados de ROI:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number, currency: string = "BRL") => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency,
    }).format(value);
  };

  const getTotals = () => {
    return dadosROI.reduce(
      (acc, inv) => ({
        aportesFiat: acc.aportesFiat + inv.totalAportesFiat,
        aportesCrypto: acc.aportesCrypto + inv.totalAportesCryptoUsd,
        liquidacoesFiat: acc.liquidacoesFiat + inv.totalLiquidacoesFiat,
        liquidacoesCrypto: acc.liquidacoesCrypto + inv.totalLiquidacoesCryptoUsd,
        saldoFiat: acc.saldoFiat + inv.saldoFiat,
        saldoCrypto: acc.saldoCrypto + inv.saldoCryptoUsd,
      }),
      { aportesFiat: 0, aportesCrypto: 0, liquidacoesFiat: 0, liquidacoesCrypto: 0, saldoFiat: 0, saldoCrypto: 0 }
    );
  };

  const totals = getTotals();
  const totalAportes = totals.aportesFiat + totals.aportesCrypto;
  const totalLiquidacoes = totals.liquidacoesFiat + totals.liquidacoesCrypto;
  const roiGeral = totalAportes > 0 
    ? ((totalLiquidacoes / totalAportes) * 100) - 100 
    : 0;

  return (
    <>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Relatório de ROI - Investidores</CardTitle>
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Último mês</SelectItem>
              <SelectItem value="3">Últimos 3 meses</SelectItem>
              <SelectItem value="6">Últimos 6 meses</SelectItem>
              <SelectItem value="12">Último ano</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center text-muted-foreground">Carregando...</div>
        ) : dadosROI.length === 0 ? (
          <div className="text-center text-muted-foreground">
            Nenhum dado de aporte/liquidação no período
          </div>
        ) : (
          <div className="space-y-4">
            {/* Resumo Geral */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6 p-4 rounded-lg bg-muted/30 border border-border/50">
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">Aportes FIAT</div>
                <div className="text-lg font-bold text-emerald-400">
                  {formatCurrency(totals.aportesFiat)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">Aportes Crypto</div>
                <div className="text-lg font-bold text-emerald-400">
                  {formatCurrency(totals.aportesCrypto, "USD")}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">Liquidações FIAT</div>
                <div className="text-lg font-bold text-amber-400">
                  {formatCurrency(totals.liquidacoesFiat)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">Liquidações Crypto</div>
                <div className="text-lg font-bold text-amber-400">
                  {formatCurrency(totals.liquidacoesCrypto, "USD")}
                </div>
              </div>
            </div>
            
            {/* ROI Geral */}
            <div className="text-center p-3 rounded-lg bg-card/30 border border-border/50">
              <div className="text-xs text-muted-foreground mb-1">ROI Geral</div>
              <div className={`text-xl font-bold ${roiGeral >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {roiGeral >= 0 ? "+" : ""}{roiGeral.toFixed(2)}%
              </div>
            </div>

            {/* Por Investidor */}
            <div className="space-y-3">
              {dadosROI.map((inv, index) => (
                <div
                  key={index}
                  className="p-4 rounded-lg bg-card/30 border border-border/50 hover:bg-card/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold">{inv.investidor}</h4>
                    <div className={`flex items-center gap-1 text-sm font-bold ${
                      inv.roi >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}>
                      {inv.roi >= 0 ? (
                        <TrendingUp className="h-4 w-4" />
                      ) : (
                        <TrendingDown className="h-4 w-4" />
                      )}
                      {inv.roi >= 0 ? "+" : ""}{inv.roi.toFixed(2)}%
                    </div>
                  </div>
                  
                  {/* FIAT */}
                  {(inv.totalAportesFiat > 0 || inv.totalLiquidacoesFiat > 0) && (
                    <div className="mb-3">
                      <div className="text-xs text-muted-foreground mb-2 font-medium">FIAT (BRL)</div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Aportes</div>
                          <div className="font-medium text-emerald-400">
                            {formatCurrency(inv.totalAportesFiat)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Liquidações</div>
                          <div className="font-medium text-amber-400">
                            {formatCurrency(inv.totalLiquidacoesFiat)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Saldo</div>
                          <div className={`font-medium ${inv.saldoFiat >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {formatCurrency(inv.saldoFiat)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* CRYPTO */}
                  {(inv.totalAportesCryptoUsd > 0 || inv.totalLiquidacoesCryptoUsd > 0) && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-2 font-medium">CRYPTO (USD)</div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Aportes</div>
                          <div className="font-medium text-emerald-400">
                            {formatCurrency(inv.totalAportesCryptoUsd, "USD")}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Liquidações</div>
                          <div className="font-medium text-amber-400">
                            {formatCurrency(inv.totalLiquidacoesCryptoUsd, "USD")}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Saldo</div>
                          <div className={`font-medium ${inv.saldoCryptoUsd >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {formatCurrency(inv.saldoCryptoUsd, "USD")}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </>
  );
}
