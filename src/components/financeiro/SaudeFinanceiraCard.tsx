import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  HelpCircle, 
  Wallet,
  Landmark,
  Clock,
} from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SaudeFinanceiraData {
  liquidezImediata: number;
  reservaEstrategica: number;
  compromissosPendentes: {
    despesasAdmin: number;
    pagamentosOperador: number;
    total: number;
  };
  compromissosQuitados: {
    custosOperacionais: number;
    despesasAdmin: number;
    pagamentosOperador: number;
    total: number;
  };
}

interface SaudeFinanceiraCardProps {
  saudeData: SaudeFinanceiraData;
  formatCurrency: (value: number) => string;
}

// Componente do gráfico de barras horizontal
function HealthBarChart({
  liquidez,
  capitalResgatavel,
  compromissos,
  formatCurrency,
}: {
  liquidez: number;
  capitalResgatavel: number;
  compromissos: number;
  formatCurrency: (value: number) => string;
}) {
  const data = useMemo(() => {
    const capacidadeTotal = liquidez + capitalResgatavel;
    const maxValue = Math.max(capacidadeTotal, compromissos, 1);
    
    // Porcentagens para o gráfico
    const liquidezPercent = (liquidez / maxValue) * 100;
    const resgatPercent = (capitalResgatavel / maxValue) * 100;
    const compromissosPercent = (compromissos / maxValue) * 100;
    
    // Cobertura
    const cobertura = compromissos > 0 ? capacidadeTotal / compromissos : Infinity;
    
    // Status baseado na cobertura
    let statusColor = "bg-success";
    let statusLabel = "Excelente";
    if (cobertura < 1) {
      statusColor = "bg-destructive";
      statusLabel = "Crítico";
    } else if (cobertura < 1.5) {
      statusColor = "bg-yellow-500";
      statusLabel = "Atenção";
    } else if (cobertura < 3) {
      statusColor = "bg-success";
      statusLabel = "Saudável";
    }
    
    return {
      liquidezPercent,
      resgatPercent,
      compromissosPercent,
      capacidadeTotal,
      cobertura,
      statusColor,
      statusLabel,
      maxValue,
    };
  }, [liquidez, capitalResgatavel, compromissos]);

  if (compromissos === 0 && liquidez === 0 && capitalResgatavel === 0) {
    return null;
  }

  return (
    <div className="space-y-3 p-3 bg-muted/20 rounded-lg">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-muted-foreground">Capacidade vs Compromissos</span>
        <span className="text-[10px] text-muted-foreground">
          Cobertura: {data.cobertura === Infinity ? "∞" : `${data.cobertura.toFixed(1)}x`}
        </span>
      </div>
      
      {/* Barra de Capacidade (Liquidez + Resgatável) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">Capacidade Total</span>
          <span className="font-medium text-foreground">{formatCurrency(data.capacidadeTotal)}</span>
        </div>
        <div className="relative h-6 bg-muted/50 rounded-md overflow-hidden">
          {/* Liquidez */}
          <div 
            className="absolute h-full bg-primary/80 transition-all duration-500 flex items-center justify-end"
            style={{ width: `${data.liquidezPercent}%`, left: 0 }}
          >
            {data.liquidezPercent > 15 && (
              <span className="text-[9px] text-primary-foreground font-medium pr-1 truncate">
                Liquidez
              </span>
            )}
          </div>
          {/* Capital Resgatável */}
          <div 
            className="absolute h-full bg-primary/40 transition-all duration-500 flex items-center justify-end"
            style={{ 
              width: `${data.resgatPercent}%`, 
              left: `${data.liquidezPercent}%` 
            }}
          >
            {data.resgatPercent > 15 && (
              <span className="text-[9px] text-foreground font-medium pr-1 truncate">
                Resgatável
              </span>
            )}
          </div>
        </div>
      </div>
      
      {/* Barra de Compromissos */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">Compromissos Pendentes</span>
          <span className="font-medium text-destructive">{formatCurrency(compromissos)}</span>
        </div>
        <div className="relative h-6 bg-muted/50 rounded-md overflow-hidden">
          <div 
            className="absolute h-full bg-destructive/70 transition-all duration-500 flex items-center justify-end"
            style={{ width: `${data.compromissosPercent}%`, left: 0 }}
          >
            {data.compromissosPercent > 15 && (
              <span className="text-[9px] text-destructive-foreground font-medium pr-1 truncate">
                Pendentes
              </span>
            )}
          </div>
        </div>
      </div>
      
      {/* Legenda de Cobertura */}
      <div className="flex items-center gap-4 pt-2 border-t border-border/30">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-primary/80" />
          <span className="text-[10px] text-muted-foreground">Liquidez</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-primary/40" />
          <span className="text-[10px] text-muted-foreground">Capital Resgatável</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-destructive/70" />
          <span className="text-[10px] text-muted-foreground">Compromissos</span>
        </div>
      </div>
      
      {/* Indicadores de Referência */}
      <div className="flex items-center justify-between text-[9px] text-muted-foreground pt-1">
        <span className={data.cobertura >= 1 ? "text-success" : "text-destructive"}>
          1x = Cobertura Mínima
        </span>
        <span className={data.cobertura >= 1.5 ? "text-success" : "text-muted-foreground"}>
          1.5x = Saudável
        </span>
        <span className={data.cobertura >= 3 ? "text-success" : "text-muted-foreground"}>
          3x = Excelente
        </span>
      </div>
    </div>
  );
}

export function SaudeFinanceiraCard({
  saudeData,
  formatCurrency,
}: SaudeFinanceiraCardProps) {
  const { liquidezImediata, reservaEstrategica, compromissosPendentes, compromissosQuitados } = saudeData;

  // Capacidade total = liquidez + reserva estratégica (capital recuperável)
  const capacidadeTotal = liquidezImediata + reservaEstrategica;
  
  // Cobertura = Capacidade Total / Compromissos Pendentes
  const cobertura = compromissosPendentes.total > 0 
    ? capacidadeTotal / compromissosPendentes.total 
    : Infinity;

  // Saúde % = baseado na cobertura dos compromissos pendentes
  // 100% = pode cobrir todos os compromissos só com liquidez
  // >100% = sobra capital
  // <100% = precisa usar reserva
  const saudePercent = compromissosPendentes.total > 0 
    ? Math.min(100, (liquidezImediata / compromissosPendentes.total) * 100)
    : 100;

  // Folga financeira = capital disponível após pagar todos os compromissos
  const folgaFinanceira = capacidadeTotal - compromissosPendentes.total;

  // Status baseado na capacidade de cobertura
  const getStatus = () => {
    if (compromissosPendentes.total === 0) {
      return { 
        color: "text-success", 
        bg: "bg-success", 
        bgLight: "bg-success/10",
        borderColor: "border-success/30",
        label: "Sem Pendências", 
        icon: CheckCircle,
        description: "Nenhum compromisso pendente"
      };
    }
    if (cobertura >= 3) {
      return { 
        color: "text-success", 
        bg: "bg-success", 
        bgLight: "bg-success/10",
        borderColor: "border-success/30",
        label: "Excelente", 
        icon: CheckCircle,
        description: "Cobertura superior a 3x os compromissos"
      };
    }
    if (cobertura >= 1.5) {
      return { 
        color: "text-success", 
        bg: "bg-success", 
        bgLight: "bg-success/10",
        borderColor: "border-success/30",
        label: "Saudável", 
        icon: CheckCircle,
        description: "Boa margem de segurança"
      };
    }
    if (cobertura >= 1) {
      return { 
        color: "text-yellow-500", 
        bg: "bg-yellow-500", 
        bgLight: "bg-yellow-500/10",
        borderColor: "border-yellow-500/30",
        label: "Atenção", 
        icon: AlertTriangle,
        description: "Compromissos cobertos, mas sem folga"
      };
    }
    return { 
      color: "text-destructive", 
      bg: "bg-destructive", 
      bgLight: "bg-destructive/10",
      borderColor: "border-destructive/30",
      label: "Crítico", 
      icon: AlertTriangle,
      description: "Capital insuficiente para cobrir compromissos"
    };
  };

  const status = getStatus();
  const StatusIcon = status.icon;

  // Calcular quanto da reserva estratégica seria necessária
  const usoReserva = Math.max(0, compromissosPendentes.total - liquidezImediata);
  const percentualReservaUsada = reservaEstrategica > 0 
    ? Math.min(100, (usoReserva / reservaEstrategica) * 100)
    : 0;

  return (
    <Card className={cn("overflow-hidden", status.borderColor)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Saúde Financeira
            <TooltipProvider>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors">
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[320px] text-xs">
                  <p className="font-medium mb-2">Saúde Financeira do Caixa</p>
                  <div className="space-y-1.5 text-muted-foreground">
                    <p><strong>Liquidez Imediata:</strong> Dinheiro livre no caixa operacional</p>
                    <p><strong>Capital Operacional Resgatável:</strong> Capital em bookmakers que pode ser sacado se necessário</p>
                    <p><strong>Compromissos Pendentes:</strong> Obrigações futuras não pagas (risco real)</p>
                    <p className="pt-1 border-t border-border/50">
                      <em>Custos já pagos não impactam a saúde financeira - são histórico.</em>
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
          <div className={cn("flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full", status.bgLight, status.color)}>
            <StatusIcon className="h-3.5 w-3.5" />
            {status.label}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{status.description}</p>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Indicador Principal - Folga Financeira */}
        <div className={cn("p-4 rounded-lg", status.bgLight)}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Folga Financeira</span>
            <TooltipProvider>
              <Tooltip delayDuration={300}>
                <TooltipTrigger>
                  <HelpCircle className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Capital restante após quitar todos os compromissos pendentes</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className={cn("text-2xl font-bold", folgaFinanceira >= 0 ? "text-success" : "text-destructive")}>
            {folgaFinanceira >= 0 ? "+" : ""}{formatCurrency(folgaFinanceira)}
          </div>
          {cobertura !== Infinity && cobertura > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Cobertura de {cobertura.toFixed(1)}x os compromissos
            </p>
          )}
        </div>

        {/* Grid de Métricas */}
        <div className="grid grid-cols-2 gap-3">
          {/* Liquidez Imediata */}
          <div className="p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-1.5 mb-1">
              <Wallet className="h-3.5 w-3.5 text-primary" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Liquidez Imediata</p>
            </div>
            <p className="text-sm font-bold text-foreground">{formatCurrency(liquidezImediata)}</p>
            <p className="text-[10px] text-muted-foreground">Caixa disponível agora</p>
          </div>

          {/* Capital Operacional Resgatável */}
          <div className="p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-1.5 mb-1">
              <Landmark className="h-3.5 w-3.5 text-primary" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Capital Resgatável</p>
            </div>
            <p className="text-sm font-bold text-foreground">{formatCurrency(reservaEstrategica)}</p>
            <p className="text-[10px] text-muted-foreground">Capital em bookmakers</p>
          </div>
        </div>

        {/* Gráfico de Barras - Visualização da Saúde */}
        <HealthBarChart
          liquidez={liquidezImediata}
          capitalResgatavel={reservaEstrategica}
          compromissos={compromissosPendentes.total}
          formatCurrency={formatCurrency}
        />

        {/* Compromissos Pendentes */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-destructive" />
              <span className="text-xs font-medium">Compromissos Pendentes</span>
            </div>
            <span className="text-sm font-bold text-destructive">
              {formatCurrency(compromissosPendentes.total)}
            </span>
          </div>
          
          {compromissosPendentes.total > 0 && (
            <div className="pl-5 space-y-1 text-xs text-muted-foreground">
              {compromissosPendentes.despesasAdmin > 0 && (
                <div className="flex justify-between">
                  <span>Despesas Admin.</span>
                  <span>{formatCurrency(compromissosPendentes.despesasAdmin)}</span>
                </div>
              )}
              {compromissosPendentes.pagamentosOperador > 0 && (
                <div className="flex justify-between">
                  <span>Pagamentos Operador</span>
                  <span>{formatCurrency(compromissosPendentes.pagamentosOperador)}</span>
                </div>
              )}
            </div>
          )}
          
          {compromissosPendentes.total === 0 && (
            <div className="pl-5 flex items-center gap-1.5 text-xs text-success">
              <CheckCircle className="h-3 w-3" />
              <span>Nenhum compromisso pendente</span>
            </div>
          )}
        </div>

        {/* Barra de Uso da Reserva (se necessário) */}
        {usoReserva > 0 && reservaEstrategica > 0 && (
          <div className="space-y-2 p-3 bg-yellow-500/5 rounded-lg border border-yellow-500/20">
            <div className="flex items-center justify-between text-xs">
              <span className="text-yellow-600 dark:text-yellow-400 font-medium">
                Uso necessário da reserva
              </span>
              <span className="text-yellow-600 dark:text-yellow-400 font-bold">
                {formatCurrency(usoReserva)}
              </span>
            </div>
            <div className="relative h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-yellow-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, percentualReservaUsada)}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              {percentualReservaUsada.toFixed(0)}% do capital resgatável seria utilizado para cobrir compromissos
            </p>
          </div>
        )}

        {/* Histórico de Custos Quitados (Referência) */}
        <div className="pt-3 border-t border-border/50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <CheckCircle className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Já Quitados (Histórico)</span>
            </div>
            <TooltipProvider>
              <Tooltip delayDuration={300}>
                <TooltipTrigger>
                  <HelpCircle className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Valores já pagos - não impactam a saúde financeira atual</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Total do período</span>
            <span className="font-medium">{formatCurrency(compromissosQuitados.total)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
