/**
 * FonteSaldoSelector - Seletor de Fonte de Saldo (VERDADE FINANCEIRA)
 * 
 * Este componente permite ao usuário escolher de qual pool de capital
 * será feito o débito/crédito da aposta.
 * 
 * IMPORTANTE:
 * - fonte_saldo é a VERDADE FINANCEIRA (qual wallet é debitada)
 * - contexto_operacional é apenas UI/UX (de onde o formulário foi aberto)
 * - Nunca confundir os dois conceitos!
 */

import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Coins, Gift, Sparkles, HelpCircle, AlertTriangle } from "lucide-react";
import {
  FONTE_SALDO,
  FONTE_SALDO_LABELS,
  FONTES_SALDO_LIST,
  type FonteSaldo,
} from "@/lib/apostaConstants";
import { cn } from "@/lib/utils";

export interface FonteSaldoSelectorProps {
  value: FonteSaldo | null;
  onChange: (value: FonteSaldo) => void;
  
  /** Saldos disponíveis para cada fonte (exibe warnings se insuficiente) */
  saldos?: {
    real: number;
    freebet: number;
    bonus: number;
    moeda: string;
  };
  
  /** Stake da aposta (para validar se há saldo suficiente) */
  stake?: number;
  
  /** Modo de exibição: select dropdown ou radio buttons */
  mode?: 'select' | 'radio' | 'pills';
  
  /** Tamanho do componente */
  size?: 'sm' | 'md';
  
  /** Se true, exibe como badge read-only */
  readonly?: boolean;
  
  /** Label customizado */
  label?: string;
  
  /** Mostrar indicador de obrigatório */
  showRequired?: boolean;
  
  /** Mostrar tooltip de ajuda */
  showHelp?: boolean;
  
  /** Classes adicionais */
  className?: string;
}

const FonteIcon = ({ fonte, className }: { fonte: FonteSaldo | null; className?: string }) => {
  if (fonte === 'FREEBET') return <Gift className={cn("h-3.5 w-3.5 text-purple-500 dark:text-purple-400", className)} />;
  if (fonte === 'BONUS') return <Sparkles className={cn("h-3.5 w-3.5 text-amber-500 dark:text-amber-400", className)} />;
  return <Coins className={cn("h-3.5 w-3.5 text-primary", className)} />;
};

const getFonteBadgeStyle = (fonte: FonteSaldo) => {
  switch (fonte) {
    case 'FREEBET':
      return 'bg-purple-500/10 text-purple-500 border-purple-500/30 dark:text-purple-400';
    case 'BONUS':
      return 'bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400';
    default:
      return 'bg-primary/10 text-primary border-primary/30';
  }
};

