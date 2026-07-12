/**
 * SurebetModalRoot - Painel de Operação de Arbitragem
 * 
 * ARQUITETURA:
 * - Painel fullscreen (não modal tradicional)
 * - Sem overlay clicável - fecha apenas por X ou Cancelar
 * - Comportamento de calculadora profissional (surebet.com)
 * - Integra formulário completo
 * - Suporte a N pernas dinâmico
 * - Checkbox D para distribuição de lucro
 * - Carregamento de rascunhos
 * - Conversão de operações parciais
 */

import { useState, useEffect, useMemo, useRef, useCallback, KeyboardEvent } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { invalidateCanonicalCaches } from "@/lib/invalidateCanonicalCaches";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useBookmakerSaldosQuery, useInvalidateBookmakerSaldos } from "@/hooks/useBookmakerSaldosQuery";
import { logDebug } from "@/lib/debugLogger";
import { deletarAposta, liquidarPernaSurebet } from "@/services/aposta";
import { useCurrencySnapshot, type SupportedCurrency } from "@/hooks/useCurrencySnapshot";
import { useProjetoConsolidacao } from "@/hooks/useProjetoConsolidacao";
import { useCotacoes } from "@/hooks/useCotacoes";
import { useApostaRascunho, type ApostaRascunho, type RascunhoPernaData } from "@/hooks/useApostaRascunho";
import { useSurebetPrintImport } from "@/hooks/useSurebetPrintImport";
import { useSurebetCalculator, type OddEntry, type OddFormEntry } from "@/hooks/useSurebetCalculator";
import { pernasToInserts } from "@/types/apostasPernas";
import { type SurebetEngineConfig, convertViaBRL } from "@/utils/surebetCurrencyEngine";
import { HydrationAudit } from "@/engine/hydrationAudit";
import { validateSurebetCard } from "@/utils/surebetValidator";


import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Columns3, Rows3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Calculator, Save, Trash2, X, AlertTriangle, ArrowRight, Target, FileText, Brush, BookmarkPlus, BookmarkCheck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { BetFormHeaderV2 } from "@/components/apostas/BetFormHeaderV2";
import { ExploradorEventoPicker } from "@/components/surebet/ExploradorEventoPicker";
import { mapDailyEventToFormFields } from "@/components/surebet/utils/mapDailyEventToFormFields";
import { toLocalTimestamp, validarDataAposta } from "@/utils/dateUtils";
import { calcSurebetWindowHeight } from "@/lib/windowHelper";

import { SurebetTableRow } from "./SurebetTableRow";
import { SurebetTableFooter } from "./SurebetTableFooter";
import { SurebetColumnsView } from "./SurebetColumnsView";
import { SurebetMobileCard } from "./SurebetMobileCard";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  ConfirmLayCollapseDialog,
  type LayCollapseEntryPreview,
} from "@/components/projeto-detalhe/ConfirmLayCollapseDialog";
import { capitalComprometido } from "@/utils/pernaLayHelpers";

// ============================================
// TIPOS
// ============================================

interface Surebet {
  id: string;
  data_operacao: string;
  data_aposta?: string | null;
  evento: string;
  esporte: string;
  modelo: string;
  mercado?: string | null;
  stake_total: number;
  spread_calculado: number | null;
  roi_esperado: number | null;
  lucro_esperado: number | null;
  lucro_real: number | null;
  roi_real: number | null;
  status: string;
  resultado: string | null;
  observacoes: string | null;
  forma_registro?: string | null;
  estrategia?: string | null;
  contexto_operacional?: string | null;
  __seedPernas?: any[];
  // Snapshot opcional de logos importadas (Importar Jogo)
  time_casa?: string | null;
  time_fora?: string | null;
  home_team_logo_url?: string | null;
  away_team_logo_url?: string | null;
  league_logo_url?: string | null;
  daily_event_id?: string | null;
}

interface SurebetPerna {
  selecao: string;
  selecao_livre: string;
  bookmaker_id: string;
  bookmaker_nome: string;
  moeda: SupportedCurrency;
  odd: number;
  stake: number;
  stake_brl_referencia: number | null;
  cotacao_snapshot: number | null;
  cotacao_snapshot_at: string | null;
  resultado: string | null;
  lucro_prejuizo: number | null;
  lucro_prejuizo_brl_referencia: number | null;
  gerou_freebet: boolean;
  valor_freebet_gerada: number | null;
}

/** Tipo de ação executada para distinguir save de delete */
export type SurebetActionType = 'save' | 'delete';

interface SurebetModalRootProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projetoId: string;
  surebet?: Surebet | null;
  rascunho?: ApostaRascunho | null;
  activeTab?: string;
  /** Callback após sucesso. O parâmetro action distingue 'save' (criar/atualizar) de 'delete' (exclusão) */
  onSuccess: (action?: SurebetActionType) => void;
  /** Quando true, não fecha automaticamente após salvar (modo workstation contínuo) */
  embedded?: boolean;
}

// ============================================
// CONSTANTES
// ============================================

const ESPORTES = [
  "Futebol", "Basquete", "Tênis", "Baseball", "Hockey", "Handebol",
  "Futebol Americano", "Vôlei", "MMA/UFC", "Boxe", "Golfe", "Rugby",
  "League of Legends", "Counter-Strike", "Dota 2", "Valorant", "eFootball"
];

// Importar constantes canônicas do sistema
import {
  ESTRATEGIAS_LIST,
  CONTEXTOS_LIST,
  APOSTA_ESTRATEGIA,
  CONTEXTO_OPERACIONAL,
  getContextoFromTab,
  getEstrategiaFromTab,
  isAbaContextoFixo,
  isAbaEstrategiaFixa,
  type ApostaEstrategia,
  type ContextoOperacional,
} from "@/lib/apostaConstants";

const ARBITRAGEM_ESTRATEGIA: ApostaEstrategia = APOSTA_ESTRATEGIA.SUREBET;

const getPernaLabel = (index: number, total: number): string => {
  if (total === 2) return index === 0 ? "1" : "2";
  if (total === 3) return index === 0 ? "1" : index === 1 ? "X" : "2";
  return String(index + 1);
};

