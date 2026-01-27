import { Wallet, TrendingUp, TrendingDown, ChevronDown } from "lucide-react";
import { getFinancialDisplay } from "@/lib/financial-display";
import { useCotacoes } from "@/hooks/useCotacoes";
import type { MoedaConsolidacao } from "@/types/projeto";

interface ProjectFinancialDisplayProps {
  type: "saldo" | "lucro";
  /** Breakdown por moeda nativa - aceita qualquer moeda */
  breakdown: Record<string, number>;
  /** Valor total consolidado na moeda de consolidação do projeto */
  totalConsolidado: number;
  /** Moeda de consolidação do projeto (determina a exibição) */
  moedaConsolidacao: MoedaConsolidacao;
  /** Cotação USD/BRL para exibição (fallback se context não disponível) */
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
 * 
 * Usa o hook useCotacoes centralizado para conversão de TODAS as moedas suportadas:
 * BRL, USD, EUR, GBP, MXN, MYR, COP, ARS, USDT, USDC
 */
export function ProjectFinancialDisplay({
  type,
  breakdown,
  totalConsolidado,
  moedaConsolidacao,
  cotacaoPTAX,
}: ProjectFinancialDisplayProps) {
  // Usar hook centralizado de cotações
  const { getRate, cotacaoUSD } = useCotacoes();
  
  // Usar cotação do context ou fallback da prop
  const taxaUSD = cotacaoUSD || cotacaoPTAX;
  
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
  // Valor principal: SEMPRE na moeda de consolidação do projeto
  // Valor secundário: na outra moeda (BRL se consolidação é USD, USD se consolidação é BRL)
  
  const moedaSecundaria = moedaConsolidacao === 'USD' ? 'BRL' : 'USD';
  
  // Agrupa moedas USD-like (stablecoins com paridade 1:1)
  const isUsdLike = (m: string) => ['USD', 'USDT', 'USDC'].includes(m);
  
  // Calcular valor total em BRL usando cotações centralizadas
  // O getRate(moeda) retorna a cotação da moeda para BRL
  let totalEmBRL = 0;
  
  Object.entries(breakdown).forEach(([moeda, valor]) => {
    if (moeda === 'BRL') {
      totalEmBRL += valor;
    } else if (isUsdLike(moeda)) {
      // USD, USDT, USDC - usar cotação USD
      totalEmBRL += valor * taxaUSD;
    } else {
      // EUR, GBP, MXN, MYR, COP, ARS, etc - usar cotação específica
      const taxaMoeda = getRate(moeda);
      totalEmBRL += valor * taxaMoeda;
    }
  });
  
  // Calcular valor principal baseado na moeda de consolidação
  let valorPrincipal = 0;
  if (moedaConsolidacao === 'USD') {
    // Projeto consolida em USD: converter total BRL para USD
    valorPrincipal = taxaUSD > 0 ? totalEmBRL / taxaUSD : 0;
  } else {
    // Projeto consolida em BRL: usar total em BRL diretamente
    valorPrincipal = totalEmBRL;
  }
  
  // Calcular valor secundário (aproximado na outra moeda)
  let valorSecundario = 0;
  if (moedaConsolidacao === 'USD') {
    // Principal é USD, secundário é BRL (= total já calculado em BRL)
    valorSecundario = totalEmBRL;
  } else {
    // Principal é BRL, secundário é USD
    valorSecundario = taxaUSD > 0 ? totalEmBRL / taxaUSD : 0;
  }

  // Determinar cor do texto principal
  const textColor = isSaldo 
    ? "text-emerald-400" 
    : (lucroDisplay?.isNegative ? "text-red-400" : "text-emerald-400");

  // Formatar valores - usar valor absoluto para lucro/prejuízo se negativo
  const valorParaExibir = isSaldo 
    ? valorPrincipal 
    : (lucroDisplay?.isNegative ? Math.abs(valorPrincipal) : valorPrincipal);
  
  const valorPrincipalFormatado = formatCurrencyValue(valorParaExibir, moedaConsolidacao);
  const valorSecundarioFormatado = formatCurrencyValue(Math.abs(valorSecundario), moedaSecundaria);

  // Sempre mostrar secundário se há valores
  const hasValues = Object.keys(breakdown).length > 0 || valorPrincipal !== 0;

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
        {hasValues && (
          <span className="text-xs text-muted-foreground">
            ≈ {valorSecundarioFormatado}
          </span>
        )}
      </div>
    </div>
  );
}
