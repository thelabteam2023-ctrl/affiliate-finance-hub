import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Target, Clock, Percent, HelpCircle, AlertCircle, Timer, Loader2, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMemo } from "react";

interface RentabilidadeCaptacaoCardProps {
  totalLucroParceiros: number;
  totalCustosAquisicao: number;
  totalParceirosAtivos: number;
  diasMedioAquisicao: number;
  lucroOperacional: number; // Lucro real das apostas (bookmakers)
  formatCurrency: (value: number) => string;
}

type EstadoIndicador = 
  | "SEM_ATIVIDADE"      // Investimento = 0 e Parceiros = 0
  | "INVESTIMENTO_SEM_RETORNO" // Investimento > 0, Parceiros = 0, Lucro = 0
  | "EM_RAMP_UP"         // Investimento > 0, Parceiros > 0, Lucro < Custo
  | "RECUPERANDO"        // Investimento > 0, Parceiros > 0, 0 < Lucro < Custo
  | "LUCRATIVO"          // Investimento > 0, Parceiros > 0, Lucro >= Custo
  | "PARCEIROS_ENCERRADOS"; // Investimento > 0, Parceiros = 0, Lucro > 0

interface EstadoConfig {
  label: string;
  description: string;
  icon: React.ReactNode;
  bgColor: string;
  textColor: string;
  borderColor: string;
}

const getEstadoConfig = (estado: EstadoIndicador): EstadoConfig => {
  const configs: Record<EstadoIndicador, EstadoConfig> = {
    SEM_ATIVIDADE: {
      label: "Sem atividade",
      description: "Nenhum investimento ou parceiro registrado",
      icon: <AlertCircle className="h-5 w-5" />,
      bgColor: "bg-muted/30",
      textColor: "text-muted-foreground",
      borderColor: "border-muted",
    },
    INVESTIMENTO_SEM_RETORNO: {
      label: "Aguardando ativação",
      description: "Investimento realizado, aguardando parceiros ativos",
      icon: <Timer className="h-5 w-5" />,
      bgColor: "bg-amber-500/10",
      textColor: "text-amber-500",
      borderColor: "border-amber-500/20",
    },
    EM_RAMP_UP: {
      label: "Em ramp-up",
      description: "Parceiros em fase inicial de operação",
      icon: <Loader2 className="h-5 w-5 animate-spin" />,
      bgColor: "bg-blue-500/10",
      textColor: "text-blue-500",
      borderColor: "border-blue-500/20",
    },
    RECUPERANDO: {
      label: "Recuperando investimento",
      description: "Lucro positivo, ainda abaixo do investido",
      icon: <TrendingUp className="h-5 w-5" />,
      bgColor: "bg-cyan-500/10",
      textColor: "text-cyan-500",
      borderColor: "border-cyan-500/20",
    },
    LUCRATIVO: {
      label: "Lucrativo",
      description: "Investimento recuperado com lucro",
      icon: <CheckCircle className="h-5 w-5" />,
      bgColor: "bg-success/10",
      textColor: "text-success",
      borderColor: "border-success/20",
    },
    PARCEIROS_ENCERRADOS: {
      label: "Parceiros encerrados",
      description: "Lucro gerado, mas sem parceiros ativos atualmente",
      icon: <Clock className="h-5 w-5" />,
      bgColor: "bg-orange-500/10",
      textColor: "text-orange-500",
      borderColor: "border-orange-500/20",
    },
  };
  return configs[estado];
};

