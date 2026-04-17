import { Info, ArrowUp, ArrowDown, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Formata valor de forma compacta:
 * >= 1.000.000 → "1,12M"
 * >= 100.000 → "100,5K"
 */
function compactValue(value: number): string | null {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}M`;
  }
  if (abs >= 100_000) {
    return `${sign}${(abs / 1_000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}K`;
  }
  return null;
}

function CompactCurrencyValue({
  value,
  formatCurrency,
  moeda,
  className,
}: {
  value: number;
  formatCurrency: (v: number, m?: string) => string;
  moeda?: string;
  className?: string;
}) {
  const compact = compactValue(value);
  const full = formatCurrency(value, moeda);

  if (!compact) {
    return <span className={className}>{full}</span>;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn(className, "cursor-help")}>{compact}</span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <span className="text-xs font-medium">{full}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Badge indicador de saque pendente */
function PendingWithdrawalBadge({
  saldoSaquePendente,
  saldoReal,
  formatCurrency,
  moeda,
  variant,
}: {
  saldoSaquePendente: number;
  saldoReal: number;
  formatCurrency: (v: number, m?: string) => string;
  moeda?: string;
  variant: "card" | "list" | "compact";
}) {
  if (saldoSaquePendente <= 0) return null;

  const isTotalWithdrawal = saldoSaquePendente >= saldoReal;
  const formattedValue = formatCurrency(saldoSaquePendente, moeda);

  const tooltipText = isTotalWithdrawal
    ? `Saldo totalmente comprometido em saque pendente (${formattedValue}). Aguardando confirmação.`
    : `${formattedValue} reservado para saque pendente. Valor indisponível para novas operações.`;

  if (variant === "list") {
    return (
      <div className="text-right w-[100px] flex-shrink-0">
        <p className="text-xs text-muted-foreground flex items-center justify-end gap-1">
          Em Saque
        </p>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={cn(
                "font-medium tabular-nums text-xs flex items-center justify-end gap-1 cursor-help",
                isTotalWithdrawal ? "text-destructive" : "text-orange-400"
              )}>
                <Clock className="h-3 w-3" />
                <CompactCurrencyValue value={saldoSaquePendente} formatCurrency={formatCurrency} moeda={moeda} className="font-medium tabular-nums text-xs" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs max-w-[200px]">{tooltipText}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  // Card & compact variants
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs cursor-help",
            isTotalWithdrawal
              ? "bg-destructive/10 border border-destructive/20 text-destructive"
              : "bg-orange-500/10 border border-orange-500/20 text-orange-400"
          )}>
            <Clock className="h-3 w-3 flex-shrink-0" />
            <span className="font-medium">
              {isTotalWithdrawal ? "100% em saque" : `${formattedValue} em saque`}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs max-w-[220px]">{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface SaldoOperavelDisplayProps {
  /** Saldo Operável = Fiat + Bônus + Freebet */
  saldoOperavel: number;
  /** Em Aposta = Stakes pendentes */
  saldoEmAposta: number;
  /** Disponível = Saldo Operável - Em Aposta */
  saldoDisponivel: number;
  /** Componentes para o tooltip de composição */
  saldoReal: number;
  saldoFreebet: number;
  saldoBonus: number;
  /** Valor em saque pendente (reservado) */
  saldoSaquePendente?: number;
  /** Função de formatação */
  formatCurrency: (value: number, moeda?: string) => string;
  /** Moeda da conta */
  moeda?: string;
  /** Variante de exibição */
  variant?: "card" | "list" | "compact";
  /** Classes adicionais */
  className?: string;
  /** Sort callbacks for list variant column headers */
  onSortSaldo?: () => void;
  onSortEmAposta?: () => void;
  onSortDisponivel?: () => void;
  /** Current sort direction for visual indicator */
  sortSaldo?: "asc" | "desc" | null;
  sortEmAposta?: "asc" | "desc" | null;
  sortDisponivel?: "asc" | "desc" | null;
  /**
   * Conversão para moeda de consolidação do projeto.
   * Quando fornecido E moeda da casa ≠ moeda de consolidação,
   * exibe linha "≈ $ X.XX" abaixo de cada valor.
   * Usa Cotação de Trabalho (sem drift de mercado).
   */
  convertToConsolidacao?: (valor: number, moedaOrigem: string) => number;
  /** Moeda de consolidação do projeto (BRL/USD) — usada com convertToConsolidacao */
  moedaConsolidacao?: string;
  /** Formatador da moeda de consolidação (ex: formatCurrency do useProjetoCurrency) */
  formatConsolidacao?: (valor: number) => string;
}

/**
 * Componente unificado para exibição de saldos de conta
 */
export function SaldoOperavelDisplay({
  saldoOperavel,
  saldoEmAposta,
  saldoDisponivel,
  saldoReal,
  saldoFreebet,
  saldoBonus,
  saldoSaquePendente = 0,
  formatCurrency,
  moeda = "BRL",
  variant = "card",
  className,
  onSortSaldo,
  onSortEmAposta,
  onSortDisponivel,
  sortSaldo,
  sortEmAposta,
  sortDisponivel,
  convertToConsolidacao,
  moedaConsolidacao,
  formatConsolidacao,
}: SaldoOperavelDisplayProps) {
  const hasComposition = saldoFreebet > 0 || saldoBonus > 0;
  // Limitar exibição do saque pendente ao saldo real (não mostrar mais do que existe na conta)
  const saquePendenteEfetivo = Math.min(saldoSaquePendente, saldoReal);
  const hasPendingWithdrawal = saquePendenteEfetivo > 0;

  // Helper: exibe equivalente em moeda de consolidação se aplicável
  const showConsolidacao =
    !!convertToConsolidacao &&
    !!moedaConsolidacao &&
    !!formatConsolidacao &&
    moeda !== moedaConsolidacao;

  const renderConsolidacao = (valor: number) => {
    if (!showConsolidacao) return null;
    const convertido = convertToConsolidacao!(valor, moeda);
    return (
      <span className="block text-[10px] text-muted-foreground/70 tabular-nums leading-tight">
        ≈ {formatConsolidacao!(convertido)}
      </span>
    );
  };

  // Componente de tooltip com composição
  const CompositionTooltip = () => (
    <div className="space-y-2 min-w-[160px]">
      <p className="font-medium text-xs border-b border-border pb-1">Composição do Saldo</p>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Fiat:</span>
          <span className="font-medium">{formatCurrency(saldoReal, moeda)}</span>
        </div>
        {saldoFreebet > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Freebet:</span>
            <span className="font-medium text-amber-400">{formatCurrency(saldoFreebet, moeda)}</span>
          </div>
        )}
        {saldoBonus > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Bônus:</span>
            <span className="font-medium text-primary">{formatCurrency(saldoBonus, moeda)}</span>
          </div>
        )}
        {hasPendingWithdrawal && (
          <div className="flex justify-between text-orange-400">
            <span>Em saque:</span>
            <span className="font-medium">-{formatCurrency(saquePendenteEfetivo, moeda)}</span>
          </div>
        )}
        <div className="flex justify-between pt-1 border-t border-border">
          <span className="text-muted-foreground font-medium">Total:</span>
          <span className="font-bold">{formatCurrency(saldoOperavel, moeda)}</span>
        </div>
      </div>
    </div>
  );

  // Variante LIST - horizontal
  if (variant === "list") {
    return (
      <div className={cn("flex items-center gap-4", className)}>
        {/* Saldo Operável - Dominante */}
        <div className="text-right w-[110px] flex-shrink-0">
          <p 
            className={cn(
              "text-xs text-muted-foreground flex items-center justify-end gap-1",
              onSortSaldo && "cursor-pointer hover:text-foreground transition-colors"
            )}
            onClick={onSortSaldo}
          >
            Saldo Operável
            {sortSaldo === "desc" && <ArrowDown className="h-3 w-3 text-primary" />}
            {sortSaldo === "asc" && <ArrowUp className="h-3 w-3 text-primary" />}
            {hasComposition && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground/70 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <CompositionTooltip />
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </p>
          <CompactCurrencyValue value={saldoOperavel} formatCurrency={formatCurrency} moeda={moeda} className="font-bold text-foreground tabular-nums text-xs" />
          {renderConsolidacao(saldoOperavel)}
        </div>

        {/* Em Aposta - Informativo */}
        <div className="text-right w-[90px] flex-shrink-0">
          <p 
            className={cn(
              "text-xs text-muted-foreground flex items-center justify-end gap-1",
              onSortEmAposta && "cursor-pointer hover:text-foreground transition-colors"
            )}
            onClick={onSortEmAposta}
          >
            Em Aposta
            {sortEmAposta === "desc" && <ArrowDown className="h-3 w-3 text-primary" />}
            {sortEmAposta === "asc" && <ArrowUp className="h-3 w-3 text-primary" />}
          </p>
          <CompactCurrencyValue value={saldoEmAposta} formatCurrency={formatCurrency} moeda={moeda} className="font-medium text-warning tabular-nums text-xs" />
          {renderConsolidacao(saldoEmAposta)}
        </div>

        {/* Em Saque - Visível apenas se existir */}
        {hasPendingWithdrawal && (
          <PendingWithdrawalBadge
            saldoSaquePendente={saquePendenteEfetivo}
            saldoReal={saldoReal}
            formatCurrency={formatCurrency}
            moeda={moeda}
            variant="list"
          />
        )}

        {/* Disponível - Destaque secundário */}
        <div className="text-right w-[100px] flex-shrink-0">
          <p 
            className={cn(
              "text-xs text-muted-foreground flex items-center justify-end gap-1",
              onSortDisponivel && "cursor-pointer hover:text-foreground transition-colors"
            )}
            onClick={onSortDisponivel}
          >
            Disponível
            {sortDisponivel === "desc" && <ArrowDown className="h-3 w-3 text-primary" />}
            {sortDisponivel === "asc" && <ArrowUp className="h-3 w-3 text-primary" />}
          </p>
          <CompactCurrencyValue value={saldoDisponivel} formatCurrency={formatCurrency} moeda={moeda} className="font-semibold text-accent-foreground tabular-nums text-xs" />
          {renderConsolidacao(saldoDisponivel)}
        </div>
      </div>
    );
  }

  // Variante COMPACT - mínima
  if (variant === "compact") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn("text-right cursor-help", className)}>
              <p className="font-bold text-foreground">{formatCurrency(saldoOperavel, moeda)}</p>
              <p className="text-xs text-muted-foreground">
                {saldoEmAposta > 0 && (
                  <span className="text-warning mr-2">-{formatCurrency(saldoEmAposta, moeda)} em jogo</span>
                )}
                {hasPendingWithdrawal && (
                  <span className="text-orange-400 mr-2">-{formatCurrency(saquePendenteEfetivo, moeda)} em saque</span>
                )}
                <span className="text-accent-foreground">{formatCurrency(saldoDisponivel, moeda)} livre</span>
              </p>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">
            <CompositionTooltip />
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Variante CARD - vertical (default)
  return (
    <div className={cn("space-y-2", className)}>
      {/* Saldo Operável - Número dominante */}
      <div className="p-2 rounded-md bg-primary/10 border border-primary/20">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-primary flex items-center gap-1">
            Saldo Operável
            {(hasComposition || hasPendingWithdrawal) && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-primary/70 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <CompositionTooltip />
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </span>
          <span className="text-base font-bold text-primary">
            {formatCurrency(saldoOperavel, moeda)}
          </span>
        </div>
      </div>

      {/* Em Aposta + Em Saque + Disponível */}
      <div className={cn("grid gap-2", hasPendingWithdrawal ? "grid-cols-3" : "grid-cols-2")}>
        {/* Em Aposta */}
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground">Em Aposta</span>
          <span className="text-sm font-medium text-warning">
            {formatCurrency(saldoEmAposta, moeda)}
          </span>
        </div>

        {/* Em Saque - Visível apenas se existir */}
        {hasPendingWithdrawal && (
          <div className="flex flex-col text-center">
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 justify-center">
              <Clock className="h-2.5 w-2.5" />
              Em Saque
            </span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={cn(
                    "text-sm font-medium cursor-help",
                    saquePendenteEfetivo >= saldoReal ? "text-destructive" : "text-orange-400"
                  )}>
                    {formatCurrency(saquePendenteEfetivo, moeda)}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs max-w-[200px]">
                    {saquePendenteEfetivo >= saldoReal
                      ? "Saldo totalmente comprometido em saque pendente"
                      : "Valor reservado para saque pendente, indisponível para apostas"}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}

        {/* Disponível */}
        <div className="flex flex-col text-right">
          <span className="text-[10px] text-muted-foreground">Disponível</span>
          <span className="text-sm font-semibold text-accent-foreground">
            {formatCurrency(saldoDisponivel, moeda)}
          </span>
        </div>
      </div>

      {/* Badge de alerta para saque total */}
      {hasPendingWithdrawal && (
        <PendingWithdrawalBadge
          saldoSaquePendente={saquePendenteEfetivo}
          saldoReal={saldoReal}
          formatCurrency={formatCurrency}
          moeda={moeda}
          variant="card"
        />
      )}
    </div>
  );
}
