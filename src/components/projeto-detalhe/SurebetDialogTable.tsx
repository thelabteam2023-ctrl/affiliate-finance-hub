/**
 * SurebetDialogTable - Versão com Layout de Tabela Compacta
 * 
 * Este componente é uma versão alternativa do SurebetDialog com layout de tabela minimalista.
 * Mantém TODA a lógica, campos e funcionalidades do original, apenas com UI redesenhada.
 * 
 * CARACTERÍSTICAS:
 * - Layout de tabela horizontal compacto
 * - Múltiplas entradas por perna (coberturas)
 * - Todos os campos originais preservados
 * - BookmakerSelectOption com saldos
 * - Suporte a freebets, print import, resultados
 */
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { 
  Calculator, 
  Save, 
  Trash2,
  Plus,
  Minus,
  Camera,
  FileText,
  Target,
  Gift,
  CheckCircle2,
  XCircle
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { RegistroApostaFields, RegistroApostaValues, getSuggestionsForTab } from "./RegistroApostaFields";
import { isAbaEstrategiaFixa, getEstrategiaFromTab } from "@/lib/apostaConstants";
import { detectarMoedaOperacao, calcularValorBRLReferencia, type MoedaOperacao } from "@/types/apostasUnificada";
import { pernasToInserts } from "@/types/apostasPernas";
import { useApostaRascunho, type RascunhoPernaData, type ApostaRascunho } from "@/hooks/useApostaRascunho";
import { getMarketsForSportAndModel, isMercadoCompativelComModelo, resolveMarketToOptions } from "@/lib/marketNormalizer";
import { 
  BookmakerSelectOption, 
  formatCurrency, 
  getCurrencySymbol 
} from "@/components/bookmakers/BookmakerSelectOption";
import { useProjetoConsolidacao } from "@/hooks/useProjetoConsolidacao";
import { updateBookmakerBalance } from "@/lib/bookmakerBalanceHelper";
import { useBonusBalanceManager } from "@/hooks/useBonusBalanceManager";
import { useSurebetPrintImport } from "@/hooks/useSurebetPrintImport";

// Tipos reutilizados do SurebetDialog original
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

// Funções utilitárias
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

function calcularStakes12(
  odds: { oddMedia: number; stakeAtual: number; isReference: boolean }[],
  arredondarFn: (value: number) => number
): { stakes: number[]; isValid: boolean; lucroIgualado: number } {
  if (odds.length !== 2) {
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
  
  const otherIndex = refIndex === 0 ? 1 : 0;
  const otherOdd = odds[otherIndex].oddMedia;
  
  if (otherOdd <= 1) {
    return { stakes: odds.map(o => o.stakeAtual), isValid: false, lucroIgualado: 0 };
  }
  
  const targetReturn = refStake * refOdd;
  const otherStake = arredondarFn(targetReturn / otherOdd);
  
  const calculatedStakes = odds.map((_, i) => {
    if (i === refIndex) return refStake;
    return otherStake;
  });
  
  const stakeTotal = calculatedStakes.reduce((a, b) => a + b, 0);
  const lucroIgualado = targetReturn - stakeTotal;
  
  return { stakes: calculatedStakes, isValid: true, lucroIgualado };
}

function calcularStakes1X2(
  odds: { oddMedia: number; stakeAtual: number; isReference: boolean }[],
  arredondarFn: (value: number) => number
): { stakes: number[]; isValid: boolean; lucroIgualado: number } {
  if (odds.length !== 3) {
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
  
  const targetReturn = refStake * refOdd;
  
  const calculatedStakes = odds.map((o, i) => {
    if (i === refIndex) return refStake;
    return arredondarFn(targetReturn / o.oddMedia);
  });
  
  const stakeTotal = calculatedStakes.reduce((a, b) => a + b, 0);
  const lucroIgualado = targetReturn - stakeTotal;
  
  return { stakes: calculatedStakes, isValid: true, lucroIgualado };
}

const ESPORTES = [
  "Futebol", "Basquete", "Tênis", "Baseball", "Hockey", 
  "Futebol Americano", "Vôlei", "MMA/UFC", "Boxe", "Golfe",
  "League of Legends", "Counter-Strike", "Dota 2", "eFootball"
];

const SELECOES_POR_MERCADO: Record<string, string[]> = {
  "1X2": ["Casa", "Empate", "Fora"],
  "Moneyline": ["Casa", "Fora"],
  "Over/Under Gols": ["Over", "Under"],
  "Ambas Marcam": ["Sim", "Não"],
  "Handicap Asiático": ["+ Handicap", "- Handicap"],
  "Vencedor da Partida": ["Jogador 1", "Jogador 2"],
};

const getSelecoesPorMercado = (mercado: string, modelo: "1-X-2" | "1-2"): string[] => {
  if (mercado && SELECOES_POR_MERCADO[mercado]) {
    return SELECOES_POR_MERCADO[mercado];
  }
  if (modelo === "1-X-2") {
    return ["Casa", "Empate", "Fora"];
  }
  return ["Sim", "Não"];
};

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

  // Estados do formulário
  const [evento, setEvento] = useState("");
  const [mercado, setMercado] = useState("");
  const [esporte, setEsporte] = useState("Futebol");
  const [modelo, setModelo] = useState<"1-X-2" | "1-2">("1-2");
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);
  
  const [registroValues, setRegistroValues] = useState<RegistroApostaValues>(() => {
    const suggestions = getSuggestionsForTab(activeTab);
    return {
      forma_registro: 'ARBITRAGEM',
      estrategia: suggestions.estrategia ?? null,
      contexto_operacional: suggestions.contexto_operacional ?? 'NORMAL',
    };
  });
  
  const [arredondarAtivado, setArredondarAtivado] = useState(true);
  const [arredondarValor, setArredondarValor] = useState("1");
  
  const [odds, setOdds] = useState<OddEntry[]>([
    { bookmaker_id: "", moeda: "BRL", odd: "", stake: "", selecao: "Sim", selecaoLivre: "", isReference: true, isManuallyEdited: false, stakeOrigem: undefined, additionalEntries: [] },
    { bookmaker_id: "", moeda: "BRL", odd: "", stake: "", selecao: "Não", selecaoLivre: "", isReference: false, isManuallyEdited: false, stakeOrigem: undefined, additionalEntries: [] }
  ]);
  
  // Estado para direcionar lucro a pernas específicas (como na coluna "D" da imagem de referência)
  const [directedProfitLegs, setDirectedProfitLegs] = useState<number[]>([]);
  
  const [linkedApostas, setLinkedApostas] = useState<any[]>([]);
  
  // Print import
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const {
    legPrints,
    processLegImage,
    clearLegPrint,
    clearAllPrints,
    initializeLegPrints,
    applyLegData,
  } = useSurebetPrintImport();

  const bookmakersDisponiveis = useMemo(() => {
    return bookmakerSaldos.filter((bk) => bk.saldo_operavel >= 0.50);
  }, [bookmakerSaldos]);

  // Inicialização
  useEffect(() => {
    if (open) {
      if (surebet && surebet.id) {
        setEvento(surebet.evento);
        setEsporte(surebet.esporte);
        setModelo(surebet.modelo as "1-X-2" | "1-2");
        setMercado(surebet.mercado || "");
        setObservacoes(surebet.observacoes || "");
        
        setRegistroValues({
          forma_registro: (surebet.forma_registro as RegistroApostaValues['forma_registro']) || 'ARBITRAGEM',
          estrategia: (surebet.estrategia as RegistroApostaValues['estrategia']) || null,
          contexto_operacional: (surebet.contexto_operacional as RegistroApostaValues['contexto_operacional']) || 'NORMAL',
        });
        
        fetchLinkedPernas(surebet.id, surebet.modelo);
      } else {
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

  useEffect(() => {
    if (!isEditing) {
      if (mercado && !isMercadoCompativelComModelo(mercado, modelo, esporte)) {
        setMercado("");
      }
      
      const selecoes = getSelecoesPorMercado(mercado, modelo);
      const numSlots = modelo === "1-X-2" ? 3 : 2;
      const currentNumSlots = odds.length;
      
      initializeLegPrints(numSlots);
      
      if (numSlots !== currentNumSlots) {
        const newSelecoes = selecoes.slice(0, numSlots);
        while (newSelecoes.length < numSlots) {
          newSelecoes.push(modelo === "1-X-2" ? ["Casa", "Empate", "Fora"][newSelecoes.length] : ["Opção 1", "Opção 2"][newSelecoes.length]);
        }
        setOdds(newSelecoes.map((sel, i) => ({
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
      }
    }
  }, [modelo, esporte, isEditing]);

  const resetForm = () => {
    setEvento("");
    setMercado("");
    setEsporte("Futebol");
    setModelo("1-2");
    setObservacoes("");
    setArredondarAtivado(true);
    setArredondarValor("1");
    const defaultSelecoes = getSelecoesPorMercado("", "1-2");
    setOdds(defaultSelecoes.map((sel, i) => ({
      bookmaker_id: "", moeda: "BRL" as SupportedCurrency, odd: "", stake: "", selecao: sel, selecaoLivre: "", isReference: i === 0, isManuallyEdited: false, stakeOrigem: undefined, additionalEntries: []
    })));
    setLinkedApostas([]);
    const suggestions = getSuggestionsForTab(activeTab);
    setRegistroValues({
      forma_registro: 'ARBITRAGEM',
      estrategia: suggestions.estrategia ?? null,
      contexto_operacional: suggestions.contexto_operacional ?? 'NORMAL',
    });
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
    }
  };

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

  const getSaldoDisponivelParaPosicao = (bookmakerId: string, currentIndex: number): number | null => {
    if (!bookmakerId) return null;
    const bk = bookmakerSaldos.find(b => b.id === bookmakerId);
    if (!bk) return null;
    
    let saldoLivre = bk.saldo_operavel;
    odds.forEach((entry, idx) => {
      if (idx !== currentIndex && entry.bookmaker_id === bookmakerId) {
        saldoLivre -= parseFloat(entry.stake) || 0;
      }
      (entry.additionalEntries || []).forEach((ae) => {
        if (ae.bookmaker_id === bookmakerId) {
          saldoLivre -= parseFloat(ae.stake) || 0;
        }
      });
    });
    
    return saldoLivre;
  };

  // Auto-cálculo de stakes
  useEffect(() => {
    if (isEditing) return;
    
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
    const numPernasEsperadas = modelo === "1-X-2" ? 3 : 2;
    
    if (modelo === "1-X-2" && validOddsCount < 3) return;
    if (modelo === "1-2" && validOddsCount < 2) return;
    
    const resultado = modelo === "1-X-2" 
      ? calcularStakes1X2(pernaData, arredondarStake)
      : calcularStakes12(pernaData, arredondarStake);
    
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
    modelo,
    arredondarAtivado,
    arredondarValor,
    isEditing
  ]);

  // Análise em tempo real
  const analysis = useMemo(() => {
    const consolidatedPerPerna = odds.map(perna => ({
      oddMedia: calcularOddMedia({ odd: perna.odd, stake: perna.stake }, perna.additionalEntries),
      stakeTotal: calcularStakeTotal({ stake: perna.stake }, perna.additionalEntries)
    }));
    
    const parsedOdds = consolidatedPerPerna.map(c => c.oddMedia);
    const actualStakes = consolidatedPerPerna.map(c => c.stakeTotal);
    const validOddsCount = parsedOdds.filter(o => o > 1).length;
    
    const moedasSelecionadas: SupportedCurrency[] = [];
    odds.forEach(perna => {
      if (perna.bookmaker_id) moedasSelecionadas.push(perna.moeda);
    });
    
    const moedasUnicas = [...new Set(moedasSelecionadas.filter(Boolean))];
    const isMultiCurrency = moedasUnicas.length > 1;
    const moedaDominante: SupportedCurrency = moedasUnicas.length === 1 ? moedasUnicas[0] : "BRL";
    
    const stakeTotal = isMultiCurrency ? 0 : actualStakes.reduce((a, b) => a + b, 0);
    
    const scenarios = parsedOdds.map((odd, i) => {
      const stakeNesseLado = actualStakes[i];
      const retorno = odd > 1 ? stakeNesseLado * odd : 0;
      const lucro = retorno - stakeTotal;
      const roi = stakeTotal > 0 ? (lucro / stakeTotal) * 100 : 0;
      return {
        selecao: odds[i].selecao,
        stake: stakeNesseLado,
        oddMedia: odd,
        retorno,
        lucro,
        roi,
        isPositive: lucro >= 0
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
      suggestedStakes: actualStakes
    };
  }, [odds.map(o => `${o.bookmaker_id}|${o.odd}|${o.stake}`).join(',')]);

  const pernasCompletasCount = useMemo(() => {
    return odds.filter(entry => {
      const odd = parseFloat(entry.odd);
      const stake = parseFloat(entry.stake);
      return !isNaN(odd) && odd > 1 && !isNaN(stake) && stake > 0 && entry.bookmaker_id;
    }).length;
  }, [odds]);

  const handleSave = async () => {
    if (!registroValues.forma_registro || !registroValues.estrategia || !registroValues.contexto_operacional) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    if (!evento.trim()) {
      toast.error("Informe o evento");
      return;
    }
    if (pernasCompletasCount < 2) {
      toast.error("Surebet requer pelo menos 2 pernas completas");
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

      const { data: insertedData, error: insertError } = await supabase
        .from("apostas_unificada")
        .insert({
          user_id: user.id,
          workspace_id: workspaceId,
          projeto_id: projetoId,
          forma_registro: 'ARBITRAGEM',
          estrategia: registroValues.estrategia,
          contexto_operacional: registroValues.contexto_operacional,
          evento,
          esporte,
          modelo,
          mercado,
          moeda_operacao: moedaOperacao,
          stake_total: stakeTotal,
          valor_brl_referencia: valorBRLReferencia,
          spread_calculado: null,
          roi_esperado: analysis?.minRoi || null,
          lucro_esperado: analysis?.minLucro || null,
          observacoes,
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

      toast.success("Operação registrada com sucesso!");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setSaving(false);
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

  // =====================================================
  // RENDERIZAÇÃO - LAYOUT DE TABELA COMPACTA
  // =====================================================
  
  // Flatten entries para a tabela
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
      
      // Entrada principal
      rows.push({
        pernaIndex,
        entryIndex: null,
        isMain: true,
        rowSpan: totalEntriesForPerna,
        label: modelo === "1-X-2" 
          ? (pernaIndex === 0 ? "1" : pernaIndex === 1 ? "X" : "2") 
          : (pernaIndex === 0 ? "1" : "2"),
        entry: perna
      });
      
      // Entradas adicionais
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
  }, [odds, modelo]);

  const dialogContent = (
    <div className="space-y-4">
      {/* HEADER: Modelo + Esporte + Evento + Mercado */}
      <div className="flex flex-wrap items-end gap-3 pb-3 border-b border-border/50">
        {/* Modelo Toggle */}
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Modelo</Label>
          <div className={`flex bg-muted/50 rounded p-0.5 ${isEditing ? 'opacity-60' : ''}`}>
            <button
              type="button"
              onClick={() => !isEditing && setModelo("1-2")}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                modelo === "1-2" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              1–2
            </button>
            <button
              type="button"
              onClick={() => !isEditing && setModelo("1-X-2")}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                modelo === "1-X-2" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              1–X–2
            </button>
          </div>
        </div>

        {/* Esporte */}
        <div className="flex-1 min-w-[120px]">
          <Label className="text-xs text-muted-foreground">Esporte</Label>
          <Select value={esporte} onValueChange={setEsporte}>
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
        <div className="flex-[2] min-w-[200px]">
          <Label className="text-xs text-muted-foreground">Evento</Label>
          <Input 
            placeholder="Ex: Brasil x Argentina" 
            value={evento}
            onChange={(e) => setEvento(e.target.value)}
            className="h-8 text-xs uppercase"
          />
        </div>

        {/* Mercado */}
        <div className="flex-1 min-w-[140px]">
          <Label className="text-xs text-muted-foreground">Mercado</Label>
          <Select value={mercado} onValueChange={setMercado}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {getMarketsForSportAndModel(esporte, modelo).map(m => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* TABELA PRINCIPAL */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border/50">
              <th className="py-2 px-2 text-left font-medium text-muted-foreground w-12">Perna</th>
              <th className="py-2 px-2 text-left font-medium text-muted-foreground min-w-[160px]">Casa</th>
              <th className="py-2 px-2 text-center font-medium text-muted-foreground w-20">Odd</th>
              <th className="py-2 px-2 text-center font-medium text-muted-foreground w-24">Stake</th>
              <th className="py-2 px-2 text-center font-medium text-muted-foreground w-20">Linha</th>
              <th className="py-2 px-2 text-center font-medium text-muted-foreground w-10" title="Referência">
                <Target className="h-3.5 w-3.5 mx-auto" />
              </th>
              {!isEditing && (
                <th className="py-2 px-2 text-center font-medium text-muted-foreground w-10" title="Direcionar lucro">
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
              const pernaData = odds[pernaIndex];
              
              // Calcular lucro e ROI para esta perna
              const scenario = analysis.scenarios[pernaIndex];
              const lucro = scenario?.lucro || 0;
              const roi = scenario?.roi || 0;
              
              if (isMainEntry) {
                const entry = row.entry as OddEntry;
                const selectedBookmaker = bookmakerSaldos.find(b => b.id === entry.bookmaker_id);
                
                return (
                  <tr key={rowIndex} className="border-b border-border/30 hover:bg-muted/30">
                    {/* Perna Label */}
                    {row.rowSpan > 0 && (
                      <td 
                        rowSpan={row.rowSpan} 
                        className="py-2 px-2 text-center align-middle"
                      >
                        <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg font-bold text-sm ${
                          pernaIndex === 0 ? "bg-blue-500/20 text-blue-400" :
                          pernaIndex === 1 && modelo === "1-X-2" ? "bg-amber-500/20 text-amber-400" :
                          "bg-emerald-500/20 text-emerald-400"
                        }`}>
                          {row.label}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {entry.selecao}
                        </div>
                      </td>
                    )}
                    
                    {/* Casa */}
                    <td className="py-1 px-2">
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
                    <td className="py-1 px-2">
                      {isEditing ? (
                        <div className="text-center font-medium">
                          {parseFloat(entry.odd).toFixed(2)}
                        </div>
                      ) : (
                        <Input 
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={entry.odd}
                          onChange={(e) => updateOdd(pernaIndex, "odd", e.target.value)}
                          className="h-7 text-xs text-center px-1"
                          onWheel={(e) => e.currentTarget.blur()}
                        />
                      )}
                    </td>
                    
                    {/* Stake */}
                    <td className="py-1 px-2">
                      {isEditing ? (
                        <div className="text-center font-medium">
                          {formatCurrency(parseFloat(entry.stake) || 0, entry.moeda)}
                        </div>
                      ) : (
                        <MoneyInput 
                          value={entry.stake}
                          onChange={(val) => updateOdd(pernaIndex, "stake", val)}
                          currency={entry.moeda}
                          minDigits={5}
                          className={`h-7 text-xs text-center ${
                            entry.stakeOrigem === "print" ? "border-emerald-500 ring-1 ring-emerald-500/30" : ""
                          }`}
                        />
                      )}
                    </td>
                    
                    {/* Linha */}
                    <td className="py-1 px-2">
                      {isEditing ? (
                        <div className="text-center text-muted-foreground truncate">
                          {entry.selecaoLivre || "—"}
                        </div>
                      ) : (
                        <Input
                          placeholder="Ov.2,5"
                          value={entry.selecaoLivre}
                          onChange={(e) => updateOdd(pernaIndex, "selecaoLivre", e.target.value)}
                          className="h-7 text-[10px] px-1 border-dashed w-16"
                        />
                      )}
                    </td>
                    
                    {/* Referência (Target) */}
                    <td className="py-1 px-2 text-center">
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
                    
                    {/* Direcionar lucro (checkbox) */}
                    {!isEditing && (
                      <td className="py-1 px-2 text-center">
                        <input
                          type="checkbox"
                          checked={directedProfitLegs.includes(pernaIndex)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setDirectedProfitLegs(prev => [...prev, pernaIndex]);
                            } else {
                              setDirectedProfitLegs(prev => prev.filter(i => i !== pernaIndex));
                            }
                          }}
                          className="w-4 h-4 rounded border-muted-foreground/50 text-primary focus:ring-primary/50 cursor-pointer"
                        />
                      </td>
                    )}
                    
                    {/* Lucro */}
                    <td className="py-1 px-2 text-center">
                      {analysis.stakeTotal > 0 && (
                        <span className={`font-medium ${lucro >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                          {lucro >= 0 ? "+" : ""}{formatCurrency(lucro, analysis.moedaDominante)}
                        </span>
                      )}
                    </td>
                    
                    {/* ROI */}
                    <td className="py-1 px-2 text-center">
                      {analysis.stakeTotal > 0 && (
                        <span className={`text-[10px] font-medium ${roi >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {roi >= 0 ? "+" : ""}{roi.toFixed(1)}%
                        </span>
                      )}
                    </td>
                    
                    {/* Ações */}
                    {!isEditing && (
                      <td className="py-1 px-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => addAdditionalEntry(pernaIndex)}
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
                          title="Adicionar cobertura"
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              } else {
                // Entrada adicional (cobertura)
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
                    
                    {/* Target - vazio para coberturas */}
                    <td className="py-1 px-2"></td>
                    
                    {/* Direcionar - vazio para coberturas */}
                    {!isEditing && <td className="py-1 px-2"></td>}
                    
                    {/* Lucro - vazio para coberturas */}
                    <td className="py-1 px-2"></td>
                    
                    {/* ROI - vazio para coberturas */}
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

      {/* FOOTER: Totais + Arredondamento */}
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
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground uppercase">ROI</div>
            <div className={`text-lg font-bold ${analysis.minRoi >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {analysis.stakeTotal > 0 
                ? `${analysis.minRoi >= 0 ? "+" : ""}${analysis.minRoi.toFixed(2)}%`
                : "—"
              }
            </div>
          </div>
        </div>

        {/* Controles */}
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

          {/* Importar Print */}
          {!isEditing && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground">
              <Camera className="h-3 w-3" />
              Print
            </Button>
          )}
        </div>
      </div>

      {/* Observações (colapsável) */}
      <details className="group">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          <span>Observações</span>
          <span className="text-[10px]">(opcional)</span>
        </summary>
        <Textarea
          placeholder="Observações..."
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          className="mt-2 text-xs min-h-[60px]"
        />
      </details>
    </div>
  );

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
                    <AlertDialogTitle>Excluir Surebet?</AlertDialogTitle>
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
              disabled={saving || analysis.stakeTotal <= 0 || pernasCompletasCount < 2}
            >
              <Save className="h-4 w-4 mr-1" />
              {isEditing ? "Salvar" : "Registrar"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1200px] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Calculator className="h-4 w-4 text-amber-500" />
            {isEditing ? "Editar Arbitragem" : "Arbitragem"}
            <Badge variant="outline" className="text-[10px] ml-2">Layout Tabela</Badge>
          </DialogTitle>
        </DialogHeader>

        {dialogContent}

        <DialogFooter className="flex justify-between mt-4">
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
                    <AlertDialogTitle>Excluir Surebet?</AlertDialogTitle>
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
              disabled={saving || analysis.stakeTotal <= 0 || pernasCompletasCount < 2}
            >
              <Save className="h-4 w-4 mr-1" />
              {isEditing ? "Salvar" : "Registrar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
