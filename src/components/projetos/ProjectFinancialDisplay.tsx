import { Wallet, TrendingUp, TrendingDown, ChevronDown } from "lucide-react";
import { getFinancialDisplay } from "@/lib/financial-display";
import type { MoedaConsolidacao } from "@/types/projeto";

interface ProjectFinancialDisplayProps {
  type: "saldo" | "lucro";
  /** Breakdown por moeda nativa - aceita qualquer moeda */
  breakdown: Record<string, number>;
  /** Valor total consolidado na moeda de consolidação do projeto */
  totalConsolidado: number;
  /** Moeda de consolidação do projeto (determina a exibição) */
  moedaConsolidacao: MoedaConsolidacao;
  /** Cotação USD/BRL para exibição */
  cotacaoPTAX: number;
}

/**
 * Símbolo de moeda
 */
function getCurrencySymbol(moeda: string): string {
  const symbols: Record<string, string> = {
    BRL: "R$",
    USD: "$",
    USDT: "$",
    USDC: "$",
    EUR: "€",
    GBP: "£",
    MXN: "$",
    MYR: "RM",
    COP: "$",
    ARS: "$",
  };
  return symbols[moeda] || moeda;
}

/**
 * Formata valor por moeda
 */
function formatCurrencyValue(value: number, moeda: string): string {
  const symbol = getCurrencySymbol(moeda);
  const formatted = Math.abs(value).toLocaleString('pt-BR', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
  return `${symbol} ${formatted}`;
}

/**
 * Componente de exibição financeira seguindo o padrão visual do Saldo Operável.
 * Mostra valor principal na moeda de consolidação e valor secundário na outra moeda.
 */
export function ProjectFinancialDisplay({
  type,
  breakdown,
  totalConsolidado,
  moedaConsolidacao,
  cotacaoPTAX,
}: ProjectFinancialDisplayProps) {
  const isSaldo = type === "saldo";
  
  const lucroDisplay = !isSaldo ? getFinancialDisplay(totalConsolidado) : null;
  const isPositive = isSaldo ? true : (lucroDisplay?.isPositive || lucroDisplay?.isZero);
  
  const label = isSaldo 
    ? "Saldo Bookmakers" 
    : (lucroDisplay?.isNegative ? "Prejuízo" : "Lucro");
  
  const Icon = isSaldo 
    ? Wallet 
    : (isPositive ? TrendingUp : TrendingDown);
  
  const iconColor = isSaldo 
    ? "text-muted-foreground" 
    : (isPositive ? "text-emerald-500" : "text-red-500");

  // Calcular valores para exibição
  // Valor principal: na moeda de consolidação
  // Valor secundário: na outra moeda (BRL se consolidação é USD, USD se consolidação é BRL)
  
  const moedaSecundaria = moedaConsolidacao === 'USD' ? 'BRL' : 'USD';
  
  // Valor na moeda de consolidação (somar valores nativos dessa moeda + converter outras)
  let valorPrincipal = 0;
  let valorSecundario = 0;
  
  Object.entries(breakdown).forEach(([moeda, valor]) => {
    if (moeda === moedaConsolidacao || 
        (moedaConsolidacao === 'USD' && ['USD', 'USDT', 'USDC'].includes(moeda))) {
      valorPrincipal += valor;
    } else if (moeda === 'BRL') {
      // Converter BRL para USD se consolidação é USD
      if (moedaConsolidacao === 'USD') {
        valorPrincipal += valor / cotacaoPTAX;
        valorSecundario += valor; // Manter BRL original para referência
      } else {
        valorPrincipal += valor;
      }
    } else if (['USD', 'USDT', 'USDC'].includes(moeda)) {
      // Converter USD para BRL se consolidação é BRL
      if (moedaConsolidacao === 'BRL') {
        valorPrincipal += valor * cotacaoPTAX;
        valorSecundario += valor; // Manter USD original para referência
      }
    } else {
      // Outras moedas - assumir conversão via USD
      valorPrincipal += moedaConsolidacao === 'USD' ? valor : valor * cotacaoPTAX;
    }
  });

  // Se consolidação é USD, mostrar equivalente em BRL como secundário
  // Se consolidação é BRL, mostrar equivalente em USD como secundário
  if (moedaConsolidacao === 'USD') {
    valorSecundario = valorPrincipal * cotacaoPTAX;
  } else {
    valorSecundario = valorPrincipal / cotacaoPTAX;
  }

  // Determinar cor do texto principal
  const textColor = isSaldo 
    ? "text-emerald-400" 
    : (lucroDisplay?.isNegative ? "text-red-400" : "text-emerald-400");

  // Formatar valores
  const valorPrincipalFormatado = formatCurrencyValue(
    isSaldo ? valorPrincipal : (lucroDisplay?.isNegative ? -Math.abs(valorPrincipal) : valorPrincipal),
    moedaConsolidacao
  );
  
  const valorSecundarioFormatado = formatCurrencyValue(valorSecundario, moedaSecundaria);

  // Verificar se há múltiplas moedas para mostrar o valor secundário
  const hasMultipleCurrencies = Object.keys(breakdown).length > 1 || 
    Object.keys(breakdown).some(m => m !== moedaConsolidacao);

  return (
    <div className="flex flex-col items-center gap-1 py-2">
      {/* Header */}
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Icon className={`h-4 w-4 ${iconColor}`} />
        <span>{label}</span>
      </div>
      
      {/* Valor Principal */}
      <div className="flex flex-col items-center">
        <div className="flex items-center gap-1">
          <span className={`text-lg font-semibold ${textColor}`}>
            {valorPrincipalFormatado}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground opacity-50" />
        </div>
        
        {/* Valor Secundário (aproximado na outra moeda) */}
        {hasMultipleCurrencies && valorSecundario > 0 && (
          <span className="text-xs text-muted-foreground">
            ≈ {valorSecundarioFormatado}
          </span>
        )}
      </div>
    </div>
  );
}
