import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Wallet, ChevronDown } from "lucide-react";
import { useSaldoOperavel } from "@/hooks/useSaldoOperavel";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface SaldoOperavelCardProps {
  projetoId: string;
  variant?: "default" | "compact";
}

/**
 * Card do KPI "Saldo Operável"
 * 
 * Definição canônica:
 * Saldo Operável = Saldo Disponível + Freebet + Bônus Creditado
 * 
 * Onde Saldo Disponível = Saldo Real - Saldo em Aposta
 * 
 * Este é o valor TOTAL disponível para apostas agora.
 */
export function SaldoOperavelCard({ projetoId, variant = "default" }: SaldoOperavelCardProps) {
  const { 
    saldoOperavel, 
    saldoReal, 
    saldoFreebet, 
    casasComSaldo,
    totalCasas, 
    isLoading 
  } = useSaldoOperavel(projetoId);
  const { formatCurrency } = useProjetoCurrency(projetoId);
  
  // Detectar se é mobile
  const [isMobile, setIsMobile] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

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

  // Verifica se há freebet para mostrar breakdown detalhado
  const hasFreebet = saldoFreebet > 0;
  const hasCasas = casasComSaldo.length > 0;

  // Conteúdo do detalhamento por casa
  const CasasBreakdown = () => (
    <div className="space-y-2">
      <p className="text-xs font-medium text-foreground mb-3">Saldo por Casa</p>
      <ScrollArea className={cn(
        casasComSaldo.length > 6 ? "h-[200px]" : "h-auto"
      )}>
        <div className="space-y-1.5 pr-2">
          {casasComSaldo.map((casa) => (
            <div 
              key={casa.id} 
              className="flex justify-between items-center py-1.5 px-2 rounded bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <span className="text-xs text-muted-foreground truncate max-w-[160px]" title={`${casa.nome}${casa.parceiroNome ? ` - ${casa.parceiroNome}` : ''}`}>
                {casa.nome}{casa.nomeExibicao ? ` - ${casa.nomeExibicao}` : ''}
              </span>
              <span className="text-xs font-medium text-foreground ml-2">
                {formatCurrency(casa.saldoOperavel)}
              </span>
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="flex justify-between items-center pt-2 mt-2 border-t border-border/50">
        <span className="text-xs font-medium text-muted-foreground">Total Consolidado</span>
        <span className="text-sm font-bold text-primary">{formatCurrency(saldoOperavel)}</span>
      </div>
      <p className="text-[10px] text-muted-foreground pt-1">
        {casasComSaldo.length} casa{casasComSaldo.length !== 1 ? 's' : ''} com saldo
      </p>
    </div>
  );

  // Trigger para desktop (Popover) ou mobile (Dialog)
  const TriggerContent = ({ isCompact = false }: { isCompact?: boolean }) => (
    <div className={cn(
      "flex items-center gap-1 cursor-pointer group",
      isCompact && "gap-2 px-3 py-1.5 rounded-md bg-primary/10 border border-primary/20"
    )}>
      {isCompact && <Wallet className="h-4 w-4 text-primary" />}
      <span className={cn(
        "font-bold text-primary",
        isCompact ? "text-sm font-medium" : "text-lg md:text-2xl"
      )}>
        {formatCurrency(saldoOperavel)}
      </span>
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
        <PopoverContent className="w-[280px] p-3" align="start">
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
              {totalCasas} casa{totalCasas !== 1 ? 's' : ''} • Real{hasFreebet ? ' + FB' : ''}
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
            {totalCasas} casa{totalCasas !== 1 ? 's' : ''} • Real{hasFreebet ? ' + FB' : ''}
          </p>
        </CardContent>
      </Card>
      <PopoverContent className="w-[300px] p-4" align="start">
        <CasasBreakdown />
      </PopoverContent>
    </Popover>
  );
}
