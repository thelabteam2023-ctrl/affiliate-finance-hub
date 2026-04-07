import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Wallet, ChevronDown, AlertTriangle, RefreshCw, Gift, Search, X, Clock } from "lucide-react";
import { useSaldoOperavel } from "@/hooks/useSaldoOperavel";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
import { useCotacoes } from "@/hooks/useCotacoes";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { SaldoCompostoSimples } from "@/components/ui/saldo-composto";
import { formatCurrency as formatCurrencyUtil } from "@/utils/formatCurrency";
import { createPortal } from "react-dom";

interface SaldoOperavelCardProps {
  projetoId: string;
  variant?: "default" | "compact";
}

/**
 * Floating Overlay Panel for "Saldo por Casa"
 * - Fixed centered in viewport
 * - Backdrop click closes
 * - ESC closes
 * - Body scroll locked while open
 * - Responsive grid layout
 */
function SaldoOverlayPanel({
  isOpen,
  onClose,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Lock body scroll + ESC handler
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ background: "rgba(0,0,0,0.45)" }}
    >
      <div
        className="relative bg-background border border-border rounded-xl shadow-2xl flex flex-col"
        style={{
          width: "min(900px, 85vw)",
          maxWidth: "95vw",
          maxHeight: "80vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-3 right-3 h-7 w-7 z-10"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>

        {/* Scrollable content */}
        <div className="overflow-y-auto p-5 pr-10">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

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
    refetch,
    moedaConsolidacao
  } = useSaldoOperavel(projetoId);
  
  const { formatCurrency, getSymbol, cotacaoAtual } = useProjetoCurrency(projetoId);
  const { cotacaoUSD } = useCotacoes();
  
  const [isRetrying, setIsRetrying] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  const openPanel = useCallback(() => {
    console.log("[SaldoOperavelCard] openPanel called, setting isPanelOpen to true");
    setIsPanelOpen(true);
  }, []);
  const closePanel = useCallback(() => {
    setIsPanelOpen(false);
    setSearchTerm("");
  }, []);

  // Saldo Atual = patrimônio total nas casas (saldo_real + freebet), SEM descontar apostas em aberto
  const saldoAtualTotal = saldoReal + saldoFreebet;

  const conversaoVisual = useMemo(() => {
    if (moedaConsolidacao === "USD") {
      const valorBRL = saldoAtualTotal * cotacaoUSD;
      return { valor: valorBRL, moeda: "BRL", symbol: "R$", label: "≈ R$" };
    } else {
      const valorUSD = saldoAtualTotal / cotacaoUSD;
      return { valor: valorUSD, moeda: "USD", symbol: "$", label: "≈ $" };
    }
  }, [saldoAtualTotal, moedaConsolidacao, cotacaoUSD]);

  const handleRetry = async () => {
    setIsRetrying(true);
    await refetch();
    setIsRetrying(false);
  };

  const filteredCasas = useMemo(() => {
    if (!searchTerm.trim()) return casasComSaldo;
    const term = searchTerm.toLowerCase();
    return casasComSaldo.filter(c => 
      c.nome.toLowerCase().includes(term) || 
      c.parceiroPrimeiroNome?.toLowerCase().includes(term) ||
      c.instanceIdentifier?.toLowerCase().includes(term)
    );
  }, [casasComSaldo, searchTerm]);

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

  if (isError) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6">
          <CardTitle className="text-xs md:text-sm font-medium flex items-center gap-1.5 text-destructive">
            Saldo Atual
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
  const casasAguardandoSaque = casasComSaldo.filter(c => c.aguardandoSaque).length;

  // Inline trigger for compact variant
  const compactTrigger = (
    <div
      className="px-3 py-1.5 rounded-md bg-primary/10 border border-primary/20 flex flex-col items-center justify-center text-center cursor-pointer group"
      onClick={openPanel}
    >
      <div className="flex items-center justify-center gap-2">
        <Wallet className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium font-bold text-primary">
          {formatCurrency(saldoAtualTotal)}
        </span>
        {hasCasas && (
          <ChevronDown className="h-3 w-3 text-muted-foreground transition-transform group-hover:text-primary" />
        )}
      </div>
    </div>
  );

  // Inline trigger for default variant
  const defaultTrigger = (
    <div
      className="flex flex-col items-center justify-center text-center cursor-pointer group"
      onClick={openPanel}
    >
      <div className="flex items-center justify-center gap-2">
        <span className="text-lg md:text-2xl font-bold text-primary">
          {formatCurrency(saldoAtualTotal)}
        </span>
        {casasComRollover > 0 && (
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
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:text-primary" />
        )}
      </div>
      {saldoAtualTotal > 0 && (
        <span className="text-xs text-muted-foreground">
          {conversaoVisual.label} {conversaoVisual.valor.toLocaleString("pt-BR", { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
          })}
        </span>
      )}
    </div>
  );

  const subtitleText = (
    <p className="text-[10px] md:text-xs text-muted-foreground mt-1 text-center">
      {totalCasas} casa{totalCasas !== 1 ? 's' : ''}
      {casasComRollover > 0 && ` • ${casasComRollover} com rollover`}
    </p>
  );

  // Casas breakdown content (inline, not a component)
  const casasBreakdownContent = (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-border/50">
        <Wallet className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Saldo Atual</h3>
        <Badge 
          variant="outline" 
          className="text-[10px] px-2 py-0.5 bg-muted/50 border-muted-foreground/30 text-muted-foreground font-normal"
        >
          {moedaConsolidacao} • Moeda de Consolidação
        </Badge>
      </div>

      {/* Composição do Saldo — estilo lista com separadores */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">Composição do Saldo</p>
        <div className="space-y-0 text-xs rounded-lg border border-border/50 overflow-hidden">
          {/* Saldo Real */}
          <div className="flex items-center justify-between px-3 py-2 bg-muted/20">
            <span className="text-muted-foreground">Saldo Total</span>
            <span className="font-semibold">{formatCurrency(Math.max(0, saldoReal))}</span>
          </div>
          {/* Freebet */}
          {hasFreebet && (
            <div className="flex items-center justify-between px-3 py-2 bg-muted/20 border-t border-border/30">
              <span className="text-muted-foreground flex items-center gap-1">
                <Gift className="h-3 w-3 text-warning" />
                Freebet
              </span>
              <span className="font-semibold text-warning">{formatCurrency(saldoFreebet)}</span>
            </div>
          )}
          {/* Apostas em Aberto — dedução */}
          {saldoEmAposta > 0 && (
            <div className="flex items-center justify-between px-3 py-2 bg-amber-500/10 border-t border-border/30">
              <span className="text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3 text-amber-500" />
                Apostas em Aberto
              </span>
              <span className="font-semibold text-amber-500">{formatCurrency(saldoEmAposta)}</span>
            </div>
          )}
          {/* Saldo Livre = saldo disponível líquido + freebet */}
          <div className="flex items-center justify-between px-3 py-2.5 border-t border-border/50 bg-muted/30">
            <span className="font-semibold text-foreground">Saldo Livre</span>
            <span className="font-bold text-foreground">{formatCurrency(Math.max(0, saldoOperavel))}</span>
          </div>
        </div>
      </div>

      {/* Saldo por Casa — GRID RESPONSIVO */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">Saldo por Casa <span className="font-normal text-muted-foreground">— disponível para uso</span></p>
        
        {casasComSaldo.length >= 8 && (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar casa..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 pl-8 text-xs bg-muted/30 border-border/50"
              autoFocus
            />
          </div>
        )}

        <div 
          className="grid gap-2"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}
        >
          {filteredCasas.map((casa) => (
            <div 
              key={casa.id} 
              className={cn(
                "p-2 rounded-lg transition-colors",
                casa.aguardandoSaque 
                  ? "bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/15" 
                  : "bg-muted/30 hover:bg-muted/50"
              )}
            >
              <div className="flex items-center justify-between gap-1.5 min-w-0">
                <div className="flex items-center gap-1 min-w-0 flex-1">
                  <span className="text-xs font-medium text-foreground truncate">
                    {casa.nome}
                    {(casa.instanceIdentifier || casa.parceiroPrimeiroNome) && (
                      <span className="text-primary/80 ml-1 font-normal">
                        ({casa.instanceIdentifier || casa.parceiroPrimeiroNome})
                      </span>
                    )}
                  </span>
                  {casa.aguardandoSaque && (
                    <TooltipProvider delayDuration={0}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge 
                            variant="outline" 
                            className="text-[8px] px-1.5 py-0 bg-orange-500/15 border-orange-500/30 text-orange-400 font-medium leading-tight gap-0.5 flex-shrink-0"
                          >
                            <Clock className="h-2.5 w-2.5" />
                            Saque
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent className="z-[10000]">
                          <p className="text-xs">Aguardando processamento de saque</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Badge 
                    variant="outline" 
                    className="text-[8px] px-1 py-0 bg-muted/50 border-muted-foreground/30 text-muted-foreground font-normal leading-tight"
                  >
                    {casa.moedaOriginal}
                  </Badge>
                  <SaldoCompostoSimples
                    saldoReal={casa.saldoDisponivelNativo}
                    saldoFreebet={casa.saldoFreebetNativo}
                    formatCurrency={(val) => formatCurrencyUtil(val, casa.moedaOriginal)}
                    className="text-xs text-primary font-semibold whitespace-nowrap"
                  />
                </div>
              </div>
              
              {casa.hasRollover && (
                <div className="flex items-center gap-1.5 mt-1">
                  <Gift className="h-3 w-3 text-amber-500 flex-shrink-0" />
                  <Progress 
                    value={casa.rolloverPercentual} 
                    className="h-1 flex-1"
                  />
                  <span className="text-[9px] text-muted-foreground whitespace-nowrap w-7 text-right">
                    {casa.rolloverPercentual.toFixed(0)}%
                  </span>
                </div>
              )}
            </div>
          ))}

          {filteredCasas.length === 0 && searchTerm && (
            <p className="text-xs text-muted-foreground col-span-full text-center py-4">
              Nenhuma casa encontrada para "{searchTerm}"
            </p>
          )}
        </div>
      </div>
      
      <p className="text-xs text-muted-foreground pt-1.5 border-t border-border">
        {casasComSaldo.length} casa{casasComSaldo.length !== 1 ? 's' : ''} com saldo
        {casasComRollover > 0 && ` • ${casasComRollover} com rollover`}
        {casasAguardandoSaque > 0 && ` • ${casasAguardandoSaque} em saque`}
      </p>
    </div>
  );

  // Overlay panel (shared across all variants)
  const overlayPanel = (
    <SaldoOverlayPanel isOpen={isPanelOpen} onClose={closePanel}>
      {casasBreakdownContent}
    </SaldoOverlayPanel>
  );

  // Compact variant
  if (variant === "compact") {
    return (
      <>
        {compactTrigger}
        {overlayPanel}
      </>
    );
  }

  // Default variant
  return (
    <>
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="flex flex-row items-center justify-center space-y-0 pb-1 p-2 md:p-3">
          <CardTitle className="text-xs font-medium flex items-center gap-1.5">
            Saldo Operável
            <Wallet className="h-3.5 w-3.5 text-primary" />
          </CardTitle>
          <Badge 
            variant="outline" 
            className="ml-2 text-[9px] px-1.5 py-0 bg-muted/50 border-muted-foreground/30 text-muted-foreground font-normal"
          >
            {moedaConsolidacao}
          </Badge>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center p-2 pt-0 md:p-3 md:pt-0">
          {defaultTrigger}
          {subtitleText}
        </CardContent>
      </Card>
      {overlayPanel}
    </>
  );
}