const getDefaultSelecoes = (numPernas: number): string[] => {
  if (numPernas === 2) return ["Sim", "Não"];
  if (numPernas === 3) return ["Casa", "Empate", "Fora"];
  return Array.from({ length: numPernas }, (_, i) => `Opção ${i + 1}`);
};

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export function SurebetModalRoot({ 
  open, 
  onOpenChange, 
  projetoId, 
  surebet = null,
  rascunho = null,
  activeTab = 'surebet',
  onSuccess,
  embedded = false
}: SurebetModalRootProps) {
  const isEditing = !!surebet?.id;
  const { workspaceId } = useWorkspace();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  
  // Hook de rascunhos
  const { criarRascunho, atualizarRascunho, deletarRascunho } = useApostaRascunho(projetoId, workspaceId || '');
  
  // Rastrear ID do rascunho salvo para evitar duplicatas
  const [rascunhoIdLocal, setRascunhoIdLocal] = useState<string | null>(rascunho?.id || null);
  
  const { getSnapshotFields } = useCurrencySnapshot();
  const {
    moedaConsolidacao,
    cotacaoAtual: cotacaoUsdFormulario, // REGRA: formulários SEMPRE usam cotação de trabalho (se configurada)
  } = useProjetoConsolidacao({ projetoId });
  const { getRate: getCotacaoRate } = useCotacoes();
  
  // Buscar cotações de trabalho multi-moeda do projeto
  const { data: workingRates } = useQuery({
    queryKey: ["projeto-working-rates", projetoId],
    queryFn: async () => {
      if (!projetoId) return null;
      const { data, error } = await supabase
        .from("projetos")
        .select("cotacao_trabalho, cotacao_trabalho_eur, cotacao_trabalho_gbp, cotacao_trabalho_myr, cotacao_trabalho_mxn, cotacao_trabalho_ars, cotacao_trabalho_cop, fonte_cotacao")
        .eq("id", projetoId)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!projetoId,
    staleTime: 30_000,
  });
  
  // Retorna a cotação efetiva (trabalho ou oficial) para uma moeda
  const getEffectiveRate = useCallback((moeda: string): number => {
    const m = moeda.toUpperCase();
    if (m === "BRL") return 1;
    
    const usarTrabalho = workingRates?.fonte_cotacao === "TRABALHO";
    
    if (usarTrabalho && workingRates) {
      const workRateMap: Record<string, number | null> = {
        USD: workingRates.cotacao_trabalho,
        EUR: workingRates.cotacao_trabalho_eur,
        GBP: workingRates.cotacao_trabalho_gbp,
        MYR: (workingRates as any).cotacao_trabalho_myr,
        MXN: (workingRates as any).cotacao_trabalho_mxn,
        ARS: (workingRates as any).cotacao_trabalho_ars,
        COP: (workingRates as any).cotacao_trabalho_cop,
      };
      const key = ["USDT", "USDC"].includes(m) ? "USD" : m;
      const workRate = workRateMap[key];
      if (workRate && workRate > 0) return workRate;
    }
    
    return getCotacaoRate(moeda) || 1;
  }, [workingRates, getCotacaoRate]);

  const { data: bookmakerSaldos = [], isLoading: saldosLoading } = useBookmakerSaldosQuery({
    projetoId,
    enabled: open,
    includeZeroBalance: isEditing,
  });
  const invalidateSaldos = useInvalidateBookmakerSaldos();

  // ============================================
  // ESTADOS DO FORMULÁRIO
  // ============================================
  
  const [estrategia, setEstrategia] = useState<ApostaEstrategia | null>(null);
  const [contexto, setContexto] = useState<ContextoOperacional>(CONTEXTO_OPERACIONAL.NORMAL);
  const [esporte, setEsporte] = useState("Futebol");
  const [evento, setEvento] = useState("");
  // Snapshot opcional do evento importado (Importar Jogo → daily_events).
  // Quando preenchido, é persistido em apostas_unificada para o card exibir
  // logos dos times. Limpado se o usuário editar manualmente o campo evento.
  const [importedHomeTeam, setImportedHomeTeam] = useState<string | null>(null);
  const [importedAwayTeam, setImportedAwayTeam] = useState<string | null>(null);
  const [importedHomeLogo, setImportedHomeLogo] = useState<string | null>(null);
  const [importedAwayLogo, setImportedAwayLogo] = useState<string | null>(null);
  const [importedLeagueLogo, setImportedLeagueLogo] = useState<string | null>(null);
  const [importedDailyEventId, setImportedDailyEventId] = useState<string | null>(null);
  const [mercado, setMercado] = useState("");
  const [dataAposta, setDataAposta] = useState("");
  
  const [modeloTipo, setModeloTipo] = useState<"2" | "3" | "4+">("2");
  const [numPernasCustom, setNumPernasCustom] = useState<number>(4);
  
  const numPernas = useMemo(() => {
    if (modeloTipo === "2") return 2;
    if (modeloTipo === "3") return 3;
    return numPernasCustom;
  }, [modeloTipo, numPernasCustom]);
  
  // Redimensionar janela apenas para 4+ pernas (2 e 3 mantêm tamanho fixo)
  useEffect(() => {
    if (!embedded || !open || numPernas <= 3) return;
    try {
      const targetHeight = calcSurebetWindowHeight(numPernas);
      window.resizeTo(window.outerWidth, targetHeight);
    } catch {
      // Silently ignore if resize not supported
    }
  }, [numPernas, embedded, open]);
  const [odds, setOdds] = useState<OddEntry[]>(() => 
    getDefaultSelecoes(2).map((sel, i) => {
      const entry = {
        bookmaker_id: "",
        moeda: "BRL" as SupportedCurrency,
        odd: "",
        stake: "",
        selecao: sel,
        selecaoLivre: "",
        isReference: i === 0,
        isManuallyEdited: false,
        stakeOrigem: undefined,
        additionalEntries: [],
      };
      HydrationAudit.mark(entry, "initial", { originalValue: 0 });
      return entry;
    })
  );
  
  const [directedProfitLegs, setDirectedProfitLegs] = useState<number[]>([0, 1]);
  const [equalizedStakesSnapshot, setEqualizedStakesSnapshot] = useState<number[]>([]);
  
  const [arredondarAtivado, setArredondarAtivado] = useState(true);
  const [arredondarValor, setArredondarValor] = useState("1");
  const [layCollapseRequest, setLayCollapseRequest] = useState<{
    pernaIndex: number;
    entriesPreview: LayCollapseEntryPreview[];
    remainingBookmakerNome?: string;
  } | null>(null);
  const [showComissao, setShowComissao] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage?.getItem('surebet_show_comissao') === '1';
  });
  const [saving, setSaving] = useState(false);
  const [deletingPerna, setDeletingPerna] = useState(false);
  
  const [showConversionDialog, setShowConversionDialog] = useState(false);
  const [conversionInProgress, setConversionInProgress] = useState(false);
  
  const [focusedLeg, setFocusedLeg] = useState<number | null>(null);
  const [viewLayout, setViewLayout] = useState<'vertical' | 'horizontal'>('vertical');
  const [showLiquidadaConfirmation, setShowLiquidadaConfirmation] = useState(false);
  const isLiquidada = surebet?.status === 'LIQUIDADA';
    const [errosPorPerna, setErrosPorPerna] = useState<Record<number, string>>({});

 /**
  * Função pura para calcular o saldo disponível e validar stakes em tempo real.
  */
 const calcularSaldoDisponivel = (
   pernaIndex: number,
   allOdds: OddEntry[],
   bookmakerSaldos: any[],
   isEditing: boolean,
   originalStakes: Map<string, { real: number; freebet: number }>
 ): { disponivel: number; excedeu: boolean; mensagem: string } => {
   const entry = allOdds[pernaIndex];
   if (!entry.bookmaker_id) return { disponivel: 0, excedeu: false, mensagem: "" };
 
   const selectedBk = bookmakerSaldos.find(b => b.id === entry.bookmaker_id);
   if (!selectedBk) return { disponivel: 0, excedeu: false, mensagem: "" };
 
   const isFB = entry.fonteSaldo === 'FREEBET';
   const parseStake = (s: any) => Number(String(s).replace(/[^0-9.]/g, '')) || 0;
   
   // 1. Saldo base + Crédito de edição
   const credito = isEditing ? (originalStakes.get(entry.bookmaker_id) || { real: 0, freebet: 0 }) : { real: 0, freebet: 0 };
   const saldoBase = isFB ? (selectedBk.saldo_freebet ?? 0) : (selectedBk.saldo_operavel ?? 0);
   const saldoDisponivelTotal = saldoBase + (isFB ? credito.freebet : credito.real);
 
   // 2. Descontar outras pernas/entradas que usem a mesma casa e mesmo tipo de saldo
   let alocadoOutras = 0;
   allOdds.forEach((other, idx) => {
     // Mesma perna: descontar apenas sub-entradas (se houver)
     if (idx === pernaIndex) {
       (other.additionalEntries || []).forEach(sub => {
         const subBk = sub.bookmaker_id || other.bookmaker_id;
         const subFB = sub.fonteSaldo === 'FREEBET';
         if (subBk === entry.bookmaker_id && subFB === isFB) {
           alocadoOutras += parseStake(sub.stake);
         }
       });
       return;
     }
 
     // Outras pernas
     const otherFB = other.fonteSaldo === 'FREEBET';
     if (other.bookmaker_id === entry.bookmaker_id && otherFB === isFB) {
       alocadoOutras += parseStake(other.stake);
     }
     (other.additionalEntries || []).forEach(sub => {
       const subBk = sub.bookmaker_id || other.bookmaker_id;
       const subFB = sub.fonteSaldo === 'FREEBET';
       if (subBk === entry.bookmaker_id && subFB === isFB) {
         alocadoOutras += parseStake(sub.stake);
       }
     });
   });
 
   const disponivelFinal = Math.max(0, saldoDisponivelTotal - alocadoOutras);
   const stakeAtual = parseStake(entry.stake);
   const excedeu = stakeAtual > disponivelFinal + 0.01;
 
   return {
     disponivel: disponivelFinal,
     excedeu,
     mensagem: excedeu ? `Saldo insuficiente. Disponível: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: selectedBk.moeda || 'USD' }).format(disponivelFinal)}` : ""
   };
 }

 
  
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  // Crédito virtual: armazena dados originais para modo edição
  // Transformados em estado para garantir que memos dependentes (bookmakersDisponiveis, balanceValidation) recomputem
  const [originalStakesByBookmaker, setOriginalStakesByBookmaker] = useState<Map<string, { real: number; freebet: number }>>(new Map());
  const [originalPernaIds, setOriginalPernaIds] = useState<string[]>([]);
  const [originalPernasSnapshot, setOriginalPernasSnapshot] = useState<Array<{ id: string; perna_id: string; bookmaker_id: string; stake: number; odd: number; selecao: string; selecao_livre: string; resultado: string | null; fonte_saldo: string | null }>>([]);

  // Sincronizar erros por perna em tempo real com base no estado atual das odds e saldos
  useEffect(() => {
    const newErros: Record<number, string> = {};
    odds.forEach((_, index) => {
      const validation = calcularSaldoDisponivel(
        index,
        odds,
        bookmakerSaldos,
        isEditing,
        originalStakesByBookmaker
      );
      if (validation.excedeu) {
        newErros[index] = validation.mensagem;
      }
    });
    setErrosPorPerna(newErros);
  }, [odds, bookmakerSaldos, isEditing, originalStakesByBookmaker]);

  const [selectedLegForPrint, setSelectedLegForPrint] = useState<number | null>(null);
  
  const {
    legPrints,
    processLegImage,
    clearLegPrint,
    initializeLegPrints,
    applyLegData,
    sharedContext,
  } = useSurebetPrintImport();

  // Bookmakers disponíveis (base - sem ajuste intra-form)
  // Em modo edição: incluir TODOS e aplicar crédito virtual das stakes originais
  const bookmakersDisponiveis = useMemo(() => {
    if (isEditing) {
      return bookmakerSaldos.map(bk => {
        const credito = originalStakesByBookmaker.get(bk.id) || { real: 0, freebet: 0 };
        if (credito.real > 0 || credito.freebet > 0) {
          return {
            ...bk,
            saldo_operavel: bk.saldo_operavel + credito.real,
            saldo_disponivel: bk.saldo_disponivel + credito.real,
            saldo_freebet: (bk.saldo_freebet ?? 0) + credito.freebet,
          };
        }
        return bk;
      });
    }
    return bookmakerSaldos.filter((bk) => bk.saldo_operavel >= 0.50);
  }, [bookmakerSaldos, isEditing, originalStakesByBookmaker]);

  /**
   * Retorna bookmakers com saldos ajustados para uma perna específica.
   * Desconta stakes já alocadas em pernas ANTERIORES que usam a mesma bookmaker.
   * 
   * CRÍTICO para evitar overbetting na mesma casa em múltiplas pernas.
   */
  /**
   * Retorna bookmakers com saldos ajustados para uma perna específica ou sub-entrada.
   * Desconta stakes já alocadas em TODAS AS OUTRAS pernas e sub-entradas que usam a mesma bookmaker.
   * 
   * @param legIndex Índice da perna
   * @param subEntryIndex Índice da sub-entrada (se aplicável)
   */
  const getAdjustedBookmakersForLeg = useCallback((legIndex: number, subEntryIndex?: number) => {
    return bookmakersDisponiveis.map(bk => {
      let alocadoOutros = 0;
      let alocadoOutrosFB = 0;

      odds.forEach((entry, i) => {
        // Perna principal
        if (entry.bookmaker_id === bk.id) {
          // Se não é a entrada que estamos calculando
          if (i !== legIndex || subEntryIndex !== undefined) {
            const s = parseFloat(entry.stake) || 0;
            if (entry.fonteSaldo === 'FREEBET') alocadoOutrosFB += s; else alocadoOutros += s;
          }
        }

        // Sub-entradas
        (entry.additionalEntries || []).forEach((sub, si) => {
          const subBk = sub.bookmaker_id || entry.bookmaker_id;
          if (subBk === bk.id) {
            // Se não é a sub-entrada que estamos calculando
            if (i !== legIndex || si !== subEntryIndex) {
              const s = parseFloat(sub.stake) || 0;
              if (sub.fonteSaldo === 'FREEBET') alocadoOutrosFB += s; else alocadoOutros += s;
            }
          }
        });
      });
      
      return {
        ...bk,
        saldo_operavel: Math.max(0, bk.saldo_operavel - alocadoOutros),
        saldo_disponivel: Math.max(0, bk.saldo_disponivel - alocadoOutros),
        saldo_freebet: Math.max(0, (bk.saldo_freebet || 0) - alocadoOutrosFB),
      };
    });
  }, [bookmakersDisponiveis, odds]);

  // ============================================
  // CALCULATOR HOOK
  // ============================================

  // Construir engineConfig com taxas BRL corretas
  // REGRA UNIFICADA PARA FORMULÁRIOS:
  //   Usa getEffectiveRate (Trabalho > Oficial) para TODAS as moedas — não só USD.
  //   Isso garante paridade absoluta com useProjetoCurrency.convertToConsolidation
  //   (que é usado pelo SurebetCard e pela persistência de lucro_esperado).
  //   ANTES: USD usava cotação de trabalho mas EUR/MXN/etc usavam PTAX live → drift.
  const engineConfig = useMemo((): import("@/utils/surebetCurrencyEngine").SurebetEngineConfig => {
    const consolidation = (moedaConsolidacao || "BRL") as SupportedCurrency;
    
    return {
      consolidationCurrency: consolidation,
      brlRates: {
        BRL: 1,
        USD: getEffectiveRate("USD"),
        EUR: getEffectiveRate("EUR"),
        GBP: getEffectiveRate("GBP"),
        MXN: getEffectiveRate("MXN"),
        MYR: getEffectiveRate("MYR"),
        ARS: getEffectiveRate("ARS"),
        COP: getEffectiveRate("COP"),
      },
    };
  }, [moedaConsolidacao, getEffectiveRate]);

  const { analysis, calculatedStakes, equalizedTargetStakes, targetPayoutsLocal, pernasValidas, arredondarStake, getOddMediaPerna, getStakeTotalPerna, directedStakes } = useSurebetCalculator({
    odds,
    directedProfitLegs,
    numPernas,
    arredondarAtivado,
    arredondarValor,
    bookmakerSaldos: bookmakerSaldos.map(b => ({ id: b.id, moeda: b.moeda })),
    engineConfig,
    equalizedStakesSnapshot,
  });

  // ============================================
  // INICIALIZAÇÃO E RESET
  // ============================================

  // Cleanup: resetar refs quando modal fecha para nunca reusar estado stale
  useEffect(() => {
    if (!open) {
      setOriginalPernasSnapshot([]);
      setOriginalPernaIds([]);
      setOriginalStakesByBookmaker(new Map());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    
    if (surebet) {
      // Modo edição ou duplicação
      setEvento(surebet.evento);
      setEsporte(surebet.esporte);
      setMercado(surebet.mercado || "");
      // Reidratar snapshot de evento importado (se existir)
      setImportedHomeTeam(surebet.time_casa ?? null);
      setImportedAwayTeam(surebet.time_fora ?? null);
      setImportedHomeLogo(surebet.home_team_logo_url ?? null);
      setImportedAwayLogo(surebet.away_team_logo_url ?? null);
      setImportedLeagueLogo(surebet.league_logo_url ?? null);
      setImportedDailyEventId(surebet.daily_event_id ?? null);
      setEstrategia((surebet.estrategia || ARBITRAGEM_ESTRATEGIA) as ApostaEstrategia);
      setContexto((surebet.contexto_operacional || CONTEXTO_OPERACIONAL.NORMAL) as ContextoOperacional);
      
      // Preservar Data/Hora original no modo edição
      const dataOrigem = surebet.data_aposta || surebet.data_operacao;
      if (dataOrigem) {
        const d = new Date(dataOrigem);
        if (!isNaN(d.getTime())) {
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          const hours = String(d.getHours()).padStart(2, '0');
          const minutes = String(d.getMinutes()).padStart(2, '0');
          setDataAposta(`${year}-${month}-${day}T${hours}:${minutes}`);
        }
      }
      
      const modeloSalvo = surebet.modelo || "1-2";
      if (modeloSalvo === "1-2") setModeloTipo("2");
      else if (modeloSalvo === "1-X-2") setModeloTipo("3");
      else {
        setModeloTipo("4+");
        const match = modeloSalvo.match(/(\d+)/);
        if (match) setNumPernasCustom(parseInt(match[1]));
      }
      
      if (surebet.id) {
        fetchLinkedPernas(surebet.id);
      } else if (surebet.__seedPernas && surebet.__seedPernas.length > 0) {
        hydratePernasIntoForm(surebet.__seedPernas, false);
      }
    } else if (rascunho) {
      // Modo rascunho: carregar TODOS os dados
      // IMPORTANTE: NÃO pré-selecionar estratégia se não estava definida no rascunho
      setEvento(rascunho.evento || "");
      setEsporte(rascunho.esporte || "Futebol");
      setMercado(rascunho.mercado || "");
      setEstrategia(ARBITRAGEM_ESTRATEGIA);
      setContexto((rascunho.contexto_operacional || CONTEXTO_OPERACIONAL.NORMAL) as ContextoOperacional);
      
      const numPernasRascunho = rascunho.quantidade_pernas || rascunho.pernas?.length || 2;
      
      if (rascunho.modelo_tipo) {
        setModeloTipo(rascunho.modelo_tipo);
        if (rascunho.modelo_tipo === "4+") setNumPernasCustom(numPernasRascunho);
      } else {
        if (numPernasRascunho === 2) setModeloTipo("2");
        else if (numPernasRascunho === 3) setModeloTipo("3");
        else {
          setModeloTipo("4+");
          setNumPernasCustom(numPernasRascunho);
        }
      }
      
      if (rascunho.pernas && rascunho.pernas.length > 0) {
        const defaultSelecoes = getDefaultSelecoes(numPernasRascunho);
        const rascunhoOdds: OddEntry[] = rascunho.pernas.map((perna, i) => ({
          bookmaker_id: perna.bookmaker_id || "",
          moeda: (perna.moeda as SupportedCurrency) || "BRL",
          odd: perna.odd?.toString() || "",
          stake: perna.stake?.toString() || "",
          selecao: perna.selecao || defaultSelecoes[i] || "",
          selecaoLivre: perna.selecao_livre || "",
          isReference: i === 0,
          isManuallyEdited: !!(perna.odd && perna.stake),
          stakeOrigem: undefined,
          additionalEntries: []
        }));
        
        rascunhoOdds.forEach(o => HydrationAudit.mark(o, "draft", { originalValue: parseFloat(o.stake) || 0 }));
        setOdds(rascunhoOdds);
        setDirectedProfitLegs(Array.from({ length: numPernasRascunho }, (_, i) => i));
      } else {
        resetToNewForm(numPernasRascunho);
      }
      
      initializeLegPrints(numPernasRascunho);
    } else {
      // Novo formulário
      resetToNewForm(3);
      setModeloTipo("3");
      
      // Se a aba tiver estratégia fixa, pré-selecionar automaticamente
      // Em "apostas-livres" ou "apostas", o usuário deve escolher manualmente
      setEstrategia(ARBITRAGEM_ESTRATEGIA);
      
      // Contexto baseado na aba
      if (activeTab === 'bonus') {
        setContexto(CONTEXTO_OPERACIONAL.BONUS);
      } else if (activeTab === 'freebets') {
        setContexto(CONTEXTO_OPERACIONAL.FREEBET);
      } else {
        setContexto(CONTEXTO_OPERACIONAL.NORMAL);
      }
      
      setEsporte("Futebol");
      setEvento("");
      setMercado("");
      // Limpar snapshot de evento importado
      setImportedHomeTeam(null);
      setImportedAwayTeam(null);
      setImportedHomeLogo(null);
      setImportedAwayLogo(null);
      setImportedLeagueLogo(null);
      setImportedDailyEventId(null);
      
      // Inicializar Data/Hora com momento atual (igual Aposta Simples)
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      setDataAposta(`${year}-${month}-${day}T${hours}:${minutes}`);
      
      initializeLegPrints(2);
    }
  }, [open, surebet, rascunho, activeTab]);

  // Sincronizar estratégia quando está "travada" pela aba
  // CRÍTICO: Garante que o estado de estratégia acompanhe a aba ativa mesmo após mudanças
  // Sincronizar estratégia E contexto quando estão "travados" pela aba
  // CRÍTICO: Quando a aba define estratégia/contexto fixos (ex: bonus, freebets),
  // precisamos atualizar os estados automaticamente
  useEffect(() => {
    if (!isEditing && open) {
      const lockedEstrategia = isAbaEstrategiaFixa(activeTab) ? getEstrategiaFromTab(activeTab) : null;
      const lockedContexto = isAbaContextoFixo(activeTab) ? getContextoFromTab(activeTab) : null;
      
      // Sincronizar estratégia se locked
      if (lockedEstrategia && estrategia !== lockedEstrategia) {
        setEstrategia(lockedEstrategia);
      }
      
      // Sincronizar contexto se locked (abas bonus/freebets)
      if (lockedContexto && contexto !== lockedContexto) {
        setContexto(lockedContexto);
      }
    }
  }, [open, isEditing, activeTab, estrategia, contexto]);

  // Atualizar pernas quando numPernas muda
  useEffect(() => {
    if (isEditing || !open) return;
    
    const currentCount = odds.length;
    if (currentCount === numPernas) return;
    
    const defaultSelecoes = getDefaultSelecoes(numPernas);
    
    if (numPernas > currentCount) {
      const newOdds = [...odds];
      for (let i = currentCount; i < numPernas; i++) {
        newOdds.push({
          bookmaker_id: "",
          moeda: "BRL" as SupportedCurrency,
          odd: "",
          stake: "",
          selecao: defaultSelecoes[i] || `Opção ${i + 1}`,
          selecaoLivre: "",
          isReference: false,
          isManuallyEdited: false,
          stakeOrigem: undefined,
          additionalEntries: []
        });
      }
      setOdds(newOdds);
      setDirectedProfitLegs(Array.from({ length: numPernas }, (_, i) => i));
      setEqualizedStakesSnapshot([]);
    } else {
      setOdds(odds.slice(0, numPernas));
      setDirectedProfitLegs(prev => prev.filter(i => i < numPernas));
      setEqualizedStakesSnapshot(prev => prev.slice(0, numPernas));
    }
    
    initializeLegPrints(numPernas);
  }, [numPernas, isEditing, open]);

  const resetToNewForm = (n: number) => {
    const defaultSelecoes = getDefaultSelecoes(n);
    setOdds(defaultSelecoes.map((sel, i) => ({
      bookmaker_id: "",
      moeda: "BRL" as SupportedCurrency,
      odd: "",
      stake: "",
      selecao: sel,
      selecaoLivre: "",
      isReference: i === 0,
      isManuallyEdited: false,
      stakeOrigem: undefined,
      additionalEntries: []
    })));
    setDirectedProfitLegs(Array.from({ length: n }, (_, i) => i));
    setEqualizedStakesSnapshot([]);
  };

  const [pernasLoading, setPernasLoading] = useState(false);

  const hydratePernasIntoForm = (pernasData: any[], preserveIds: boolean) => {
    // Modo 1:N — quando as pernas vêm com apostas_perna_entradas embutidas
    // (fluxo de duplicação de surebet), mapear cada perna com seu array de
    // entradas para preservar as subentradas (múltiplas casas por seleção).
    const hasEntries = pernasData.some((p: any) => Array.isArray(p?.apostas_perna_entradas) && p.apostas_perna_entradas.length > 0);
    if (hasEntries) {
      const source: any = preserveIds ? "db" : "print";
      const pernasOdds: OddEntry[] = pernasData.map((perna: any, groupIdx: number) => {
        const entradas = (perna.apostas_perna_entradas || []).slice().sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0));
        const mainEntry = entradas[0] || {
          bookmaker_id: perna.bookmaker_id || "",
          moeda: perna.moeda || "BRL",
          odd: perna.odd || "",
          stake: perna.stake || "",
          fonte_saldo: perna.fonte_saldo || "REAL",
        };
        const additionalEntries = entradas.slice(1);
        const entry: OddEntry = {
          bookmaker_id: mainEntry.bookmaker_id || "",
          moeda: (mainEntry.moeda || "BRL") as SupportedCurrency,
          odd: mainEntry.odd?.toString() || "",
          stake: mainEntry.stake?.toString() || "",
          selecao: perna.selecao,
          selecaoLivre: perna.selecao_livre || "",
          isReference: groupIdx === 0,
          isManuallyEdited: true,
          resultado: preserveIds ? (mainEntry.resultado || perna.resultado) : null,
          lucro_prejuizo: preserveIds ? perna.lucro_prejuizo : null,
          gerouFreebet: preserveIds ? (perna.gerou_freebet || false) : false,
          valorFreebetGerada: preserveIds ? (perna.valor_freebet_gerada?.toString() || "") : "",
          fonteSaldo: (mainEntry.fonte_saldo as 'REAL' | 'FREEBET') || 'REAL',
          pernaId: preserveIds ? perna.id : undefined,
          mainEntryId: preserveIds ? mainEntry.id : undefined,
          tipo: ((perna.tipo ?? mainEntry.tipo ?? 'back') as 'back' | 'lay'),
          comissao: Number(perna.comissao ?? mainEntry.comissao ?? 0) || 0,
          additionalEntries: additionalEntries.map((sub: any) => ({
            id: preserveIds ? sub.id : undefined,
            bookmaker_id: sub.bookmaker_id || "",
            moeda: (sub.moeda || "BRL") as SupportedCurrency,
            odd: sub.odd?.toString() || "",
            stake: sub.stake?.toString() || "",
            selecaoLivre: sub.selecao_livre || "",
            fonteSaldo: (sub.fonte_saldo as 'REAL' | 'FREEBET') || 'REAL',
            pernaId: preserveIds ? perna.id : undefined,
            tipo: ((sub.tipo ?? perna.tipo ?? 'back') as 'back' | 'lay'),
            comissao: Number(sub.comissao ?? perna.comissao ?? 0) || 0,
          })),
        };
        HydrationAudit.mark(entry, source, { originalValue: parseFloat(mainEntry.stake?.toString() || "0") });
        return entry;
      });
      setOdds(pernasOdds);
      setDirectedProfitLegs(Array.from({ length: pernasOdds.length }, (_, i) => i));
      return;
    }

    const groups = new Map<string, any[]>();
    const groupOrder: string[] = [];
    for (const perna of pernasData) {
      const key = perna.selecao || `__unnamed_${perna.id || groupOrder.length}`;
      if (!groups.has(key)) {
        groups.set(key, []);
        groupOrder.push(key);
      }
      groups.get(key)!.push(perna);
    }

    const source: any = surebet?.id ? "db" : "print";

    const pernasOdds: OddEntry[] = groupOrder.map((key, groupIdx) => {
      const groupPernas = groups.get(key)!;
      const mainPerna = groupPernas[0];
      const additionalPernas = groupPernas.slice(1);
      
      const entry: OddEntry = {
        bookmaker_id: mainPerna.bookmaker_id || "",
        moeda: (mainPerna.moeda || "BRL") as SupportedCurrency,
        odd: mainPerna.odd?.toString() || "",
        stake: mainPerna.stake?.toString() || "",
        selecao: mainPerna.selecao,
        selecaoLivre: mainPerna.selecao_livre || "",
        isReference: groupIdx === 0,
        isManuallyEdited: true,
        resultado: preserveIds ? mainPerna.resultado : null,
        lucro_prejuizo: preserveIds ? mainPerna.lucro_prejuizo : null,
        gerouFreebet: preserveIds ? (mainPerna.gerou_freebet || false) : false,
        valorFreebetGerada: preserveIds ? (mainPerna.valor_freebet_gerada?.toString() || "") : "",
        fonteSaldo: (mainPerna.fonte_saldo as 'REAL' | 'FREEBET') || 'REAL',
        pernaId: preserveIds ? mainPerna.id : undefined,
        additionalEntries: additionalPernas.map((sub: any) => ({
          bookmaker_id: sub.bookmaker_id || "",
          moeda: (sub.moeda || "BRL") as SupportedCurrency,
          odd: sub.odd?.toString() || "",
          stake: sub.stake?.toString() || "",
          selecaoLivre: sub.selecao_livre || "",
          fonteSaldo: (sub.fonte_saldo as 'REAL' | 'FREEBET') || 'REAL',
          pernaId: preserveIds ? sub.id : undefined,
        })),
      };

      HydrationAudit.mark(entry, source, { originalValue: parseFloat(mainPerna.stake?.toString() || "0") });
      return entry;
    });

    setOdds(pernasOdds);
    setDirectedProfitLegs(Array.from({ length: pernasOdds.length }, (_, i) => i));
  };

  const fetchLinkedPernas = async (surebetId: string, retryCount = 0) => {
    setPernasLoading(true);
    try {
      // Passo 1: Carregar pernas E suas entradas de forma estruturada (1:N)
      const { data: pernasData, error: pernasError } = await supabase
        .from("apostas_pernas")
        .select(`
          *,
          bookmakers (nome),
          apostas_perna_entradas (
            *
          )
        `)
        .eq("aposta_id", surebetId)
        .order("ordem", { ascending: true });

      if (pernasError) {
        console.error("[SurebetModalRoot] Erro ao buscar pernas:", pernasError);
        if (retryCount < 2) {
          await new Promise(resolve => setTimeout(resolve, 500));
          return fetchLinkedPernas(surebetId, retryCount + 1);
        }
        toast.error("Erro ao carregar entradas da operação. Recarregue a página.");
        return;
      }

      if (!pernasData || pernasData.length === 0) {
        if (retryCount < 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
          return fetchLinkedPernas(surebetId, retryCount + 1);
        }
        return;
      }

      // Crédito virtual para edição
      const stakeMap = new Map<string, { real: number; freebet: number }>();
      const flatSnapshot: any[] = [];
      
      pernasData.forEach((perna: any) => {
        const entradas = perna.apostas_perna_entradas || [];
        entradas.forEach((entrada: any) => {
          if (entrada.bookmaker_id && entrada.stake) {
            const cur = stakeMap.get(entrada.bookmaker_id) || { real: 0, freebet: 0 };
            const val = parseFloat(entrada.stake) || 0;
            if (entrada.fonte_saldo === 'FREEBET') cur.freebet += val; else cur.real += val;
            stakeMap.set(entrada.bookmaker_id, cur);
            
            flatSnapshot.push({
              id: entrada.id,
              perna_id: perna.id,
              bookmaker_id: entrada.bookmaker_id,
              stake: val,
              odd: parseFloat(entrada.odd) || 0,
              selecao: perna.selecao,
              selecao_livre: entrada.selecao_livre || perna.selecao_livre || "",
              resultado: entrada.resultado || perna.resultado,
              fonte_saldo: entrada.fonte_saldo || "REAL"
            });
          }
        });
      });

      setOriginalStakesByBookmaker(stakeMap);
      setOriginalPernaIds(pernasData.map((p: any) => p.id));
      setOriginalPernasSnapshot(flatSnapshot);
      
      // Mapear para o estado 'odds' do formulário mantendo a estrutura 1:N
      const pernasOdds: OddEntry[] = pernasData.map((perna: any, groupIdx) => {
        const entradas = perna.apostas_perna_entradas || [];
        // Se não houver entradas, criamos uma vazia para manter a linha na UI
        const mainEntry = entradas[0] || {
          bookmaker_id: perna.bookmaker_id || "",
          moeda: perna.moeda || "BRL",
          odd: perna.odd || "",
          stake: perna.stake || "",
          fonte_saldo: perna.fonte_saldo || "REAL"
        };
        const additionalEntries = entradas.slice(1);
        
        return {
          pernaId: perna.id,
          mainEntryId: mainEntry.id,
          bookmaker_id: mainEntry.bookmaker_id,
          moeda: (mainEntry.moeda || "BRL") as SupportedCurrency,
          odd: mainEntry.odd?.toString() || "",
          stake: mainEntry.stake?.toString() || "",
          selecao: perna.selecao,
          selecaoLivre: perna.selecao_livre || "",
          isReference: groupIdx === 0,
          isManuallyEdited: true,
          resultado: mainEntry.resultado || perna.resultado,
          fonteSaldo: (mainEntry.fonte_saldo as 'REAL' | 'FREEBET') || 'REAL',
          tipo: ((perna.tipo ?? mainEntry.tipo ?? 'back') as 'back' | 'lay'),
          comissao: Number(perna.comissao ?? mainEntry.comissao ?? 0) || 0,
          additionalEntries: additionalEntries.map((sub: any) => ({
            id: sub.id,
            bookmaker_id: sub.bookmaker_id || "",
            moeda: (sub.moeda || "BRL") as SupportedCurrency,
            odd: sub.odd?.toString() || "",
            stake: sub.stake?.toString() || "",
            selecaoLivre: sub.selecao_livre || "",
            fonteSaldo: (sub.fonte_saldo as 'REAL' | 'FREEBET') || 'REAL',
            pernaId: perna.id, // Referência à perna pai
            tipo: ((sub.tipo ?? perna.tipo ?? 'back') as 'back' | 'lay'),
            comissao: Number(sub.comissao ?? perna.comissao ?? 0) || 0,
          })),
        };
      });
      
      setOdds(pernasOdds);
      setDirectedProfitLegs(Array.from({ length: pernasOdds.length }, (_, i) => i));
      
      console.log("[SurebetModalRoot] ✅ Pernas carregadas (1:N):", {
        total_pernas: pernasData.length,
        com_sub_entradas: pernasOdds.filter(o => (o.additionalEntries?.length || 0) > 0).length,
      });
    } catch (err) {
      console.error("[SurebetModalRoot] Exceção ao buscar pernas:", err);
      
      if (retryCount < 2) {
        await new Promise(resolve => setTimeout(resolve, 500));
        return fetchLinkedPernas(surebetId, retryCount + 1);
      }
      
      toast.error("Erro inesperado ao carregar entradas. Recarregue a página.");
    } finally {
      setPernasLoading(false);
    }
  };

  // ============================================
  // HANDLERS DE PASTE/OCR
  // ============================================

  useEffect(() => {
    if (isEditing || !open) return;
    
    const handlePaste = async (e: ClipboardEvent) => {
      if (focusedLeg === null) return;
      
      const items = e.clipboardData?.items;
      if (!items) return;
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            await processLegImage(focusedLeg, file, mercado);
            break;
          }
        }
      }
    };
    
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [open, isEditing, focusedLeg, processLegImage]);

  useEffect(() => {
    if (!legPrints || legPrints.length === 0) return;
    
    legPrints.forEach((legPrint, legIndex) => {
      if (!legPrint.parsedData || legPrint.isProcessing) return;
      
      const legData = applyLegData(legIndex);
      if (!legData) return;
      
      setOdds(prev => {
        const newOdds = [...prev];
        if (newOdds[legIndex]) {
          if (legData.odd) newOdds[legIndex] = { ...newOdds[legIndex], odd: legData.odd, isManuallyEdited: false };
          if (legData.stake) newOdds[legIndex] = { ...newOdds[legIndex], stake: legData.stake, isManuallyEdited: false, stakeOrigem: "print" as const, isReference: legIndex === 0 };
          if (legData.selecaoLivre) newOdds[legIndex] = { ...newOdds[legIndex], selecaoLivre: legData.selecaoLivre };
        }
        return newOdds;
      });
      
      clearLegPrint(legIndex);
    });
    
    if (sharedContext.evento && !evento) setEvento(sharedContext.evento);
    if (sharedContext.esporte) setEsporte(sharedContext.esporte);
    if (sharedContext.mercado && !mercado) setMercado(sharedContext.mercado);
  }, [legPrints]);

  // Se o usuário editar o campo `evento` depois de importar, descartar o
  // snapshot — não persistir logos que não correspondem mais ao texto.
  useEffect(() => {
    if (!importedHomeTeam || !importedAwayTeam) return;
    const expected = `${importedHomeTeam} X ${importedAwayTeam}`.toUpperCase();
    if (evento.trim().toUpperCase() !== expected) {
      setImportedHomeTeam(null);
      setImportedAwayTeam(null);
      setImportedHomeLogo(null);
      setImportedAwayLogo(null);
      setImportedLeagueLogo(null);
      setImportedDailyEventId(null);
    }
  }, [evento, importedHomeTeam, importedAwayTeam]);

  // Encontrar a próxima perna vazia para importação incremental
  const getNextEmptyLegIndex = useCallback((): number | null => {
    for (let i = 0; i < odds.length; i++) {
      const leg = odds[i];
      // Considera vazia se não tem odd E não tem stake (campos obrigatórios)
      const isEmpty = !leg.odd || parseFloat(leg.odd) === 0;
      if (isEmpty) {
        return i;
      }
    }
    return null; // Todas as pernas estão preenchidas
  }, [odds]);

  const handleImportButtonClick = useCallback(() => {
    const nextEmptyLeg = getNextEmptyLegIndex();
    if (nextEmptyLeg === null) {
      toast.info(`Todas as ${numPernas} pernas já estão preenchidas`);
      return;
    }
    setSelectedLegForPrint(nextEmptyLeg);
    setFocusedLeg(nextEmptyLeg);
    fileInputRef.current?.click();
  }, [getNextEmptyLegIndex, numPernas]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || selectedLegForPrint === null) return;
    
    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecione uma imagem');
      return;
    }
    
    await processLegImage(selectedLegForPrint, file, mercado);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [selectedLegForPrint, processLegImage]);

  // ============================================
  // MANIPULAÇÃO DE ODDS
  // ============================================

  const updateOdd = useCallback((index: number, field: keyof OddEntry, value: string | boolean | number) => {
    // ── Camada A: regra de produto — perna LAY não admite multi-casa ──
    // Se o usuário tentar marcar como LAY uma perna que já tem
    // additionalEntries, NÃO aplicamos a mudança aqui. Disparamos o
    // ConfirmLayCollapseDialog (reutilizado do ApostaDialog) para confirmar
    // a remoção explícita das entradas extras. A aplicação real do
    // tipo='lay' acontece em `confirmLayCollapse` abaixo.
    if (field === 'tipo' && value === 'lay') {
      const current = odds[index];
      const extras = current?.additionalEntries || [];
      if (extras.length > 0) {
        const remaining = bookmakerSaldos.find(b => b.id === current.bookmaker_id)?.nome;
        const preview: LayCollapseEntryPreview[] = extras.map((e) => {
          const bk = bookmakerSaldos.find(b => b.id === e.bookmaker_id);
          const stakeNum = parseFloat(e.stake) || 0;
          return {
            id: (e as any).id,
            bookmaker_nome: bk?.nome || 'Casa não selecionada',
            stake_formatado: stakeNum > 0
              ? stakeNum.toLocaleString('pt-BR', { style: 'currency', currency: e.moeda || 'BRL' })
              : undefined,
            odd: e.odd || null,
          };
        });
        setLayCollapseRequest({ pernaIndex: index, entriesPreview: preview, remainingBookmakerNome: remaining });
        return; // não aplica tipo='lay' agora — espera confirmação
      }
    }

    setOdds(prev => {
      const newOdds = [...prev];
      newOdds[index] = { ...newOdds[index], [field]: value };
      
      if (field === "bookmaker_id" && typeof value === "string") {
        const selectedBk = bookmakerSaldos.find(b => b.id === value);
        newOdds[index].moeda = (selectedBk?.moeda as SupportedCurrency) || "BRL";
      }
      
      if (field === "isReference" && value === true) {
        newOdds.forEach((o, i) => {
          if (i !== index) {
            o.isReference = false;
            if (o.stakeOrigem !== "print") {
              o.isManuallyEdited = false;
              o.stakeOrigem = undefined;
            }
          }
        });
      }
      
      if (field === "stake" && !newOdds[index].isReference) {
        newOdds[index].isManuallyEdited = true;
        newOdds[index].stakeOrigem = "manual";
      }

      // Ao alternar tipo back/lay, forçar recálculo da stake automática
      if (field === "tipo") {
        if (!newOdds[index].isReference) {
          newOdds[index].isManuallyEdited = false;
          newOdds[index].stakeOrigem = undefined;
        }
        // Lay não suporta freebet
        if (value === 'lay' && newOdds[index].fonteSaldo === 'FREEBET') {
          newOdds[index].fonteSaldo = 'REAL';
        }
      }
 
      return newOdds;
    });
  }, [bookmakerSaldos, isEditing, odds]);

  const setReferenceIndex = useCallback((index: number) => {
    setOdds(prev => prev.map((o, i) => ({
      ...o,
      isReference: i === index,
      isManuallyEdited: i === index ? o.isManuallyEdited : (o.stakeOrigem === "print"),
      stakeOrigem: i === index ? o.stakeOrigem : (o.stakeOrigem === "print" ? "print" : undefined)
    })));
  }, []);

  const toggleDirectedLeg = useCallback((index: number) => {
    setDirectedProfitLegs(prev => {
      if (prev.includes(index)) {
        if (prev.length <= 1) return prev; // Manter pelo menos 1 marcado
        return prev.filter(i => i !== index);
      }
      return [...prev, index].sort((a, b) => a - b);
    });
  }, []);

   const addAdditionalEntry = useCallback((pernaIndex: number) => {
    // Camada A: bloqueio defensivo. UI já oculta o botão "+" quando a
    // perna é LAY (canAddMore && !isLayLeg), mas mantemos este early-return
    // como segundo guard caso algum atalho/keyboard dispare o handler.
    const currentTipo = (odds[pernaIndex] as any)?.tipo ?? 'back';
    if (currentTipo === 'lay') {
      toast.error('Perna LAY não admite multi-casa', {
        description: 'Mude a perna para BACK antes de adicionar outra casa.',
      });
      return;
    }
    setOdds(prev => {
      const newOdds = [...prev];
      const currentEntries = newOdds[pernaIndex].additionalEntries || [];
      if (currentEntries.length >= 4) return prev;

      // Calcular stake restante via PAYOUT: targetPayout - payoutExistente = payoutRestante
      const targetPayout = targetPayoutsLocal?.[pernaIndex] || 0;
      const mainStake = parseFloat(newOdds[pernaIndex].stake) || 0;
      const mainOdd = parseFloat(newOdds[pernaIndex].odd) || 0;
      const mainPayout = mainStake * (mainOdd > 1 ? mainOdd : 0);
      const existingSubPayout = currentEntries.reduce((sum, e) => {
        const s = parseFloat(e.stake) || 0;
        const o = parseFloat(e.odd) || 0;
        return sum + s * (o > 1 ? o : 0);
      }, 0);
      const remainingPayout = Math.max(0, targetPayout - mainPayout - existingSubPayout);

      // Sem odd conhecida, usar odd da perna principal como estimativa
      const estimatedOdd = mainOdd > 1 ? mainOdd : 2;
      const prefilledStake = remainingPayout > 0 ? arredondarStake(remainingPayout / estimatedOdd).toFixed(2) : "";

      newOdds[pernaIndex] = {
        ...newOdds[pernaIndex],
        additionalEntries: [
          ...currentEntries,
          { 
            bookmaker_id: "", 
            moeda: "BRL" as SupportedCurrency, 
            odd: "", 
            stake: prefilledStake, 
            selecaoLivre: newOdds[pernaIndex].selecaoLivre // Herdar a "linha" da perna principal
          }
        ]
      };

      return newOdds;
    });
  }, [targetPayoutsLocal, arredondarStake, odds]);

  // ── Confirmação do colapso LAY (Camada A) ──────────────────────────────
  const cancelLayCollapse = useCallback(() => setLayCollapseRequest(null), []);
  const confirmLayCollapse = useCallback(() => {
    setLayCollapseRequest(req => {
      if (!req) return null;
      setOdds(prev => {
        const next = [...prev];
        const target = { ...next[req.pernaIndex] } as OddEntry;
        target.additionalEntries = [];
        (target as any).tipo = 'lay';
        if (!target.isReference) {
          target.isManuallyEdited = false;
          target.stakeOrigem = undefined;
        }
        if ((target as any).fonteSaldo === 'FREEBET') {
          (target as any).fonteSaldo = 'REAL';
        }
        next[req.pernaIndex] = target;
        return next;
      });
      return null;
    });
  }, []);

  const updateAdditionalEntry = useCallback((pernaIndex: number, entryIndex: number, field: string, value: string) => {
    setOdds(prev => {
      const newOdds = [...prev];
      const entries = [...(newOdds[pernaIndex].additionalEntries || [])];
      entries[entryIndex] = { ...entries[entryIndex], [field]: value };
      if (field === 'bookmaker_id') {
        const bk = bookmakerSaldos.find(b => b.id === value);
        if (bk) entries[entryIndex].moeda = bk.moeda as SupportedCurrency;
      }

      // Auto-calcular stake via PAYOUT quando odd muda (recalcula sempre que a odd é alterada)
      if (field === 'odd') {
        const oddVal = parseFloat(value);
        if (oddVal > 1) {
          const targetPayout = targetPayoutsLocal?.[pernaIndex] || 0;
          const mainStake = parseFloat(newOdds[pernaIndex].stake) || 0;
          const mainOdd = parseFloat(newOdds[pernaIndex].odd) || 0;
          const currentPayout = mainStake * (mainOdd > 1 ? mainOdd : 0);
          const otherSubPayout = entries.reduce((sum, e, idx) => {
            if (idx === entryIndex) return sum;
            const s = parseFloat(e.stake) || 0;
            const o = parseFloat(e.odd) || 0;
            return sum + s * (o > 1 ? o : 0);
          }, 0);
          const remainingPayout = Math.max(0, targetPayout - currentPayout - otherSubPayout);
          if (remainingPayout > 0) {
            entries[entryIndex] = { ...entries[entryIndex], stake: arredondarStake(remainingPayout / oddVal).toFixed(2) };
          }
        }
      }
      // Stake editada manualmente: NÃO recalcular (respeitar valor do usuário)

      newOdds[pernaIndex] = { ...newOdds[pernaIndex], additionalEntries: entries };
 

      return newOdds;
    });
  }, [bookmakerSaldos, isEditing, targetPayoutsLocal, arredondarStake]);

  const removeAdditionalEntry = useCallback((pernaIndex: number, entryIndex: number) => {
    setOdds(prev => {
      const newOdds = [...prev];
      const entries = [...(newOdds[pernaIndex].additionalEntries || [])];
      entries.splice(entryIndex, 1);
      newOdds[pernaIndex] = { ...newOdds[pernaIndex], additionalEntries: entries };
      return newOdds;
    });
  }, []);

  // ── Auto-fill reativo: quando main stake muda e sub-entradas têm stake vazia ──
  useEffect(() => {
    if (!targetPayoutsLocal || targetPayoutsLocal.length === 0) return;

    let needsUpdate = false;
    const newOdds = odds.map((o, i) => {
      const entries = o.additionalEntries;
      if (!entries || entries.length === 0) return o;

      // Verificar se alguma sub-entrada tem odd preenchida mas stake vazia
      const hasEmptyStakeSub = entries.some(e => {
        const oddVal = parseFloat(e.odd) || 0;
        const stakeVal = parseFloat(e.stake) || 0;
        return oddVal > 1 && stakeVal === 0;
      });
      if (!hasEmptyStakeSub) return o;

      const targetPayout = targetPayoutsLocal[i] || 0;
      if (targetPayout <= 0) return o;

      // Calcular payout já coberto
      const mainStake = parseFloat(o.stake) || 0;
      const mainOdd = parseFloat(o.odd) || 0;
      let usedPayout = mainStake * (mainOdd > 1 ? mainOdd : 0);

      const updatedEntries = entries.map(e => {
        const oddVal = parseFloat(e.odd) || 0;
        const stakeVal = parseFloat(e.stake) || 0;
        if (stakeVal > 0 || oddVal <= 1) {
          usedPayout += stakeVal * (oddVal > 1 ? oddVal : 0);
          return e;
        }
        // Calcular payout restante e derivar stake
        const remainingPayout = Math.max(0, targetPayout - usedPayout);
        if (remainingPayout > 0 && oddVal > 1) {
          needsUpdate = true;
          const filled = arredondarStake(remainingPayout / oddVal);
          usedPayout += filled * oddVal;
          return { ...e, stake: filled.toFixed(2) };
        }
        return e;
      });

      return { ...o, additionalEntries: updatedEntries };
    });

    if (needsUpdate) {
      setOdds(newOdds);
    }
  }, [
    odds.map(o => `${o.stake}-${o.odd}-${(o.additionalEntries || []).map(e => `${e.odd}:${e.stake}`).join('|')}`).join(','),
    targetPayoutsLocal?.join(','),
  ]);

  const handlePernaResultadoChange = useCallback((index: number, resultado: 'GREEN' | 'RED' | 'VOID' | null) => {
    setOdds(prev => {
      const newOdds = [...prev];
      (newOdds[index] as any).resultado = resultado;
      return newOdds;
    });
  }, []);

  const handleFieldKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>, fieldType: 'odd' | 'stake') => {
    const key = e.key.toLowerCase();
    
    // Atalhos Q (navega odds) e S (navega stakes)
    if (key === 'q' || key === 's') {
      e.preventDefault();
      const container = tableContainerRef.current;
      if (!container) return;

      const targetFieldType: 'odd' | 'stake' = key === 'q' ? 'odd' : 'stake';
      const selector = `input[data-field-type="${targetFieldType}"]`;
      const allFields = Array.from(container.querySelectorAll<HTMLInputElement>(selector));
      
      if (allFields.length === 0) return;
      
      const sameTypeNavigation = targetFieldType === fieldType;
      const currentIndex = allFields.indexOf(e.currentTarget);
      const nextIndex = sameTypeNavigation && currentIndex >= 0
        ? (currentIndex + 1) % allFields.length
        : 0;

      allFields[nextIndex]?.focus();
      allFields[nextIndex]?.select();
      return;
    }
    
    // Enter também navega para próximo campo do mesmo tipo
    if (e.key === 'Enter') {
      e.preventDefault();
      const container = tableContainerRef.current;
      if (!container) return;
      
      const selector = `input[data-field-type="${fieldType}"]`;
      const allFields = Array.from(container.querySelectorAll<HTMLInputElement>(selector));
      
      if (allFields.length === 0) return;
      
      const currentIndex = allFields.indexOf(e.currentTarget);
      const nextIndex = (currentIndex + 1) % allFields.length;
      allFields[nextIndex]?.focus();
      allFields[nextIndex]?.select();
    }
  }, []);

  // ============================================
  // AUTO-CÁLCULO DE STAKES
  // ============================================

  /**
   * AUTO-CÁLCULO DE STAKES — Motor Multi-Moeda
   *
   * FLUXO CORRETO (usando surebetCurrencyEngine):
   *   1. retorno-alvo = refStake × refOdd          (moeda da referência)
   *   2. retornoAlvoConv = retornoAlvo → consolidation (pivot BRL)
   *   3. Para cada perna não-referência:
   *        retornoNaPerna = retornoAlvoConv → moeda da perna (pivot BRL)
   *        stakeCalculada = retornoNaPerna / odd
   *
   * Resultado: stakes balanceadas mesmo com moedas diferentes por perna.
   */
  useEffect(() => {
    // Pular se há direcionamento ativo (checkbox D customizado)
    const hasCustomDirection = directedProfitLegs.length > 0 && directedProfitLegs.length < odds.length;
    if (hasCustomDirection) return;
    
    const refIndex = odds.findIndex(o => o.isReference);
    if (refIndex === -1) return;
    
    const refEntry = odds[refIndex];
    const refStake = getStakeTotalPerna(refEntry);
    const refOdd = getOddMediaPerna(refEntry);
    
    if (refStake <= 0 || refOdd <= 1) return;
    
    const validOddsCount = odds.filter(o => getOddMediaPerna(o) > 1).length;
    if (validOddsCount < odds.length) return;
    
    // ── Caminho LAY: delegar para o engine (closed-form back+lay) ──
    // O cálculo inline abaixo assume todas as pernas back (stake = targetReturn / odd),
    // o que sobrescreve incorretamente a stake de pernas lay com o valor back.
    const hasLay = odds.some(o => (o.tipo ?? 'back') === 'lay');
    if (hasLay) {
      if (!calculatedStakes || calculatedStakes.length !== odds.length) return;
      let needsUpdateLay = false;
      const newOddsLay = odds.map((o, i) => {
        if (i === refIndex) return o;
        if (o.isManuallyEdited || o.stakeOrigem === "print" || o.stakeOrigem === "manual") return o;
        const target = calculatedStakes[i];
        if (!Number.isFinite(target) || target <= 0) return o;
        const cur = parseFloat(o.stake) || 0;
        if (Math.abs(target - cur) > 0.01) {
          needsUpdateLay = true;
          return { ...o, stake: target.toFixed(2), stakeOrigem: "referencia" as const };
        }
        return o;
      });
      if (needsUpdateLay) {
        setEqualizedStakesSnapshot(newOddsLay.map(o => getStakeTotalPerna(o)));
        setOdds(newOddsLay);
      }
      return;
    }

    const { brlRates, consolidationCurrency } = engineConfig;
    const refMoeda = (bookmakerSaldos.find(b => b.id === refEntry.bookmaker_id)?.moeda || refEntry.moeda || "BRL") as SupportedCurrency;
    
    // Passo 1: retorno-alvo na moeda da referência
    const targetReturnRef = refStake * refOdd;
    
    // Passo 2: converter retorno-alvo para moeda de consolidação
    const targetReturnConsolidated = convertViaBRL(targetReturnRef, refMoeda, consolidationCurrency, brlRates);
    
    let needsUpdate = false;
    const newOdds = odds.map((o, i) => {
      if (i === refIndex) return o;
      if (o.isManuallyEdited || o.stakeOrigem === "print" || o.stakeOrigem === "manual") return o;
      
      const oddMedia = getOddMediaPerna(o);
      if (oddMedia <= 1) return o;
      
      const legMoeda = (bookmakerSaldos.find(b => b.id === o.bookmaker_id)?.moeda || o.moeda || "BRL") as SupportedCurrency;
      
      // Passo 3: converter retorno-alvo da consolidação para moeda da perna
      const targetReturnInLegCurrency = convertViaBRL(targetReturnConsolidated, consolidationCurrency, legMoeda, brlRates);
      
      // Passo 4: calcular stake da entrada PRINCIPAL considerando sub-entradas
      const mainOdd = parseFloat(o.odd) || 0;
      const additionalEntries = o.additionalEntries || [];
      
      let calculatedStake: number;
      if (additionalEntries.length > 0 && mainOdd > 1) {
        // Fix: subtrair PAYOUT das sub-entradas (não stake) do retorno-alvo
        // mainStake = (targetReturn - subPayout) / mainOdd
        const subPayoutInLegCurrency = additionalEntries.reduce((sum, ae) => {
          const s = parseFloat(ae.stake) || 0;
          const aeOdd = parseFloat(ae.odd) || 0;
          if (s <= 0 || aeOdd <= 0) return sum;
          const aeMoeda = (ae.moeda as string) || legMoeda;
          // Corrigindo: primeiro calcula o payout na moeda da sub-entrada, DEPOIS converte para a moeda da perna
          const payoutInAeMoeda = s * aeOdd;
          return sum + convertViaBRL(payoutInAeMoeda, aeMoeda, legMoeda, brlRates);
        }, 0);
        
        calculatedStake = arredondarStake(Math.max(0, (targetReturnInLegCurrency - subPayoutInLegCurrency) / mainOdd));
      } else {
        calculatedStake = arredondarStake(targetReturnInLegCurrency / oddMedia);
      }

      const currentStake = parseFloat(o.stake) || 0;
      
      if (Math.abs(calculatedStake - currentStake) > 0.01) {
        needsUpdate = true;
        return { ...o, stake: calculatedStake.toFixed(2), stakeOrigem: "referencia" as const };
      }
      return o;
    });
    
    if (needsUpdate) {
      // Salvar snapshot das stakes equalizadas (TOTAL da perna, incluindo sub-entradas)
      const snapshot = newOdds.map(o => getStakeTotalPerna(o));
      setEqualizedStakesSnapshot(snapshot);
      setOdds(newOdds);
    } else {
      // Mesmo sem mudanças, garantir que snapshot existe quando todas as pernas estão calculadas
      const allValid = odds.every(o => getOddMediaPerna(o) > 1 && (parseFloat(o.stake) || 0) > 0);
      if (allValid && equalizedStakesSnapshot.length !== odds.length) {
        setEqualizedStakesSnapshot(odds.map(o => getStakeTotalPerna(o)));
      }
    }
  }, [
    odds.map(o => `${o.odd}-${o.stake}-${o.isManuallyEdited}-${o.bookmaker_id}-${(o.additionalEntries || []).map(e => `${e.odd}:${e.stake}:${e.moeda}`).join('|')}`).join(','),
    odds.map(o => o.isReference).join(','),
    odds.map(o => `${o.tipo ?? 'back'}:${o.comissao ?? 0}`).join(','),
    calculatedStakes?.join(','),
    arredondarAtivado,
    arredondarValor,
    isEditing,
    directedProfitLegs,
    engineConfig,
    bookmakerSaldos,
  ]);

  // ============================================
  // APLICAR STAKES DIRECIONADAS (CHECKBOX D)
  // ============================================
  // 
  // REGRA DE NEGÓCIO (v2 — sem loop de feedback):
  // - directedStakes é calculado a partir do snapshot IMUTÁVEL
  // - Pernas DESMARCADAS: restauradas para valor do snapshot
  // - Perna MARCADA: recebe stake calculada
  // - Dependências NÃO incluem odds.stake (quebra o loop)
  // ============================================

  useEffect(() => {
    // Só aplicar se há direcionamento parcial ativo
    const hasCustomDirection = directedProfitLegs.length > 0 && directedProfitLegs.length < odds.length;
    if (!hasCustomDirection) return;
    
    // Verificar se temos stakes calculadas
    if (!directedStakes || directedStakes.length !== odds.length) return;
    
    // Aplicar todas as stakes do resultado (marcadas E desmarcadas vêm do snapshot)
    let needsUpdate = false;
    const newOdds = odds.map((o, i) => {
      let targetStake = directedStakes[i];
      
      // Fix: ajustar para sub-entradas (directedStakes são TOTAIS por perna)
      const additionalEntries = o.additionalEntries || [];
      if (additionalEntries.length > 0) {
        const oddMedia = getOddMediaPerna(o);
        const mainOdd = parseFloat(o.odd) || 0;
        if (mainOdd > 1 && oddMedia > 0) {
          const targetReturn = targetStake * oddMedia;
          const subPayout = additionalEntries.reduce((sum, ae) =>
            sum + (parseFloat(ae.stake) || 0) * (parseFloat(ae.odd) || 0), 0);
          if (subPayout > 0) {
            targetStake = arredondarStake(Math.max(0, (targetReturn - subPayout) / mainOdd));
          }
        }
      }
      
      const currentStake = parseFloat(o.stake) || 0;
      
      if (Math.abs(targetStake - currentStake) > 0.01) {
        needsUpdate = true;
        return { 
          ...o, 
          stake: targetStake.toFixed(2), 
          stakeOrigem: "referencia" as const,
          isManuallyEdited: false
        };
      }
      return o;
    });
    
    if (needsUpdate) {
      setOdds(newOdds);
    }
  }, [
    directedProfitLegs.join(','),
    directedStakes?.join(','),
    odds.map(o => o.odd).join(','),
    arredondarAtivado,
    arredondarValor
  ]);

  // ============================================
  // SAVE E DELETE
  // ============================================

  /**
   * handleSave - Criação/Edição de Surebet usando RPC atômica
   * 
   * ARQUITETURA v7:
   * - Para CRIAÇÃO: usa RPC `criar_surebet_atomica` que:
   *   1. Valida saldos de TODAS as pernas antes de inserir
   *   2. Insere apostas_unificada + apostas_pernas em transação única
   *   3. Gera eventos STAKE em financial_events para cada perna
   *   4. Debita saldos das bookmakers atomicamente
   * 
   * - Para EDIÇÃO: mantém fluxo de update direto (sem impacto financeiro novo)
   */
  const handleSave = async () => {
    // GUARD: Impede múltiplos saves simultâneos (double-click, Enter key, etc.)
    if (saving) return;
    if (!contexto) { toast.error("Selecione um contexto"); return; }
    if (!evento.trim()) { toast.error("Informe o evento"); return; }
    if (odds.length < numPernas || analysis.pernasCompletasCount < numPernas) {
      toast.error(`Preencha todas as ${numPernas} pernas (${analysis.pernasCompletasCount} preenchidas)`);
      return;
    }

    // HARD GUARD: nenhuma perna ativa pode ficar sem casa selecionada
    // (entry com odd>0 ou stake>0 obriga bookmaker_id). Bloqueia ANTES da RPC
    // para impedir registros fantasma de apostas_unificada sem pernas válidas.
    const missingCasaLeg: { idx: number; sub?: number } | null = (() => {
      for (let i = 0; i < odds.length; i++) {
        const o = odds[i];
        const hasOdd = parseFloat(o.odd) > 0;
        const hasStake = parseFloat(o.stake) > 0;
        if ((hasOdd || hasStake) && !o.bookmaker_id) return { idx: i };
        const subs = o.additionalEntries || [];
        for (let j = 0; j < subs.length; j++) {
          const s = subs[j];
          const sHasOdd = parseFloat(s.odd) > 0;
          const sHasStake = parseFloat(s.stake) > 0;
          if ((sHasOdd || sHasStake) && !s.bookmaker_id) return { idx: i, sub: j };
        }
      }
      return null;
    })();
    if (missingCasaLeg) {
      const where = missingCasaLeg.sub != null
        ? `Perna ${missingCasaLeg.idx + 1} (casa adicional ${missingCasaLeg.sub + 1})`
        : `Perna ${missingCasaLeg.idx + 1}`;
      console.warn('[SurebetModalRoot] BLOCKED save — casa não selecionada', missingCasaLeg, odds);
      toast.error('Casa obrigatória', {
        description: `${where}: selecione a casa antes de salvar.`,
      });
      return;
    }

    // Validação de Integridade (Hydration Check)
    const validation = validateSurebetCard({
      evento,
      stake_total: analysis.stakeTotal,
      valor_brl_referencia: analysis.stakeTotal, // analysis.stakeTotal já é a stake consolidada na moeda base
      pernas: odds.map(o => ({
        odd: o.odd,
        stake: o.stake,
        moeda: o.moeda,
        selecao: o.selecao,
        selecao_livre: o.selecaoLivre
      }))
    });

    if (!validation.valido) {
      toast.error("Dados incompletos", {
        description: `Corrija: ${validation.erros[0].replace(/_/g, ' ')}`
      });
      return;
    }
    
    // TRAVA DEFINITIVA: Validar data antes de salvar
    const dataValidation = validarDataAposta(dataAposta);
    if (!dataValidation.valid) {
      toast.error(dataValidation.error || "Data inválida");
      return;
    }

    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const estrategiaSelecionada = (estrategia || ARBITRAGEM_ESTRATEGIA) as ApostaEstrategia;

      const getBookmakerMoeda = (bookmakerId: string): SupportedCurrency => {
        const bk = bookmakerSaldos.find(b => b.id === bookmakerId);
        return (bk?.moeda as SupportedCurrency) || "BRL";
      };

      const pernasPreenchidas = odds.filter(entry => {
        return entry.bookmaker_id && parseFloat(entry.odd) > 1 && parseFloat(entry.stake) > 0;
      });

      // HARD GUARD pós-filtro: se o número de pernas válidas for menor que o
      // declarado pelo modelo, NÃO chama a RPC. Evita criar `apostas_unificada`
      // com `forma_registro=ARBITRAGEM` e zero pernas em `apostas_pernas`.
      if (pernasPreenchidas.length < numPernas) {
        console.error('[SurebetModalRoot] ABORT save — pernas válidas insuficientes', {
          esperado: numPernas,
          recebido: pernasPreenchidas.length,
          odds: odds.map(o => ({ bk: o.bookmaker_id, odd: o.odd, stake: o.stake })),
        });
        toast.error('Operação inválida', {
          description: `Apenas ${pernasPreenchidas.length}/${numPernas} pernas têm casa + odd + stake válidos.`,
        });
        setSaving(false);
        return;
      }

      // ================================================================
      // Camada B: INVARIANT_007 — perna LAY não pode ter sub-entradas
      // ================================================================
      // Espelha `validateInvariants` (usado pelo ApostaService). Aqui o
      // caminho de surebet vai direto pela RPC criar_/editar_surebet_*,
      // sem passar por validateInvariants. Mantemos esta guard ANTES da
      // RPC para: (1) mensagem de UX consistente com o ApostaDialog;
      // (2) defense-in-depth: se o trigger DB
      // `enforce_lay_leg_single_entry` for um dia desabilitado por engano,
      // este guard ainda bloqueia.
      const layViolation = pernasPreenchidas.find((p) => {
        const tipo = (p as any).tipo ?? 'back';
        const subs = (p.additionalEntries || []).filter(
          s => s.bookmaker_id && parseFloat(s.odd) > 1 && parseFloat(s.stake) > 0
        );
        // total = principal (1) + extras válidas
        return tipo === 'lay' && subs.length > 0;
      });
      if (layViolation) {
        const bkNome = bookmakerSaldos.find(b => b.id === layViolation.bookmaker_id)?.nome || 'casa';
        console.error('[SurebetModalRoot] ABORT save — LAY_LEG_MULTI_ENTRY_NOT_SUPPORTED', {
          bookmaker: bkNome,
          extras: (layViolation.additionalEntries || []).length,
        });
        toast.error('Perna LAY não admite multi-casa', {
          description: `A perna LAY (${bkNome}) tem casas adicionais. Remova-as ou mude a perna para BACK antes de registrar.`,
        });
        setSaving(false);
        return;
      }

      // ================================================================
      // FLATTEN: Expandir additionalEntries em pernas individuais
      // Cada sub-entrada herda selecao da perna pai mas tem seu próprio
      // bookmaker_id, odd, stake e moeda
      // ================================================================
      interface FlatPerna {
        /** UUID da perna no banco. Undefined para pernas novas. */
        pernaId?: string;
        bookmaker_id: string;
        odd: string;
        stake: string;
        selecao: string;
        selecaoLivre: string;
        moeda: SupportedCurrency;
        resultado?: string | null;
        fonteSaldo?: 'REAL' | 'FREEBET';
        /** Index da perna pai no array odds (para agrupar resultado) */
        parentLegIndex: number;
      }

      const pernasRPC: any[] = [];
      const entradasRPC: any[] = [];

      pernasPreenchidas.forEach((perna, idx) => {
        const ordem = idx + 1;
        const pernaTipo = (perna.tipo ?? 'back') as 'back' | 'lay';
        const pernaComissao = Number(perna.comissao ?? 0) || 0;
        // Estrutura p_pernas
        pernasRPC.push({
          id: perna.pernaId || null,
          ordem,
          casa_id: perna.bookmaker_id, // Casa principal para compatibilidade legado
          selecao: perna.selecao,
          selecao_livre: perna.selecaoLivre || null,
          tipo: pernaTipo,
          comissao: pernaComissao
        });

        // Estrutura p_entradas para a entrada principal
        const stakeMain = parseFloat(perna.stake) || 0;
        const moedaMain = getBookmakerMoeda(perna.bookmaker_id);
        const snapshotMain = getSnapshotFields(stakeMain, moedaMain, getEffectiveRate(moedaMain));

        entradasRPC.push({
          id: perna.mainEntryId || null,
          perna_ordem: ordem,
          bookmaker_id: perna.bookmaker_id,
          stake: stakeMain,
          odd: parseFloat(perna.odd) || 0,
          moeda: moedaMain,
          fonte_saldo: perna.fonteSaldo || 'REAL',
          cotacao_snapshot: snapshotMain.cotacao_snapshot,
          stake_brl_referencia: snapshotMain.valor_brl_referencia,
          tipo: pernaTipo,
          comissao: pernaComissao
        });

        // Entradas adicionais
        (perna.additionalEntries || []).forEach(sub => {
          if (sub.bookmaker_id && parseFloat(sub.odd) > 1 && parseFloat(sub.stake) > 0) {
            const stakeSub = parseFloat(sub.stake) || 0;
            const moedaSub = getBookmakerMoeda(sub.bookmaker_id);
            const snapshotSub = getSnapshotFields(stakeSub, moedaSub, getEffectiveRate(moedaSub));

            entradasRPC.push({
              id: sub.id || null,
              perna_ordem: ordem,
              bookmaker_id: sub.bookmaker_id,
              stake: stakeSub,
              odd: parseFloat(sub.odd) || 0,
              moeda: moedaSub,
              fonte_saldo: sub.fonteSaldo || 'REAL',
              cotacao_snapshot: snapshotSub.cotacao_snapshot,
              stake_brl_referencia: snapshotSub.valor_brl_referencia,
              tipo: pernaTipo,
              comissao: pernaComissao
            });
          }
        });
      });

      const modelo = numPernas === 2 ? "1-2" : numPernas === 3 ? "1-X-2" : `${numPernas}-way`;

      if (isEditing && surebet) {
        const payloadEdit = {
          p_aposta_id: surebet.id,
          p_pernas: pernasRPC,
          p_entradas: entradasRPC,
          p_evento: evento,
          p_esporte: esporte,
          p_mercado: mercado || null,
          p_modelo: modelo,
          p_estrategia: estrategiaSelecionada,
          p_contexto: contexto,
          p_data_aposta: toLocalTimestamp(dataAposta),
          p_status_manual: null
        };


        await logDebug({
          modulo: 'Surebet',
          evento: 'UPDATE_START',
          payload: { ...payloadEdit, oddsState: odds.map(o => ({ odd: o.odd, stake: o.stake, bk: o.bookmaker_id, pernaId: o.pernaId })), entradasEnviadas: entradasRPC }
        });

        const handleActualSave = async () => {
          const { data: rpcResult, error: rpcError } = await supabase.rpc('editar_surebet_completa_v3' as any, payloadEdit);

          if (rpcError) {
            await logDebug({
              modulo: 'Surebet',
              evento: 'UPDATE_ERROR',
              payload: payloadEdit,
              erro: rpcError
            });
            console.error('[SurebetModalRoot] ❌ Erro na RPC v3:', rpcError);
            throw new Error(`Erro ao salvar: ${rpcError.message}`);
          }

          await logDebug({
            modulo: 'Surebet',
            evento: 'UPDATE_SUCCESS',
            payload: { aposta_id: surebet.id },
            resposta: rpcResult
          });
          console.log('[SurebetModalRoot] ✅ Edição 1:N concluída', rpcResult);

          // Snapshot opcional de logos de time/liga (passthrough cosmético).
          if (importedHomeTeam || importedAwayTeam || importedHomeLogo || importedAwayLogo || importedLeagueLogo) {
            await supabase
              .from('apostas_unificada')
              .update({
                time_casa: importedHomeTeam,
                time_fora: importedAwayTeam,
                home_team_logo_url: importedHomeLogo,
                away_team_logo_url: importedAwayLogo,
                league_logo_url: importedLeagueLogo,
                daily_event_id: importedDailyEventId,
              } as any)
              .eq('id', surebet.id);
          }
        };

        if (surebet.status === 'LIQUIDADA') {
          // A confirmação agora é tratada pelo modal de confirmação disparado pelo handleSave
          await handleActualSave();
        } else {
          await handleActualSave();
        }
      } else {
        const payloadCreate = {
          p_workspace_id: workspaceId,
          p_user_id: user.id,
          p_projeto_id: projetoId,
          p_evento: evento,
          p_esporte: esporte,
          p_mercado: mercado || null,
          p_modelo: modelo,
          p_estrategia: estrategiaSelecionada,
          p_contexto_operacional: contexto,
          p_data_aposta: toLocalTimestamp(dataAposta),
          p_pernas: pernasRPC,
          p_entradas: entradasRPC
        };

        await logDebug({
          modulo: 'Surebet',
          evento: 'CREATE_START',
          payload: payloadCreate
        });

        const { data: rpcResult, error: rpcError } = await supabase.rpc('criar_surebet_atomica_v3' as any, payloadCreate);

        if (rpcError) {
          await logDebug({
            modulo: 'Surebet',
            evento: 'CREATE_ERROR',
            payload: payloadCreate,
            erro: rpcError
          });
          console.error("[SurebetModalRoot] Erro RPC criar_surebet_atomica_v3:", rpcError);
          throw new Error(rpcError.message);
        }
        
        const result = rpcResult?.[0];
        if (!result?.success) {
          await logDebug({
            modulo: 'Surebet',
            evento: 'CREATE_FAIL_RESULT',
            payload: payloadCreate,
            resposta: result
          });
          throw new Error(result?.message || 'Falha ao criar surebet');
        }
        
        await logDebug({
          modulo: 'Surebet',
          evento: 'CREATE_SUCCESS',
          payload: { aposta_id: result.o_aposta_id },
          resposta: result
        });
        console.log("[SurebetModalRoot] ✅ Surebet criada via RPC v3:", {
          aposta_id: result.o_aposta_id,
        });

        // Snapshot opcional de logos de time/liga (passthrough cosmético).
        if (result.o_aposta_id && (importedHomeTeam || importedAwayTeam || importedHomeLogo || importedAwayLogo || importedLeagueLogo)) {
          await supabase
            .from('apostas_unificada')
            .update({
              time_casa: importedHomeTeam,
              time_fora: importedAwayTeam,
              home_team_logo_url: importedHomeLogo,
              away_team_logo_url: importedAwayLogo,
              league_logo_url: importedLeagueLogo,
              daily_event_id: importedDailyEventId,
            } as any)
            .eq('id', result.o_aposta_id);
        }
      }

      // Invalidar TODOS os caches (saldos + KPIs + calendário + dashboard)
      invalidateSaldos(projetoId);
      invalidateCanonicalCaches(queryClient, projetoId);
      
      // Limpar refs de estado local — backend é a fonte da verdade
      setOriginalPernasSnapshot([]);
      setOriginalPernaIds([]);
      setOriginalStakesByBookmaker(new Map());
      
      onSuccess('save');
      if (!embedded) onOpenChange(false);
    } catch (error: any) {
      await logDebug({
        modulo: 'Surebet',
        evento: 'SAVE_CATCH_ERROR',
        payload: { isEditing, surebetId: surebet?.id, oddsState: odds.map(o => ({ odd: o.odd, stake: o.stake })) },
        erro: error
      });
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWrapper = useCallback(() => {
    if (isEditing && isLiquidada) {
      setShowLiquidadaConfirmation(true);
    } else {
      handleSave();
    }
  }, [isEditing, isLiquidada, handleSave]);

  const handleConvertToSimpleBets = async () => {
    if (pernasValidas.length < 2) {
      toast.error("Mínimo de 2 pernas válidas para conversão");
      return;
    }

    try {
      setConversionInProgress(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const getBookmakerMoeda = (bookmakerId: string): SupportedCurrency => {
        const bk = bookmakerSaldos.find(b => b.id === bookmakerId);
        return (bk?.moeda as SupportedCurrency) || "BRL";
      };

      const operationGroupId = crypto.randomUUID();
      
      const apostasSimples = pernasValidas.map((entry) => {
        const stake = parseFloat(entry.stake) || 0;
        const moeda = getBookmakerMoeda(entry.bookmaker_id);
        const snapshotFields = getSnapshotFields(stake, moeda, getEffectiveRate(moeda));
        
        return {
          user_id: user.id,
          workspace_id: workspaceId,
          projeto_id: projetoId,
          bookmaker_id: entry.bookmaker_id,
          forma_registro: 'SIMPLES',
          estrategia: (estrategia || ARBITRAGEM_ESTRATEGIA) as ApostaEstrategia,
          contexto_operacional: contexto,
          evento,
          esporte,
          mercado,
          selecao: entry.selecao,
          selecao_livre: entry.selecaoLivre || null,
          moeda_operacao: moeda,
          stake,
          odd: parseFloat(entry.odd),
          valor_brl_referencia: snapshotFields.valor_brl_referencia,
          cotacao_snapshot: snapshotFields.cotacao_snapshot,
          cotacao_snapshot_at: snapshotFields.cotacao_snapshot_at,
          status: "PENDENTE",
          resultado: "PENDENTE",
          data_aposta: toLocalTimestamp(dataAposta),
          observacoes: `Convertida de operação parcial (grupo: ${operationGroupId.slice(0, 8)})`
        };
      });

      const { error: insertError } = await supabase
        .from("apostas_unificada")
        .insert(apostasSimples);

      if (insertError) throw insertError;

      // CRÍTICO: Invalidar cache de saldos após inserção direta
      invalidateSaldos(projetoId);

      toast.success(`${apostasSimples.length} apostas simples registradas!`);
      setShowConversionDialog(false);
      onSuccess();
      if (!embedded) onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao converter: " + error.message);
    } finally {
      setConversionInProgress(false);
    }
  };

  const handleDelete = async () => {
    if (!surebet) return;
    
    try {
      const result = await deletarAposta(surebet.id);
      if (!result.success) throw new Error(result.error?.message || 'Falha ao excluir');
      
      // CRÍTICO: Invalidar saldos imediatamente após exclusão
      // Garante que o "Saldo Operável" no formulário reflita o valor atualizado
      invalidateSaldos(projetoId);
      invalidateCanonicalCaches(queryClient, projetoId);
      
      toast.success("Operação excluída!");
      onSuccess('delete');
      if (!embedded) onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao excluir: " + error.message);
    }
  };

  // ============================================
  // EXCLUIR PERNA INDIVIDUAL (MODO EDIÇÃO)
  // ============================================
  
  const handleDeletePerna = useCallback(async (pernaIndex: number) => {
    if (!isEditing || !surebet) return;
    
    // Buscar pernaId do OddEntry (ID-based, não index-based)
    const oddEntry = odds[pernaIndex];
    const pernaId = oddEntry?.pernaId;
    
    if (!pernaId) {
      // Perna nova (ainda não persistida) — remover apenas da UI
      setOdds(prev => prev.filter((_, i) => i !== pernaIndex));
      setDirectedProfitLegs(prev => 
        prev.filter(i => i !== pernaIndex).map(i => i > pernaIndex ? i - 1 : i)
      );
      toast.success("Sub-entrada removida");
      return;
    }

    const originalPerna = originalPernaIds.includes(pernaId);
    if (!originalPerna) {
      toast.error("Perna não encontrada");
      return;
    }

    
    // Mínimo de 2 pernas
    if (odds.length <= 2) {
      toast.error("Mínimo de 2 pernas. Use 'Excluir' para remover toda a operação.");
      return;
    }
    
    try {
      setDeletingPerna(true);
      
      const { data: rpcResult, error: rpcError } = await supabase.rpc('deletar_perna_surebet_v1', {
        p_perna_id: pernaId,
      });
      
      if (rpcError) {
        console.error(`[SurebetModalRoot] Erro ao deletar perna ${pernaId}:`, rpcError);
        throw new Error(rpcError.message);
      }
      
      const result = rpcResult as any;
      if (result && !result.success) {
        throw new Error(result.error || 'Falha ao excluir perna');
      }
      
      console.log(`[SurebetModalRoot] ✅ Perna ${pernaId} excluída via RPC:`, result);
      
      // Remover da UI
      setOdds(prev => prev.filter((_, i) => i !== pernaIndex));
      setDirectedProfitLegs(prev => 
        prev.filter(i => i !== pernaIndex).map(i => i > pernaIndex ? i - 1 : i)
      );
      
      const newSnapshot = originalPernasSnapshot.filter(p => p.perna_id !== pernaId);
      setOriginalPernasSnapshot(newSnapshot);
      setOriginalPernaIds(originalPernaIds.filter(id => id !== pernaId));

      const stakeMap = new Map<string, { real: number; freebet: number }>();
      newSnapshot.forEach(p => {
        const cur = stakeMap.get(p.bookmaker_id) || { real: 0, freebet: 0 };
        if (p.fonte_saldo === 'FREEBET') cur.freebet += p.stake; else cur.real += p.stake;
        stakeMap.set(p.bookmaker_id, cur);
      });
      setOriginalStakesByBookmaker(stakeMap);

      
      // Atualizar modelo visual
      const newCount = odds.length - 1;
      if (newCount === 2) setModeloTipo("2");
      else if (newCount === 3) setModeloTipo("3");
      else {
        setModeloTipo("4+");
        setNumPernasCustom(newCount);
      }
      
      // Invalidar saldos
      invalidateSaldos(projetoId);
      invalidateCanonicalCaches(queryClient, projetoId);
      
      toast.success(`Perna ${pernaIndex + 1} excluída`, {
        description: "O valor foi devolvido à casa de aposta.",
      });
    } catch (error: any) {
      toast.error("Erro ao excluir perna: " + error.message);
    } finally {
      setDeletingPerna(false);
    }
  }, [isEditing, surebet, odds.length, invalidateSaldos, projetoId]);

  // ============================================
  // VALIDAÇÃO DE SALDO POR PERNA
  // ============================================

  /**
   * Verifica se alguma perna possui stake maior que o saldo disponível da casa.
   * 
   * CRÍTICO: Desconta stakes já alocadas em OUTRAS pernas usando a mesma bookmaker.
   * Isso evita overbetting quando a mesma casa é usada em múltiplas pernas.
   * 
   * Exemplo: Bankonbet tem $100
   * - Perna 1: Bankonbet $60 → Saldo disponível para perna 1 = $100
   * - Perna 2: Bankonbet $50 → Saldo disponível para perna 2 = $100 - $60 = $40 → INSUFICIENTE
   * 
   * Retorna um objeto com:
   * - hasInsufficientBalance: true se alguma perna excede o saldo
   * - insufficientLegs: índices das pernas com saldo insuficiente
   * - adjustedBalances: Map de bookmaker_id → saldo ajustado (para exibição)
   */
  const balanceValidation = useMemo(() => {
    const insufficientLegs: number[] = [];
    // Granular: Map<"main-{legIdx}" | "sub-{legIdx}-{subIdx}", true>
    const insufficientEntries = new Map<string, boolean>();
    const adjustedBalances = new Map<string, number>();
    
    // Acumular alocações separadas por bookmaker: real vs freebet
    const alocadoPorBookmaker = new Map<string, { real: number; freebet: number }>();
    
    odds.forEach((entry, index) => {
      if (entry.bookmaker_id) {
        const mainStake = parseFloat(entry.stake) || 0;
        if (mainStake > 0) {
          // Para lay, o que reserva saldo é a responsabilidade (liability),
          // não o stake. liability = stake × (odd − 1)
          const mainOdd = parseFloat(entry.odd) || 0;
          const isLay = entry.tipo === 'lay';
          const valorReservado = isLay && mainOdd > 1
            ? mainStake * (mainOdd - 1)
            : mainStake;
          const cur = alocadoPorBookmaker.get(entry.bookmaker_id) || { real: 0, freebet: 0 };
          if (entry.fonteSaldo === 'FREEBET') cur.freebet += valorReservado; else cur.real += valorReservado;
          alocadoPorBookmaker.set(entry.bookmaker_id, cur);
        }
      }
      (entry.additionalEntries || []).forEach(sub => {
        const subBk = sub.bookmaker_id || entry.bookmaker_id;
        if (!subBk) return;
        const subStake = parseFloat(sub.stake) || 0;
        if (subStake > 0) {
          // Sub-entradas herdam o tipo da perna principal
          const subOdd = parseFloat(sub.odd) || parseFloat(entry.odd) || 0;
          const isLay = entry.tipo === 'lay';
          const valorReservado = isLay && subOdd > 1
            ? subStake * (subOdd - 1)
            : subStake;
          const cur = alocadoPorBookmaker.get(subBk) || { real: 0, freebet: 0 };
          if (sub.fonteSaldo === 'FREEBET') cur.freebet += valorReservado; else cur.real += valorReservado;
          alocadoPorBookmaker.set(subBk, cur);
        }
      });
    });
    
    // Validar cada bookmaker
    const bookmakerInsuficientes = new Set<string>();
    const bookmakerFBInsuficientes = new Set<string>();
    
    for (const [bkId, alocado] of alocadoPorBookmaker.entries()) {
      const bookmaker = bookmakerSaldos.find(b => b.id === bkId);
      if (!bookmaker) continue;
      const credito = isEditing ? (originalStakesByBookmaker.get(bkId) || { real: 0, freebet: 0 }) : { real: 0, freebet: 0 };
      const saldoReal = (bookmaker.saldo_operavel ?? 0) + credito.real;
      const saldoFB = (bookmaker.saldo_freebet ?? 0) + credito.freebet;
      if (alocado.real > saldoReal + 0.01) bookmakerInsuficientes.add(bkId);
      if (alocado.freebet > saldoFB + 0.01) bookmakerFBInsuficientes.add(bkId);
    }
    
    // Marcar entradas específicas com problema
    odds.forEach((entry, index) => {
      let legHasIssue = false;
      
      if (entry.bookmaker_id) {
        const isMainFB = entry.fonteSaldo === 'FREEBET';
        if ((isMainFB && bookmakerFBInsuficientes.has(entry.bookmaker_id)) ||
            (!isMainFB && bookmakerInsuficientes.has(entry.bookmaker_id))) {
          insufficientEntries.set(`main-${index}`, true);
          legHasIssue = true;
        }
      }
      
      (entry.additionalEntries || []).forEach((sub, subIdx) => {
        const subBk = sub.bookmaker_id || entry.bookmaker_id;
        if (!subBk) return;
        const isSubFB = sub.fonteSaldo === 'FREEBET';
        if ((isSubFB && bookmakerFBInsuficientes.has(subBk)) ||
            (!isSubFB && bookmakerInsuficientes.has(subBk))) {
          insufficientEntries.set(`sub-${index}-${subIdx}`, true);
          legHasIssue = true;
        }
      });
      
      if (legHasIssue) insufficientLegs.push(index);
    });
    
    return {
      hasInsufficientBalance: insufficientLegs.length > 0,
      insufficientLegs,
      insufficientEntries,
      adjustedBalances,
      bookmakerFBInsuficientes,
    };
  }, [odds, bookmakerSaldos, isEditing, originalStakesByBookmaker]);

  // ============================================
  // RASCUNHO
  // ============================================

  // Verifica se tem dados parciais para salvar como rascunho
  const temDadosParciais = useMemo(() => {
    const hasAnyPerna = odds.some(entry => {
      return entry.bookmaker_id || parseFloat(entry.odd) > 0 || parseFloat(entry.stake) > 0;
    });
    const hasEvento = evento.trim() !== "";
    return hasAnyPerna || hasEvento;
  }, [odds, evento]);

   // ESTADOS DE OPERAÇÃO (Rascunho vs Registrado)
   // Rascunho é sempre verdadeiro se não for edição direta do banco
   const isOperacaoRascunho = !isEditing;
   const isOperacaoRegistrada = isEditing;
   
   // ESTADOS DE ESTRUTURA (Completude)
   const isEstruturaCompleta = analysis.pernasCompletasCount >= numPernas && 
                              odds.length >= numPernas && 
                              !!evento.trim() && 
                              !!estrategia;
 
   // Pode salvar como rascunho: tem qualquer dado e não é edição do banco
   const podeSalvarRascunho = !isEditing && temDadosParciais;
   const isAtualizandoRascunho = !!rascunhoIdLocal || !!rascunho?.id;
  const rascunhoIdEfetivo = rascunho?.id || rascunhoIdLocal;
  // Handler para salvar como rascunho
  const handleSalvarRascunho = useCallback(() => {
    if (!workspaceId) {
      toast.error("Workspace não identificado");
      return;
    }
    
    // Converter odds para formato de rascunho
    const pernasRascunho: RascunhoPernaData[] = odds.map(entry => ({
      bookmaker_id: entry.bookmaker_id || undefined,
      bookmaker_nome: bookmakerSaldos.find(b => b.id === entry.bookmaker_id)?.nome,
      selecao: entry.selecao || undefined,
      selecao_livre: entry.selecaoLivre || undefined,
      odd: parseFloat(entry.odd) || undefined,
      stake: parseFloat(entry.stake) || undefined,
      moeda: entry.moeda,
    }));
    
    const modelo = numPernas === 2 ? "1-2" : numPernas === 3 ? "1-X-2" : `${numPernas}-way`;
    
    const dadosRascunho = {
      evento: evento || undefined,
      mercado: mercado || undefined,
      esporte: esporte || undefined,
      estrategia: (estrategia || ARBITRAGEM_ESTRATEGIA) as ApostaEstrategia,
      contexto_operacional: contexto || undefined,
      modelo,
      modelo_tipo: modeloTipo,
      quantidade_pernas: numPernas,
      pernas: pernasRascunho,
    };

    let rascunhoSalvo;
    if (rascunhoIdEfetivo) {
      // Atualizar rascunho existente (veio de prop ou já foi salvo antes nesta sessão)
      rascunhoSalvo = atualizarRascunho(rascunhoIdEfetivo, dadosRascunho);
    } else {
      // Criar novo rascunho
      rascunhoSalvo = criarRascunho('SUREBET', dadosRascunho);
      // Guardar o ID para que cliques subsequentes atualizem em vez de criar duplicatas
      if (rascunhoSalvo) {
        setRascunhoIdLocal(rascunhoSalvo.id);
      }
    }
    
    toast.success(
      rascunhoIdEfetivo ? `Rascunho atualizado!` : `Rascunho salvo!`,
      { 
        description: rascunhoSalvo?.motivo_incompleto || 'Acesse seus rascunhos para continuar depois',
        icon: <FileText className="h-4 w-4 text-blue-500" />
      }
    );
    
     // NÃO fechar o formulário automaticamente se estiver completo (deixa usuário decidir registrar)
     // Se estiver incompleto, costuma fechar para "continuar depois"
     if (!embedded && !isEstruturaCompleta) onOpenChange(false);
  }, [odds, evento, mercado, esporte, estrategia, contexto, modeloTipo, numPernas, workspaceId, bookmakerSaldos, criarRascunho, atualizarRascunho, rascunhoIdEfetivo, onOpenChange]);

  const getBookmakerNome = (id: string) => bookmakerSaldos.find(b => b.id === id)?.nome || "";

  // ============================================
  // RENDERIZAÇÃO
  // ============================================

  if (!open) return null;

  return (
    <>
      {/* Painel Fullscreen - Ocupa 100% da janela */}
      <div 
        className="z-50 bg-background flex flex-col animate-in fade-in-0 duration-200"
        data-testid="surebet-modal-root"
        data-trace-id={(analysis as any).traceId}
        data-calc-state={analysis.isValidArbitrage ? "valid" : "invalid"}
        data-edit-state={isEditing ? "editing" : "creating"}
      >
        <div className="relative w-full min-w-[820px] flex flex-col overflow-hidden">
          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          
           {/* HEADER UNIFICADO V2 - com badges de estado */}
          <BetFormHeaderV2
            formType="arbitragem"
            estrategia={estrategia}
            contexto={contexto}
            onEstrategiaChange={(v) => setEstrategia(v)}
            onContextoChange={(v) => setContexto(v)}
            isEditing={isEditing}
            activeTab={activeTab}
            lockedEstrategia={isAbaEstrategiaFixa(activeTab) ? getEstrategiaFromTab(activeTab) : null}
            gameFields={{
              esporte,
              evento,
              mercado,
              dataAposta,
              onEsporteChange: setEsporte,
              onEventoChange: setEvento,
              onMercadoChange: setMercado,
              onDataApostaChange: setDataAposta,
              esportesList: ESPORTES,
            }}
            showImport={false}
            legPrintStatuses={legPrints}
            showCloseButton={!embedded}
            onClose={() => onOpenChange(false)}
            embedded={embedded}
            eventoAdornment={
              <ExploradorEventoPicker
                variant="icon"
                defaultDate={dataAposta}
                esporte={esporte}
                onSelect={(ev) => {
                  const mapped = mapDailyEventToFormFields(ev);
                  setEsporte(mapped.esporte);
                  setEvento(mapped.evento);
                  setDataAposta(mapped.dataAposta);
                  setImportedHomeTeam(mapped.homeTeam);
                  setImportedAwayTeam(mapped.awayTeam);
                  setImportedHomeLogo(mapped.homeTeamLogoUrl);
                  setImportedAwayLogo(mapped.awayTeamLogoUrl);
                  setImportedLeagueLogo(mapped.leagueLogoUrl);
                  setImportedDailyEventId(mapped.dailyEventId);
                }}
              />
            }
             extraBadge={
               <div className="flex items-center gap-1.5 ml-1">
                 {/* Badge de Intenção */}
                 {isOperacaoRegistrada ? (
                   <Badge variant="outline" className="text-[10px] h-4 px-1.5 py-0 bg-green-500/10 text-green-500 border-green-500/20 uppercase font-bold tracking-wider">
                     Registrado
                   </Badge>
                 ) : (
                   <Badge variant="outline" className="text-[10px] h-4 px-1.5 py-0 bg-blue-500/10 text-blue-500 border-blue-500/20 uppercase font-bold tracking-wider">
                     Rascunho
                   </Badge>
                 )}
                 
                 {/* Badge de Estrutura */}
                 {isEstruturaCompleta ? (
                   <Badge variant="secondary" className="text-[10px] h-4 px-1.5 py-0 bg-muted text-muted-foreground border-transparent uppercase font-medium">
                     Completo
                   </Badge>
                 ) : (
                   <Badge variant="secondary" className="text-[10px] h-4 px-1.5 py-0 bg-amber-500/10 text-amber-500 border-amber-500/20 uppercase font-medium">
                     Incompleto
                   </Badge>
                 )}
               </div>
             }
          />

          {/* CONTENT */}
          <div className="p-3 md:p-4 space-y-3 overflow-auto flex-1">
            {/* Aviso de Edição Pós-Liquidação */}
            {isEditing && isLiquidada && (
              <div className="flex items-center gap-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-sm mb-1">
                <AlertTriangle className="h-4 w-4 text-blue-500 shrink-0" />
                <div className="flex-1">
                  <span className="font-medium text-blue-500">Operação Liquidada:</span>{" "}
                  <span className="text-muted-foreground">
                    Salvar irá recalcular saldos e lucro com base nos novos valores de odd/stake.
                  </span>
                </div>
              </div>
            )}

            {/* Modelo de Pernas */}
            <div className="flex flex-wrap items-center gap-4 pb-3 border-b border-border/50">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Modelo</Label>
                <div className={`flex bg-muted/50 rounded p-0.5 ${isEditing ? 'opacity-60' : ''}`}>
                  {(["2", "3", "4+"] as const).map((tipo) => (
                    <button
                      key={tipo}
                      type="button"
                      onClick={() => !isEditing && setModeloTipo(tipo)}
                      disabled={isEditing}
                      className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                        modeloTipo === tipo ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {tipo === "4+" ? "4+ pernas" : `${tipo} pernas`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Indicador discreto de operação parcial */}
              {analysis.isOperacaoParcial && !isEditing && (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setShowConversionDialog(true)}
                        className="inline-flex items-center gap-1.5 h-6 px-2 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/30 text-[11px] font-medium hover:bg-amber-500/15 transition-colors"
                      >
                        <AlertTriangle className="h-3 w-3" />
                        Parcial {analysis.pernasCompletasCount}/{numPernas}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      Converter para apostas simples
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              
              {modeloTipo === "4+" && !isEditing && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Qtd:</Label>
                  <Input
                    type="number"
                    min="4"
                    max="10"
                    value={numPernasCustom}
                    onChange={(e) => setNumPernasCustom(Math.max(4, Math.min(10, parseInt(e.target.value) || 4)))}
                    className="h-7 w-16 text-center text-xs"
                  />
                </div>
              )}
              {/* Toggle de layout - hidden on mobile */}
              {!isMobile && (
                <div className="flex items-center rounded-md border border-border/40 overflow-hidden ml-auto">
                  <button
                    type="button"
                    onClick={() => setViewLayout('vertical')}
                    className={cn(
                      "p-1.5 transition-colors",
                      viewLayout === 'vertical' ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                    )}
                    title="Layout vertical (tabela)"
                  >
                    <Rows3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewLayout('horizontal')}
                    className={cn(
                      "p-1.5 transition-colors",
                      viewLayout === 'horizontal' ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                    )}
                    title="Layout horizontal (colunas)"
                  >
                    <Columns3 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Loading state for pernas */}
            {pernasLoading && isEditing ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center space-y-2">
                  <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs text-muted-foreground">Carregando entradas...</p>
                </div>
              </div>
            ) : isMobile ? (
              <div className="space-y-3" ref={tableContainerRef}>
                {odds.map((entry, pernaIndex) => (
                  <SurebetMobileCard
                    key={pernaIndex}
                    entry={entry}
                    pernaIndex={pernaIndex}
                    label={getPernaLabel(pernaIndex, numPernas)}
                    scenario={analysis.scenarios[pernaIndex]}
                    isEditing={isEditing}
                    isProcessing={legPrints[pernaIndex]?.isProcessing || false}
                    bookmakersByLeg={getAdjustedBookmakersForLeg}
                    directedProfitLegs={directedProfitLegs}
                    numPernas={numPernas}
                    moedaDominante={analysis.moedaDominante}
                         hasInsufficientBalance={balanceValidation.insufficientLegs.includes(pernaIndex)}
                          erro={errosPorPerna[pernaIndex]}
                          errosPorPerna={errosPorPerna}
                         insufficientEntries={balanceValidation.insufficientEntries}
                    onResultadoChange={handlePernaResultadoChange}
                    onUpdateOdd={updateOdd}
                    onSetReference={setReferenceIndex}
                    onToggleDirected={toggleDirectedLeg}
                    onAddEntry={addAdditionalEntry}
                    onUpdateAdditionalEntry={updateAdditionalEntry}
                    onRemoveAdditionalEntry={removeAdditionalEntry}
                    onDeletePerna={handleDeletePerna}
                    canDeletePerna={isEditing && odds.length > 2}
                    onFieldKeyDown={handleFieldKeyDown}
                  />
                ))}
              </div>
            ) : viewLayout === 'vertical' ? (
              <div className="overflow-x-auto" ref={tableContainerRef}>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr 
                      className="border-b border-border/50"
                      data-trace-id={analysis.traceId}
                      data-calc-state={analysis.stakeTotal > 0 ? "valid" : "invalid"}
                      data-hydration-state={isEditing ? "user" : "db"}
                      data-edit-state={isEditing ? "dirty" : "pristine"}
                    >
                      <th className="py-2 px-2 text-left font-medium text-muted-foreground w-16">Perna</th>
                      <th className="py-2 px-2 text-center font-medium text-muted-foreground min-w-[160px]">Casa</th>
                      <th className="py-2 px-2 text-center font-medium text-muted-foreground w-20">Odd</th>
                      {(showComissao || odds.some(o => (o.tipo ?? 'back') === 'lay')) && (
                        <th className="py-2 px-2 text-center font-medium text-muted-foreground w-20" title="Comissão da exchange">Comissão</th>
                      )}
                      <th className="py-2 px-2 text-center font-medium text-muted-foreground w-24">Stake</th>
                      <th className="py-2 px-2 text-center font-medium text-muted-foreground w-20">Linha</th>
                      {!isEditing && (
                        <th className="py-2 px-2 text-center font-medium text-muted-foreground w-10" title="Referência">
                          <Target className="h-3.5 w-3.5 mx-auto" />
                        </th>
                      )}
                      {isEditing && (
                        <th className="py-2 px-2 text-center font-medium text-muted-foreground w-28">Resultado</th>
                      )}
                      {!isEditing && (
                        <th className="py-2 px-2 text-center font-medium text-muted-foreground w-10" title="Distribuição de lucro">
                          D
                        </th>
                      )}
                      <th className="py-2 px-2 text-center font-medium text-muted-foreground w-20">Lucro</th>
                      <th className="py-2 px-2 text-center font-medium text-muted-foreground w-16">ROI</th>
                      <th className="py-2 px-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {odds.map((entry, pernaIndex) => (
                      <SurebetTableRow
                        key={pernaIndex}
                        entry={entry}
                        pernaIndex={pernaIndex}
                        label={getPernaLabel(pernaIndex, numPernas)}
                        rowSpan={1}
                        scenario={analysis.scenarios[pernaIndex]}
                        isEditing={isEditing}
                        isFocused={focusedLeg === pernaIndex}
                        isProcessing={legPrints[pernaIndex]?.isProcessing || false}
                        bookmakersByLeg={getAdjustedBookmakersForLeg}
                        directedProfitLegs={directedProfitLegs}
                        numPernas={numPernas}
                        moedaDominante={analysis.moedaDominante}
                        hasInsufficientBalance={balanceValidation.insufficientLegs.includes(pernaIndex)}
                        insufficientEntries={balanceValidation.insufficientEntries}
                        error={errosPorPerna[pernaIndex]}
                        showComissao={showComissao || odds.some(o => (o.tipo ?? 'back') === 'lay')}
                        onResultadoChange={handlePernaResultadoChange}
                        onUpdateOdd={updateOdd}
                        onSetReference={setReferenceIndex}
                        onToggleDirected={toggleDirectedLeg}
                        onAddEntry={addAdditionalEntry}
                        onUpdateAdditionalEntry={updateAdditionalEntry}
                        onRemoveAdditionalEntry={removeAdditionalEntry}
                        onDeletePerna={handleDeletePerna}
                        canDeletePerna={isEditing && odds.length > 2}
                        onFocus={setFocusedLeg}
                        onBlur={() => setFocusedLeg(null)}
                        onFieldKeyDown={handleFieldKeyDown}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div ref={tableContainerRef}>
                <SurebetColumnsView
                  odds={odds}
                  scenarios={analysis.scenarios}
                  isEditing={isEditing}
                  bookmakersByLeg={(idx, subIdx) => getAdjustedBookmakersForLeg(idx, subIdx)}
                  directedProfitLegs={directedProfitLegs}
                  numPernas={numPernas}
                  moedaDominante={analysis.moedaDominante}
                         insufficientLegs={balanceValidation.insufficientLegs}
                         errosPorPerna={errosPorPerna}
                         insufficientEntries={balanceValidation.insufficientEntries}
                  onResultadoChange={handlePernaResultadoChange}
                  onUpdateOdd={updateOdd}
                  onSetReference={setReferenceIndex}
                  onToggleDirected={toggleDirectedLeg}
                  onAddEntry={addAdditionalEntry}
                  onUpdateAdditionalEntry={updateAdditionalEntry}
                  onRemoveAdditionalEntry={removeAdditionalEntry}
                  onDeletePerna={handleDeletePerna}
                  canDeletePerna={isEditing && odds.length > 2}
                  onFocus={setFocusedLeg}
                  onBlur={() => setFocusedLeg(null)}
                  onFieldKeyDown={handleFieldKeyDown}
                  getPernaLabel={getPernaLabel}
                />
              </div>
            )}

            {/* FOOTER - Totais e Controles */}
            <SurebetTableFooter
              analysis={analysis}
              isEditing={isEditing}
              arredondarAtivado={arredondarAtivado}
              setArredondarAtivado={setArredondarAtivado}
              arredondarValor={arredondarValor}
              setArredondarValor={setArredondarValor}
              showComissao={showComissao}
              setShowComissao={(v) => {
                setShowComissao(v);
                try { window.localStorage?.setItem('surebet_show_comissao', v ? '1' : '0'); } catch {}
              }}
              hasLayLeg={odds.some(o => (o.tipo ?? 'back') === 'lay')}
            />
          </div>

          {/* ACTIONS */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 md:px-4 py-2 border-t border-border/50 bg-muted/30">
            <div>
              {isEditing && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <Trash2 className="h-4 w-4 mr-1" />
                      Excluir
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir Arbitragem?</AlertDialogTitle>
                      <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
            <TooltipProvider delayDuration={200}>
            <div className="flex flex-wrap items-center gap-2">
              {!isEditing && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
                      onClick={() => {
                    setEsporte("Futebol");
                    setEvento("");
                    setMercado("");
                    setContexto(CONTEXTO_OPERACIONAL.NORMAL);
                    setEstrategia(ARBITRAGEM_ESTRATEGIA);
                    setModeloTipo("2");
                    resetToNewForm(2);
                    const now = new Date();
                    const yyyy = now.getFullYear();
                    const mm = String(now.getMonth() + 1).padStart(2, "0");
                    const dd = String(now.getDate()).padStart(2, "0");
                    const hh = String(now.getHours()).padStart(2, "0");
                    const mi = String(now.getMinutes()).padStart(2, "0");
                    setDataAposta(`${yyyy}-${mm}-${dd}T${hh}:${mi}`);
                    setErrosPorPerna({});
                    toast.success("Formulário limpo");
                      }}
                      aria-label="Limpar formulário"
                    >
                      <Brush className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Limpar formulário</TooltipContent>
                </Tooltip>
              )}
               {!isEditing && (
                 <Tooltip>
                   <TooltipTrigger asChild>
                     <Button
                       variant="ghost"
                       size="icon"
                       onClick={handleSalvarRascunho}
                       disabled={saving || !temDadosParciais}
                       className="h-9 w-9 rounded-full text-blue-500 hover:text-blue-400 hover:bg-blue-500/10"
                       aria-label={isAtualizandoRascunho ? 'Atualizar rascunho' : 'Salvar rascunho'}
                     >
                       {isAtualizandoRascunho
                         ? <BookmarkCheck className="h-4 w-4" />
                         : <BookmarkPlus className="h-4 w-4" />}
                     </Button>
                   </TooltipTrigger>
                   <TooltipContent>
                     {isAtualizandoRascunho ? 'Atualizar rascunho' : 'Salvar rascunho'}
                   </TooltipContent>
                 </Tooltip>
               )}
              {analysis.isOperacaoParcial && !isEditing && (
                <Button 
                  variant="secondary"
                  onClick={() => setShowConversionDialog(true)}
                  disabled={saving || pernasValidas.length < 2}
                >
                  <ArrowRight className="h-4 w-4 mr-1" />
                  Simples ({pernasValidas.length})
                </Button>
              )}
                <Button 
                  onClick={handleSaveWrapper} 
                  disabled={saving || !isEstruturaCompleta || Object.keys(errosPorPerna).length > 0 || balanceValidation.hasInsufficientBalance}
                  title={
                    !isEstruturaCompleta 
                      ? "Preencha todos os dados obrigatórios para registrar" 
                      : Object.keys(errosPorPerna).length > 0
                        ? "Saldo insuficiente em uma ou mais casas"
                        : balanceValidation.hasInsufficientBalance
                          ? "Saldo insuficiente em uma ou mais casas (verifique os campos)"
                        : undefined
                  }
                >
                 <Save className="h-4 w-4 mr-1" />
                 {isEditing ? "Salvar Alterações" : "Registrar Operação"}
               </Button>
            </div>
            </TooltipProvider>
          </div>

          {/* Aviso de saldo insuficiente */}
          {!isEditing && balanceValidation.hasInsufficientBalance && (
            <div className="px-4 pb-3 -mt-2">
              <div className="flex items-center gap-2 p-2 bg-destructive/10 border border-destructive/30 rounded text-xs text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  {balanceValidation.bookmakerFBInsuficientes && balanceValidation.bookmakerFBInsuficientes.size > 0
                    ? `Saldo de Freebet insuficiente na(s) perna(s) ${balanceValidation.insufficientLegs.map(i => i + 1).join(", ")}. O valor FB excede o saldo disponível.`
                    : `Saldo insuficiente na(s) perna(s) ${balanceValidation.insufficientLegs.map(i => i + 1).join(", ")}. Reduza o stake ou selecione outra casa.`
                  }
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dialog de Conversão */}
      <AlertDialog open={showConversionDialog} onOpenChange={setShowConversionDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Converter para Apostas Simples?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta operação não cobre todos os resultados do modelo {numPernas} pernas.
              Deseja registrar as {pernasValidas.length} pernas válidas como apostas simples independentes?
              
              <div className="mt-3 p-3 bg-muted/50 rounded-lg text-xs">
                <div className="font-medium mb-1">Pernas que serão registradas:</div>
                {pernasValidas.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 py-0.5">
                    <ArrowRight className="h-3 w-3 text-primary" />
                    <span>{p.selecao} • {getBookmakerNome(p.bookmaker_id)} • Odd {p.odd} • Stake {p.stake}</span>
                  </div>
                ))}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={conversionInProgress}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConvertToSimpleBets}
              disabled={conversionInProgress}
              className="bg-primary"
            >
              {conversionInProgress ? "Registrando..." : "Registrar como Apostas Simples"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de Confirmação para Aposta Liquidada */}
      <AlertDialog open={showLiquidadaConfirmation} onOpenChange={setShowLiquidadaConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirmar Alteração em Aposta Liquidada
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta operação já possui resultados definidos e movimentações financeiras no Ledger.
              <br /><br />
              Ao salvar, o sistema irá:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Estornar os payouts/reembolsos atuais no Ledger</li>
                <li>Recalcular e lançar novos eventos com os valores atualizados</li>
                <li>Atualizar o lucro/prejuízo final da operação</li>
              </ul>
              <br />
              Deseja prosseguir com o recalculo financeiro?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                setShowLiquidadaConfirmation(false);
                handleSave();
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Confirmar e Recalcular
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ConfirmLayCollapseDialog
        open={layCollapseRequest !== null}
        entriesToRemove={layCollapseRequest?.entriesPreview ?? []}
        remainingBookmakerNome={layCollapseRequest?.remainingBookmakerNome}
        onCancel={cancelLayCollapse}
        onConfirm={confirmLayCollapse}
      />
    </>
  );
}
