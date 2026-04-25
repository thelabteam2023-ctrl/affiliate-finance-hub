import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useBookmakerSaldosQuery, useInvalidateBookmakerSaldos, type BookmakerSaldo } from "@/hooks/useBookmakerSaldosQuery";
import { useInvalidateAfterMutation } from "@/hooks/useInvalidateAfterMutation";
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
import { DateAnomalyAlert } from "@/components/ui/date-anomaly-alert";
import { liquidarAposta, reverterLiquidacao } from "@/lib/financialEngine";
import { estornarFreebetViaLedger, creditarFreebetViaLedger, consumirFreebetViaLedger } from "@/lib/freebetLedgerService";
import { RegistroApostaValues, validateRegistroAposta, getSuggestionsForTab } from "./RegistroApostaFields";
import { BetFormHeaderV2 } from "@/components/apostas/BetFormHeaderV2";
import { FONTE_SALDO, getContextoFromTab, isAbaContextoFixo, type ApostaEstrategia, type ContextoOperacional, type FonteSaldo } from "@/lib/apostaConstants";
import { useFonteSaldoDefault } from "@/components/apostas/FonteSaldoSelector";
import { toLocalTimestamp, validarDataAposta, dbTimestampToDatetimeLocal } from "@/utils/dateUtils";
import { 
  BookmakerSelectOption,
  BookmakerSelectTrigger,
  BookmakerMetaRow,
  formatCurrency as formatCurrencyCanonical,
  getCurrencyTextColor,
  getCurrencySymbol 
} from "@/components/bookmakers/BookmakerSelectOption";
import { BookmakerSearchableSelectContent } from "@/components/bookmakers/BookmakerSearchableSelectContent";
import { reliquidarAposta, deletarAposta } from "@/services/aposta";
// MOTOR FINANCEIRO v9.5: updateBookmakerBalance REMOVIDO - saldos são atualizados exclusivamente via trigger
import { useBonusBalanceManager } from "@/hooks/useBonusBalanceManager";
import { GerouFreebetInput } from "./GerouFreebetInput";
import { useActiveBonusInfo } from "@/hooks/useActiveBonusInfo";
import { BonusImpactAlert } from "./BonusImpactAlert";
import { FreebetToggle, SaldoWaterfallPreview } from "@/components/apostas/waterfall";
import { Plus, Trash2 as Trash2Entry, Layers } from "lucide-react";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
import { FonteEntradaSelector } from "@/components/apostas/FonteEntradaSelector";
import { useWorkspaceBetSources } from "@/hooks/useWorkspaceBetSources";
import { deriveStakeSplit, derivePersistedStakeSplit } from "@/lib/freebetStake";

// Multi-entry para aposta simples (mesma seleção, múltiplas bookmakers)
interface AdditionalEntry {
  id: string;
  bookmaker_id: string;
  odd: string;
  stake: string;
  selecao_livre: string;
  /** @deprecated Derivado de valor_freebet > 0. Mantido para compatibilidade com RPCs. */
  usar_freebet: boolean;
  /** Valor de freebet a usar (parcial ou total). Stake real = stake - valor_freebet */
  valor_freebet: string;
}

const generateEntryId = () => Math.random().toString(36).substring(2, 9);
const MAX_ADDITIONAL_ENTRIES = 4; // + 1 principal = 5 total


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
  usar_freebet?: boolean | null;
  fonte_saldo?: string | null;
  stake_real?: number | null;
  stake_freebet?: number | null;
  stake_total?: number | null;
}

