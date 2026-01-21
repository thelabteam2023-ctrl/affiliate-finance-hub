import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Wallet, ChevronDown, AlertTriangle, RefreshCw, Gift, Target } from "lucide-react";
import { useSaldoOperavel } from "@/hooks/useSaldoOperavel";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface SaldoOperavelCardProps {
  projetoId: string;
  variant?: "default" | "compact";
}

/**
 * Card do KPI "Saldo Operável" - SIMPLIFICADO
 * 
 * Mostra:
 * - Valor total operável (único número de destaque)
 * - Badge "Rollover Ativo" quando há bônus com rollover pendente
 * - Barra de progresso do rollover (se aplicável)
 * - Tooltip/popover com breakdown detalhado
 * 
 * Filosofia: O saldo é UM SÓ para fins operacionais.
 * Bônus é contexto informativo (rollover), não separação de saldo.
 */
export function SaldoOperavelCard({ projetoId, variant = "default" }: SaldoOperavelCardProps) {
  const { 
    saldoOperavel, 
    saldoReal, 
    saldoBonus, 
    saldoFreebet, 
    saldoEmAposta,
    rollover,
    casasComSaldo,
    totalCasas, 
    isLoading,
    isError,
    refetch
  } = useSaldoOperavel(projetoId);
  const { formatCurrency } = useProjetoCurrency(projetoId);
  const [isRetrying, setIsRetrying] = useState(false);
  
  // Detectar se é mobile
  const [isMobile, setIsMobile] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleRetry = async () => {
    setIsRetrying(true);
    await refetch();
    setIsRetrying(false);
  };

  if (isLoading) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6">
          <Skeleton className="h-4 w-24" />
        </CardHeader>
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
          <Skeleton className="h-8 w-32" />
        </CardContent>
      </Card>
    );
  }

  // Estado de erro - permite retry
  if (isError) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6">
          <CardTitle className="text-xs md:text-sm font-medium flex items-center gap-1.5 text-destructive">
            Saldo Operável
            <AlertTriangle className="h-3.5 w-3.5 md:h-4 md:w-4" />
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
          <p className="text-xs text-destructive mb-2">Erro ao carregar saldo</p>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRetry}
            disabled={isRetrying}
            className="h-7 text-xs"
          >
            <RefreshCw className={cn("h-3 w-3 mr-1", isRetrying && "animate-spin")} />
            {isRetrying ? "Carregando..." : "Tentar novamente"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const hasCasas = casasComSaldo.length > 0;
  const hasBonus = saldoBonus > 0;
  const hasFreebet = saldoFreebet > 0;

  // Conteúdo do detalhamento por casa
  const CasasBreakdown = () => (
    <div className="space-y-3">
      {/* Rollover Status - Destaque se ativo */}
      {rollover.hasActiveRollover && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-amber-400 flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5" />
              Rollover em Andamento
            </span>
            <span className="text-sm font-bold text-amber-400">
              {rollover.percentual.toFixed(1)}%
            </span>
          </div>
          <Progress 
            value={rollover.percentual} 
            className="h-2 bg-amber-500/20"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{formatCurrency(rollover.totalProgress)} apostado</span>
            <span>Meta: {formatCurrency(rollover.totalTarget)}</span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {rollover.casasComRollover} casa{rollover.casasComRollover !== 1 ? 's' : ''} com rollover ativo
          </p>
        </div>
      )}

      {/* Composição do Saldo */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-foreground">Composição do Saldo</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded bg-muted/30">
            <span className="text-muted-foreground">Saldo Real</span>
            <p className="font-semibold">{formatCurrency(saldoReal)}</p>
          </div>
          {hasFreebet && (
            <div className="p-2 rounded bg-cyan-500/10 border border-cyan-500/20">
              <span className="text-cyan-400">Freebet</span>
              <p className="font-semibold text-cyan-400">{formatCurrency(saldoFreebet)}</p>
            </div>
          )}
          {hasBonus && (
            <div className="p-2 rounded bg-purple-500/10 border border-purple-500/20">
              <span className="text-purple-400">Bônus Creditado</span>
              <p className="font-semibold text-purple-400">{formatCurrency(saldoBonus)}</p>
            </div>
          )}
          {saldoEmAposta > 0 && (
            <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20">
              <span className="text-amber-500">Em Apostas</span>
              <p className="font-semibold text-amber-500">-{formatCurrency(saldoEmAposta)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Lista de casas */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">Saldo por Casa</p>
        <ScrollArea className={cn(
          casasComSaldo.length > 4 ? "h-[200px]" : "h-auto"
        )}>
          <div className="space-y-1.5 pr-2">
            {casasComSaldo.map((casa) => (
              <div 
                key={casa.id} 
                className="p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-foreground truncate max-w-[140px]">
                    {casa.nome}
                    {casa.parceiroPrimeiroNome && (
                      <span className="text-primary/80 ml-1 font-normal">
                        {casa.parceiroPrimeiroNome}
                      </span>
                    )}
                  </span>
                  <span className="text-sm font-bold text-primary ml-2 whitespace-nowrap">
                    {formatCurrency(casa.saldoOperavel)}
                  </span>
                </div>
                {(casa.saldoFreebet > 0 || casa.saldoBonus > 0 || casa.saldoEmAposta > 0) && (
                  <div className="flex gap-2 mt-1 text-[10px]">
                    {casa.saldoFreebet > 0 && (
                      <span className="text-cyan-400">FB: {formatCurrency(casa.saldoFreebet)}</span>
                    )}
                    {casa.saldoBonus > 0 && (
                      <span className="text-purple-400">Bônus: {formatCurrency(casa.saldoBonus)}</span>
                    )}
                    {casa.saldoEmAposta > 0 && (
                      <span className="text-amber-500">Pend: {formatCurrency(casa.saldoEmAposta)}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
      
      <p className="text-[10px] text-muted-foreground pt-1 border-t">
        {casasComSaldo.length} casa{casasComSaldo.length !== 1 ? 's' : ''} com saldo
      </p>
    </div>
  );

  // Badge de rollover ativo
  const RolloverBadge = () => {
    if (!rollover.hasActiveRollover) return null;
    
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge 
              variant="outline" 
              className={cn(
                "text-[10px] h-5 gap-1 cursor-help",
                rollover.isComplete 
                  ? "border-emerald-500/50 text-emerald-500 bg-emerald-500/10" 
                  : "border-amber-500/50 text-amber-500 bg-amber-500/10"
              )}
            >
              <Gift className="h-3 w-3" />
              {rollover.isComplete ? "Rollover Completo" : `${rollover.percentual.toFixed(0)}%`}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">
              {rollover.isComplete 
                ? "Rollover concluído! Saldo pode ser sacado."
                : `Rollover: ${formatCurrency(rollover.totalProgress)} / ${formatCurrency(rollover.totalTarget)}`
              }
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  // Trigger para desktop (Popover) ou mobile (Dialog)
  const TriggerContent = ({ isCompact = false }: { isCompact?: boolean }) => (
    <div className={cn(
      "flex items-center gap-2 cursor-pointer group",
      isCompact && "px-3 py-1.5 rounded-md bg-primary/10 border border-primary/20"
    )}>
      {isCompact && <Wallet className="h-4 w-4 text-primary" />}
      <span className={cn(
        "font-bold text-primary",
        isCompact ? "text-sm font-medium" : "text-lg md:text-2xl"
      )}>
        {formatCurrency(saldoOperavel)}
      </span>
      {!isCompact && <RolloverBadge />}
      {hasCasas && (
        <ChevronDown className={cn(
          "h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:text-primary",
          isCompact && "h-3 w-3"
        )} />
      )}
    </div>
  );

  // Barra de progresso mini para rollover
  const MiniRolloverProgress = () => {
    if (!rollover.hasActiveRollover || rollover.isComplete) return null;
    
    return (
      <div className="mt-2 space-y-1">
        <Progress 
          value={rollover.percentual} 
          className="h-1.5 bg-amber-500/20"
        />
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Target className="h-3 w-3 text-amber-500" />
          Rollover: {rollover.percentual.toFixed(0)}% concluído
        </p>
      </div>
    );
  };

  if (variant === "compact") {
    if (isMobile) {
      return (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <div className="cursor-pointer">
              <TriggerContent isCompact />
            </div>
          </DialogTrigger>
          <DialogContent className="max-w-[90vw] sm:max-w-[340px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Wallet className="h-4 w-4 text-primary" />
                Saldo Operável
              </DialogTitle>
            </DialogHeader>
            <CasasBreakdown />
          </DialogContent>
        </Dialog>
      );
    }

    return (
      <Popover>
        <PopoverTrigger asChild>
          <div className="cursor-pointer">
            <TriggerContent isCompact />
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-3" align="start">
          <CasasBreakdown />
        </PopoverContent>
      </Popover>
    );
  }

  // Variant default
  if (isMobile) {
    return (
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6">
            <CardTitle className="text-xs md:text-sm font-medium flex items-center gap-1.5">
              Saldo Operável
              <Wallet className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <DialogTrigger asChild>
              <div className="cursor-pointer">
                <TriggerContent />
              </div>
            </DialogTrigger>
            <MiniRolloverProgress />
            <p className="text-[10px] md:text-xs text-muted-foreground mt-1">
              {totalCasas} casa{totalCasas !== 1 ? 's' : ''}
              {(hasBonus || hasFreebet) && " • Inclui bônus/freebet"}
            </p>
          </CardContent>
        </Card>
        <DialogContent className="max-w-[90vw] sm:max-w-[340px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4 text-primary" />
              Saldo Operável
            </DialogTitle>
          </DialogHeader>
          <CasasBreakdown />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Popover>
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6">
          <CardTitle className="text-xs md:text-sm font-medium flex items-center gap-1.5">
            Saldo Operável
            <Wallet className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary" />
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
          <PopoverTrigger asChild>
            <div className="cursor-pointer">
              <TriggerContent />
            </div>
          </PopoverTrigger>
          <MiniRolloverProgress />
          <p className="text-[10px] md:text-xs text-muted-foreground mt-1">
            {totalCasas} casa{totalCasas !== 1 ? 's' : ''}
            {(hasBonus || hasFreebet) && " • Inclui bônus/freebet"}
          </p>
        </CardContent>
      </Card>
      <PopoverContent className="w-[340px] p-4" align="start">
        <CasasBreakdown />
      </PopoverContent>
    </Popover>
  );
}