export function RentabilidadeCaptacaoCard({
  totalLucroParceiros,
  totalCustosAquisicao,
  totalParceirosAtivos,
  diasMedioAquisicao,
  lucroOperacional,
  formatCurrency,
}: RentabilidadeCaptacaoCardProps) {
  // Determinar estado do indicador
  const estado = useMemo((): EstadoIndicador => {
    const temInvestimento = totalCustosAquisicao > 0;
    const temParceiros = totalParceirosAtivos > 0;
    const temLucro = totalLucroParceiros > 0;

    if (!temInvestimento && !temParceiros) return "SEM_ATIVIDADE";
    if (temInvestimento && !temParceiros && !temLucro) return "INVESTIMENTO_SEM_RETORNO";
    if (temInvestimento && !temParceiros && temLucro) return "PARCEIROS_ENCERRADOS";
    if (temInvestimento && temParceiros && totalLucroParceiros < totalCustosAquisicao * 0.5) return "EM_RAMP_UP";
    if (temInvestimento && temParceiros && totalLucroParceiros < totalCustosAquisicao) return "RECUPERANDO";
    return "LUCRATIVO";
  }, [totalCustosAquisicao, totalParceirosAtivos, totalLucroParceiros]);

  const estadoConfig = getEstadoConfig(estado);

  // ROI da Captação = (Lucro Parceiros - Custos) / Custos * 100
  // Só calcular se houver investimento E dados válidos
  const podeCalcularROI = totalCustosAquisicao > 0 && totalParceirosAtivos > 0;
  const roiCaptacao = podeCalcularROI 
    ? ((totalLucroParceiros - totalCustosAquisicao) / totalCustosAquisicao) * 100
    : null;

  // Custo médio por parceiro - só calcular se houver parceiros
  const custoMedioParceiro = totalParceirosAtivos > 0 
    ? totalCustosAquisicao / totalParceirosAtivos 
    : null;

  // Lucro médio por parceiro - só calcular se houver parceiros
  const lucroMedioParceiro = totalParceirosAtivos > 0 
    ? totalLucroParceiros / totalParceirosAtivos 
    : null;

  // Payback em dias (estimativa baseada no lucro médio diário)
  // Só calcular se houver lucro e investimento
  const podeCalcularPayback = totalLucroParceiros > 0 && totalCustosAquisicao > 0;
  const lucroDiarioMedio = totalLucroParceiros / Math.max(diasMedioAquisicao, 30);
  const paybackDias = podeCalcularPayback && lucroDiarioMedio > 0
    ? Math.ceil(totalCustosAquisicao / lucroDiarioMedio)
    : null;

  // Lucro Operacional é positivo?
  const isPositiveLucro = lucroOperacional >= 0;

  return (
    <Card className={cn("overflow-hidden", estadoConfig.borderColor)}>
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
              <TooltipContent side="top" className="max-w-[320px] text-xs">
                <p className="font-medium mb-1">Rentabilidade da Captação</p>
                <p><strong>ROI:</strong> (Lucro dos Parceiros - Custos de Aquisição) / Custos × 100</p>
                <p><strong>Payback:</strong> Estimativa em dias para recuperar o investimento</p>
                <p><strong>Lucro Operacional:</strong> Resultado real das operações em bookmakers (lucro das apostas)</p>
                <p className="mt-2 text-muted-foreground">ROI e métricas por parceiro só são calculados quando há dados suficientes (parceiros ativos e investimento registrado).</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Estado do Indicador */}
        <div className={cn(
          "flex items-center gap-3 p-3 rounded-lg border",
          estadoConfig.bgColor,
          estadoConfig.borderColor
        )}>
          <div className={estadoConfig.textColor}>
            {estadoConfig.icon}
          </div>
          <div className="flex-1">
            <p className={cn("text-sm font-medium", estadoConfig.textColor)}>
              {estadoConfig.label}
            </p>
            <p className="text-xs text-muted-foreground">
              {estadoConfig.description}
            </p>
          </div>
        </div>

        {/* ROI Principal - Condicional */}
        {podeCalcularROI && roiCaptacao !== null ? (
          <div className="text-center p-4 bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl border border-primary/20">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">ROI da Captação</p>
            <div className={cn(
              "text-3xl font-bold flex items-center justify-center gap-2",
              roiCaptacao >= 0 ? "text-success" : "text-destructive"
            )}>
              {roiCaptacao >= 0 ? <TrendingUp className="h-6 w-6" /> : <TrendingDown className="h-6 w-6" />}
              {roiCaptacao.toFixed(1)}%
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Lucro {formatCurrency(totalLucroParceiros)} / Investido {formatCurrency(totalCustosAquisicao)}
            </p>
          </div>
        ) : (
          <div className="text-center p-4 bg-muted/20 rounded-xl border border-muted">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">ROI da Captação</p>
            <p className="text-lg font-medium text-muted-foreground">—</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {totalCustosAquisicao > 0 
                ? `${formatCurrency(totalCustosAquisicao)} investidos, aguardando maturação`
                : "Sem investimentos registrados"
              }
            </p>
          </div>
        )}

        {/* Métricas Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Custo Médio por Parceiro */}
          <div className="p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-1.5 mb-1">
              <Percent className="h-3 w-3 text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground uppercase">Custo/Parceiro</p>
            </div>
            <p className="text-sm font-bold">
              {custoMedioParceiro !== null ? formatCurrency(custoMedioParceiro) : "—"}
            </p>
          </div>

          {/* Lucro Médio por Parceiro */}
          <div className="p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="h-3 w-3 text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground uppercase">Lucro/Parceiro</p>
            </div>
            <p className={cn(
              "text-sm font-bold",
              lucroMedioParceiro === null ? "text-muted-foreground" :
              custoMedioParceiro !== null && lucroMedioParceiro >= custoMedioParceiro ? "text-success" : "text-destructive"
            )}>
              {lucroMedioParceiro !== null ? formatCurrency(lucroMedioParceiro) : "—"}
            </p>
          </div>

          {/* Payback */}
          <div className="p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground uppercase">Payback</p>
              <TooltipProvider>
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <button className="text-muted-foreground hover:text-foreground transition-colors">
                      <HelpCircle className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[280px] text-xs">
                    <p className="font-medium mb-1">Projeção de Payback</p>
                    <p>Fórmula: Custos ÷ (Lucro ÷ Dias de operação)</p>
                    <p className="mt-1 text-muted-foreground">
                      Operando há <strong>{diasMedioAquisicao} dias</strong> em média (calculado desde a data de início das parcerias ativas)
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className={cn(
              "text-sm font-bold",
              paybackDias === null ? "text-muted-foreground" :
              paybackDias <= 30 ? "text-success" : paybackDias <= 60 ? "text-yellow-500" : "text-destructive"
            )}>
              {paybackDias !== null ? `${paybackDias} dias` : "—"}
            </p>
            {paybackDias !== null && (
              <p className="text-[9px] text-muted-foreground mt-0.5">
                ~{Math.round(totalLucroParceiros / Math.max(diasMedioAquisicao, 30))}/dia
              </p>
            )}
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

        {/* Lucro Operacional (das bookmakers) */}
        <div className={cn(
          "flex items-center justify-between p-3 rounded-lg border",
          isPositiveLucro 
            ? "bg-success/5 border-success/20" 
            : "bg-destructive/5 border-destructive/20"
        )}>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] text-muted-foreground uppercase">Lucro Operacional</p>
              <TooltipProvider>
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <button className="text-muted-foreground hover:text-foreground transition-colors">
                      <HelpCircle className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px] text-xs">
                    <p>Resultado real das operações em bookmakers (lucro/prejuízo das apostas). Este é o ganho efetivo gerado pela atividade operacional.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className={cn("text-lg font-bold", isPositiveLucro ? "text-success" : "text-destructive")}>
              {formatCurrency(lucroOperacional)}
            </p>
          </div>
          <div className={cn(
            "flex items-center gap-1 px-3 py-1.5 rounded-lg",
            isPositiveLucro ? "bg-success/10" : "bg-destructive/10"
          )}>
            {isPositiveLucro ? (
              <TrendingUp className={cn("h-5 w-5", "text-success")} />
            ) : (
              <TrendingDown className={cn("h-5 w-5", "text-destructive")} />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
