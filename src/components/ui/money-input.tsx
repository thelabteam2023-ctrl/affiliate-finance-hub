import * as React from "react";
import { cn } from "@/lib/utils";

interface MoneyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
  /** Moeda para exibição formatada (apenas visual no blur) */
  currency?: string;
  /** Mínimo de dígitos visíveis (para largura) */
  minDigits?: number;
  /** Tipo do campo para navegação por teclado */
  "data-field-type"?: string;
}

/**
 * Input monetário com UX correta:
 * - Durante foco: número puro, sem máscara, edição livre
 * - No blur: valor formatado visualmente
 * - Nunca trava edição ou impede backspace
 * 
 * Regra de ouro: Máscara é apresentação, não controle.
 */
const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ className, value, onChange, currency = "BRL", minDigits = 5, onFocus, onBlur, "data-field-type": dataFieldType, ...props }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false);
    const [displayValue, setDisplayValue] = React.useState(value);
    
    // Sincronizar displayValue quando value externo muda (mas NÃO durante foco)
    React.useEffect(() => {
      if (!isFocused) {
        setDisplayValue(value);
      }
    }, [value, isFocused]);
    
    // Formatar valor para exibição (apenas no blur)
    const formatForDisplay = (val: string): string => {
      const numValue = parseFloat(val);
      if (isNaN(numValue) || val === "") return "";
      
      // Formatar com 2 casas decimais usando locale
      const formatted = numValue.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      
      return formatted;
    };
    
    // Valor exibido: durante foco = número puro, blur = formatado
    const valueToShow = isFocused ? displayValue : formatForDisplay(displayValue);
    
    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      // Exibir valor puro sem formatação para edição livre
      setDisplayValue(value);
      onFocus?.(e);
    };
    
    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      // Sincronizar com valor externo e aplicar formatação visual
      setDisplayValue(value);
      onBlur?.(e);
    };
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = e.target.value;
      
      // Permitir edição livre durante digitação
      // Aceitar: dígitos, ponto, vírgula (converter vírgula para ponto)
      const cleanValue = rawValue
        .replace(/,/g, '.') // Converter vírgula para ponto
        .replace(/[^\d.]/g, '') // Remover tudo exceto dígitos e ponto
        .replace(/(\..*)\./g, '$1'); // Apenas um ponto decimal
      
      setDisplayValue(cleanValue);
      onChange(cleanValue);
    };
    
    // Largura mínima baseada em minDigits (ex: 99.999,00 = ~10ch)
    const minWidth = `${minDigits + 5}ch`;
    
    return (
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck="false"
        data-lpignore="true"
        data-form-type="other"
        data-1p-ignore="true"
        data-field-type={dataFieldType}
        aria-autocomplete="none"
        value={valueToShow}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-all text-right font-medium",
          className,
        )}
        style={{ minWidth }}
        ref={ref}
        {...props}
      />
    );
  },
);
MoneyInput.displayName = "MoneyInput";

export { MoneyInput };
