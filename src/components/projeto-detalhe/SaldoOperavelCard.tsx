import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Wallet, ChevronDown, AlertTriangle, RefreshCw, Gift, Search, X } from "lucide-react";
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

  const openPanel = useCallback(() => setIsPanelOpen(true), []);
  const closePanel = useCallback(() => {
    setIsPanelOpen(false);
    setSearchTerm("");
  }, []);

  const conversaoVisual = useMemo(() => {
    if (moedaConsolidacao === "USD") {
      const valorBRL = saldoOperavel * cotacaoUSD;
      return { valor: valorBRL, moeda: "BRL", symbol: "R$", label: "≈ R$" };
    } else {
      const valorUSD = saldoOperavel / cotacaoUSD;
      return { valor: valorUSD, moeda: "USD", symbol: "$", label: "≈ $" };
    }
  }, [saldoOperavel, moedaConsolidacao, cotacaoUSD]);

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
      {/* Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-border/50">
        <Wallet className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Saldo Operável</h3>
        <Badge 
          variant="outline" 
          className="text-[10px] px-2 py-0.5 bg-muted/50 border-muted-foreground/30 text-muted-foreground font-normal"
        >
          {moedaConsolidacao} • Moeda de Consolidação
        </Badge>
      </div>

      {/* Composição do Saldo */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">Composição do Saldo</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2 rounded bg-muted/30">
            <span className="text-muted-foreground">Fiat (Real)</span>
            <p className="font-semibold">{formatCurrency(saldoReal)}</p>
          </div>
          {hasBonus && (
            <div className="p-2 rounded bg-muted/30">
              <span className="text-muted-foreground">Outros Créditos</span>
              <p className="font-semibold text-primary">{formatCurrency(saldoBonus)}</p>
            </div>
          )}
          {hasFreebet && (
            <div className="p-2 rounded bg-muted/30">
              <span className="text-muted-foreground">Freebet</span>
              <p className="font-semibold text-warning">{formatCurrency(saldoFreebet)}</p>
            </div>
          )}
          {saldoEmAposta > 0 && (
            <div className="p-2 rounded bg-muted/30">
              <span className="text-muted-foreground">Em Apostas</span>
              <p className="font-semibold text-destructive">-{formatCurrency(saldoEmAposta)}</p>
            </div>
          )}
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground bg-muted/20 p-2 rounded border border-border/30">
        Este saldo já inclui dinheiro real, freebets e créditos operáveis. 
        Os valores acima são apenas a decomposição do total.
      </p>

      {/* Saldo por Casa — GRID RESPONSIVO */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">Saldo por Casa</p>
        
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
              className="p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center justify-between gap-1.5 min-w-0">
                <div className="flex items-center gap-1 min-w-0 flex-1">
                  <span className="text-xs font-medium text-foreground truncate">
                    {casa.nome}
                    {casa.instanceIdentifier && (
                      <span className="text-primary/80 ml-1 font-normal">({casa.instanceIdentifier})</span>
                    )}
                  </span>
                  {casa.parceiroPrimeiroNome && (
                    <span className="text-[10px] text-primary/80 truncate flex-shrink-0">
                      {casa.parceiroPrimeiroNome}
                    </span>
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
                    saldoReal={casa.saldoRealNativo}
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
      
      <p className="text-[10px] text-muted-foreground pt-1 border-t">
        {casasComSaldo.length} casa{casasComSaldo.length !== 1 ? 's' : ''} com saldo
        {casasComRollover > 0 && ` • ${casasComRollover} com rollover`}
      </p>
    </div>
  );

  // Trigger content
  const TriggerContent = ({ isCompact = false }: { isCompact?: boolean }) => (
    <div 
      className={cn(
        "flex flex-col items-center justify-center text-center cursor-pointer group",
        isCompact && "px-3 py-1.5 rounded-md bg-primary/10 border border-primary/20"
      )}
      onClick={hasCasas ? openPanel : undefined}
    >
      <div className="flex items-center justify-center gap-2">
        {isCompact && <Wallet className="h-4 w-4 text-primary" />}
        <span className={cn(
          "font-bold text-primary",
          isCompact ? "text-sm font-medium" : "text-lg md:text-2xl"
        )}>
          {formatCurrency(saldoOperavel)}
        </span>
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
      {!isCompact && saldoOperavel > 0 && (
        <span className="text-xs text-muted-foreground">
          {conversaoVisual.label} {conversaoVisual.valor.toLocaleString("pt-BR", { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
          })}
        </span>
      )}
    </div>
  );

  const SubtitleText = () => (
    <p className="text-[10px] md:text-xs text-muted-foreground mt-1 text-center">
      {totalCasas} casa{totalCasas !== 1 ? 's' : ''}
      {casasComRollover > 0 && ` • ${casasComRollover} com rollover`}
    </p>
  );

  // Overlay panel (shared across all variants)
  const overlayPanel = (
    <SaldoOverlayPanel isOpen={isPanelOpen} onClose={closePanel}>
      <CasasBreakdown />
    </SaldoOverlayPanel>
  );

  // Compact variant
  if (variant === "compact") {
    return (
      <>
        <TriggerContent isCompact />
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
          <TriggerContent />
          <SubtitleText />
        </CardContent>
      </Card>
      {overlayPanel}
    </>
  );
}
