import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Target, Clock, Percent, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface RentabilidadeCaptacaoCardProps {
  totalLucroParceiros: number;
  totalCustosAquisicao: number;
  totalParceirosAtivos: number;
  diasMedioAquisicao: number;
  margemLiquida: number;
  capitalOperacional: number;
  formatCurrency: (value: number) => string;
}

export function RentabilidadeCaptacaoCard({
  totalLucroParceiros,
  totalCustosAquisicao,
  totalParceirosAtivos,
  diasMedioAquisicao,
  margemLiquida,
  capitalOperacional,
  formatCurrency,
}: RentabilidadeCaptacaoCardProps) {
  // ROI da Captação = (Lucro Parceiros - Custos) / Custos * 100
  const roiCaptacao = totalCustosAquisicao > 0 
    ? ((totalLucroParceiros - totalCustosAquisicao) / totalCustosAquisicao) * 100
    : 0;

  // Custo médio por parceiro
  const custoMedioParceiro = totalParceirosAtivos > 0 
    ? totalCustosAquisicao / totalParceirosAtivos 
    : 0;

  // Lucro médio por parceiro
  const lucroMedioParceiro = totalParceirosAtivos > 0 
    ? totalLucroParceiros / totalParceirosAtivos 
    : 0;

  // Payback em dias (estimativa baseada no lucro médio diário)
  const lucroDiarioMedio = totalLucroParceiros / Math.max(diasMedioAquisicao, 30);
  const paybackDias = lucroDiarioMedio > 0 
    ? Math.ceil(totalCustosAquisicao / lucroDiarioMedio)
    : Infinity;

  // Margem percentual
  const margemPercent = capitalOperacional > 0 
    ? (margemLiquida / capitalOperacional) * 100 
    : 0;

  const isPositiveROI = roiCaptacao >= 0;
  const isPositiveMargem = margemLiquida >= 0;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          Rentabilidade da Captação
          <TooltipProvider>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <button className="text-muted-foreground hover:text-foreground transition-colors">
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[280px] text-xs">
                <p className="font-medium mb-1">Rentabilidade da Captação</p>
                <p><strong>ROI:</strong> (Lucro dos Parceiros - Custos de Aquisição) / Custos × 100</p>
                <p><strong>Payback:</strong> Estimativa em dias para recuperar o investimento em captação</p>
                <p><strong>Margem:</strong> Capital disponível após deduzir todos os custos</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ROI Principal */}
        <div className="text-center p-4 bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl border border-primary/20">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">ROI da Captação</p>
          <div className={cn(
            "text-3xl font-bold flex items-center justify-center gap-2",
            isPositiveROI ? "text-success" : "text-destructive"
          )}>
            {isPositiveROI ? <TrendingUp className="h-6 w-6" /> : <TrendingDown className="h-6 w-6" />}
            {roiCaptacao.toFixed(1)}%
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Lucro {formatCurrency(totalLucroParceiros)} / Investido {formatCurrency(totalCustosAquisicao)}
          </p>
        </div>

        {/* Métricas Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Custo Médio por Parceiro */}
          <div className="p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-1.5 mb-1">
              <Percent className="h-3 w-3 text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground uppercase">Custo/Parceiro</p>
            </div>
            <p className="text-sm font-bold">{formatCurrency(custoMedioParceiro)}</p>
          </div>

          {/* Lucro Médio por Parceiro */}
          <div className="p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="h-3 w-3 text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground uppercase">Lucro/Parceiro</p>
            </div>
            <p className={cn("text-sm font-bold", lucroMedioParceiro >= custoMedioParceiro ? "text-success" : "text-destructive")}>
              {formatCurrency(lucroMedioParceiro)}
            </p>
          </div>

          {/* Payback */}
          <div className="p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground uppercase">Payback</p>
            </div>
            <p className={cn(
              "text-sm font-bold",
              paybackDias <= 30 ? "text-success" : paybackDias <= 60 ? "text-yellow-500" : "text-destructive"
            )}>
              {paybackDias === Infinity ? "N/A" : `${paybackDias} dias`}
            </p>
          </div>

          {/* Parceiros Ativos */}
          <div className="p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-1.5 mb-1">
              <Target className="h-3 w-3 text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground uppercase">Parceiros</p>
            </div>
            <p className="text-sm font-bold">{totalParceirosAtivos}</p>
          </div>
        </div>

        {/* Margem Líquida */}
        <div className={cn(
          "flex items-center justify-between p-3 rounded-lg border",
          isPositiveMargem 
            ? "bg-success/5 border-success/20" 
            : "bg-destructive/5 border-destructive/20"
        )}>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase">Margem Líquida</p>
            <p className={cn("text-lg font-bold", isPositiveMargem ? "text-success" : "text-destructive")}>
              {formatCurrency(margemLiquida)}
            </p>
          </div>
          <div className={cn(
            "text-right px-3 py-1.5 rounded-lg",
            isPositiveMargem ? "bg-success/10" : "bg-destructive/10"
          )}>
            <p className={cn("text-lg font-bold", isPositiveMargem ? "text-success" : "text-destructive")}>
              {margemPercent >= 0 ? "+" : ""}{margemPercent.toFixed(1)}%
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