export function FonteSaldoSelector({
  value,
  onChange,
  saldos,
  stake = 0,
  mode = 'select',
  size = 'sm',
  readonly = false,
  label = 'Fonte de Saldo',
  showRequired = false,
  showHelp = true,
  className,
}: FonteSaldoSelectorProps) {
  
  // Verificar se há saldo suficiente para cada fonte
  const saldosSuficientes = useMemo(() => {
    if (!saldos || stake <= 0) {
      return { real: true, freebet: true, bonus: true };
    }
    return {
      real: saldos.real >= stake,
      freebet: saldos.freebet >= stake,
      bonus: saldos.bonus >= stake,
    };
  }, [saldos, stake]);
  
  // Formatador de moeda
  const formatSaldo = (valor: number, moeda: string) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: moeda,
      minimumFractionDigits: 2,
    }).format(valor);
  };
  
  // Se readonly, mostrar apenas badge
  if (readonly && value) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Label className="text-xs text-muted-foreground">{label}:</Label>
        <Badge 
          variant="secondary" 
          className={cn("text-xs font-medium", getFonteBadgeStyle(value))}
        >
          <FonteIcon fonte={value} className="mr-1" />
          {FONTE_SALDO_LABELS[value]}
        </Badge>
      </div>
    );
  }
  
  // Modo Pills (botões lado a lado)
  if (mode === 'pills') {
    return (
      <div className={cn("space-y-1.5", className)}>
        {label && (
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">
              {label}
              {showRequired && <span className="text-destructive">*</span>}
            </Label>
            {showHelp && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 text-muted-foreground/50 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p className="text-xs">
                      Define qual pool de capital será debitado/creditado.
                      <br /><br />
                      <strong>Saldo Real:</strong> Dinheiro próprio na casa
                      <br />
                      <strong>Freebet:</strong> Aposta grátis creditada
                      <br />
                      <strong>Bônus:</strong> Saldo promocional ativo
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        )}
        <div className="flex gap-1.5">
          {FONTES_SALDO_LIST.map((item) => {
            const isSelected = value === item.value;
            const hasSaldo = saldos && saldos[item.value.toLowerCase() as 'real' | 'freebet' | 'bonus'] > 0;
            const saldoInsuficiente = !saldosSuficientes[item.value.toLowerCase() as 'real' | 'freebet' | 'bonus'];
            
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => onChange(item.value)}
                disabled={!hasSaldo}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  "border focus:outline-none focus:ring-2 focus:ring-primary/20",
                  isSelected
                    ? getFonteBadgeStyle(item.value)
                    : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted",
                  !hasSaldo && "opacity-40 cursor-not-allowed",
                  saldoInsuficiente && isSelected && "ring-2 ring-destructive/40"
                )}
              >
                <FonteIcon fonte={item.value} />
                {item.label}
                {saldos && (
                  <span className={cn(
                    "text-[10px] ml-1",
                    saldoInsuficiente && isSelected ? "text-destructive" : "opacity-70"
                  )}>
                    ({formatSaldo(saldos[item.value.toLowerCase() as 'real' | 'freebet' | 'bonus'], saldos.moeda)})
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {value && saldos && !saldosSuficientes[value.toLowerCase() as 'real' | 'freebet' | 'bonus'] && (
          <div className="flex items-center gap-1 text-xs text-destructive">
            <AlertTriangle className="h-3 w-3" />
            Saldo insuficiente para esta fonte
          </div>
        )}
      </div>
    );
  }
  
  // Modo Radio buttons
  if (mode === 'radio') {
    return (
      <div className={cn("space-y-1.5", className)}>
        {label && (
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">
              {label}
              {showRequired && <span className="text-destructive">*</span>}
            </Label>
            {showHelp && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 text-muted-foreground/50 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p className="text-xs">
                      Define qual pool de capital será debitado/creditado.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        )}
        <RadioGroup
          value={value || ''}
          onValueChange={(v) => onChange(v as FonteSaldo)}
          className="flex gap-3"
        >
          {FONTES_SALDO_LIST.map((item) => {
            const hasSaldo = saldos && saldos[item.value.toLowerCase() as 'real' | 'freebet' | 'bonus'] > 0;
            return (
              <div key={item.value} className="flex items-center space-x-2">
                <RadioGroupItem
                  value={item.value}
                  id={`fonte-${item.value}`}
                  disabled={!hasSaldo}
                />
                <Label
                  htmlFor={`fonte-${item.value}`}
                  className={cn(
                    "text-xs flex items-center gap-1 cursor-pointer",
                    !hasSaldo && "opacity-40"
                  )}
                >
                  <FonteIcon fonte={item.value} />
                  {item.label}
                </Label>
              </div>
            );
          })}
        </RadioGroup>
      </div>
    );
  }
  
  // Modo Select (padrão)
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-muted-foreground">
            {label}
            {showRequired && <span className="text-destructive">*</span>}
          </Label>
          {showHelp && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3 w-3 text-muted-foreground/50 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-xs">
                    Define qual pool de capital será debitado/creditado.
                    <br /><br />
                    <strong>Saldo Real:</strong> Dinheiro próprio na casa
                    <br />
                    <strong>Freebet:</strong> Aposta grátis creditada
                    <br />
                    <strong>Bônus:</strong> Saldo promocional ativo
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      )}
      <Select
        value={value || ""}
        onValueChange={(v) => onChange(v as FonteSaldo)}
      >
        <SelectTrigger className={cn(
          size === 'sm' ? "h-8 text-xs" : "h-9 text-sm"
        )}>
          <SelectValue placeholder="Selecione..." />
        </SelectTrigger>
        <SelectContent>
          {FONTES_SALDO_LIST.map((item) => {
            const hasSaldo = !saldos || saldos[item.value.toLowerCase() as 'real' | 'freebet' | 'bonus'] > 0;
            const saldoValor = saldos ? saldos[item.value.toLowerCase() as 'real' | 'freebet' | 'bonus'] : null;
            
            return (
              <SelectItem
                key={item.value}
                value={item.value}
                disabled={!hasSaldo}
                className="text-xs"
              >
                <div className="flex items-center gap-1.5">
                  <FonteIcon fonte={item.value} />
                  {item.label}
                  {saldoValor !== null && saldos && (
                    <span className="text-muted-foreground ml-1">
                      ({formatSaldo(saldoValor, saldos.moeda)})
                    </span>
                  )}
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Hook para inferir fonte de saldo baseado em contexto
 * Usado para retrocompatibilidade com formulários antigos
 */
export function useFonteSaldoDefault(
  activeTab: string,
  estrategia: string | null
): FonteSaldo {
  return useMemo(() => {
    // Se aba é freebets, default é FREEBET
    if (activeTab === 'freebets') return 'FREEBET';
    
    // Se aba é bonus, default é BONUS
    if (activeTab === 'bonus' || activeTab === 'bonus-operacoes') return 'BONUS';
    
    // Se estratégia é extração, inferir fonte
    if (estrategia === 'EXTRACAO_FREEBET') return 'FREEBET';
    if (estrategia === 'EXTRACAO_BONUS') return 'BONUS';
    
    // Default: REAL
    return 'REAL';
  }, [activeTab, estrategia]);
}
