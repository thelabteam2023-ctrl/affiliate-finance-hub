import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useBookmakerSaldosQuery, useInvalidateBookmakerSaldos, type BookmakerSaldo } from "@/hooks/useBookmakerSaldosQuery";
import { usePreCommitValidation } from "@/hooks/usePreCommitValidation";
import { useStakeReservation, useBookmakerSaldoComReservas } from "@/hooks/useStakeReservation";
import { SaldoReservaCompact } from "@/components/saldo/SaldoReservaDisplay";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Save, Trash2, HelpCircle, Coins, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, XCircle, Shield, BarChart3, BookOpen, BookX, Gift, Percent, Camera } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { useImportBetPrint } from "@/hooks/useImportBetPrint";
import { RegistroApostaValues, validateRegistroAposta, getSuggestionsForTab } from "./RegistroApostaFields";
import { BetFormHeaderV2 } from "@/components/apostas/BetFormHeaderV2";
import { FORMA_REGISTRO, APOSTA_ESTRATEGIA, CONTEXTO_OPERACIONAL, FONTE_SALDO, isAbaEstrategiaFixa, getEstrategiaFromTab, getContextoFromTab, isAbaContextoFixo, type FormaRegistro, type ApostaEstrategia, type ContextoOperacional, type FonteSaldo } from "@/lib/apostaConstants";
import { useFonteSaldoDefault } from "@/components/apostas/FonteSaldoSelector";
import { toLocalTimestamp } from "@/utils/dateUtils";
import { 
  BookmakerSelectOption,
  BookmakerSelectTrigger,
  BookmakerMetaRow,
  SaldoBreakdownDisplay, 
  formatCurrency as formatCurrencyCanonical,
  getCurrencyTextColor,
  getCurrencySymbol 
} from "@/components/bookmakers/BookmakerSelectOption";
import { reliquidarAposta, deletarAposta } from "@/services/aposta";
import { updateBookmakerBalance } from "@/lib/bookmakerBalanceHelper";
import { useBonusBalanceManager } from "@/hooks/useBonusBalanceManager";
import { GerouFreebetInput } from "./GerouFreebetInput";
import { useActiveBonusInfo } from "@/hooks/useActiveBonusInfo";
import { BonusImpactAlert } from "./BonusImpactAlert";
import { FreebetToggle, SaldoWaterfallPreview } from "@/components/apostas/waterfall";

interface Aposta {
  id: string;
  data_aposta: string;
  esporte: string;
  evento: string;
  mercado: string | null;
  selecao: string;
  odd: number;
  stake: number;
  estrategia: string | null;
  status: string;
  resultado: string | null;
  valor_retorno: number | null;
  lucro_prejuizo: number | null;
  observacoes: string | null;
  bookmaker_id: string;
  modo_entrada?: string;
  lay_exchange?: string | null;
  lay_odd?: number | null;
  lay_stake?: number | null;
  lay_liability?: number | null;
  lay_comissao?: number | null;
  back_em_exchange?: boolean;
  back_comissao?: number | null;
  gerou_freebet?: boolean;
  valor_freebet_gerada?: number | null;
  tipo_freebet?: string | null;
  forma_registro?: string | null;
  contexto_operacional?: string | null;
}

// Interface de Bookmaker local (mapeada do hook canônico)
interface Bookmaker {
  id: string;
  nome: string;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  saldo_atual: number;
  saldo_total: number;
  saldo_disponivel: number;
  saldo_freebet: number;
  saldo_bonus: number;
  saldo_operavel: number;
  moeda: string;
  logo_url: string | null;
  bonus_rollover_started?: boolean;
}

/** Tipo de ação executada para distinguir save de delete */
export type ApostaActionType = 'save' | 'delete';

interface ApostaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aposta: Aposta | null;
  projetoId: string;
  /** Callback após sucesso. O parâmetro action distingue 'save' (criar/atualizar) de 'delete' (exclusão) */
  onSuccess: (action?: ApostaActionType) => void;
  defaultEstrategia?: string;
  activeTab?: string;
  /** Quando true, renderiza apenas o conteúdo interno (sem Dialog wrapper) para uso em janelas flutuantes */
  embedded?: boolean;
}

const ESPORTES_BASE = [
  "Futebol",
  "Basquete",
  "Tênis",
  "Baseball",
  "Hockey",
  "Futebol Americano",
  "Vôlei",
  "MMA/UFC",
  "League of Legends",
  "Counter-Strike",
  "Dota 2",
  "eFootball",
  "Outro"
];

const SPORT_USAGE_KEY = "apostas_sport_usage";

const getSortedEsportes = (): string[] => {
  try {
    const stored = localStorage.getItem(SPORT_USAGE_KEY);
    if (!stored) return ESPORTES_BASE;
    
    const usage: Record<string, number> = JSON.parse(stored);
    
    return [...ESPORTES_BASE].sort((a, b) => {
      const countA = usage[a] || 0;
      const countB = usage[b] || 0;
      if (countA === countB) {
        return ESPORTES_BASE.indexOf(a) - ESPORTES_BASE.indexOf(b);
      }
      return countB - countA;
    });
  } catch {
    return ESPORTES_BASE;
  }
};

const incrementSportUsage = (sport: string) => {
  try {
    const stored = localStorage.getItem(SPORT_USAGE_KEY);
    const usage: Record<string, number> = stored ? JSON.parse(stored) : {};
    usage[sport] = (usage[sport] || 0) + 1;
    localStorage.setItem(SPORT_USAGE_KEY, JSON.stringify(usage));
  } catch {
    // Silently fail
  }
};

// ========================================================================
// NOVO SISTEMA DE MERCADOS CANÔNICOS
// ========================================================================
// Over/Under e Handicap NUNCA são mercados sozinhos
// Sempre: TIPO + DOMÍNIO (para TOTAL e HANDICAP)
// ========================================================================

import { 
  getMarketOptionsForSport as getCanonicalMarketOptions,
  isTotalMarket as isTotalMercado,
  isHandicapMarket as isHandicapMercado,
  MarketDomain,
  DOMAIN_LABELS,
  getDomainsForSport,
} from "@/lib/marketTypes";

import { parseOcrMarket, resolveOcrResultToOption } from "@/lib/marketOcrParser";

const MERCADOS_POR_ESPORTE: Record<string, string[]> = {
  "Futebol": [
    "1X2",
    "Total de Gols",
    "Total de Escanteios",
    "Total de Cartões",
    "Handicap",
    "Handicap de Gols",
    "Ambas Marcam (BTTS)",
    "Dupla Chance",
    "Draw No Bet",
    "Resultado do 1º Tempo",
    "Placar Exato",
    "Outro"
  ],
  "Basquete": [
    "Moneyline",
    "Total de Pontos",      // ANTES: "Over (Pontos)" + "Under (Pontos)"
    "Handicap de Pontos",   // ANTES: "Handicap"
    "1º/2º Tempo",
    "Margem de Vitória",
    "Outro"
  ],
  "Tênis": [
    "Vencedor do Jogo",
    "Total de Games",       // ANTES: "Over (Games)" + "Under (Games)"
    "Total de Sets",
    "Handicap de Games",
    "Handicap de Sets",
    "Vencedor do Set",
    "Resultado Exato (Sets)",
    "Outro"
  ],
  "Baseball": [
    "Moneyline",
    "Total de Runs",        // ANTES: "Over (Runs)" + "Under (Runs)"
    "Run Line",
    "Handicap de Runs",
    "1ª Metade (1st 5 Innings)",
    "Outro"
  ],
  "Hockey": [
    "Moneyline",
    "Total de Gols",        // ANTES: "Over (Gols)" + "Under (Gols)"
    "Puck Line",
    "Handicap de Gols",
    "1º/2º/3º Período",
    "Outro"
  ],
  "Futebol Americano": [
    "Moneyline",
    "Total de Pontos",      // ANTES: "Over (Pontos)" + "Under (Pontos)"
    "Spread",
    "Handicap de Pontos",
    "1º/2º Tempo",
    "Margem de Vitória",
    "Outro"
  ],
  "Vôlei": [
    "Vencedor",
    "Total de Pontos",      // ANTES: "Over (Pontos)" + "Under (Pontos)"
    "Total de Sets",
    "Handicap de Pontos",
    "Handicap de Sets",
    "Resultado Exato (Sets)",
    "Outro"
  ],
  "MMA/UFC": [
    "Vencedor",
    "Método de Vitória",
    "Total de Rounds",      // ANTES: "Over (Rounds)" + "Under (Rounds)"
    "Round de Finalização",
    "Vai para Decisão?",
    "Outro"
  ],
  "Boxe": [
    "Vencedor",
    "Método de Vitória",
    "Total de Rounds",
    "Round de Finalização",
    "Outro"
  ],
  "League of Legends": [
    "Vencedor do Mapa",
    "Vencedor da Série",
    "Total de Mapas",       // ANTES: "Over (Mapas)" + "Under (Mapas)"
    "Handicap de Mapas",
    "Total de Kills",
    "Outro"
  ],
  "Counter-Strike": [
    "Vencedor do Mapa",
    "Vencedor da Série",
    "Total de Mapas",
    "Total de Rounds",      // ANTES: "Over (Rounds)" + "Under (Rounds)"
    "Handicap de Mapas",
    "Handicap de Rounds",
    "Outro"
  ],
  "Dota 2": [
    "Vencedor do Mapa",
    "Vencedor da Série",
    "Total de Mapas",
    "Handicap de Mapas",
    "Total de Kills",
    "Outro"
  ],
  "eFootball": [
    "Vencedor",
    "Total de Gols",        // ANTES: "Over (Gols)" + "Under (Gols)"
    "Handicap de Gols",
    "Ambas Marcam",
    "Resultado Exato",
    "Outro"
  ],
  "Outro": [
    "Vencedor",
    "Total",                // ANTES: "Over" + "Under"
    "Handicap",
    "Outro"
  ]
};

// Helper to check if mercado is Moneyline
const isMoneylineMercado = (mercado: string): boolean => {
  const moneylineKeywords = ["Moneyline", "1X2", "Vencedor"];
  return moneylineKeywords.some(kw => mercado.includes(kw));
};

// Normalize text for comparison (remove accents, trim, uppercase)
const normalizeText = (text: string): string => {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
};

// Match OCR detected selection with existing options (returns matched option or null)
const matchSelecaoWithOptions = (options: string[], detected: string): string | null => {
  if (!detected || options.length === 0) return null;
  
  const normalizedDetected = normalizeText(detected);
  
  // Try exact match first (normalized)
  const exactMatch = options.find(opt => normalizeText(opt) === normalizedDetected);
  if (exactMatch) return exactMatch;
  
  // Try partial match (contains)
  const partialMatch = options.find(opt => 
    normalizeText(opt).includes(normalizedDetected) || 
    normalizedDetected.includes(normalizeText(opt))
  );
  if (partialMatch) return partialMatch;
  
  return null;
};

// Get Moneyline selection options based on sport and evento
const getMoneylineSelecoes = (esporte: string | undefined, evento: string): string[] => {
  // Parse evento para extrair times (formato "MANDANTE x VISITANTE")
  const partes = evento.split(/\s*x\s*/i);
  const timeCasa = partes[0]?.trim() || "MANDANTE";
  const timeFora = partes[1]?.trim() || "VISITANTE";
  
  // Guard against undefined esporte
  if (!esporte) {
    return [timeCasa, "EMPATE", timeFora];
  }
  
  // Sports without draw
  const sportsSemEmpate = ["Basquete", "Tênis", "Baseball", "Vôlei", "MMA/UFC", "Boxe"];
  
  if (sportsSemEmpate.includes(esporte) || esporte.includes("League") || esporte.includes("Counter") || esporte.includes("Dota")) {
    return [timeCasa, timeFora];
  }
  
  // Football and others with draw
  return [timeCasa, "EMPATE", timeFora];
};

// Removed EXCHANGES list - now using bookmakers list for Exchange tab

