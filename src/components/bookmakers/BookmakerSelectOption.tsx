import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getFirstLastName } from "@/lib/utils";
import { Gift } from "lucide-react";

export type SupportedCurrency = "BRL" | "USD" | "EUR" | "GBP" | "USDT";

export interface BookmakerOptionData {
  id: string;
  nome: string;
  parceiro_nome: string | null;
  moeda: string;
  /** Saldo consolidado disponível para apostar (saldo_real + bonus - em_aposta + freebet) */
  saldo_operavel: number;
  saldo_disponivel?: number;
  saldo_freebet?: number;
  saldo_bonus?: number;
  logo_url?: string | null;
  /** Se true, o rollover já foi iniciado (rollover_progress > 0) */
  bonus_rollover_started?: boolean;
  /** Identificador de instância para múltiplas contas da mesma casa */
  instance_identifier?: string | null;
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
 * REGRAS VISUAIS (simplificado - saldo consolidado):
 * - Logo da casa
 * - Nome da casa (uppercase) + Badge de moeda
 * - Primeiro nome do parceiro
 * - Saldo consolidado (único valor relevante para operações)
 * - Indicador 🎁 se houver bônus ativo
 */
export function BookmakerSelectOption({
  bookmaker,
  disabled = false,
  showBreakdown = true,
  className,
}: BookmakerSelectOptionProps) {
  const { 
    nome, 
    parceiro_nome, 
    moeda, 
    saldo_operavel, 
    saldo_freebet = 0, 
    saldo_bonus = 0, 
    logo_url, 
    bonus_rollover_started = false,
    instance_identifier,
  } = bookmaker;
  
  const parceiroShortName = getFirstLastName(parceiro_nome || "");
  const hasBonus = saldo_bonus > 0;
  
  return (
    <div className={cn(
      "grid grid-cols-[20px_1fr_auto] items-center w-full gap-1.5 min-w-0 overflow-hidden",
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
      <div className="flex flex-col items-start justify-center min-w-0 overflow-hidden">
        <div className="flex items-center gap-1 min-w-0 max-w-full">
          <span className="uppercase text-xs font-medium truncate">
            {nome}
          </span>
          {instance_identifier && (
            <span className="text-[10px] text-primary font-medium truncate normal-case">
              {instance_identifier}
            </span>
          )}
          <CurrencyBadge moeda={moeda} />
        </div>
        {parceiroShortName && (
          <span className="text-[10px] text-muted-foreground truncate max-w-full">
            {parceiroShortName}
          </span>
        )}
      </div>
      
      {/* Coluna 3: Saldo (fixo à direita) */}
      <div className="flex flex-col items-end flex-shrink-0 whitespace-nowrap">
        {disabled ? (
          <span className="text-xs font-medium text-destructive">Indisponível</span>
        ) : saldo_freebet > 0 ? (
          <>
            <span className={cn("text-xs font-medium flex items-center gap-1", getCurrencyTextColor(moeda))}>
              {formatCurrency(saldoDisponivel, moeda)}
              {hasBonus && <span className="text-purple-400" title="Bônus ativo">🎁</span>}
            </span>
            <span className="text-[9px] text-amber-400/80 flex items-center gap-0.5">
              <Gift className="h-2.5 w-2.5" />
              FB: {formatCurrency(saldo_freebet, moeda)}
            </span>
          </>
        ) : (
          <span className={cn("text-xs font-medium flex items-center gap-1", getCurrencyTextColor(moeda))}>
            {formatCurrency(saldoDisponivel, moeda)}
            {hasBonus && <span className="text-purple-400" title="Bônus ativo">🎁</span>}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * COMPONENTE DE TRIGGER para exibir bookmaker selecionado no botão do Select
 * Formato visual igual ao dropdown (logo, nome, badge de moeda, parceiro, saldo)
 */
export interface BookmakerSelectTriggerData {
  nome: string;
  parceiro_nome: string | null;
  moeda: string;
  saldo_operavel: number;
  logo_url?: string | null;
  instance_identifier?: string | null;
}

interface BookmakerSelectTriggerProps {
  bookmaker: BookmakerSelectTriggerData | null;
  placeholder?: string;
  className?: string;
}

export function BookmakerSelectTrigger({
  bookmaker,
  placeholder = "Selecione",
  className,
}: BookmakerSelectTriggerProps) {
  if (!bookmaker) {
    return (
      <span className={cn("text-muted-foreground text-center w-full", className)}>
        {placeholder}
      </span>
    );
  }
  
  const { nome, logo_url, parceiro_nome } = bookmaker;
  const parceiroShort = parceiro_nome ? getFirstLastName(parceiro_nome) : null;
  
  return (
    <div className={cn(
      "flex items-center justify-center gap-2 w-full min-w-0",
      className
    )}>
      {/* Logo */}
      {logo_url ? (
        <img
          src={logo_url}
          alt=""
          className="h-5 w-5 rounded object-contain flex-shrink-0"
        />
      ) : (
        <div className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
      )}
      
      {/* Nome + Identificador + Parceiro */}
      <div className="flex flex-col items-start min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          <span className="uppercase text-xs font-medium truncate">
            {nome}
          </span>
          {bookmaker.instance_identifier && (
            <span className="text-[10px] text-primary font-medium truncate normal-case">
              {bookmaker.instance_identifier}
            </span>
          )}
        </div>
        {parceiroShort && (
          <span className="text-[10px] text-muted-foreground truncate">
            {parceiroShort}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * COMPONENTE DE METADADOS com altura fixa para evitar layout jumps
 * Sempre renderiza um container h-4, mesmo quando vazio
 * 
 * DEVE SER USADO LOGO ABAIXO DO SELECT EM TODOS OS FORMS
 */
export interface BookmakerMetaRowData {
  parceiro_nome: string | null;
  moeda: string;
  saldo_operavel: number;
  saldo_freebet?: number;
  saldo_disponivel?: number;
}

interface BookmakerMetaRowProps {
  bookmaker: BookmakerMetaRowData | null | undefined;
  className?: string;
}

export function BookmakerMetaRow({ bookmaker, className }: BookmakerMetaRowProps) {
  // Container com altura fixa - SEMPRE renderiza para evitar layout jumps
  if (!bookmaker) {
    return (
      <div className={cn("h-4 text-[10px] text-muted-foreground text-center", className)} />
    );
  }
  
  const { parceiro_nome, moeda, saldo_operavel, saldo_freebet = 0, saldo_disponivel } = bookmaker;
  const parceiroShort = parceiro_nome?.split(' ')[0] || '';
  const hasFreebet = saldo_freebet > 0;
  // Se tem freebet, mostrar saldo_disponivel (real) separado
  const saldoReal = hasFreebet && saldo_disponivel != null ? saldo_disponivel : saldo_operavel;
  
  return (
    <div className={cn(
      "h-4 text-[10px] text-muted-foreground text-center truncate flex items-center justify-center gap-1",
      className
    )}>
      {parceiroShort && <span>{parceiroShort}</span>}
      {parceiroShort && <span className="opacity-50">•</span>}
      <span className={getCurrencyTextColor(moeda)}>
        {formatCurrency(saldoReal, moeda)}
      </span>
      {hasFreebet && (
        <span className="text-amber-400/80 flex items-center gap-0.5">
          + <Gift className="h-2.5 w-2.5 inline" /> {formatCurrency(saldo_freebet, moeda)}
        </span>
      )}
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
  // Normalize floating-point noise: treat values with absolute < 0.005 as zero
  // This prevents displaying "-R$ 0,00" due to precision errors like -0.000000000000364
  const safeValue = Math.abs(value) < 0.005 ? 0 : value;
  
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
    }).format(safeValue);
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
  /** Se true, o rollover já foi iniciado - mostra saldo unificado com 🎁 */
  bonusRolloverStarted?: boolean;
}

export function SaldoBreakdownDisplay({
  saldoReal,
  saldoFreebet,
  saldoBonus,
  saldoOperavel,
  moeda,
  bonusRolloverStarted = false,
}: SaldoBreakdownDisplayProps) {
  // Se tem bônus ativo E rollover iniciado, mostrar saldo unificado
  const showUnifiedBonus = saldoBonus > 0 && bonusRolloverStarted;
  // Se tem bônus mas rollover NÃO iniciou, mostra separado
  const showSeparatedBonus = saldoBonus > 0 && !bonusRolloverStarted;
  
  return (
    <div className="text-xs text-center space-y-0.5">
      <p className="text-muted-foreground flex items-center justify-center gap-1">
        Saldo Operável:{" "}
        <span className={cn("font-medium", getCurrencyTextColor(moeda))}>
          {formatCurrency(saldoOperavel, moeda)}
        </span>
        {showUnifiedBonus && (
          <span className="text-purple-400" title="Bônus ativo em rollover">🎁</span>
        )}
      </p>
      
      {/* Mostra breakdown se:
          1. Bônus existe MAS rollover NÃO iniciou (antes da 1ª aposta)
          2. Só tem freebet
      */}
      {(showSeparatedBonus || (!showUnifiedBonus && saldoFreebet > 0)) && (
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
          
          {/* Bônus - só mostra se rollover NÃO iniciou */}
          {showSeparatedBonus && (
            <span className="text-purple-400 flex items-center gap-1">
              <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="4" width="20" height="16" rx="3" className="fill-purple-500/20 stroke-purple-400" strokeWidth="1.5"/>
                <circle cx="12" cy="12" r="4" className="stroke-purple-400" strokeWidth="1.5"/>
                <path d="M12 10v4M10.5 11.5l1.5-1.5 1.5 1.5" className="stroke-purple-400" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="5.5" cy="8" r="1" className="fill-purple-400/60"/>
                <circle cx="18.5" cy="16" r="1" className="fill-purple-400/60"/>
              </svg>
              {formatCurrency(saldoBonus, moeda)}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
