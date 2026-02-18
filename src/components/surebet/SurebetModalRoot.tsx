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
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useBookmakerSaldosQuery, useInvalidateBookmakerSaldos } from "@/hooks/useBookmakerSaldosQuery";
import { deletarAposta, liquidarPernaSurebet } from "@/services/aposta";
import { useCurrencySnapshot, type SupportedCurrency } from "@/hooks/useCurrencySnapshot";
import { useProjetoConsolidacao } from "@/hooks/useProjetoConsolidacao";
import { useApostaRascunho, type ApostaRascunho, type RascunhoPernaData } from "@/hooks/useApostaRascunho";
import { useSurebetPrintImport } from "@/hooks/useSurebetPrintImport";
import { useSurebetCalculator, type OddEntry, type OddFormEntry } from "@/hooks/useSurebetCalculator";
import { pernasToInserts } from "@/types/apostasPernas";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Calculator, Save, Trash2, X, AlertTriangle, ArrowRight, Target, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { BetFormHeaderV2 } from "@/components/apostas/BetFormHeaderV2";
import { toLocalTimestamp, validarDataAposta } from "@/utils/dateUtils";
import { calcSurebetWindowHeight } from "@/lib/windowHelper";

import { SurebetTableRow } from "./SurebetTableRow";
import { SurebetTableFooter } from "./SurebetTableFooter";

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
  "Futebol", "Basquete", "Tênis", "Baseball", "Hockey", 
  "Futebol Americano", "Vôlei", "MMA/UFC", "Boxe", "Golfe",
  "League of Legends", "Counter-Strike", "Dota 2", "eFootball"
];

