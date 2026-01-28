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
import { Loader2, Pencil, CheckCircle2, XCircle, CircleDot, X, Check } from "lucide-react";
import { useBonusBalanceManager } from "@/hooks/useBonusBalanceManager";
import { useInvalidateBookmakerSaldos } from "@/hooks/useBookmakerSaldosQuery";
import { reliquidarAposta } from "@/services/aposta/ApostaService";

type OperationType = "bookmaker" | "back" | "lay" | "cobertura";

interface ResultadoPillProps {
  apostaId: string;
  bookmarkerId: string;
  projetoId: string; // NOVO: necessário para invalidar cache de saldos
  layExchangeBookmakerId?: string | null;
  resultado: string | null;
  status: string;
  stake: number;
  odd: number;
  operationType?: OperationType;
  layLiability?: number;
  layOdd?: number;
  layStake?: number;
  layComissao?: number;
  isFreebetExtraction?: boolean;
  gerouFreebet?: boolean;
  valorFreebetGerada?: number;
  stakeBonus?: number;
  bonusId?: string | null;
  contextoOperacional?: string | null; // Para identificar apostas de bônus
  estrategia?: string | null; // Para identificar apostas de extração de bônus
  onResultadoUpdated: () => void;
  onEditClick: () => void;
}

// Opções para Bookmaker (apostas tradicionais com meio resultados)
const RESULTADO_OPTIONS_BOOKMAKER = [
  { value: "GREEN", label: "Green", sublabel: "Seleção ganhou", icon: CheckCircle2, iconColor: "text-emerald-400", textColor: "text-emerald-400", color: "bg-emerald-500 hover:bg-emerald-600" },
  { value: "RED", label: "Red", sublabel: "Seleção perdeu", icon: X, iconColor: "text-red-400", textColor: "text-red-400", color: "bg-red-500 hover:bg-red-600" },
  { value: "MEIO_GREEN", label: "½ Green", sublabel: "Vitória parcial", icon: CheckCircle2, iconColor: "text-teal-400", textColor: "text-teal-400", color: "bg-teal-500 hover:bg-teal-600" },
  { value: "MEIO_RED", label: "½ Red", sublabel: "Derrota parcial", icon: X, iconColor: "text-orange-400", textColor: "text-orange-400", color: "bg-orange-500 hover:bg-orange-600" },
  { value: "VOID", label: "Void", sublabel: "Cancelada", icon: CircleDot, iconColor: "text-slate-400", textColor: "text-slate-400", color: "bg-gray-500 hover:bg-gray-600" },
];

// Opções para Exchange Back (simplificado: Green, Red, Void)
const RESULTADO_OPTIONS_EXCHANGE_BACK = [
  { value: "GREEN", label: "Green", sublabel: "Seleção ganhou", icon: CheckCircle2, iconColor: "text-emerald-400", textColor: "text-emerald-400", color: "bg-emerald-500 hover:bg-emerald-600" },
  { value: "RED", label: "Red", sublabel: "Seleção perdeu", icon: X, iconColor: "text-red-400", textColor: "text-red-400", color: "bg-red-500 hover:bg-red-600" },
  { value: "VOID", label: "Void", sublabel: "Aposta devolvida", icon: CircleDot, iconColor: "text-slate-400", textColor: "text-slate-400", color: "bg-gray-500 hover:bg-gray-600" },
];

// Opções para Exchange Lay (simplificado: Green, Red, Void)
const RESULTADO_OPTIONS_EXCHANGE_LAY = [
  { value: "GREEN", label: "Green", sublabel: "Lay ganhou (seleção perdeu)", icon: CheckCircle2, iconColor: "text-emerald-400", textColor: "text-emerald-400", color: "bg-emerald-500 hover:bg-emerald-600" },
  { value: "RED", label: "Red", sublabel: "Lay perdeu (seleção ganhou)", icon: X, iconColor: "text-red-400", textColor: "text-red-400", color: "bg-red-500 hover:bg-red-600" },
  { value: "VOID", label: "Void", sublabel: "Aposta devolvida", icon: CircleDot, iconColor: "text-slate-400", textColor: "text-slate-400", color: "bg-gray-500 hover:bg-gray-600" },
];

