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
  resultado: string | null;
  status: string;
  stake: number;
  odd: number;
  operationType?: OperationType;
  layLiability?: number;
  layOdd?: number;
  onResultadoUpdated: () => void;
  onEditClick: () => void;
}

// Tipos de resultado disponíveis:
// GREEN: Aposta ganha - retorno total = stake * odd, lucro = stake * (odd - 1)
// RED: Aposta perdida - perda da stake completa
// MEIO_GREEN: Vitória parcial - lucro = 50% do lucro potencial = stake * (odd - 1) / 2
// MEIO_RED: Derrota parcial - perda = 50% da stake
// VOID: Aposta cancelada - stake devolvida, sem lucro/prejuízo

// Opções para Bookmaker/Exchange Back (seleção GANHOU)
const RESULTADO_OPTIONS_BACK = [
  { value: "GREEN", label: "Green", sublabel: "Seleção ganhou", color: "bg-emerald-500 hover:bg-emerald-600" },
  { value: "RED", label: "Red", sublabel: "Seleção perdeu", color: "bg-red-500 hover:bg-red-600" },
  { value: "MEIO_GREEN", label: "Meio Green", sublabel: "Vitória parcial", color: "bg-teal-500 hover:bg-teal-600" },
  { value: "MEIO_RED", label: "Meio Red", sublabel: "Derrota parcial", color: "bg-orange-500 hover:bg-orange-600" },
  { value: "VOID", label: "Void", sublabel: "Cancelada", color: "bg-gray-500 hover:bg-gray-600" },
];

// Opções para Exchange Lay (seleção PERDEU = lucro para o layer)
const RESULTADO_OPTIONS_LAY = [
  { value: "GREEN", label: "Green", sublabel: "Seleção perdeu (Lay ganhou)", color: "bg-emerald-500 hover:bg-emerald-600" },
  { value: "RED", label: "Red", sublabel: "Seleção ganhou (Lay perdeu)", color: "bg-red-500 hover:bg-red-600" },
  { value: "MEIO_GREEN", label: "Meio Green", sublabel: "Vitória parcial Lay", color: "bg-teal-500 hover:bg-teal-600" },
  { value: "MEIO_RED", label: "Meio Red", sublabel: "Derrota parcial Lay", color: "bg-orange-500 hover:bg-orange-600" },
  { value: "VOID", label: "Void", sublabel: "Cancelada", color: "bg-gray-500 hover:bg-gray-600" },
];

// Opções para Cobertura (resultado baseado em qual lado bateu)
const RESULTADO_OPTIONS_COBERTURA = [
  { value: "GREEN", label: "Green", sublabel: "Back ganhou (lucro garantido)", color: "bg-emerald-500 hover:bg-emerald-600" },
  { value: "RED", label: "Red", sublabel: "Lay ganhou (lucro garantido)", color: "bg-red-500 hover:bg-red-600" },
  { value: "VOID", label: "Void", sublabel: "Cancelada", color: "bg-gray-500 hover:bg-gray-600" },
];

export function ResultadoPill({
  apostaId,
  bookmarkerId,
  resultado,
  status,
  stake,
  odd,
  operationType = "bookmaker",
  layLiability,
  layOdd,
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
        return RESULTADO_OPTIONS_LAY;
      case "cobertura":
        return RESULTADO_OPTIONS_COBERTURA;
      case "back":
      case "bookmaker":
      default:
        return RESULTADO_OPTIONS_BACK;
    }
  };

  const resultadoOptions = getResultadoOptions();

  const getResultadoColor = (value: string | null) => {
    switch (value) {
      case "GREEN": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "RED": return "bg-red-500/20 text-red-400 border-red-500/30";
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
      default: return value;
    }
  };

  /**
   * Calcula o lucro/prejuízo baseado no resultado e tipo de operação
   */
  const calcularLucroPrejuizo = (novoResultado: string): number => {
    // Para operações Lay, a lógica é invertida
    if (operationType === "lay") {
      const liability = layLiability || stake * ((layOdd || odd) - 1);
      const layStake = stake;
      
      switch (novoResultado) {
        case "GREEN": // Seleção perdeu, lay ganhou
          return layStake * (1 - 0.05); // Stake menos comissão típica de 5%
        case "RED": // Seleção ganhou, lay perdeu
          return -liability;
        case "MEIO_GREEN":
          return (layStake * (1 - 0.05)) / 2;
        case "MEIO_RED":
          return -liability / 2;
        case "VOID":
          return 0;
        default:
          return 0;
      }
    }
    
    // Para cobertura, lucro garantido independente do resultado
    if (operationType === "cobertura") {
      // O lucro já foi pré-calculado e armazenado, mas podemos usar stake como base
      switch (novoResultado) {
        case "GREEN":
        case "RED":
          // Em cobertura, ambos resultados geram lucro (lucro garantido)
          return stake * (odd - 1) * 0.8; // Aproximação do lucro garantido
        case "VOID":
          return 0;
        default:
          return 0;
      }
    }
    
    // Para Back (bookmaker ou exchange back)
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
    // Para operações Lay
    if (operationType === "lay") {
      const liability = layLiability || stake * ((layOdd || odd) - 1);
      const layStake = stake;
      
      switch (novoResultado) {
        case "GREEN": // Lay ganhou - recebe stake menos comissão
          return layStake * (1 - 0.05);
        case "RED": // Lay perdeu - perde liability
          return 0;
        case "MEIO_GREEN":
          return layStake * (1 - 0.05) / 2;
        case "MEIO_RED":
          return liability / 2;
        case "VOID":
          return 0; // Liability liberada
        default:
          return 0;
      }
    }
    
    // Para Back (bookmaker ou exchange back)
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
        switch (resultadoAnterior) {
          case "GREEN":
            saldoAjuste -= stake * (odd - 1);
            break;
          case "RED":
            saldoAjuste += stake;
            break;
          case "MEIO_GREEN":
            saldoAjuste -= stake * (odd - 1) / 2;
            break;
          case "MEIO_RED":
            saldoAjuste += stake / 2;
            break;
          case "VOID":
            // Nada a reverter
            break;
        }
      }

      // Aplicar efeito do novo resultado
      switch (resultadoNovo) {
        case "GREEN":
          saldoAjuste += stake * (odd - 1);
          break;
        case "RED":
          saldoAjuste -= stake;
          break;
        case "MEIO_GREEN":
          saldoAjuste += stake * (odd - 1) / 2;
          break;
        case "MEIO_RED":
          saldoAjuste -= stake / 2;
          break;
        case "VOID":
          // Stake desbloqueia, saldo não muda
          break;
      }

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
