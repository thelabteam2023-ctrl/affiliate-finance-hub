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
  
  const { formatCurrency, getSymbol, cotacaoAtual, convertToConsolidation } = useProjetoCurrency(projetoId);
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

  // Saldo Atual = patrimônio total nas casas (saldo operável já inclui real + em jogo + freebet + bonus)
  const saldoAtualTotal = saldoOperavel;

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
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center">
            <Wallet className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground tracking-tight">Patrimônio nas Casas</h3>
            <p className="text-[10px] text-muted-foreground">Visão consolidada em {moedaConsolidacao}</p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Total</p>
          <p className="text-base font-bold text-foreground tabular-nums">{formatCurrency(Math.max(0, saldoOperavel))}</p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-500/5 border border-amber-500/20 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Em Jogo</p>
          <p className="text-base font-bold text-amber-500 tabular-nums">{formatCurrency(saldoEmAposta)}</p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Disponível</p>
          <p className="text-base font-bold text-emerald-500 tabular-nums">{formatCurrency(Math.max(0, saldoOperavel - saldoEmAposta))}</p>
        </div>
      </div>

      {/* Badges de Freebet/Bônus removidos a pedido — informação já visível por casa */}


      {/* Saldo por Casa */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-foreground">Saldo por Casa</p>
          <span className="text-[10px] text-muted-foreground">{casasComSaldo.length} casa{casasComSaldo.length !== 1 ? 's' : ''}</span>
        </div>
        
        {casasComSaldo.length >= 8 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar por casa ou titular..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 pl-9 text-xs bg-muted/20 border-border/40 rounded-lg"
              autoFocus
            />
          </div>
        )}

        <div 
          className="grid gap-2"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))" }}
        >
          {filteredCasas.map((casa) => {
            const titular = casa.instanceIdentifier || casa.parceiroPrimeiroNome;
            return (
              <div 
                key={casa.id} 
                className={cn(
                  "group rounded-xl border p-3 transition-all duration-200",
                  casa.aguardandoSaque 
                    ? "bg-orange-500/5 border-orange-500/25 hover:border-orange-500/40" 
                    : "bg-muted/15 border-border/40 hover:border-primary/30 hover:bg-muted/30"
                )}
              >
                {/* Row 1: Casa name + Balance + Currency */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {casa.logoUrl && (
                        <img src={casa.logoUrl} alt="" className="h-4 w-4 rounded-sm object-contain flex-shrink-0" />
                      )}
                      <span className="text-xs font-bold text-foreground truncate uppercase tracking-wide">
                        {casa.nome}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                    <div className="flex items-baseline gap-1.5">
                      <SaldoCompostoSimples
                        saldoReal={casa.saldoDisponivelNativo}
                        saldoFreebet={casa.saldoFreebetNativo}
                        formatCurrency={(val) => formatCurrencyUtil(val, casa.moedaOriginal)}
                        className="text-sm text-primary font-bold whitespace-nowrap tabular-nums"
                      />
                      <span className="text-[9px] text-muted-foreground font-mono">{casa.moedaOriginal}</span>
                    </div>
                    {casa.moedaOriginal !== moedaConsolidacao && (casa.saldoDisponivelNativo + casa.saldoFreebetNativo) > 0 && (
                      <span className="text-[10px] text-muted-foreground/80 tabular-nums whitespace-nowrap">
                        ≈ {formatCurrency(convertToConsolidation(casa.saldoDisponivelNativo + casa.saldoFreebetNativo, casa.moedaOriginal))}
                      </span>
                    )}
                  </div>

                </div>

                {/* Row 2: Titular + Em Jogo */}
                <div className="flex items-center justify-between gap-1.5 mt-1">
                  {titular ? (
                    <span className="text-[11px] text-muted-foreground truncate">
                      <span className="text-muted-foreground/60">Titular:</span>{" "}
                      <span className="text-foreground/70 font-medium">{titular}</span>
                    </span>
                  ) : <span />}
                  {casa.saldoEmApostaNativo > 0 && (
                    <span className="text-[10px] text-amber-400 tabular-nums flex items-center gap-1 flex-shrink-0">
                      <Clock className="h-3 w-3" />
                      {formatCurrencyUtil(casa.saldoEmApostaNativo, casa.moedaOriginal)} em jogo
                    </span>
                  )}
                </div>

                {/* Row 3: Em Saque badge */}
                {casa.aguardandoSaque && (
                  <div className="mt-1.5">
                    <Badge 
                      variant="outline" 
                      className="text-[9px] px-1.5 py-0.5 bg-orange-500/15 border-orange-500/30 text-orange-400 font-medium gap-0.5"
                    >
                      <Clock className="h-2.5 w-2.5" />
                      Em Saque
                    </Badge>
                  </div>
                )}

                {/* Row 3: Rollover progress */}
                {casa.hasRollover && (
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/30">
                    <Gift className="h-3 w-3 text-amber-500 flex-shrink-0" />
                    <Progress 
                      value={casa.rolloverPercentual} 
                      className="h-1.5 flex-1"
                    />
                    <span className="text-[10px] font-medium text-amber-500 tabular-nums w-8 text-right">
                      {casa.rolloverPercentual.toFixed(0)}%
                    </span>
                  </div>
                )}
              </div>
            );
          })}

          {filteredCasas.length === 0 && searchTerm && (
            <p className="text-xs text-muted-foreground col-span-full text-center py-6">
              Nenhuma casa encontrada para "{searchTerm}"
            </p>
          )}
        </div>
      </div>
      
      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-border/30">
        <p className="text-[10px] text-muted-foreground">
          {casasComSaldo.length} com saldo
          {casasComRollover > 0 && ` · ${casasComRollover} rollover`}
          {casasAguardandoSaque > 0 && ` · ${casasAguardandoSaque} em saque`}
        </p>
        <Badge variant="outline" className="text-[9px] px-1.5 py-0.5 bg-muted/30 border-border/40 text-muted-foreground font-normal">
          Consolidado em {moedaConsolidacao}
        </Badge>
      </div>
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
