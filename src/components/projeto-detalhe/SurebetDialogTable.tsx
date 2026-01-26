/**
 * SurebetDialogTable - Calculadora de Arbitragem N-Pernas
 * 
 * REESTRUTURAÇÃO COMPLETA:
 * - Suporte nativo para 2, 3, 4 ou mais pernas sem limitação estrutural
 * - Modelo parametrizado (não mais fixo em 1-2 / 1-X-2)
 * - Layout de tabela minimalista estilo planilha
 * - Múltiplas casas por perna (divisão de stake)
 * - Checkbox D para distribuição de lucro N-pernas
 * - Compatível com rascunhos
 * - Preparado para OCR/importação de imagem
 */
import { useState, useEffect, useMemo, useRef, useCallback, KeyboardEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useBookmakerSaldosQuery, useInvalidateBookmakerSaldos, type BookmakerSaldo } from "@/hooks/useBookmakerSaldosQuery";
import { useCurrencySnapshot, type SupportedCurrency } from "@/hooks/useCurrencySnapshot";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { 
  Calculator, 
  Save, 
  Trash2,
  Plus,
  Minus,
  Upload,
  Target,
  Check,
  AlertTriangle,
  ArrowRight
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { RegistroApostaValues, getSuggestionsForTab } from "./RegistroApostaFields";
import { getMarketsForSportAndModel, isMercadoCompativelComModelo } from "@/lib/marketNormalizer";
import { 
  BookmakerSelectOption, 
  formatCurrency
} from "@/components/bookmakers/BookmakerSelectOption";
import { useProjetoConsolidacao } from "@/hooks/useProjetoConsolidacao";
import { pernasToInserts } from "@/types/apostasPernas";
import { type MoedaOperacao } from "@/types/apostasUnificada";
import { useApostaRascunho, type ApostaRascunho } from "@/hooks/useApostaRascunho";
import { useBonusBalanceManager } from "@/hooks/useBonusBalanceManager";
import { useSurebetPrintImport } from "@/hooks/useSurebetPrintImport";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ============================================
// TIPOS
// ============================================

interface Surebet {
  id: string;
  data_operacao: string;
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
}

interface SurebetDialogTableProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projetoId: string;
  surebet: Surebet | null;
  onSuccess: () => void;
  activeTab?: string;
  embedded?: boolean;
  rascunho?: ApostaRascunho | null;
}

interface SurebetPernaEntry {
  bookmaker_id: string;
  bookmaker_nome: string;
  moeda: SupportedCurrency;
  odd: number;
  stake: number;
  stake_brl_referencia: number | null;
  cotacao_snapshot: number | null;
  cotacao_snapshot_at: string | null;
  selecao_livre?: string;
}

interface SurebetPerna {
  selecao: string;
  selecao_livre: string;
  entries?: SurebetPernaEntry[];
  odd_media?: number;
  stake_total?: number;
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

interface OddFormEntry {
  bookmaker_id: string;
  moeda: SupportedCurrency;
  odd: string;
  stake: string;
  selecaoLivre: string;
}

type StakeOrigem = "print" | "referencia" | "manual";

interface OddEntry {
  bookmaker_id: string;
  moeda: SupportedCurrency;
  odd: string;
  stake: string;
  selecao: string;
  selecaoLivre: string;
  isReference: boolean;
  isManuallyEdited: boolean;
  stakeOrigem?: StakeOrigem;
  resultado?: string | null;
  lucro_prejuizo?: number | null;
  gerouFreebet?: boolean;
  valorFreebetGerada?: string;
  freebetStatus?: "PENDENTE" | "LIBERADA" | "NAO_LIBERADA" | null;
  index?: number;
  additionalEntries?: OddFormEntry[];
}

// ============================================
// FUNÇÕES UTILITÁRIAS
// ============================================

function calcularOddMedia(mainEntry: { odd: string; stake: string }, additionalEntries?: OddFormEntry[]): number {
  const allEntries = [
    { odd: mainEntry.odd, stake: mainEntry.stake, isMain: true },
    ...(additionalEntries || []).map(e => ({ odd: e.odd, stake: e.stake, isMain: false }))
  ];

  const oddsValidas = allEntries
    .map(e => ({ ...e, oddNum: parseFloat(e.odd), stakeNum: parseFloat(e.stake) }))
    .filter(e => !isNaN(e.oddNum) && e.oddNum > 1);

  if (oddsValidas.length === 0) return 0;

  const entriesComStake = oddsValidas.filter(e => !isNaN(e.stakeNum) && e.stakeNum > 0);
  const somaStake = entriesComStake.reduce((acc, e) => acc + e.stakeNum, 0);

  if (somaStake > 0) {
    const somaStakeOdd = entriesComStake.reduce((acc, e) => acc + e.stakeNum * e.oddNum, 0);
    return somaStakeOdd / somaStake;
  }

  const mainOdd = oddsValidas.find(e => e.isMain)?.oddNum;
  return mainOdd ?? oddsValidas[0].oddNum;
}

function calcularStakeTotal(mainEntry: { stake: string }, additionalEntries?: OddFormEntry[]): number {
  const mainStake = parseFloat(mainEntry.stake) || 0;
  const additionalStakes = (additionalEntries || []).reduce((acc, e) => {
    return acc + (parseFloat(e.stake) || 0);
  }, 0);
  return mainStake + additionalStakes;
}

// Cálculo de stakes para arbitragem N-pernas com lucro equalizado
function calcularStakesNPernas(
  odds: { oddMedia: number; stakeAtual: number; isReference: boolean }[],
  arredondarFn: (value: number) => number
): { stakes: number[]; isValid: boolean; lucroIgualado: number } {
  const n = odds.length;
  if (n < 2) {
    return { stakes: odds.map(o => o.stakeAtual), isValid: false, lucroIgualado: 0 };
  }
  
  const todasOddsValidas = odds.every(o => o.oddMedia > 1);
  if (!todasOddsValidas) {
    return { stakes: odds.map(o => o.stakeAtual), isValid: false, lucroIgualado: 0 };
  }
  
  const refIndex = odds.findIndex(o => o.isReference);
  if (refIndex === -1) {
    return { stakes: odds.map(o => o.stakeAtual), isValid: false, lucroIgualado: 0 };
  }
  
  const refOdd = odds[refIndex].oddMedia;
  const refStake = odds[refIndex].stakeAtual;
  
  if (refStake <= 0 || refOdd <= 1) {
    return { stakes: odds.map(o => o.stakeAtual), isValid: false, lucroIgualado: 0 };
  }
  
  // Retorno-alvo (se a perna de referência ganhar)
  const targetReturn = refStake * refOdd;
  
  // Para igualar lucro em todas as pernas: stake[i] = targetReturn / odd[i]
  const calculatedStakes = odds.map((o, i) => {
    if (i === refIndex) return refStake;
    return arredondarFn(targetReturn / o.oddMedia);
  });
  
  const stakeTotal = calculatedStakes.reduce((a, b) => a + b, 0);
  const lucroIgualado = targetReturn - stakeTotal;
  
  return { stakes: calculatedStakes, isValid: true, lucroIgualado };
}

// ============================================
// CONSTANTES
// ============================================

const ESPORTES = [
  "Futebol", "Basquete", "Tênis", "Baseball", "Hockey", 
  "Futebol Americano", "Vôlei", "MMA/UFC", "Boxe", "Golfe",
  "League of Legends", "Counter-Strike", "Dota 2", "eFootball"
];

const ESTRATEGIAS = [
  { value: "SUREBET", label: "Surebet" },
  { value: "FREEBET_CONVERSION", label: "Conversão de Freebet" },
  { value: "MATCHED_BETTING", label: "Matched Betting" },
  { value: "BONUS_ABUSE", label: "Bonus Abuse" },
  { value: "LOW_RISK", label: "Low Risk" },
  { value: "ARBITRAGEM", label: "Arbitragem" },
];

const CONTEXTOS = [
  { value: "NORMAL", label: "Saldo Real" },
  { value: "FREEBET", label: "Freebet" },
  { value: "SIMULACAO", label: "Simulação" },
  { value: "BONUS", label: "Bônus" },
];

// Labels para pernas baseado no número
const getPernaLabel = (index: number, total: number): string => {
  if (total === 2) return index === 0 ? "1" : "2";
  if (total === 3) return index === 0 ? "1" : index === 1 ? "X" : "2";
  return String(index + 1);
};

// Seleções padrão por número de pernas
const getDefaultSelecoes = (numPernas: number): string[] => {
  return Array.from({ length: numPernas }, () => "");
};

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export function SurebetDialogTable({ 
  open, 
  onOpenChange, 
  projetoId, 
  surebet, 
  onSuccess, 
  activeTab = 'surebet', 
  embedded = false, 
  rascunho = null 
}: SurebetDialogTableProps) {
  const isEditing = !!surebet;
  const { workspaceId } = useWorkspace();
  
  const { getSnapshotFields } = useCurrencySnapshot();
  const { moedaConsolidacao, cotacaoAtual, fonteCotacao } = useProjetoConsolidacao({ projetoId });
  
  const isBonusContext = activeTab === 'bonus' || activeTab === 'bonus-operacoes';
  const { 
    data: bookmakerSaldos = [], 
    isLoading: saldosLoading,
    refetch: refetchSaldos 
  } = useBookmakerSaldosQuery({
    projetoId,
    enabled: open,
    includeZeroBalance: isEditing || isBonusContext,
  });
  const invalidateSaldos = useInvalidateBookmakerSaldos();
  
  const { atualizarProgressoRollover, reverterProgressoRollover, hasActiveRolloverBonus } = useBonusBalanceManager();
  const { criarRascunho, listarPorTipo } = useApostaRascunho(projetoId, workspaceId || '');

  // ============================================
  // ESTADOS DO FORMULÁRIO
  // ============================================
  
  // Contexto do topo
  const [estrategia, setEstrategia] = useState<string>("SUREBET");
  const [contexto, setContexto] = useState<string>("NORMAL");
  const [esporte, setEsporte] = useState("Futebol");
  const [evento, setEvento] = useState("");
  const [mercado, setMercado] = useState("");
  
  // Modelo de arbitragem parametrizado
  const [modeloTipo, setModeloTipo] = useState<"2" | "3" | "4+">("2");
  const [numPernasCustom, setNumPernasCustom] = useState<number>(4);
  
  // Número efetivo de pernas
  const numPernas = useMemo(() => {
    if (modeloTipo === "2") return 2;
    if (modeloTipo === "3") return 3;
    return numPernasCustom;
  }, [modeloTipo, numPernasCustom]);
  
  // Pernas e odds
  const [odds, setOdds] = useState<OddEntry[]>(() => 
    getDefaultSelecoes(2).map((sel, i) => ({
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
    }))
  );
  
  // Checkbox D: por padrão TODAS marcadas (neutro)
  const [directedProfitLegs, setDirectedProfitLegs] = useState<number[]>([0, 1]);
  
  // Controles
  const [arredondarAtivado, setArredondarAtivado] = useState(true);
  const [arredondarValor, setArredondarValor] = useState("1");
  const [saving, setSaving] = useState(false);
  
  // Estado para conversão de operação parcial para apostas simples
  const [showConversionDialog, setShowConversionDialog] = useState(false);
  const [conversionInProgress, setConversionInProgress] = useState(false);
  
  const [linkedApostas, setLinkedApostas] = useState<any[]>([]);
  
  // Refs para navegação por teclado
  const tableContainerRef = useRef<HTMLDivElement>(null);
  
  // Import de print
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedLegForPrint, setSelectedLegForPrint] = useState<number | null>(null);
  const {
    legPrints,
    isProcessingAny,
    sharedContext,
    processLegImage,
    clearLegPrint,
    clearAllPrints,
    initializeLegPrints,
    applyLegData,
  } = useSurebetPrintImport();
  
