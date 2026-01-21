import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Wallet, ChevronDown, AlertTriangle, RefreshCw, Gift } from "lucide-react";
import { useSaldoOperavel } from "@/hooks/useSaldoOperavel";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { SaldoCompostoSimples } from "@/components/ui/saldo-composto";

interface SaldoOperavelCardProps {
  projetoId: string;
  variant?: "default" | "compact";
}

/**
 * Card do KPI "Saldo Operável" - SIMPLIFICADO
 * 
 * Mostra:
 * - Valor total operável (único número de destaque)
 * - Lista de casas com rollover individual (🎁 + barra por casa)
 * - Tooltip/popover com breakdown detalhado
 * 
 * Filosofia: O saldo é UM SÓ para fins operacionais.
 * Rollover é mostrado por casa, não agregado.
 */
export function SaldoOperavelCard({ projetoId, variant = "default" }: SaldoOperavelCardProps) {
  const { 
    saldoOperavel, 
    saldoReal, 
    saldoBonus,
    saldoFreebet, 
    saldoEmAposta,
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
  const hasFreebet = saldoFreebet > 0;
  const hasBonus = saldoBonus > 0;
  const casasComRollover = casasComSaldo.filter(c => c.hasRollover).length;

  // Conteúdo do detalhamento por casa
  const CasasBreakdown = () => (
    <div className="space-y-3">
      {/* Composição do Saldo - Simplificado */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-foreground">Composição do Saldo</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded bg-muted/30">
            <span className="text-muted-foreground">Saldo Real</span>
            <p className="font-semibold">{formatCurrency(saldoReal)}</p>
          </div>
          {hasFreebet && (
            <div className="p-2 rounded bg-muted/30">
              <span className="text-muted-foreground">Freebet</span>
              <p className="font-semibold text-amber-500">{formatCurrency(saldoFreebet)}</p>
            </div>
          )}
          {hasBonus && (
            <div className="p-2 rounded bg-muted/30">
              <span className="text-muted-foreground">Bônus</span>
              <p className="font-semibold text-purple-500">{formatCurrency(saldoBonus)}</p>
            </div>
          )}
          {saldoEmAposta > 0 && (
            <div className="p-2 rounded bg-muted/30">
              <span className="text-muted-foreground">Em Apostas</span>
              <p className="font-semibold">-{formatCurrency(saldoEmAposta)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Lista de casas com rollover individual */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">Saldo por Casa</p>
        <ScrollArea className={cn(
          casasComSaldo.length > 4 ? "h-[280px]" : "h-auto"
        )}>
          <div className="space-y-2 pr-2">
            {casasComSaldo.map((casa) => (
              <div 
                key={casa.id} 
                className="p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors space-y-1.5"
              >
                {/* Nome e Saldo Composto */}
                <div className="flex justify-between items-center gap-2">
                  <span className="text-xs font-medium text-foreground truncate max-w-[120px]">
                    {casa.nome}
                    {casa.parceiroPrimeiroNome && (
                      <span className="text-primary/80 ml-1 font-normal">
                        {casa.parceiroPrimeiroNome}
                      </span>
                    )}
                  </span>
                  <SaldoCompostoSimples
                    saldoReal={casa.saldoReal}
                    saldoFreebet={casa.saldoFreebet}
                    formatCurrency={(val) => formatCurrency(val)}
                    className="text-sm text-primary"
                  />
                </div>
                
                {/* Rollover individual com 🎁 */}
                {casa.hasRollover && (
                  <div className="flex items-center gap-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Gift className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">
                            Rollover: {formatCurrency(casa.rolloverProgress)} / {formatCurrency(casa.rolloverTarget)}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Progress 
                            value={casa.rolloverPercentual} 
                            className="h-1.5 flex-1 cursor-help"
                          />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">
                            {formatCurrency(casa.rolloverProgress)} de {formatCurrency(casa.rolloverTarget)}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {casa.rolloverPercentual.toFixed(0)}%
                    </span>
                  </div>
                )}
                
                {/* Info extra: Em aposta (freebet já está no saldo composto acima) */}
                {casa.saldoEmAposta > 0 && (
                  <div className="flex gap-3 text-[10px]">
                    <span className="text-muted-foreground">
                      Pendente: <span className="font-medium">{formatCurrency(casa.saldoEmAposta)}</span>
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
      
      <p className="text-[10px] text-muted-foreground pt-1 border-t">
        {casasComSaldo.length} casa{casasComSaldo.length !== 1 ? 's' : ''} com saldo
        {casasComRollover > 0 && ` • ${casasComRollover} com rollover`}
      </p>
    </div>
  );

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
      {/* Indicador de rollover ativo */}
      {casasComRollover > 0 && !isCompact && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Gift className="h-4 w-4 text-amber-500" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">{casasComRollover} casa{casasComRollover !== 1 ? 's' : ''} com rollover ativo</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {hasCasas && (
        <ChevronDown className={cn(
          "h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:text-primary",
          isCompact && "h-3 w-3"
        )} />
      )}
    </div>
  );

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
            <p className="text-[10px] md:text-xs text-muted-foreground mt-1">
              {totalCasas} casa{totalCasas !== 1 ? 's' : ''}
              {casasComRollover > 0 && ` • ${casasComRollover} com rollover`}
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
          <p className="text-[10px] md:text-xs text-muted-foreground mt-1">
            {totalCasas} casa{totalCasas !== 1 ? 's' : ''}
            {casasComRollover > 0 && ` • ${casasComRollover} com rollover`}
          </p>
        </CardContent>
      </Card>
      <PopoverContent className="w-[340px] p-4" align="start">
        <CasasBreakdown />
      </PopoverContent>
    </Popover>
  );
}
