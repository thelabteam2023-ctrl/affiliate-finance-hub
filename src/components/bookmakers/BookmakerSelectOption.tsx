import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
  /** Se true, o rollover já foi iniciado (rollover_progress > 0) - mostra saldo unificado */
  bonus_rollover_started?: boolean;
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
 * REGRAS VISUAIS (ATUALIZADAS 2025-01-15):
 * - Nome da casa (uppercase)
 * - APENAS primeiro nome do parceiro (não mais primeiro + último)
 * - Badge de moeda com cor
 * - SALDO CONSOLIDADO apenas (não mostrar breakdown Real + Bônus separados)
 * - Freebet só aparece como indicador visual se existir
 */
export function BookmakerSelectOption({
  bookmaker,
  disabled = false,
  className,
}: BookmakerSelectOptionProps) {
  const { nome, parceiro_nome, moeda, saldo_operavel, saldo_freebet = 0, saldo_bonus = 0, logo_url } = bookmaker;
  
  // MUDANÇA: Extrair APENAS o primeiro nome do parceiro
  const primeiroNome = getFirstName(parceiro_nome || "");
  
  return (
    <div className={cn(
      "grid grid-cols-[auto_1fr_auto] items-center w-full gap-2 min-w-0",
      disabled && "opacity-50",
      className
    )}>
      {/* Coluna 1: Logo (fixa à esquerda) */}
      <div className="flex-shrink-0">
        {logo_url ? (
          <img
            src={logo_url}
            alt=""
            className="h-5 w-5 rounded object-contain"
          />
        ) : (
          <div className="h-5 w-5" aria-hidden="true" />
        )}
      </div>

      {/* Coluna 2: Nome + Parceiro (centralizado) */}
      <div className="flex flex-col items-center justify-center min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="uppercase text-xs font-medium truncate">{nome}</span>
          <CurrencyBadge moeda={moeda} />
        </div>
        {primeiroNome && (
          <span className="text-[10px] text-muted-foreground truncate">
            {primeiroNome}
          </span>
        )}
      </div>
      
      {/* Coluna 3: Saldo CONSOLIDADO (fixo à direita) */}
      <div className="flex flex-col items-end flex-shrink-0">
        <span className={cn(
          "text-xs font-medium flex items-center gap-1",
          disabled ? "text-destructive" : getCurrencyTextColor(moeda)
        )}>
          {disabled ? "Indisponível" : formatCurrency(saldo_operavel, moeda)}
          {/* Indicador de bônus ativo */}
          {!disabled && saldo_bonus > 0 && (
            <span className="text-purple-400" title="Inclui bônus creditado">🎁</span>
          )}
        </span>
        
        {/* Indicador de freebet disponível (separado do saldo operável) */}
        {!disabled && saldo_freebet > 0 && (
          <span className="text-[9px] text-amber-400/80">
            +FB {formatCurrencyCompact(saldo_freebet, moeda)}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Extrai apenas o PRIMEIRO nome de uma string
 */
function getFirstName(fullName: string): string {
  if (!fullName) return "";
  return fullName.trim().split(/\s+/)[0] || "";
}

/**
 * Formata valor de forma compacta (sem símbolo da moeda)
 */
function formatCurrencyCompact(value: number, moeda: string = "BRL"): string {
  return value.toLocaleString(moeda === "BRL" ? "pt-BR" : "en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
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
 * Componente de display de saldo CONSOLIDADO
 * 
 * REGRA ATUALIZADA (2025-01-15):
 * Mostrar APENAS o saldo operável consolidado.
 * Freebet aparece como indicador separado se existir.
 * Bônus está incluso no saldo operável (indicador 🎁 se > 0).
 */
interface SaldoBreakdownDisplayProps {
  saldoReal: number;
  saldoFreebet: number;
  saldoBonus: number;
  saldoOperavel: number;
  moeda: string;
  /** @deprecated Não mais utilizado - saldo sempre consolidado */
  bonusRolloverStarted?: boolean;
}

export function SaldoBreakdownDisplay({
  saldoFreebet,
  saldoBonus,
  saldoOperavel,
  moeda,
}: SaldoBreakdownDisplayProps) {
  return (
    <div className="text-xs text-center space-y-0.5">
      <p className="text-muted-foreground flex items-center justify-center gap-1">
        Saldo Operável:{" "}
        <span className={cn("font-medium", getCurrencyTextColor(moeda))}>
          {formatCurrency(saldoOperavel, moeda)}
        </span>
        {saldoBonus > 0 && (
          <span className="text-purple-400" title="Inclui bônus creditado">🎁</span>
        )}
      </p>
      
      {/* Freebet aparece separado pois não faz parte do saldo operável */}
      {saldoFreebet > 0 && (
        <p className="text-muted-foreground/70 text-[10px] flex items-center justify-center gap-1">
          <span className="text-amber-400 flex items-center gap-1">
            <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="6" width="20" height="12" rx="2" className="fill-amber-500/20 stroke-amber-400" strokeWidth="1.5"/>
              <path d="M2 10h20" className="stroke-amber-400" strokeWidth="1"/>
              <circle cx="12" cy="14" r="2" className="stroke-amber-400" strokeWidth="1.5"/>
              <path d="M6 14h2M16 14h2" className="stroke-amber-400/60" strokeWidth="1" strokeLinecap="round"/>
            </svg>
            +FB: {formatCurrency(saldoFreebet, moeda)}
          </span>
        </p>
      )}
    </div>
  );
}