  // Estado para indicar qual perna está em foco para paste
  const [focusedLeg, setFocusedLeg] = useState<number | null>(null);
  
  // "Ativo" quando existe pelo menos uma perna desmarcada
  const profitDirectionActive = !isEditing && directedProfitLegs.length > 0 && directedProfitLegs.length < odds.length;
  
  // ============================================
  // HANDLERS GLOBAIS
  // ============================================
  
  // Handler global de paste (Ctrl+V) para processar imagem na perna focada
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
            await processLegImage(focusedLeg, file);
            break;
          }
        }
      }
    };
    
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [open, isEditing, focusedLeg, processLegImage]);
  
  // Handler para carregar arquivo via botão Importar
  const handleImportButtonClick = useCallback((legIndex?: number) => {
    setSelectedLegForPrint(legIndex ?? focusedLeg ?? 0);
    fileInputRef.current?.click();
  }, [focusedLeg]);
  
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || selectedLegForPrint === null) return;
    
    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecione uma imagem');
      return;
    }
    
    await processLegImage(selectedLegForPrint, file);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [selectedLegForPrint, processLegImage]);
  
  // Aplicar dados do OCR quando disponível
  useEffect(() => {
    if (!legPrints || legPrints.length === 0) return;
    
    legPrints.forEach((legPrint, legIndex) => {
      if (!legPrint.parsedData || legPrint.isProcessing) return;
      
      const legData = applyLegData(legIndex);
      if (!legData) return;
      
      setOdds(prev => {
        const newOdds = [...prev];
        if (newOdds[legIndex]) {
          if (legData.odd) {
            newOdds[legIndex] = { 
              ...newOdds[legIndex], 
              odd: legData.odd,
              isManuallyEdited: false 
            };
          }
          if (legData.stake) {
            newOdds[legIndex] = { 
              ...newOdds[legIndex], 
              stake: legData.stake,
              isManuallyEdited: false,
              isReference: legIndex === 0 
            };
          }
          if (legData.selecaoLivre) {
            newOdds[legIndex] = { 
              ...newOdds[legIndex], 
              selecaoLivre: legData.selecaoLivre 
            };
          }
        }
        return newOdds;
      });
      
      clearLegPrint(legIndex);
    });
    
    // Aplicar contexto compartilhado
    if (sharedContext.evento && !evento) {
      setEvento(sharedContext.evento);
    }
    if (sharedContext.esporte && esporte === "Futebol") {
      setEsporte(sharedContext.esporte);
    }
    if (sharedContext.mercado && !mercado) {
      setMercado(sharedContext.mercado);
    }
  }, [legPrints, applyLegData, clearLegPrint, sharedContext, evento, esporte, mercado]);
  
  // Handler para navegação por teclado entre campos
  const handleFieldKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>, fieldType: 'odd' | 'stake') => {
    const key = e.key.toLowerCase();
    if ((key === 'q' && fieldType === 'odd') || (key === 's' && fieldType === 'stake')) {
      e.preventDefault();
      const container = tableContainerRef.current;
      if (!container) return;
      
      const selector = fieldType === 'odd' ? 'input[data-field-type="odd"]' : 'input[data-field-type="stake"]';
      const allFields = Array.from(container.querySelectorAll<HTMLInputElement>(selector));
      
      if (allFields.length === 0) return;
      
      const currentIndex = allFields.indexOf(e.currentTarget);
      const nextIndex = (currentIndex + 1) % allFields.length;
      allFields[nextIndex]?.focus();
      allFields[nextIndex]?.select();
    }
  }, []);

  // ============================================
  // BOOKMAKERS DISPONÍVEIS
  // ============================================

  const bookmakersDisponiveis = useMemo(() => {
    return bookmakerSaldos.filter((bk) => bk.saldo_operavel >= 0.50);
  }, [bookmakerSaldos]);

  // ============================================
  // INICIALIZAÇÃO E RESET
  // ============================================

  useEffect(() => {
    if (open) {
      if (surebet && surebet.id) {
        // Modo edição: carregar surebet existente
        setEvento(surebet.evento);
        setEsporte(surebet.esporte);
        setMercado(surebet.mercado || "");
        setEstrategia(surebet.estrategia || "SUREBET");
        setContexto(surebet.contexto_operacional || "NORMAL");
        
        // Determinar modelo baseado no modelo salvo
        const modeloSalvo = surebet.modelo || "1-2";
        if (modeloSalvo === "1-2") {
          setModeloTipo("2");
        } else if (modeloSalvo === "1-X-2") {
          setModeloTipo("3");
        } else {
          setModeloTipo("4+");
          const match = modeloSalvo.match(/(\d+)/);
          if (match) setNumPernasCustom(parseInt(match[1]));
        }
        
        fetchLinkedPernas(surebet.id, surebet.modelo);
      } else if (rascunho) {
        // Modo rascunho: carregar dados do rascunho COMPLETAMENTE
        setEvento(rascunho.evento || "");
        setEsporte(rascunho.esporte || "Futebol");
        setMercado(rascunho.mercado || "");
        
        // Carregar campos de contexto obrigatórios
        setEstrategia(rascunho.estrategia || "SUREBET");
        setContexto(rascunho.contexto_operacional || "NORMAL");
        
        // Determinar modelo baseado no novo campo modelo_tipo ou fallback para pernas
        const numPernasRascunho = rascunho.quantidade_pernas || rascunho.pernas?.length || 2;
        
        if (rascunho.modelo_tipo) {
          setModeloTipo(rascunho.modelo_tipo);
          if (rascunho.modelo_tipo === "4+") {
            setNumPernasCustom(numPernasRascunho);
          }
        } else {
          // Fallback: inferir modelo_tipo do número de pernas
          if (numPernasRascunho === 2) {
            setModeloTipo("2");
          } else if (numPernasRascunho === 3) {
            setModeloTipo("3");
          } else {
            setModeloTipo("4+");
            setNumPernasCustom(numPernasRascunho);
          }
        }
        
        // Carregar pernas do rascunho
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
          setOdds(rascunhoOdds);
          setDirectedProfitLegs(Array.from({ length: numPernasRascunho }, (_, i) => i));
        } else {
          // Criar pernas vazias se não houver no rascunho
          const defaultSelecoes = getDefaultSelecoes(numPernasRascunho);
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
          setDirectedProfitLegs(Array.from({ length: numPernasRascunho }, (_, i) => i));
        }
        
        initializeLegPrints(numPernasRascunho);
        setLinkedApostas([]);
      } else {
        // Modo novo: resetar formulário
        resetForm();
        setLinkedApostas([]);
        initializeLegPrints(2);
      }
    }
  }, [open, surebet, rascunho]);

  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        resetForm();
        setLinkedApostas([]);
        clearAllPrints();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Atualizar odds quando número de pernas muda
  useEffect(() => {
    if (isEditing) return;
    
    const currentNumPernas = odds.length;
    if (numPernas !== currentNumPernas) {
      const defaultSelecoes = getDefaultSelecoes(numPernas);
      
      // Preservar dados existentes quando possível
      const newOdds: OddEntry[] = defaultSelecoes.map((sel, i) => {
        if (i < currentNumPernas && odds[i]) {
          // Manter dados existentes, só atualizar seleção se necessário
          return {
            ...odds[i],
            selecao: sel
          };
        }
        return {
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
        };
      });
      
      setOdds(newOdds);
      setDirectedProfitLegs(Array.from({ length: numPernas }, (_, i) => i));
      initializeLegPrints(numPernas);
    }
  }, [numPernas, isEditing]);

  const resetForm = () => {
    setEvento("");
    setMercado("");
    setEsporte("Futebol");
    setEstrategia("SUREBET");
    setContexto("NORMAL");
    setModeloTipo("2");
    setNumPernasCustom(4);
    setArredondarAtivado(true);
    setArredondarValor("1");
    
    const defaultSelecoes = getDefaultSelecoes(2);
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
    setDirectedProfitLegs([0, 1]);
    setLinkedApostas([]);
  };

  const arredondarStake = (valor: number): number => {
    if (!arredondarAtivado) return valor;
    const fator = parseFloat(arredondarValor) || 1;
    return Math.round(valor / fator) * fator;
  };

  const fetchLinkedPernas = async (surebetId: string, surebetModelo: string) => {
    const { data: pernasData } = await supabase
      .from("apostas_pernas")
      .select(`*, bookmakers (nome)`)
      .eq("aposta_id", surebetId)
      .order("ordem", { ascending: true });

    if (pernasData && pernasData.length > 0) {
      const pernasOdds: OddEntry[] = pernasData.map((perna: any, index: number) => ({
        bookmaker_id: perna.bookmaker_id || "",
        moeda: (perna.moeda || "BRL") as SupportedCurrency,
        odd: perna.odd?.toString() || "",
        stake: perna.stake?.toString() || "",
        selecao: perna.selecao,
        selecaoLivre: perna.selecao_livre || "",
        isReference: index === 0,
        isManuallyEdited: true,
        resultado: perna.resultado,
        lucro_prejuizo: perna.lucro_prejuizo,
        gerouFreebet: perna.gerou_freebet || false,
        valorFreebetGerada: perna.valor_freebet_gerada?.toString() || "",
        index,
        additionalEntries: []
      }));
      setOdds(pernasOdds);
      setLinkedApostas(pernasData);
      setDirectedProfitLegs(Array.from({ length: pernasOdds.length }, (_, i) => i));
    }
  };

  // ============================================
  // MANIPULAÇÃO DE ODDS
  // ============================================

  const updateOdd = (index: number, field: keyof OddEntry, value: string | boolean) => {
    const newOdds = [...odds];
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
    
    setOdds(newOdds);
  };

  const setReferenceIndex = (index: number) => {
    const newOdds = odds.map((o, i) => ({
      ...o,
      isReference: i === index,
      isManuallyEdited: i === index ? o.isManuallyEdited : (o.stakeOrigem === "print" ? true : false),
      stakeOrigem: i === index ? o.stakeOrigem : (o.stakeOrigem === "print" ? "print" : undefined)
    }));
    setOdds(newOdds);
  };

  const addAdditionalEntry = (pernaIndex: number) => {
    const newOdds = [...odds];
    const currentEntries = newOdds[pernaIndex].additionalEntries || [];
    const mainSelecaoLivre = newOdds[pernaIndex].selecaoLivre || "";
    newOdds[pernaIndex].additionalEntries = [
      ...currentEntries,
      { bookmaker_id: "", moeda: "BRL" as SupportedCurrency, odd: "", stake: "", selecaoLivre: mainSelecaoLivre }
    ];
    setOdds(newOdds);
  };

  const removeAdditionalEntry = (pernaIndex: number, entryIndex: number) => {
    const newOdds = [...odds];
    const currentEntries = newOdds[pernaIndex].additionalEntries || [];
    newOdds[pernaIndex].additionalEntries = currentEntries.filter((_, i) => i !== entryIndex);
    setOdds(newOdds);
  };

  const updateAdditionalEntry = (pernaIndex: number, entryIndex: number, field: keyof OddFormEntry, value: string) => {
    const newOdds = [...odds];
    const currentEntries = [...(newOdds[pernaIndex].additionalEntries || [])];
    currentEntries[entryIndex] = { ...currentEntries[entryIndex], [field]: value };
    
    if (field === "bookmaker_id") {
      const selectedBk = bookmakerSaldos.find(b => b.id === value);
      currentEntries[entryIndex].moeda = (selectedBk?.moeda as SupportedCurrency) || "BRL";
    }
    
    newOdds[pernaIndex].additionalEntries = currentEntries;
    setOdds(newOdds);
  };

  const getOddMediaPerna = (entry: OddEntry): number => {
    return calcularOddMedia({ odd: entry.odd, stake: entry.stake }, entry.additionalEntries);
  };

  const getStakeTotalPerna = (entry: OddEntry): number => {
    return calcularStakeTotal({ stake: entry.stake }, entry.additionalEntries);
  };

  const getBookmakerNome = (bookmakerId: string): string => {
    const bk = bookmakerSaldos.find(b => b.id === bookmakerId);
    return bk?.nome || "";
  };

  // ============================================
  // AUTO-CÁLCULO DE STAKES (N-PERNAS)
  // ============================================

  useEffect(() => {
    if (isEditing) return;
    if (profitDirectionActive) return;
    
    const pernaData = odds.map(perna => ({
      oddMedia: getOddMediaPerna(perna),
      stakeAtual: getStakeTotalPerna(perna),
      isReference: perna.isReference,
      isManuallyEdited: perna.isManuallyEdited
    }));
    
    const refIndex = pernaData.findIndex(p => p.isReference);
    if (refIndex === -1) return;
    
    const refStake = pernaData[refIndex].stakeAtual;
    const refOdd = pernaData[refIndex].oddMedia;
    if (refStake <= 0 || refOdd <= 1) return;
    
    const validOddsCount = pernaData.filter(p => p.oddMedia > 1).length;
    if (validOddsCount < odds.length) return;
    
    const resultado = calcularStakesNPernas(pernaData, arredondarStake);
    
    if (!resultado.isValid) return;
    
    let needsUpdate = false;
    const newOdds = odds.map((o, i) => {
      if (i === refIndex) return o;
      if (o.isManuallyEdited || o.stakeOrigem === "print" || o.stakeOrigem === "manual") return o;
      
      const calculatedStake = resultado.stakes[i];
      const currentStake = parseFloat(o.stake) || 0;
      
      if (Math.abs(calculatedStake - currentStake) > 0.01) {
        needsUpdate = true;
        return { ...o, stake: calculatedStake.toFixed(2), stakeOrigem: "referencia" as StakeOrigem };
      }
      return o;
    });
    
    if (needsUpdate) {
      setOdds(newOdds);
    }
  }, [
    odds.map(o => `${o.odd}-${o.stake}-${o.isManuallyEdited}`).join(','),
    odds.map(o => o.isReference).join(','),
    arredondarAtivado,
    arredondarValor,
    isEditing,
    profitDirectionActive
  ]);

  // ============================================
  // LÓGICA DO CHECKBOX D — DISTRIBUIÇÃO N-PERNAS
  // ============================================

  const directedStakes = useMemo(() => {
    if (directedProfitLegs.length === odds.length) return null;
    if (directedProfitLegs.length === 0) return null;
    
    const parsedOdds = odds.map(o => calcularOddMedia({ odd: o.odd, stake: o.stake }, o.additionalEntries));
    const validOddsCount = parsedOdds.filter(o => o > 1).length;
    
    if (validOddsCount !== odds.length) return null;
    
    const refIndex = directedProfitLegs.find(i => {
      const stake = parseFloat(odds[i].stake);
      return !isNaN(stake) && stake > 0;
    });
    
    if (refIndex === undefined) return null;
    
    const refStake = parseFloat(odds[refIndex].stake) || 0;
    const refOdd = parsedOdds[refIndex];
    
    if (refStake <= 0 || refOdd <= 1) return null;
    
    const retornoAlvo = refStake * refOdd;
    
    // Calcular stakes para pernas D=true
    const stakesDirected: { [key: number]: number } = {};
    for (const i of directedProfitLegs) {
      const oddI = parsedOdds[i];
      if (oddI > 1) {
        stakesDirected[i] = retornoAlvo / oddI;
      }
    }
    
    const somaStakesDirected = Object.values(stakesDirected).reduce((a, b) => a + b, 0);
    
    // Índices das pernas não direcionadas (D=false)
    const undirectedIndices = odds.map((_, i) => i).filter(i => !directedProfitLegs.includes(i));
    
    if (undirectedIndices.length === 0) return null;
    
    // Resolver sistema para pernas D=false (lucro = 0)
    const sumInvOdds = undirectedIndices.reduce((acc, i) => acc + 1 / parsedOdds[i], 0);
    
    if (sumInvOdds >= 1) return null;
    
    const S = (somaStakesDirected * sumInvOdds) / (1 - sumInvOdds);
    const stakeTotal = somaStakesDirected + S;
    
    const newStakes: number[] = [];
    
    for (let i = 0; i < odds.length; i++) {
      const oddI = parsedOdds[i];
      if (oddI <= 1) {
        newStakes.push(0);
      } else if (directedProfitLegs.includes(i)) {
        newStakes.push(arredondarStake(stakesDirected[i] || retornoAlvo / oddI));
      } else {
        newStakes.push(arredondarStake(stakeTotal / oddI));
      }
    }
    
    return newStakes;
  }, [odds.map(o => `${o.odd}|${o.stake}`).join(','), directedProfitLegs, arredondarAtivado, arredondarValor]);
  
  // Aplicar stakes calculadas quando há direcionamento
  useEffect(() => {
    if (isEditing) return;
    if (!directedStakes) return;
    if (directedProfitLegs.length === odds.length) return;
    
    const refIndex = directedProfitLegs.find(i => {
      const stake = parseFloat(odds[i].stake);
      return !isNaN(stake) && stake > 0;
    });
    
    let needsUpdate = false;
    const newOdds = odds.map((o, i) => {
      if (i === refIndex) return o;
      
      const targetStake = directedStakes[i];
      const currentStake = parseFloat(o.stake) || 0;
      
      if (Math.abs(targetStake - currentStake) > 0.01) {
        needsUpdate = true;
        return { 
          ...o, 
          stake: targetStake.toFixed(2),
          isManuallyEdited: false,
          stakeOrigem: "referencia" as StakeOrigem
        };
      }
      return o;
    });
    
    if (needsUpdate) {
      setOdds(newOdds);
    }
  }, [directedStakes, isEditing]);

  // ============================================
  // ANÁLISE E MÉTRICAS
  // ============================================

  const analysis = useMemo(() => {
    const parsedOdds = odds.map(o => getOddMediaPerna(o));
    const validOddsCount = parsedOdds.filter(o => o > 1).length;
    
    const actualStakes = directedStakes || odds.map(o => getStakeTotalPerna(o));
    
    const moedasSelecionadas = odds.map(o => {
      const bk = bookmakerSaldos.find(b => b.id === o.bookmaker_id);
      return bk?.moeda as SupportedCurrency;
    });
    
    const moedasUnicas = [...new Set(moedasSelecionadas.filter(Boolean))];
    const isMultiCurrency = moedasUnicas.length > 1;
    const moedaDominante: SupportedCurrency = moedasUnicas.length === 1 ? moedasUnicas[0] : "BRL";
    
    const stakeTotal = isMultiCurrency ? 0 : actualStakes.reduce((a, b) => a + b, 0);
    
    // Calcular lucro por cenário
    const scenarios = parsedOdds.map((odd, i) => {
      const stakeNesseLado = actualStakes[i];
      const retorno = odd > 1 ? stakeNesseLado * odd : 0;
      const lucro = retorno - stakeTotal;
      const roi = stakeTotal > 0 ? (lucro / stakeTotal) * 100 : 0;
      
      const isDirected = directedProfitLegs.includes(i);
      
      return {
        selecao: odds[i].selecao,
        stake: stakeNesseLado,
        oddMedia: odd,
        retorno,
        lucro,
        roi,
        isPositive: lucro >= 0,
        isDirected
      };
    });
    
    const lucros = scenarios.map(s => s.lucro);
    const minLucro = lucros.length > 0 ? Math.min(...lucros) : 0;
    const minRoi = stakeTotal > 0 ? (minLucro / stakeTotal) * 100 : 0;
    
    return {
      stakeTotal,
      scenarios,
      minLucro,
      minRoi,
      isMultiCurrency,
      moedaDominante,
      validOddsCount,
      suggestedStakes: actualStakes,
      hasDirectedProfit: directedProfitLegs.length > 0
    };
  }, [odds.map(o => `${o.bookmaker_id}|${o.odd}|${o.stake}`).join(','), directedProfitLegs, directedStakes]);

  const pernasCompletasCount = useMemo(() => {
    return odds.filter(entry => {
      const odd = parseFloat(entry.odd);
      const stake = parseFloat(entry.stake);
      return !isNaN(odd) && odd > 1 && !isNaN(stake) && stake > 0 && entry.bookmaker_id;
    }).length;
  }, [odds]);

  // Detectar operação parcial: tem 2+ pernas completas mas não cobre todos os desfechos
  const isOperacaoParcial = useMemo(() => {
    return pernasCompletasCount >= 2 && pernasCompletasCount < numPernas;
  }, [pernasCompletasCount, numPernas]);

  // Pernas válidas para potencial conversão
  const pernasValidas = useMemo(() => {
    return odds.filter(entry => {
      const odd = parseFloat(entry.odd);
      const stake = parseFloat(entry.stake);
      return !isNaN(odd) && odd > 1 && !isNaN(stake) && stake > 0 && entry.bookmaker_id;
    });
  }, [odds]);

  // ============================================
  // SALVAR E DELETAR
  // ============================================

  const handleSave = async () => {
    if (!estrategia) {
      toast.error("Selecione uma estratégia");
      return;
    }
    if (!contexto) {
      toast.error("Selecione um contexto");
      return;
    }
    if (!evento.trim()) {
      toast.error("Informe o evento");
      return;
    }
    if (pernasCompletasCount < 2) {
      toast.error("Arbitragem requer pelo menos 2 pernas completas");
      return;
    }

    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const getBookmakerMoeda = (bookmakerId: string): SupportedCurrency => {
        const bk = bookmakerSaldos.find(b => b.id === bookmakerId);
        return (bk?.moeda as SupportedCurrency) || "BRL";
      };

      const pernasPreenchidas = odds.filter(entry => {
        const hasBookmaker = entry.bookmaker_id && entry.bookmaker_id.trim() !== "";
        const hasOdd = entry.odd && parseFloat(entry.odd) > 1;
        const hasStake = entry.stake && parseFloat(entry.stake) > 0;
        return hasBookmaker && hasOdd && hasStake;
      });

      const pernasToSave: SurebetPerna[] = pernasPreenchidas.map((entry) => {
        const mainStake = parseFloat(entry.stake) || 0;
        const mainMoeda = getBookmakerMoeda(entry.bookmaker_id);
        const mainSnapshotFields = getSnapshotFields(mainStake, mainMoeda);
        
        return {
          selecao: entry.selecao,
          selecao_livre: entry.selecaoLivre || "",
          bookmaker_id: entry.bookmaker_id,
          bookmaker_nome: getBookmakerNome(entry.bookmaker_id),
          moeda: mainMoeda,
          odd: parseFloat(entry.odd),
          stake: mainStake,
          stake_brl_referencia: mainSnapshotFields.valor_brl_referencia,
          cotacao_snapshot: mainSnapshotFields.cotacao_snapshot,
          cotacao_snapshot_at: mainSnapshotFields.cotacao_snapshot_at,
          resultado: null,
          lucro_prejuizo: null,
          lucro_prejuizo_brl_referencia: null,
          gerou_freebet: entry.gerouFreebet || false,
          valor_freebet_gerada: entry.gerouFreebet && entry.valorFreebetGerada 
            ? parseFloat(entry.valorFreebetGerada) 
            : null
        };
      });

      const moedasUnicas = [...new Set(pernasToSave.map(p => p.moeda))];
      const moedaOperacao: MoedaOperacao = moedasUnicas.length === 1 ? moedasUnicas[0] : "MULTI";
      
      const valorBRLReferencia = pernasToSave.reduce((acc, p) => acc + (p.stake_brl_referencia || 0), 0);
      const stakeTotal = moedaOperacao !== "MULTI" ? pernasToSave.reduce((acc, p) => acc + p.stake, 0) : null;

      // Modelo string para salvar
      const modeloString = modeloTipo === "2" ? "1-2" : modeloTipo === "3" ? "1-X-2" : `${numPernasCustom}-way`;

      const { data: insertedData, error: insertError } = await supabase
        .from("apostas_unificada")
        .insert({
          user_id: user.id,
          workspace_id: workspaceId,
          projeto_id: projetoId,
          forma_registro: 'ARBITRAGEM',
          estrategia: estrategia,
          contexto_operacional: contexto,
          evento,
          esporte,
          modelo: modeloString,
          mercado,
          moeda_operacao: moedaOperacao,
          stake_total: stakeTotal,
          valor_brl_referencia: valorBRLReferencia,
          spread_calculado: null,
          roi_esperado: analysis?.minRoi || null,
          lucro_esperado: analysis?.minLucro || null,
          status: "PENDENTE",
          resultado: "PENDENTE",
          pernas: pernasToSave as any,
          data_aposta: new Date().toISOString()
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      if (insertedData?.id && pernasToSave.length > 0) {
        const pernasInsert = pernasToInserts(insertedData.id, pernasToSave);
        await supabase.from("apostas_pernas").insert(pernasInsert);
      }

      toast.success("Arbitragem registrada com sucesso!");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  // Conversão de operação parcial para apostas simples
  const handleConvertToSimpleBets = async () => {
    if (!estrategia) {
      toast.error("Selecione uma estratégia");
      return;
    }
    if (!evento.trim()) {
      toast.error("Informe o evento");
      return;
    }
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

      // Gerar operation_group_id para agrupar as apostas
      const operationGroupId = crypto.randomUUID();
      
      const apostasSimples = pernasValidas.map((entry) => {
        const stake = parseFloat(entry.stake) || 0;
        const moeda = getBookmakerMoeda(entry.bookmaker_id);
        const snapshotFields = getSnapshotFields(stake, moeda);
        
        return {
          user_id: user.id,
          workspace_id: workspaceId,
          projeto_id: projetoId,
          bookmaker_id: entry.bookmaker_id,
          forma_registro: 'SIMPLES',
          estrategia: estrategia,
          contexto_operacional: contexto,
          evento,
          esporte,
          mercado,
          selecao: entry.selecao,
          selecao_livre: entry.selecaoLivre || null,
          moeda_operacao: moeda,
          stake: stake,
          odd: parseFloat(entry.odd),
          valor_brl_referencia: snapshotFields.valor_brl_referencia,
          cotacao_snapshot: snapshotFields.cotacao_snapshot,
          cotacao_snapshot_at: snapshotFields.cotacao_snapshot_at,
          status: "PENDENTE",
          resultado: "PENDENTE",
          data_aposta: new Date().toISOString(),
          observacoes: `Convertida de operação parcial (grupo: ${operationGroupId.slice(0, 8)})`
        };
      });

      // Inserir todas as apostas simples
      const { error: insertError } = await supabase
        .from("apostas_unificada")
        .insert(apostasSimples);

      if (insertError) throw insertError;

      // Se houver rascunho, deletar
      if (rascunho?.id) {
        // O rascunho será deletado pelo componente pai via onSuccess
      }

      toast.success(`${apostasSimples.length} apostas simples registradas!`);
      setShowConversionDialog(false);
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao converter: " + error.message);
    } finally {
      setConversionInProgress(false);
    }
  };

  const handleDelete = async () => {
    if (!surebet) return;
    
    try {
      const { error } = await supabase
        .from("apostas_unificada")
        .delete()
        .eq("id", surebet.id);

      if (error) throw error;
      
      toast.success("Operação excluída!");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao excluir: " + error.message);
    }
  };

  // ============================================
  // FLATTEN ROWS PARA TABELA
  // ============================================

  const tableRows = useMemo(() => {
    const rows: Array<{
      pernaIndex: number;
      entryIndex: number | null;
      isMain: boolean;
      rowSpan: number;
      label: string;
      entry: OddEntry | OddFormEntry;
    }> = [];
    
    odds.forEach((perna, pernaIndex) => {
      const additionalCount = (perna.additionalEntries?.length || 0);
      const totalEntriesForPerna = 1 + additionalCount;
      
      rows.push({
        pernaIndex,
        entryIndex: null,
        isMain: true,
        rowSpan: totalEntriesForPerna,
        label: getPernaLabel(pernaIndex, odds.length),
        entry: perna
      });
      
      (perna.additionalEntries || []).forEach((ae, aeIndex) => {
        rows.push({
          pernaIndex,
          entryIndex: aeIndex,
          isMain: false,
          rowSpan: 0,
          label: "",
          entry: ae
        });
      });
    });
    
    return rows;
  }, [odds]);

  // ============================================
  // RENDERIZAÇÃO
  // ============================================

  const dialogContent = (
    <div className="space-y-4">
      {/* Input hidden para carregar arquivo */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      
      {/* TOPO: CONTEXTO DO EVENTO */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pb-3 border-b border-border/50">

        {/* Esporte */}
        <div>
          <Label className="text-xs text-muted-foreground">Esporte</Label>
          <Select value={esporte} onValueChange={setEsporte} disabled={isEditing}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ESPORTES.map(e => (
                <SelectItem key={e} value={e}>{e}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Evento */}
        <div className="col-span-2">
          <Label className="text-xs text-muted-foreground">Evento</Label>
          <Input 
            placeholder="TIME 1 X TIME 2" 
            value={evento}
            onChange={(e) => setEvento(e.target.value)}
            className="h-8 text-xs uppercase"
            disabled={isEditing}
          />
        </div>

        {/* Mercado */}
        <div>
          <Label className="text-xs text-muted-foreground">Mercado</Label>
          <Input
            placeholder="Mercado"
            value={mercado}
            onChange={(e) => setMercado(e.target.value)}
            className="h-8 text-xs"
            disabled={isEditing}
          />
        </div>
      </div>
      
      {/* MODELO DE ARBITRAGEM PARAMETRIZADO */}
      <div className="flex flex-wrap items-center gap-4 pb-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">Modelo</Label>
          <div className={`flex bg-muted/50 rounded p-0.5 ${isEditing ? 'opacity-60' : ''}`}>
            <button
              type="button"
              onClick={() => !isEditing && setModeloTipo("2")}
              disabled={isEditing}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                modeloTipo === "2" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              2 pernas
            </button>
            <button
              type="button"
              onClick={() => !isEditing && setModeloTipo("3")}
              disabled={isEditing}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                modeloTipo === "3" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              3 pernas
            </button>
            <button
              type="button"
              onClick={() => !isEditing && setModeloTipo("4+")}
              disabled={isEditing}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                modeloTipo === "4+" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              4+ pernas
            </button>
          </div>
        </div>
        
        {/* Campo numérico para 4+ pernas */}
        {modeloTipo === "4+" && !isEditing && (
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Quantidade:</Label>
            <Input
              type="number"
              min="4"
              max="10"
              value={numPernasCustom}
              onChange={(e) => setNumPernasCustom(Math.min(10, Math.max(4, parseInt(e.target.value) || 4)))}
              className="h-8 w-16 text-xs text-center"
            />
          </div>
        )}
        
        <Badge variant="secondary" className="text-[10px]">
          {numPernas} pernas
        </Badge>
      </div>

      {/* TABELA PRINCIPAL N-PERNAS */}
      <div className="overflow-x-auto" ref={tableContainerRef}>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border/50">
              <th className="py-2 px-2 text-left font-medium text-muted-foreground w-12">Perna</th>
              <th className="py-2 px-2 text-left font-medium text-muted-foreground min-w-[160px]">Casa(s)</th>
              <th className="py-2 px-2 text-center font-medium text-muted-foreground w-20">Odd</th>
              <th className="py-2 px-2 text-center font-medium text-muted-foreground w-24">Stake</th>
              <th className="py-2 px-2 text-center font-medium text-muted-foreground w-20">Linha</th>
              <th className="py-2 px-2 text-center font-medium text-muted-foreground w-10" title="Referência">
                <Target className="h-3.5 w-3.5 mx-auto" />
              </th>
              {!isEditing && (
                <th className="py-2 px-2 text-center font-medium text-muted-foreground w-10" title="Distribuição de lucro">
                  D
                </th>
              )}
              <th className="py-2 px-2 text-center font-medium text-muted-foreground w-20">Lucro</th>
              <th className="py-2 px-2 text-center font-medium text-muted-foreground w-16">ROI</th>
              {!isEditing && <th className="py-2 px-2 w-8"></th>}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, rowIndex) => {
              const isMainEntry = row.isMain;
              const pernaIndex = row.pernaIndex;
              
              const scenario = analysis.scenarios[pernaIndex];
              const lucro = scenario?.lucro || 0;
              const roi = scenario?.roi || 0;
              
              if (isMainEntry) {
                const entry = row.entry as OddEntry;
                const selectedBookmaker = bookmakerSaldos.find(b => b.id === entry.bookmaker_id);
                const isLegProcessing = legPrints[pernaIndex]?.isProcessing || false;
                
                return (
                  <tr 
                    key={rowIndex} 
                    tabIndex={0}
                    className={`border-b border-border/30 transition-colors relative outline-none ${
                      focusedLeg === pernaIndex 
                        ? "bg-primary/5 ring-1 ring-inset ring-primary/30" 
                        : "hover:bg-muted/30"
                    }`}
                    onFocus={() => !isEditing && setFocusedLeg(pernaIndex)}
                    onBlur={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        setFocusedLeg(null);
                      }
                    }}
                    onClick={() => !isEditing && setFocusedLeg(pernaIndex)}
                  >
                    {/* Indicador de foco para paste */}
                    {focusedLeg === pernaIndex && !isEditing && (
                      <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
                        <div className="bg-primary/90 text-primary-foreground text-[9px] px-2 py-0.5 rounded whitespace-nowrap">
                          Ctrl+V para colar print
                        </div>
                      </div>
                    )}
                    
                    {/* Loading de processamento OCR */}
                    {isLegProcessing && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 pointer-events-none">
                        <div className="flex items-center gap-2 text-muted-foreground text-xs">
                          <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          Analisando print...
                        </div>
                      </div>
                    )}
                    
                    {/* Perna Label */}
                    {row.rowSpan > 0 && (
                      <td 
                        rowSpan={row.rowSpan} 
                        className="py-6 px-2 text-center align-middle"
                      >
                        <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg font-bold text-sm ${
                          pernaIndex === 0 ? "bg-blue-500/20 text-blue-400" :
                          pernaIndex === 1 && odds.length === 3 ? "bg-amber-500/20 text-amber-400" :
                          pernaIndex === odds.length - 1 ? "bg-emerald-500/20 text-emerald-400" :
                          "bg-purple-500/20 text-purple-400"
                        }`}>
                          {pernaIndex + 1}
                        </div>
                        {entry.selecaoLivre?.trim() && (
                          <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[60px]">
                            {entry.selecaoLivre}
                          </div>
                        )}
                      </td>
                    )}
                    
                    {/* Casa */}
                    <td className="py-6 px-2">
                      {isEditing ? (
                        <div className="text-xs font-medium uppercase truncate">
                          {selectedBookmaker?.nome || "—"}
                        </div>
                      ) : (
                        <Select 
                          value={entry.bookmaker_id}
                          onValueChange={(v) => updateOdd(pernaIndex, "bookmaker_id", v)}
                        >
                          <SelectTrigger className="h-7 text-[10px] w-full">
                            <SelectValue placeholder="Selecione">
                              {selectedBookmaker?.nome && (
                                <span className="truncate uppercase">{selectedBookmaker.nome}</span>
                              )}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent className="max-w-[300px]">
                            {bookmakersDisponiveis.map(bk => (
                              <SelectItem key={bk.id} value={bk.id}>
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
                      )}
                    </td>
                    
                    {/* Odd */}
                    <td className="py-6 px-2">
                      {isEditing ? (
                        <div className="text-xs font-medium text-center">{entry.odd || "—"}</div>
                      ) : (
                        <Input 
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={entry.odd}
                          onChange={(e) => updateOdd(pernaIndex, "odd", e.target.value)}
                          className="h-7 text-xs text-center px-1"
                          onWheel={(e) => e.currentTarget.blur()}
                          data-field-type="odd"
                          onKeyDown={(e) => handleFieldKeyDown(e, 'odd')}
                        />
                      )}
                    </td>
                    
                    {/* Stake */}
                    <td className="py-6 px-2">
                      {isEditing ? (
                        <div className="text-xs font-medium text-center">
                          {formatCurrency(parseFloat(entry.stake) || 0, entry.moeda)}
                        </div>
                      ) : (
                        <MoneyInput 
                          value={entry.stake}
                          onChange={(val) => updateOdd(pernaIndex, "stake", val)}
                          currency={entry.moeda}
                          minDigits={5}
                          className="h-7 text-xs text-center"
                          data-field-type="stake"
                          onKeyDown={(e) => handleFieldKeyDown(e as any, 'stake')}
                        />
                      )}
                    </td>
                    
                    {/* Linha */}
                    <td className="py-6 px-2">
                      {isEditing ? (
                        <div className="text-[10px] text-muted-foreground text-center truncate">
                          {entry.selecaoLivre || "—"}
                        </div>
                      ) : (
                        <Input
                          placeholder="Linha"
                          value={entry.selecaoLivre}
                          onChange={(e) => updateOdd(pernaIndex, "selecaoLivre", e.target.value)}
                          className="h-7 text-[10px] px-1 border-dashed w-16"
                        />
                      )}
                    </td>
                    
                    {/* Referência (Target) */}
                    <td className="py-6 px-2 text-center">
                      {!isEditing && (
                        <button
                          type="button"
                          onClick={() => setReferenceIndex(pernaIndex)}
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                            entry.isReference 
                              ? "border-primary bg-primary" 
                              : "border-muted-foreground/30 hover:border-muted-foreground/50"
                          }`}
                        >
                          {entry.isReference && (
                            <div className="w-2 h-2 rounded-full bg-white" />
                          )}
                        </button>
                      )}
                    </td>
                    
                    {/* Checkbox D — Distribuição de lucro */}
                    {!isEditing && (
                      <td className="py-6 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            if (directedProfitLegs.includes(pernaIndex)) {
                              setDirectedProfitLegs(prev => prev.filter(i => i !== pernaIndex));
                            } else {
                              setDirectedProfitLegs(prev => [...prev, pernaIndex]);
                            }
                          }}
                          className={`w-5 h-5 rounded-full flex items-center justify-center transition-all border ${
                            directedProfitLegs.includes(pernaIndex)
                              ? "bg-transparent text-foreground border-muted-foreground/40"
                              : "bg-red-400/15 border-red-300/30"
                          }`}
                          title="Distribuição de lucro"
                        >
                          {directedProfitLegs.includes(pernaIndex) && (
                            <Check className="h-3 w-3" />
                          )}
                        </button>
                      </td>
                    )}
                    
                    {/* Lucro */}
                    <td className="py-6 px-2 text-center">
                      {analysis.stakeTotal > 0 && (
                        <span className={`font-medium ${lucro >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                          {lucro >= 0 ? "+" : ""}{formatCurrency(lucro, analysis.moedaDominante)}
                        </span>
                      )}
                    </td>
                    
                    {/* ROI */}
                    <td className="py-6 px-2 text-center">
                      {analysis.stakeTotal > 0 && (
                        <span className={`text-[10px] font-medium ${roi >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {roi >= 0 ? "+" : ""}{roi.toFixed(1)}%
                        </span>
                      )}
                    </td>
                    
                    {/* Ações - Adicionar casa */}
                    {!isEditing && (
                      <td className="py-6 px-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => addAdditionalEntry(pernaIndex)}
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
                          title="Adicionar casa"
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              } else {
                // Entrada adicional (casa extra na mesma perna)
                const ae = row.entry as OddFormEntry;
                const entryIndex = row.entryIndex!;
                const selectedBookmaker = bookmakerSaldos.find(b => b.id === ae.bookmaker_id);
                
                return (
                  <tr key={rowIndex} className="border-b border-border/20 bg-muted/10">
                    {/* Casa */}
                    <td className="py-1 px-2">
                      <Select 
                        value={ae.bookmaker_id}
                        onValueChange={(v) => updateAdditionalEntry(pernaIndex, entryIndex, "bookmaker_id", v)}
                      >
                        <SelectTrigger className="h-7 text-[10px] w-full">
                          <SelectValue placeholder="Casa">
                            {selectedBookmaker?.nome && (
                              <span className="truncate uppercase">{selectedBookmaker.nome}</span>
                            )}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="max-w-[300px]">
                          {bookmakersDisponiveis.map(bk => (
                            <SelectItem key={bk.id} value={bk.id}>
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
                    </td>
                    
                    {/* Odd */}
                    <td className="py-1 px-2">
                      <Input 
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={ae.odd}
                        onChange={(e) => updateAdditionalEntry(pernaIndex, entryIndex, "odd", e.target.value)}
                        className="h-7 text-xs text-center px-1"
                        onWheel={(e) => e.currentTarget.blur()}
                        data-field-type="odd"
                        onKeyDown={(e) => handleFieldKeyDown(e, 'odd')}
                      />
                    </td>
                    
                    {/* Stake */}
                    <td className="py-1 px-2">
                      <MoneyInput 
                        value={ae.stake}
                        onChange={(val) => updateAdditionalEntry(pernaIndex, entryIndex, "stake", val)}
                        currency={ae.moeda}
                        minDigits={5}
                        className="h-7 text-xs text-center"
                        data-field-type="stake"
                        onKeyDown={(e) => handleFieldKeyDown(e as any, 'stake')}
                      />
                    </td>
                    
                    {/* Linha */}
                    <td className="py-1 px-2">
                      <Input
                        placeholder="Linha"
                        value={ae.selecaoLivre}
                        onChange={(e) => updateAdditionalEntry(pernaIndex, entryIndex, "selecaoLivre", e.target.value)}
                        className="h-7 text-[10px] px-1 border-dashed w-16"
                      />
                    </td>
                    
                    {/* Target - vazio */}
                    <td className="py-1 px-2"></td>
                    
                    {/* D - vazio */}
                    {!isEditing && <td className="py-1 px-2"></td>}
                    
                    {/* Lucro - vazio */}
                    <td className="py-1 px-2"></td>
                    
                    {/* ROI - vazio */}
                    <td className="py-1 px-2"></td>
                    
                    {/* Remover */}
                    {!isEditing && (
                      <td className="py-1 px-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeAdditionalEntry(pernaIndex, entryIndex)}
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              }
            })}
          </tbody>
        </table>
      </div>

      {/* FOOTER: Totais + Controles simplificados */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-border/50">
        {/* Totais */}
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground uppercase">Lucro Total</div>
            <div className={`text-lg font-bold ${analysis.minLucro >= 0 ? "text-emerald-500" : "text-red-500"}`}>
              {analysis.stakeTotal > 0 
                ? `${analysis.minLucro >= 0 ? "+" : ""}${formatCurrency(analysis.minLucro, analysis.moedaDominante)}`
                : "—"
              }
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground uppercase">Total Apostado</div>
            <div className="text-lg font-bold text-primary">
              {analysis.stakeTotal > 0 
                ? formatCurrency(analysis.stakeTotal, analysis.moedaDominante)
                : "—"
              }
            </div>
          </div>
        </div>

        {/* Controles Simplificados */}
        <div className="flex items-center gap-4">
          {/* Arredondamento */}
          {!isEditing && (
            <div className="flex items-center gap-2">
              <Switch
                id="arredondar"
                checked={arredondarAtivado}
                onCheckedChange={setArredondarAtivado}
              />
              <Label htmlFor="arredondar" className="text-xs text-muted-foreground cursor-pointer">
                Arredondar
              </Label>
              {arredondarAtivado && (
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={arredondarValor}
                  onChange={(e) => setArredondarValor(e.target.value)}
                  className="h-7 w-14 text-center text-xs"
                />
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );

  // ============================================
  // MODO EMBEDDED
  // ============================================

  if (embedded) {
    return (
      <div className="space-y-4">
        {dialogContent}
        <div className="flex justify-between">
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
                    <AlertDialogDescription>
                      Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={saving || analysis.stakeTotal <= 0 || pernasCompletasCount < numPernas}
            >
              <Save className="h-4 w-4 mr-1" />
              {isEditing ? "Salvar" : "Registrar"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // MODO DIALOG
  // ============================================

  return (
    <>
      {/* AlertDialog para conversão de operação parcial */}
      <AlertDialog open={showConversionDialog} onOpenChange={setShowConversionDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Operação Parcial Detectada
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Esta operação tem apenas <strong>{pernasCompletasCount}</strong> de <strong>{numPernas}</strong> pernas preenchidas, 
                o que não configura uma arbitragem válida.
              </p>
              <p>
                Deseja registrar as <strong>{pernasValidas.length} pernas válidas</strong> como apostas simples independentes?
              </p>
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

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[1200px] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <DialogTitle className="flex items-center gap-2 text-base">
                <Calculator className="h-4 w-4 text-amber-500" />
                {isEditing ? "Editar Arbitragem" : "Arbitragem"}
                <Badge variant="outline" className="text-[10px] ml-2">{numPernas} pernas</Badge>
              </DialogTitle>
              
              {/* Estratégia e Contexto inline no header */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <Label className="text-[10px] text-muted-foreground whitespace-nowrap">Estratégia</Label>
                  <Select value={estrategia} onValueChange={setEstrategia} disabled={isEditing}>
                    <SelectTrigger className="h-7 w-28 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ESTRATEGIAS.map(e => (
                        <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1.5">
                  <Label className="text-[10px] text-muted-foreground whitespace-nowrap">Contexto</Label>
                  <Select value={contexto} onValueChange={setContexto} disabled={isEditing}>
                    <SelectTrigger className="h-7 w-28 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTEXTOS.map(c => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </DialogHeader>

          {/* Banner de operação parcial */}
          {isOperacaoParcial && !isEditing && (
            <div className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              <div className="flex-1">
                <span className="font-medium text-amber-500">Operação parcial:</span>{" "}
                <span className="text-muted-foreground">
                  {pernasCompletasCount}/{numPernas} pernas preenchidas. Não é uma arbitragem válida.
                </span>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="shrink-0 h-7 text-xs border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
                onClick={() => setShowConversionDialog(true)}
              >
                Registrar como simples
              </Button>
            </div>
          )}

          {dialogContent}

          <DialogFooter className="flex flex-col sm:flex-row justify-between gap-3 mt-4">
            <div className="flex gap-2">
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
                      <AlertDialogDescription>
                        Esta ação não pode ser desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              {/* Botão de conversão alternativo quando operação é parcial */}
              {isOperacaoParcial && !isEditing && (
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
                onClick={handleSave} 
                disabled={saving || analysis.stakeTotal <= 0 || pernasCompletasCount < numPernas}
              >
                <Save className="h-4 w-4 mr-1" />
                {isEditing ? "Salvar" : "Registrar"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
