import { useState } from "react";
import {
  Edit,
  Trash2,
  FileText,
  Calculator,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Bitcoin,
  Percent,
  Clock,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

interface InvestidorPainelCardProps {
  investidor: Investidor;
  roi?: InvestidorROI;
  deal?: InvestidorDeal;
  onEdit: () => void;
  onDelete: () => void;
  onExtrato: () => void;
  onSimular: () => void;
  onClick?: () => void;
}

const formatCurrency = (value: number, currency: "BRL" | "USD" = "BRL") => {
  return new Intl.NumberFormat(currency === "BRL" ? "pt-BR" : "en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
  }).format(value);
};

const formatCPF = (cpf: string) => {
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
};

export function InvestidorPainelCard({
  investidor,
  roi,
  deal,
  onEdit,
  onDelete,
  onExtrato,
  onSimular,
  onClick,
}: InvestidorPainelCardProps) {
  // Calculate ROEs
  const roeFiat = roi && roi.aportes_fiat_brl > 0
    ? ((roi.liquidacoes_fiat_brl - roi.aportes_fiat_brl) / roi.aportes_fiat_brl) * 100
    : 0;
  const lucroFiat = roi ? roi.liquidacoes_fiat_brl - roi.aportes_fiat_brl : 0;

  const roeCrypto = roi && roi.aportes_crypto_usd > 0
    ? ((roi.liquidacoes_crypto_usd - roi.aportes_crypto_usd) / roi.aportes_crypto_usd) * 100
    : 0;
  const lucroCrypto = roi ? roi.liquidacoes_crypto_usd - roi.aportes_crypto_usd : 0;

  // Global ROE (USD based)
  const totalAportesGlobal = (roi?.aportes_fiat_usd || 0) + (roi?.aportes_crypto_usd || 0);
  const totalLiquidacoesGlobal = (roi?.liquidacoes_fiat_usd || 0) + (roi?.liquidacoes_crypto_usd || 0);
  const roeGlobal = totalAportesGlobal > 0
    ? ((totalLiquidacoesGlobal - totalAportesGlobal) / totalAportesGlobal) * 100
    : 0;
  const lucroGlobal = totalLiquidacoesGlobal - totalAportesGlobal;

  // Exposure calculation
  const patrimonioFiat = roi?.saldo_fiat_brl || 0;
  const patrimonioCrypto = roi?.saldo_crypto_usd || 0;
  const patrimonioTotal = patrimonioFiat + (patrimonioCrypto * 5); // Rough BRL conversion
  const exposicaoFiat = patrimonioTotal > 0 ? (patrimonioFiat / patrimonioTotal) * 100 : 50;
  const exposicaoCrypto = 100 - exposicaoFiat;

  // Payback estimation (months)
  const lucroMensalMedio = lucroGlobal / 12; // Simplified
  const paybackMeses = totalAportesGlobal > 0 && lucroMensalMedio > 0
    ? Math.ceil(totalAportesGlobal / lucroMensalMedio)
    : null;

  const hasFiat = roi && (roi.aportes_fiat_brl > 0 || roi.liquidacoes_fiat_brl > 0);
  const hasCrypto = roi && (roi.aportes_crypto_usd > 0 || roi.liquidacoes_crypto_usd > 0);

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 border-border/50 bg-card/80">
      {/* Header Section */}
      <div 
        className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={onClick}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`relative w-12 h-12 rounded-full flex items-center justify-center border-2 ${
                investidor.status === "inativo"
                  ? "bg-gradient-to-br from-warning/20 to-warning/5 border-warning/40"
                  : "bg-gradient-to-br from-primary/20 to-primary/5 border-primary/40"
              }`}
            >
              <span
                className={`text-lg font-bold ${
                  investidor.status === "inativo" ? "text-warning" : "text-primary"
                }`}
              >
                {investidor.nome.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h3 className="font-semibold text-base leading-tight">{investidor.nome}</h3>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                {formatCPF(investidor.cpf)}
              </p>
            </div>
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
      </div>

      <Separator className="bg-border/30" />

      {/* Deal Structure Section */}
      {deal && (
        <>
          <div className="px-4 py-3 bg-muted/20">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Acordo de Remuneração
              </span>
              <Badge variant="outline" className="text-[10px] h-5">
                {deal.tipo_deal}
              </Badge>
            </div>
            {deal.tipo_deal === "FIXO" ? (
              <div className="flex items-center gap-2 mt-2">
                <Percent className="h-4 w-4 text-primary" />
                <span className="text-xl font-bold text-primary">{deal.percentual_fixo}%</span>
                <span className="text-xs text-muted-foreground">
                  {deal.base_calculo === "APORTE" ? "do valor aportado" : "dos lucros"}
                </span>
              </div>
            ) : (
              <div className="mt-2 space-y-1">
                {deal.faixas_progressivas.map((faixa, idx) => (
                  <div key={idx} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">
                      {idx === 0 ? "Até" : "Acima de"} {formatCurrency(faixa.limite, "BRL")}
                    </span>
                    <span className="font-semibold text-primary">{faixa.percentual}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <Separator className="bg-border/30" />
        </>
      )}

      <CardContent className="p-4 space-y-4">
        {/* FIAT Mini-Balance */}
        {hasFiat && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <div className="p-1 rounded bg-amber-500/10">
                <DollarSign className="h-3 w-3 text-amber-500" />
              </div>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                FIAT (BRL)
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs bg-muted/10 rounded-lg p-3">
              <div>
                <p className="text-muted-foreground text-[10px] uppercase">Aportes</p>
                <p className="font-semibold text-emerald-500 font-mono">
                  {formatCurrency(roi?.aportes_fiat_brl || 0, "BRL")}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-[10px] uppercase">Liquidações</p>
                <p className="font-semibold text-blue-500 font-mono">
                  {formatCurrency(roi?.liquidacoes_fiat_brl || 0, "BRL")}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-[10px] uppercase">Saldo Caixa</p>
                <p className={`font-semibold font-mono ${(roi?.saldo_fiat_brl || 0) >= 0 ? "text-foreground" : "text-destructive"}`}>
                  {formatCurrency(roi?.saldo_fiat_brl || 0, "BRL")}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-[10px] uppercase">Lucro/Prej.</p>
                <p className={`font-semibold font-mono ${lucroFiat >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                  {formatCurrency(lucroFiat, "BRL")}
                </p>
              </div>
              <div className="col-span-2 pt-2 border-t border-border/30">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-[10px] uppercase">ROE FIAT</span>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`font-mono text-xs ${
                        roeFiat >= 0
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                          : "bg-destructive/10 text-destructive border-destructive/30"
                      }`}
                    >
                      {roeFiat >= 0 ? "+" : ""}{roeFiat.toFixed(1)}%
                    </Badge>
                    <span className={`font-mono text-xs ${roeFiat >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                      {formatCurrency(lucroFiat, "BRL")}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CRYPTO Mini-Balance */}
        {hasCrypto && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <div className="p-1 rounded bg-violet-500/10">
                <Bitcoin className="h-3 w-3 text-violet-500" />
              </div>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                CRYPTO (USD)
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs bg-muted/10 rounded-lg p-3">
              <div>
                <p className="text-muted-foreground text-[10px] uppercase">Aportes</p>
                <p className="font-semibold text-emerald-500 font-mono">
                  {formatCurrency(roi?.aportes_crypto_usd || 0, "USD")}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-[10px] uppercase">Liquidações</p>
                <p className="font-semibold text-blue-500 font-mono">
                  {formatCurrency(roi?.liquidacoes_crypto_usd || 0, "USD")}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-[10px] uppercase">Saldo Caixa</p>
                <p className={`font-semibold font-mono ${(roi?.saldo_crypto_usd || 0) >= 0 ? "text-foreground" : "text-destructive"}`}>
                  {formatCurrency(roi?.saldo_crypto_usd || 0, "USD")}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-[10px] uppercase">Lucro/Prej.</p>
                <p className={`font-semibold font-mono ${lucroCrypto >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                  {formatCurrency(lucroCrypto, "USD")}
                </p>
              </div>
              <div className="col-span-2 pt-2 border-t border-border/30">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-[10px] uppercase">ROE CRYPTO</span>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`font-mono text-xs ${
                        roeCrypto >= 0
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                          : "bg-destructive/10 text-destructive border-destructive/30"
                      }`}
                    >
                      {roeCrypto >= 0 ? "+" : ""}{roeCrypto.toFixed(1)}%
                    </Badge>
                    <span className={`font-mono text-xs ${roeCrypto >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                      {formatCurrency(lucroCrypto, "USD")}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Consolidated Summary */}
        {(hasFiat || hasCrypto) && (
          <div className="space-y-3 p-3 rounded-lg bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Resumo Consolidado
            </div>
            
            {/* Exposure Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Exposição por Classe</span>
              </div>
              <div className="w-full bg-muted/30 rounded-full h-2 overflow-hidden flex">
                <div
                  className="bg-amber-500 h-2 transition-all"
                  style={{ width: `${exposicaoFiat}%` }}
                />
                <div
                  className="bg-violet-500 h-2 transition-all"
                  style={{ width: `${exposicaoCrypto}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-amber-500">FIAT {exposicaoFiat.toFixed(0)}%</span>
                <span className="text-violet-500">Crypto {exposicaoCrypto.toFixed(0)}%</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              {/* Patrimônio Total */}
              <div>
                <p className="text-muted-foreground text-[10px] uppercase">Patrimônio</p>
                <p className="font-bold font-mono">{formatCurrency(patrimonioTotal, "BRL")}</p>
              </div>

              {/* ROE Global */}
              <div>
                <p className="text-muted-foreground text-[10px] uppercase">ROE Global</p>
                <div className="flex items-center gap-1">
                  {roeGlobal >= 0 ? (
                    <TrendingUp className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-destructive" />
                  )}
                  <span className={`font-bold font-mono ${roeGlobal >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                    {roeGlobal >= 0 ? "+" : ""}{roeGlobal.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Payback */}
              <div>
                <p className="text-muted-foreground text-[10px] uppercase">Payback</p>
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className="font-bold font-mono">
                    {paybackMeses ? `${paybackMeses}m` : "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* No data message */}
        {!hasFiat && !hasCrypto && (
          <div className="text-center py-6 text-muted-foreground text-sm">
            <p>Nenhuma movimentação registrada</p>
          </div>
        )}
      </CardContent>

      <Separator className="bg-border/30" />

      {/* Actions Section */}
      <div className="p-3 bg-muted/10">
        <div className="grid grid-cols-4 gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" className="w-full" onClick={onEdit}>
                <Edit className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Editar</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" className="w-full" onClick={onExtrato}>
                <FileText className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Ver Extrato</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" className="w-full" onClick={onSimular}>
                <Calculator className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Simular Retorno</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Excluir</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </Card>
  );
}