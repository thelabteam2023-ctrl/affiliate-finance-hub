import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, TrendingDown } from "lucide-react";
import { subMonths, startOfMonth, endOfMonth } from "date-fns";

interface ROIData {
  investidor: string;
  totalAportes: number;
  totalLiquidacoes: number;
  saldo: number;
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

      const { data: transacoes, error } = await supabase
        .from("cash_ledger")
        .select("*")
        .in("tipo_transacao", ["APORTE", "LIQUIDACAO"])
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
            totalAportes: 0,
            totalLiquidacoes: 0,
            saldo: 0,
            roi: 0,
          };
        }

        if (t.tipo_transacao === "APORTE") {
          investidoresMap[investidor].totalAportes += t.valor;
        } else if (t.tipo_transacao === "LIQUIDACAO") {
          investidoresMap[investidor].totalLiquidacoes += t.valor;
        }
      });

      // Calculate ROI and saldo
      const dadosCalculados = Object.values(investidoresMap).map((inv) => {
        inv.saldo = inv.totalAportes - inv.totalLiquidacoes;
        inv.roi = inv.totalAportes > 0 
          ? ((inv.totalLiquidacoes / inv.totalAportes) * 100) - 100 
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getTotals = () => {
    return dadosROI.reduce(
      (acc, inv) => ({
        aportes: acc.aportes + inv.totalAportes,
        liquidacoes: acc.liquidacoes + inv.totalLiquidacoes,
        saldo: acc.saldo + inv.saldo,
      }),
      { aportes: 0, liquidacoes: 0, saldo: 0 }
    );
  };

  const totals = getTotals();
  const roiGeral = totals.aportes > 0 
    ? ((totals.liquidacoes / totals.aportes) * 100) - 100 
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
            <div className="grid gap-4 md:grid-cols-3 mb-6 p-4 rounded-lg bg-muted/30 border border-border/50">
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">Total Aportes</div>
                <div className="text-lg font-bold text-emerald-400">
                  {formatCurrency(totals.aportes)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">Total Liquidações</div>
                <div className="text-lg font-bold text-amber-400">
                  {formatCurrency(totals.liquidacoes)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">ROI Geral</div>
                <div className={`text-lg font-bold ${roiGeral >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {roiGeral >= 0 ? "+" : ""}{roiGeral.toFixed(2)}%
                </div>
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
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Aportes</div>
                      <div className="font-medium text-emerald-400">
                        {formatCurrency(inv.totalAportes)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Liquidações</div>
                      <div className="font-medium text-amber-400">
                        {formatCurrency(inv.totalLiquidacoes)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Saldo</div>
                      <div className={`font-medium ${inv.saldo >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {formatCurrency(inv.saldo)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </>
  );
}