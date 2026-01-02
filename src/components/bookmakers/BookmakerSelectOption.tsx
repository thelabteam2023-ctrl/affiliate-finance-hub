import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getFirstLastName } from "@/lib/utils";

export type SupportedCurrency = "BRL" | "USD" | "EUR" | "GBP" | "USDT";

export interface BookmakerOptionData {
  id: string;
  nome: string;
  parceiro_nome: string | null;
  moeda: string;
  saldo_operavel: number;
  saldo_disponivel?: number;
  saldo_freebet?: number;
  saldo_bonus?: number;
  logo_url?: string | null;
}

interface BookmakerSelectOptionProps {
  bookmaker: BookmakerOptionData;
  disabled?: boolean;
  showBreakdown?: boolean;
  className?: string;
}

/**
 * COMPONENTE CANÔNICO para exibição de bookmaker em selects
 * 
 * REGRAS VISUAIS:
 * - Nome da casa (uppercase)
 * - Nome do parceiro (primeiro + último nome)
 * - Badge de moeda com cor:
 *   - BRL → verde (emerald)
 *   - USD/USDT → azul (blue)
 *   - EUR → roxo (purple)
 *   - GBP → laranja (amber)
 * - Valor formatado na moeda correta
 */
export function BookmakerSelectOption({
  bookmaker,
  disabled = false,
  showBreakdown = true,
  className,
}: BookmakerSelectOptionProps) {
  const { nome, parceiro_nome, moeda, saldo_operavel, saldo_freebet = 0, saldo_bonus = 0, logo_url } = bookmaker;
  
  const parceiroShortName = getFirstLastName(parceiro_nome || "");
  
  return (
    <div className={cn(
      "flex items-center justify-between w-full gap-2 min-w-0",
      disabled && "opacity-50",
      className
    )}>
      <div className="flex flex-col min-w-0 flex-1">
        {/* Linha 1: Nome + Badge de Moeda */}
        <div className="flex items-center gap-1.5">
          {logo_url && (
            <img
              src={logo_url}
              alt=""
              className="h-4 w-4 rounded object-contain flex-shrink-0"
            />
          )}
          <span className="uppercase text-xs font-medium truncate">{nome}</span>
          <CurrencyBadge moeda={moeda} />
        </div>
        
        {/* Linha 2: Parceiro */}
        {parceiroShortName && (
          <span className="text-[10px] text-muted-foreground truncate pl-0.5">
            {parceiroShortName}
          </span>
        )}
      </div>
      
      {/* Coluna direita: Saldo */}
      <div className="flex flex-col items-end flex-shrink-0">
        <span className={cn(
          "text-xs font-medium flex items-center gap-1",
          disabled ? "text-destructive" : getCurrencyTextColor(moeda)
        )}>
          {disabled ? "Indisponível" : formatCurrency(saldo_operavel, moeda)}
          {/* Indicador de bônus ativo (em rollover) */}
          {!disabled && saldo_bonus > 0 && (
            <span className="text-purple-400" title="Bônus ativo">🎁</span>
          )}
        </span>
        
        {/* Breakdown - só mostra freebet separado, bônus está unificado */}
        {showBreakdown && !disabled && saldo_freebet > 0 && saldo_bonus === 0 && (
          <span className="text-[9px] text-muted-foreground/70">
            {formatBreakdown(bookmaker.saldo_disponivel || saldo_operavel, saldo_freebet, 0, moeda)}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Badge de moeda com cores distintas por tipo
 */
export function CurrencyBadge({ moeda, size = "sm" }: { moeda: string; size?: "sm" | "xs" }) {
  const colorClasses = getCurrencyBadgeColors(moeda);
  const sizeClasses = size === "xs" 
    ? "text-[8px] px-1 py-0 h-3.5" 
    : "text-[9px] px-1.5 py-0 h-4";
  
  return (
    <Badge 
      variant="outline" 
      className={cn(sizeClasses, colorClasses)}
    >
      {moeda}
    </Badge>
  );
}

/**
 * Cores do badge por moeda
 */
function getCurrencyBadgeColors(moeda: string): string {
  switch (moeda) {
    case "BRL":
      return "bg-emerald-500/10 border-emerald-500/30 text-emerald-400";
    case "USD":
    case "USDT":
      return "bg-blue-500/10 border-blue-500/30 text-blue-400";
    case "EUR":
      return "bg-purple-500/10 border-purple-500/30 text-purple-400";
    case "GBP":
      return "bg-amber-500/10 border-amber-500/30 text-amber-400";
    default:
      return "bg-muted border-border text-muted-foreground";
  }
}

/**
 * Cor do texto do saldo por moeda
 */
export function getCurrencyTextColor(moeda: string): string {
  switch (moeda) {
    case "BRL":
      return "text-emerald-400";
    case "USD":
    case "USDT":
      return "text-blue-400";
    case "EUR":
      return "text-purple-400";
    case "GBP":
      return "text-amber-400";
    default:
      return "text-muted-foreground";
  }
}

/**
 * Símbolo da moeda
 */
export function getCurrencySymbol(moeda: string): string {
  const symbols: Record<string, string> = { 
    BRL: "R$", 
    USD: "$", 
    EUR: "€", 
    GBP: "£", 
    USDT: "$" 
  };
  return symbols[moeda] || moeda;
}

/**
 * Formata valor na moeda correta
 */
export function formatCurrency(value: number, moeda: string = "BRL"): string {
  const currencyCode = moeda === "USDT" ? "USD" : moeda;
  const locale = currencyCode === "BRL" ? "pt-BR" : "en-US";
  
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
    }).format(value);
  } catch {
    // Fallback para moedas não suportadas pelo Intl
    return `${getCurrencySymbol(moeda)} ${value.toFixed(2)}`;
  }
}

/**
 * Formata breakdown do saldo (real + freebet + bonus)
 */
function formatBreakdown(
  saldoReal: number, 
  saldoFreebet: number, 
  saldoBonus: number, 
  moeda: string
): string {
  const symbol = getCurrencySymbol(moeda);
  const parts: string[] = [`${symbol} ${saldoReal.toFixed(0)}`];
  
  if (saldoFreebet > 0) {
    parts.push(`FB: ${saldoFreebet.toFixed(0)}`);
  }
  if (saldoBonus > 0) {
    parts.push(`🎁: ${saldoBonus.toFixed(0)}`);
  }
  
  return parts.join(" + ");
}

/**
 * Componente de display de saldo com breakdown visual
 */
interface SaldoBreakdownDisplayProps {
  saldoReal: number;
  saldoFreebet: number;
  saldoBonus: number;
  saldoOperavel: number;
  moeda: string;
}

export function SaldoBreakdownDisplay({
  saldoReal,
  saldoFreebet,
  saldoBonus,
  saldoOperavel,
  moeda,
}: SaldoBreakdownDisplayProps) {
  // Se tem bônus ativo, mostrar saldo unificado com indicador
  const hasActiveBonus = saldoBonus > 0;
  
  return (
    <div className="text-xs text-center space-y-0.5">
      <p className="text-muted-foreground flex items-center justify-center gap-1">
        Saldo Operável:{" "}
        <span className={cn("font-medium", getCurrencyTextColor(moeda))}>
          {formatCurrency(saldoOperavel, moeda)}
        </span>
        {hasActiveBonus && (
          <span className="text-purple-400" title="Bônus ativo em rollover">🎁</span>
        )}
      </p>
      
      {/* Só mostra breakdown se NÃO tem bônus ativo */}
      {!hasActiveBonus && (saldoFreebet > 0) && (
        <p className="text-muted-foreground/70 text-[10px] flex items-center justify-center gap-3 flex-wrap">
          {/* Saldo Real */}
          <span className="text-emerald-400 flex items-center gap-1">
            <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="8" width="18" height="11" rx="2" className="fill-emerald-500/20 stroke-emerald-400" strokeWidth="1.5"/>
              <path d="M3 10h18" className="stroke-emerald-400" strokeWidth="1.5"/>
              <path d="M7 4h10M9 4v4M15 4v4" className="stroke-emerald-400" strokeWidth="1.5" strokeLinecap="round"/>
              <rect x="6" y="13" width="4" height="3" rx="0.5" className="fill-emerald-400/50"/>
            </svg>
            {formatCurrency(saldoReal, moeda)}
          </span>
          
          {/* Freebet */}
          {saldoFreebet > 0 && (
            <span className="text-amber-400 flex items-center gap-1">
              <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="6" width="20" height="12" rx="2" className="fill-amber-500/20 stroke-amber-400" strokeWidth="1.5"/>
                <path d="M2 10h20" className="stroke-amber-400" strokeWidth="1"/>
                <circle cx="12" cy="14" r="2" className="stroke-amber-400" strokeWidth="1.5"/>
                <path d="M6 14h2M16 14h2" className="stroke-amber-400/60" strokeWidth="1" strokeLinecap="round"/>
              </svg>
              {formatCurrency(saldoFreebet, moeda)}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