// Opções para Cobertura (qual lado da cobertura bateu)
const RESULTADO_OPTIONS_COBERTURA = [
  { value: "GREEN_BOOKMAKER", label: "Green Bookmaker", sublabel: "Seleção ganhou na Bookmaker", icon: CheckCircle2, iconColor: "text-emerald-400", textColor: "text-emerald-400", color: "bg-emerald-500 hover:bg-emerald-600" },
  { value: "RED_BOOKMAKER", label: "Red Bookmaker", sublabel: "Seleção perdeu na Bookmaker", icon: X, iconColor: "text-red-400", textColor: "text-red-400", color: "bg-red-500 hover:bg-red-600" },
  { value: "VOID", label: "Void", sublabel: "Devolvida em ambas", icon: CircleDot, iconColor: "text-slate-400", textColor: "text-slate-400", color: "bg-gray-500 hover:bg-gray-600" },
];

export function ResultadoPill({
  apostaId,
  bookmarkerId,
  projetoId,
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
  gerouFreebet = false,
  valorFreebetGerada,
  stakeBonus = 0,
  bonusId = null,
  contextoOperacional,
  estrategia,
  onResultadoUpdated,
  onEditClick,
}: ResultadoPillProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Hook para gerenciar consumo de bônus
  const { 
    processarLiquidacaoBonus,
    reverterLiquidacaoBonus,
    atualizarProgressoRollover,
    reverterProgressoRollover,
    hasActiveRolloverBonus,
  } = useBonusBalanceManager();
  
  // Hook para invalidar cache de saldos após atualização
  const invalidateSaldos = useInvalidateBookmakerSaldos();

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
   * Liquida ou reliquida a aposta usando RPC atômica
   * O RPC cuida de:
   * - Atualizar status da aposta para LIQUIDADA
   * - Atualizar resultado
   * - Inserir no cash_ledger para cada perna
   * - Trigger atualiza saldos automaticamente
   * 
   * NOTA: Para cobertura, o RPC processa cada perna individualmente
   */
  const liquidarViaRPC = async (novoResultado: string, lucroPrejuizo: number) => {
    const result = await reliquidarAposta(apostaId, novoResultado, lucroPrejuizo);
    
    if (!result.success) {
      throw new Error(result.error?.message || 'Erro ao liquidar aposta');
    }
    
    console.log(`[ResultadoPill] Aposta ${apostaId} liquidada via RPC: ${novoResultado}`);
    return result;
  };

  const handleResultadoSelect = async (novoResultado: string) => {
    try {
      setLoading(true);

      const lucroPrejuizo = calcularLucroPrejuizo(novoResultado);
      const valorRetorno = calcularValorRetorno(novoResultado);

      // ====== LIQUIDAÇÃO VIA RPC ATÔMICA ======
      // O RPC cuida de: atualizar aposta, registrar no ledger, trigger atualiza saldo
      await liquidarViaRPC(novoResultado, lucroPrejuizo);
      
      // Atualizar valor_retorno separadamente (RPC não trata esse campo)
      await supabase
        .from("apostas_unificada")
        .update({ valor_retorno: valorRetorno })
        .eq("id", apostaId);

      // ====== LÓGICA DE CONSUMO DE BÔNUS ======
      // Se a aposta usou saldo de bônus, processar consumo proporcional
      // NOTA: Esta é a ÚNICA fonte de verdade para consumo de bônus

      // 2. LÓGICA DE CONSUMO DE BÔNUS
      // Se a aposta usou saldo de bônus, processar consumo proporcional
      // NOTA: Esta é a ÚNICA fonte de verdade para consumo de bônus
      if (bonusId && stakeBonus > 0) {
        const stakeReal = stake - stakeBonus;
        const resultadoAnterior = resultado || "PENDENTE";
        
        console.log(`[ResultadoPill] Processando bônus: bonusId=${bonusId}, stakeBonus=${stakeBonus}, stakeReal=${stakeReal}, resultado: ${resultadoAnterior} → ${novoResultado}`);
        
        // Reverter liquidação anterior se havia resultado
        if (resultadoAnterior !== "PENDENTE") {
          await reverterLiquidacaoBonus(resultadoAnterior, stakeBonus, bonusId);
        }
        
        // Processar nova liquidação
        await processarLiquidacaoBonus(
          novoResultado,
          stakeReal,
          stakeBonus,
          bonusId,
          lucroPrejuizo,
          bookmarkerId
        );
      }

      // ====== LÓGICA DE ROLLOVER ======
      // Regra: se a casa tem bônus ativo (rollover em andamento), qualquer aposta liquidada conta para o rollover,
      // independente da aba/contexto em que foi registrada.
      const temBonusAtivoParaRollover = await hasActiveRolloverBonus(projetoId, bookmarkerId);
      const resultadoContaRollover = novoResultado !== "VOID" && novoResultado !== "PENDENTE";
      const resultadoAnteriorContava = resultado && resultado !== "VOID" && resultado !== "PENDENTE";
      
      if (temBonusAtivoParaRollover) {
        if (resultadoContaRollover && !resultadoAnteriorContava) {
          // Primeira vez liquidando (não VOID) - adicionar ao rollover
          await atualizarProgressoRollover(projetoId, bookmarkerId, stake, odd);
        } else if (!resultadoContaRollover && resultadoAnteriorContava) {
          // Resultado válido → VOID/PENDENTE - reverter rollover
          await reverterProgressoRollover(projetoId, bookmarkerId, stake);
        }
      }
      // ====== LÓGICA DE FREEBET ======
      // Se a aposta gerou freebet, precisamos atualizar o status da freebet
      if (gerouFreebet) {
        const eraPendente = resultado === null || resultado === "PENDENTE";
        const agoraPendente = novoResultado === "PENDENTE";
        
        // Caso 1: PENDENTE → resultado final
        if (eraPendente && !agoraPendente) {
          if (novoResultado === "VOID") {
            // VOID não libera freebet
            await supabase
              .from("freebets_recebidas")
              .update({ status: "NAO_LIBERADA" })
              .eq("aposta_id", apostaId)
              .eq("status", "PENDENTE");
          } else {
            // GREEN, RED, MEIO_GREEN, MEIO_RED liberam a freebet
            const { data: freebetPendente } = await supabase
              .from("freebets_recebidas")
              .select("id, bookmaker_id, valor")
              .eq("aposta_id", apostaId)
              .eq("status", "PENDENTE")
              .maybeSingle();
            
            if (freebetPendente) {
              // Atualizar status para LIBERADA
              await supabase
                .from("freebets_recebidas")
                .update({ status: "LIBERADA" })
                .eq("id", freebetPendente.id);
              
              // MIGRADO PARA LEDGER: Creditar via RPC atômica
              const { creditarFreebetViaLedger } = await import("@/lib/freebetLedgerService");
              await creditarFreebetViaLedger(freebetPendente.bookmaker_id, freebetPendente.valor, 'LIBERACAO_PENDENTE', { descricao: 'Freebet liberada após liquidação de aposta qualificadora' });
            } else if (valorFreebetGerada && valorFreebetGerada > 0) {
              // FALLBACK: Registro não existe, criar agora e liberar
              // Buscar dados da aposta para obter user_id e projeto_id
              const { data: apostaData } = await supabase
                .from("apostas_unificada")
                .select("user_id, projeto_id, workspace_id, data_aposta")
                .eq("id", apostaId)
                .maybeSingle();
              
              if (apostaData) {
                // Criar registro em freebets_recebidas já como LIBERADA
                await supabase
                  .from("freebets_recebidas")
                  .insert({
                    bookmaker_id: bookmarkerId,
                    projeto_id: apostaData.projeto_id,
                    user_id: apostaData.user_id,
                    workspace_id: apostaData.workspace_id,
                    valor: valorFreebetGerada,
                    motivo: "Aposta qualificadora",
                    data_recebida: apostaData.data_aposta,
                    status: "LIBERADA",
                    aposta_id: apostaId,
                    utilizada: false,
                  });
                
                // MIGRADO PARA LEDGER: Creditar via RPC atômica
                const { creditarFreebetViaLedger } = await import("@/lib/freebetLedgerService");
                await creditarFreebetViaLedger(bookmarkerId, valorFreebetGerada, 'FALLBACK_QUALIFICADORA', { descricao: `Freebet criada via fallback para aposta ${apostaId.slice(0, 8)}` });
                
                console.log(`[ResultadoPill] Fallback: Criado freebet de ${valorFreebetGerada} para bookmaker ${bookmarkerId}`);
              }
            }
          }
        }
        // Caso 2: resultado final → PENDENTE (reversão - não aplicável via Pill, mas por segurança)
        else if (!eraPendente && agoraPendente) {
          const { data: freebetLiberada } = await supabase
            .from("freebets_recebidas")
            .select("id, bookmaker_id, valor")
            .eq("aposta_id", apostaId)
            .eq("status", "LIBERADA")
            .maybeSingle();
          
          if (freebetLiberada) {
            // MIGRADO PARA LEDGER: Estornar via RPC atômica
            const { estornarFreebetViaLedger } = await import("@/lib/freebetLedgerService");
            await estornarFreebetViaLedger(
              freebetLiberada.bookmaker_id, 
              freebetLiberada.valor, 
              'Reversão para PENDENTE (aposta reaberta)'
            );
            
            // Voltar para PENDENTE
            await supabase
              .from("freebets_recebidas")
              .update({ status: "PENDENTE" })
              .eq("id", freebetLiberada.id);
          }
        }
        // Caso 3: resultado final (não-VOID) → VOID
        else if (!eraPendente && resultado !== "VOID" && novoResultado === "VOID") {
          const { data: freebetLiberada } = await supabase
            .from("freebets_recebidas")
            .select("id, bookmaker_id, valor")
            .eq("aposta_id", apostaId)
            .eq("status", "LIBERADA")
            .maybeSingle();
          
          if (freebetLiberada) {
            // MIGRADO PARA LEDGER: Estornar via RPC atômica
            const { estornarFreebetViaLedger } = await import("@/lib/freebetLedgerService");
            await estornarFreebetViaLedger(
              freebetLiberada.bookmaker_id, 
              freebetLiberada.valor, 
              'Freebet revogada por resultado VOID'
            );
            
            // Mudar para NAO_LIBERADA
            await supabase
              .from("freebets_recebidas")
              .update({ status: "NAO_LIBERADA" })
              .eq("id", freebetLiberada.id);
          }
        }
      }

      toast.success(`Resultado atualizado para ${getDisplayLabel(novoResultado)}`);
      setOpen(false);
      
      // Invalidar cache de saldos para atualizar todas as UIs
      invalidateSaldos(projetoId);
      
      // CRÍTICO: Broadcast para sincronizar outras janelas/abas (Bônus, Freebet, etc.)
      try {
        const channel = new BroadcastChannel("aposta_channel");
        channel.postMessage({ 
          type: "resultado_updated", 
          projetoId, 
          apostaId,
          resultado: novoResultado 
        });
        channel.close();
      } catch (e) {
        // Fallback para localStorage em browsers sem suporte
        localStorage.setItem("aposta_saved", JSON.stringify({ 
          projetoId, 
          apostaId, 
          timestamp: Date.now() 
        }));
      }
      
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
              className={`${getResultadoColor(displayValue)} text-[10px] px-1.5 py-0.5 cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-1`}
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <>
                  {displayValue === "PENDENTE" ? (
                    <CircleDot className="h-3 w-3" />
                  ) : displayValue === "GREEN" || displayValue === "GREEN_BOOKMAKER" ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : displayValue === "RED" || displayValue === "RED_BOOKMAKER" ? (
                    <X className="h-3 w-3" />
                  ) : displayValue === "MEIO_GREEN" ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : displayValue === "MEIO_RED" ? (
                    <X className="h-3 w-3" />
                  ) : displayValue === "VOID" ? (
                    <CircleDot className="h-3 w-3" />
                  ) : null}
                  {getDisplayLabel(displayValue)}
                </>
              )}
            </Badge>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-2" align="end">
          <div className="flex flex-col gap-0.5">
            <p className="text-xs text-muted-foreground mb-2 font-medium">
              {operationType === "lay" ? "Resultado do Lay" : 
               operationType === "cobertura" ? "Resultado da Cobertura" :
               operationType === "back" ? "Resultado na Exchange" : "Alterar Resultado"}
            </p>
            {resultadoOptions.map((option) => {
              const OptionIcon = option.icon;
              const isSelected = resultado === option.value;
              return (
                <button
                  key={option.value}
                  className={`flex items-center gap-2 px-2 py-2 rounded-md transition-colors w-full text-left ${
                    isSelected 
                      ? 'bg-muted' 
                      : 'hover:bg-muted/50'
                  }`}
                  onClick={() => handleResultadoSelect(option.value)}
                  disabled={loading}
                >
                  <OptionIcon className={`h-4 w-4 ${option.iconColor}`} />
                  <span className={`text-sm font-medium ${option.textColor}`}>{option.label}</span>
                </button>
              );
            })}
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