// Interface de Bookmaker local (mapeada do hook canônico)
interface Bookmaker {
  id: string;
  nome: string;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  instance_identifier: string | null;
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
  "Handebol",
  "Futebol Americano",
  "Vôlei",
  "MMA/UFC",
  "League of Legends",
  "Counter-Strike",
  "Dota 2",
  "Valorant",
  "eFootball",
  "Rugby",
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
  "Valorant": [
    "Vencedor do Mapa",
    "Vencedor da Série",
    "Total de Mapas",
    "Total de Rounds",
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
  const { convertToConsolidation, moedaConsolidacao } = useProjetoCurrency(projetoId);
  const [loading, setLoading] = useState(false);
  const { favoriteSource } = useWorkspaceBetSources(workspaceId);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // ========== HOOK CANÔNICO DE SALDOS ==========
  // Esta é a ÚNICA fonte de verdade para saldos de bookmaker
  const { 
    data: bookmakerSaldos = [], 
    isLoading: saldosLoading,
    isFetching: saldosFetching,
    refetch: refetchSaldos 
  } = useBookmakerSaldosQuery({
    projetoId,
    enabled: open,
    includeZeroBalance: true, // Permitir selecionar mesmo com saldo 0 (registro histórico/ajustes)
    currentBookmakerId: aposta?.bookmaker_id || null
  });
  const invalidateSaldos = useInvalidateBookmakerSaldos();
  const invalidateAfterMutation = useInvalidateAfterMutation();
  
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
  // Em modo edição, SEMPRE incluir a bookmaker atual para evitar "Selecione" vazio
  const editModeBookmakerIds = useMemo(() => {
    if (!aposta) return new Set<string>();
    const ids = new Set<string>();
    if (aposta.bookmaker_id) ids.add(aposta.bookmaker_id);
    return ids;
  }, [aposta]);

  const bookmakers = useMemo((): Bookmaker[] => {
    return bookmakerSaldos
      .filter(bk => !bk.has_pending_transactions) // Bloquear casas não conciliadas
      .filter(bk => bk.saldo_operavel >= 0.50 || editModeBookmakerIds.has(bk.id)) // Em edição, incluir bookmaker atual mesmo sem saldo
      .map(bk => ({
        id: bk.id,
        nome: bk.nome,
        parceiro_id: bk.parceiro_id,
        parceiro_nome: bk.parceiro_nome,
        instance_identifier: bk.instance_identifier,
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
  }, [bookmakerSaldos, editModeBookmakerIds]);

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
    dateAnomaly: printDateAnomaly,
    dateAnomalyConfirmed: printDateAnomalyConfirmed,
    processImage: processPrintImage,
    processFromClipboard: processPrintClipboard,
    clearParsedData: clearPrintData,
    confirmDateAnomaly: confirmPrintDateAnomaly,
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
  const [fonteEntrada, setFonteEntrada] = useState<string | null>(null);

  // Check if current mercado is Moneyline (uses select instead of free text)
  const isMoneyline = isMoneylineMercado(mercado);

  // Get Moneyline options for current sport/evento - NEVER inject OCR values
  const moneylineOptions = isMoneyline ? getMoneylineSelecoes(esporte, evento) : [];

  // Effective selection (always the selecao state now)
  const effectiveSelecao = selecao;

  // Multi-entry: entradas adicionais (a primeira é bookmakerId/odd/stake/selecao)
  const [additionalEntries, setAdditionalEntries] = useState<AdditionalEntry[]>([]);
  const multiEntryTableRef = useRef<HTMLDivElement>(null);

  const handleMultiEntryFieldKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>, fieldType: 'odd' | 'stake') => {
    const key = e.key.toLowerCase();
    if (key !== 'q' && key !== 's') return;

    e.preventDefault();
    const container = multiEntryTableRef.current;
    if (!container) return;

    const targetFieldType: 'odd' | 'stake' = key === 'q' ? 'odd' : 'stake';
    const selector = targetFieldType === 'odd' ? 'input[data-field-type="odd"]' : 'input[data-field-type="stake"]';
    const allFields = Array.from(container.querySelectorAll<HTMLInputElement>(selector));
    if (allFields.length === 0) return;

    const sameTypeNavigation = targetFieldType === fieldType;
    const currentIndex = allFields.indexOf(e.currentTarget);
    const nextIndex = sameTypeNavigation && currentIndex >= 0
      ? (currentIndex + 1) % allFields.length
      : 0;

    allFields[nextIndex]?.focus();
    allFields[nextIndex]?.select();
  }, []);

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
  // Valor de freebet a utilizar (editável pelo operador)
  const [valorFreebetUsar, setValorFreebetUsar] = useState(0);
  
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

  // ============= SALDO AJUSTADO PARA EDIÇÃO =============
  // LÓGICA CORRETA:
  // - PENDENTE: stake foi debitado mas não há payout. O saldo atual JÁ reflete isso.
  //   Se editarmos, precisamos "devolver" o stake virtualmente (ele será restaurado na reversão).
  // - GREEN/VOID: stake foi debitado E payout foi creditado. O saldo atual JÁ inclui o resultado.
  //   NÃO adicionar stake - o saldo atual é o correto para operação.
  // - RED: stake foi debitado, sem payout. O saldo atual JÁ perdeu o stake.
  //   Para editar (ex: RED→GREEN), precisamos adicionar stake virtualmente.
  const saldoAjustadoParaEdicao = useMemo(() => {
    const selectedBk = bookmakers.find(b => b.id === bookmakerId);
    if (!selectedBk) return null;
    
    const mesmaBookmaker = aposta?.bookmaker_id === bookmakerId;
    
    // Só adicionar stake anterior em casos específicos:
    // 1. PENDENTE: stake foi "travado" (debitado), será devolvido na reversão
    // 2. RED/MEIO_RED: stake foi perdido definitivamente, precisa ser considerado para validação
    // 3. GREEN/VOID/MEIO_GREEN: stake JÁ retornou via payout, NÃO adicionar
    const resultadoAnterior = aposta?.resultado;
    const deveAdicionarStake = 
      (aposta?.status === 'PENDENTE') || 
      (aposta?.status === 'LIQUIDADA' && (resultadoAnterior === 'RED' || resultadoAnterior === 'MEIO_RED'));
    
    const stakeAnterior = aposta && mesmaBookmaker && deveAdicionarStake
      ? derivePersistedStakeSplit({
          stake: aposta.stake,
          stake_total: aposta.stake_total,
          stake_real: aposta.stake_real,
          stake_freebet: aposta.stake_freebet,
        }).stakeReal
      : 0;
    
    return {
      saldoOperavel: selectedBk.saldo_operavel + stakeAnterior,
      saldoDisponivel: selectedBk.saldo_disponivel + stakeAnterior,
      moeda: selectedBk.moeda,
      stakeAnterior,
    };
  }, [bookmakers, bookmakerId, aposta]);

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
      
      // NEW: Fill resultado from print/inference if detected
      if (data.resultado) {
        const resultMap: Record<string, string> = {
          "green": "GREEN", "Green": "GREEN", "GREEN": "GREEN", "won": "GREEN", "Won": "GREEN",
          "red": "RED", "Red": "RED", "RED": "RED", "lost": "RED", "Lost": "RED",
          "half green": "MEIO_GREEN", "Half Green": "MEIO_GREEN", "MEIO_GREEN": "MEIO_GREEN",
          "half red": "MEIO_RED", "Half Red": "MEIO_RED", "MEIO_RED": "MEIO_RED",
          "void": "VOID", "Void": "VOID", "VOID": "VOID",
        };
        const mapped = resultMap[data.resultado] || data.resultado.toUpperCase();
        if (["GREEN", "RED", "MEIO_GREEN", "MEIO_RED", "VOID"].includes(mapped)) {
          setStatusResultado(mapped);
        }
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
      // CRÍTICO: Forçar refetch dos saldos ao abrir o modal
      // Isso garante dados frescos, especialmente após liquidações recentes
      refetchSaldos();
      
      if (aposta) {
        setDataAposta(dbTimestampToDatetimeLocal(aposta.data_aposta));
        setEsporte(aposta.esporte);
        // Usar evento direto (campo já unificado no banco)
        setEvento(aposta.evento || "");
        setOdd(aposta.odd?.toString() || "");
        const stakeSplit = derivePersistedStakeSplit({
          stake: aposta.stake,
          stake_total: aposta.stake_total,
          stake_real: aposta.stake_real,
          stake_freebet: aposta.stake_freebet,
        });
        if (aposta.modo_entrada !== "EXCHANGE") {
          const persistedStakeReal = Number(aposta.stake_real ?? stakeSplit.stakeReal ?? 0);
          const persistedStakeFreebet = Number(aposta.stake_freebet ?? stakeSplit.stakeFreebet ?? 0);
          setStake(persistedStakeReal > 0 ? persistedStakeReal.toString() : "0");
          setValorFreebetUsar(persistedStakeFreebet);
          setUsarFreebetBookmaker(persistedStakeFreebet > 0);
        } else {
          setStake(aposta.stake?.toString() || "");
          setValorFreebetUsar(0);
          setUsarFreebetBookmaker(false);
        }
        setStatusResultado(aposta.resultado || aposta.status);
        setValorRetorno(aposta.valor_retorno?.toString() || "");
        setObservacoes(aposta.observacoes || "");
        setFonteEntrada((aposta as any).fonte_entrada || null);

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
          
          // Multi-entry: carregar pernas adicionais de apostas_pernas
          (async () => {
            // Em duplicação, o id original foi removido; usar __seedPernas injetado pela página de janela
            const seedPernas = (aposta as any).__seedPernas as any[] | null | undefined;
            let pernas: any[] | null = null;
            if (seedPernas && seedPernas.length > 0) {
              pernas = seedPernas;
            } else if (aposta.id) {
              const { data } = await supabase
                .from("apostas_pernas")
                .select("*")
                .eq("aposta_id", aposta.id)
                .order("ordem", { ascending: true });
              pernas = data;
            }
            
            if (pernas && pernas.length > 1) {
              // Primeira perna = entrada principal (já carregada via aposta.odd/stake/bookmaker_id)
              // Pernas restantes = additionalEntries
              const primaryPerna = pernas[0];
              // Atualizar primary com dados da perna (podem diferir do agregado)
              setBookmakerId(primaryPerna.bookmaker_id);
              setOdd(primaryPerna.odd.toString());
              const primaryStakeSplit = derivePersistedStakeSplit({
                stake: primaryPerna.stake,
                stake_total: primaryPerna.stake,
                stake_real: primaryPerna.stake_real,
                stake_freebet: primaryPerna.stake_freebet,
              });
              setStake(primaryStakeSplit.stakeReal > 0 ? primaryStakeSplit.stakeReal.toString() : '0');
              setUsarFreebetBookmaker(primaryStakeSplit.usesFreebet);
              setValorFreebetUsar(primaryStakeSplit.stakeFreebet);
              
              const extras = pernas.slice(1).map(p => {
                const split = derivePersistedStakeSplit({
                  stake: p.stake,
                  stake_total: p.stake,
                  stake_real: p.stake_real,
                  stake_freebet: p.stake_freebet,
                });
                return {
                  id: p.id,
                  bookmaker_id: p.bookmaker_id,
                  odd: p.odd.toString(),
                  stake: split.stakeReal > 0 ? split.stakeReal.toString() : '0',
                  selecao_livre: p.selecao_livre || '',
                  usar_freebet: split.usesFreebet,
                  valor_freebet: split.stakeFreebet > 0 ? split.stakeFreebet.toString() : '0',
                };
              });
              setAdditionalEntries(extras);
            }
          })();
        }

        // Freebet tracking
        setGerouFreebet(aposta.gerou_freebet || false);
        setValorFreebetGerada(aposta.valor_freebet_gerada?.toString() || "");
        
        // Se a aposta usou freebet (bookmaker simples), restaurar flag APENAS com base no stake_freebet persistido
        if (aposta.tipo_freebet && aposta.tipo_freebet !== "normal" && aposta.modo_entrada === "PADRAO") {
          setUsarFreebetBookmaker((prev) => prev || Number(aposta.stake_freebet ?? 0) > 0);
        }
        
        // Restaurar campos de registro (estrategia, forma_registro, contexto_operacional, fonte_saldo)
        // CRÍTICO: forma_registro NUNCA pode ser null - usar 'SIMPLES' como fallback robusto
        // NOVO: fonte_saldo também precisa ser restaurado (default 'REAL' para dados legados)
        setRegistroValues({
          forma_registro: 'SIMPLES',
          estrategia: aposta.estrategia === 'SUREBET' ? 'PUNTER' : ((aposta.estrategia as ApostaEstrategia) || null),
          contexto_operacional: (aposta.contexto_operacional as ContextoOperacional) || null,
          fonte_saldo: (aposta.fonte_saldo as FonteSaldo) || 'REAL', // Legado: default REAL
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
      const defaultSimpleEstrategia = (defaultEstrategia || 'PUNTER') as ApostaEstrategia;
      const lockedContexto = isAbaContextoFixo(activeTab) ? getContextoFromTab(activeTab) : null;
      
      // Inferir fonte_saldo baseado na aba ativa ou estratégia
      const inferredFonteSaldo = (() => {
        if (activeTab === 'freebets') return 'FREEBET' as FonteSaldo;
        if (activeTab === 'bonus' || activeTab === 'bonus-operacoes') return 'BONUS' as FonteSaldo;
        // Para outras abas, inferir da estratégia
        const estrategiaAtual = registroValues.estrategia || defaultSimpleEstrategia;
        if (estrategiaAtual === 'EXTRACAO_FREEBET') return 'FREEBET' as FonteSaldo;
        if (estrategiaAtual === 'EXTRACAO_BONUS') return 'BONUS' as FonteSaldo;
        return 'REAL' as FonteSaldo;
      })();
      
      setRegistroValues(prev => {
        const updates: Partial<typeof prev> = {};
        
        // Aposta Simples não herda estratégia da aba: usa o default explícito da janela.
        if (!prev.estrategia && defaultSimpleEstrategia) {
          updates.estrategia = defaultSimpleEstrategia;
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
  }, [open, aposta, activeTab, defaultEstrategia, registroValues.estrategia]);

  // Auto-select favorite source when opening new ValueBet
  useEffect(() => {
    if (open && !aposta && fonteEntrada === null && favoriteSource && registroValues.estrategia === 'VALUEBET') {
      setFonteEntrada(favoriteSource.name);
    }
  }, [open, aposta, favoriteSource, registroValues.estrategia, fonteEntrada]);

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

  // Nota: NÃO resetar mercado ao mudar esporte - o usuário pode preencher em qualquer ordem

  // NOTE: selecao (Linha) is NOT reset when mercado changes.
  // Users frequently edit mercado without wanting to lose the Linha value.
  // Selecao is only reset on full form reset (resetForm) or new print import.

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
    setAdditionalEntries([]);
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
    setValorFreebetUsar(0);
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
    // fonte_entrada mantida para preservar última escolha na sessão
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

  // Stake efetiva para Bookmaker:
  // NOVA SEMÂNTICA: stake = saldo real, valorFreebetUsar = saldo FB. Total = real + FB.
  const stakeBookmakerEfetiva = useMemo(() => {
    const stakeReal = parseFloat(stake) || 0;
    const fbValor = usarFreebetBookmaker ? valorFreebetUsar : 0;
    return stakeReal + fbValor;
  }, [stake, usarFreebetBookmaker, valorFreebetUsar]);

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
      // Modo Bookmaker: exige odd e bookmaker. Stake pode vir do campo Stake
      // ou, em cenário somente freebet, do valor de freebet informado.
      if (!odd) {
        toast.error("Preencha a Odd");
        return;
      }
      
      const oddNum = parseFloat(odd);
      if (isNaN(oddNum) || oddNum <= 1) {
        toast.error("Odd deve ser maior que 1.00");
        return;
      }

      const stakeNum = stakeBookmakerEfetiva;
      if (!Number.isFinite(stakeNum) || stakeNum <= 0) {
        toast.error(
          usarFreebetBookmaker
            ? "Informe Stake real ou Valor de Freebet maior que 0"
            : "Stake deve ser maior que 0"
        );
        return;
      }

      if (usarFreebetBookmaker) {
        if (valorFreebetUsar <= 0) {
          toast.error("Valor de Freebet deve ser maior que 0");
          return;
        }
      }

      if (!bookmakerId) {
        toast.error("Selecione a bookmaker");
        return;
      }

      // Validar entradas adicionais (multi-entry)
      for (let i = 0; i < additionalEntries.length; i++) {
        const entry = additionalEntries[i];
        if (!entry.bookmaker_id) {
          toast.error(`Entrada ${i + 2}: selecione a bookmaker`);
          return;
        }
        const entryOdd = parseFloat(entry.odd);
        if (isNaN(entryOdd) || entryOdd <= 1) {
          toast.error(`Entrada ${i + 2}: odd deve ser maior que 1.00`);
          return;
        }
        const entryStakeReal = parseFloat(entry.stake) || 0;
        const entryFbValor = entry.usar_freebet ? (parseFloat(entry.valor_freebet) || 0) : 0;
        const entryTotalStake = entryStakeReal + entryFbValor;
        if (entryTotalStake <= 0) {
          toast.error(`Entrada ${i + 2}: stake total (real + FB) deve ser maior que 0`);
          return;
        }
        // Validar freebet em entradas adicionais
        if (entry.usar_freebet) {
          const entryBk = bookmakers.find(b => b.id === entry.bookmaker_id);
          if (entryFbValor <= 0) {
            toast.error(`Entrada ${i + 2}: valor de Freebet deve ser maior que 0`);
            return;
          }
          if (entryBk && entryFbValor > entryBk.saldo_freebet) {
            toast.error(`Entrada ${i + 2}: valor FB (${formatCurrencyWithSymbol(entryFbValor, entryBk.moeda)}) excede saldo de Freebet (${formatCurrencyWithSymbol(entryBk.saldo_freebet, entryBk.moeda)})`);
            return;
          }
        }
      }

      // Validar stake vs saldo operável da bookmaker (real + freebet + bonus)
      // CORREÇÃO CRÍTICA: Para edição de apostas (PENDENTE ou LIQUIDADA),
      // considerar o stake anterior como "disponível" pois a reversão irá restaurá-lo.
      // Isso permite re-liquidação (ex: mudar GREEN para RED).
      const selectedBookmaker = bookmakers.find(b => b.id === bookmakerId);
      if (selectedBookmaker) {
        if (usarFreebetBookmaker && valorFreebetUsar > selectedBookmaker.saldo_freebet) {
          toast.error(
            `Valor de Freebet (${formatCurrencyWithSymbol(valorFreebetUsar, selectedBookmaker.moeda)}) maior que o saldo de Freebet disponível (${formatCurrencyWithSymbol(selectedBookmaker.saldo_freebet, selectedBookmaker.moeda)})`
          );
          return;
        }

        // Para edição: stake anterior é "livre" apenas se a bookmaker não mudou
        const mesmaBookmaker = aposta?.bookmaker_id === bookmakerId;
        const splitApostaAtual = aposta
          ? derivePersistedStakeSplit({
              stake: aposta.stake,
              stake_total: aposta.stake_total,
              stake_real: aposta.stake_real,
              stake_freebet: aposta.stake_freebet,
            })
          : null;
        const stakeRealAnterior = aposta && mesmaBookmaker ? splitApostaAtual?.stakeReal ?? 0 : 0;
        const saldoRealParaValidar = selectedBookmaker.saldo_disponivel + stakeRealAnterior;
        
        if (stakeNum > saldoRealParaValidar) {
          const moeda = selectedBookmaker.moeda;
          toast.error(`Stake (${formatCurrencyWithSymbol(stakeNum, moeda)}) maior que o saldo real disponível (${formatCurrencyWithSymbol(saldoRealParaValidar, moeda)})`);
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
            // CORREÇÃO: Para edição, liability anterior está "livre" se mesma exchange
            const mesmaExchange = aposta?.bookmaker_id === exchangeBookmakerId;
            const liabilityAnterior = aposta && mesmaExchange && aposta?.lay_liability ? aposta.lay_liability : 0;
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
            // CORREÇÃO: Para edição, liability anterior está "livre" se mesma exchange
            const mesmaExchange = aposta?.bookmaker_id === coberturaLayBookmakerId;
            const liabilityAnterior = aposta && mesmaExchange && aposta?.lay_liability ? aposta.lay_liability : 0;
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
      
      // TRAVA DEFINITIVA: Validar data antes de salvar
      const dataValidation = validarDataAposta(dataAposta);
      if (!dataValidation.valid) {
        toast.error(dataValidation.error || "Data inválida");
        return;
      }
      
      // CRÍTICO: Obter moeda da bookmaker selecionada para evitar conversão incorreta
      // A moeda_operacao DEVE refletir a moeda nativa da casa de apostas
      const selectedBookmakerId = tipoAposta === "bookmaker" 
        ? bookmakerId 
        : (tipoOperacaoExchange === "cobertura" ? coberturaBackBookmakerId : exchangeBookmakerId);
      const selectedBookmaker = bookmakers.find(bk => bk.id === selectedBookmakerId);
      const moedaOperacao = selectedBookmaker?.moeda || "BRL";
      const estrategiaSimples = registroValues.estrategia === 'SUREBET'
        ? 'PUNTER'
        : registroValues.estrategia;

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
        gerou_freebet: false,
        valor_freebet_gerada: null,
        // Campos explícitos do Prompt Oficial - NUNCA inferidos
        estrategia: estrategiaSimples,
        forma_registro: 'SIMPLES',
        // contexto_operacional: respeitar valor selecionado no formulário (NORMAL, BONUS, FREEBET)
        contexto_operacional: registroValues.contexto_operacional || 'NORMAL',
        // VERDADE FINANCEIRA: fonte_saldo é a fonte de verdade
        fonte_saldo: usarFreebetBookmaker ? 'FREEBET' : 'REAL',
        // @deprecated: usar_freebet derivado de fonte_saldo, mantido para compat RPC
        usar_freebet: usarFreebetBookmaker,
        fonte_entrada: estrategiaSimples === 'VALUEBET' ? (fonteEntrada || 'Manual') : null,
        // CRÍTICO: Moeda da operação = moeda nativa da bookmaker
        moeda_operacao: moedaOperacao,
      };

      if (tipoAposta === "bookmaker") {
        // ===== MODO BOOKMAKER =====
        // Usa campos odd, stake, bookmakerId exclusivos desta aba
        const bookmakerOdd = parseFloat(odd);
        const bookmakerStake = stakeBookmakerEfetiva;
        
        // Multi-entry: calcular odd média ponderada (multi-moeda) e stake total
        const hasMultiEntry = additionalEntries.length > 0;
        let effectiveOdd = bookmakerOdd;
        let effectiveStake = bookmakerStake;
        
        // Multi-currency tracking (parent record consolidation)
        let isMulticurrency = false;
        let totalStakeConsolidadoParent = 0;
        let totalStakeRealConsolidadoParent = 0;
        let totalStakeFreebetConsolidadoParent = 0;
        const primaryMoedaForCheck = selectedBookmaker?.moeda || 'BRL';

        if (hasMultiEntry) {
          const primaryMoeda = primaryMoedaForCheck;
          const allEntries = [
            { odd: bookmakerOdd, stake: bookmakerStake, moeda: primaryMoeda },
            ...additionalEntries.map(e => {
              const bk = bookmakers.find(b => b.id === e.bookmaker_id);
              const entryReal = parseFloat(e.stake) || 0;
              const entryFb = e.usar_freebet ? (parseFloat(e.valor_freebet) || 0) : 0;
              return { odd: parseFloat(e.odd) || 0, stake: entryReal + entryFb, moeda: bk?.moeda || 'BRL' };
            })
          ].filter(e => e.stake > 0 && e.odd > 0);

          // Detectar multi-moeda
          const moedasUnicas = new Set(allEntries.map(e => e.moeda));
          isMulticurrency = moedasUnicas.size > 1;
          
          // Converter stakes para moeda de consolidação para ponderação correta
          let totalStakeConsolidado = 0;
          let weightedOddSum = 0;
          effectiveStake = 0;
          
          for (const e of allEntries) {
            const stakeConsolidado = convertToConsolidation(e.stake, e.moeda);
            totalStakeConsolidado += stakeConsolidado;
            weightedOddSum += e.odd * stakeConsolidado;
            effectiveStake += e.stake; // Nominal total (para exibição/single-currency)
          }
          
          totalStakeConsolidadoParent = totalStakeConsolidado;

          effectiveOdd = totalStakeConsolidado > 0
            ? weightedOddSum / totalStakeConsolidado
            : bookmakerOdd;

          // Consolidar stake_real e stake_freebet (cross-currency safe)
          {
            const primaryReal = parseFloat(stake) || 0;
            const primaryFb = usarFreebetBookmaker ? valorFreebetUsar : 0;
            totalStakeRealConsolidadoParent = convertToConsolidation(primaryReal, primaryMoeda);
            totalStakeFreebetConsolidadoParent = convertToConsolidation(primaryFb, primaryMoeda);
            for (const ae of additionalEntries) {
              const bk = bookmakers.find(b => b.id === ae.bookmaker_id);
              const aeMoeda = bk?.moeda || 'BRL';
              const aeReal = parseFloat(ae.stake) || 0;
              const aeFb = ae.usar_freebet ? (parseFloat(ae.valor_freebet) || 0) : 0;
              totalStakeRealConsolidadoParent += convertToConsolidation(aeReal, aeMoeda);
              totalStakeFreebetConsolidadoParent += convertToConsolidation(aeFb, aeMoeda);
            }
          }
        }
        
        // Calcular P/L para Bookmaker
        // IMPORTANTE: Se usa freebet, o tratamento é diferente:
        // - GREEN: lucro = stake * (odd - 1), mas stake não volta
        // - RED: prejuízo = 0 (freebet já foi consumida)
        if (statusResultado !== "PENDENTE") {
          if (usarFreebetBookmaker) {
            // Aposta com Freebet (tratamento SNR)
            switch (statusResultado) {
              case "GREEN":
                lucroPrejuizo = effectiveStake * (effectiveOdd - 1); // Só o lucro
                valorRetornoCalculado = effectiveStake * (effectiveOdd - 1); // Stake não volta
                break;
              case "RED":
                lucroPrejuizo = 0; // Freebet já consumida, não é prejuízo real
                valorRetornoCalculado = 0;
                break;
              case "MEIO_GREEN":
                lucroPrejuizo = effectiveStake * (effectiveOdd - 1) / 2;
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
                lucroPrejuizo = effectiveStake * (effectiveOdd - 1);
                valorRetornoCalculado = effectiveStake * effectiveOdd;
                break;
              case "RED":
                lucroPrejuizo = -effectiveStake;
                valorRetornoCalculado = 0;
                break;
              case "MEIO_GREEN":
                lucroPrejuizo = effectiveStake * (effectiveOdd - 1) / 2;
                valorRetornoCalculado = effectiveStake + lucroPrejuizo;
                break;
              case "MEIO_RED":
                lucroPrejuizo = -effectiveStake / 2;
                valorRetornoCalculado = effectiveStake / 2;
                break;
              case "VOID":
                lucroPrejuizo = 0;
                valorRetornoCalculado = effectiveStake;
                break;
            }
          }
        }

        const bookmakerStakeReal = parseFloat(stake) || 0;
        const bookmakerStakeFreebet = usarFreebetBookmaker ? valorFreebetUsar : 0;
        const additionalStakeReal = additionalEntries.reduce((sum, entry) => sum + (parseFloat(entry.stake) || 0), 0);
        const additionalStakeFreebet = additionalEntries.reduce(
          (sum, entry) => sum + (entry.usar_freebet ? (parseFloat(entry.valor_freebet) || 0) : 0),
          0
        );

        // ============================================================
        // MULTI-ENTRY CONSOLIDATION:
        // Quando há múltiplas entradas em moedas diferentes, persistimos
        // o agregado JÁ NA MOEDA DE CONSOLIDAÇÃO do projeto e marcamos
        // moeda_operacao='MULTI'. Cada perna preserva sua moeda nativa.
        // ============================================================
        const isMultiCC = hasMultiEntry && isMulticurrency;
        const parentStake = isMultiCC ? totalStakeConsolidadoParent : effectiveStake;
        const parentStakeReal = isMultiCC
          ? totalStakeRealConsolidadoParent
          : (bookmakerStakeReal + additionalStakeReal);
        const parentStakeFreebet = isMultiCC
          ? totalStakeFreebetConsolidadoParent
          : (bookmakerStakeFreebet + additionalStakeFreebet);
        const parentLucroPrejuizo = (isMultiCC && statusResultado !== 'PENDENTE')
          ? convertToConsolidation(lucroPrejuizo, primaryMoedaForCheck)
          : lucroPrejuizo;
        const parentValorRetorno = isMultiCC
          ? convertToConsolidation(valorRetornoCalculado, primaryMoedaForCheck)
          : valorRetornoCalculado;

        apostaData = {
          ...commonData,
          moeda_operacao: isMultiCC ? 'MULTI' : moedaOperacao,
          is_multicurrency: isMultiCC,
          consolidation_currency: isMultiCC ? moedaConsolidacao : null,
          // CANÔNICO: aposta multi-entry (multi-bookmaker) grava bookmaker_id=NULL no pai,
          // exatamente como Surebet/Múltipla. Assim o get_bookmaker_saldos distribui o
          // "em jogo" pelas pernas reais (apostas_pernas) em vez de concentrar tudo na
          // primeira casa. Quando há apenas 1 entrada, mantém o bookmaker_id no pai.
          bookmaker_id: hasMultiEntry ? null : bookmakerId,
          odd: Math.round(effectiveOdd * 100000) / 100000, // 5 casas decimais (padrão de precisão)
          stake: parentStake,
          modo_entrada: "PADRAO",
          valor_retorno: parentValorRetorno,
          lucro_prejuizo: parentLucroPrejuizo,
          lay_exchange: null,
          lay_odd: null,
          lay_stake: null,
          lay_liability: null,
          lay_comissao: null,
          back_em_exchange: false,
          back_comissao: null,
          tipo_freebet: (usarFreebetBookmaker || additionalEntries.some(e => e.usar_freebet)) ? "freebet_snr" : null,
          stake_real: parentStakeReal,
          stake_freebet: parentStakeFreebet,
          stake_total: parentStake,
          stake_consolidado: isMultiCC ? parentStake : null,
          pl_consolidado: (isMultiCC && statusResultado !== 'PENDENTE') ? parentLucroPrejuizo : null,
          // WATERFALL: Flag para indicar se freebet deve ser usado no waterfall
          usar_freebet: bookmakerStakeFreebet + additionalStakeFreebet > 0,
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

        // Gerou Freebet desativado
        const coberturaGerouFreebet = false;
        const coberturaValorFreebet = 0;
        
        let obsCobertura = observacoes || "";

        apostaData = {
          ...commonData,
          bookmaker_id: coberturaBackBookmakerId,
          odd: backOdd,
          stake: backStake,
          stake_real: tipoApostaBack === "normal" ? backStake : 0,
          stake_freebet: tipoApostaBack === "normal" ? 0 : backStake,
          stake_total: backStake,
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
          usar_freebet: tipoApostaBack !== "normal",
          fonte_saldo: tipoApostaBack !== "normal" ? 'FREEBET' : 'REAL',
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
          stake_real: !isLay && tipoApostaExchangeBack !== "normal" ? 0 : exchStake,
          stake_freebet: !isLay && tipoApostaExchangeBack !== "normal" ? exchStake : 0,
          stake_total: exchStake,
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
          usar_freebet: !isLay && tipoApostaExchangeBack !== "normal",
          fonte_saldo: !isLay && tipoApostaExchangeBack !== "normal" ? 'FREEBET' : 'REAL',
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

      if (aposta?.id) {
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

        // Helper: somente resultados suportados pelo RPC liquidar_aposta_v4
        const isResultadoV4 = [
          "GREEN",
          "RED",
          "VOID",
          "MEIO_GREEN",
          "MEIO_RED",
        ].includes(statusResultado);
        
        // ================================================================
        // CASO ESPECIAL: LIQUIDADA → PENDENTE (reversão pura)
        // Usar reverter_liquidacao_v4 que faz apenas reversão, sem re-liquidação
        // ================================================================
        if (apostaEstaLiquidada && agoraPendente && houveMudancaResultado) {
          console.log("[ApostaDialog] LIQUIDADA → PENDENTE: usando reverter_liquidacao_v4");
          
           const revertResult = await reverterLiquidacao(aposta.id);
          
          if (!revertResult.success) {
            console.error("[ApostaDialog] Falha na reversão:", revertResult.message);
            toast.error("Falha na reversão: " + revertResult.message);
            throw new Error(revertResult.message || 'Erro ao reverter liquidação');
          }
          
          console.log("[ApostaDialog] ✅ Reversão concluída:", revertResult);
          
          // Atualizar campos não-financeiros
          const { error: updateError } = await supabase
            .from("apostas_unificada")
            .update({
              evento: apostaData.evento,
              mercado: apostaData.mercado,
              esporte: apostaData.esporte,
              selecao: apostaData.selecao,
              observacoes: apostaData.observacoes,
              data_aposta: apostaData.data_aposta,
              modo_entrada: apostaData.modo_entrada,
              lay_exchange: apostaData.lay_exchange,
              lay_odd: apostaData.lay_odd,
              lay_stake: apostaData.lay_stake,
              lay_liability: apostaData.lay_liability,
              lay_comissao: apostaData.lay_comissao,
              back_em_exchange: apostaData.back_em_exchange,
              back_comissao: apostaData.back_comissao,
              gerou_freebet: apostaData.gerou_freebet,
              valor_freebet_gerada: apostaData.valor_freebet_gerada,
              tipo_freebet: apostaData.tipo_freebet,
              estrategia: apostaData.estrategia,
              contexto_operacional: apostaData.contexto_operacional,
              fonte_saldo: apostaData.fonte_saldo,
              usar_freebet: apostaData.usar_freebet,
              stake_real: apostaData.stake_real,
              stake_freebet: apostaData.stake_freebet,
              stake_total: apostaData.stake_total,
            })
            .eq("id", aposta.id);
          
          if (updateError) {
            console.warn("[ApostaDialog] Erro ao atualizar campos complementares:", updateError);
          }
          
          // Invalidar caches de saldo
          await invalidateSaldos(projetoId);
          
        } else if (
          apostaEstaLiquidada &&
          houveMudancaResultado &&
          !houveMudancaBookmaker &&
          !houveMudancaStake &&
          !houveMudancaOdd &&
          !agoraPendente &&
          isResultadoV4
        ) {
          // ================================================================
          // CASO: LIQUIDADA → OUTRO RESULTADO (APENAS RESULTADO)
          // Usa reliquidar_aposta_v5 que reverte apenas PAYOUT (sem reverter STAKE)
          // e aplica novo payout. Isso evita "dupla contagem" do stake.
          // ================================================================
          console.log(
            "[ApostaDialog] LIQUIDADA → outro resultado (somente resultado): usando reliquidar_aposta_v6",
            {
              apostaId: aposta.id,
              resultadoAnterior,
              novoResultado: statusResultado,
            }
          );

          const { data: reliqData, error: reliqError } = await supabase.rpc(
            "reliquidar_aposta_v6",
            {
              p_aposta_id: aposta.id,
              p_novo_resultado: statusResultado,
              p_lucro_prejuizo: lucroPrejuizo ?? null,
            }
          );

          if (reliqError) {
            console.error("[ApostaDialog] Erro RPC reliquidar_aposta_v6:", reliqError);
            throw new Error(reliqError.message || "Erro ao reliquidar aposta");
          }

          // RPC retorna JSONB direto (não array)
          const reliqResult = reliqData as { success: boolean; error?: string };
          if (!reliqResult?.success) {
            throw new Error(reliqResult?.error || "Erro ao reliquidar aposta");
          }

          console.log("[ApostaDialog] ✅ reliquidar_aposta_v6 sucesso:", reliqResult);

          // Atualizar campos que o RPC não atualiza (campos descritivos)
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
              usar_freebet: apostaData.usar_freebet,
              fonte_saldo: apostaData.fonte_saldo,
              stake_real: apostaData.stake_real,
              stake_freebet: apostaData.stake_freebet,
              stake_total: apostaData.stake_total,
            })
            .eq("id", aposta.id);

          if (updateError) {
            console.warn(
              "[ApostaDialog] Erro ao atualizar campos complementares pós-reliquidação:",
              updateError
            );
          }

          await invalidateSaldos(projetoId);

        } else if (apostaEstaLiquidada && houveMudancaFinanceira && !agoraPendente) {
          // ================================================================
          // CASO: LIQUIDADA → OUTRO RESULTADO (re-liquidação)
          // Usar RPC atômico que faz reversão + re-liquidação via ledger
          // ================================================================
          console.log("[ApostaDialog] Aposta LIQUIDADA com mudança financeira - usando RPC atômico");
          console.log("[ApostaDialog] Mudanças detectadas:", {
            bookmaker: houveMudancaBookmaker ? `${bookmakerAnteriorId} -> ${bookmakerAtualId}` : 'sem mudança',
            stake: houveMudancaStake ? `${stakeAnterior} -> ${apostaData.stake}` : 'sem mudança',
            odd: houveMudancaOdd ? `${oddAnterior} -> ${apostaData.odd}` : 'sem mudança',
            resultado: houveMudancaResultado ? `${resultadoAnterior} -> ${novoResultado}` : 'sem mudança'
          });
          
          const { data: rpcResult, error: rpcError } = await supabase.rpc(
            'atualizar_aposta_liquidada_atomica_v2',
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
            console.error("[ApostaDialog] Erro no RPC atualizar_aposta_liquidada_atomica_v2:", rpcError);
            throw new Error(`Erro ao atualizar aposta liquidada: ${rpcError.message}`);
          }
          
          const result = rpcResult as { success: boolean; error?: string; message?: string };
          if (!result.success) {
            throw new Error(result.error || 'Erro desconhecido ao atualizar aposta liquidada');
          }
          
          console.log("[ApostaDialog] RPC atualizar_aposta_liquidada_atomica_v2 sucesso:", result);
          
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
              estrategia: apostaData.estrategia,
              contexto_operacional: apostaData.contexto_operacional,
              fonte_saldo: apostaData.fonte_saldo,
              usar_freebet: apostaData.usar_freebet,
              stake_real: apostaData.stake_real,
              stake_freebet: apostaData.stake_freebet,
              stake_total: apostaData.stake_total,
            })
            .eq("id", aposta.id);
          
          if (updateError) {
            console.warn("[ApostaDialog] Erro ao atualizar campos complementares:", updateError);
          }
          
          // Invalidar caches de saldo
          await invalidateSaldos(projetoId);
          
        } else {
          // ================================================================
          // CORREÇÃO CRÍTICA: Quando aposta está LIQUIDADA mas SÓ mudaram
          // campos não-financeiros (data, observação, evento, etc.),
          // NÃO podemos sobrescrever status/resultado com PENDENTE/null.
          // 
          // O commonData SEMPRE vem com status: "PENDENTE" e resultado: null
          // (para criação de novas apostas), mas na EDIÇÃO sem mudança
          // financeira precisamos PRESERVAR o estado atual.
          // ================================================================
          let updatePayload = { ...apostaData };
          
          if (apostaEstaLiquidada && !houveMudancaFinanceira) {
            // PRESERVAR estado financeiro imutável
            console.log("[ApostaDialog] Editando aposta LIQUIDADA sem mudança financeira - preservando status/resultado");
            delete updatePayload.status;
            delete updatePayload.resultado;
            delete updatePayload.lucro_prejuizo;
            delete updatePayload.valor_retorno;
            delete updatePayload.odd;
            delete updatePayload.stake;
            delete updatePayload.bookmaker_id;
          }
          
          const { error } = await supabase
            .from("apostas_unificada")
            .update(updatePayload)
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
             // Motor financeiro v7 (imports estáticos)
            
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

        // ================================================================
        // MULTI-ENTRY EDIT: Sincronizar pernas em apostas_pernas
        // ================================================================
        if (tipoAposta === "bookmaker") {
          if (additionalEntries.length > 0) {
            // Delete existing pernas and re-insert
            await supabase.from("apostas_pernas").delete().eq("aposta_id", aposta.id);
            
            const allPernas = [
              {
                aposta_id: aposta.id,
                bookmaker_id: bookmakerId,
                ordem: 0,
                selecao: effectiveSelecao || 'N/A',
                selecao_livre: null as string | null,
                odd: parseFloat(odd),
                stake: stakeBookmakerEfetiva, // Total = real + FB
                stake_real: parseFloat(stake) || 0,
                stake_freebet: usarFreebetBookmaker ? valorFreebetUsar : 0,
                moeda: moedaOperacao,
                fonte_saldo: usarFreebetBookmaker ? 'FREEBET' : 'REAL',
              },
              ...additionalEntries
                .filter(e => e.bookmaker_id && parseFloat(e.odd) > 0 && ((parseFloat(e.stake) || 0) + (e.usar_freebet ? (parseFloat(e.valor_freebet) || 0) : 0)) > 0)
                .map((e, idx) => ({
                  aposta_id: aposta.id,
                  bookmaker_id: e.bookmaker_id,
                  ordem: idx + 1,
                  selecao: effectiveSelecao || 'N/A',
                  selecao_livre: null,
                  odd: parseFloat(e.odd),
                  stake: (parseFloat(e.stake) || 0) + (e.usar_freebet ? (parseFloat(e.valor_freebet) || 0) : 0), // Total = real + FB
                  stake_real: parseFloat(e.stake) || 0,
                  stake_freebet: e.usar_freebet ? (parseFloat(e.valor_freebet) || 0) : 0,
                  moeda: bookmakers.find(b => b.id === e.bookmaker_id)?.moeda || moedaOperacao,
                  fonte_saldo: e.usar_freebet ? 'FREEBET' : 'REAL',
                }))
            ];

            const { error: pernasError } = await supabase.from("apostas_pernas").insert(allPernas);
            if (pernasError) {
              console.error("[ApostaDialog] Erro ao sincronizar pernas na edição:", pernasError);
            }
          } else {
            // Se não tem mais entradas adicionais, limpar pernas existentes
            // (aposta voltou a ser single-entry)
            const { data: existingPernas } = await supabase
              .from("apostas_pernas")
              .select("id")
              .eq("aposta_id", aposta.id);
            
            if (existingPernas && existingPernas.length > 0) {
              await supabase.from("apostas_pernas").delete().eq("aposta_id", aposta.id);
            }
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
               // MIGRADO PARA LEDGER: Estornar via RPC atômica
              await estornarFreebetViaLedger(
                freebetLiberada.bookmaker_id, 
                freebetLiberada.valor, 
                'Freebet revogada por resultado VOID'
              );

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
                  // MIGRADO PARA LEDGER: Estornar antigo e creditar novo valor
                  // MIGRADO PARA LEDGER: Estornar antigo e creditar novo valor
                  await estornarFreebetViaLedger(bookmakerParaFreebet, valorFreebetAnterior, 'Ajuste de valor de freebet');
                  await creditarFreebetViaLedger(bookmakerParaFreebet, novoValorFreebet, 'AJUSTE_VALOR', { descricao: 'Novo valor de freebet' });
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
          // Foi removido: reverter saldo e deletar registro
          const bookmakerParaFreebet = tipoAposta === "bookmaker" ? bookmakerId : (aposta.bookmaker_id || coberturaBackBookmakerId);
          if (bookmakerParaFreebet) {
            // Só reverter saldo se a freebet estava LIBERADA
            const { data: freebetExistente } = await supabase
              .from("freebets_recebidas")
              .select("status")
              .eq("aposta_id", aposta.id)
              .maybeSingle();
            
            if (freebetExistente?.status === "LIBERADA") {
              // MIGRADO PARA LEDGER: Estornar via RPC atômica
               // MIGRADO PARA LEDGER: Estornar via RPC atômica
              await estornarFreebetViaLedger(bookmakerParaFreebet, valorFreebetAnterior, 'Freebet removida da aposta');
            }
            // Remover registro de freebet_recebida
            await supabase
              .from("freebets_recebidas")
              .delete()
              .eq("aposta_id", aposta.id);
          }
        }

        // Toast de sucesso: só dispara em modo inline (não-embedded)
        // Em modo embedded (janela standalone), o caller (WindowPage) controla o toast
        if (!embedded) {
          toast.success("Aposta atualizada com sucesso!");
        }
        
        // CRITICAL FIX: Aguardar invalidação completar ANTES de fechar o dialog
        // Isso garante que os novos saldos sejam buscados do servidor
        await invalidateSaldos(projetoId);
      } else {
        // ========== VALIDAÇÃO PRÉ-COMMIT (ANTI-CONCORRÊNCIA) ==========
        // Antes de inserir, validar server-side com lock para prevenir:
        // 1. Dois usuários apostando simultaneamente na mesma casa
        // 2. Saldo negativo resultante
        // 3. Bookmaker desvinculada durante preenchimento
        // Só validar se não for freebet (freebet não debita saldo real)
        const isFreebet = (tipoAposta === "bookmaker" && usarFreebetBookmaker) ||
                          (tipoAposta === "exchange" && tipoOperacaoExchange === "back" && tipoApostaExchangeBack !== "normal") ||
                          (tipoAposta === "exchange" && tipoOperacaoExchange === "cobertura" && tipoApostaBack !== "normal");
        
        if (statusResultado === "PENDENTE" && !isFreebet) {
          // Construir lista de TODAS as bookmakers a validar (primária + entradas adicionais)
          const stakesToValidate: Array<{ bookmaker_id: string; stake: number }> = [];
          
          if (tipoAposta === "bookmaker") {
            // Entrada primária
            const primaryStake = parseFloat(stake);
            if (bookmakerId && primaryStake > 0 && !usarFreebetBookmaker) {
              stakesToValidate.push({ bookmaker_id: bookmakerId, stake: primaryStake });
            }
            // Entradas adicionais (multi-entry)
            for (const entry of additionalEntries) {
              const entryStake = parseFloat(entry.stake) || 0;
              if (entry.bookmaker_id && entryStake > 0 && !entry.usar_freebet) {
                stakesToValidate.push({ bookmaker_id: entry.bookmaker_id, stake: entryStake });
              }
            }
          } else {
            // Exchange
            const bookmakerParaValidar = tipoOperacaoExchange === "cobertura" 
              ? coberturaBackBookmakerId 
              : exchangeBookmakerId;
            const stakeParaValidar = tipoOperacaoExchange === "cobertura"
              ? parseFloat(coberturaBackStake)
              : parseFloat(exchangeStake);
            if (bookmakerParaValidar && stakeParaValidar > 0) {
              stakesToValidate.push({ bookmaker_id: bookmakerParaValidar, stake: stakeParaValidar });
            }
          }
          
          if (stakesToValidate.length > 0) {
            const validation = await validateAndReserve(projetoId, stakesToValidate);
            
            if (!validation.valid) {
              showValidationErrors(validation.errors);
              setLoading(false);
              return; // Abortar sem inserir
            }
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
        // MULTI-ENTRY: Inserir pernas em apostas_pernas para rastreio granular
        // ================================================================
        if (novaApostaId && tipoAposta === "bookmaker" && additionalEntries.length > 0) {
          console.log('[ApostaDialog][MULTI-ENTRY] Inserindo pernas:', {
            novaApostaId,
            additionalEntriesCount: additionalEntries.length,
            additionalEntries: additionalEntries.map(e => ({
              bookmaker_id: e.bookmaker_id,
              odd: e.odd,
              stake: e.stake,
              valor_freebet: e.valor_freebet,
              usar_freebet: e.usar_freebet,
            })),
          });
          const allPernas = [
            {
              aposta_id: novaApostaId,
              bookmaker_id: bookmakerId,
              ordem: 0,
              selecao: effectiveSelecao || 'N/A',
              selecao_livre: null as string | null,
              odd: parseFloat(odd),
              stake: stakeBookmakerEfetiva, // Total = real + FB
              stake_real: parseFloat(stake) || 0,
              stake_freebet: usarFreebetBookmaker ? valorFreebetUsar : 0,
              moeda: moedaOperacao,
              fonte_saldo: usarFreebetBookmaker ? 'FREEBET' : 'REAL',
            },
            ...additionalEntries
              .filter(e => e.bookmaker_id && parseFloat(e.odd) > 0 && ((parseFloat(e.stake) || 0) + (e.usar_freebet ? (parseFloat(e.valor_freebet) || 0) : 0)) > 0)
              .map((e, idx) => ({
                aposta_id: novaApostaId,
                bookmaker_id: e.bookmaker_id,
                ordem: idx + 1,
                selecao: effectiveSelecao || 'N/A',
                selecao_livre: null,
                odd: parseFloat(e.odd),
                stake: (parseFloat(e.stake) || 0) + (e.usar_freebet ? (parseFloat(e.valor_freebet) || 0) : 0), // Total = real + FB
                stake_real: parseFloat(e.stake) || 0,
                stake_freebet: e.usar_freebet ? (parseFloat(e.valor_freebet) || 0) : 0,
                moeda: bookmakers.find(b => b.id === e.bookmaker_id)?.moeda || moedaOperacao,
                fonte_saldo: e.usar_freebet ? 'FREEBET' : 'REAL',
              }))
          ];

          console.log('[ApostaDialog][MULTI-ENTRY] allPernas a inserir:', allPernas);

          const { error: pernasError } = await supabase
            .from("apostas_pernas")
            .insert(allPernas);

          if (pernasError) {
            console.error("[ApostaDialog][MULTI-ENTRY] ❌ Erro ao inserir pernas:", pernasError, { allPernas });
            // Não bloquear - a aposta principal já foi criada
          } else {
            console.log(`[ApostaDialog][MULTI-ENTRY] ✅ ${allPernas.length} pernas inseridas com sucesso`);
          }
        }

        // ================================================================
        // CORREÇÃO CRÍTICA: Para apostas criadas já com resultado (não PENDENTE),
        // usar RPC de liquidação que insere corretamente no cash_ledger.
        // NÃO usar atualizarSaldoBookmaker que bypassa o ledger!
        // ================================================================
        if (novaApostaId && statusResultado !== "PENDENTE") {
          console.log("[ApostaDialog] Nova aposta criada já liquidada - usando FinancialEngine v7");
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
          const valorFreebetDebitar = Math.min(valorFreebetUsar, stakeBookmakerEfetiva);
          if (valorFreebetDebitar > 0 && bookmakerId && novaApostaId) {
            await debitarFreebetUsada(bookmakerId, valorFreebetDebitar, novaApostaId);
          }
        }
        
        // 1b. Entradas adicionais com freebet (multi-entry)
        if (tipoAposta === "bookmaker" && novaApostaId) {
          for (const entry of additionalEntries) {
            if (entry.usar_freebet && entry.bookmaker_id) {
              const entryFbValor = parseFloat(entry.valor_freebet) || 0;
              const entryBk = bookmakers.find(b => b.id === entry.bookmaker_id);
              const valorDebitar = Math.min(entryFbValor, entryBk?.saldo_freebet || 0);
              if (valorDebitar > 0) {
                await debitarFreebetUsada(entry.bookmaker_id, valorDebitar, novaApostaId);
              }
            }
          }
        }
        
        // 2. Exchange Back com freebet
        if (tipoAposta === "exchange" && tipoOperacaoExchange === "back" && tipoApostaExchangeBack !== "normal") {
          const stakeNum = parseFloat(exchangeStake);
          if (stakeNum > 0 && exchangeBookmakerId && novaApostaId) {
            await debitarFreebetUsada(exchangeBookmakerId, stakeNum, novaApostaId);
          }
        }
        
        // 3. Cobertura Lay com freebet
        if (tipoAposta === "exchange" && tipoOperacaoExchange === "cobertura" && tipoApostaBack !== "normal") {
          const backStakeNum = parseFloat(coberturaBackStake);
          if (backStakeNum > 0 && coberturaBackBookmakerId && novaApostaId) {
            await debitarFreebetUsada(coberturaBackBookmakerId, backStakeNum, novaApostaId);
          }
        }

        // NOTA: O progresso do rollover é atualizado na LIQUIDAÇÃO da aposta (ResultadoPill),
        // não na criação. Isso garante que apenas apostas finalizadas (GREEN/RED) contem para o rollover.
      }

      // CRITICAL FIX: Aguardar invalidação completa ANTES de fechar o dialog
      // Isso garante que listas, saldos, KPIs, bônus e central reflitam o servidor sem F5.
      await invalidateAfterMutation(projetoId);

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

      // MIGRADO PARA LEDGER: Creditar freebet via RPC atômica
      if (status === "LIBERADA") {
         await creditarFreebetViaLedger(bookmakerIdFreebet, valor, 'QUALIFICADORA', { 
          descricao: 'Freebet de aposta qualificadora',
          apostaId,
        });
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

        // MIGRADO PARA LEDGER: Creditar via RPC atômica
         // MIGRADO PARA LEDGER: Creditar via RPC atômica
        await creditarFreebetViaLedger(
          freebetPendente.bookmaker_id, 
          freebetPendente.valor, 
          'LIBERACAO_PENDENTE', 
          { descricao: 'Freebet liberada após liquidação de aposta' }
        );
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
        // MIGRADO PARA LEDGER: Estornar via RPC atômica
         // MIGRADO PARA LEDGER: Estornar via RPC atômica
        await estornarFreebetViaLedger(
          freebetLiberada.bookmaker_id, 
          freebetLiberada.valor, 
          'Reversão para PENDENTE (aposta reaberta)'
        );

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
  // CORRIGIDO: Usa idempotency_key = 'stake_{apostaId}' para que:
  // 1. liquidar_aposta_v4 detecte o evento existente (sem duplicar)
  // 2. deletar_aposta_v4 encontre o evento via aposta_id (para reverter)
  const debitarFreebetUsada = async (bookmakerIdFreebet: string, valor: number, apostaId?: string) => {
    try {
      // PROTEÇÃO CRÍTICA: Nunca consumir freebet sem aposta vinculada
      if (!apostaId) {
        console.error("[debitarFreebetUsada] Tentativa de consumir freebet sem apostaId - BLOQUEADO");
        return;
      }

      // Debitar saldo_freebet via ledger com chave determinística vinculada à aposta
      const result = await consumirFreebetViaLedger(bookmakerIdFreebet, valor, {
        apostaId,
        descricao: `Freebet consumida em aposta #${apostaId.slice(0, 8)}`,
      });

      if (!result.success) {
        console.error("Erro ao consumir freebet via ledger:", result.error);
        throw new Error(result.error);
      }

      // HARDENING: Buscar freebet disponível via view derivada do ledger
      const { data: freebetsDisponiveis } = await supabase
        .from("v_freebets_disponibilidade" as any)
        .select("id, valor, valor_restante, utilizada_derivada")
        .eq("bookmaker_id", bookmakerIdFreebet)
        .eq("utilizada_derivada", false)
        .eq("projeto_id", projetoId)
        .eq("status", "LIBERADA")
        .order("valor", { ascending: false });

      if (freebetsDisponiveis && freebetsDisponiveis.length > 0) {
        const freebetParaUsar = (freebetsDisponiveis as any[]).find((fb: any) => fb.valor >= valor) 
          || freebetsDisponiveis[0];
        
        // Ainda marca na tabela para manter vínculo aposta_id (lido pela view)
        await supabase
          .from("freebets_recebidas")
          .update({
            utilizada: true,
            data_utilizacao: new Date().toISOString(),
            aposta_id: apostaId
          })
          .eq("id", (freebetParaUsar as any).id);
      }
    } catch (error) {
      console.error("Erro ao debitar freebet usada:", error);
      throw error;
    }
  };

  // ============================================================
  // MOTOR FINANCEIRO v9.5: Função atualizarSaldoBookmaker REMOVIDA
  // ============================================================
  // A atualização de saldo é feita EXCLUSIVAMENTE pelo trigger
  // tr_financial_events_sync_balance após INSERT em financial_events.
  // 
  // Fluxo correto:
  // - Liquidação: reliquidarAposta() → RPC liquidar_aposta_v4 → financial_events → trigger
  // - Exclusão: deletarAposta() → RPC deletar_aposta_v4 → REVERSAL events → trigger
  // ============================================================

  const handleDelete = async () => {
    if (!aposta) return;
    
    try {
      setLoading(true);

      // Exclusão centralizada (reversão → VOID → delete) para garantir recomposição de saldo
      const result = await deletarAposta(aposta.id);
      if (!result.success) {
        throw new Error(result.error?.message || 'Falha ao excluir aposta');
      }
      
      // CRÍTICO: aguardar caches globais no mesmo navegador antes do sucesso.
      await invalidateAfterMutation(projetoId);
      
      // Broadcast para sincronização cross-window
      try {
        const channel = new BroadcastChannel("aposta_channel");
        channel.postMessage({ 
          type: "APOSTA_DELETED", 
          projetoId,
          apostaId: aposta.id,
          timestamp: Date.now()
        });
        channel.close();
      } catch (e) {
        console.warn("[ApostaDialog] BroadcastChannel não disponível:", e);
      }
      
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
    lockedEstrategia: null,
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
        // Don't clear selecao (Linha) when user edits mercado manually
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
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Print importado</span>
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

      {/* ★ ALERTA DE ANOMALIA TEMPORAL - Data suspeita detectada por OCR */}
      {!isPrintProcessing && printParsedData && printDateAnomaly && !printDateAnomalyConfirmed && !aposta && (
        <DateAnomalyAlert
          anomaly={printDateAnomaly}
          origin="ocr"
          onConfirm={confirmPrintDateAnomaly}
          onEdit={() => {
            // Foca no campo de data para edição manual
            const dateField = document.querySelector('[data-date-field="dataAposta"]') as HTMLElement;
            if (dateField) {
              dateField.click();
            }
            confirmPrintDateAnomaly(); // Marca como confirmado pois o usuário vai editar
          }}
          className="mx-3"
        />
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
          className="z-50 bg-background flex flex-col animate-in fade-in-0 duration-200"
          ref={dialogContentRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="relative w-full flex flex-col overflow-hidden">
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

            {/* Fonte da Entrada - só aparece para ValueBet */}
            {registroValues.estrategia === 'VALUEBET' && (
              <div className="px-4 pt-2">
                <FonteEntradaSelector
                  workspaceId={workspaceId}
                  value={fonteEntrada}
                  onChange={setFonteEntrada}
                />
              </div>
            )}

            {/* CONTENT - com scroll e padding interno */}
            <div className="p-4">
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
              <div ref={multiEntryTableRef} className="border border-border/50 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/30 bg-muted/30">
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-center w-[240px]">Bookmaker</th>
                    <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-center w-[70px]">Odd</th>
                    <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-center w-[100px]">Stake</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-center w-[120px]">Linha</th>
                    <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-center w-[90px]">Retorno</th>
                    {additionalEntries.length > 0 && (
                      <th className="px-1 py-2 text-xs font-medium text-muted-foreground text-center w-[36px]" />
                    )}
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
                                    instance_identifier: selectedBk.instance_identifier,
                                  };
                                }
                                return null;
                              })() : null}
                              placeholder="Selecione"
                            />
                          </SelectTrigger>
                          <BookmakerSearchableSelectContent
                            bookmakers={bookmakers}
                            itemClassName="max-w-full"
                            freebetOverrides={(() => {
                              const map = new Map<string, number>();
                              bookmakers.forEach(bk => {
                                if ((bk.saldo_freebet || 0) > 0) {
                                  // Subtract FB used by main entry (valorFreebetUsar, NOT stake)
                                  const fbMain = (bookmakerId === bk.id && usarFreebetBookmaker)
                                    ? valorFreebetUsar : 0;
                                  // Subtract FB used by sub-entries
                                  const fbSub = additionalEntries
                                    .filter(e => e.bookmaker_id === bk.id && e.usar_freebet)
                                    .reduce((sum, e) => sum + (parseFloat(e.valor_freebet) || 0), 0);
                                  const totalUsado = fbMain + fbSub;
                                  if (totalUsado > 0) {
                                    map.set(bk.id, Math.max(0, (bk.saldo_freebet || 0) - totalUsado));
                                  }
                                }
                              });
                              return map.size > 0 ? map : undefined;
                            })()}
                          />
                        </Select>
                        
                        {/* Metadados fixos abaixo do select - altura fixa para evitar layout jumps */}
                        {(() => {
                          const selectedBk = bookmakers.find(b => b.id === bookmakerId);
                          // Adjust FB display: subtract what sub-entries of same bookmaker already consume
                          const fbUsadoSubEntradas = additionalEntries
                            .filter(e => e.bookmaker_id === bookmakerId && e.usar_freebet)
                            .reduce((sum, e) => sum + (parseFloat(e.valor_freebet) || 0), 0);
                          const fbEfetivo = selectedBk ? Math.max(0, selectedBk.saldo_freebet - fbUsadoSubEntradas) : 0;
                          const saldoExibicao = saldoAjustadoParaEdicao?.saldoOperavel 
                            ?? saldoComReservas?.disponivel 
                            ?? selectedBk?.saldo_operavel ?? 0;
                          return (
                            <BookmakerMetaRow 
                              bookmaker={bookmakerId && selectedBk ? {
                                parceiro_nome: selectedBk.parceiro_nome,
                                moeda: selectedBk.moeda,
                                saldo_operavel: saldoExibicao,
                                saldo_freebet: fbEfetivo,
                                saldo_disponivel: selectedBk.saldo_disponivel,
                              } : null}
                            />
                          );
                        })()}
                        {/* Compact FB button for main entry */}
                        {bookmakerSaldo && bookmakerSaldo.saldoFreebet > 0 && !aposta?.gerou_freebet && (() => {
                          // Calculate available FB considering other entries using same bookmaker
                          const fbUsadoOutrasEntradas = additionalEntries
                            .filter(e => e.bookmaker_id === bookmakerId && e.usar_freebet)
                            .reduce((sum, e) => sum + (parseFloat(e.valor_freebet) || 0), 0);
                          const fbDisponivel = Math.max(0, bookmakerSaldo.saldoFreebet - fbUsadoOutrasEntradas);
                          if (fbDisponivel <= 0 && !usarFreebetBookmaker) return null;
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                const newUsarFb = !usarFreebetBookmaker;
                                setUsarFreebetBookmaker(newUsarFb);
                                if (newUsarFb) {
                                  setGerouFreebet(false);
                                  setValorFreebetGerada("");
                                  setValorFreebetUsar((atual) => Math.min(atual || 0, fbDisponivel));
                                } else {
                                  setValorFreebetUsar(0);
                                }
                              }}
                              disabled={!!aposta?.tipo_freebet}
                              className={cn(
                                "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all",
                                usarFreebetBookmaker
                                  ? "bg-purple-500/20 text-purple-700 dark:text-purple-400 border border-purple-500/40"
                                  : "bg-muted/40 text-muted-foreground hover:bg-muted/60 border border-transparent"
                              )}
                            >
                              <Gift className="h-3 w-3" />
                              {usarFreebetBookmaker ? "FB ativo" : "Usar FB"}
                            </button>
                          );
                        })()}
                      </div>
                    </td>
                    {/* Odd */}
                    <td className="px-1 py-3">
                      <Input
                        type="number"
                        step="0.00001"
                        min="1.01"
                        value={odd}
                        onChange={(e) => setOdd(e.target.value)}
                        onKeyDown={(e) => handleMultiEntryFieldKeyDown(e, 'odd')}
                        onBlur={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val < 1.01) {
                            setOdd("1.01");
                          }
                        }}
                        placeholder="0.00"
                        className="h-8 text-xs text-center px-1 w-[72px] tabular-nums"
                        data-field-type="odd"
                      />
                    </td>
                    {/* Stake */}
                    <td className="px-1 py-3">
                      <div className="flex flex-col gap-1">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={stake}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (parseFloat(val) < 0) return;
                            setStake(val);
                          }}
                          onKeyDown={(e) => handleMultiEntryFieldKeyDown(e, 'stake')}
                          placeholder={usarFreebetBookmaker ? "Real" : "0.00"}
                          data-field-type="stake"
                          className={`h-8 text-xs text-center px-1 w-[90px] tabular-nums ${(() => {
                            const saldoDisponivelReal = saldoAjustadoParaEdicao?.saldoOperavel 
                              ?? saldoComReservas?.disponivel 
                              ?? bookmakers.find(b => b.id === bookmakerId)?.saldo_operavel 
                              ?? 0;
                            const stakeNum = parseFloat(stake);
                            if (!isNaN(stakeNum) && stakeNum > saldoDisponivelReal && bookmakerId) {
                              return "border-destructive";
                            }
                            return "";
                          })()}`}
                        />
                        {/* Mini-campo FB: mostra quanto da stake vem de freebet */}
                        {usarFreebetBookmaker && (
                          <div className="flex items-center gap-1">
                            <Gift className="h-3 w-3 text-purple-400 shrink-0" />
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              max={(() => {
                                const fbUsadoOutras = additionalEntries
                                  .filter(e => e.bookmaker_id === bookmakerId && e.usar_freebet)
                                  .reduce((sum, e) => sum + (parseFloat(e.valor_freebet) || 0), 0);
                                return Math.max(0, (bookmakerSaldo?.saldoFreebet || 0) - fbUsadoOutras);
                              })()}
                              value={valorFreebetUsar || ''}
                              onChange={(e) => {
                                let val = parseFloat(e.target.value) || 0;
                                // FB não tem limite pelo stake real - pode ser 100% FB
                                const fbUsadoOutras = additionalEntries
                                  .filter(en => en.bookmaker_id === bookmakerId && en.usar_freebet)
                                  .reduce((sum, en) => sum + (parseFloat(en.valor_freebet) || 0), 0);
                                const fbMax = Math.max(0, (bookmakerSaldo?.saldoFreebet || 0) - fbUsadoOutras);
                                if (val > fbMax) val = fbMax;
                                setValorFreebetUsar(val);
                              }}
                              placeholder="FB"
                              className="h-6 text-[10px] text-center px-1 w-[60px] tabular-nums bg-purple-500/10 border-purple-500/30 text-purple-400"
                            />
                          </div>
                        )}
                      </div>
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
                      <div className="h-8 flex items-center justify-center rounded-md bg-muted/30 px-2 text-sm font-medium text-emerald-600 dark:text-emerald-500 tabular-nums">
                        {(() => {
                          const oddNum = parseFloat(odd);
                          const stakeReal = parseFloat(stake) || 0;
                          const fbVal = usarFreebetBookmaker ? valorFreebetUsar : 0;
                          const totalStake = stakeReal + fbVal;
                          const moeda = getSelectedBookmakerMoeda();
                          if (!isNaN(oddNum) && oddNum > 0 && totalStake > 0) {
                            // SNR: freebet portion only returns profit (odd-1), real portion returns full payout
                            const retorno = stakeReal * oddNum + fbVal * (oddNum - 1);
                            return formatCurrencyWithSymbol(retorno, moeda);
                          }
                          return "—";
                        })()}
                      </div>
                    </td>
                  </tr>
                  {/* ========== ENTRADAS ADICIONAIS (Multi-Entry) ========== */}
                  {additionalEntries.map((entry, idx) => {
                    const entryBk = bookmakers.find(b => b.id === entry.bookmaker_id);
                    const entryOddNum = parseFloat(entry.odd);
                    const entryStakeReal = parseFloat(entry.stake) || 0;
                    const entryFbVal = entry.usar_freebet ? (parseFloat(entry.valor_freebet) || 0) : 0;
                    const entryTotalStake = entryStakeReal + entryFbVal;
                    // SNR: freebet portion only returns profit (odd-1), real portion returns full payout
                    const entryRetorno = (!isNaN(entryOddNum) && entryOddNum > 0 && entryTotalStake > 0) 
                      ? entryStakeReal * entryOddNum + entryFbVal * (entryOddNum - 1) : null;
                    const entrySaldoDisp = entryBk?.saldo_operavel ?? 0;
                    const entryStakeExceeds = !isNaN(entryStakeReal) && entryStakeReal > entrySaldoDisp && !!entry.bookmaker_id;

                    return (
                      <tr key={entry.id} className="border-t border-primary/15">
                        {/* Casa */}
                        <td className="px-3 py-3 text-center">
                          <div className="flex flex-col gap-1 items-center">
                            <Select
                              value={entry.bookmaker_id}
                              onValueChange={(val) => {
                                setAdditionalEntries(prev => prev.map(e => e.id === entry.id ? { ...e, bookmaker_id: val, usar_freebet: false, valor_freebet: '0' } : e));
                              }}
                            >
                              <SelectTrigger className="h-9 text-xs w-full border-dashed">
                                <BookmakerSelectTrigger
                                   bookmaker={entryBk ? {
                                    nome: entryBk.nome,
                                    parceiro_nome: entryBk.parceiro_nome,
                                    moeda: entryBk.moeda,
                                    saldo_operavel: entryBk.saldo_operavel,
                                    logo_url: entryBk.logo_url,
                                    instance_identifier: entryBk.instance_identifier,
                                  } : null}
                                  placeholder="Selecione"
                                />
                              </SelectTrigger>
                              <BookmakerSearchableSelectContent
                                bookmakers={bookmakers}
                                itemClassName="max-w-full"
                                freebetOverrides={(() => {
                                  const map = new Map<string, number>();
                                  bookmakers.forEach(bk => {
                                    if ((bk.saldo_freebet || 0) > 0) {
                                      // Subtract FB used by main entry (valorFreebetUsar, NOT stake)
                                      const fbMain = (bookmakerId === bk.id && usarFreebetBookmaker)
                                        ? valorFreebetUsar : 0;
                                      // Subtract FB used by OTHER sub-entries (not this one)
                                      const fbOutras = additionalEntries
                                        .filter(e => e.id !== entry.id && e.bookmaker_id === bk.id && e.usar_freebet)
                                        .reduce((sum, e) => sum + (parseFloat(e.valor_freebet) || 0), 0);
                                      const totalUsado = fbMain + fbOutras;
                                      if (totalUsado > 0) {
                                        map.set(bk.id, Math.max(0, (bk.saldo_freebet || 0) - totalUsado));
                                      }
                                    }
                                  });
                                  return map.size > 0 ? map : undefined;
                                })()}
                              />
                            </Select>
                            {(() => {
                              // Adjust displayed FB balance: subtract what's used by other entries + main
                              const fbUsadoPrincipal = (bookmakerId === entry.bookmaker_id && usarFreebetBookmaker)
                                ? valorFreebetUsar : 0;
                              const fbUsadoOutras = additionalEntries
                                .filter(e => e.id !== entry.id && e.bookmaker_id === entry.bookmaker_id && e.usar_freebet)
                                .reduce((sum, e) => sum + (parseFloat(e.valor_freebet) || 0), 0);
                              const fbEfetivo = Math.max(0, (entryBk?.saldo_freebet || 0) - fbUsadoPrincipal - fbUsadoOutras);
                              return (
                                <BookmakerMetaRow
                                  bookmaker={entryBk ? {
                                    parceiro_nome: entryBk.parceiro_nome,
                                    moeda: entryBk.moeda,
                                    saldo_operavel: entryBk.saldo_operavel,
                                    saldo_freebet: fbEfetivo,
                                    saldo_disponivel: entryBk.saldo_disponivel,
                                  } : null}
                                />
                              );
                            })()}
                            {/* Freebet toggle compacto por sub-entrada */}
                            {entryBk && entryBk.saldo_freebet > 0 && (() => {
                              // Calculate available FB considering other entries + main entry using same bookmaker
                              const fbUsadoPrincipal = (bookmakerId === entry.bookmaker_id && usarFreebetBookmaker)
                                ? valorFreebetUsar
                                : 0;
                              const fbUsadoOutrasEntradas = additionalEntries
                                .filter(e => e.id !== entry.id && e.bookmaker_id === entry.bookmaker_id && e.usar_freebet)
                                .reduce((sum, e) => sum + (parseFloat(e.valor_freebet) || 0), 0);
                              const fbDisponivel = Math.max(0, entryBk.saldo_freebet - fbUsadoPrincipal - fbUsadoOutrasEntradas);
                              if (fbDisponivel <= 0 && !entry.usar_freebet) return null;
                              return (
                              <button
                                type="button"
                                onClick={() => {
                                  setAdditionalEntries(prev => prev.map(e => {
                                    if (e.id !== entry.id) return e;
                                    const newUsarFb = !e.usar_freebet;
                                    return {
                                      ...e,
                                      usar_freebet: newUsarFb,
                                      // Auto-fill valor_freebet com saldo FB disponível ao ativar
                                      valor_freebet: newUsarFb ? fbDisponivel.toString() : '0',
                                      // NÃO auto-preencher stake - stake = saldo real
                                    };
                                  }));
                                }}
                                className={cn(
                                  "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all",
                                  entry.usar_freebet
                                    ? "bg-purple-500/20 text-purple-700 dark:text-purple-400 border border-purple-500/40"
                                    : "bg-muted/40 text-muted-foreground hover:bg-muted/60 border border-transparent"
                                )}
                              >
                                <Gift className="h-3 w-3" />
                                {entry.usar_freebet ? "FB ativo" : "Usar FB"}
                              </button>
                              );
                            })()}
                          </div>
                        </td>
                        {/* Odd */}
                        <td className="px-1 py-3">
                          <Input
                            type="number"
                            step="0.00001"
                            min="1.01"
                            value={entry.odd}
                            onChange={(e) => setAdditionalEntries(prev => prev.map(en => en.id === entry.id ? { ...en, odd: e.target.value } : en))}
                            onKeyDown={(e) => handleMultiEntryFieldKeyDown(e, 'odd')}
                            onBlur={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val) && val < 1.01) {
                                setAdditionalEntries(prev => prev.map(en => en.id === entry.id ? { ...en, odd: '1.01' } : en));
                              }
                            }}
                            placeholder="0.00"
                            className="h-8 text-xs text-center px-1 w-[72px] tabular-nums"
                            data-field-type="odd"
                          />
                        </td>
                        {/* Stake */}
                        <td className="px-1 py-3">
                          <div className="flex flex-col gap-1">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={entry.stake}
                              onChange={(e) => {
                                if (parseFloat(e.target.value) < 0) return;
                                setAdditionalEntries(prev => prev.map(en => en.id === entry.id ? { ...en, stake: e.target.value } : en));
                              }}
                              onKeyDown={(e) => handleMultiEntryFieldKeyDown(e, 'stake')}
                              placeholder={entry.usar_freebet ? "Real" : "0.00"}
                              className={cn(
                                "h-8 text-xs text-center px-1 w-[90px] tabular-nums",
                                entryStakeExceeds && "border-destructive"
                              )}
                              data-field-type="stake"
                            />
                            {/* Mini-campo FB para sub-entrada */}
                            {entry.usar_freebet && (
                              <div className="flex items-center gap-1">
                                <Gift className="h-3 w-3 text-purple-400 shrink-0" />
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={entry.valor_freebet}
                                  onChange={(e) => {
                                    let val = parseFloat(e.target.value) || 0;
                                    // Limitar ao FB disponível (não ao stake, pois são independentes)
                                    const fbUsadoPrincipal = (bookmakerId === entry.bookmaker_id && usarFreebetBookmaker)
                                      ? valorFreebetUsar : 0;
                                    const fbUsadoOutras = additionalEntries
                                      .filter(en => en.id !== entry.id && en.bookmaker_id === entry.bookmaker_id && en.usar_freebet)
                                      .reduce((sum, en) => sum + (parseFloat(en.valor_freebet) || 0), 0);
                                    const fbMax = Math.max(0, (entryBk?.saldo_freebet || 0) - fbUsadoPrincipal - fbUsadoOutras);
                                    if (val > fbMax) val = fbMax;
                                    if (val < 0) val = 0;
                                    setAdditionalEntries(prev => prev.map(en => en.id === entry.id ? { ...en, valor_freebet: val.toString() } : en));
                                  }}
                                  placeholder="FB"
                                  className="h-6 text-[10px] text-center px-1 w-[60px] tabular-nums bg-purple-500/10 border-purple-500/30 text-purple-400"
                                />
                              </div>
                            )}
                          </div>
                        </td>
                        {/* Linha compartilhada com a entrada principal */}
                        <td className="px-2 py-3 text-center">
                          <div className="h-8 flex items-center justify-center rounded-md bg-muted/20 px-2 text-xs text-muted-foreground border border-dashed border-border/40 truncate">
                            {effectiveSelecao || selecao || "—"}
                          </div>
                        </td>
                        {/* Retorno */}
                        <td className="px-2 py-3 text-center">
                          <div className="h-8 flex items-center justify-center rounded-md bg-muted/30 px-2 text-sm font-medium text-emerald-600 dark:text-emerald-500 tabular-nums">
                            {entryRetorno !== null ? formatCurrencyWithSymbol(entryRetorno, entryBk?.moeda || 'BRL') : '—'}
                          </div>
                        </td>
                        {/* Remove */}
                        <td className="px-1 py-3 text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => setAdditionalEntries(prev => prev.filter(e => e.id !== entry.id))}
                          >
                            <Trash2Entry className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Footer: + Entrada e resumo multi-entry */}
              <div className="flex items-center justify-between px-3 py-2 bg-muted/20 border-t border-border/30">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground hover:text-primary gap-1"
                  onClick={() => setAdditionalEntries(prev => [...prev, { id: generateEntryId(), bookmaker_id: '', odd: '', stake: '', selecao_livre: '', usar_freebet: false, valor_freebet: '0' }])}
                  disabled={additionalEntries.length >= MAX_ADDITIONAL_ENTRIES}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Entrada
                </Button>

                {additionalEntries.length > 0 && (() => {
                  const mainOdd = parseFloat(odd) || 0;
                  const mainStake = parseFloat(stake) || 0;
                  const mainMoeda = bookmakerSaldo?.moeda || 'BRL';
                  
                  const allEntries = [
                    { odd: mainOdd, stake: mainStake, moeda: mainMoeda },
                    ...additionalEntries.map(e => {
                      const bk = bookmakers.find(b => b.id === e.bookmaker_id);
                      return { odd: parseFloat(e.odd) || 0, stake: parseFloat(e.stake) || 0, moeda: bk?.moeda || 'BRL' };
                    })
                  ];
                  
                  // Converter stakes para moeda de consolidação para ponderação
                  let totalStakeConsolidado = 0;
                  let weightedOddSum = 0;
                  const stakesByMoeda: Record<string, number> = {};
                  
                  for (const e of allEntries) {
                    if (e.stake <= 0 || e.odd <= 0) continue;
                    const stakeConsolidado = convertToConsolidation(e.stake, e.moeda);
                    totalStakeConsolidado += stakeConsolidado;
                    weightedOddSum += e.odd * stakeConsolidado;
                    stakesByMoeda[e.moeda] = (stakesByMoeda[e.moeda] || 0) + e.stake;
                  }
                  
                  const weightedOdd = totalStakeConsolidado > 0
                    ? weightedOddSum / totalStakeConsolidado
                    : 0;
                  
                  // Label multi-moeda (ex: "$200 + R$100")
                  const moedas = Object.keys(stakesByMoeda);
                  const stakeLabel = moedas.length <= 1
                    ? Object.values(stakesByMoeda).reduce((a, b) => a + b, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : moedas.map(m => `${getCurrencySymbol(m)}${stakesByMoeda[m].toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`).join(' + ');

                  return (
                    <div className="flex items-center gap-4 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">Odd ø</span>
                        <span className="font-bold tabular-nums">{parseFloat(weightedOdd.toFixed(5))}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">Stake Total</span>
                        <span className="font-bold tabular-nums">{stakeLabel}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Linha de reservas abaixo da tabela */}
              {bookmakerId && saldoComReservas && saldoComReservas.reservado > 0 && (
                <div className="px-3 py-2 bg-muted/10 border-t border-border/30 flex items-center justify-between gap-4">
                  <SaldoReservaCompact
                    saldoContabil={saldoComReservas.contabil}
                    saldoReservado={saldoComReservas.reservado}
                    saldoDisponivel={saldoComReservas.disponivel}
                    moeda={bookmakerSaldo?.moeda || 'BRL'}
                    stakeAtual={parseFloat(stake) || 0}
                    loading={saldoReservasLoading}
                  />
                </div>
              )}
            </div>

              {/* SaldoWaterfallPreview - mostra como stake será distribuído (sem toggle, FB agora é inline) */}
              {bookmakerSaldo && !aposta?.gerou_freebet && bookmakerId && stakeBookmakerEfetiva > 0 && (
                <div className="mt-3">
                  <SaldoWaterfallPreview
                    stake={stakeBookmakerEfetiva}
                    saldoBonus={bookmakerSaldo.saldoBonus}
                    saldoFreebet={bookmakerSaldo.saldoFreebet}
                    saldoReal={bookmakerSaldo.saldoDisponivel}
                    usarFreebet={usarFreebetBookmaker}
                    moeda={bookmakerSaldo.moeda}
                    isEditMode={!!aposta && aposta.bookmaker_id === bookmakerId}
                    originalStake={aposta?.stake || 0}
                    currentResultado={aposta?.resultado}
                  />
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
                                            instance_identifier: selectedBk.instance_identifier,
                                          };
                                        }
                                        return null;
                                      })() : null}
                                      placeholder="Selecione"
                                    />
                                  </SelectTrigger>
                                  <BookmakerSearchableSelectContent
                                    bookmakers={bookmakers}
                                    itemClassName="max-w-full"
                                    emptyMessage="Nenhuma bookmaker disponível"
                                  />
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
                                      saldo_operavel: selectedBk.saldo_operavel,
                                      saldo_freebet: selectedBk.saldo_freebet,
                                      saldo_disponivel: selectedBk.saldo_disponivel,
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
                                            instance_identifier: selectedBk.instance_identifier,
                                          };
                                        }
                                        return null;
                                      })() : null}
                                      placeholder="Selecione"
                                    />
                                  </SelectTrigger>
                                  <BookmakerSearchableSelectContent
                                    bookmakers={bookmakers}
                                    itemClassName="max-w-full"
                                  />
                                </Select>
                                {/* Metadados fixos - altura fixa para evitar layout jumps */}
                                <BookmakerMetaRow 
                                  bookmaker={coberturaBackBookmakerId ? (() => {
                                    const selectedBk = bookmakers.find(b => b.id === coberturaBackBookmakerId);
                                    if (!selectedBk) return null;
                                    return {
                                      parceiro_nome: selectedBk.parceiro_nome,
                                      moeda: selectedBk.moeda,
                                      saldo_operavel: selectedBk.saldo_operavel,
                                      saldo_freebet: selectedBk.saldo_freebet,
                                      saldo_disponivel: selectedBk.saldo_disponivel,
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
                                            instance_identifier: selectedBk.instance_identifier,
                                          };
                                        }
                                        return null;
                                      })() : null}
                                      placeholder="Selecione"
                                    />
                                  </SelectTrigger>
                                  <BookmakerSearchableSelectContent
                                    bookmakers={bookmakers}
                                    itemClassName="max-w-full"
                                  />
                                </Select>
                                {/* Metadados fixos - altura fixa para evitar layout jumps */}
                                <BookmakerMetaRow 
                                  bookmaker={coberturaLayBookmakerId ? (() => {
                                    const selectedBk = bookmakers.find(b => b.id === coberturaLayBookmakerId);
                                    if (!selectedBk) return null;
                                    return {
                                      parceiro_nome: selectedBk.parceiro_nome,
                                      moeda: selectedBk.moeda,
                                      saldo_operavel: selectedBk.saldo_operavel,
                                      saldo_freebet: selectedBk.saldo_freebet,
                                      saldo_disponivel: selectedBk.saldo_disponivel,
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
                      { value: "GREEN", label: "Green", selectedClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-500", hoverClass: "hover:bg-emerald-500/15 hover:text-emerald-700 dark:hover:text-emerald-500" },
                      { value: "RED", label: "Red", selectedClass: "bg-red-500/15 text-red-700 dark:text-red-500", hoverClass: "hover:bg-red-500/15 hover:text-red-700 dark:hover:text-red-500" },
                      { value: "MEIO_GREEN", label: "½ Green", selectedClass: "bg-teal-500/15 text-teal-700 dark:text-teal-500", hoverClass: "hover:bg-teal-500/15 hover:text-teal-700 dark:hover:text-teal-500" },
                      { value: "MEIO_RED", label: "½ Red", selectedClass: "bg-orange-500/15 text-orange-700 dark:text-orange-500", hoverClass: "hover:bg-orange-500/15 hover:text-orange-700 dark:hover:text-orange-500" },
                      { value: "VOID", label: "Void", selectedClass: "bg-muted text-muted-foreground", hoverClass: "hover:bg-muted hover:text-muted-foreground" },
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
                  <span className="font-medium text-emerald-600 dark:text-emerald-500">
                    {formatCurrencyWithSymbol(calculateValorRetorno() || 0, getSelectedBookmakerMoeda())}
                  </span>
                </div>
                {calculateLucroPrejuizo() !== null && (
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-sm text-muted-foreground">Lucro/Prejuízo:</span>
                    <span className={`font-medium ${calculateLucroPrejuizo()! >= 0 ? 'text-emerald-600 dark:text-emerald-500' : 'text-red-600 dark:text-red-500'}`}>
                      {formatCurrencyWithSymbol(calculateLucroPrejuizo()!, getSelectedBookmakerMoeda())}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Gerou Freebet removido - funcionalidade desativada */}
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

          {/* Fonte da Entrada - só aparece para ValueBet (embedded) */}
          {registroValues.estrategia === 'VALUEBET' && (
            <div className="px-4 pt-2">
              <FonteEntradaSelector
                workspaceId={workspaceId}
                value={fonteEntrada}
                onChange={setFonteEntrada}
              />
            </div>
          )}

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
                                        instance_identifier: selectedBk.instance_identifier,
                                      };
                                    }
                                    return null;
                                  })() : null}
                                  placeholder="Selecione"
                                />
                              </SelectTrigger>
                              <BookmakerSearchableSelectContent
                                bookmakers={bookmakers}
                                itemClassName="max-w-full"
                              />
                            </Select>
                            
                            {/* Metadados fixos abaixo do select - altura fixa para evitar layout jumps */}
                            <BookmakerMetaRow 
                              bookmaker={bookmakerId ? (() => {
                                const selectedBk = bookmakers.find(b => b.id === bookmakerId);
                                if (!selectedBk) return null;
                                return {
                                  parceiro_nome: selectedBk.parceiro_nome,
                                  moeda: selectedBk.moeda,
                                  saldo_operavel: saldoComReservas?.disponivel ?? selectedBk.saldo_operavel,
                                  saldo_freebet: selectedBk.saldo_freebet,
                                  saldo_disponivel: selectedBk.saldo_disponivel,
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

            {/* SaldoWaterfallPreview (Dialog Mode) - FB toggle agora é inline na tabela */}
            {tipoAposta === "bookmaker" && bookmakerSaldo && !aposta?.gerou_freebet && bookmakerId && stakeBookmakerEfetiva > 0 && (
              <div className="mt-3 p-3 rounded-lg border border-border/30 bg-muted/5">
                <SaldoWaterfallPreview
                  stake={stakeBookmakerEfetiva}
                  saldoBonus={bookmakerSaldo.saldoBonus}
                  saldoFreebet={bookmakerSaldo.saldoFreebet}
                  saldoReal={bookmakerSaldo.saldoDisponivel}
                  usarFreebet={usarFreebetBookmaker}
                  moeda={bookmakerSaldo.moeda}
                  isEditMode={!!aposta && aposta.bookmaker_id === bookmakerId}
                  originalStake={aposta?.stake || 0}
                  currentResultado={aposta?.resultado}
                />
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
                    { value: "GREEN", label: "Green", selectedClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-500", hoverClass: "hover:bg-emerald-500/15 hover:text-emerald-700 dark:hover:text-emerald-500" },
                    { value: "RED", label: "Red", selectedClass: "bg-red-500/15 text-red-700 dark:text-red-500", hoverClass: "hover:bg-red-500/15 hover:text-red-700 dark:hover:text-red-500" },
                    { value: "MEIO_GREEN", label: "½ Green", selectedClass: "bg-teal-500/15 text-teal-700 dark:text-teal-500", hoverClass: "hover:bg-teal-500/15 hover:text-teal-700 dark:hover:text-teal-500" },
                    { value: "MEIO_RED", label: "½ Red", selectedClass: "bg-orange-500/15 text-orange-700 dark:text-orange-500", hoverClass: "hover:bg-orange-500/15 hover:text-orange-700 dark:hover:text-orange-500" },
                    { value: "VOID", label: "Void", selectedClass: "bg-muted text-muted-foreground", hoverClass: "hover:bg-muted hover:text-muted-foreground" },
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

            {/* Gerou Freebet removido - funcionalidade desativada */}
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
