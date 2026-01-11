import { Gift } from "lucide-react";
import { Input } from "@/components/ui/input";
import { getCurrencySymbol } from "@/components/bookmakers/BookmakerSelectOption";

interface GerouFreebetInputProps {
  /** Toggle state - whether the bet generated a freebet */
  gerouFreebet: boolean;
  /** Toggle change handler */
  onGerouFreebetChange: (value: boolean) => void;
  /** Value of the freebet generated (as string for input) */
  valorFreebetGerada: string;
  /** Value change handler */
  onValorFreebetGeradaChange: (value: string) => void;
  /** Currency of the bookmaker where freebet was generated - CRITICAL: freebet inherits bookmaker's currency */
  moeda: string;
  /** Whether the component should be disabled */
  disabled?: boolean;
}

/**
 * GerouFreebetInput - Standardized component for "Did this bet generate a freebet?" functionality
 * 
 * CRITICAL BUSINESS RULE:
 * - Freebets do NOT have their own currency
 * - They ALWAYS inherit the currency from the bookmaker where they were generated
 * - This component displays the correct currency symbol based on the bookmaker's currency
 * 
 * Visual Design:
 * - Modern toggle pill with animation
 * - Gift icon with color states
 * - Value input only shown when toggle is active
 * - Green gradient background when active
 */
export function GerouFreebetInput({
  gerouFreebet,
  onGerouFreebetChange,
  valorFreebetGerada,
  onValorFreebetGeradaChange,
  moeda,
  disabled = false,
}: GerouFreebetInputProps) {
  const currencySymbol = getCurrencySymbol(moeda);

  return (
    <div 
      className={`flex items-center justify-between py-3 px-4 rounded-lg transition-all duration-200 ${
        gerouFreebet 
          ? "bg-gradient-to-r from-emerald-500/15 to-emerald-500/5 border border-emerald-500/40" 
          : "bg-muted/20 border border-border/40 hover:border-border/60 hover:bg-muted/30"
      } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
    >
      <button
        type="button"
        onClick={() => !disabled && onGerouFreebetChange(!gerouFreebet)}
        className="flex items-center gap-3 group"
        disabled={disabled}
      >
        {/* Toggle pill moderno */}
        <div 
          className={`relative w-10 h-[22px] rounded-full transition-all duration-200 ${
            gerouFreebet 
              ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" 
              : "bg-muted-foreground/30"
          }`}
        >
          <div 
            className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow-md transition-all duration-200 ${
              gerouFreebet 
                ? "left-[21px]" 
                : "left-[3px]"
            }`} 
          />
        </div>
        
        {/* Label com ícone */}
        <div className="flex items-center gap-2">
          <Gift 
            className={`h-4 w-4 transition-colors ${
              gerouFreebet 
                ? "text-emerald-400" 
                : "text-muted-foreground"
            }`} 
          />
          <span 
            className={`text-sm font-medium transition-colors ${
              gerouFreebet 
                ? "text-emerald-400" 
                : "text-foreground/80 group-hover:text-foreground"
            }`}
          >
            Gerou Freebet
          </span>
        </div>
      </button>
      
      {/* Input de valor com animação e moeda correta */}
      <div 
        className={`flex items-center gap-2 overflow-hidden transition-all duration-200 ${
          gerouFreebet 
            ? "opacity-100 max-w-[150px]" 
            : "opacity-0 max-w-0"
        }`}
      >
        <span className="text-xs text-emerald-400/80 whitespace-nowrap font-medium">
          {currencySymbol}
        </span>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={valorFreebetGerada}
          onChange={(e) => onValorFreebetGeradaChange(e.target.value)}
          placeholder="0.00"
          disabled={disabled}
          className="h-8 w-24 text-sm text-center px-2 bg-background/60 border-emerald-500/40 focus:border-emerald-500/60"
        />
      </div>
    </div>
  );
}