// Importar constantes canônicas do sistema
import {
  ESTRATEGIAS_LIST,
  CONTEXTOS_LIST,
  APOSTA_ESTRATEGIA,
  CONTEXTO_OPERACIONAL,
  getEstrategiaFromTab,
  getContextoFromTab,
  isAbaEstrategiaFixa,
  isAbaContextoFixo,
  type ApostaEstrategia,
  type ContextoOperacional,
} from "@/lib/apostaConstants";

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
  const isEditing = !!surebet;
  const { workspaceId } = useWorkspace();
  
  // Hook de rascunhos
  const { criarRascunho, deletarRascunho } = useApostaRascunho(projetoId, workspaceId || '');
  
  const { getSnapshotFields } = useCurrencySnapshot();
  const { moedaConsolidacao } = useProjetoConsolidacao({ projetoId });
  
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
  const [mercado, setMercado] = useState("");
  const [dataAposta, setDataAposta] = useState("");
  
  const [modeloTipo, setModeloTipo] = useState<"2" | "3" | "4+">("2");
  const [numPernasCustom, setNumPernasCustom] = useState<number>(4);
  
  const numPernas = useMemo(() => {
    if (modeloTipo === "2") return 2;
    if (modeloTipo === "3") return 3;
    return numPernasCustom;
  }, [modeloTipo, numPernasCustom]);
  
  // Redimensionar janela dinamicamente quando número de pernas muda (modo embedded/popup)
  useEffect(() => {
    if (!embedded || !open) return;
    try {
      const targetHeight = calcSurebetWindowHeight(numPernas);
      window.resizeTo(window.outerWidth, targetHeight);
    } catch {
      // Silently ignore if resize not supported
    }
  }, [numPernas, embedded, open]);
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
  
  const [directedProfitLegs, setDirectedProfitLegs] = useState<number[]>([0, 1]);
  
  const [arredondarAtivado, setArredondarAtivado] = useState(true);
  const [arredondarValor, setArredondarValor] = useState("1");
  const [saving, setSaving] = useState(false);
  
  const [showConversionDialog, setShowConversionDialog] = useState(false);
  const [conversionInProgress, setConversionInProgress] = useState(false);
  
  const [focusedLeg, setFocusedLeg] = useState<number | null>(null);
  
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
  const bookmakersDisponiveis = useMemo(() => {
    return bookmakerSaldos.filter((bk) => bk.saldo_operavel >= 0.50);
  }, [bookmakerSaldos]);

  /**
   * Retorna bookmakers com saldos ajustados para uma perna específica.
   * Desconta stakes já alocadas em pernas ANTERIORES que usam a mesma bookmaker.
   * 
   * CRÍTICO para evitar overbetting na mesma casa em múltiplas pernas.
   */
  const getAdjustedBookmakersForLeg = useCallback((legIndex: number) => {
    return bookmakersDisponiveis.map(bk => {
      // Calcular quanto já foi alocado em pernas ANTERIORES para esta bookmaker
      let alocadoEmPernasAnteriores = 0;
      for (let i = 0; i < legIndex; i++) {
        if (odds[i].bookmaker_id === bk.id) {
          alocadoEmPernasAnteriores += parseFloat(odds[i].stake) || 0;
        }
      }
      
      // Retornar bookmaker com saldo ajustado
      return {
        ...bk,
        saldo_operavel: Math.max(0, bk.saldo_operavel - alocadoEmPernasAnteriores),
        saldo_disponivel: Math.max(0, bk.saldo_disponivel - alocadoEmPernasAnteriores),
      };
    });
  }, [bookmakersDisponiveis, odds]);

  // ============================================
  // CALCULATOR HOOK
  // ============================================

  const { analysis, pernasValidas, arredondarStake, getOddMediaPerna, getStakeTotalPerna, directedStakes } = useSurebetCalculator({
    odds,
    directedProfitLegs,
    numPernas,
    arredondarAtivado,
    arredondarValor,
    bookmakerSaldos: bookmakerSaldos.map(b => ({ id: b.id, moeda: b.moeda }))
  });

  // ============================================
  // INICIALIZAÇÃO E RESET
  // ============================================

  useEffect(() => {
    if (!open) return;
    
    if (surebet && surebet.id) {
      // Modo edição
      setEvento(surebet.evento);
      setEsporte(surebet.esporte);
      setMercado(surebet.mercado || "");
      setEstrategia((surebet.estrategia || APOSTA_ESTRATEGIA.SUREBET) as ApostaEstrategia);
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
      
      fetchLinkedPernas(surebet.id);
    } else if (rascunho) {
      // Modo rascunho: carregar TODOS os dados
      // IMPORTANTE: NÃO pré-selecionar estratégia se não estava definida no rascunho
      setEvento(rascunho.evento || "");
      setEsporte(rascunho.esporte || "Futebol");
      setMercado(rascunho.mercado || "");
      setEstrategia(rascunho.estrategia ? (rascunho.estrategia as ApostaEstrategia) : null);
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
        setOdds(rascunhoOdds);
        setDirectedProfitLegs(Array.from({ length: numPernasRascunho }, (_, i) => i));
      } else {
        resetToNewForm(numPernasRascunho);
      }
      
      initializeLegPrints(numPernasRascunho);
    } else {
      // Novo formulário
      resetToNewForm(2);
      setModeloTipo("2");
      
      // Se a aba tiver estratégia fixa, pré-selecionar automaticamente
      // Em "apostas-livres" ou "apostas", o usuário deve escolher manualmente
      const estrategiaFromTab = getEstrategiaFromTab(activeTab);
      setEstrategia(estrategiaFromTab);
      
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
    } else {
      setOdds(odds.slice(0, numPernas));
      setDirectedProfitLegs(prev => prev.filter(i => i < numPernas));
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
  };

  const fetchLinkedPernas = async (surebetId: string) => {
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
        additionalEntries: []
      }));
      setOdds(pernasOdds);
      setDirectedProfitLegs(Array.from({ length: pernasOdds.length }, (_, i) => i));
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
            await processLegImage(focusedLeg, file);
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
          if (legData.stake) newOdds[legIndex] = { ...newOdds[legIndex], stake: legData.stake, isManuallyEdited: false, isReference: legIndex === 0 };
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
    
    await processLegImage(selectedLegForPrint, file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [selectedLegForPrint, processLegImage]);

  // ============================================
  // MANIPULAÇÃO DE ODDS
  // ============================================

  const updateOdd = useCallback((index: number, field: keyof OddEntry, value: string | boolean) => {
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
      
      return newOdds;
    });
  }, [bookmakerSaldos]);

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
    setOdds(prev => {
      const newOdds = [...prev];
      const currentEntries = newOdds[pernaIndex].additionalEntries || [];
      newOdds[pernaIndex].additionalEntries = [
        ...currentEntries,
        { bookmaker_id: "", moeda: "BRL" as SupportedCurrency, odd: "", stake: "", selecaoLivre: "" }
      ];
      return newOdds;
    });
  }, []);
  
  // Handler para alterar resultado de uma perna específica
  const handlePernaResultadoChange = useCallback((index: number, resultado: 'GREEN' | 'RED' | 'VOID' | null) => {
    setOdds(prev => {
      const newOdds = [...prev];
      (newOdds[index] as any).resultado = resultado;
      return newOdds;
    });
  }, []);

  const handleFieldKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>, fieldType: 'odd' | 'stake') => {
    const key = e.key.toLowerCase();
    
    // Atalhos Q (próximo odd) e S (próximo stake)
    if ((key === 'q' && fieldType === 'odd') || (key === 's' && fieldType === 'stake')) {
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

  useEffect(() => {
    if (isEditing) return;
    
    // Pular se há direcionamento ativo (checkbox D customizado)
    const hasCustomDirection = directedProfitLegs.length > 0 && directedProfitLegs.length < odds.length;
    if (hasCustomDirection) return;
    
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
    
    const targetReturn = refStake * refOdd;
    
    let needsUpdate = false;
    const newOdds = odds.map((o, i) => {
      if (i === refIndex) return o;
      if (o.isManuallyEdited || o.stakeOrigem === "print" || o.stakeOrigem === "manual") return o;
      
      const calculatedStake = arredondarStake(targetReturn / pernaData[i].oddMedia);
      const currentStake = parseFloat(o.stake) || 0;
      
      if (Math.abs(calculatedStake - currentStake) > 0.01) {
        needsUpdate = true;
        return { ...o, stake: calculatedStake.toFixed(2), stakeOrigem: "referencia" as const };
      }
      return o;
    });
    
    if (needsUpdate) setOdds(newOdds);
  }, [
    odds.map(o => `${o.odd}-${o.stake}-${o.isManuallyEdited}`).join(','),
    odds.map(o => o.isReference).join(','),
    arredondarAtivado,
    arredondarValor,
    isEditing,
    directedProfitLegs
  ]);

  // ============================================
  // APLICAR STAKES DIRECIONADAS (CHECKBOX D)
  // ============================================
  // 
  // REGRA DE NEGÓCIO:
  // - Pernas DESMARCADAS (D=false): stakes FIXAS, lucro ≈ 0
  // - Perna MARCADA (D=true): stake pode ser REDUZIDA para compensar
  // ============================================

  useEffect(() => {
    // Só aplicar se há direcionamento parcial ativo
    const hasCustomDirection = directedProfitLegs.length > 0 && directedProfitLegs.length < odds.length;
    if (!hasCustomDirection) return;
    
    // Verificar se temos stakes calculadas
    if (!directedStakes || directedStakes.length !== odds.length) return;
    
    // Identificar pernas marcadas (apenas essas terão stake alterada)
    const markedIndices = directedProfitLegs;
    
    // Verificar se há diferença real para atualizar (APENAS nas marcadas)
    let needsUpdate = false;
    const newOdds = odds.map((o, i) => {
      // Só altera stakes das pernas MARCADAS
      if (!markedIndices.includes(i)) {
        return o; // Pernas desmarcadas: stakes FIXAS
      }
      
      const calculatedStake = directedStakes[i];
      const currentStake = parseFloat(o.stake) || 0;
      
      // Só atualiza se a diferença for significativa
      if (Math.abs(calculatedStake - currentStake) > 0.01) {
        needsUpdate = true;
        return { 
          ...o, 
          stake: calculatedStake.toFixed(2), 
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
    odds.map(o => o.stake).join(','), // Re-calcular quando stakes das desmarcadas mudam
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
    if (!estrategia) { toast.error("Selecione uma estratégia"); return; }
    if (!contexto) { toast.error("Selecione um contexto"); return; }
    if (!evento.trim()) { toast.error("Informe o evento"); return; }
    if (analysis.pernasCompletasCount < numPernas) {
      toast.error(`Preencha todas as ${numPernas} pernas`);
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

      const getBookmakerMoeda = (bookmakerId: string): SupportedCurrency => {
        const bk = bookmakerSaldos.find(b => b.id === bookmakerId);
        return (bk?.moeda as SupportedCurrency) || "BRL";
      };

      const pernasPreenchidas = odds.filter(entry => {
        return entry.bookmaker_id && parseFloat(entry.odd) > 1 && parseFloat(entry.stake) > 0;
      });

      const modelo = numPernas === 2 ? "1-2" : numPernas === 3 ? "1-X-2" : `${numPernas}-way`;

      if (isEditing && surebet) {
        // ================================================================
        // MODO EDIÇÃO: Update direto (sem novo impacto financeiro)
        // ================================================================
        const pernasToSave: SurebetPerna[] = pernasPreenchidas.map((entry) => {
          const stake = parseFloat(entry.stake) || 0;
          const moeda = getBookmakerMoeda(entry.bookmaker_id);
          const snapshotFields = getSnapshotFields(stake, moeda);
          const odd = parseFloat(entry.odd) || 0;
          
          const resultado = (entry as any).resultado as ('GREEN' | 'RED' | 'MEIO_GREEN' | 'MEIO_RED' | 'VOID' | null);
          let lucro_prejuizo: number | null = null;
          
          if (resultado === 'GREEN') {
            lucro_prejuizo = (stake * odd) - stake;
          } else if (resultado === 'MEIO_GREEN') {
            lucro_prejuizo = ((stake * odd) - stake) / 2;
          } else if (resultado === 'MEIO_RED') {
            lucro_prejuizo = -stake / 2;
          } else if (resultado === 'RED') {
            lucro_prejuizo = -stake;
          } else if (resultado === 'VOID') {
            lucro_prejuizo = 0;
          }
          
          return {
            selecao: entry.selecao,
            selecao_livre: entry.selecaoLivre || "",
            bookmaker_id: entry.bookmaker_id,
            bookmaker_nome: bookmakerSaldos.find(b => b.id === entry.bookmaker_id)?.nome || "",
            moeda,
            odd,
            stake,
            stake_brl_referencia: snapshotFields.valor_brl_referencia,
            cotacao_snapshot: snapshotFields.cotacao_snapshot,
            cotacao_snapshot_at: snapshotFields.cotacao_snapshot_at,
            resultado: resultado,
            lucro_prejuizo,
            lucro_prejuizo_brl_referencia: lucro_prejuizo ? snapshotFields.valor_brl_referencia : null,
            gerou_freebet: (entry as any).gerouFreebet || false,
            valor_freebet_gerada: (entry as any).valorFreebetGerada ? parseFloat((entry as any).valorFreebetGerada) : null
          };
        });
        
        const resultados = pernasToSave.map(p => p.resultado);
        const todasComResultado = resultados.every(r => r !== null);
        const temGreen = resultados.includes('GREEN') || resultados.includes('MEIO_GREEN');
        const todasVoid = resultados.every(r => r === 'VOID');
        
        let statusAposta = 'PENDENTE';
        let resultadoAposta: string | null = null;
        let lucroRealTotal: number | null = null;
        let roiReal: number | null = null;
        
        if (todasComResultado) {
          statusAposta = 'LIQUIDADA';
          lucroRealTotal = pernasToSave.reduce((acc, p) => acc + (p.lucro_prejuizo || 0), 0);
          roiReal = analysis.stakeTotal > 0 ? (lucroRealTotal / analysis.stakeTotal) * 100 : 0;
          
          if (todasVoid) {
            resultadoAposta = 'VOID';
          } else if (temGreen && lucroRealTotal >= 0) {
            resultadoAposta = 'GREEN';
          } else if (lucroRealTotal > 0) {
            resultadoAposta = 'GREEN';
          } else if (lucroRealTotal < 0) {
            resultadoAposta = 'RED';
          } else {
            resultadoAposta = 'VOID';
          }
        }

        const { error: updateError } = await supabase
          .from("apostas_unificada")
          .update({
            evento,
            esporte,
            mercado,
            modelo,
            estrategia,
            contexto_operacional: contexto,
            stake_total: analysis.stakeTotal,
            lucro_esperado: analysis.minLucro,
            roi_esperado: analysis.minRoi,
            status: statusAposta,
            resultado: resultadoAposta,
            lucro_prejuizo: lucroRealTotal,
            roi_real: roiReal,
            updated_at: new Date().toISOString()
          })
          .eq("id", surebet.id);

        if (updateError) throw updateError;

        // Deletar pernas antigas e inserir novas
        await supabase.from("apostas_pernas").delete().eq("aposta_id", surebet.id);
        const pernasInsert = pernasToInserts(surebet.id, pernasToSave);
        const { error: insertPernasError } = await supabase
          .from("apostas_pernas")
          .insert(pernasInsert);

        if (insertPernasError) throw insertPernasError;
        
      } else {
        // ================================================================
        // MODO CRIAÇÃO: Usar RPC atômica (Motor Financeiro v7)
        // ================================================================
        
        // Preparar pernas no formato esperado pela RPC
        const pernasParaRPC = pernasPreenchidas.map((entry) => {
          const stake = parseFloat(entry.stake) || 0;
          const moeda = getBookmakerMoeda(entry.bookmaker_id);
          const snapshotFields = getSnapshotFields(stake, moeda);
          
          return {
            bookmaker_id: entry.bookmaker_id,
            stake,
            odd: parseFloat(entry.odd) || 0,
            moeda,
            selecao: entry.selecao,
            selecao_livre: entry.selecaoLivre || null,
            cotacao_snapshot: snapshotFields.cotacao_snapshot,
            stake_brl_referencia: snapshotFields.valor_brl_referencia,
          };
        });
        
        // Chamar RPC atômica
        const { data: rpcResult, error: rpcError } = await supabase.rpc('criar_surebet_atomica', {
          p_workspace_id: workspaceId,
          p_user_id: user.id,
          p_projeto_id: projetoId,
          p_evento: evento,
          p_esporte: esporte,
          p_mercado: mercado || null,
          p_modelo: modelo,
          p_estrategia: estrategia,
          p_contexto_operacional: contexto,
          p_data_aposta: toLocalTimestamp(dataAposta),
          p_pernas: pernasParaRPC,
        });
        
        if (rpcError) {
          console.error("[SurebetModalRoot] Erro RPC criar_surebet_atomica:", rpcError);
          throw new Error(rpcError.message);
        }
        
        // Verificar resultado da RPC
        const result = rpcResult?.[0];
        if (!result?.success) {
          throw new Error(result?.message || 'Falha ao criar surebet');
        }
        
        console.log("[SurebetModalRoot] ✅ Surebet criada via RPC:", {
          aposta_id: result.aposta_id,
          events_created: result.events_created,
        });
        
        // ================================================================
        // PÓS-CRIAÇÃO: Liquidar pernas que já possuem resultado definido
        // ================================================================
        const pernasComResultado = pernasPreenchidas
          .map((entry, idx) => ({
            resultado: (entry as any).resultado as string | null,
            index: idx,
          }))
          .filter(p => p.resultado && ['GREEN', 'RED', 'MEIO_GREEN', 'MEIO_RED', 'VOID'].includes(p.resultado!));
        
        if (pernasComResultado.length > 0 && result.aposta_id) {
          // Buscar IDs das pernas recém-criadas
          const { data: pernasDB } = await supabase
            .from('apostas_pernas')
            .select('id, ordem')
            .eq('aposta_id', result.aposta_id)
            .order('ordem', { ascending: true });
          
          if (pernasDB && pernasDB.length > 0) {
            for (const p of pernasComResultado) {
              const pernaDB = pernasDB.find(db => db.ordem === p.index + 1);
              const entryOriginal = pernasPreenchidas[p.index];
              if (pernaDB && p.resultado && entryOriginal) {
                const liqResult = await liquidarPernaSurebet({
                  surebet_id: result.aposta_id,
                  perna_id: pernaDB.id,
                  bookmaker_id: entryOriginal.bookmaker_id,
                  resultado: p.resultado as 'GREEN' | 'RED' | 'MEIO_GREEN' | 'MEIO_RED' | 'VOID',
                  resultado_anterior: null,
                  stake: parseFloat(entryOriginal.stake) || 0,
                  odd: parseFloat(entryOriginal.odd) || 0,
                  moeda: getBookmakerMoeda(entryOriginal.bookmaker_id),
                  workspace_id: workspaceId,
                  fonte_saldo: 'REAL',
                });
                
                if (!liqResult.success) {
                  console.error(`[SurebetModalRoot] Erro ao liquidar perna ${pernaDB.id}:`, liqResult.error);
                } else {
                  console.log(`[SurebetModalRoot] ✅ Perna ${pernaDB.id} liquidada como ${p.resultado}`);
                }
              }
            }
          }
        }
      }

      // Invalidar cache de saldos (agora os saldos já foram debitados pela RPC)
      invalidateSaldos(projetoId);
      
      onSuccess('save');
      if (!embedded) onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setSaving(false);
    }
  };

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
        const snapshotFields = getSnapshotFields(stake, moeda);
        
        return {
          user_id: user.id,
          workspace_id: workspaceId,
          projeto_id: projetoId,
          bookmaker_id: entry.bookmaker_id,
          forma_registro: 'SIMPLES',
          estrategia,
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
      
      toast.success("Operação excluída!");
      onSuccess('delete');
      if (!embedded) onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao excluir: " + error.message);
    }
  };

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
    const adjustedBalances = new Map<string, number>();
    
    // Primeiro, calcular quanto foi alocado para cada bookmaker considerando TODAS as pernas anteriores
    odds.forEach((entry, index) => {
      if (!entry.bookmaker_id) return;
      
      const stake = parseFloat(entry.stake) || 0;
      if (stake <= 0) return;
      
      const bookmaker = bookmakerSaldos.find(b => b.id === entry.bookmaker_id);
      if (!bookmaker) return;
      
      const saldoBase = bookmaker.saldo_operavel ?? 0;
      
      // Calcular quanto já foi alocado em pernas ANTERIORES (índice < atual) para esta mesma bookmaker
      let alocadoEmOutrasPernas = 0;
      for (let i = 0; i < index; i++) {
        if (odds[i].bookmaker_id === entry.bookmaker_id) {
          alocadoEmOutrasPernas += parseFloat(odds[i].stake) || 0;
        }
      }
      
      // Saldo disponível para ESTA perna = saldo base - já alocado em pernas anteriores
      const saldoDisponivelParaEstaPerna = saldoBase - alocadoEmOutrasPernas;
      
      // Guardar para exibição (opcional)
      adjustedBalances.set(`${entry.bookmaker_id}-${index}`, saldoDisponivelParaEstaPerna);
      
      if (stake > saldoDisponivelParaEstaPerna + 0.01) { // Tolerância de 1 centavo
        insufficientLegs.push(index);
      }
    });
    
    return {
      hasInsufficientBalance: insufficientLegs.length > 0,
      insufficientLegs,
      adjustedBalances
    };
  }, [odds, bookmakerSaldos]);

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

  // Pode salvar como rascunho: tem dados parciais, mas não tem todas as pernas completas
  const podeSalvarRascunho = !isEditing && !rascunho && temDadosParciais && analysis.pernasCompletasCount < numPernas;

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
    
    const rascunhoSalvo = criarRascunho('SUREBET', {
      evento: evento || undefined,
      mercado: mercado || undefined,
      esporte: esporte || undefined,
      estrategia: estrategia || undefined,
      contexto_operacional: contexto || undefined,
      modelo,
      modelo_tipo: modeloTipo,
      quantidade_pernas: numPernas,
      pernas: pernasRascunho,
    });
    
    toast.success(
      `Rascunho salvo!`,
      { 
        description: rascunhoSalvo.motivo_incompleto || 'Acesse seus rascunhos para continuar depois',
        icon: <FileText className="h-4 w-4 text-blue-500" />
      }
    );
    
    // Fechar o formulário
    if (!embedded) onOpenChange(false);
  }, [odds, evento, mercado, esporte, estrategia, contexto, modeloTipo, numPernas, workspaceId, bookmakerSaldos, criarRascunho, onOpenChange]);

  const getBookmakerNome = (id: string) => bookmakerSaldos.find(b => b.id === id)?.nome || "";

  // ============================================
  // RENDERIZAÇÃO
  // ============================================

  if (!open) return null;

  return (
    <>
      {/* Painel Fullscreen - Ocupa 100% da janela */}
      <div className="fixed inset-0 z-50 bg-background flex flex-col animate-in fade-in-0 duration-200">
        <div className="relative w-full h-full flex flex-col overflow-hidden max-h-screen">
          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          
          {/* HEADER UNIFICADO V2 - 3 linhas fixas */}
          <BetFormHeaderV2
            formType="arbitragem"
            estrategia={estrategia}
            contexto={contexto}
            onEstrategiaChange={(v) => setEstrategia(v)}
            onContextoChange={(v) => setContexto(v)}
            isEditing={isEditing}
            activeTab={activeTab}
            lockedEstrategia={!isEditing && isAbaEstrategiaFixa(activeTab) ? getEstrategiaFromTab(activeTab) : null}
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
            showImport={!isEditing}
            onImportClick={() => fileInputRef.current?.click()}
            showCloseButton={!embedded}
            onClose={() => onOpenChange(false)}
            embedded={embedded}
          />

          {/* CONTENT */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {/* Operação parcial warning */}
            {analysis.isOperacaoParcial && !isEditing && (
              <div className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                <div className="flex-1">
                  <span className="font-medium text-amber-500">Operação parcial:</span>{" "}
                  <span className="text-muted-foreground">
                    {analysis.pernasCompletasCount}/{numPernas} pernas preenchidas.
                  </span>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="shrink-0 h-7 text-xs border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
                  onClick={() => setShowConversionDialog(true)}
                >
                  Converter para simples
                </Button>
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
            </div>

            {/* TABELA PRINCIPAL */}
            <div className="overflow-x-auto" ref={tableContainerRef}>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="py-2 px-2 text-left font-medium text-muted-foreground w-16">Perna</th>
                    <th className="py-2 px-2 text-left font-medium text-muted-foreground min-w-[160px]">Casa</th>
                    <th className="py-2 px-2 text-center font-medium text-muted-foreground w-20">Odd</th>
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
                    {!isEditing && <th className="py-2 px-2 w-8"></th>}
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
                      bookmakers={getAdjustedBookmakersForLeg(pernaIndex)}
                      directedProfitLegs={directedProfitLegs}
                      numPernas={numPernas}
                      moedaDominante={analysis.moedaDominante}
                      hasInsufficientBalance={balanceValidation.insufficientLegs.includes(pernaIndex)}
                      onResultadoChange={handlePernaResultadoChange}
                      onUpdateOdd={updateOdd}
                      onSetReference={setReferenceIndex}
                      onToggleDirected={toggleDirectedLeg}
                      onAddEntry={addAdditionalEntry}
                      onFocus={setFocusedLeg}
                      onBlur={() => setFocusedLeg(null)}
                      onFieldKeyDown={handleFieldKeyDown}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* FOOTER - Totais e Controles */}
            <SurebetTableFooter
              analysis={analysis}
              isEditing={isEditing}
              arredondarAtivado={arredondarAtivado}
              setArredondarAtivado={setArredondarAtivado}
              arredondarValor={arredondarValor}
              setArredondarValor={setArredondarValor}
              onImport={handleImportButtonClick}
            />
          </div>

          {/* ACTIONS */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-border/50 bg-muted/30">
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
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              {podeSalvarRascunho && (
                <Button 
                  variant="outline"
                  onClick={handleSalvarRascunho}
                  disabled={saving}
                  className="border-blue-500/30 text-blue-500 hover:bg-blue-500/10"
                >
                  <FileText className="h-4 w-4 mr-1" />
                  Rascunho
                </Button>
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
                onClick={handleSave} 
                disabled={saving || analysis.stakeTotal <= 0 || analysis.pernasCompletasCount < numPernas || (!isEditing && balanceValidation.hasInsufficientBalance)}
                title={balanceValidation.hasInsufficientBalance ? "Saldo insuficiente em uma ou mais casas" : undefined}
              >
                <Save className="h-4 w-4 mr-1" />
                {isEditing ? "Salvar" : "Registrar"}
              </Button>
            </div>
          </div>

          {/* Aviso de saldo insuficiente */}
          {!isEditing && balanceValidation.hasInsufficientBalance && (
            <div className="px-4 pb-3 -mt-2">
              <div className="flex items-center gap-2 p-2 bg-destructive/10 border border-destructive/30 rounded text-xs text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  Saldo insuficiente na(s) perna(s) {balanceValidation.insufficientLegs.map(i => i + 1).join(", ")}. 
                  Reduza o stake ou selecione outra casa.
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
    </>
  );
}