export function ApostaDialog({ open, onOpenChange, aposta, projetoId, onSuccess, defaultEstrategia = 'PUNTER', activeTab = 'apostas', embedded = false }: ApostaDialogProps) {
  const { workspaceId } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // ========== HOOK CANÔNICO DE SALDOS ==========
  // Esta é a ÚNICA fonte de verdade para saldos de bookmaker
  const { 
    data: bookmakerSaldos = [], 
    isLoading: saldosLoading,
    refetch: refetchSaldos 
  } = useBookmakerSaldosQuery({
    projetoId,
    enabled: open,
    includeZeroBalance: true, // Permitir selecionar mesmo com saldo 0 (registro histórico/ajustes)
    currentBookmakerId: aposta?.bookmaker_id || null
  });
  const invalidateSaldos = useInvalidateBookmakerSaldos();
  
  // Hook para validação pré-commit (anti-concorrência)
  const { validateAndReserve, showValidationErrors, validating } = usePreCommitValidation();
  
  // ========== SISTEMA DE RESERVA DE SALDO EM TEMPO REAL ==========
  // Previne race conditions entre operadores simultâneos
  const {
    reserving: stakeReserving,
    sessionId: stakeSessionId,
    currentReservation,
    reserveStake,
    commitReservation,
    cancelReservation
  } = useStakeReservation({
    workspaceId: workspaceId || '',
    formType: 'SIMPLES',
    enabled: open && !!workspaceId
  });
  // O hook useBookmakerSaldoComReservas é usado após a declaração de bookmakerId
  
  // Hook para gerenciamento de bônus (rollover)
  const { atualizarProgressoRollover } = useBonusBalanceManager();

  // Mapear saldos canônicos para formato local (retrocompatibilidade)
  // IMPORTANTE: Filtrar casas com transações pendentes (bloqueio de conciliação)
  const bookmakers = useMemo((): Bookmaker[] => {
    return bookmakerSaldos
      .filter(bk => !bk.has_pending_transactions) // Bloquear casas não conciliadas
      .map(bk => ({
        id: bk.id,
        nome: bk.nome,
        parceiro_id: bk.parceiro_id,
        parceiro_nome: bk.parceiro_nome,
        saldo_atual: bk.saldo_real,
        saldo_total: bk.saldo_real,
        saldo_disponivel: bk.saldo_disponivel,
        saldo_freebet: bk.saldo_freebet,
        saldo_bonus: bk.saldo_bonus,
        saldo_operavel: bk.saldo_operavel,
        moeda: bk.moeda,
        logo_url: bk.logo_url,
        bonus_rollover_started: bk.bonus_rollover_started
      }));
  }, [bookmakerSaldos]);

  // Import by Print
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogContentRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const {
    isProcessing: isPrintProcessing,
    processingPhase: printProcessingPhase,
    parsedData: printParsedData,
    imagePreview: printImagePreview,
    fieldsNeedingReview: printFieldsNeedingReview,
    pendingData: printPendingData,
    processImage: processPrintImage,
    processFromClipboard: processPrintClipboard,
    clearParsedData: clearPrintData,
    applyParsedData: applyPrintData,
    resolveMarketForSport: resolvePrintMarket
  } = useImportBetPrint();

  // Track if mercado/selecao came from print or edit (to bypass dependencies)
  const [mercadoFromPrint, setMercadoFromPrint] = useState(false);
  const [mercadoFromEdit, setMercadoFromEdit] = useState(false);
  const [selecaoFromPrint, setSelecaoFromPrint] = useState(false);
  // Store pending market intention for later resolution
  const [pendingMercadoIntencao, setPendingMercadoIntencao] = useState<string | null>(null);

  // Handle paste for importing prints (Ctrl+V)
  const handlePaste = useCallback((event: ClipboardEvent) => {
   console.error("🚨🚨🚨 [ApostaDialog] PASTE CAPTURADO!", { 
     open, 
     aposta: !!aposta,
     timestamp: new Date().toISOString(),
     clipboardData: !!event.clipboardData,
     itemsLength: event.clipboardData?.items?.length || 0
   });
    if (!open || aposta) return; // Only for new bets
   console.error("🚨🚨🚨 [ApostaDialog] PASSOU VALIDAÇÃO → Chamando processPrintClipboard");
    processPrintClipboard(event);
  }, [open, aposta, processPrintClipboard]);

  useEffect(() => {
   console.error("🚨🚨🚨 [ApostaDialog] useEffect[paste listener]", { 
     open, 
     aposta: !!aposta, 
     shouldRegister: open && !aposta,
     timestamp: new Date().toISOString()
   });
   
    if (open && !aposta) {
     console.error("🚨🚨🚨 [ApostaDialog] ✅ REGISTRANDO listener no document");
     
     // Test: Log when ANY paste happens on the document
     const testListener = (e: Event) => {
       console.error("🚨🚨🚨 [ApostaDialog] PASTE DETECTADO NO DOCUMENT!", {
         target: (e.target as HTMLElement)?.tagName,
         timestamp: new Date().toISOString()
       });
     };
     
     document.addEventListener("paste", testListener);
      document.addEventListener("paste", handlePaste);
     
     console.error("🚨🚨🚨 [ApostaDialog] ✅ Listeners registrados. Teste colando agora (Ctrl+V)");
     
     return () => {
       console.error("🚨🚨🚨 [ApostaDialog] ❌ REMOVENDO listeners");
       document.removeEventListener("paste", testListener);
       document.removeEventListener("paste", handlePaste);
     };
    }
  }, [open, aposta, handlePaste]);

  // Handle drag and drop for importing prints
  const handleDragOver = useCallback((event: React.DragEvent) => {
    if (aposta) return;
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }, [aposta]);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    
    if (aposta) return; // Only for new bets

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith("image/")) {
        processPrintImage(file);
      }
    }
  }, [aposta, processPrintImage]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processPrintImage(file);
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Tipo de aposta (aba)
  const [tipoAposta, setTipoAposta] = useState<"bookmaker" | "exchange">("bookmaker");

  // Campos comuns
  const [dataAposta, setDataAposta] = useState("");
  const [esporte, setEsporte] = useState("");
  const [evento, setEvento] = useState(""); // Campo unificado (antes era mandante x visitante)
  const [mercado, setMercado] = useState("");
  const [selecao, setSelecao] = useState("");
  const [odd, setOdd] = useState("");
  const [stake, setStake] = useState("");
  const [statusResultado, setStatusResultado] = useState("PENDENTE");
  const [valorRetorno, setValorRetorno] = useState("");
  const [observacoes, setObservacoes] = useState("");

  // Check if current mercado is Moneyline (uses select instead of free text)
  const isMoneyline = isMoneylineMercado(mercado);

  // Get Moneyline options for current sport/evento - NEVER inject OCR values
  const moneylineOptions = isMoneyline ? getMoneylineSelecoes(esporte, evento) : [];

  // Effective selection (always the selecao state now)
  const effectiveSelecao = selecao;

  // Bookmaker mode
  const [bookmakerId, setBookmakerId] = useState("");
  
  // Saldo com reservas em tempo real (exclui nossa própria sessão)
  const {
    saldo: saldoComReservas,
    loading: saldoReservasLoading,
    refetch: refetchSaldoReservas
  } = useBookmakerSaldoComReservas(
    bookmakerId || null,
    workspaceId || '',
    stakeSessionId,
    open && !!workspaceId && !!bookmakerId
  );
  
  const [modoBackLay, setModoBackLay] = useState(false);
  const [layExchange, setLayExchange] = useState("");
  const [layOdd, setLayOdd] = useState("");
  const [layComissao, setLayComissao] = useState("5");

  // Exchange mode - novo modelo com 3 tipos de operação
  const [tipoOperacaoExchange, setTipoOperacaoExchange] = useState<"back" | "lay" | "cobertura">("back");
  const [exchangeBookmakerId, setExchangeBookmakerId] = useState("");
  const [exchangeOdd, setExchangeOdd] = useState("");
  const [exchangeStake, setExchangeStake] = useState("");
  const [exchangeComissao, setExchangeComissao] = useState("5");
  
  // Valores calculados para Exchange (Back/Lay simples)
  const [exchangeLucroPotencial, setExchangeLucroPotencial] = useState<number | null>(null);
  const [exchangeRetornoTotal, setExchangeRetornoTotal] = useState<number | null>(null);
  const [exchangeLiability, setExchangeLiability] = useState<number | null>(null);
  const [exchangePrejuizo, setExchangePrejuizo] = useState<number | null>(null);
  
  // Cobertura Lay (Back em bookmaker + Lay em exchange)
  const [coberturaBackBookmakerId, setCoberturaBackBookmakerId] = useState("");
  const [coberturaBackOdd, setCoberturaBackOdd] = useState("");
  const [coberturaBackStake, setCoberturaBackStake] = useState("");
  const [coberturaLayBookmakerId, setCoberturaLayBookmakerId] = useState("");
  const [coberturaLayOdd, setCoberturaLayOdd] = useState("");
  const [coberturaLayComissao, setCoberturaLayComissao] = useState("5");
  
  // Tipo de aposta Back (Normal, Freebet SNR, Freebet SR) - para Cobertura
  const [tipoApostaBack, setTipoApostaBack] = useState<"normal" | "freebet_snr" | "freebet_sr">("normal");
  
  // Toggle simples: Usar Freebet nesta aposta? (Bookmaker simples)
  const [usarFreebetBookmaker, setUsarFreebetBookmaker] = useState(false);
  
  // Tipo de aposta para Exchange Back (Normal, Freebet SNR, Freebet SR)
  const [tipoApostaExchangeBack, setTipoApostaExchangeBack] = useState<"normal" | "freebet_snr" | "freebet_sr">("normal");
  
  // Saldos das casas selecionadas (incluindo saldo de freebet e bônus)
  const [bookmakerSaldo, setBookmakerSaldo] = useState<{ saldo: number; saldoDisponivel: number; saldoFreebet: number; saldoBonus: number; saldoOperavel: number; moeda: string; bonusRolloverStarted: boolean } | null>(null);
  const [coberturaBackSaldo, setCoberturaBackSaldo] = useState<{ saldo: number; saldoDisponivel: number; saldoFreebet: number; saldoBonus: number; saldoOperavel: number; moeda: string; bonusRolloverStarted: boolean } | null>(null);
  const [coberturaLaySaldo, setCoberturaLaySaldo] = useState<{ saldo: number; saldoDisponivel: number; saldoFreebet: number; saldoBonus: number; saldoOperavel: number; moeda: string; bonusRolloverStarted: boolean } | null>(null);
  const [exchangeBookmakerSaldo, setExchangeBookmakerSaldo] = useState<{ saldo: number; saldoDisponivel: number; saldoFreebet: number; saldoBonus: number; saldoOperavel: number; moeda: string; bonusRolloverStarted: boolean } | null>(null);
  
  // Valores calculados para Cobertura
  const [coberturaLayStake, setCoberturaLayStake] = useState<number | null>(null);
  const [coberturaResponsabilidade, setCoberturaResponsabilidade] = useState<number | null>(null);
  const [coberturaLucroBack, setCoberturaLucroBack] = useState<number | null>(null);
  const [coberturaLucroLay, setCoberturaLucroLay] = useState<number | null>(null);
  const [coberturaLucroGarantido, setCoberturaLucroGarantido] = useState<number | null>(null);
  const [coberturaTaxaExtracao, setCoberturaTaxaExtracao] = useState<number | null>(null);

  // Freebet tracking - geral
  const [gerouFreebet, setGerouFreebet] = useState(false);
  const [valorFreebetGerada, setValorFreebetGerada] = useState("");
  
  // Freebet tracking - específico para Cobertura (Back e Lay separados)
  const [gerouFreebetBack, setGerouFreebetBack] = useState(false);
  const [valorFreebetGeradaBack, setValorFreebetGeradaBack] = useState("");
  const [gerouFreebetLay, setGerouFreebetLay] = useState(false);
  const [valorFreebetGeradaLay, setValorFreebetGeradaLay] = useState("");

  // Registro de Aposta - Campos EXPLÍCITOS (Prompt Oficial)
  // CRÍTICO: forma_registro é SEMPRE 'SIMPLES' para este formulário
  // NOVO: fonte_saldo é a VERDADE FINANCEIRA - qual pool de capital é usado
  const [registroValues, setRegistroValues] = useState<RegistroApostaValues>({
    forma_registro: 'SIMPLES',
    estrategia: null,
    contexto_operacional: null,
    fonte_saldo: null, // Será sincronizado pelo useEffect abaixo
  });

  // Hook para verificar bônus ativo na bookmaker selecionada (alerta contextual)
  const { hasActiveBonus, bonusInfo } = useActiveBonusInfo(projetoId, bookmakerId || null);

  // Calculated values
  const [layStake, setLayStake] = useState<number | null>(null);
  const [layLiability, setLayLiability] = useState<number | null>(null);

  // Get available markets - include print/edit market if not in list
  const baseMercados = esporte ? MERCADOS_POR_ESPORTE[esporte] || MERCADOS_POR_ESPORTE["Outro"] : [];
  const mercadosDisponiveis = (mercadoFromPrint || mercadoFromEdit) && mercado && !baseMercados.includes(mercado)
    ? [mercado, ...baseMercados]
    : baseMercados;

  // Apply parsed data from print when available - ALWAYS fill, even with low confidence
  useEffect(() => {
    if (printParsedData && !aposta) {
      const data = applyPrintData();
      
      // Preencher evento unificado
      if (data.evento) setEvento(data.evento.toUpperCase());
      if (data.dataHora) setDataAposta(data.dataHora);
      
      // Set esporte first (market depends on it for options, but we decouple for print)
      if (data.esporte) setEsporte(data.esporte);
      
      // Store market intention for resolution when options load
      if (printPendingData.mercadoIntencao || printPendingData.mercadoRaw) {
        setPendingMercadoIntencao(printPendingData.mercadoIntencao || printPendingData.mercadoRaw);
        setMercadoFromPrint(true);
      }
      
      // Try to set mercado directly if it matches an option
      if (data.mercado) {
        setMercado(data.mercado);
        setMercadoFromPrint(true);
      }
      
      // Store OCR selecao for later matching (will be resolved when evento/mercado are set)
      if (data.selecao) {
        // Store the raw OCR value temporarily - will be matched against options later
        setSelecao(data.selecao);
        setSelecaoFromPrint(true);
      }
      
      // NEW: Fill ODD and Stake from print if detected
      // These values are editable and won't be overwritten without user action
      if (data.odd) {
        setOdd(data.odd);
      }
      if (data.stake) {
        setStake(data.stake);
      }
    }
  }, [printParsedData, aposta, applyPrintData, printPendingData]);

  // Resolve pending market when sport changes or options become available
  useEffect(() => {
    if (pendingMercadoIntencao && esporte && mercadoFromPrint) {
      // Get the available markets for this sport
      const sportMarkets = MERCADOS_POR_ESPORTE[esporte] || MERCADOS_POR_ESPORTE["Outro"];
      
      // Try to resolve the market to an available option
      const resolved = resolvePrintMarket(esporte, sportMarkets);
      
      if (resolved && sportMarkets.includes(resolved)) {
        setMercado(resolved);
        // Don't clear pendingMercadoIntencao in case user changes sport
      } else if (resolved) {
        // Set the resolved value even if not in list (will show as custom option)
        setMercado(resolved);
      }
    }
  }, [pendingMercadoIntencao, esporte, mercadoFromPrint, resolvePrintMarket]);

  // Match OCR selection with available options when they become available
  useEffect(() => {
    // Only run for OCR-imported selections in moneyline markets
    if (!selecaoFromPrint || !selecao || !isMoneyline || !evento) return;
    
    // Check if current selection is already a valid option
    if (moneylineOptions.includes(selecao)) return;
    
    // Try to match the OCR selection with available options
    const matchedOption = matchSelecaoWithOptions(moneylineOptions, selecao);
    
    if (matchedOption) {
      // Found a match - update to the canonical option value
      setSelecao(matchedOption);
    }
    // IMPORTANT: If no match found, KEEP the OCR value instead of clearing
    // The user can see what OCR detected and manually adjust if needed
    // This matches the behavior of SurebetDialogTable which preserves OCR values
  }, [selecaoFromPrint, selecao, isMoneyline, evento, esporte, mercado, moneylineOptions]);

  useEffect(() => {
    if (open) {
      // Bookmakers são carregados via useBookmakerSaldosQuery automaticamente
      if (aposta) {
        setDataAposta(aposta.data_aposta.slice(0, 16));
        setEsporte(aposta.esporte);
        // Usar evento direto (campo já unificado no banco)
        setEvento(aposta.evento || "");
        setOdd(aposta.odd?.toString() || "");
        setStake(aposta.stake?.toString() || "");
        setStatusResultado(aposta.resultado || aposta.status);
        setValorRetorno(aposta.valor_retorno?.toString() || "");
        setObservacoes(aposta.observacoes || "");

        // Parse handicap selection if applicable
        const savedMercado = aposta.mercado || "";
        const savedSelecao = aposta.selecao || "";
        
        // Set mercado and selecao (include in available list)
        setMercado(savedMercado);
        setSelecao(savedSelecao);
        if (savedMercado) {
          setMercadoFromEdit(true);
        }

        // Determinar tipo de aposta baseado nos dados salvos
        if (aposta.modo_entrada === "EXCHANGE" || aposta.back_em_exchange) {
          // Exchange mode
          setTipoAposta("exchange");
          
          // Detectar Cobertura: modo EXCHANGE + tem lay_exchange + tem lay_odd
          // Isso indica que é uma operação de cobertura (Back + Lay simultâneos)
          const isCobertura = aposta.modo_entrada === "EXCHANGE" && 
                              aposta.lay_exchange && 
                              aposta.lay_odd !== null && 
                              aposta.lay_odd !== undefined;
          
          if (isCobertura) {
            setTipoOperacaoExchange("cobertura");
            setCoberturaBackBookmakerId(aposta.bookmaker_id || "");
            setCoberturaBackOdd(aposta.odd?.toString() || "");
            setCoberturaBackStake(aposta.stake?.toString() || "");
            setCoberturaLayBookmakerId(aposta.lay_exchange || "");
            setCoberturaLayOdd(aposta.lay_odd?.toString() || "");
            setCoberturaLayComissao(aposta.lay_comissao?.toString() || "5");
            // Restaurar tipo de freebet da aposta salva
            const tipoFreebet = aposta.tipo_freebet as string | null;
            if (tipoFreebet === "freebet_snr") {
              setTipoApostaBack("freebet_snr");
            } else if (tipoFreebet === "freebet_sr") {
              setTipoApostaBack("freebet_sr");
            } else {
              setTipoApostaBack("normal");
            }
            // Restaurar Gerou Freebet Back/Lay a partir das observações
            const obs = aposta.observacoes || "";
            const fbBackMatch = obs.match(/FB BACK:\s*([\d.]+)/);
            const fbLayMatch = obs.match(/FB LAY:\s*([\d.]+)/);
            if (fbBackMatch) {
              setGerouFreebetBack(true);
              setValorFreebetGeradaBack(fbBackMatch[1]);
            }
            if (fbLayMatch) {
              setGerouFreebetLay(true);
              setValorFreebetGeradaLay(fbLayMatch[1]);
            }
          } else if (aposta.estrategia === "EXCHANGE_LAY" || 
                     (aposta.lay_odd && !aposta.lay_exchange && aposta.modo_entrada === "EXCHANGE")) {
            // Lay simples: tem lay_odd mas não tem lay_exchange (exchange de destino)
            setTipoOperacaoExchange("lay");
            setExchangeOdd(aposta.lay_odd?.toString() || aposta.odd?.toString() || "");
            setExchangeStake(aposta.lay_stake?.toString() || aposta.stake?.toString() || "");
            setExchangeLiability(aposta.lay_liability || null);
            setExchangeBookmakerId(aposta.bookmaker_id || "");
            setExchangeComissao(aposta.lay_comissao?.toString() || "5");
          } else {
            // Back simples em exchange
            setTipoOperacaoExchange("back");
            setExchangeOdd(aposta.odd?.toString() || "");
            setExchangeStake(aposta.stake?.toString() || "");
            setExchangeBookmakerId(aposta.bookmaker_id || "");
            setExchangeComissao(aposta.back_comissao?.toString() || "5");
            // Restaurar tipo de freebet para Exchange Back
            const tipoFreebet = aposta.tipo_freebet as string | null;
            if (tipoFreebet === "freebet_snr") {
              setTipoApostaExchangeBack("freebet_snr");
            } else if (tipoFreebet === "freebet_sr") {
              setTipoApostaExchangeBack("freebet_sr");
            } else {
              setTipoApostaExchangeBack("normal");
            }
          }
        } else if (aposta.modo_entrada === "LAYBACK") {
          // Legado: Bookmaker + Lay em exchange -> migrar para Cobertura
          setTipoAposta("exchange");
          setTipoOperacaoExchange("cobertura");
          setCoberturaBackBookmakerId(aposta.bookmaker_id);
          setCoberturaBackOdd(aposta.odd?.toString() || "");
          setCoberturaBackStake(aposta.stake?.toString() || "");
          setCoberturaLayBookmakerId(aposta.lay_exchange || "");
          setCoberturaLayOdd(aposta.lay_odd?.toString() || "");
          setCoberturaLayComissao(aposta.lay_comissao?.toString() || "5");
        } else {
          // Bookmaker simples
          setTipoAposta("bookmaker");
          setBookmakerId(aposta.bookmaker_id);
          setModoBackLay(false);
        }

        // Freebet tracking
        setGerouFreebet(aposta.gerou_freebet || false);
        setValorFreebetGerada(aposta.valor_freebet_gerada?.toString() || "");
        
        // Se a aposta usou freebet (bookmaker simples)
        if (aposta.tipo_freebet && aposta.tipo_freebet !== "normal" && aposta.modo_entrada === "PADRAO") {
          setUsarFreebetBookmaker(true);
        }
        
        // Restaurar campos de registro (estrategia, forma_registro, contexto_operacional, fonte_saldo)
        // CRÍTICO: forma_registro NUNCA pode ser null - usar 'SIMPLES' como fallback robusto
        // NOVO: fonte_saldo também precisa ser restaurado (default 'REAL' para dados legados)
        setRegistroValues({
          forma_registro: (aposta.forma_registro as FormaRegistro) || 'SIMPLES',
          estrategia: (aposta.estrategia as ApostaEstrategia) || null,
          contexto_operacional: (aposta.contexto_operacional as ContextoOperacional) || null,
          fonte_saldo: ((aposta as any).fonte_saldo as FonteSaldo) || 'REAL', // Legado: default REAL
        });
      } else {
        resetForm();
      }
    }
  }, [open, aposta]);

  // Sincronizar estratégia, contexto E fonte_saldo quando estão "travados" pela aba
  // CRÍTICO: Quando a aba define estratégia/contexto fixos (ex: bonus, freebets),
  // precisamos atualizar o registroValues automaticamente,
  // pois o Select no header é substituído por um Badge estático
  // NOVO: fonte_saldo também é sincronizado baseado na aba/estratégia
  useEffect(() => {
    if (!aposta && open) {
      const lockedEstrategia = isAbaEstrategiaFixa(activeTab) ? getEstrategiaFromTab(activeTab) : null;
      const lockedContexto = isAbaContextoFixo(activeTab) ? getContextoFromTab(activeTab) : null;
      
      // Inferir fonte_saldo baseado na aba ativa ou estratégia
      const inferredFonteSaldo = (() => {
        if (activeTab === 'freebets') return 'FREEBET' as FonteSaldo;
        if (activeTab === 'bonus' || activeTab === 'bonus-operacoes') return 'BONUS' as FonteSaldo;
        // Para outras abas, inferir da estratégia
        const estrategiaAtual = lockedEstrategia || registroValues.estrategia;
        if (estrategiaAtual === 'EXTRACAO_FREEBET') return 'FREEBET' as FonteSaldo;
        if (estrategiaAtual === 'EXTRACAO_BONUS') return 'BONUS' as FonteSaldo;
        return 'REAL' as FonteSaldo;
      })();
      
      setRegistroValues(prev => {
        const updates: Partial<typeof prev> = {};
        
        // Sincronizar estratégia se locked
        if (lockedEstrategia && prev.estrategia !== lockedEstrategia) {
          updates.estrategia = lockedEstrategia;
        }
        
        // Sincronizar contexto se locked (abas bonus/freebets)
        if (lockedContexto && prev.contexto_operacional !== lockedContexto) {
          updates.contexto_operacional = lockedContexto;
        }
        
        // Sincronizar fonte_saldo se não definido ou se aba tem fonte fixa
        if (!prev.fonte_saldo || (activeTab === 'freebets' || activeTab === 'bonus' || activeTab === 'bonus-operacoes')) {
          if (prev.fonte_saldo !== inferredFonteSaldo) {
            updates.fonte_saldo = inferredFonteSaldo;
          }
        }
        
        // Se há updates, aplicar
        if (Object.keys(updates).length > 0) {
          return { ...prev, ...updates };
        }
        return prev;
      });
    }
  }, [open, aposta, activeTab, registroValues.estrategia]);

  // Atualizar saldo quando bookmakerId mudar ou bookmakers forem carregados
  useEffect(() => {
    if (bookmakerId && bookmakers.length > 0) {
      const selectedBk = bookmakers.find(b => b.id === bookmakerId);
      if (selectedBk) {
        setBookmakerSaldo({ 
          saldo: selectedBk.saldo_total, 
          saldoDisponivel: selectedBk.saldo_disponivel, 
          saldoFreebet: selectedBk.saldo_freebet, 
          saldoBonus: selectedBk.saldo_bonus,
          saldoOperavel: selectedBk.saldo_operavel,
          moeda: selectedBk.moeda,
          bonusRolloverStarted: selectedBk.bonus_rollover_started || false
        });
      }
    }
  }, [bookmakerId, bookmakers]);

  // Atualizar saldo da casa para Exchange (Back/Lay)
  useEffect(() => {
    if (exchangeBookmakerId && bookmakers.length > 0) {
      const selectedBk = bookmakers.find(b => b.id === exchangeBookmakerId);
      if (selectedBk) {
        setExchangeBookmakerSaldo({ 
          saldo: selectedBk.saldo_total, 
          saldoDisponivel: selectedBk.saldo_disponivel, 
          saldoFreebet: selectedBk.saldo_freebet, 
          saldoBonus: selectedBk.saldo_bonus,
          saldoOperavel: selectedBk.saldo_operavel,
          moeda: selectedBk.moeda,
          bonusRolloverStarted: selectedBk.bonus_rollover_started || false
        });
      } else {
        setExchangeBookmakerSaldo(null);
      }
    }
  }, [exchangeBookmakerId, bookmakers]);

  useEffect(() => {
    if (!aposta && !mercadoFromPrint && !mercadoFromEdit) {
      setMercado("");
      setSelecao("");
    }
  }, [esporte]);

  // Reset selecao when mercado changes (only for new bets AND not from print)
  useEffect(() => {
    if (!aposta && !selecaoFromPrint) {
      setSelecao("");
    }
  }, [mercado, aposta, selecaoFromPrint]);

  // Calcular Lay Stake e Liability para modo Bookmaker + Lay
  useEffect(() => {
    if (tipoAposta === "bookmaker" && modoBackLay && stake && odd && layOdd) {
      const backStake = parseFloat(stake);
      const backOdd = parseFloat(odd);
      const layOddNum = parseFloat(layOdd);
      const comissao = parseFloat(layComissao) / 100;

      if (backStake > 0 && backOdd > 0 && layOddNum > 1) {
        const calculatedLayStake = (backStake * backOdd) / (layOddNum - comissao);
        const calculatedLiability = calculatedLayStake * (layOddNum - 1);
        setLayStake(Math.round(calculatedLayStake * 100) / 100);
        setLayLiability(Math.round(calculatedLiability * 100) / 100);
      } else {
        setLayStake(null);
        setLayLiability(null);
      }
    } else {
      setLayStake(null);
      setLayLiability(null);
    }
  }, [tipoAposta, modoBackLay, stake, odd, layOdd, layComissao]);

  // ========== SISTEMA DE RESERVA - DEBOUNCE E CLEANUP ==========
  const stakeReserveDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastBookmakerIdRef = useRef<string | null>(null);
  
  // Reservar stake com debounce quando usuário digita
  useEffect(() => {
    // Limpar debounce anterior
    if (stakeReserveDebounceRef.current) {
      clearTimeout(stakeReserveDebounceRef.current);
    }
    
    // Só reservar se: está aberto, não é edição, tem bookmaker, tem stake válido
    if (!open || aposta || !bookmakerId || !workspaceId) {
      return;
    }
    
    const stakeNum = parseFloat(stake);
    if (isNaN(stakeNum) || stakeNum <= 0) {
      // Cancelar reserva se stake zerado
      cancelReservation();
      return;
    }
    
    const selectedBk = bookmakers.find(b => b.id === bookmakerId);
    const moeda = selectedBk?.moeda || 'BRL';
    
    // Debounce de 500ms para não sobrecarregar
    stakeReserveDebounceRef.current = setTimeout(async () => {
      await reserveStake(bookmakerId, stakeNum, moeda);
      refetchSaldoReservas();
    }, 500);
    
    return () => {
      if (stakeReserveDebounceRef.current) {
        clearTimeout(stakeReserveDebounceRef.current);
      }
    };
  }, [stake, bookmakerId, open, aposta, workspaceId, reserveStake, cancelReservation, bookmakers, refetchSaldoReservas]);
  
  // Cancelar reserva quando bookmaker muda
  useEffect(() => {
    if (lastBookmakerIdRef.current && lastBookmakerIdRef.current !== bookmakerId) {
      cancelReservation();
    }
    lastBookmakerIdRef.current = bookmakerId;
  }, [bookmakerId, cancelReservation]);
  
  // Cancelar reserva quando fecha o dialog
  useEffect(() => {
    if (!open) {
      cancelReservation();
    }
  }, [open, cancelReservation]);
  
  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      if (stakeReserveDebounceRef.current) {
        clearTimeout(stakeReserveDebounceRef.current);
      }
    };
  }, []);

  // Cálculos para Exchange mode (novo modelo)
  useEffect(() => {
    if (tipoAposta !== "exchange") {
      setExchangeLucroPotencial(null);
      setExchangeRetornoTotal(null);
      setExchangeLiability(null);
      setExchangePrejuizo(null);
      return;
    }
    
    const oddNum = parseFloat(exchangeOdd);
    const stakeNum = parseFloat(exchangeStake);
    const comissao = parseFloat(exchangeComissao) / 100;
    
    if (isNaN(oddNum) || isNaN(stakeNum) || oddNum <= 1 || stakeNum <= 0) {
      setExchangeLucroPotencial(null);
      setExchangeRetornoTotal(null);
      setExchangeLiability(null);
      setExchangePrejuizo(null);
      return;
    }
    
    if (tipoOperacaoExchange === "back") {
      // Back: lucro = stake * (odd - 1) - comissão
      const lucroBruto = stakeNum * (oddNum - 1);
      const lucroLiquido = lucroBruto - (lucroBruto * comissao);
      const retorno = stakeNum + lucroLiquido;
      
      setExchangeLucroPotencial(Math.round(lucroLiquido * 100) / 100);
      setExchangeRetornoTotal(Math.round(retorno * 100) / 100);
      setExchangeLiability(null);
      setExchangePrejuizo(null);
    } else {
      // Lay: liability = stake * (odd - 1)
      const liability = stakeNum * (oddNum - 1);
      const lucroSeGanhar = stakeNum - (stakeNum * comissao);
      
      setExchangeLiability(Math.round(liability * 100) / 100);
      setExchangeLucroPotencial(Math.round(lucroSeGanhar * 100) / 100);
      setExchangePrejuizo(Math.round(-liability * 100) / 100);
      setExchangeRetornoTotal(null);
    }
  }, [tipoAposta, tipoOperacaoExchange, exchangeOdd, exchangeStake, exchangeComissao]);

  // Cálculos para Cobertura Lay (com suporte a Freebet)
  useEffect(() => {
    if (tipoAposta !== "exchange" || tipoOperacaoExchange !== "cobertura") {
      setCoberturaLayStake(null);
      setCoberturaResponsabilidade(null);
      setCoberturaLucroBack(null);
      setCoberturaLucroLay(null);
      setCoberturaLucroGarantido(null);
      setCoberturaTaxaExtracao(null);
      return;
    }
    
    const backOdd = parseFloat(coberturaBackOdd);
    const backStake = parseFloat(coberturaBackStake);
    const layOdd = parseFloat(coberturaLayOdd);
    const comissao = parseFloat(coberturaLayComissao) / 100;
    
    if (isNaN(backOdd) || isNaN(backStake) || isNaN(layOdd) || 
        backOdd <= 1 || backStake <= 0 || layOdd <= 1) {
      setCoberturaLayStake(null);
      setCoberturaResponsabilidade(null);
      setCoberturaLucroBack(null);
      setCoberturaLucroLay(null);
      setCoberturaLucroGarantido(null);
      setCoberturaTaxaExtracao(null);
      return;
    }
    
    const oddLayAjustada = layOdd - comissao;
    let stakeLay: number;
    let lucroSeBackGanhar: number;
    let lucroSeLayGanhar: number;
    
    if (tipoApostaBack === "freebet_snr") {
      // Free Bet SNR (Stake Not Returned): usa (oddBack - 1) porque stake não volta
      // A freebet só retorna o lucro, não a stake
      stakeLay = (backStake * (backOdd - 1)) / oddLayAjustada;
      
      // Responsabilidade = Stake Lay × (Odd Lay - 1)
      const responsabilidade = stakeLay * (layOdd - 1);
      
      // Lucro se Back ganhar = Lucro da Freebet - Responsabilidade (pagamos ao lay)
      // Freebet retorna: backStake * (backOdd - 1) = lucro puro
      lucroSeBackGanhar = (backStake * (backOdd - 1)) - responsabilidade;
      
      // Lucro se Lay ganhar = Stake Lay líquido (ganhamos) - 0 (não perdemos a stake pois era free)
      lucroSeLayGanhar = stakeLay * (1 - comissao);
      
      setCoberturaResponsabilidade(Math.round(responsabilidade * 100) / 100);
    } else if (tipoApostaBack === "freebet_sr") {
      // Free Bet SR (Stake Returned): comportamento igual aposta normal
      stakeLay = (backStake * backOdd) / oddLayAjustada;
      const responsabilidade = stakeLay * (layOdd - 1);
      lucroSeBackGanhar = (backStake * (backOdd - 1)) - responsabilidade;
      lucroSeLayGanhar = (stakeLay * (1 - comissao)) - backStake;
      setCoberturaResponsabilidade(Math.round(responsabilidade * 100) / 100);
    } else {
      // Normal (Qualifying Bet)
      stakeLay = (backStake * backOdd) / oddLayAjustada;
      const responsabilidade = stakeLay * (layOdd - 1);
      lucroSeBackGanhar = (backStake * (backOdd - 1)) - responsabilidade;
      lucroSeLayGanhar = (stakeLay * (1 - comissao)) - backStake;
      setCoberturaResponsabilidade(Math.round(responsabilidade * 100) / 100);
    }
    
    // Lucro garantido = mínimo dos dois (devem ser próximos se odds corretas)
    const lucroGarantido = Math.min(lucroSeBackGanhar, lucroSeLayGanhar);
    
    // Taxa de extração = Lucro Garantido ÷ Valor da Freebet × 100
    const taxaExtracao = (lucroGarantido / backStake) * 100;
    
    setCoberturaLayStake(Math.round(stakeLay * 100) / 100);
    setCoberturaLucroBack(Math.round(lucroSeBackGanhar * 100) / 100);
    setCoberturaLucroLay(Math.round(lucroSeLayGanhar * 100) / 100);
    setCoberturaLucroGarantido(Math.round(lucroGarantido * 100) / 100);
    setCoberturaTaxaExtracao(Math.round(taxaExtracao * 100) / 100);
  }, [tipoAposta, tipoOperacaoExchange, coberturaBackOdd, coberturaBackStake, coberturaLayOdd, coberturaLayComissao, tipoApostaBack]);

  const getLocalDateTimeString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const resetForm = () => {
    setTipoAposta("bookmaker");
    setDataAposta(getLocalDateTimeString());
    setEsporte("");
    setEvento(""); // Campo unificado
    setMercado("");
    setSelecao("");
    setOdd("");
    setStake("");
    setStatusResultado("PENDENTE");
    setValorRetorno("");
    setObservacoes("");
    setBookmakerId("");
    setBookmakerSaldo(null);
    setExchangeBookmakerSaldo(null);
    setModoBackLay(false);
    setLayExchange("");
    setLayOdd("");
    setLayComissao("5");
    // Exchange mode
    setTipoOperacaoExchange("back");
    setExchangeBookmakerId("");
    setExchangeOdd("");
    setExchangeStake("");
    setExchangeComissao("5");
    setExchangeLucroPotencial(null);
    setExchangeRetornoTotal(null);
    setExchangeLiability(null);
    setExchangePrejuizo(null);
    setLayStake(null);
    setLayLiability(null);
    // Cobertura mode
    setCoberturaBackBookmakerId("");
    setCoberturaBackOdd("");
    setCoberturaBackStake("");
    setCoberturaLayBookmakerId("");
    setCoberturaLayOdd("");
    setCoberturaLayComissao("5");
    setCoberturaBackSaldo(null);
    setCoberturaLaySaldo(null);
    setCoberturaLayStake(null);
    setCoberturaResponsabilidade(null);
    setCoberturaLucroBack(null);
    setCoberturaLucroLay(null);
    setCoberturaLucroGarantido(null);
    setCoberturaTaxaExtracao(null);
    setTipoApostaBack("normal");
    setUsarFreebetBookmaker(false);
    setTipoApostaExchangeBack("normal");
    setGerouFreebet(false);
    setValorFreebetGerada("");
    setGerouFreebetBack(false);
    setValorFreebetGeradaBack("");
    setGerouFreebetLay(false);
    setValorFreebetGeradaLay("");
    // Reset registro values - forma_registro sempre SIMPLES neste form
    // NOVO: fonte_saldo também é resetado (será sincronizado pelo useEffect)
    setRegistroValues({
      forma_registro: 'SIMPLES',
      estrategia: null,
      contexto_operacional: null,
      fonte_saldo: null, // Será inferido automaticamente baseado na aba/estratégia
    });
    // Clear print import data
    clearPrintData();
    setMercadoFromPrint(false);
    setMercadoFromEdit(false);
    setSelecaoFromPrint(false);
  };

  // fetchBookmakers REMOVIDO - agora usa useBookmakerSaldosQuery como fonte canônica

  const calculateLucroPrejuizo = () => {
    const stakeNum = parseFloat(stake) || 0;
    const oddNum = parseFloat(odd) || 0;

    // Cálculo de lucro/prejuízo por tipo de resultado:
    // GREEN: lucro completo = stake * (odd - 1)
    // RED: perda completa = -stake
    // MEIO_GREEN: 50% do lucro potencial = stake * (odd - 1) / 2
    // MEIO_RED: 50% da perda = -stake / 2
    // VOID: 0 (stake devolvida)
    // HALF: (legado) tratado como MEIO_GREEN
    switch (statusResultado) {
      case "GREEN":
        return stakeNum * (oddNum - 1);
      case "RED":
        return -stakeNum;
      case "MEIO_GREEN":
        return stakeNum * (oddNum - 1) / 2;
      case "MEIO_RED":
        return -stakeNum / 2;
      case "VOID":
        return 0;
      case "HALF":
        // Legado: tratar HALF como MEIO_GREEN
        return stakeNum * (oddNum - 1) / 2;
      default:
        return null;
    }
  };

  const calculateValorRetorno = () => {
    const stakeNum = parseFloat(stake) || 0;
    const oddNum = parseFloat(odd) || 0;

    // Cálculo de valor de retorno por tipo de resultado:
    // GREEN: stake * odd (stake + lucro completo)
    // RED: 0 (tudo perdido)
    // MEIO_GREEN: stake + (stake * (odd - 1) / 2)
    // MEIO_RED: stake / 2 (metade da stake devolvida)
    // VOID: stake (stake devolvida integralmente)
    // HALF: (legado) tratado como MEIO_GREEN
    switch (statusResultado) {
      case "GREEN":
        return stakeNum * oddNum;
      case "RED":
        return 0;
      case "MEIO_GREEN":
        return stakeNum + (stakeNum * (oddNum - 1) / 2);
      case "MEIO_RED":
        return stakeNum / 2;
      case "VOID":
        return stakeNum;
      case "HALF":
        // Legado: tratar HALF como MEIO_GREEN
        return stakeNum + (stakeNum * (oddNum - 1) / 2);
      default:
        return null;
    }
  };

  const getSelectedBookmakerMoeda = () => {
    const selected = bookmakers.find(b => b.id === bookmakerId);
    return selected?.moeda || "BRL";
  };

  // Usar função canônica do componente centralizado
  const formatCurrencyWithSymbol = formatCurrencyCanonical;

  const handleSave = async () => {
    // Validação de campos de registro obrigatórios (Prompt Oficial)
    const registroValidation = validateRegistroAposta(registroValues);
    if (!registroValidation.valid) {
      toast.error(registroValidation.errors[0] || "Preencha todos os campos de registro obrigatórios");
      return;
    }

    // Validações básicas comuns a todos os modos
    if (!esporte || !mercado) {
      toast.error("Preencha Esporte e Mercado (obrigatórios)");
      return;
    }
    if (!evento) {
      toast.error("Preencha os times/evento");
      return;
    }

    // Validação específica por modo de entrada
    if (tipoAposta === "bookmaker") {
      // Modo Bookmaker: exige odd, stake e bookmaker
      if (!odd || !stake) {
        toast.error("Preencha Odd e Stake");
        return;
      }
      
      const oddNum = parseFloat(odd);
      if (isNaN(oddNum) || oddNum <= 1) {
        toast.error("Odd deve ser maior que 1.00");
        return;
      }

      const stakeNum = parseFloat(stake);
      if (isNaN(stakeNum) || stakeNum <= 0) {
        toast.error("Stake deve ser maior que 0");
        return;
      }

      if (!bookmakerId) {
        toast.error("Selecione a bookmaker");
        return;
      }

      // Validar stake vs saldo operável da bookmaker (real + freebet + bonus)
      const selectedBookmaker = bookmakers.find(b => b.id === bookmakerId);
      if (selectedBookmaker) {
        const stakeAnterior = aposta?.status === "PENDENTE" ? aposta.stake : 0;
        const saldoOperavelParaValidar = selectedBookmaker.saldo_operavel + stakeAnterior;
        
        if (stakeNum > saldoOperavelParaValidar) {
          const moeda = selectedBookmaker.moeda;
          toast.error(`Stake (${formatCurrencyWithSymbol(stakeNum, moeda)}) maior que o saldo operável (${formatCurrencyWithSymbol(saldoOperavelParaValidar, moeda)})`);
          return;
        }
      }
    } else if (tipoAposta === "exchange") {
      // Modo Exchange
      if (tipoOperacaoExchange === "back" || tipoOperacaoExchange === "lay") {
        // Exchange simples (Back ou Lay)
        if (!exchangeBookmakerId || !exchangeOdd || !exchangeStake) {
          toast.error("Preencha todos os campos da Exchange (Exchange, Odd, Stake)");
          return;
        }
        
        const oddNum = parseFloat(exchangeOdd);
        if (isNaN(oddNum) || oddNum <= 1) {
          toast.error("Odd deve ser maior que 1.00");
          return;
        }

        const stakeNum = parseFloat(exchangeStake);
        if (isNaN(stakeNum) || stakeNum <= 0) {
          toast.error("Stake deve ser maior que 0");
          return;
        }

        // Validação para Exchange Back com Freebet
        if (tipoOperacaoExchange === "back" && tipoApostaExchangeBack !== "normal") {
          const selectedBk = bookmakers.find(b => b.id === exchangeBookmakerId);
          if (selectedBk && stakeNum > selectedBk.saldo_freebet) {
            toast.error(`Stake da Freebet (${formatCurrencyWithSymbol(stakeNum, selectedBk.moeda)}) maior que o saldo de Freebet disponível (${formatCurrencyWithSymbol(selectedBk.saldo_freebet, selectedBk.moeda)})`);
            return;
          }
        }

        // Validação para Lay: responsabilidade não pode ser maior que saldo disponível
        if (tipoOperacaoExchange === "lay" && exchangeLiability !== null) {
          const selectedBk = bookmakers.find(b => b.id === exchangeBookmakerId);
          if (selectedBk) {
            const liabilityAnterior = aposta?.status === "PENDENTE" && aposta?.lay_liability ? aposta.lay_liability : 0;
            const saldoDisponivel = selectedBk.saldo_disponivel + liabilityAnterior;
            
            if (exchangeLiability > saldoDisponivel) {
              toast.error(
                `Responsabilidade (${formatCurrencyWithSymbol(exchangeLiability, selectedBk.moeda)}) maior que o saldo disponível (${formatCurrencyWithSymbol(saldoDisponivel, selectedBk.moeda)}). Necessário: ${formatCurrencyWithSymbol(exchangeLiability - saldoDisponivel, selectedBk.moeda)} adicional.`
              );
              return;
            }
          }
        }
      } else if (tipoOperacaoExchange === "cobertura") {
        // Cobertura Lay
        if (!coberturaBackBookmakerId || !coberturaBackOdd || !coberturaBackStake || 
            !coberturaLayBookmakerId || !coberturaLayOdd) {
          toast.error("Preencha todos os campos da Cobertura (Bookmaker, Odd Back, Stake Back, Exchange, Odd Lay)");
          return;
        }

        const backOddNum = parseFloat(coberturaBackOdd);
        if (isNaN(backOddNum) || backOddNum <= 1) {
          toast.error("Odd Back deve ser maior que 1.00");
          return;
        }

        const backStakeNum = parseFloat(coberturaBackStake);
        if (isNaN(backStakeNum) || backStakeNum <= 0) {
          toast.error("Stake Back deve ser maior que 0");
          return;
        }

        const layOddNum = parseFloat(coberturaLayOdd);
        if (isNaN(layOddNum) || layOddNum <= 1) {
          toast.error("Odd Lay deve ser maior que 1.00");
          return;
        }

        // Validação para Cobertura Lay: responsabilidade não pode ser maior que saldo disponível
        if (coberturaResponsabilidade !== null && coberturaLayBookmakerId) {
          const selectedBk = bookmakers.find(b => b.id === coberturaLayBookmakerId);
          if (selectedBk) {
            const liabilityAnterior = aposta?.status === "PENDENTE" && aposta?.lay_liability ? aposta.lay_liability : 0;
            const saldoDisponivel = selectedBk.saldo_disponivel + liabilityAnterior;
            
            if (coberturaResponsabilidade > saldoDisponivel) {
              toast.error(
                `Responsabilidade (${formatCurrencyWithSymbol(coberturaResponsabilidade, selectedBk.moeda)}) maior que o saldo disponível (${formatCurrencyWithSymbol(saldoDisponivel, selectedBk.moeda)}). Necessário: ${formatCurrencyWithSymbol(coberturaResponsabilidade - saldoDisponivel, selectedBk.moeda)} adicional.`
              );
              return;
            }
          }
        }

        // Validação para uso de Freebet: verificar saldo disponível
        if (tipoApostaBack !== "normal" && coberturaBackBookmakerId) {
          const backStakeNum = parseFloat(coberturaBackStake);
          const selectedBk = bookmakers.find(b => b.id === coberturaBackBookmakerId);
          if (selectedBk && backStakeNum > selectedBk.saldo_freebet) {
            toast.error(
              `Stake da Freebet (${formatCurrencyWithSymbol(backStakeNum, selectedBk.moeda)}) maior que o saldo de Freebet disponível (${formatCurrencyWithSymbol(selectedBk.saldo_freebet, selectedBk.moeda)})`
            );
            return;
          }
        }
      }
    }

    try {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        toast.error("Usuário não autenticado");
        return;
      }

      // Calcular P/L baseado no tipo de operação (separados completamente)
      let lucroPrejuizo: number | null = null;
      let valorRetornoCalculado: number | null = null;
      let apostaData: any;

      // Dados comuns a todos os tipos
      if (!workspaceId) {
        toast.error("Workspace não identificado. Tente recarregar a página.");
        return;
      }
      
      // CRÍTICO: Obter moeda da bookmaker selecionada para evitar conversão incorreta
      // A moeda_operacao DEVE refletir a moeda nativa da casa de apostas
      const selectedBookmakerId = tipoAposta === "bookmaker" 
        ? bookmakerId 
        : (tipoOperacaoExchange === "cobertura" ? coberturaBackBookmakerId : exchangeBookmakerId);
      const selectedBookmaker = bookmakers.find(bk => bk.id === selectedBookmakerId);
      const moedaOperacao = selectedBookmaker?.moeda || "BRL";

      const commonData = {
        user_id: userData.user.id,
        workspace_id: workspaceId,
        projeto_id: projetoId,
        data_aposta: toLocalTimestamp(dataAposta),
        esporte,
        evento,
        mercado: mercado || null,
        selecao: effectiveSelecao,
        // CORREÇÃO CRÍTICA: Sempre inserir como PENDENTE
        // A RPC liquidar_aposta_atomica irá:
        // 1. Atualizar status para LIQUIDADA
        // 2. Inserir entrada no cash_ledger
        // 3. Trigger atualiza saldo automaticamente
        // Se inserirmos direto como LIQUIDADA, a RPC aborta e o ledger fica vazio!
        status: "PENDENTE",
        resultado: null,
        observacoes: observacoes || null,
        gerou_freebet: gerouFreebet,
        valor_freebet_gerada: gerouFreebet && valorFreebetGerada ? parseFloat(valorFreebetGerada) : null,
        // Campos explícitos do Prompt Oficial - NUNCA inferidos
        estrategia: registroValues.estrategia,
        forma_registro: registroValues.forma_registro,
        // NOVA ARQUITETURA: contexto_operacional é DEPRECATED, sempre NORMAL
        contexto_operacional: 'NORMAL',
        // VERDADE FINANCEIRA: usar_freebet toggle determina fonte de saldo
        fonte_saldo: usarFreebetBookmaker ? 'FREEBET' : 'REAL',
        usar_freebet: usarFreebetBookmaker,
        // CRÍTICO: Moeda da operação = moeda nativa da bookmaker
        moeda_operacao: moedaOperacao,
      };

      if (tipoAposta === "bookmaker") {
        // ===== MODO BOOKMAKER =====
        // Usa campos odd, stake, bookmakerId exclusivos desta aba
        const bookmakerOdd = parseFloat(odd);
        const bookmakerStake = parseFloat(stake);
        
        // Calcular P/L para Bookmaker
        // IMPORTANTE: Se usa freebet, o tratamento é diferente:
        // - GREEN: lucro = stake * (odd - 1), mas stake não volta
        // - RED: prejuízo = 0 (freebet já foi consumida)
        if (statusResultado !== "PENDENTE") {
          if (usarFreebetBookmaker) {
            // Aposta com Freebet (tratamento SNR)
            switch (statusResultado) {
              case "GREEN":
                lucroPrejuizo = bookmakerStake * (bookmakerOdd - 1); // Só o lucro
                valorRetornoCalculado = bookmakerStake * (bookmakerOdd - 1); // Stake não volta
                break;
              case "RED":
                lucroPrejuizo = 0; // Freebet já consumida, não é prejuízo real
                valorRetornoCalculado = 0;
                break;
              case "MEIO_GREEN":
                lucroPrejuizo = bookmakerStake * (bookmakerOdd - 1) / 2;
                valorRetornoCalculado = lucroPrejuizo; // Stake não volta
                break;
              case "MEIO_RED":
                lucroPrejuizo = 0; // Freebet, sem prejuízo
                valorRetornoCalculado = 0;
                break;
              case "VOID":
                lucroPrejuizo = 0;
                valorRetornoCalculado = 0; // Freebet devolvida? Depende da casa
                break;
            }
          } else {
            // Aposta normal
            switch (statusResultado) {
              case "GREEN":
                lucroPrejuizo = bookmakerStake * (bookmakerOdd - 1);
                valorRetornoCalculado = bookmakerStake * bookmakerOdd;
                break;
              case "RED":
                lucroPrejuizo = -bookmakerStake;
                valorRetornoCalculado = 0;
                break;
              case "MEIO_GREEN":
                lucroPrejuizo = bookmakerStake * (bookmakerOdd - 1) / 2;
                valorRetornoCalculado = bookmakerStake + lucroPrejuizo;
                break;
              case "MEIO_RED":
                lucroPrejuizo = -bookmakerStake / 2;
                valorRetornoCalculado = bookmakerStake / 2;
                break;
              case "VOID":
                lucroPrejuizo = 0;
                valorRetornoCalculado = bookmakerStake;
                break;
            }
          }
        }

        apostaData = {
          ...commonData,
          bookmaker_id: bookmakerId,
          odd: bookmakerOdd,
          stake: bookmakerStake,
          modo_entrada: "PADRAO",
          valor_retorno: valorRetornoCalculado,
          lucro_prejuizo: lucroPrejuizo,
          lay_exchange: null,
          lay_odd: null,
          lay_stake: null,
          lay_liability: null,
          lay_comissao: null,
          back_em_exchange: false,
          back_comissao: null,
          tipo_freebet: usarFreebetBookmaker ? "freebet_snr" : null,
          // WATERFALL: Flag para indicar se freebet deve ser usado no waterfall
          usar_freebet: usarFreebetBookmaker,
        };
      } else if (tipoOperacaoExchange === "cobertura") {
        // ===== MODO COBERTURA LAY =====
        // Usa campos coberturaBack* e coberturaLay* exclusivos
        const backOdd = parseFloat(coberturaBackOdd);
        const backStake = parseFloat(coberturaBackStake);
        const layOdd = parseFloat(coberturaLayOdd);
        const comissao = parseFloat(coberturaLayComissao) / 100;
        
        // Calcular P/L para Cobertura baseado no resultado
        if (statusResultado !== "PENDENTE") {
          const oddLayAjustada = layOdd - comissao;
          let stakeLay: number;
          
          if (tipoApostaBack === "freebet_snr") {
            stakeLay = (backStake * (backOdd - 1)) / oddLayAjustada;
          } else {
            stakeLay = (backStake * backOdd) / oddLayAjustada;
          }
          
          const responsabilidade = stakeLay * (layOdd - 1);
          
          switch (statusResultado) {
            case "GREEN_BOOKMAKER":
              // Back ganhou: recebemos lucro do back, pagamos responsabilidade do lay
              if (tipoApostaBack === "freebet_snr") {
                lucroPrejuizo = (backStake * (backOdd - 1)) - responsabilidade;
                valorRetornoCalculado = backStake * (backOdd - 1); // Só lucro, stake não volta
              } else {
                lucroPrejuizo = (backStake * (backOdd - 1)) - responsabilidade;
                valorRetornoCalculado = backStake * backOdd - responsabilidade;
              }
              break;
            case "RED_BOOKMAKER":
              // Lay ganhou: ganhamos stake do lay menos comissão
              lucroPrejuizo = (stakeLay * (1 - comissao)) - (tipoApostaBack === "freebet_snr" ? 0 : backStake);
              valorRetornoCalculado = stakeLay * (1 - comissao);
              break;
            case "VOID":
              lucroPrejuizo = 0;
              valorRetornoCalculado = tipoApostaBack === "freebet_snr" ? 0 : backStake;
              break;
          }
        }

        // Para cobertura, combinar informações de freebet de ambos os lados
        const coberturaGerouFreebet = gerouFreebetBack || gerouFreebetLay;
        const coberturaValorFreebet = (gerouFreebetBack && valorFreebetGeradaBack ? parseFloat(valorFreebetGeradaBack) : 0) +
                                       (gerouFreebetLay && valorFreebetGeradaLay ? parseFloat(valorFreebetGeradaLay) : 0);
        
        // Adicionar info de qual lado gerou freebet nas observações (se houver)
        let obsCobertura = observacoes || "";
        if (gerouFreebetBack && valorFreebetGeradaBack) {
          obsCobertura += (obsCobertura ? " | " : "") + `FB BACK: ${valorFreebetGeradaBack}`;
        }
        if (gerouFreebetLay && valorFreebetGeradaLay) {
          obsCobertura += (obsCobertura ? " | " : "") + `FB LAY: ${valorFreebetGeradaLay}`;
        }

        apostaData = {
          ...commonData,
          bookmaker_id: coberturaBackBookmakerId,
          odd: backOdd,
          stake: backStake,
          modo_entrada: "EXCHANGE",
          valor_retorno: valorRetornoCalculado,
          lucro_prejuizo: lucroPrejuizo,
          lay_exchange: coberturaLayBookmakerId,
          lay_odd: layOdd,
          lay_stake: coberturaLayStake,
          lay_liability: coberturaResponsabilidade,
          lay_comissao: parseFloat(coberturaLayComissao),
          back_em_exchange: tipoApostaBack !== "normal",
          back_comissao: null,
          tipo_freebet: tipoApostaBack,
          // Sobrescrever gerou_freebet para cobertura
          gerou_freebet: coberturaGerouFreebet,
          valor_freebet_gerada: coberturaGerouFreebet && coberturaValorFreebet > 0 ? coberturaValorFreebet : null,
          observacoes: obsCobertura || null,
        };
      } else {
        // ===== MODO EXCHANGE (Back ou Lay simples) =====
        // Usa campos exchange* exclusivos
        const isLay = tipoOperacaoExchange === "lay";
        const exchOdd = parseFloat(exchangeOdd);
        const exchStake = parseFloat(exchangeStake);
        const exchComissao = parseFloat(exchangeComissao) / 100;
        
        // Calcular P/L para Exchange
        if (statusResultado !== "PENDENTE") {
          if (isLay) {
            // Lay: se ganhar = stake * (1 - comissão), se perder = -liability
            const liability = exchStake * (exchOdd - 1);
            switch (statusResultado) {
              case "GREEN":
                lucroPrejuizo = exchStake * (1 - exchComissao);
                valorRetornoCalculado = exchStake + lucroPrejuizo;
                break;
              case "RED":
                lucroPrejuizo = -liability;
                valorRetornoCalculado = 0;
                break;
              case "VOID":
                lucroPrejuizo = 0;
                valorRetornoCalculado = 0; // Liability liberada
                break;
            }
          } else {
            // Back: se ganhar = stake * (odd - 1) * (1 - comissão), se perder = -stake
            switch (statusResultado) {
              case "GREEN":
                const lucroBruto = exchStake * (exchOdd - 1);
                lucroPrejuizo = lucroBruto * (1 - exchComissao);
                valorRetornoCalculado = exchStake + lucroPrejuizo;
                break;
              case "RED":
                lucroPrejuizo = -exchStake;
                valorRetornoCalculado = 0;
                break;
              case "VOID":
                lucroPrejuizo = 0;
                valorRetornoCalculado = exchStake;
                break;
            }
          }
        }

        apostaData = {
          ...commonData,
          bookmaker_id: exchangeBookmakerId,
          odd: exchOdd,
          stake: exchStake,
          modo_entrada: "EXCHANGE",
          valor_retorno: valorRetornoCalculado,
          lucro_prejuizo: lucroPrejuizo,
          lay_exchange: null,
          lay_odd: isLay ? exchOdd : null,
          lay_stake: isLay ? exchStake : null,
          lay_liability: isLay ? exchangeLiability : null,
          lay_comissao: parseFloat(exchangeComissao),
          back_em_exchange: true,
          back_comissao: parseFloat(exchangeComissao),
          tipo_freebet: (!isLay && tipoApostaExchangeBack !== "normal") ? tipoApostaExchangeBack : null,
        };
      }

      // Armazenar o resultado anterior se estiver editando (para calcular diferença de saldo)
      // IMPORTANTE: resultado no banco é NULL para PENDENTE, então tratamos null como equivalente a PENDENTE
      const resultadoAnteriorBruto = aposta?.resultado;
      const resultadoAnterior = resultadoAnteriorBruto || null; // Mantém null se era PENDENTE
      const stakeAnterior = aposta?.stake || 0;
      const oddAnterior = aposta?.odd || 0;
      const bookmakerAnteriorId = aposta?.bookmaker_id;

      if (aposta) {
        // Verificar se gerouFreebet mudou de false para true na edição
        const gerouFreebetAnterior = aposta.gerou_freebet || false;
        const valorFreebetAnterior = aposta.valor_freebet_gerada || 0;
        
        // O resultado que será salvo no banco
        const novoResultado = statusResultado === "PENDENTE" ? null : statusResultado;
        
        // Para comparação: consideramos null e "PENDENTE" como equivalentes (ambos = pendente)
        const eraPendente = resultadoAnterior === null || resultadoAnterior === "PENDENTE";
        const agoraPendente = novoResultado === null || statusResultado === "PENDENTE";
        
        // Determinar bookmaker atual do formulário
        const bookmakerAtualId = tipoAposta === "bookmaker" 
          ? bookmakerId 
          : tipoOperacaoExchange === "cobertura" 
            ? coberturaBackBookmakerId 
            : exchangeBookmakerId;
        
        // ================================================================
        // VERIFICAÇÃO: Aposta liquidada com mudança financeira?
        // Se SIM, usar RPC atômico para reversão + re-liquidação
        // ================================================================
        const apostaEstaLiquidada = aposta.status === "LIQUIDADA";
        const houveMudancaBookmaker = bookmakerAnteriorId !== bookmakerAtualId;
        const houveMudancaStake = stakeAnterior !== apostaData.stake;
        const houveMudancaOdd = oddAnterior !== apostaData.odd;
        const houveMudancaResultado = resultadoAnterior !== novoResultado;
        const houveMudancaFinanceira = houveMudancaBookmaker || houveMudancaStake || houveMudancaOdd || houveMudancaResultado;
        
        if (apostaEstaLiquidada && houveMudancaFinanceira) {
          // Usar RPC atômico que faz reversão + re-liquidação via ledger
          console.log("[ApostaDialog] Aposta LIQUIDADA com mudança financeira - usando RPC atômico");
          console.log("[ApostaDialog] Mudanças detectadas:", {
            bookmaker: houveMudancaBookmaker ? `${bookmakerAnteriorId} -> ${bookmakerAtualId}` : 'sem mudança',
            stake: houveMudancaStake ? `${stakeAnterior} -> ${apostaData.stake}` : 'sem mudança',
            odd: houveMudancaOdd ? `${oddAnterior} -> ${apostaData.odd}` : 'sem mudança',
            resultado: houveMudancaResultado ? `${resultadoAnterior} -> ${novoResultado}` : 'sem mudança'
          });
          
          const { data: rpcResult, error: rpcError } = await supabase.rpc(
            'atualizar_aposta_liquidada_atomica',
            {
              p_aposta_id: aposta.id,
              p_novo_bookmaker_id: houveMudancaBookmaker ? bookmakerAtualId : null,
              p_novo_stake: houveMudancaStake ? apostaData.stake : null,
              p_nova_odd: houveMudancaOdd ? apostaData.odd : null,
              p_novo_resultado: houveMudancaResultado ? novoResultado : null,
              p_nova_moeda: null // Será detectada automaticamente do bookmaker
            }
          );
          
          if (rpcError) {
            console.error("[ApostaDialog] Erro no RPC atualizar_aposta_liquidada_atomica:", rpcError);
            throw new Error(`Erro ao atualizar aposta liquidada: ${rpcError.message}`);
          }
          
          const result = rpcResult as { success: boolean; error?: string; message?: string };
          if (!result.success) {
            throw new Error(result.error || 'Erro desconhecido ao atualizar aposta liquidada');
          }
          
          console.log("[ApostaDialog] RPC atualizar_aposta_liquidada_atomica sucesso:", result);
          
          // Agora atualizar campos que o RPC não atualiza (evento, mercado, observações, etc.)
          const { error: updateError } = await supabase
            .from("apostas_unificada")
            .update({
              evento: apostaData.evento,
              mercado: apostaData.mercado,
              esporte: apostaData.esporte,
              selecao: apostaData.selecao,
              observacoes: apostaData.observacoes,
              data_aposta: apostaData.data_aposta,
              // Campos de exchange/cobertura
              modo_entrada: apostaData.modo_entrada,
              lay_exchange: apostaData.lay_exchange,
              lay_odd: apostaData.lay_odd,
              lay_stake: apostaData.lay_stake,
              lay_liability: apostaData.lay_liability,
              lay_comissao: apostaData.lay_comissao,
              back_em_exchange: apostaData.back_em_exchange,
              back_comissao: apostaData.back_comissao,
              // Campos de freebet
              gerou_freebet: apostaData.gerou_freebet,
              valor_freebet_gerada: apostaData.valor_freebet_gerada,
              tipo_freebet: apostaData.tipo_freebet,
            })
            .eq("id", aposta.id);
          
          if (updateError) {
            console.warn("[ApostaDialog] Erro ao atualizar campos complementares:", updateError);
          }
          
          // Invalidar caches de saldo
          await invalidateSaldos();
          
        } else {
          // Aposta NÃO liquidada OU sem mudança financeira: update direto
          const { error } = await supabase
            .from("apostas_unificada")
            .update(apostaData)
            .eq("id", aposta.id);
          if (error) throw error;

          // ================================================================
          // CORREÇÃO CRÍTICA: NÃO usar atualizarSaldoBookmaker para mudanças de resultado
          // O saldo só deve ser afetado via cash_ledger através da liquidação RPC.
          // 
          // Fluxo correto:
          // - Aposta PENDENTE: não afeta saldo (stake é apenas reservado virtualmente)
          // - Aposta LIQUIDADA: usa liquidar_aposta_atomica que insere no cash_ledger
          // - Edição de PENDENTE→LIQUIDADO: usar RPC de liquidação
          // ================================================================
          if (bookmakerAtualId && !apostaEstaLiquidada) {
            // Importar motor financeiro v7
            const { liquidarAposta, reverterLiquidacao } = await import("@/lib/financialEngine");
            
            // Se mudou de PENDENTE para resultado final, usar liquidação v7
            if (eraPendente && !agoraPendente) {
              console.log("[ApostaDialog] Liquidando aposta via FinancialEngine v7 (PENDENTE → " + statusResultado + ")");
              const liquidResult = await liquidarAposta(
                aposta.id,
                statusResultado as 'GREEN' | 'RED' | 'VOID' | 'MEIO_GREEN' | 'MEIO_RED',
                apostaData.lucro_prejuizo || undefined
              );
              
              if (!liquidResult.success) {
                console.error("[ApostaDialog] Erro ao liquidar:", liquidResult.message);
              }
            }
            // Se mudou de resultado final para PENDENTE, usar reversão v7
            else if (!eraPendente && agoraPendente && resultadoAnterior) {
              console.log("[ApostaDialog] Revertendo aposta para PENDENTE via FinancialEngine v7 - resultado anterior:", resultadoAnterior);
              const revertResult = await reverterLiquidacao(aposta.id);
              
              if (!revertResult.success) {
                console.error("[ApostaDialog] Falha na reversão:", revertResult.message);
                toast.error("Falha na reversão: " + revertResult.message);
              } else {
                console.log("[ApostaDialog] Reversão concluída");
              }
            }
            // Outros casos (mudança entre resultados finais): reverter e liquidar novamente
            else if (!eraPendente && !agoraPendente && houveMudancaResultado) {
              console.log("[ApostaDialog] Re-liquidando aposta via FinancialEngine v7 (" + resultadoAnterior + " → " + statusResultado + ")");
              // Primeiro reverter
              await reverterLiquidacao(aposta.id);
              // Depois liquidar com novo resultado
              const reliqResult = await liquidarAposta(
                aposta.id,
                statusResultado as 'GREEN' | 'RED' | 'VOID' | 'MEIO_GREEN' | 'MEIO_RED',
                apostaData.lucro_prejuizo || undefined
              );
              
              if (!reliqResult.success) {
                console.error("[ApostaDialog] Erro ao re-liquidar:", reliqResult.message);
              }
            }
            // Se está e continua PENDENTE: não fazer nada com saldo
          }
        }

        // Verificar se resultado mudou e atualizar status da freebet
        if (gerouFreebetAnterior) {
          // Caso 1: PENDENTE → resultado final (GREEN, RED, MEIO_GREEN, MEIO_RED, VOID)
          if (eraPendente && !agoraPendente) {
            // VOID = não libera, qualquer outro resultado (GREEN, RED, MEIO_GREEN, MEIO_RED) = libera
            if (statusResultado === "VOID") {
              await recusarFreebetPendente(aposta.id);
            } else {
              await liberarFreebetPendente(aposta.id);
            }
          }
          // Caso 2: resultado final → PENDENTE (reversão)
          else if (!eraPendente && agoraPendente) {
            await reverterFreebetParaPendente(aposta.id);
          }
          // Caso 3: resultado final (não-VOID) → VOID
          else if (!eraPendente && resultadoAnterior !== "VOID" && statusResultado === "VOID") {
            // Freebet já estava LIBERADA, precisa reverter para NAO_LIBERADA
            const { data: freebetLiberada } = await supabase
              .from("freebets_recebidas")
              .select("id, bookmaker_id, valor")
              .eq("aposta_id", aposta.id)
              .eq("status", "LIBERADA")
              .maybeSingle();

            if (freebetLiberada) {
              // Decrementar saldo_freebet
              const { data: bookmaker } = await supabase
                .from("bookmakers")
                .select("saldo_freebet")
                .eq("id", freebetLiberada.bookmaker_id)
                .maybeSingle();

              if (bookmaker) {
                const novoSaldoFreebet = Math.max(0, (bookmaker.saldo_freebet || 0) - freebetLiberada.valor);
                await supabase
                  .from("bookmakers")
                  .update({ saldo_freebet: novoSaldoFreebet })
                  .eq("id", freebetLiberada.bookmaker_id);
              }

              // Mudar status para NAO_LIBERADA
              await supabase
                .from("freebets_recebidas")
                .update({ status: "NAO_LIBERADA" })
                .eq("id", freebetLiberada.id);
            }
          }
        }

        // Registrar freebet na edição se foi marcada agora
        const novoValorFreebet = parseFloat(valorFreebetGerada) || 0;
        if (gerouFreebet && novoValorFreebet > 0) {
          if (!gerouFreebetAnterior || valorFreebetAnterior !== novoValorFreebet) {
            // Se era false e agora é true, ou se o valor mudou
            const bookmakerParaFreebet = tipoAposta === "bookmaker" ? bookmakerId : coberturaBackBookmakerId;
            if (bookmakerParaFreebet) {
              // Se já existia valor anterior, precisamos ajustar a diferença
              if (gerouFreebetAnterior && valorFreebetAnterior > 0) {
                // Só ajustar saldo se status for LIBERADA (não ajustar PENDENTE)
                const { data: freebetExistente } = await supabase
                  .from("freebets_recebidas")
                  .select("status")
                  .eq("aposta_id", aposta.id)
                  .maybeSingle();
                
                if (freebetExistente?.status === "LIBERADA") {
                  // Reverter valor anterior
                  const { data: bk } = await supabase
                    .from("bookmakers")
                    .select("saldo_freebet")
                    .eq("id", bookmakerParaFreebet)
                    .maybeSingle();
                  if (bk) {
                    await supabase
                      .from("bookmakers")
                      .update({ saldo_freebet: Math.max(0, (bk.saldo_freebet || 0) - valorFreebetAnterior + novoValorFreebet) })
                      .eq("id", bookmakerParaFreebet);
                  }
                }
                // Atualizar registro existente
                await supabase
                  .from("freebets_recebidas")
                  .update({ valor: novoValorFreebet })
                  .eq("aposta_id", aposta.id);
              } else {
                // Novo registro - passar resultado para determinar status
                await registrarFreebetGerada(bookmakerParaFreebet, novoValorFreebet, userData.user.id, aposta.id, statusResultado);
              }
            }
          }
        } else if (!gerouFreebet && gerouFreebetAnterior && valorFreebetAnterior > 0) {
          // Foi removido: reverter saldo e marcar como não utilizada
          const bookmakerParaFreebet = tipoAposta === "bookmaker" ? bookmakerId : (aposta.bookmaker_id || coberturaBackBookmakerId);
          if (bookmakerParaFreebet) {
            // Só reverter saldo se a freebet estava LIBERADA
            const { data: freebetExistente } = await supabase
              .from("freebets_recebidas")
              .select("status")
              .eq("aposta_id", aposta.id)
              .maybeSingle();
            
            if (freebetExistente?.status === "LIBERADA") {
              const { data: bk } = await supabase
                .from("bookmakers")
                .select("saldo_freebet")
                .eq("id", bookmakerParaFreebet)
                .maybeSingle();
              if (bk) {
                await supabase
                  .from("bookmakers")
                  .update({ saldo_freebet: Math.max(0, (bk.saldo_freebet || 0) - valorFreebetAnterior) })
                  .eq("id", bookmakerParaFreebet);
              }
            }
            // Remover registro de freebet_recebida
            await supabase
              .from("freebets_recebidas")
              .delete()
              .eq("aposta_id", aposta.id);
          }
        }

        toast.success("Aposta atualizada com sucesso!");
        
        // Invalidar cache de saldos após update
        invalidateSaldos(projetoId);
      } else {
        // ========== VALIDAÇÃO PRÉ-COMMIT (ANTI-CONCORRÊNCIA) ==========
        // Antes de inserir, validar server-side com lock para prevenir:
        // 1. Dois usuários apostando simultaneamente na mesma casa
        // 2. Saldo negativo resultante
        // 3. Bookmaker desvinculada durante preenchimento
        const bookmakerParaValidar = tipoAposta === "bookmaker" 
          ? bookmakerId 
          : tipoOperacaoExchange === "cobertura" 
            ? coberturaBackBookmakerId 
            : exchangeBookmakerId;
        
        const stakeParaValidar = tipoAposta === "bookmaker"
          ? parseFloat(stake)
          : tipoOperacaoExchange === "cobertura"
            ? parseFloat(coberturaBackStake)
            : parseFloat(exchangeStake);
        
        // Só validar se não for freebet (freebet não debita saldo real)
        const isFreebet = (tipoAposta === "bookmaker" && usarFreebetBookmaker) ||
                          (tipoAposta === "exchange" && tipoOperacaoExchange === "back" && tipoApostaExchangeBack !== "normal") ||
                          (tipoAposta === "exchange" && tipoOperacaoExchange === "cobertura" && tipoApostaBack !== "normal");
        
        if (bookmakerParaValidar && stakeParaValidar > 0 && !isFreebet && statusResultado === "PENDENTE") {
          const validation = await validateAndReserve(projetoId, [
            { bookmaker_id: bookmakerParaValidar, stake: stakeParaValidar }
          ]);
          
          if (!validation.valid) {
            showValidationErrors(validation.errors);
            setLoading(false);
            return; // Abortar sem inserir
          }
        }
        // ========== FIM VALIDAÇÃO PRÉ-COMMIT ==========

        // Insert - capturar o ID da aposta inserida
        const { data: insertedData, error } = await supabase
          .from("apostas_unificada")
          .insert(apostaData)
          .select("id")
          .single();
        if (error) throw error;

        const novaApostaId = insertedData?.id;

        // ================================================================
        // CORREÇÃO CRÍTICA: Para apostas criadas já com resultado (não PENDENTE),
        // usar RPC de liquidação que insere corretamente no cash_ledger.
        // NÃO usar atualizarSaldoBookmaker que bypassa o ledger!
        // ================================================================
        if (novaApostaId && statusResultado !== "PENDENTE") {
          console.log("[ApostaDialog] Nova aposta criada já liquidada - usando FinancialEngine v7");
          const { liquidarAposta } = await import("@/lib/financialEngine");
          const liquidResult = await liquidarAposta(
            novaApostaId,
            statusResultado as 'GREEN' | 'RED' | 'VOID' | 'MEIO_GREEN' | 'MEIO_RED',
            apostaData.lucro_prejuizo || undefined
          );
          
          if (!liquidResult.success) {
            console.error("[ApostaDialog] Erro ao liquidar nova aposta:", liquidResult.message);
            // Não lançar exceção - a aposta já foi criada
          }
        }

        // Registrar freebet gerada (nova aposta) - passar resultado
        if (gerouFreebet && valorFreebetGerada && parseFloat(valorFreebetGerada) > 0) {
          const bookmakerParaFreebet = tipoAposta === "bookmaker" ? bookmakerId : coberturaBackBookmakerId;
          if (bookmakerParaFreebet && novaApostaId) {
            await registrarFreebetGerada(
              bookmakerParaFreebet, 
              parseFloat(valorFreebetGerada), 
              userData.user.id, 
              novaApostaId,
              statusResultado // Passar resultado para determinar status
            );
          }
        }

        // Debitar freebet se usar em qualquer modo
        // 1. Bookmaker simples com freebet
        if (tipoAposta === "bookmaker" && usarFreebetBookmaker) {
          const stakeNum = parseFloat(stake);
          if (stakeNum > 0 && bookmakerId) {
            await debitarFreebetUsada(bookmakerId, stakeNum);
          }
        }
        
        // 2. Exchange Back com freebet
        if (tipoAposta === "exchange" && tipoOperacaoExchange === "back" && tipoApostaExchangeBack !== "normal") {
          const stakeNum = parseFloat(exchangeStake);
          if (stakeNum > 0 && exchangeBookmakerId) {
            await debitarFreebetUsada(exchangeBookmakerId, stakeNum);
          }
        }
        
        // 3. Cobertura Lay com freebet
        if (tipoAposta === "exchange" && tipoOperacaoExchange === "cobertura" && tipoApostaBack !== "normal") {
          const backStakeNum = parseFloat(coberturaBackStake);
          if (backStakeNum > 0 && coberturaBackBookmakerId) {
            await debitarFreebetUsada(coberturaBackBookmakerId, backStakeNum);
          }
        }

        // NOTA: O progresso do rollover é atualizado na LIQUIDAÇÃO da aposta (ResultadoPill),
        // não na criação. Isso garante que apenas apostas finalizadas (GREEN/RED) contem para o rollover.
      }

      // Invalidar cache de saldos para atualizar todas as UIs
      invalidateSaldos(projetoId);

      onSuccess('save');
      if (!embedded) onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao salvar aposta: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Função para registrar freebet gerada (com apostaId opcional para edição)
  // REGRA CRÍTICA: Freebet NÃO tem moeda própria - herda da bookmaker onde foi gerada
  const registrarFreebetGerada = async (
    bookmakerIdFreebet: string, 
    valor: number, 
    userId: string, 
    apostaId?: string,
    resultadoAposta?: string
  ) => {
    try {
      // Determinar o status da freebet baseado no resultado da aposta
      // PENDENTE = aposta ainda não liquidada
      // LIBERADA = aposta GREEN ou RED (freebet disponível - algumas casas dão freebet mesmo em derrota)
      // NAO_LIBERADA = aposta VOID (única circunstância que não libera)
      let status: "PENDENTE" | "LIBERADA" | "NAO_LIBERADA" = "PENDENTE";
      
      if (resultadoAposta && resultadoAposta !== "PENDENTE") {
        // GREEN, RED, MEIO_GREEN, MEIO_RED = libera freebet
        // VOID = não libera
        status = resultadoAposta === "VOID" ? "NAO_LIBERADA" : "LIBERADA";
      }

      // Buscar a moeda da bookmaker - CRÍTICO para multimoeda
      const { data: bookmaker } = await supabase
        .from("bookmakers")
        .select("saldo_freebet, moeda")
        .eq("id", bookmakerIdFreebet)
        .maybeSingle();

      const moedaOperacao = bookmaker?.moeda || "BRL";

      // Só incrementar saldo_freebet se a freebet for liberada
      if (status === "LIBERADA" && bookmaker) {
        const novoSaldoFreebet = (bookmaker.saldo_freebet || 0) + valor;
        await supabase
          .from("bookmakers")
          .update({ saldo_freebet: novoSaldoFreebet })
          .eq("id", bookmakerIdFreebet);
      }

      // Registrar na tabela freebets_recebidas com status e MOEDA da bookmaker
      await supabase
        .from("freebets_recebidas")
        .insert({
          user_id: userId,
          workspace_id: workspaceId,
          projeto_id: projetoId,
          bookmaker_id: bookmakerIdFreebet,
          valor: valor,
          moeda_operacao: moedaOperacao, // CRÍTICO: herda moeda da bookmaker
          motivo: "Aposta qualificadora",
          origem: "QUALIFICADORA",
          qualificadora_id: apostaId || null,
          data_recebida: new Date().toISOString(),
          utilizada: false,
          aposta_id: apostaId || null,
          status: status,
        });
    } catch (error) {
      console.error("Erro ao registrar freebet gerada:", error);
    }
  };

  // Função para liberar freebet pendente quando aposta é liquidada (GREEN, RED, MEIO_GREEN, MEIO_RED)
  const liberarFreebetPendente = async (apostaId: string) => {
    try {
      // Buscar freebet pendente associada a esta aposta
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

        // Incrementar saldo_freebet do bookmaker
        const { data: bookmaker } = await supabase
          .from("bookmakers")
          .select("saldo_freebet")
          .eq("id", freebetPendente.bookmaker_id)
          .maybeSingle();

        if (bookmaker) {
          const novoSaldoFreebet = (bookmaker.saldo_freebet || 0) + freebetPendente.valor;
          await supabase
            .from("bookmakers")
            .update({ saldo_freebet: novoSaldoFreebet })
            .eq("id", freebetPendente.bookmaker_id);
        }
      }
    } catch (error) {
      console.error("Erro ao liberar freebet pendente:", error);
    }
  };

  // Função para recusar freebet quando aposta muda para VOID (única circunstância que não libera)
  const recusarFreebetPendente = async (apostaId: string) => {
    try {
      await supabase
        .from("freebets_recebidas")
        .update({ status: "NAO_LIBERADA" })
        .eq("aposta_id", apostaId)
        .eq("status", "PENDENTE");
    } catch (error) {
      console.error("Erro ao recusar freebet pendente:", error);
    }
  };

  // Função para reverter freebet LIBERADA de volta para PENDENTE quando aposta volta para PENDENTE
  const reverterFreebetParaPendente = async (apostaId: string) => {
    try {
      // Buscar freebet LIBERADA associada a esta aposta
      const { data: freebetLiberada } = await supabase
        .from("freebets_recebidas")
        .select("id, bookmaker_id, valor")
        .eq("aposta_id", apostaId)
        .eq("status", "LIBERADA")
        .maybeSingle();

      if (freebetLiberada) {
        // Decrementar saldo_freebet do bookmaker (reverter o crédito)
        const { data: bookmaker } = await supabase
          .from("bookmakers")
          .select("saldo_freebet")
          .eq("id", freebetLiberada.bookmaker_id)
          .maybeSingle();

        if (bookmaker) {
          const novoSaldoFreebet = Math.max(0, (bookmaker.saldo_freebet || 0) - freebetLiberada.valor);
          await supabase
            .from("bookmakers")
            .update({ saldo_freebet: novoSaldoFreebet })
            .eq("id", freebetLiberada.bookmaker_id);
        }

        // Voltar status para PENDENTE
        await supabase
          .from("freebets_recebidas")
          .update({ status: "PENDENTE" })
          .eq("id", freebetLiberada.id);
      }
    } catch (error) {
      console.error("Erro ao reverter freebet para pendente:", error);
    }
  };

  // Função para debitar freebet usada e marcar como utilizada na tabela freebets_recebidas
  // MIGRADO PARA LEDGER: Usa RPC consumir_freebet em vez de UPDATE direto
  const debitarFreebetUsada = async (bookmakerIdFreebet: string, valor: number, apostaId?: string) => {
    try {
      // 1. Debitar saldo_freebet via ledger (RPC atômica)
      const { consumirFreebetViaLedger } = await import("@/lib/freebetLedgerService");
      const result = await consumirFreebetViaLedger(bookmakerIdFreebet, valor, {
        apostaId,
        descricao: `Freebet consumida em aposta${apostaId ? ` #${apostaId.slice(0, 8)}` : ''}`,
      });

      if (!result.success) {
        console.error("Erro ao consumir freebet via ledger:", result.error);
        // Fallback não é mais necessário - o ledger é a fonte de verdade
        throw new Error(result.error);
      }

      // 2. Buscar freebet disponível para marcar como usada
      const { data: freebetsDisponiveis } = await supabase
        .from("freebets_recebidas")
        .select("id, valor")
        .eq("bookmaker_id", bookmakerIdFreebet)
        .eq("utilizada", false)
        .eq("projeto_id", projetoId)
        .order("valor", { ascending: false });

      if (freebetsDisponiveis && freebetsDisponiveis.length > 0) {
        // Encontrar a freebet mais adequada (valor igual ou maior)
        const freebetParaUsar = freebetsDisponiveis.find(fb => fb.valor >= valor) 
          || freebetsDisponiveis[0];
        
        // 3. Marcar como utilizada
        await supabase
          .from("freebets_recebidas")
          .update({
            utilizada: true,
            data_utilizacao: new Date().toISOString(),
            aposta_id: apostaId || null
          })
          .eq("id", freebetParaUsar.id);
      }
    } catch (error) {
      console.error("Erro ao debitar freebet usada:", error);
      throw error; // Propagar erro para tratamento upstream
    }
  };

  const atualizarSaldoBookmaker = async (
    bookmakerIdToUpdate: string,
    resultadoAnterior: string | null,
    resultadoNovo: string,
    stakeAnterior: number,
    oddAnterior: number,
    stakeNovo: number,
    oddNovo: number,
    tipoOperacao: "bookmaker" | "back" | "lay" | "cobertura" = "bookmaker",
    layLiability: number | null = null,
    layComissao: number | null = null,
    layExchangeId: string | null = null,
    layStakeValue: number | null = null
  ) => {
    try {
      // Sistema de dois saldos:
      // - saldo_total (saldo_atual no banco) = dinheiro real na conta
      // - saldo_disponivel = saldo_total - stakes bloqueadas (apostas pendentes)
      //
      // Tipos de resultado e seus cálculos variam por tipo de operação

      const calcularAjusteSaldo = (
        resultado: string, 
        stakeVal: number, 
        oddVal: number,
        opType: string,
        liability: number | null,
        comissaoPercent: number
      ): number => {
        const comissao = comissaoPercent / 100;
        
        // Para operações Lay
        if (opType === "lay") {
          const liabilityVal = liability || stakeVal * (oddVal - 1);
          switch (resultado) {
            case "GREEN": // Lay ganhou
              return stakeVal * (1 - comissao);
            case "RED": // Lay perdeu
              return -liabilityVal;
            case "VOID":
              return 0;
            default:
              return 0;
          }
        }
        
        // Para Cobertura
        if (opType === "cobertura") {
          switch (resultado) {
            case "GREEN_BOOKMAKER": // Back ganhou
              return stakeVal * (oddVal - 1);
            case "RED_BOOKMAKER": // Back perdeu
              return -stakeVal;
            case "VOID":
              return 0;
            default:
              return 0;
          }
        }
        
        // Para Exchange Back
        if (opType === "back") {
          const lucroBruto = stakeVal * (oddVal - 1);
          switch (resultado) {
            case "GREEN":
              return lucroBruto * (1 - comissao);
            case "RED":
              return -stakeVal;
            case "VOID":
              return 0;
            default:
              return 0;
          }
        }
        
        // Para Bookmaker (com meio resultados)
        switch (resultado) {
          case "GREEN":
            return stakeVal * (oddVal - 1);
          case "RED":
            return -stakeVal;
          case "MEIO_GREEN":
          case "HALF":
            return stakeVal * ((oddVal - 1) / 2);
          case "MEIO_RED":
            return -stakeVal / 2;
          case "VOID":
            return 0;
          default:
            return 0;
        }
      };

      // Função para calcular ajuste do lado LAY em cobertura
      const calcularAjusteSaldoLay = (
        resultado: string,
        layStake: number,
        liability: number,
        comissaoPercent: number
      ): number => {
        const comissao = comissaoPercent / 100;
        switch (resultado) {
          case "GREEN_BOOKMAKER": // Back ganhou = LAY perdeu
            return -liability;
          case "RED_BOOKMAKER": // Back perdeu = LAY ganhou
            return layStake * (1 - comissao);
          case "VOID":
            return 0;
          default:
            return 0;
        }
      };

      let saldoAjuste = 0;
      let saldoAjusteLay = 0;
      const comissaoVal = layComissao ?? 5;

      // Reverter efeito do resultado anterior (BACK side)
      if (resultadoAnterior && resultadoAnterior !== "PENDENTE") {
        saldoAjuste -= calcularAjusteSaldo(
          resultadoAnterior, 
          stakeAnterior, 
          oddAnterior, 
          tipoOperacao,
          layLiability,
          comissaoVal
        );
        
        // Reverter efeito anterior do LAY side em cobertura
        if (tipoOperacao === "cobertura" && layExchangeId && layStakeValue !== null && layLiability !== null) {
          saldoAjusteLay -= calcularAjusteSaldoLay(
            resultadoAnterior,
            layStakeValue,
            layLiability,
            comissaoVal
          );
        }
      }

      // Aplicar efeito do novo resultado (BACK side)
      if (resultadoNovo && resultadoNovo !== "PENDENTE") {
        saldoAjuste += calcularAjusteSaldo(
          resultadoNovo, 
          stakeNovo, 
          oddNovo, 
          tipoOperacao,
          layLiability,
          comissaoVal
        );
        
        // Aplicar efeito do LAY side em cobertura
        if (tipoOperacao === "cobertura" && layExchangeId && layStakeValue !== null && layLiability !== null) {
          saldoAjusteLay += calcularAjusteSaldoLay(
            resultadoNovo,
            layStakeValue,
            layLiability,
            comissaoVal
          );
        }
      }

      // CORREÇÃO MULTI-MOEDA E BÔNUS ATIVO: Usar helper centralizado que respeita moeda do bookmaker e bônus ativo
      if (saldoAjuste !== 0) {
        await updateBookmakerBalance(bookmakerIdToUpdate, saldoAjuste, projetoId);
      }

      // Atualizar saldo do LAY bookmaker (para cobertura)
      // CORREÇÃO MULTI-MOEDA E BÔNUS ATIVO: Usar helper centralizado
      if (tipoOperacao === "cobertura" && layExchangeId && saldoAjusteLay !== 0) {
        await updateBookmakerBalance(layExchangeId, saldoAjusteLay, projetoId);
      }
    } catch (error) {
      console.error("Erro ao atualizar saldo do bookmaker:", error);
    }
  };

  const handleDelete = async () => {
    if (!aposta) return;
    
    try {
      setLoading(true);

      // Exclusão centralizada (reversão → VOID → delete) para garantir recomposição de saldo
      const result = await deletarAposta(aposta.id);
      if (!result.success) {
        throw new Error(result.error?.message || 'Falha ao excluir aposta');
      }
      
      invalidateSaldos(projetoId);
      toast.success("Aposta excluída com sucesso!");
      onSuccess('delete');
      if (!embedded) onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao excluir aposta: " + error.message);
    } finally {
      setLoading(false);
      setDeleteDialogOpen(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };


  // ============================================
  // SHARED HEADER PROPS
  // ============================================
  const headerProps = {
    formType: "simples" as const,
    estrategia: registroValues.estrategia,
    contexto: registroValues.contexto_operacional || 'NORMAL' as const,
    onEstrategiaChange: (v: any) => setRegistroValues(prev => ({ ...prev, estrategia: v })),
    onContextoChange: (v: any) => setRegistroValues(prev => ({ ...prev, contexto_operacional: v })),
    isEditing: !!aposta,
    activeTab,
    lockedEstrategia: !aposta && isAbaEstrategiaFixa(activeTab) ? getEstrategiaFromTab(activeTab) : null,
    gameFields: {
      esporte,
      evento,
      mercado,
      dataAposta,
      onEsporteChange: (val: string) => {
        setEsporte(val);
        incrementSportUsage(val);
      },
      onEventoChange: setEvento,
      onMercadoChange: (val: string) => {
        setMercado(val);
        setSelecao("");
        if (mercadoFromPrint) setMercadoFromPrint(false);
      },
      onDataApostaChange: setDataAposta,
      esportesList: getSortedEsportes(),
      fieldsNeedingReview: printFieldsNeedingReview,
    },
    showImport: !aposta,
    onImportClick: () => fileInputRef.current?.click(),
    isPrintProcessing,
    printProcessingPhase,
    fileInputRef,
    onFileSelect: handleFileSelect,
    showCloseButton: !embedded,
    onClose: () => onOpenChange(false),
    embedded,
    fonteSaldo: registroValues.fonte_saldo || null,
  };

  // ============================================
  // SHARED CONTENT - Print status indicators
  // ============================================
  const renderPrintStatusIndicators = () => (
    <>
      {/* Estado: Processando print */}
      {isPrintProcessing && !aposta && (
        <div className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg ${
          printProcessingPhase === "backup" 
            ? "bg-amber-500/10 border border-amber-500/30" 
            : "bg-primary/10"
        }`}>
          <div className={`h-3 w-3 border-2 border-t-transparent rounded-full animate-spin ${
            printProcessingPhase === "backup" ? "border-amber-500" : "border-primary"
          }`} />
          <span className={`text-xs font-medium ${
            printProcessingPhase === "backup" ? "text-amber-500" : "text-primary"
          }`}>
            {printProcessingPhase === "backup" 
              ? "Tentando leitura alternativa..." 
              : "Analisando seu print..."}
          </span>
        </div>
      )}
      
      {/* Estado: Print carregado - Compacto */}
      {!isPrintProcessing && printParsedData && printImagePreview && !aposta && (
        <div className="flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
          {/* Miniatura - clicável para ampliar */}
          <Dialog>
            <DialogTrigger asChild>
              <div 
                className="relative w-8 h-8 flex-shrink-0 cursor-pointer rounded overflow-hidden hover:ring-2 hover:ring-primary transition-all"
                title="Clique para ampliar"
              >
                <img 
                  src={printImagePreview} 
                  alt="Print" 
                  className="w-full h-full object-cover"
                />
              </div>
            </DialogTrigger>
            <DialogContent className="max-w-4xl p-2">
              <img 
                src={printImagePreview} 
                alt="Print do boletim" 
                className="w-full h-auto max-h-[80vh] object-contain rounded-md"
              />
            </DialogContent>
          </Dialog>
          
          {/* Badge de sucesso - centralizado */}
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-xs text-emerald-400 font-medium">Print importado</span>
          </div>
          
          {/* Botão limpar */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearPrintData}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
          >
            <XCircle className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </>
  );

  // ============================================
  // DRAG OVERLAY COMPONENT
  // ============================================
  const renderDragOverlay = () => isDragging && !aposta && (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/90 rounded-lg border-2 border-dashed border-primary">
      <div className="text-center space-y-2">
        <Camera className="h-10 w-10 mx-auto text-primary" />
        <p className="text-sm font-medium text-primary">Solte a imagem para importar</p>
      </div>
    </div>
  );

  // ============================================
  // EMBEDDED MODE (Fullscreen - igual ao Surebet)
  // ============================================
  if (embedded && open) {
    return (
      <>
        <div 
          className="fixed inset-0 z-50 bg-background flex flex-col animate-in fade-in-0 duration-200"
          ref={dialogContentRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="relative w-full h-full flex flex-col overflow-hidden">
            {/* Hidden file input */}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            
            {/* Drag overlay */}
            {renderDragOverlay()}
            
            {/* HEADER UNIFICADO V2 - 3 linhas fixas (sem padding, full width) */}
            <BetFormHeaderV2 {...headerProps} />

            {/* CONTENT - com scroll e padding interno */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid gap-5">
                {renderPrintStatusIndicators()}

            {/* ========== SELETOR DE MODO: BOOKMAKER vs EXCHANGE ========== */}
            <div className="flex items-center justify-center border-b border-border/30">
              <button
                type="button"
                onClick={() => setTipoAposta("bookmaker")}
                className={`relative px-6 py-3 text-sm font-medium transition-colors flex items-center gap-2 ${
                  tipoAposta === "bookmaker"
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <BookOpen className="h-4 w-4" />
                <span>Bookmaker</span>
                {tipoAposta === "bookmaker" && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setTipoAposta("exchange")}
                className={`relative px-6 py-3 text-sm font-medium transition-colors flex items-center gap-2 ${
                  tipoAposta === "exchange"
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <BarChart3 className="h-4 w-4" />
                <span>Exchange</span>
                {tipoAposta === "exchange" && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                )}
              </button>
            </div>

            {/* ========== MODO BOOKMAKER ========== */}
            {tipoAposta === "bookmaker" && (
              <>
              <div className="border border-border/50 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/30 bg-muted/30">
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-center w-[240px]">Bookmaker</th>
                    <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-center w-[70px]">Odd</th>
                    <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-center w-[100px]">Stake</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-center w-[120px]">Linha</th>
                    <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-center w-[110px]">Retorno</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/30">
                    {/* Casa */}
                    <td className="px-3 py-3 text-center">
                      <div className="flex flex-col gap-1 items-center">
                        <Select 
                          value={bookmakerId} 
                          onValueChange={(val) => {
                            setBookmakerId(val);
                            const selectedBk = bookmakers.find(b => b.id === val);
                            if (selectedBk) {
                              setBookmakerSaldo({ 
                                saldo: selectedBk.saldo_total, 
                                saldoDisponivel: selectedBk.saldo_disponivel, 
                                saldoFreebet: selectedBk.saldo_freebet, 
                                saldoBonus: selectedBk.saldo_bonus,
                                saldoOperavel: selectedBk.saldo_operavel,
                                moeda: selectedBk.moeda,
                                bonusRolloverStarted: selectedBk.bonus_rollover_started || false
                              });
                            } else {
                              setBookmakerSaldo(null);
                            }
                          }}
                        >
                          <SelectTrigger className="h-9 text-xs w-full border-dashed">
                            <BookmakerSelectTrigger
                              bookmaker={bookmakerId ? (() => {
                                const selectedBk = bookmakers.find(b => b.id === bookmakerId);
                                if (selectedBk) {
                                  return {
                                    nome: selectedBk.nome,
                                    parceiro_nome: selectedBk.parceiro_nome,
                                    moeda: selectedBk.moeda,
                                    saldo_operavel: selectedBk.saldo_operavel,
                                    logo_url: selectedBk.logo_url,
                                  };
                                }
                                return null;
                              })() : null}
                              placeholder="Selecione"
                            />
                          </SelectTrigger>
                          <SelectContent className="max-w-[400px]">
                            {bookmakers.length === 0 ? (
                              <div className="p-3 text-center text-sm text-muted-foreground">
                                Nenhuma bookmaker com saldo disponível
                              </div>
                            ) : (
                              bookmakers.map((bk) => (
                                <SelectItem key={bk.id} value={bk.id} className="max-w-full py-2">
                                  <BookmakerSelectOption 
                                    bookmaker={{
                                      id: bk.id,
                                      nome: bk.nome,
                                      parceiro_nome: bk.parceiro_nome,
                                      moeda: bk.moeda,
                                      saldo_operavel: bk.saldo_operavel,
                                      saldo_disponivel: bk.saldo_disponivel,
                                      saldo_freebet: bk.saldo_freebet,
                                      saldo_bonus: bk.saldo_bonus,
                                      logo_url: bk.logo_url,
                                      bonus_rollover_started: bk.bonus_rollover_started,
                                    }}
                                  />
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        
                        {/* Metadados fixos abaixo do select - altura fixa para evitar layout jumps */}
                        <BookmakerMetaRow 
                          bookmaker={bookmakerId ? (() => {
                            const selectedBk = bookmakers.find(b => b.id === bookmakerId);
                            if (!selectedBk) return null;
                            return {
                              parceiro_nome: selectedBk.parceiro_nome,
                              moeda: selectedBk.moeda,
                              saldo_operavel: saldoComReservas?.disponivel ?? selectedBk.saldo_operavel
                            };
                          })() : null}
                        />
                      </div>
                    </td>
                    {/* Odd */}
                    <td className="px-1 py-3">
                      <Input
                        type="number"
                        step="0.001"
                        min="1.01"
                        value={odd}
                        onChange={(e) => setOdd(e.target.value)}
                        onBlur={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val < 1.01) {
                            setOdd("1.01");
                          }
                        }}
                        placeholder="0.00"
                        className="h-8 text-xs text-center px-1 w-[72px] tabular-nums"
                      />
                    </td>
                    {/* Stake */}
                    <td className="px-1 py-3">
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={stake}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (parseFloat(val) < 0) return;
                          setStake(val);
                        }}
                        placeholder="0.00"
                        className={`h-8 text-xs text-center px-1 w-[90px] tabular-nums ${(() => {
                          const saldoDisponivelReal = saldoComReservas?.disponivel ?? bookmakers.find(b => b.id === bookmakerId)?.saldo_operavel ?? 0;
                          const stakeNum = parseFloat(stake);
                          if (!isNaN(stakeNum) && stakeNum > saldoDisponivelReal && bookmakerId) {
                            return "border-destructive";
                          }
                          return "";
                        })()}`}
                      />
                    </td>
                    {/* Linha */}
                    <td className="px-2 py-3">
                      <Input
                        value={selecao}
                        onChange={(e) => {
                          setSelecao(e.target.value);
                          if (selecaoFromPrint) setSelecaoFromPrint(false);
                        }}
                        placeholder="Ex: Over 2.5, Casa, Jogador 1"
                        className={`h-8 text-xs text-center px-2 border-dashed ${printFieldsNeedingReview.selecao ? 'border-amber-500/50' : ''}`}
                      />
                    </td>
                    {/* Retorno */}
                    <td className="px-2 py-3 text-center">
                      <div className="h-8 flex items-center justify-center rounded-md bg-muted/30 px-2 text-sm font-medium text-emerald-500 tabular-nums">
                        {(() => {
                          const oddNum = parseFloat(odd);
                          const stakeNum = parseFloat(stake);
                          const moeda = getSelectedBookmakerMoeda();
                          if (!isNaN(oddNum) && !isNaN(stakeNum) && oddNum > 0 && stakeNum > 0) {
                            const retorno = oddNum * stakeNum;
                            return formatCurrencyWithSymbol(retorno, moeda);
                          }
                          return "—";
                        })()}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
              {/* Linha de saldo/alertas abaixo da tabela */}
              {bookmakerId && (
                <div className="px-3 py-2 bg-muted/10 border-t border-border/30 flex items-center justify-between gap-4">
                  {saldoComReservas && saldoComReservas.reservado > 0 ? (
                    <SaldoReservaCompact
                      saldoContabil={saldoComReservas.contabil}
                      saldoReservado={saldoComReservas.reservado}
                      saldoDisponivel={saldoComReservas.disponivel}
                      moeda={bookmakerSaldo?.moeda || 'BRL'}
                      stakeAtual={parseFloat(stake) || 0}
                      loading={saldoReservasLoading}
                    />
                  ) : bookmakerSaldo && (
                    <SaldoBreakdownDisplay
                      saldoReal={bookmakerSaldo.saldoDisponivel}
                      saldoFreebet={bookmakerSaldo.saldoFreebet}
                      saldoBonus={bookmakerSaldo.saldoBonus}
                      saldoOperavel={bookmakerSaldo.saldoOperavel}
                      moeda={bookmakerSaldo.moeda}
                      bonusRolloverStarted={bookmakerSaldo.bonusRolloverStarted}
                    />
                  )}
                  {hasActiveBonus && registroValues.estrategia !== "EXTRACAO_BONUS" && (
                    <BonusImpactAlert
                      bookmakerId={bookmakerId}
                      bookmakerNome={bookmakers.find(b => b.id === bookmakerId)?.nome || ""}
                      estrategia={registroValues.estrategia || ""}
                      hasActiveBonus={hasActiveBonus}
                      rolloverProgress={bonusInfo?.rollover_progress}
                      rolloverTarget={bonusInfo?.rollover_target_amount || undefined}
                      minOdds={bonusInfo?.min_odds || undefined}
                      currentOdd={parseFloat(odd) || undefined}
                    />
                  )}
                </div>
              )}
            </div>

              {/* WATERFALL: Toggle Freebet + Preview de distribuição */}
              {bookmakerSaldo && !aposta?.gerou_freebet && (
                <div className="space-y-3 mt-3">
                  {/* FreebetToggle - novo componente waterfall */}
                  <FreebetToggle
                    checked={usarFreebetBookmaker}
                    onCheckedChange={(checked) => {
                      setUsarFreebetBookmaker(checked);
                      if (checked) {
                        setGerouFreebet(false);
                        setValorFreebetGerada("");
                      }
                    }}
                    saldoFreebet={bookmakerSaldo.saldoFreebet}
                    moeda={bookmakerSaldo.moeda}
                    disabled={!!aposta?.tipo_freebet}
                  />
                  
                  {/* SaldoWaterfallPreview - mostra como stake será distribuído */}
                  {bookmakerId && parseFloat(stake) > 0 && (
                    <SaldoWaterfallPreview
                      stake={parseFloat(stake) || 0}
                      saldoBonus={bookmakerSaldo.saldoBonus}
                      saldoFreebet={bookmakerSaldo.saldoFreebet}
                      saldoReal={bookmakerSaldo.saldoDisponivel}
                      usarFreebet={usarFreebetBookmaker}
                      moeda={bookmakerSaldo.moeda}
                    />
                  )}
                </div>
              )}
              </>
            )}

            {/* ========== MODO EXCHANGE ========== */}
            {tipoAposta === "exchange" && (
              <div className="space-y-4">
                {/* Seletor de tipo de operação - estilo tabs com underline */}
                <div className="flex items-center justify-center border-b border-border/30">
                  <button
                    type="button"
                    onClick={() => setTipoOperacaoExchange("back")}
                    className={`relative px-5 py-2.5 text-sm font-medium transition-colors ${
                      tipoOperacaoExchange === "back"
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    BACK
                    {tipoOperacaoExchange === "back" && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipoOperacaoExchange("lay")}
                    className={`relative px-5 py-2.5 text-sm font-medium transition-colors ${
                      tipoOperacaoExchange === "lay"
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    LAY
                    {tipoOperacaoExchange === "lay" && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipoOperacaoExchange("cobertura")}
                    className={`relative px-5 py-2.5 text-sm font-medium transition-colors ${
                      tipoOperacaoExchange === "cobertura"
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    COBERTURA
                    {tipoOperacaoExchange === "cobertura" && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                    )}
                  </button>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="ml-2 text-muted-foreground hover:text-foreground transition-colors">
                          <HelpCircle className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[280px] p-3 text-xs space-y-2">
                        <p><span className="font-medium">BACK:</span> Aposta a favor de um resultado.</p>
                        <p><span className="font-medium">LAY:</span> Aposta contra um resultado.</p>
                        <p><span className="font-medium">COBERTURA:</span> Back + Lay para lucro garantido.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                {/* BACK ou LAY simples - Layout tabular igual ao Bookmaker */}
                {(tipoOperacaoExchange === "back" || tipoOperacaoExchange === "lay") && (
                  <>
                    <div className="border border-border/50 rounded-lg overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border/30 bg-muted/30">
                            <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-center w-[220px]">Casa</th>
                            <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-center w-[70px]">
                              Odd {tipoOperacaoExchange === "back" ? "Back" : "Lay"}
                            </th>
                            <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-center w-[90px]">Stake</th>
                            <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-center w-[60px]">Com. %</th>
                            <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-center w-[100px]">Linha</th>
                            <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-center w-[100px]">
                              {tipoOperacaoExchange === "back" ? "Retorno" : "Responsab."}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-border/30">
                            {/* Casa */}
                            <td className="px-2 py-3">
                              <div className="flex flex-col gap-1">
                                <Select value={exchangeBookmakerId} onValueChange={setExchangeBookmakerId}>
                                  <SelectTrigger className="h-9 text-xs w-full border-dashed">
                                    <BookmakerSelectTrigger
                                      bookmaker={exchangeBookmakerId ? (() => {
                                        const selectedBk = bookmakers.find(b => b.id === exchangeBookmakerId);
                                        if (selectedBk) {
                                          return {
                                            nome: selectedBk.nome,
                                            parceiro_nome: selectedBk.parceiro_nome,
                                            moeda: selectedBk.moeda,
                                            saldo_operavel: selectedBk.saldo_operavel,
                                            logo_url: selectedBk.logo_url,
                                          };
                                        }
                                        return null;
                                      })() : null}
                                      placeholder="Selecione"
                                    />
                                  </SelectTrigger>
                                  <SelectContent className="max-w-[400px]">
                                    {bookmakers.length === 0 ? (
                                      <div className="p-3 text-center text-sm text-muted-foreground">
                                        Nenhuma bookmaker disponível
                                      </div>
                                    ) : (
                                      bookmakers.map((bk) => (
                                        <SelectItem key={bk.id} value={bk.id} className="max-w-full py-2">
                                          <BookmakerSelectOption
                                            bookmaker={{
                                              id: bk.id,
                                              nome: bk.nome,
                                              parceiro_nome: bk.parceiro_nome,
                                              moeda: bk.moeda,
                                              saldo_operavel: bk.saldo_operavel,
                                              saldo_disponivel: bk.saldo_disponivel,
                                              saldo_freebet: bk.saldo_freebet,
                                              saldo_bonus: bk.saldo_bonus,
                                              logo_url: bk.logo_url,
                                              bonus_rollover_started: bk.bonus_rollover_started,
                                            }}
                                          />
                                        </SelectItem>
                                      ))
                                    )}
                                  </SelectContent>
                                </Select>
                                {/* Detalhes abaixo do select */}
                                {/* Metadados fixos - altura fixa para evitar layout jumps */}
                                <BookmakerMetaRow 
                                  bookmaker={exchangeBookmakerId ? (() => {
                                    const selectedBk = bookmakers.find(b => b.id === exchangeBookmakerId);
                                    if (!selectedBk) return null;
                                    return {
                                      parceiro_nome: selectedBk.parceiro_nome,
                                      moeda: selectedBk.moeda,
                                      saldo_operavel: selectedBk.saldo_operavel
                                    };
                                  })() : null}
                                />
                              </div>
                            </td>
                            {/* Odd */}
                            <td className="px-1 py-3">
                              <Input
                                type="number"
                                step="0.01"
                                min="1.01"
                                value={exchangeOdd}
                                onChange={(e) => setExchangeOdd(e.target.value)}
                                placeholder="0.00"
                                className="h-8 text-xs text-center px-1 w-[72px] tabular-nums"
                              />
                            </td>
                            {/* Stake */}
                            <td className="px-1 py-3">
                              <Input
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={exchangeStake}
                                onChange={(e) => setExchangeStake(e.target.value)}
                                placeholder="0.00"
                                className="h-8 text-xs text-center px-1 w-[90px] tabular-nums"
                              />
                            </td>
                            {/* Comissão */}
                            <td className="px-1 py-3">
                              <Input
                                type="number"
                                step="0.1"
                                value={exchangeComissao}
                                onChange={(e) => setExchangeComissao(e.target.value)}
                                placeholder="5"
                                className="h-8 text-xs text-center px-1 w-[60px] tabular-nums"
                              />
                            </td>
                            {/* Linha (Seleção) */}
                            <td className="px-1 py-3">
                              <Input
                                value={selecao}
                                onChange={(e) => setSelecao(e.target.value)}
                                placeholder="Linha"
                                className="h-8 text-xs text-center px-1 w-full"
                              />
                            </td>
                            {/* Retorno ou Responsabilidade */}
                            <td className="px-1 py-3 text-center">
                              {tipoOperacaoExchange === "back" ? (
                                <span className={`text-xs font-medium tabular-nums ${
                                  exchangeRetornoTotal !== null && exchangeRetornoTotal > 0 ? "text-primary" : "text-muted-foreground"
                                }`}>
                                  {exchangeRetornoTotal !== null ? formatCurrencyCanonical(exchangeRetornoTotal, exchangeBookmakerSaldo?.moeda || "BRL") : "-"}
                                </span>
                              ) : (
                                <span className={`text-xs font-medium tabular-nums ${
                                  exchangeLiability !== null && exchangeBookmakerSaldo && exchangeLiability > exchangeBookmakerSaldo.saldoDisponivel
                                    ? "text-destructive"
                                    : "text-muted-foreground"
                                }`}>
                                  {exchangeLiability !== null ? formatCurrencyCanonical(exchangeLiability, exchangeBookmakerSaldo?.moeda || "BRL") : "-"}
                                </span>
                              )}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    
                    {/* Resultados inline - discreto abaixo da tabela */}
                    <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
                      {tipoOperacaoExchange === "back" ? (
                        <span>
                          Lucro líquido: <span className="font-medium text-primary">
                            {exchangeLucroPotencial !== null ? formatCurrencyCanonical(exchangeLucroPotencial, exchangeBookmakerSaldo?.moeda || "BRL") : "-"}
                          </span>
                        </span>
                      ) : (
                        <>
                          <span>
                            Se ganhar: <span className="font-medium text-primary">
                              +{exchangeLucroPotencial !== null ? formatCurrencyCanonical(exchangeLucroPotencial, exchangeBookmakerSaldo?.moeda || "BRL") : "-"}
                            </span>
                          </span>
                          <span>
                            Se perder: <span className="font-medium text-destructive">
                              {exchangePrejuizo !== null ? formatCurrencyCanonical(exchangePrejuizo, exchangeBookmakerSaldo?.moeda || "BRL") : "-"}
                            </span>
                          </span>
                        </>
                      )}
                    </div>
                    
                    {/* Seletor Freebet - compacto */}
                    {tipoOperacaoExchange === "back" && exchangeBookmakerSaldo && exchangeBookmakerSaldo.saldoFreebet > 0 && (
                      <div className="flex items-center justify-center gap-4 pt-2 border-t border-border/30">
                        <span className="text-xs text-muted-foreground">Tipo:</span>
                        <div className="flex items-center gap-1 p-0.5 rounded bg-muted/30 border border-border/30">
                          {[
                            { value: "normal", label: "Normal" },
                            { value: "freebet_snr", label: "FB SNR" },
                            { value: "freebet_sr", label: "FB SR" },
                          ].map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setTipoApostaExchangeBack(opt.value as any)}
                              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                                tipoApostaExchangeBack === opt.value
                                  ? "bg-primary text-primary-foreground"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Campos para Cobertura Lay - Layout tabular compacto */}
                {tipoOperacaoExchange === "cobertura" && (
                  <>
                    {/* Seletor tipo de aposta - inline compacto */}
                    <div className="flex items-center justify-center gap-4 pb-3 border-b border-border/30">
                      <span className="text-xs text-muted-foreground">Tipo:</span>
                      <div className="flex items-center gap-1 p-0.5 rounded bg-muted/30 border border-border/30">
                        {[
                          { value: "normal", label: "Normal" },
                          { value: "freebet_snr", label: "FB SNR" },
                          { value: "freebet_sr", label: "FB SR" },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setTipoApostaBack(opt.value as any)}
                            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                              tipoApostaBack === opt.value
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Tabela BACK + LAY lado a lado */}
                    <div className="border border-border/50 rounded-lg overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border/30 bg-muted/30">
                            <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-center w-[60px]">Lado</th>
                            <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-center w-[180px]">Casa</th>
                            <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-center w-[70px]">Odd</th>
                            <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-center w-[90px]">Stake</th>
                            <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-center w-[60px]">Com. %</th>
                            <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-center w-[90px]">Resultado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* Linha BACK */}
                          <tr className="border-b border-border/30">
                            <td className="px-2 py-3 text-center">
                              <span className="text-xs font-medium text-foreground">BACK</span>
                            </td>
                            <td className="px-2 py-3">
                              <div className="flex flex-col gap-1">
                                <Select 
                                  value={coberturaBackBookmakerId} 
                                  onValueChange={(val) => {
                                    setCoberturaBackBookmakerId(val);
                                    const bk = bookmakers.find(b => b.id === val);
                                    if (bk) {
                                      setCoberturaBackSaldo({ 
                                        saldo: bk.saldo_total, 
                                        saldoDisponivel: bk.saldo_disponivel, 
                                        saldoFreebet: bk.saldo_freebet, 
                                        saldoBonus: bk.saldo_bonus,
                                        saldoOperavel: bk.saldo_operavel,
                                        moeda: bk.moeda,
                                        bonusRolloverStarted: bk.bonus_rollover_started || false
                                      });
                                    } else {
                                      setCoberturaBackSaldo(null);
                                    }
                                  }}
                                >
                                  <SelectTrigger className="h-8 text-xs w-full border-dashed">
                                    <BookmakerSelectTrigger
                                      bookmaker={coberturaBackBookmakerId ? (() => {
                                        const selectedBk = bookmakers.find(b => b.id === coberturaBackBookmakerId);
                                        if (selectedBk) {
                                          return {
                                            nome: selectedBk.nome,
                                            parceiro_nome: selectedBk.parceiro_nome,
                                            moeda: selectedBk.moeda,
                                            saldo_operavel: selectedBk.saldo_operavel,
                                            logo_url: selectedBk.logo_url,
                                          };
                                        }
                                        return null;
                                      })() : null}
                                      placeholder="Selecione"
                                    />
                                  </SelectTrigger>
                                  <SelectContent className="max-w-[400px]">
                                    {bookmakers.map((bk) => (
                                      <SelectItem key={bk.id} value={bk.id} className="max-w-full py-2">
                                        <BookmakerSelectOption
                                          bookmaker={{
                                            id: bk.id,
                                            nome: bk.nome,
                                            parceiro_nome: bk.parceiro_nome,
                                            moeda: bk.moeda,
                                            saldo_operavel: bk.saldo_operavel,
                                            saldo_disponivel: bk.saldo_disponivel,
                                            saldo_freebet: bk.saldo_freebet,
                                            saldo_bonus: bk.saldo_bonus,
                                            logo_url: bk.logo_url,
                                            bonus_rollover_started: bk.bonus_rollover_started,
                                          }}
                                        />
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {/* Metadados fixos - altura fixa para evitar layout jumps */}
                                <BookmakerMetaRow 
                                  bookmaker={coberturaBackBookmakerId ? (() => {
                                    const selectedBk = bookmakers.find(b => b.id === coberturaBackBookmakerId);
                                    if (!selectedBk) return null;
                                    return {
                                      parceiro_nome: selectedBk.parceiro_nome,
                                      moeda: selectedBk.moeda,
                                      saldo_operavel: selectedBk.saldo_operavel
                                    };
                                  })() : null}
                                />
                              </div>
                            </td>
                            <td className="px-1 py-3">
                              <Input
                                type="number"
                                step="0.01"
                                min="1.01"
                                value={coberturaBackOdd}
                                onChange={(e) => setCoberturaBackOdd(e.target.value)}
                                placeholder="0.00"
                                className="h-8 text-xs text-center px-1 w-[68px] tabular-nums"
                              />
                            </td>
                            <td className="px-1 py-3">
                              <Input
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={coberturaBackStake}
                                onChange={(e) => setCoberturaBackStake(e.target.value)}
                                placeholder="0.00"
                                className="h-8 text-xs text-center px-1 w-[90px] tabular-nums"
                              />
                            </td>
                            <td className="px-1 py-3 text-center">
                              <span className="text-xs text-muted-foreground">-</span>
                            </td>
                            <td className="px-1 py-3 text-center">
                              <span className={`text-xs font-medium tabular-nums ${
                                coberturaLucroBack !== null && coberturaLucroBack >= 0 ? "text-primary" : "text-muted-foreground"
                              }`}>
                                {(() => {
                                  const odd = parseFloat(coberturaBackOdd);
                                  const stake = parseFloat(coberturaBackStake);
                                  if (!isNaN(odd) && !isNaN(stake) && odd > 1 && stake > 0) {
                                    if (tipoApostaBack === "freebet_snr") {
                                      return formatCurrencyCanonical(stake * (odd - 1), coberturaBackSaldo?.moeda || "BRL");
                                    }
                                    return formatCurrencyCanonical(odd * stake, coberturaBackSaldo?.moeda || "BRL");
                                  }
                                  return "-";
                                })()}
                              </span>
                            </td>
                          </tr>
                          
                          {/* Linha LAY */}
                          <tr className="border-b border-border/30">
                            <td className="px-2 py-3 text-center">
                              <span className="text-xs font-medium text-foreground">LAY</span>
                            </td>
                            <td className="px-2 py-3">
                              <div className="flex flex-col gap-1">
                                <Select 
                                  value={coberturaLayBookmakerId} 
                                  onValueChange={(val) => {
                                    setCoberturaLayBookmakerId(val);
                                    const bk = bookmakers.find(b => b.id === val);
                                    if (bk) {
                                      setCoberturaLaySaldo({ 
                                        saldo: bk.saldo_total, 
                                        saldoDisponivel: bk.saldo_disponivel, 
                                        saldoFreebet: bk.saldo_freebet, 
                                        saldoBonus: bk.saldo_bonus,
                                        saldoOperavel: bk.saldo_operavel,
                                        moeda: bk.moeda,
                                        bonusRolloverStarted: bk.bonus_rollover_started || false
                                      });
                                    } else {
                                      setCoberturaLaySaldo(null);
                                    }
                                  }}
                                >
                                  <SelectTrigger className="h-8 text-xs w-full border-dashed">
                                    <BookmakerSelectTrigger
                                      bookmaker={coberturaLayBookmakerId ? (() => {
                                        const selectedBk = bookmakers.find(b => b.id === coberturaLayBookmakerId);
                                        if (selectedBk) {
                                          return {
                                            nome: selectedBk.nome,
                                            parceiro_nome: selectedBk.parceiro_nome,
                                            moeda: selectedBk.moeda,
                                            saldo_operavel: selectedBk.saldo_operavel,
                                            logo_url: selectedBk.logo_url,
                                          };
                                        }
                                        return null;
                                      })() : null}
                                      placeholder="Selecione"
                                    />
                                  </SelectTrigger>
                                  <SelectContent className="max-w-[400px]">
                                    {bookmakers.map((bk) => (
                                      <SelectItem key={bk.id} value={bk.id} className="max-w-full py-2">
                                        <BookmakerSelectOption
                                          bookmaker={{
                                            id: bk.id,
                                            nome: bk.nome,
                                            parceiro_nome: bk.parceiro_nome,
                                            moeda: bk.moeda,
                                            saldo_operavel: bk.saldo_operavel,
                                            saldo_disponivel: bk.saldo_disponivel,
                                            saldo_freebet: bk.saldo_freebet,
                                            saldo_bonus: bk.saldo_bonus,
                                            logo_url: bk.logo_url,
                                            bonus_rollover_started: bk.bonus_rollover_started,
                                          }}
                                        />
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {/* Metadados fixos - altura fixa para evitar layout jumps */}
                                <BookmakerMetaRow 
                                  bookmaker={coberturaLayBookmakerId ? (() => {
                                    const selectedBk = bookmakers.find(b => b.id === coberturaLayBookmakerId);
                                    if (!selectedBk) return null;
                                    return {
                                      parceiro_nome: selectedBk.parceiro_nome,
                                      moeda: selectedBk.moeda,
                                      saldo_operavel: selectedBk.saldo_operavel
                                    };
                                  })() : null}
                                />
                              </div>
                            </td>
                            <td className="px-1 py-3">
                              <Input
                                type="number"
                                step="0.01"
                                min="1.01"
                                value={coberturaLayOdd}
                                onChange={(e) => setCoberturaLayOdd(e.target.value)}
                                placeholder="0.00"
                                className="h-8 text-xs text-center px-1 w-[68px] tabular-nums"
                              />
                            </td>
                            <td className="px-1 py-3 text-center">
                              <span className={`text-xs font-medium tabular-nums text-muted-foreground`}>
                                {coberturaLayStake !== null ? formatCurrencyCanonical(coberturaLayStake, coberturaLaySaldo?.moeda || "BRL") : "-"}
                              </span>
                            </td>
                            <td className="px-1 py-3">
                              <Input
                                type="number"
                                step="0.1"
                                value={coberturaLayComissao}
                                onChange={(e) => setCoberturaLayComissao(e.target.value)}
                                placeholder="5"
                                className="h-8 text-xs text-center px-1 w-[60px] tabular-nums"
                              />
                            </td>
                            <td className="px-1 py-3 text-center">
                              <span className={`text-xs font-medium tabular-nums ${
                                coberturaResponsabilidade !== null && coberturaLaySaldo && coberturaResponsabilidade > coberturaLaySaldo.saldoDisponivel
                                  ? "text-destructive"
                                  : "text-muted-foreground"
                              }`}>
                                {coberturaResponsabilidade !== null ? formatCurrencyCanonical(coberturaResponsabilidade, coberturaLaySaldo?.moeda || "BRL") : "-"}
                              </span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    
                    {/* Resultados inline - discreto */}
                    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        Se BACK vencer: <span className={`font-medium ${(coberturaLucroBack ?? 0) >= 0 ? 'text-primary' : 'text-destructive'}`}>
                          {coberturaLucroBack !== null ? formatCurrencyCanonical(coberturaLucroBack, coberturaBackSaldo?.moeda || "BRL") : "-"}
                        </span>
                      </span>
                      <span>
                        Se LAY vencer: <span className={`font-medium ${(coberturaLucroLay ?? 0) >= 0 ? 'text-primary' : 'text-destructive'}`}>
                          {coberturaLucroLay !== null ? formatCurrencyCanonical(coberturaLucroLay, coberturaLaySaldo?.moeda || "BRL") : "-"}
                        </span>
                      </span>
                      <span>
                        Lucro garantido: <span className={`font-semibold ${(coberturaLucroGarantido ?? 0) >= 0 ? 'text-primary' : 'text-destructive'}`}>
                          {coberturaLucroGarantido !== null ? formatCurrencyCanonical(coberturaLucroGarantido, coberturaBackSaldo?.moeda || "BRL") : "-"}
                        </span>
                      </span>
                      {tipoApostaBack !== "normal" && coberturaTaxaExtracao !== null && (
                        <span>
                          Taxa extração: <span className={`font-medium ${
                            coberturaTaxaExtracao >= 70 ? 'text-primary' : 
                            coberturaTaxaExtracao >= 60 ? 'text-warning' : 
                            'text-destructive'
                          }`}>
                            {coberturaTaxaExtracao.toFixed(1)}%
                          </span>
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Resultado - Segmented control compacto */}
            {/* Só exibir para Bookmaker (Sportsbooks). Para Exchange/Cobertura o resultado é calculado automaticamente */}
            {tipoAposta === "bookmaker" && (
              <div className="space-y-1.5">
                <Label className="block text-center uppercase text-[10px] tracking-wider text-muted-foreground">Resultado</Label>
                <div className="flex justify-center">
                  <div className="inline-flex rounded-md border border-border/40 bg-muted/20 p-0.5 gap-0.5">
                    {[
                      { value: "PENDENTE", label: "Pendente", selectedClass: "bg-muted text-foreground", hoverClass: "hover:bg-muted/50 hover:text-foreground" },
                      { value: "GREEN", label: "Green", selectedClass: "bg-emerald-500/20 text-emerald-500", hoverClass: "hover:bg-emerald-500/20 hover:text-emerald-500" },
                      { value: "RED", label: "Red", selectedClass: "bg-red-500/20 text-red-500", hoverClass: "hover:bg-red-500/20 hover:text-red-500" },
                      { value: "MEIO_GREEN", label: "½ Green", selectedClass: "bg-teal-500/20 text-teal-500", hoverClass: "hover:bg-teal-500/20 hover:text-teal-500" },
                      { value: "MEIO_RED", label: "½ Red", selectedClass: "bg-orange-500/20 text-orange-500", hoverClass: "hover:bg-orange-500/20 hover:text-orange-500" },
                      { value: "VOID", label: "Void", selectedClass: "bg-slate-500/20 text-slate-400", hoverClass: "hover:bg-slate-500/20 hover:text-slate-400" },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setStatusResultado(option.value)}
                        className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                          statusResultado === option.value 
                            ? option.selectedClass
                            : `text-muted-foreground/60 ${option.hoverClass}`
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Lucro/Prejuízo calculado automaticamente - só mostrar quando tem resultado e valores calculados válidos */}
            {statusResultado && statusResultado !== "PENDENTE" && tipoAposta === "bookmaker" && stake && odd && parseFloat(stake) > 0 && parseFloat(odd) > 1 && (
              <div className="p-3 rounded-lg bg-muted/50 border">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Retorno Calculado:</span>
                  <span className="font-medium text-emerald-500">
                    {formatCurrencyWithSymbol(calculateValorRetorno() || 0, getSelectedBookmakerMoeda())}
                  </span>
                </div>
                {calculateLucroPrejuizo() !== null && (
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-sm text-muted-foreground">Lucro/Prejuízo:</span>
                    <span className={`font-medium ${calculateLucroPrejuizo()! >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {formatCurrencyWithSymbol(calculateLucroPrejuizo()!, getSelectedBookmakerMoeda())}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Freebet Gerada - Componente padronizado com suporte multimoeda */}
            {/* Disponível para: Bookmaker (sem usar freebet), Exchange Back/Lay (sem usar freebet) - NÃO para Cobertura (tem toggle interno) */}
            {((tipoAposta === "bookmaker" && !usarFreebetBookmaker) || 
              (tipoAposta === "exchange" && tipoOperacaoExchange !== "cobertura" && tipoApostaExchangeBack === "normal" && tipoApostaBack === "normal")) && (
              <GerouFreebetInput
                gerouFreebet={gerouFreebet}
                onGerouFreebetChange={setGerouFreebet}
                valorFreebetGerada={valorFreebetGerada}
                onValorFreebetGeradaChange={setValorFreebetGerada}
                moeda={getSelectedBookmakerMoeda()}
              />
            )}
              </div>
            </div>

            {/* FOOTER para modo embedded */}
            <div className="shrink-0 border-t border-border/50 bg-background px-4 py-3 flex justify-between">
              {aposta && (
                <Button
                  variant="destructive"
                  onClick={() => setDeleteDialogOpen(true)}
                  disabled={loading}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Excluir
                </Button>
              )}
              <div className="flex gap-2 ml-auto">
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleSave} 
                  disabled={loading || stakeReserving || (() => {
                    if (!aposta && tipoAposta === "bookmaker" && bookmakerId) {
                      const stakeNum = parseFloat(stake);
                      const saldoDisponivelReal = saldoComReservas?.disponivel ?? bookmakers.find(b => b.id === bookmakerId)?.saldo_operavel ?? 0;
                      if (!isNaN(stakeNum) && stakeNum > saldoDisponivelReal) {
                        return true;
                      }
                    }
                    return false;
                  })()}
                >
                  {loading || stakeReserving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Salvar
                </Button>
              </div>
            </div>
          </div>
        </div>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir Aposta</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir esta aposta? Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // ============================================
  // DIALOG MODE (Modal padrão shadcn)
  // ============================================
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent 
          className={`max-w-3xl max-h-[90vh] overflow-y-auto transition-all p-0 ${
            isDragging && !aposta ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''
          }`}
          ref={dialogContentRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Drag overlay */}
          {renderDragOverlay()}

          {/* HEADER UNIFICADO V2 - 3 linhas fixas (full width, sem padding do DialogContent) */}
          <BetFormHeaderV2 {...headerProps} />

          {/* CONTENT - com padding interno */}
          <div className="grid gap-5 p-4">
            {renderPrintStatusIndicators()}

            {/* ========== SELETOR DE MODO: BOOKMAKER vs EXCHANGE ========== */}
            <div className="flex items-center justify-center border-b border-border/30">
              <button
                type="button"
                onClick={() => setTipoAposta("bookmaker")}
                className={`relative px-6 py-3 text-sm font-medium transition-colors flex items-center gap-2 ${
                  tipoAposta === "bookmaker"
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <BookOpen className="h-4 w-4" />
                <span>Bookmaker</span>
                {tipoAposta === "bookmaker" && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setTipoAposta("exchange")}
                className={`relative px-6 py-3 text-sm font-medium transition-colors flex items-center gap-2 ${
                  tipoAposta === "exchange"
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <BarChart3 className="h-4 w-4" />
                <span>Exchange</span>
                {tipoAposta === "exchange" && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                )}
              </button>
            </div>

            {/* ========== MODO BOOKMAKER (Dialog) ========== */}
            {tipoAposta === "bookmaker" && (
              <>
                <div className="border border-border/50 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border/30 bg-muted/30">
                        <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-center w-[240px]">Bookmaker</th>
                        <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-center w-[70px]">Odd</th>
                        <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-center w-[100px]">Stake</th>
                        <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-center w-[120px]">Linha</th>
                        <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-center w-[110px]">Retorno</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-border/30">
                        {/* Casa */}
                        <td className="px-2 py-3">
                          <div className="flex flex-col gap-1">
                            <Select 
                              value={bookmakerId} 
                              onValueChange={(val) => {
                                setBookmakerId(val);
                                const selectedBk = bookmakers.find(b => b.id === val);
                                if (selectedBk) {
                                  setBookmakerSaldo({ 
                                    saldo: selectedBk.saldo_total, 
                                    saldoDisponivel: selectedBk.saldo_disponivel, 
                                    saldoFreebet: selectedBk.saldo_freebet, 
                                    saldoBonus: selectedBk.saldo_bonus,
                                    saldoOperavel: selectedBk.saldo_operavel,
                                    moeda: selectedBk.moeda,
                                    bonusRolloverStarted: selectedBk.bonus_rollover_started || false
                                  });
                                } else {
                                  setBookmakerSaldo(null);
                                }
                              }}
                            >
                              <SelectTrigger className="h-9 text-xs w-full border-dashed">
                                <BookmakerSelectTrigger
                                  bookmaker={bookmakerId ? (() => {
                                    const selectedBk = bookmakers.find(b => b.id === bookmakerId);
                                    if (selectedBk) {
                                      return {
                                        nome: selectedBk.nome,
                                        parceiro_nome: selectedBk.parceiro_nome,
                                        moeda: selectedBk.moeda,
                                        saldo_operavel: selectedBk.saldo_operavel,
                                        logo_url: selectedBk.logo_url,
                                      };
                                    }
                                    return null;
                                  })() : null}
                                  placeholder="Selecione"
                                />
                              </SelectTrigger>
                              <SelectContent className="max-w-[400px]">
                                {bookmakers.length === 0 ? (
                                  <div className="p-3 text-center text-sm text-muted-foreground">
                                    Nenhuma bookmaker com saldo disponível
                                  </div>
                                ) : (
                                  bookmakers.map((bk) => (
                                    <SelectItem key={bk.id} value={bk.id} className="max-w-full py-2">
                                      <BookmakerSelectOption 
                                        bookmaker={{
                                          id: bk.id,
                                          nome: bk.nome,
                                          parceiro_nome: bk.parceiro_nome,
                                          moeda: bk.moeda,
                                          saldo_operavel: bk.saldo_operavel,
                                          saldo_disponivel: bk.saldo_disponivel,
                                          saldo_freebet: bk.saldo_freebet,
                                          saldo_bonus: bk.saldo_bonus,
                                          logo_url: bk.logo_url,
                                          bonus_rollover_started: bk.bonus_rollover_started,
                                        }}
                                      />
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                            
                            {/* Metadados fixos abaixo do select - altura fixa para evitar layout jumps */}
                            <BookmakerMetaRow 
                              bookmaker={bookmakerId ? (() => {
                                const selectedBk = bookmakers.find(b => b.id === bookmakerId);
                                if (!selectedBk) return null;
                                return {
                                  parceiro_nome: selectedBk.parceiro_nome,
                                  moeda: selectedBk.moeda,
                                  saldo_operavel: saldoComReservas?.disponivel ?? selectedBk.saldo_operavel
                                };
                              })() : null}
                            />
                          </div>
                        </td>
                        {/* Odd */}
                        <td className="px-2 py-3 text-center">
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={odd}
                            onChange={(e) => setOdd(e.target.value.replace(',', '.'))}
                            placeholder="2.50"
                            className="h-9 text-center text-xs w-full"
                          />
                        </td>
                        {/* Stake */}
                        <td className="px-2 py-3 text-center">
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={stake}
                            onChange={(e) => setStake(e.target.value.replace(',', '.'))}
                            placeholder="0,00"
                            className="h-9 text-center text-xs w-full"
                          />
                        </td>
                        {/* Linha/Seleção */}
                        <td className="px-2 py-3 text-center">
                          <Input
                            value={selecao}
                            onChange={(e) => setSelecao(e.target.value)}
                            placeholder="Ex: Casa"
                            className="h-9 text-center text-xs w-full"
                          />
                        </td>
                        {/* Retorno Potencial */}
                        <td className="px-2 py-3 text-center">
                          <div className="h-9 flex items-center justify-center">
                            <span className="text-xs font-medium text-primary">
                              {odd && stake && parseFloat(odd) > 1 && parseFloat(stake) > 0
                                ? formatCurrencyCanonical(parseFloat(stake) * parseFloat(odd), getSelectedBookmakerMoeda())
                                : "—"
                              }
                            </span>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* WATERFALL: Toggle Freebet + Preview de distribuição (Dialog Mode) */}
            {tipoAposta === "bookmaker" && bookmakerSaldo && !aposta?.gerou_freebet && (
              <div className="space-y-3 mt-3 p-3 rounded-lg border border-border/30 bg-muted/5">
                <FreebetToggle
                  checked={usarFreebetBookmaker}
                  onCheckedChange={(checked) => {
                    setUsarFreebetBookmaker(checked);
                    if (checked) {
                      setGerouFreebet(false);
                      setValorFreebetGerada("");
                    }
                  }}
                  saldoFreebet={bookmakerSaldo.saldoFreebet}
                  moeda={bookmakerSaldo.moeda}
                  disabled={!!aposta?.tipo_freebet}
                />
                
                {bookmakerId && parseFloat(stake) > 0 && (
                  <SaldoWaterfallPreview
                    stake={parseFloat(stake) || 0}
                    saldoBonus={bookmakerSaldo.saldoBonus}
                    saldoFreebet={bookmakerSaldo.saldoFreebet}
                    saldoReal={bookmakerSaldo.saldoDisponivel}
                    usarFreebet={usarFreebetBookmaker}
                    moeda={bookmakerSaldo.moeda}
                  />
                )}
              </div>
            )}

            {/* Observações */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Observações</Label>
              <Textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Anotações opcionais sobre esta aposta..."
                className="text-xs min-h-[60px] resize-none"
              />
            </div>

            {/* Freebet e Resultado para Dialog mode */}
            {aposta && (
              <div className="border border-border/50 rounded-lg p-3 space-y-3">
                <Label className="text-xs font-medium">Resultado</Label>
                <div className="flex flex-wrap gap-1">
                  {[
                    { value: "PENDENTE", label: "Pendente", selectedClass: "bg-muted text-muted-foreground", hoverClass: "hover:bg-muted" },
                    { value: "GREEN", label: "Green", selectedClass: "bg-emerald-500/20 text-emerald-500", hoverClass: "hover:bg-emerald-500/20 hover:text-emerald-500" },
                    { value: "RED", label: "Red", selectedClass: "bg-red-500/20 text-red-500", hoverClass: "hover:bg-red-500/20 hover:text-red-500" },
                    { value: "MEIO_GREEN", label: "½ Green", selectedClass: "bg-teal-500/20 text-teal-500", hoverClass: "hover:bg-teal-500/20 hover:text-teal-500" },
                    { value: "MEIO_RED", label: "½ Red", selectedClass: "bg-orange-500/20 text-orange-500", hoverClass: "hover:bg-orange-500/20 hover:text-orange-500" },
                    { value: "VOID", label: "Void", selectedClass: "bg-slate-500/20 text-slate-400", hoverClass: "hover:bg-slate-500/20 hover:text-slate-400" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setStatusResultado(option.value)}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                        statusResultado === option.value 
                          ? option.selectedClass
                          : `text-muted-foreground/60 ${option.hoverClass}`
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Freebet Gerada */}
            {tipoAposta === "bookmaker" && !usarFreebetBookmaker && (
              <GerouFreebetInput
                gerouFreebet={gerouFreebet}
                onGerouFreebetChange={setGerouFreebet}
                valorFreebetGerada={valorFreebetGerada}
                onValorFreebetGeradaChange={setValorFreebetGerada}
                moeda={getSelectedBookmakerMoeda()}
              />
            )}
          </div>

          <DialogFooter className="px-4 py-3 border-t border-border/50">
            {aposta && (
              <Button
                variant="destructive"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={loading}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                Cancelar
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={loading || stakeReserving || (() => {
                  if (!aposta && tipoAposta === "bookmaker" && bookmakerId) {
                    const stakeNum = parseFloat(stake);
                    const saldoDisponivelReal = saldoComReservas?.disponivel ?? bookmakers.find(b => b.id === bookmakerId)?.saldo_operavel ?? 0;
                    if (!isNaN(stakeNum) && stakeNum > saldoDisponivelReal) {
                      return true;
                    }
                  }
                  return false;
                })()}
              >
                {loading || stakeReserving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Aposta</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta aposta? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
