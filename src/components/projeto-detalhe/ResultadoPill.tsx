import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Pencil } from "lucide-react";

type OperationType = "bookmaker" | "back" | "lay" | "cobertura";

interface ResultadoPillProps {
  apostaId: string;
  bookmarkerId: string;
  layExchangeBookmakerId?: string | null; // ID da exchange usada no Lay para Cobertura
  resultado: string | null;
  status: string;
  stake: number;
  odd: number;
  operationType?: OperationType;
  layLiability?: number;
  layOdd?: number;
  layStake?: number;
  layComissao?: number;
  isFreebetExtraction?: boolean; // true quando é extração de freebet (SNR/SR)
  onResultadoUpdated: () => void;
  onEditClick: () => void;
}

// Tipos de resultado disponíveis:
// GREEN: Aposta ganha - retorno total = stake * odd, lucro = stake * (odd - 1)
// RED: Aposta perdida - perda da stake completa
// MEIO_GREEN: Vitória parcial - lucro = 50% do lucro potencial = stake * (odd - 1) / 2
// MEIO_RED: Derrota parcial - perda = 50% da stake
// VOID: Aposta cancelada - stake devolvida, sem lucro/prejuízo

// Opções para Bookmaker (apostas tradicionais com meio resultados)
const RESULTADO_OPTIONS_BOOKMAKER = [
  { value: "GREEN", label: "Green", sublabel: "Seleção ganhou", color: "bg-emerald-500 hover:bg-emerald-600" },
  { value: "RED", label: "Red", sublabel: "Seleção perdeu", color: "bg-red-500 hover:bg-red-600" },
  { value: "MEIO_GREEN", label: "Meio Green", sublabel: "Vitória parcial", color: "bg-teal-500 hover:bg-teal-600" },
  { value: "MEIO_RED", label: "Meio Red", sublabel: "Derrota parcial", color: "bg-orange-500 hover:bg-orange-600" },
  { value: "VOID", label: "Void", sublabel: "Cancelada", color: "bg-gray-500 hover:bg-gray-600" },
];

// Opções para Exchange Back (simplificado: Green, Red, Void)
const RESULTADO_OPTIONS_EXCHANGE_BACK = [
  { value: "GREEN", label: "Green", sublabel: "Seleção ganhou", color: "bg-emerald-500 hover:bg-emerald-600" },
  { value: "RED", label: "Red", sublabel: "Seleção perdeu", color: "bg-red-500 hover:bg-red-600" },
  { value: "VOID", label: "Void", sublabel: "Aposta devolvida", color: "bg-gray-500 hover:bg-gray-600" },
];

// Opções para Exchange Lay (simplificado: Green, Red, Void)
const RESULTADO_OPTIONS_EXCHANGE_LAY = [
  { value: "GREEN", label: "Green", sublabel: "Lay ganhou (seleção perdeu)", color: "bg-emerald-500 hover:bg-emerald-600" },
  { value: "RED", label: "Red", sublabel: "Lay perdeu (seleção ganhou)", color: "bg-red-500 hover:bg-red-600" },
  { value: "VOID", label: "Void", sublabel: "Aposta devolvida", color: "bg-gray-500 hover:bg-gray-600" },
];

// Opções para Cobertura (qual lado da cobertura bateu)
const RESULTADO_OPTIONS_COBERTURA = [
  { value: "GREEN_BOOKMAKER", label: "Green Bookmaker", sublabel: "Seleção ganhou na Bookmaker", color: "bg-emerald-500 hover:bg-emerald-600" },
  { value: "RED_BOOKMAKER", label: "Red Bookmaker", sublabel: "Seleção perdeu na Bookmaker", color: "bg-red-500 hover:bg-red-600" },
  { value: "VOID", label: "Void", sublabel: "Devolvida em ambas", color: "bg-gray-500 hover:bg-gray-600" },
];

export function ResultadoPill({
  apostaId,
  bookmarkerId,
  layExchangeBookmakerId,
  resultado,
  status,
  stake,
  odd,
  operationType = "bookmaker",
  layLiability,
  layOdd,
  layStake,
  layComissao = 5,
  isFreebetExtraction = false,
  onResultadoUpdated,
  onEditClick,
}: ResultadoPillProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Determina o valor a exibir na pill (resultado ou status se pendente)
  const displayValue = resultado || status;
  const isPending = status === "PENDENTE" && !resultado;

  // Seleciona as opções corretas baseado no tipo de operação
  const getResultadoOptions = () => {
    switch (operationType) {
      case "lay":
        return RESULTADO_OPTIONS_EXCHANGE_LAY;
      case "back":
        return RESULTADO_OPTIONS_EXCHANGE_BACK;
      case "cobertura":
        return RESULTADO_OPTIONS_COBERTURA;
      case "bookmaker":
      default:
        return RESULTADO_OPTIONS_BOOKMAKER;
    }
  };

  const resultadoOptions = getResultadoOptions();

  const getResultadoColor = (value: string | null) => {
    switch (value) {
      case "GREEN": 
      case "GREEN_BOOKMAKER": 
        return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "RED": 
      case "RED_BOOKMAKER": 
        return "bg-red-500/20 text-red-400 border-red-500/30";
      case "MEIO_GREEN": return "bg-teal-500/20 text-teal-400 border-teal-500/30";
      case "MEIO_RED": return "bg-orange-500/20 text-orange-400 border-orange-500/30";
      case "VOID": return "bg-gray-500/20 text-gray-400 border-gray-500/30";
      case "PENDENTE": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      default: return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    }
  };

  const getDisplayLabel = (value: string) => {
    switch (value) {
      case "MEIO_GREEN": return "Meio Green";
      case "MEIO_RED": return "Meio Red";
      case "GREEN_BOOKMAKER": return "Green Book";
      case "RED_BOOKMAKER": return "Red Book";
      default: return value;
    }
  };

  /**
   * Calcula o lucro/prejuízo baseado no resultado e tipo de operação
   */
  const calcularLucroPrejuizo = (novoResultado: string): number => {
    const comissao = (layComissao || 5) / 100;
    
    // Para operações Lay, a lógica é invertida
    if (operationType === "lay") {
      const liability = layLiability || stake * ((layOdd || odd) - 1);
      const layStakeVal = stake;
      
      switch (novoResultado) {
        case "GREEN": // Seleção perdeu, lay ganhou
          return layStakeVal * (1 - comissao);
        case "RED": // Seleção ganhou, lay perdeu
          return -liability;
        case "VOID":
          return 0;
        default:
          return 0;
      }
    }
    
    // Para cobertura, calcular baseado nos dados reais
    if (operationType === "cobertura") {
      const backOdd = odd;
      const backStake = stake;
      const layOddVal = layOdd || 2;
      const stakeLay = layStake || (backStake * backOdd) / (layOddVal - comissao);
      const responsabilidade = layLiability || stakeLay * (layOddVal - 1);
      
      // Para extração de freebet, o lucro é sempre o mesmo independente do resultado
      // (o lucro garantido da cobertura)
      if (isFreebetExtraction) {
        const lucroSeBackGanhar = (backStake * (backOdd - 1)) - responsabilidade;
        const lucroSeLayGanhar = (stakeLay * (1 - comissao)); // Não subtraímos stake pq é freebet
        const lucroGarantido = Math.min(lucroSeBackGanhar, lucroSeLayGanhar);
        
        switch (novoResultado) {
          case "GREEN_BOOKMAKER":
          case "RED_BOOKMAKER":
            return Math.max(lucroGarantido, lucroSeBackGanhar, lucroSeLayGanhar); // Sempre positivo
          case "VOID":
            return 0;
          default:
            return 0;
        }
      }
      
      // Cobertura normal (qualifying bet ou proteção)
      switch (novoResultado) {
        case "GREEN_BOOKMAKER": // Back ganhou
          return (backStake * (backOdd - 1)) - responsabilidade;
        case "RED_BOOKMAKER": // Lay ganhou
          return (stakeLay * (1 - comissao)) - backStake;
        case "VOID":
          return 0;
        default:
          return 0;
      }
    }
    
    // Para Exchange Back
    if (operationType === "back") {
      const lucroBruto = stake * (odd - 1);
      switch (novoResultado) {
        case "GREEN":
          return lucroBruto * (1 - comissao);
        case "RED":
          return -stake;
        case "VOID":
          return 0;
        default:
          return 0;
      }
    }
    
    // Para Bookmaker (com meio resultados)
    switch (novoResultado) {
      case "GREEN":
        return stake * (odd - 1);
      case "RED":
        return -stake;
      case "MEIO_GREEN":
        return stake * (odd - 1) / 2;
      case "MEIO_RED":
        return -stake / 2;
      case "VOID":
        return 0;
      default:
        return 0;
    }
  };

  /**
   * Calcula o valor de retorno baseado no resultado e tipo de operação
   */
  const calcularValorRetorno = (novoResultado: string): number => {
    const comissao = (layComissao || 5) / 100;
    
    // Para operações Lay
    if (operationType === "lay") {
      const layStakeVal = stake;
      
      switch (novoResultado) {
        case "GREEN": // Lay ganhou - recebe stake menos comissão
          return layStakeVal * (1 - comissao);
        case "RED": // Lay perdeu - perde liability
          return 0;
        case "VOID":
          return 0; // Liability liberada
        default:
          return 0;
      }
    }
    
    // Para Cobertura
    if (operationType === "cobertura") {
      const backOdd = odd;
      const backStake = stake;
      const layOddVal = layOdd || 2;
      const stakeLay = layStake || (backStake * backOdd) / (layOddVal - comissao);
      
      // Para extração de freebet, retorno é o lucro garantido (sempre positivo)
      if (isFreebetExtraction) {
        const lucroSeBackGanhar = (backStake * (backOdd - 1)) - (layLiability || stakeLay * (layOddVal - 1));
        const lucroSeLayGanhar = stakeLay * (1 - comissao);
        const lucroGarantido = Math.min(lucroSeBackGanhar, lucroSeLayGanhar);
        
        switch (novoResultado) {
          case "GREEN_BOOKMAKER":
          case "RED_BOOKMAKER":
            return Math.max(lucroGarantido, lucroSeBackGanhar, lucroSeLayGanhar);
          case "VOID":
            return 0;
          default:
            return 0;
        }
      }
      
      // Cobertura normal
      switch (novoResultado) {
        case "GREEN_BOOKMAKER":
          // Recebemos do back, pagamos lay
          return backStake * backOdd - (layLiability || stakeLay * (layOddVal - 1));
        case "RED_BOOKMAKER":
          // Recebemos do lay
          return stakeLay * (1 - comissao);
        case "VOID":
          return backStake; // Stakes devolvidas
        default:
          return 0;
      }
    }
    
    // Para Exchange Back
    if (operationType === "back") {
      const lucroBruto = stake * (odd - 1);
      switch (novoResultado) {
        case "GREEN":
          return stake + lucroBruto * (1 - comissao);
        case "RED":
          return 0;
        case "VOID":
          return stake;
        default:
          return 0;
      }
    }
    
    // Para Bookmaker (com meio resultados)
    switch (novoResultado) {
      case "GREEN":
        return stake * odd;
      case "RED":
        return 0;
      case "MEIO_GREEN":
        return stake + (stake * (odd - 1) / 2);
      case "MEIO_RED":
        return stake / 2;
      case "VOID":
        return stake;
      default:
        return 0;
    }
  };

  /**
   * Calcula o ajuste de saldo para um determinado resultado
   * Considera o tipo de operação para calcular corretamente
   */
  const calcularAjusteSaldo = (resultado: string): number => {
    const comissao = (layComissao || 5) / 100;
    
    // Para operações Lay
    if (operationType === "lay") {
      const liability = layLiability || stake * ((layOdd || odd) - 1);
      const layStakeVal = layStake || stake;
      
      switch (resultado) {
        case "GREEN": // Lay ganhou - recebemos stake menos comissão
          return layStakeVal * (1 - comissao);
        case "RED": // Lay perdeu - perdemos liability
          return -liability;
        case "VOID":
          return 0;
        default:
          return 0;
      }
    }
    
    // Para Cobertura - consideramos apenas o bookmaker principal
    // O lay exchange é tratado separadamente se necessário
    if (operationType === "cobertura") {
      const backOdd = odd;
      const backStake = stake;
      const layOddVal = layOdd || 2;
      const stakeLay = layStake || (backStake * backOdd) / (layOddVal - comissao);
      const responsabilidade = layLiability || stakeLay * (layOddVal - 1);
      
      // Para extração de freebet, o ajuste de saldo é sempre positivo
      if (isFreebetExtraction) {
        const lucroSeBackGanhar = (backStake * (backOdd - 1)) - responsabilidade;
        const lucroSeLayGanhar = stakeLay * (1 - comissao);
        const lucroGarantido = Math.min(lucroSeBackGanhar, lucroSeLayGanhar);
        
        switch (resultado) {
          case "GREEN_BOOKMAKER":
          case "RED_BOOKMAKER":
            return Math.max(lucroGarantido, lucroSeBackGanhar, lucroSeLayGanhar);
          case "VOID":
            return 0;
          default:
            return 0;
        }
      }
      
      // Cobertura normal
      switch (resultado) {
        case "GREEN_BOOKMAKER": // Back ganhou - recebemos lucro do back
          return backStake * (backOdd - 1);
        case "RED_BOOKMAKER": // Back perdeu - perdemos stake do back
          return -backStake;
        case "VOID":
          return 0;
        default:
          return 0;
      }
    }
    
    // Para Exchange Back
    if (operationType === "back") {
      const lucroBruto = stake * (odd - 1);
      switch (resultado) {
        case "GREEN":
          return lucroBruto * (1 - comissao);
        case "RED":
          return -stake;
        case "VOID":
          return 0;
        default:
          return 0;
      }
    }
    
    // Para Bookmaker (com meio resultados)
    switch (resultado) {
      case "GREEN":
        return stake * (odd - 1);
      case "RED":
        return -stake;
      case "MEIO_GREEN":
        return stake * (odd - 1) / 2;
      case "MEIO_RED":
        return -stake / 2;
      case "VOID":
        return 0;
      default:
        return 0;
    }
  };

  /**
   * Calcula o ajuste de saldo para a Exchange quando o Lay ganha na cobertura
   */
  const calcularAjusteSaldoExchange = (resultado: string): number => {
    const comissao = (layComissao || 5) / 100;
    
    if (operationType !== "cobertura") return 0;
    
    const layOddVal = layOdd || 2;
    const stakeLay = layStake || (stake * odd) / (layOddVal - comissao);
    const responsabilidade = layLiability || stakeLay * (layOddVal - 1);
    
    switch (resultado) {
      case "GREEN_BOOKMAKER": // Back ganhou - Exchange perde a liability (já foi reservada)
        return -responsabilidade;
      case "RED_BOOKMAKER": // Lay ganhou - Exchange ganha stake menos comissão
        return stakeLay * (1 - comissao);
      case "VOID":
        return 0;
      default:
        return 0;
    }
  };

  /**
   * Atualiza o saldo do bookmaker baseado na mudança de resultado
   * Esta função considera a reversão do resultado anterior e aplicação do novo
   */
  const atualizarSaldoBookmaker = async (
    resultadoAnterior: string | null,
    resultadoNovo: string
  ) => {
    try {
      let saldoAjuste = 0;

      // Reverter efeito do resultado anterior (se havia um resultado definido)
      if (resultadoAnterior && resultadoAnterior !== "PENDENTE") {
        saldoAjuste -= calcularAjusteSaldo(resultadoAnterior);
      }

      // Aplicar efeito do novo resultado
      saldoAjuste += calcularAjusteSaldo(resultadoNovo);

      if (saldoAjuste !== 0) {
        const { data: bookmaker } = await supabase
          .from("bookmakers")
          .select("saldo_atual")
          .eq("id", bookmarkerId)
          .maybeSingle();

        if (bookmaker) {
          const novoSaldo = Math.max(0, bookmaker.saldo_atual + saldoAjuste);
          await supabase
            .from("bookmakers")
            .update({ saldo_atual: novoSaldo })
            .eq("id", bookmarkerId);
        }
      }

      // Para Cobertura, também atualizar o saldo da Exchange
      if (operationType === "cobertura" && layExchangeBookmakerId) {
        let saldoAjusteExchange = 0;

        // Reverter efeito do resultado anterior na exchange
        if (resultadoAnterior && resultadoAnterior !== "PENDENTE") {
          saldoAjusteExchange -= calcularAjusteSaldoExchange(resultadoAnterior);
        }

        // Aplicar efeito do novo resultado na exchange
        saldoAjusteExchange += calcularAjusteSaldoExchange(resultadoNovo);

        if (saldoAjusteExchange !== 0) {
          const { data: exchangeBookmaker } = await supabase
            .from("bookmakers")
            .select("saldo_atual")
            .eq("id", layExchangeBookmakerId)
            .maybeSingle();

          if (exchangeBookmaker) {
            const novoSaldoExchange = Math.max(0, exchangeBookmaker.saldo_atual + saldoAjusteExchange);
            await supabase
              .from("bookmakers")
              .update({ saldo_atual: novoSaldoExchange })
              .eq("id", layExchangeBookmakerId);
          }
        }
      }
    } catch (error) {
      console.error("Erro ao atualizar saldo do bookmaker:", error);
    }
  };

  const handleResultadoSelect = async (novoResultado: string) => {
    try {
      setLoading(true);

      const lucroPrejuizo = calcularLucroPrejuizo(novoResultado);
      const valorRetorno = calcularValorRetorno(novoResultado);

      // Atualizar a aposta no banco
      const { error } = await supabase
        .from("apostas")
        .update({
          resultado: novoResultado,
          status: "CONCLUIDA",
          lucro_prejuizo: lucroPrejuizo,
          valor_retorno: valorRetorno,
        })
        .eq("id", apostaId);

      if (error) throw error;

      // Atualizar saldo do bookmaker
      await atualizarSaldoBookmaker(resultado, novoResultado);

      toast.success(`Resultado atualizado para ${getDisplayLabel(novoResultado)}`);
      setOpen(false);
      
      // Notificar o parent para refetch dos dados
      onResultadoUpdated();
    } catch (error: any) {
      toast.error("Erro ao atualizar resultado: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      {/* Pill de Resultado - sempre clicável para alterar resultado */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="focus:outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <Badge 
              className={`${getResultadoColor(displayValue)} text-[10px] px-1.5 py-0 cursor-pointer hover:opacity-80 transition-opacity`}
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : getDisplayLabel(displayValue)}
            </Badge>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="end">
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground mb-1 font-medium">
              {operationType === "lay" ? "Resultado do Lay" : 
               operationType === "cobertura" ? "Resultado da Cobertura" :
               operationType === "back" ? "Resultado na Exchange" : "Alterar Resultado"}
            </p>
            {resultadoOptions.map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant={resultado === option.value ? "default" : "outline"}
                className={resultado === option.value 
                  ? `${option.color} text-white justify-start text-xs h-auto py-1.5 flex-col items-start`
                  : "justify-start text-xs h-auto py-1.5 hover:bg-accent flex-col items-start"
                }
                onClick={() => handleResultadoSelect(option.value)}
                disabled={loading}
              >
                <span className="font-medium">{option.label}</span>
                <span className="text-[10px] opacity-70 font-normal">{option.sublabel}</span>
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Botão de edição completa */}
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 text-muted-foreground hover:text-foreground"
        onClick={(e) => {
          e.stopPropagation();
          onEditClick();
        }}
      >
        <Pencil className="h-3 w-3" />
      </Button>
    </div>
  );
}
