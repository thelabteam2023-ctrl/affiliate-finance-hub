import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateCanonicalCaches } from "@/lib/invalidateCanonicalCaches";

import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useBookmakerSaldosQuery, useInvalidateBookmakerSaldos, type BookmakerSaldo } from "@/hooks/useBookmakerSaldosQuery";
import { criarAposta, deletarAposta, liquidarAposta, reliquidarAposta, type SelecaoMultipla } from "@/services/aposta";
import { creditarFreebetViaLedger, estornarFreebetViaLedger } from "@/lib/freebetLedgerService";
import { useExchangeRatesSafe } from "@/contexts/ExchangeRatesContext";
import { isForeignCurrency } from "@/types/currency";
import { useProjetoConsolidacao } from "@/hooks/useProjetoConsolidacao";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Save, Trash2, Camera, CheckCircle2, Gift, FileText } from "lucide-react";
import { useApostaRascunho, type RascunhoSelecaoData, type ApostaRascunho } from "@/hooks/useApostaRascunho";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Card, CardContent } from "@/components/ui/card";
import { RegistroApostaValues, getSuggestionsForTab } from "./RegistroApostaFields";
import { isAbaEstrategiaFixa, getEstrategiaFromTab, getContextoFromTab, isAbaContextoFixo, type FormaRegistro, type ApostaEstrategia, type ContextoOperacional, type FonteSaldo } from "@/lib/apostaConstants";
import { BetFormHeader } from "@/components/apostas/BetFormHeader";
import { getFirstLastName } from "@/lib/utils";
import { toLocalTimestamp, validarDataAposta, dbTimestampToDatetimeLocal } from "@/utils/dateUtils";
import { 
  BookmakerSelectOption, 
  SaldoBreakdownDisplay, 
  CurrencyBadge,
  formatCurrency as formatCurrencyCanonical,
  getCurrencyTextColor 
} from "@/components/bookmakers/BookmakerSelectOption";
import { BookmakerSearchableSelectContent } from "@/components/bookmakers/BookmakerSearchableSelectContent";
// reliquidarAposta already imported at line 5
// updateBookmakerBalance REMOVIDO - Motor v7 usa exclusivamente RPCs de liquidação
import { useImportMultiplaBetPrint } from "@/hooks/useImportMultiplaBetPrint";
import { GerouFreebetInput } from "./GerouFreebetInput";
import { FreebetToggle } from "@/components/apostas/waterfall";
import { FonteEntradaSelector } from "@/components/apostas/FonteEntradaSelector";
import { useWorkspaceBetSources } from "@/hooks/useWorkspaceBetSources";
import { deriveStakeSplit } from "@/lib/freebetStake";

interface Selecao {
  descricao: string;
  odd: string;
  resultado?: "PENDENTE" | "GREEN" | "RED" | "MEIO_GREEN" | "MEIO_RED" | "VOID";
}

type TipoMultipla = "DUPLA" | "TRIPLA" | "QUADRUPLA" | "QUINTUPLA" | "SEXTUPLA";

const TIPO_NUM_MAP: Record<TipoMultipla, number> = {
  DUPLA: 2, TRIPLA: 3, QUADRUPLA: 4, QUINTUPLA: 5, SEXTUPLA: 6,
};

const getNumFromTipo = (tipo: string): number => TIPO_NUM_MAP[tipo as TipoMultipla] || 2;

interface ApostaMultipla {
  id: string;
  tipo_multipla: string;
  stake: number;
  stake_real?: number | null;
  stake_freebet?: number | null;
  stake_total?: number | null;
  odd_final: number;
  retorno_potencial: number | null;
  lucro_prejuizo: number | null;
  valor_retorno: number | null;
  selecoes: { descricao: string; odd: string; resultado?: string }[];
  status: string;
  resultado: string | null;
  bookmaker_id: string;
  tipo_freebet: string | null;
  gerou_freebet: boolean;
  valor_freebet_gerada: number | null;
  data_aposta: string;
  observacoes: string | null;
  estrategia?: string | null;
  forma_registro?: string | null;
  contexto_operacional?: string | null;
  usar_freebet?: boolean | null;
  fonte_saldo?: string | null;
}

// Interface de Bookmaker local (mapeada do hook canônico)
interface Bookmaker {
  id: string;
  nome: string;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  saldo_atual: number;
  saldo_disponivel: number;
  saldo_freebet: number;
  saldo_bonus: number;
  saldo_operavel: number;
  moeda: string;
  logo_url: string | null;
  bonus_rollover_started?: boolean;
  instance_identifier?: string | null;
}

/** Tipo de ação executada para distinguir save de delete */
export type ApostaMultiplaActionType = 'save' | 'delete';

interface ApostaMultiplaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aposta: ApostaMultipla | null;
  projetoId: string;
  /** Callback após sucesso. O parâmetro action distingue 'save' (criar/atualizar) de 'delete' (exclusão) */
  onSuccess: (action?: ApostaMultiplaActionType) => void;
  defaultEstrategia?: string;
  activeTab?: string;
  /** Quando true, renderiza apenas o conteúdo interno (sem Dialog wrapper) para uso em janelas flutuantes */
  embedded?: boolean;
  /** Rascunho para pré-preencher o formulário (de localStorage) */
  rascunho?: ApostaRascunho | null;
}

export function ApostaMultiplaDialog({
  open,
  onOpenChange,
  aposta,
  projetoId,
  onSuccess,
  defaultEstrategia = 'PUNTER',
  activeTab = 'apostas',
  embedded = false,
  rascunho = null,
}: ApostaMultiplaDialogProps) {
  const { workspaceId } = useWorkspace();
  const { favoriteSource } = useWorkspaceBetSources(workspaceId);
  const exchangeRates = useExchangeRatesSafe();
  // REGRA UNIFICADA: formulários SEMPRE usam cotação de trabalho (se configurada)
  const { cotacaoAtual: cotacaoUsdFormulario } = useProjetoConsolidacao({ projetoId });
  const [loading, setLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  

  // ========== HOOK CANÔNICO DE SALDOS ==========
  // Esta é a ÚNICA fonte de verdade para saldos de bookmaker
  // CORRIGIDO: Incluir todas as casas quando em modo edição OU quando aba é bônus
  const isBonusContext = activeTab === 'bonus' || activeTab === 'bonus-operacoes';
  const { 
    data: bookmakerSaldos = [], 
    isLoading: saldosLoading,
    refetch: refetchSaldos 
  } = useBookmakerSaldosQuery({
    projetoId,
    enabled: open,
    includeZeroBalance: !!aposta || isBonusContext, // Em edição ou contexto bônus, mostrar todos
    currentBookmakerId: aposta?.bookmaker_id || null
  });
  const invalidateSaldos = useInvalidateBookmakerSaldos();
  const queryClient = useQueryClient();
  
  // Mapear saldos canônicos para formato local (retrocompatibilidade)
   const bookmakers = useMemo((): Bookmaker[] => {
    const currentBookmakerId = aposta?.bookmaker_id;
    return bookmakerSaldos
      .filter(bk => bk.saldo_operavel >= 0.50 || bk.id === currentBookmakerId) // Sempre manter a casa da aposta em edição
      .map(bk => ({
      id: bk.id,
      nome: bk.nome,
      parceiro_id: bk.parceiro_id,
      parceiro_nome: bk.parceiro_nome,
      saldo_atual: bk.saldo_real,
      saldo_disponivel: bk.saldo_disponivel,
      saldo_freebet: bk.saldo_freebet,
      saldo_bonus: bk.saldo_bonus,
      saldo_operavel: bk.saldo_operavel,
      moeda: bk.moeda,
      logo_url: bk.logo_url,
      bonus_rollover_started: bk.bonus_rollover_started,
      instance_identifier: bk.instance_identifier,
    }));
  }, [bookmakerSaldos, aposta?.bookmaker_id]);

  // ========== HOOK DE RASCUNHOS (LOCALSTORAGE) ==========
  // Permite salvar múltiplas incompletas (sem casa, sem stake, 1 seleção) sem tocar no banco
  const { criarRascunho } = useApostaRascunho(projetoId, workspaceId || '');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const {
    isProcessing: isPrintProcessing,
    parsedData: printParsedData,
    imagePreview: printImagePreview,
    fieldsNeedingReview: printFieldsNeedingReview,
    processImage: processPrintImage,
    processFromClipboard: processPrintClipboard,
    clearParsedData: clearPrintData,
    applyParsedData: applyPrintData
  } = useImportMultiplaBetPrint();

  // Handle paste for importing prints (Ctrl+V)
  const handlePaste = useCallback((event: ClipboardEvent) => {
    if (!open || aposta) return; // Only for new bets
    processPrintClipboard(event);
  }, [open, aposta, processPrintClipboard]);

  useEffect(() => {
    if (open && !aposta) {
      document.addEventListener("paste", handlePaste);
      return () => document.removeEventListener("paste", handlePaste);
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

  // Apply parsed print data when available
  useEffect(() => {
    if (printParsedData && !aposta) {
      const data = applyPrintData();
      
      // Set tipo de múltipla
      setTipoMultipla(data.tipo);
      
      // Set stake if detected
      if (data.stake) {
        setStake(data.stake);
      }
      
      // Set seleções
      if (data.selecoes && data.selecoes.length > 0) {
        const novasSelecoes = data.selecoes.map(sel => ({
          descricao: sel.descricao.toUpperCase(),
          odd: sel.odd,
          resultado: "PENDENTE" as const
        }));
        setSelecoes(novasSelecoes);
      }
    }
  }, [printParsedData, aposta, applyPrintData]);

  // Form state
  const [bookmakerId, setBookmakerId] = useState("");
  const [tipoMultipla, setTipoMultipla] = useState<TipoMultipla>("DUPLA");
  const [stake, setStake] = useState("");
  const [resultadoManual, setResultadoManual] = useState<string | null>(null);
  const [statusResultado, setStatusResultado] = useState("PENDENTE");
  const [dataAposta, setDataAposta] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [boostPercent, setBoostPercent] = useState("");
  const [fonteEntrada, setFonteEntrada] = useState<string | null>(null);

  // Registro explícito - estratégia NUNCA é inferida automaticamente
  // Se a aba não define estratégia (ex: Apostas Livres), fica null e o usuário DEVE escolher
  // NOVO: fonte_saldo é a VERDADE FINANCEIRA - qual pool de capital é usado
  const [registroValues, setRegistroValues] = useState<RegistroApostaValues>(() => {
    const suggestions = getSuggestionsForTab(activeTab);
    // Inferir fonte_saldo baseado na aba
    const inferredFonteSaldo = (() => {
      if (activeTab === 'freebets') return 'FREEBET' as FonteSaldo;
      if (activeTab === 'bonus' || activeTab === 'bonus-operacoes') return 'BONUS' as FonteSaldo;
      return 'REAL' as FonteSaldo;
    })();
    return {
      forma_registro: 'MULTIPLA',
      estrategia: suggestions.estrategia ?? null, // CRÍTICO: null se não definido, NUNCA fallback
      contexto_operacional: suggestions.contexto_operacional ?? 'NORMAL',
      fonte_saldo: inferredFonteSaldo,
    };
  });

   // Seleções
  const [selecoes, setSelecoes] = useState<Selecao[]>([
    { descricao: "", odd: "", resultado: "PENDENTE" },
    { descricao: "", odd: "", resultado: "PENDENTE" },
  ]);
  // Guard: skip tipo-change effect during initial load from aposta/rascunho
  const isInitializingRef = useRef(false);

  // Número de seleções derivado do tipo
  const numSelecoes = useMemo(() => getNumFromTipo(tipoMultipla), [tipoMultipla]);
  const is4Plus = numSelecoes >= 4;

  // Freebet state
  const [usarFreebet, setUsarFreebet] = useState(false);
  const [valorFreebetUsar, setValorFreebetUsar] = useState(0);
  const [gerouFreebet, setGerouFreebet] = useState(false);
  const [valorFreebetGerada, setValorFreebetGerada] = useState("");

  // Saldo da casa selecionada
  const [bookmakerSaldo, setBookmakerSaldo] = useState<{
    saldo: number;
    saldoFreebet: number;
    saldoBonus: number;
    saldoOperavel: number;
    moeda: string;
  } | null>(null);

  // Carregar bookmakers via hook canônico (automático quando open=true)
  useEffect(() => {
    if (open) {
      // Bookmakers são carregados via useBookmakerSaldosQuery automaticamente
      if (!aposta) {
        // Reset form for new aposta
        resetForm();
      }
    }
  }, [open]);

  // Preencher form com dados da aposta existente
  useEffect(() => {
    if (aposta && open) {
      // Set guard to prevent tipo-change effect from overwriting selecoes
      isInitializingRef.current = true;
      
      setBookmakerId(aposta.bookmaker_id);
      setBoostPercent((aposta as any).boost_percentual?.toString() || "");
      const persistedStakeSplit = deriveStakeSplit({
        stake: aposta.stake,
        stake_total: aposta.stake_total,
        stake_real: aposta.stake_real,
        stake_freebet: aposta.stake_freebet,
        usar_freebet: aposta.usar_freebet,
        fonte_saldo: aposta.fonte_saldo,
      });

      setStake((persistedStakeSplit.stakeTotal || aposta.stake || 0).toString());
      setStatusResultado(aposta.resultado || "PENDENTE");
      setDataAposta(dbTimestampToDatetimeLocal(aposta.data_aposta));
      setObservacoes(aposta.observacoes || "");
      setFonteEntrada((aposta as any).fonte_entrada || null);

      // Restaurar campos de registro (incluindo fonte_saldo)
      const suggestions = getSuggestionsForTab(activeTab);
      setRegistroValues({
        forma_registro: (aposta.forma_registro as FormaRegistro) || "MULTIPLA",
        estrategia: (aposta.estrategia as ApostaEstrategia) || (suggestions.estrategia || (defaultEstrategia as ApostaEstrategia)),
        contexto_operacional: (aposta.contexto_operacional as ContextoOperacional) || (suggestions.contexto_operacional || "NORMAL"),
        fonte_saldo: ((aposta as any).fonte_saldo as FonteSaldo) || 'REAL',
      });

      // Parse selecoes from JSONB — SET SELECOES BEFORE tipoMultipla
      // so the tipo-change effect (when it runs) sees correct length
      const parsedSelecoes = aposta.selecoes || [];
      if (parsedSelecoes.length > 0) {
        const mapped = parsedSelecoes.map((s: any) => ({
          descricao: s.descricao || "",
          odd: s.odd?.toString() || "",
          resultado: s.resultado || "PENDENTE",
        }));
        setSelecoes(mapped);
        
        // Derive tipo from actual selecoes count (source of truth)
        const n = mapped.length;
        const tipoMap: Record<number, TipoMultipla> = { 2: "DUPLA", 3: "TRIPLA", 4: "QUADRUPLA", 5: "QUINTUPLA", 6: "SEXTUPLA" };
        setTipoMultipla(tipoMap[Math.min(Math.max(n, 2), 6)] || "DUPLA");
      } else {
        setTipoMultipla((aposta.tipo_multipla as TipoMultipla) || "DUPLA");
      }
      
      // Release guard after React processes the batched state updates
      requestAnimationFrame(() => {
        isInitializingRef.current = false;
      });

      // Freebet
      setUsarFreebet(
        persistedStakeSplit.usesFreebet || !!(aposta.tipo_freebet && aposta.tipo_freebet !== "normal")
      );
      setValorFreebetUsar(persistedStakeSplit.stakeFreebet);
      setGerouFreebet(aposta.gerou_freebet || false);
      setValorFreebetGerada(aposta.valor_freebet_gerada?.toString() || "");
      
      // Resultado manual: só usar se NENHUMA perna tem resultado individual
      const savedResultado = aposta.resultado || "PENDENTE";
      const parsedSels = aposta.selecoes || [];
      const anyLegHasResult = parsedSels.some((s: any) => s.resultado && s.resultado !== "PENDENTE");
      
      if (!anyLegHasResult && savedResultado !== "PENDENTE") {
        // Resultado foi definido globalmente (sem per-leg)
        setResultadoManual(savedResultado);
      } else {
        // Per-leg results drive the overall — no manual override
        setResultadoManual(null);
      }
    } else if (rascunho && rascunho.tipo === 'MULTIPLA' && open && !aposta) {
      // Set guard for rascunho too
      isInitializingRef.current = true;
      
      // PRÉ-PREENCHER COM DADOS DO RASCUNHO
      setBookmakerId(rascunho.bookmaker_id || "");
      setStake(rascunho.stake?.toString() || "");
      setObservacoes(rascunho.observacoes || "");
      setBoostPercent("");
      setDataAposta(getLocalDateTimeString());
      setStatusResultado("PENDENTE");
      
      // Preencher seleções BEFORE setting tipoMultipla
      if (rascunho.selecoes && rascunho.selecoes.length > 0) {
        const novasSelecoes: Selecao[] = rascunho.selecoes.map(sel => ({
          descricao: sel.descricao?.toUpperCase() || "",
          odd: sel.odd?.toString() || "",
          resultado: "PENDENTE" as const
        }));
        while (novasSelecoes.length < 2) {
          novasSelecoes.push({ descricao: "", odd: "", resultado: "PENDENTE" });
        }
        setSelecoes(novasSelecoes);
        
        // Ajustar tipo de múltipla baseado no número de seleções
        const n = rascunho.selecoes.length;
        const tipoMap: Record<number, TipoMultipla> = { 2: "DUPLA", 3: "TRIPLA", 4: "QUADRUPLA", 5: "QUINTUPLA", 6: "SEXTUPLA" };
        setTipoMultipla(tipoMap[Math.min(n, 6)] || (n >= 4 ? "QUADRUPLA" : n >= 3 ? "TRIPLA" : "DUPLA"));
      } else {
        setTipoMultipla((rascunho.tipo_multipla as TipoMultipla) || "DUPLA");
      }
      
      requestAnimationFrame(() => {
        isInitializingRef.current = false;
      });

      setUsarFreebet(false);
      setValorFreebetUsar(0);
      setGerouFreebet(false);
      setValorFreebetGerada("");
      setResultadoManual(null);
    }
  }, [aposta, open, rascunho]);

  // Atualizar número de seleções quando tipo muda (user interaction only)
  useEffect(() => {
    // Skip during initialization from aposta/rascunho to avoid overwriting loaded data
    if (isInitializingRef.current) return;
    
    const n = numSelecoes;
    setSelecoes((prev) => {
      if (prev.length === n) return prev;
      if (prev.length < n) {
        const extras = Array.from({ length: n - prev.length }, () => ({ descricao: "", odd: "", resultado: "PENDENTE" as const }));
        return [...prev, ...extras];
      }
      return prev.slice(0, n);
    });
  }, [numSelecoes]);

  // Atualizar saldo quando bookmaker muda
  useEffect(() => {
    if (bookmakerId) {
      const bk = bookmakers.find((b) => b.id === bookmakerId);
      if (bk) {
        setBookmakerSaldo({
          saldo: bk.saldo_atual,
          saldoFreebet: bk.saldo_freebet,
          saldoBonus: bk.saldo_bonus,
          saldoOperavel: bk.saldo_operavel,
          moeda: bk.moeda,
        });
      }
    } else {
      setBookmakerSaldo(null);
    }
  }, [bookmakerId, bookmakers]);

  const resetForm = () => {
    setBookmakerId("");
    setTipoMultipla("DUPLA");
    setStake("");
    setBoostPercent("");
    setResultadoManual(null);
    setStatusResultado("PENDENTE");
    setDataAposta(getLocalDateTimeString());
    setObservacoes("");
    setSelecoes([
      { descricao: "", odd: "", resultado: "PENDENTE" },
      { descricao: "", odd: "", resultado: "PENDENTE" },
    ]);
    setUsarFreebet(false);
    setValorFreebetUsar(0);
    setGerouFreebet(false);
    setValorFreebetGerada("");
    setBookmakerSaldo(null);
    // fonte_entrada mantida para preservar última escolha na sessão
    // Reset registro values (incluindo fonte_saldo)
    const suggestions = getSuggestionsForTab(activeTab);
    const inferredFonteSaldo = (() => {
      if (activeTab === 'freebets') return 'FREEBET' as FonteSaldo;
      if (activeTab === 'bonus' || activeTab === 'bonus-operacoes') return 'BONUS' as FonteSaldo;
      return 'REAL' as FonteSaldo;
    })();
    setRegistroValues({
      forma_registro: 'MULTIPLA',
      estrategia: suggestions.estrategia || defaultEstrategia as ApostaEstrategia,
      contexto_operacional: suggestions.contexto_operacional || 'NORMAL',
      fonte_saldo: inferredFonteSaldo,
    });
  };

  // Sincronizar estratégia, contexto E fonte_saldo quando estão "travados" pela aba
  // CRÍTICO: Quando a aba define estratégia/contexto fixos (ex: bonus, freebets),
  // precisamos atualizar o registroValues automaticamente
  useEffect(() => {
    if (!aposta && open) {
      const lockedEstrategia = isAbaEstrategiaFixa(activeTab) ? getEstrategiaFromTab(activeTab) : null;
      const lockedContexto = isAbaContextoFixo(activeTab) ? getContextoFromTab(activeTab) : null;
      
      // Inferir fonte_saldo baseado na aba ativa ou estratégia
      const inferredFonteSaldo = (() => {
        if (activeTab === 'freebets') return 'FREEBET' as FonteSaldo;
        if (activeTab === 'bonus' || activeTab === 'bonus-operacoes') return 'BONUS' as FonteSaldo;
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

  // Auto-select favorite source for ValueBet
  useEffect(() => {
    if (open && !aposta && fonteEntrada === null && favoriteSource && registroValues.estrategia === 'VALUEBET') {
      setFonteEntrada(favoriteSource.name);
    }
  }, [open, aposta, favoriteSource, registroValues.estrategia, fonteEntrada]);

  const getLocalDateTimeString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  // fetchBookmakers REMOVIDO - agora usa useBookmakerSaldosQuery como fonte canônica

  // Calcular odd final (produto das odds) - considerando VOIDs como odd 1.00 e boost
  const boostMultiplier = useMemo(() => {
    const bp = parseFloat(boostPercent);
    return !isNaN(bp) && bp > 0 ? 1 + bp / 100 : 1;
  }, [boostPercent]);

  const { oddFinal, oddFinalReal, oddFinalSemBoost } = useMemo(() => {
    const selecoesValidas = selecoes.filter((s) => {
      const oddNum = parseFloat(s.odd);
      return !isNaN(oddNum) && oddNum > 0;
    });
    
    if (selecoesValidas.length === 0) return { oddFinal: 0, oddFinalReal: 0, oddFinalSemBoost: 0 };
    
    const oddNominal = selecoesValidas.reduce((acc, s) => acc * parseFloat(s.odd), 1);
    const oddReal = selecoesValidas.reduce((acc, s) => {
      const odd = parseFloat(s.odd);
      switch (s.resultado) {
        case "VOID": return acc * 1;
        case "MEIO_RED": return acc * 0.5;
        case "MEIO_GREEN": return acc * (odd + 1) / 2;
        case "RED": return acc * 0;
        default: return acc * odd; // GREEN, PENDENTE
      }
    }, 1);
    
    return {
      oddFinal: oddNominal * boostMultiplier,
      oddFinalReal: oddReal * boostMultiplier,
      oddFinalSemBoost: oddNominal,
    };
  }, [selecoes, boostMultiplier]);

  // Função para calcular resultado da múltipla baseada no IMPACTO FINANCEIRO REAL
  // O resultado é derivado do fator combinado das pernas, não de hierarquia simplista
  const calcularResultadoMultipla = useCallback((sels: Selecao[]): string => {
    const resultados = sels.map(s => s.resultado || "PENDENTE");
    
    // Se alguma perna ainda está pendente → PENDENTE
    if (resultados.includes("PENDENTE")) return "PENDENTE";
    
    // Todas VOID → VOID (retorno = stake, sem lucro nem prejuízo)
    if (resultados.every(r => r === "VOID")) return "VOID";
    
    // Qualquer RED → RED (fator = 0, perda total)
    if (resultados.includes("RED")) return "RED";
    
    // Todas GREEN → GREEN (lucro máximo)
    if (resultados.every(r => r === "GREEN")) return "GREEN";
    
    // Para combinações mistas (MEIO_RED, MEIO_GREEN, GREEN, VOID):
    // Calcular o fator combinado real para determinar o resultado
    let fatorTotal = 1;
    for (const s of sels) {
      const odd = parseFloat(s.odd) || 1;
      const res = s.resultado || "PENDENTE";
      switch (res) {
        case "GREEN": fatorTotal *= odd; break;
        case "VOID": fatorTotal *= 1; break;
        case "MEIO_GREEN": fatorTotal *= (odd + 1) / 2; break;
        case "MEIO_RED": fatorTotal *= 0.5; break;
        default: fatorTotal *= odd; break;
      }
    }
    
    // Derivar resultado do fator financeiro real
    if (fatorTotal > 1) {
      // Lucro positivo: se todas as pernas resolvidas são GREEN/VOID → MEIO_GREEN
      return "MEIO_GREEN";
    } else if (fatorTotal === 1) {
      return "VOID"; // Break-even exato
    } else {
      // Prejuízo (fator < 1)
      return "MEIO_RED";
    }
  }, []);

  // Calcular preview em tempo real com fatores corretos
  const previewCalculo = useMemo(() => {
    const stakeNum = parseFloat(stake) || 0;
    const selecoesValidas = selecoes.filter((s) => {
      const oddNum = parseFloat(s.odd);
      return !isNaN(oddNum) && oddNum > 0;
    });

    if (stakeNum <= 0 || selecoesValidas.length === 0) {
      return { resultado: "PENDENTE", retorno: 0, lucro: 0 };
    }

    // Calcular fatores para cada seleção
    let fatorTotal = 1;

    for (const s of selecoesValidas) {
      const odd = parseFloat(s.odd);
      const resultado = s.resultado || "PENDENTE";
      switch (resultado) {
        case "GREEN":
          fatorTotal *= odd;
          break;
        case "RED":
          fatorTotal *= 0; // RED = perda total
          break;
        case "VOID":
          fatorTotal *= 1;
          break;
        case "MEIO_GREEN":
          fatorTotal *= (odd + 1) / 2;
          break;
        case "MEIO_RED":
          fatorTotal *= 0.5;
          break;
        case "PENDENTE":
          fatorTotal *= odd; // Assume green para preview potencial
          break;
      }
    }

    // Aplicar boost ao retorno (boost incrementa o payout total)
    const retorno = stakeNum * fatorTotal * boostMultiplier;
    const lucro = usarFreebet
      ? retorno > stakeNum
        ? retorno - stakeNum
        : 0
      : retorno - stakeNum;

    // Usar regra hierárquica para resultado
    const resultado = calcularResultadoMultipla(selecoes);

    return { resultado, retorno, lucro };
  }, [selecoes, stake, usarFreebet, calcularResultadoMultipla, boostMultiplier]);

  // Detectar se alguma perna tem resultado individual definido
  const hasPerLegResults = useMemo(() => {
    return selecoes.slice(0, numSelecoes).some(s => s.resultado && s.resultado !== "PENDENTE");
  }, [selecoes, numSelecoes]);

  // Resultado final: se há resultados por perna, auto-calcula. Senão, permite override manual.
  const resultadoCalculado = hasPerLegResults 
    ? previewCalculo.resultado  // Auto-calculado das pernas (locked)
    : (resultadoManual || previewCalculo.resultado);

  // Calcular retorno potencial
  const retornoPotencial = useMemo(() => {
    const stakeNum = parseFloat(stake);
    if (isNaN(stakeNum) || stakeNum <= 0 || oddFinal <= 0) return 0;
    return stakeNum * oddFinal;
  }, [stake, oddFinal]);

  // Calcular lucro potencial
  const lucroPotencial = useMemo(() => {
    const stakeNum = parseFloat(stake);
    if (isNaN(stakeNum) || stakeNum <= 0) return 0;
    return retornoPotencial - stakeNum;
  }, [retornoPotencial, stake]);

  // Contar seleções válidas (descrição + odd > 1)
  const selecoesValidasCount = useMemo(() => {
    let count = 0;
    for (let i = 0; i < numSelecoes; i++) {
      const sel = selecoes[i];
      if (sel?.descricao?.trim() && parseFloat(sel?.odd) > 1) {
        count++;
      }
    }
    return count;
  }, [selecoes, numSelecoes]);

  // Verificar se formulário está pronto para salvar
  const canSave = useMemo(() => {
    const stakeNum = parseFloat(stake);
    return (
      bookmakerId && 
      !isNaN(stakeNum) && 
      stakeNum > 0 && 
      selecoesValidasCount >= numSelecoes &&
      registroValues.forma_registro &&
      registroValues.estrategia &&
      registroValues.contexto_operacional
    );
  }, [bookmakerId, stake, selecoesValidasCount, numSelecoes, registroValues]);

  // Verificar se tem dados parciais (para salvar como rascunho)
  const temDadosParciais = useMemo(() => {
    const hasAnySelecao = selecoes.some(s => s.descricao?.trim() || (parseFloat(s.odd) > 1));
    const hasBookmaker = bookmakerId?.trim() !== "";
    const hasStake = parseFloat(stake) > 0;
    return hasAnySelecao || hasBookmaker || hasStake;
  }, [selecoes, bookmakerId, stake]);
  
  // Pode salvar como rascunho: tem dados parciais, mas não pode salvar como aposta real
  const podeSalvarRascunho = !aposta && temDadosParciais && !canSave;
  
  // Handler para salvar como rascunho
  const handleSalvarRascunho = useCallback(() => {
    if (!workspaceId) {
      toast.error("Workspace não identificado");
      return;
    }
    
    // Converter seleções para formato de rascunho
    const selecoesRascunho: RascunhoSelecaoData[] = selecoes.map(s => ({
      descricao: s.descricao || undefined,
      odd: parseFloat(s.odd) || undefined,
    }));
    
    // Pegar nome do bookmaker se selecionado
    const bookmakerNome = bookmakerId 
      ? bookmakers.find(b => b.id === bookmakerId)?.nome 
      : undefined;
    
    const rascunho = criarRascunho('MULTIPLA', {
      bookmaker_id: bookmakerId || undefined,
      bookmaker_nome: bookmakerNome,
      stake: parseFloat(stake) || undefined,
      moeda: bookmakerSaldo?.moeda,
      tipo_multipla: tipoMultipla,
      observacoes: observacoes || undefined,
      selecoes: selecoesRascunho,
    });
    
    toast.success(
      `Rascunho salvo! ${rascunho.motivo_incompleto ? `(${rascunho.motivo_incompleto})` : ''}`,
      { description: 'Acesse seus rascunhos para continuar depois' }
    );
    
    // Fechar o dialog
    onOpenChange(false);
  }, [selecoes, bookmakerId, stake, tipoMultipla, observacoes, workspaceId, bookmakers, bookmakerSaldo, criarRascunho, onOpenChange]);

  // Usar formatCurrency canônico com suporte multi-moeda
  const formatCurrency = (value: number, moeda?: string) => {
    return formatCurrencyCanonical(value, moeda || bookmakerSaldo?.moeda || "BRL");
  };

  const handleSelecaoChange = (
    index: number,
    field: "descricao" | "odd" | "resultado",
    value: string
  ) => {
    setSelecoes((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      
      // Se resultado individual mudou, recalcular e limpar override manual se coincide
      if (field === "resultado") {
        const autoResult = calcularResultadoMultipla(updated);
        if (resultadoManual && resultadoManual === autoResult) {
          setResultadoManual(null);
        }
      }
      
      return updated;
    });
  };

  // Per-selection drop handler



  const handleUsarFreebetChange = (checked: boolean) => {
    setUsarFreebet(checked);
    if (checked) {
      // Mutuamente exclusivo
      setGerouFreebet(false);
      setValorFreebetGerada("");
      // Preencher stake com saldo freebet disponível
      if (bookmakerSaldo && bookmakerSaldo.saldoFreebet > 0) {
        setStake(bookmakerSaldo.saldoFreebet.toString());
      }
    }
  };

  const handleSubmit = async () => {
    // Validação dos campos de registro obrigatórios
    if (!registroValues.forma_registro || !registroValues.estrategia || !registroValues.contexto_operacional) {
      toast.error("Preencha todos os campos obrigatórios: forma de registro, estratégia e contexto operacional");
      return;
    }

    // Validações
    if (!bookmakerId) {
      toast.error("Selecione uma casa/vínculo");
      return;
    }

    const stakeNum = parseFloat(stake);
    if (isNaN(stakeNum) || stakeNum <= 0) {
      toast.error("Informe um valor de stake válido");
      return;
    }

    if (usarFreebet) {
      if (valorFreebetUsar <= 0) {
        toast.error("Informe um valor de freebet válido");
        return;
      }

      if (valorFreebetUsar > stakeNum) {
        toast.error("A freebet não pode ser maior que o stake total");
        return;
      }
    }

    const stakeSplit = deriveStakeSplit({
      stake: stakeNum,
      stake_total: stakeNum,
      stake_freebet: usarFreebet ? valorFreebetUsar : 0,
      usar_freebet: usarFreebet,
      fonte_saldo: usarFreebet ? 'FREEBET' : (registroValues.fonte_saldo || 'REAL'),
    });

    // Validar seleções
    for (let i = 0; i < numSelecoes; i++) {
      if (!selecoes[i]?.descricao?.trim()) {
        toast.error(`Preencha a descrição da seleção ${i + 1}`);
        return;
      }
      const oddVal = parseFloat(selecoes[i]?.odd);
      if (isNaN(oddVal) || oddVal <= 1) {
        toast.error(`Informe uma odd válida (>1) para a seleção ${i + 1}`);
        return;
      }
    }

    const selectedBookmaker = bookmakers.find((b) => b.id === bookmakerId);
    const sameBookmakerOnEdit = !!aposta && aposta.bookmaker_id === bookmakerId;
    const previousStakeSplit = sameBookmakerOnEdit
      ? deriveStakeSplit({
          stake: aposta?.stake,
          stake_total: aposta?.stake_total,
          stake_real: aposta?.stake_real,
          stake_freebet: aposta?.stake_freebet,
          usar_freebet: aposta?.usar_freebet,
          fonte_saldo: aposta?.fonte_saldo,
        })
      : null;

    if (selectedBookmaker) {
      const saldoRealDisponivel = selectedBookmaker.saldo_disponivel + (previousStakeSplit?.stakeReal ?? 0);
      const saldoFreebetDisponivel = selectedBookmaker.saldo_freebet + (previousStakeSplit?.stakeFreebet ?? 0);

      if (stakeSplit.stakeReal > saldoRealDisponivel) {
        toast.error(`Stake real maior que o saldo disponível (${formatCurrency(saldoRealDisponivel)})`);
        return;
      }

      if (stakeSplit.stakeFreebet > saldoFreebetDisponivel) {
        toast.error(`Freebet maior que o saldo disponível (${formatCurrency(saldoFreebetDisponivel)})`);
        return;
      }
    }

    try {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Usar o resultado calculado baseado nos resultados individuais
      const resultadoFinal = resultadoCalculado;
      
      // Usar valores do previewCalculo que já calcula corretamente com fatores
      let lucroPrejuizo: number | null = null;
      let valorRetorno: number | null = null;
      
      // Para apostas liquidadas, usar oddFinalReal (que considera VOID=1)
      // Para pendentes, usar oddFinal nominal
      const oddFinalParaSalvar = resultadoFinal !== "PENDENTE" ? oddFinalReal : oddFinal;

      if (resultadoFinal !== "PENDENTE") {
        lucroPrejuizo = previewCalculo.lucro;
        valorRetorno = previewCalculo.retorno;
      }

      const selecoesFormatadas = selecoes
        .slice(0, numSelecoes)
        .map((s) => ({
          descricao: s.descricao.trim(),
          odd: parseFloat(s.odd),
          resultado: s.resultado || "PENDENTE",
        }));

      if (!workspaceId) {
        toast.error("Workspace não identificado");
        return;
      }
      
      // TRAVA DEFINITIVA: Validar data antes de salvar
      const dataValidation = validarDataAposta(dataAposta);
      if (!dataValidation.valid) {
        toast.error(dataValidation.error || "Data inválida");
        return;
      }

      // Multi-moeda: determinar moeda e snapshot
      // REGRA UNIFICADA: USD usa cotacaoUsdFormulario (Trabalho > PTAX), outras moedas usam exchangeRates
      const moedaOpEdit = bookmakerSaldo?.moeda || 'BRL';
      const isForeignEdit = isForeignCurrency(moedaOpEdit);
      const cotacaoSnapEdit = isForeignEdit
        ? (moedaOpEdit === 'USD' ? cotacaoUsdFormulario : (exchangeRates ? exchangeRates.getRate(moedaOpEdit) : null))
        : null;
      const valorBrlRefEdit = isForeignEdit && cotacaoSnapEdit ? stakeNum * cotacaoSnapEdit : null;

      const boostVal = parseFloat(boostPercent);
      const apostaData = {
        user_id: user.id,
        workspace_id: workspaceId,
        projeto_id: projetoId,
        bookmaker_id: bookmakerId,
        tipo_multipla: tipoMultipla,
        stake: stakeSplit.stakeTotal,
        stake_real: stakeSplit.stakeReal,
        stake_freebet: stakeSplit.stakeFreebet,
        stake_total: stakeSplit.stakeTotal,
        odd_final: oddFinalParaSalvar,
        retorno_potencial: retornoPotencial,
        lucro_prejuizo: lucroPrejuizo,
        valor_retorno: valorRetorno,
        selecoes: selecoesFormatadas,
        status: resultadoFinal === "PENDENTE" ? "PENDENTE" : "LIQUIDADA",
        resultado: resultadoFinal,
        tipo_freebet: stakeSplit.usesFreebet ? "freebet_snr" : null,
        usar_freebet: stakeSplit.usesFreebet,
        fonte_saldo: stakeSplit.usesFreebet ? 'FREEBET' : (registroValues.fonte_saldo || 'REAL'),
        gerou_freebet: false,
        valor_freebet_gerada: null,
        data_aposta: toLocalTimestamp(dataAposta),
        observacoes: observacoes || null,
        estrategia: registroValues.estrategia,
        forma_registro: registroValues.forma_registro,
        contexto_operacional: registroValues.contexto_operacional,
        boost_percentual: !isNaN(boostVal) && boostVal > 0 ? boostVal : null,
        fonte_entrada: registroValues.estrategia === 'VALUEBET' ? (fonteEntrada || 'Manual') : null,
        // Multi-moeda
        moeda_operacao: moedaOpEdit,
        cotacao_snapshot: cotacaoSnapEdit,
        valor_brl_referencia: valorBrlRefEdit,
      };

      if (aposta) {
        // ========== EDIÇÃO IDEMPOTENTE VIA RPC ATÔMICO ==========
        // Detectar mudanças financeiras
        const resultadoAnterior = aposta.resultado;
        const resultadoMudou = resultadoAnterior !== resultadoFinal;
        const persistedStakeSplit = deriveStakeSplit({
          stake: aposta.stake,
          stake_total: aposta.stake_total,
          stake_real: aposta.stake_real,
          stake_freebet: aposta.stake_freebet,
          usar_freebet: aposta.usar_freebet,
          fonte_saldo: aposta.fonte_saldo,
        });
        const stakeMudou = stakeSplit.stakeTotal !== persistedStakeSplit.stakeTotal || stakeSplit.stakeReal !== persistedStakeSplit.stakeReal || stakeSplit.stakeFreebet !== persistedStakeSplit.stakeFreebet;
        const oddMudou = oddFinal !== aposta.odd_final;
        const bookmakerMudou = bookmakerId !== aposta.bookmaker_id;
        const houveMudancaFinanceira = resultadoMudou || stakeMudou || oddMudou || bookmakerMudou;

        // Campos suplementares que o RPC não cobre
        const camposSuplementares = {
            selecoes: selecoesFormatadas,
            tipo_multipla: tipoMultipla,
            retorno_potencial: retornoPotencial,
            lucro_prejuizo: lucroPrejuizo,
            valor_retorno: valorRetorno,
            resultado: resultadoFinal,
            status: resultadoFinal === "PENDENTE" ? "PENDENTE" : "LIQUIDADA",
            odd_final: oddFinal,
            boost_percentual: apostaData.boost_percentual,
            fonte_entrada: apostaData.fonte_entrada,
            data_aposta: apostaData.data_aposta,
            observacoes: apostaData.observacoes,
            estrategia: apostaData.estrategia,
            forma_registro: apostaData.forma_registro,
            contexto_operacional: apostaData.contexto_operacional,
             usar_freebet: apostaData.usar_freebet,
             fonte_saldo: apostaData.fonte_saldo,
            tipo_freebet: apostaData.tipo_freebet,
             stake_real: apostaData.stake_real,
             stake_freebet: apostaData.stake_freebet,
             stake_total: apostaData.stake_total,
            gerou_freebet: apostaData.gerou_freebet,
            valor_freebet_gerada: apostaData.valor_freebet_gerada,
            moeda_operacao: apostaData.moeda_operacao,
            cotacao_snapshot: apostaData.cotacao_snapshot,
            valor_brl_referencia: apostaData.valor_brl_referencia,
        };

        // Determinar tipo de transição
        const eraLiquidada = resultadoAnterior !== "PENDENTE" && resultadoAnterior !== null;
        const seraLiquidada = resultadoFinal !== "PENDENTE";

        // CASO 1: LIQUIDADA → PENDENTE (reverter)
        if (resultadoMudou && eraLiquidada && !seraLiquidada) {
          await supabase.rpc('reverter_liquidacao_v4', { p_aposta_id: aposta.id });
          await supabase.from("apostas_unificada").update({
            ...apostaData,
            resultado: "PENDENTE",
            status: "PENDENTE",
            lucro_prejuizo: null,
            valor_retorno: null,
          }).eq("id", aposta.id);
        }
        // CASO 2: PENDENTE → LIQUIDADA (primeira liquidação)
        else if (resultadoMudou && !eraLiquidada && seraLiquidada) {
          // Atualizar metadados ANTES de liquidar (stake, odd, bookmaker podem ter mudado)
          if (stakeMudou || oddMudou || bookmakerMudou) {
            await supabase.from("apostas_unificada").update({
              ...apostaData,
              resultado: "PENDENTE",
              status: "PENDENTE",
            }).eq("id", aposta.id);
          }
          // Liquidar via motor v7 (gera financial_events corretamente)
          const liquidResult = await liquidarAposta({
            id: aposta.id,
            resultado: resultadoFinal as any,
            lucro_prejuizo: lucroPrejuizo != null && lucroPrejuizo !== 0 ? lucroPrejuizo : undefined,
          });
          if (!liquidResult.success) {
            console.error("[ApostaMultiplaDialog] Erro ao liquidar:", liquidResult.error);
            throw new Error(liquidResult.error?.message || 'Erro ao liquidar aposta');
          }
          // Atualizar campos suplementares
          await supabase.from("apostas_unificada").update(camposSuplementares).eq("id", aposta.id);
        }
        // CASO 3: LIQUIDADA → LIQUIDADA (reliquidação) ou mudança de stake/odd
        else if (eraLiquidada && houveMudancaFinanceira) {
          console.log("[ApostaMultiplaDialog] Edição financeira via RPC atômico:", {
            stakeMudou: stakeMudou ? `${aposta.stake} → ${stakeNum}` : false,
            oddMudou: oddMudou ? `${aposta.odd_final} → ${oddFinal}` : false,
            bookmakerMudou: bookmakerMudou ? `${aposta.bookmaker_id} → ${bookmakerId}` : false,
            resultadoMudou: resultadoMudou ? `${resultadoAnterior} → ${resultadoFinal}` : false,
          });
          
          const { data: rpcResult, error: rpcError } = await supabase.rpc(
            'atualizar_aposta_liquidada_atomica_v2',
            {
              p_aposta_id: aposta.id,
              p_novo_bookmaker_id: bookmakerMudou ? bookmakerId : null,
               p_novo_stake: stakeMudou ? stakeSplit.stakeTotal : null,
              p_nova_odd: oddMudou ? oddFinalParaSalvar : null,
              p_novo_resultado: resultadoMudou && resultadoFinal !== "PENDENTE" ? resultadoFinal : null,
              p_nova_moeda: null,
              p_lucro_prejuizo: lucroPrejuizo,
            }
          );
          
          if (rpcError) {
            console.error("[ApostaMultiplaDialog] Erro no RPC:", rpcError);
            throw new Error(`Erro ao atualizar aposta: ${rpcError.message}`);
          }
          
          const result = rpcResult as { success: boolean; error?: string };
          if (!result.success) {
            throw new Error(result.error || 'Erro desconhecido ao atualizar aposta');
          }

          // Atualizar campos suplementares
          await supabase.from("apostas_unificada").update(camposSuplementares).eq("id", aposta.id);
        }
        // CASO 4: Mudança de stake/odd/bookmaker em aposta PENDENTE (sem liquidação)
        else if (!eraLiquidada && houveMudancaFinanceira) {
          await supabase.from("apostas_unificada").update({
            ...apostaData,
          }).eq("id", aposta.id);
        }
        // CASO 5: Sem mudança financeira - update direto de metadados
        else {
          const { error } = await supabase.from("apostas_unificada").update({
            ...apostaData,
          }).eq("id", aposta.id);
          if (error) throw error;
        }

        // Invalidar saldos após qualquer edição financeira
        await invalidateSaldos(projetoId);
        invalidateCanonicalCaches(queryClient, projetoId);

        // Registrar freebet gerada (se mudou de não-gerou para gerou)
        if (gerouFreebet && valorFreebetGerada && !aposta.gerou_freebet) {
          await registrarFreebetGerada(
            bookmakerId,
            parseFloat(valorFreebetGerada),
            user.id,
            aposta.id, // Passar o ID da aposta sendo editada
            resultadoFinal // Passar o resultado para determinar status
          );
        }

        // Verificar se resultado mudou e atualizar status da freebet
        if (aposta.gerou_freebet) {
          // Caso 1: PENDENTE → resultado final
          if (resultadoAnterior === "PENDENTE" && resultadoFinal !== "PENDENTE") {
            // VOID = não libera, qualquer outro resultado (GREEN, RED, MEIO_GREEN, MEIO_RED) = libera
            if (resultadoFinal === "VOID") {
              await recusarFreebetPendente(aposta.id);
            } else {
              await liberarFreebetPendente(aposta.id);
            }
          }
          // Caso 2: resultado final → PENDENTE (reversão)
          else if (resultadoAnterior !== "PENDENTE" && resultadoAnterior !== null && resultadoFinal === "PENDENTE") {
            await reverterFreebetParaPendente(aposta.id);
          }
          // Caso 3: resultado final (não-VOID) → VOID
          else if (resultadoAnterior !== "PENDENTE" && resultadoAnterior !== "VOID" && resultadoAnterior !== null && resultadoFinal === "VOID") {
            // Freebet já estava LIBERADA, precisa reverter para NAO_LIBERADA
            const { data: freebetLiberada } = await supabase
              .from("freebets_recebidas")
              .select("id, bookmaker_id, valor")
              .eq("aposta_multipla_id", aposta.id)
              .eq("status", "LIBERADA")
              .maybeSingle();

            if (freebetLiberada) {
              // Usar ledger para estornar
               // Usar ledger para estornar
              await estornarFreebetViaLedger(
                freebetLiberada.bookmaker_id,
                freebetLiberada.valor,
                'Freebet revogada por resultado VOID (múltipla)'
              );

              // Mudar status para NAO_LIBERADA
              await supabase
                .from("freebets_recebidas")
                .update({ status: "NAO_LIBERADA" })
                .eq("id", freebetLiberada.id);
            }
          }
        }
      } else {
        // ========== USAR criarAposta DO SERVIÇO CENTRALIZADO ==========
        // Multi-moeda: determinar moeda da operação e snapshot de cotação
        // REGRA UNIFICADA: USD usa cotacaoUsdFormulario (Trabalho > PTAX), outras moedas usam exchangeRates
        const moedaOp = bookmakerSaldo?.moeda || 'BRL';
        const isForeign = isForeignCurrency(moedaOp);
        const cotacaoSnap = isForeign
          ? (moedaOp === 'USD' ? cotacaoUsdFormulario : (exchangeRates ? exchangeRates.getRate(moedaOp) : null))
          : null;
        const valorBrlRef = isForeign && cotacaoSnap ? stakeNum * cotacaoSnap : null;

        const boostVal = parseFloat(boostPercent);
        const result = await criarAposta({
          projeto_id: projetoId,
          workspace_id: workspaceId,
          user_id: user.id,
          forma_registro: 'MULTIPLA',
          estrategia: registroValues.estrategia as any,
          contexto_operacional: registroValues.contexto_operacional as any,
          fonte_saldo: stakeSplit.usesFreebet ? 'FREEBET' : (registroValues.fonte_saldo || 'REAL'),
          usar_freebet: stakeSplit.usesFreebet,
          data_aposta: toLocalTimestamp(dataAposta),
          bookmaker_id: bookmakerId,
          stake: stakeSplit.stakeTotal,
          stake_real: stakeSplit.stakeReal,
          stake_freebet: stakeSplit.stakeFreebet,
          stake_total: stakeSplit.stakeTotal,
          tipo_multipla: tipoMultipla,
          selecoes: selecoesFormatadas as SelecaoMultipla[],
          odd_final: oddFinal,
          retorno_potencial: retornoPotencial,
          tipo_freebet: stakeSplit.usesFreebet ? "freebet_snr" : null,
          gerou_freebet: false,
          valor_freebet_gerada: null,
          observacoes: observacoes || null,
          // Multi-moeda
          moeda_operacao: moedaOp,
          cotacao_snapshot: cotacaoSnap,
          valor_brl_referencia: valorBrlRef,
          // Boost e fonte
          boost_percentual: !isNaN(boostVal) && boostVal > 0 ? boostVal : null,
          fonte_entrada: registroValues.estrategia === 'VALUEBET' ? (fonteEntrada || 'Manual') : null,
        });

        if (!result.success) {
          throw new Error(result.error?.message || "Erro ao criar aposta múltipla");
        }

        // ========== CRIAÇÃO VIA MOTOR v7 ==========
        // NOTA: O ApostaService.criarAposta já cria a aposta com status PENDENTE.
        // Se o usuário selecionou um resultado final (GREEN/RED), precisamos liquidar após criar.
        
        const novaApostaId = result.data?.id;

        // Se resultado não é PENDENTE, liquidar via motor v7
        if (novaApostaId && resultadoFinal && resultadoFinal !== "PENDENTE") {
          // CRÍTICO: Antes de liquidar, atualizar odd_final para oddFinalReal (considera VOID=1)
          // e salvar lucro/retorno calculados pelo previewCalculo (que usa fatores por perna)
          // Sem isso, a RPC usa odd_final nominal e calcula P/L errado para MEIO_GREEN/MEIO_RED
          if (oddFinalParaSalvar !== oddFinal || lucroPrejuizo != null) {
            await supabase.from("apostas_unificada").update({
              odd_final: oddFinalParaSalvar,
              lucro_prejuizo: lucroPrejuizo,
              valor_retorno: valorRetorno,
              retorno_potencial: retornoPotencial,
            }).eq("id", novaApostaId);
          }

          const liquidResult = await liquidarAposta({
            id: novaApostaId,
            resultado: resultadoFinal as any,
            lucro_prejuizo: lucroPrejuizo != null && lucroPrejuizo !== 0 ? lucroPrejuizo : undefined,
          });
          
          if (!liquidResult.success) {
            console.error("[ApostaMultiplaDialog] Erro ao liquidar nova aposta:", liquidResult.error);
            // Não lançar exceção - a aposta já foi criada
          }
        }

        // Registrar freebet gerada com ID da aposta e resultado
        if (gerouFreebet && valorFreebetGerada && novaApostaId) {
          await registrarFreebetGerada(
            bookmakerId,
            parseFloat(valorFreebetGerada),
            user.id,
            novaApostaId,
            resultadoFinal // Passar resultado para determinar status (PENDENTE ou GREEN)
          );
        }
      }

      invalidateCanonicalCaches(queryClient, projetoId);
      onSuccess('save');
      if (!embedded) onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao salvar aposta: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // ========== FUNÇÕES DE SALDO REMOVIDAS - MOTOR v7 ==========
  // debitarSaldo e creditarRetorno foram removidas.
  // Toda movimentação financeira agora passa exclusivamente por:
  // - liquidarAposta() para liquidar apostas pendentes
  // - reliquidarAposta() para mudar resultado de apostas já liquidadas
  // - deletarAposta() para excluir apostas (reverte automaticamente)
  //
  // Isso garante que TODOS os movimentos são registrados no ledger (financial_events)
  // e o saldo é atualizado de forma atômica via RPCs v4.

  // REGRA CRÍTICA: Freebet NÃO tem moeda própria - herda da bookmaker onde foi gerada
  const registrarFreebetGerada = async (
    bkId: string,
    valor: number,
    userId: string,
    apostaMultiplaId?: string,
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
        .eq("id", bkId)
        .maybeSingle();

      const moedaOperacao = bookmaker?.moeda || "BRL";

      // MIGRADO PARA LEDGER: Só creditar saldo_freebet se a freebet for liberada
       if (status === "LIBERADA") {
        await creditarFreebetViaLedger(bkId, valor, 'APOSTA_MULTIPLA_QUALIFICADORA', { descricao: 'Freebet de aposta múltipla qualificadora' });
      }

      // Registrar na tabela freebets_recebidas com status e MOEDA da bookmaker
      await supabase.from("freebets_recebidas").insert({
        bookmaker_id: bkId,
        projeto_id: projetoId,
        user_id: userId,
        workspace_id: workspaceId,
        valor: valor,
        moeda_operacao: moedaOperacao, // CRÍTICO: herda moeda da bookmaker
        motivo: "Gerada por aposta múltipla",
        origem: "QUALIFICADORA",
        qualificadora_id: apostaMultiplaId || null,
        data_recebida: new Date().toISOString(),
        utilizada: false,
        aposta_multipla_id: apostaMultiplaId || null,
        status: status,
      });
    } catch (error) {
      console.error("Erro ao registrar freebet gerada:", error);
    }
  };

  // Função para liberar freebet pendente quando aposta é liquidada (GREEN, RED)
  const liberarFreebetPendente = async (apostaMultiplaId: string) => {
    try {
      // Buscar freebet pendente associada a esta aposta
      const { data: freebetPendente } = await supabase
        .from("freebets_recebidas")
        .select("id, bookmaker_id, valor")
        .eq("aposta_multipla_id", apostaMultiplaId)
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
        await creditarFreebetViaLedger(freebetPendente.bookmaker_id, freebetPendente.valor, 'LIBERACAO_PENDENTE', { descricao: 'Freebet liberada após liquidação de aposta múltipla' });
      }
    } catch (error) {
      console.error("Erro ao liberar freebet pendente:", error);
    }
  };

  // Função para recusar freebet quando aposta muda para VOID (única circunstância que não libera)
  const recusarFreebetPendente = async (apostaMultiplaId: string) => {
    try {
      await supabase
        .from("freebets_recebidas")
        .update({ status: "NAO_LIBERADA" })
        .eq("aposta_multipla_id", apostaMultiplaId)
        .eq("status", "PENDENTE");
    } catch (error) {
      console.error("Erro ao recusar freebet pendente:", error);
    }
  };

  // Função para reverter freebet LIBERADA de volta para PENDENTE quando aposta volta para PENDENTE
  const reverterFreebetParaPendente = async (apostaMultiplaId: string) => {
    try {
      // Buscar freebet LIBERADA associada a esta aposta
      const { data: freebetLiberada } = await supabase
        .from("freebets_recebidas")
        .select("id, bookmaker_id, valor")
        .eq("aposta_multipla_id", apostaMultiplaId)
        .eq("status", "LIBERADA")
        .maybeSingle();

      if (freebetLiberada) {
        // MIGRADO PARA LEDGER: Estornar via RPC atômica
         // MIGRADO PARA LEDGER: Estornar via RPC atômica
        await estornarFreebetViaLedger(
          freebetLiberada.bookmaker_id, 
          freebetLiberada.valor, 
          'Reversão para PENDENTE (aposta múltipla reaberta)'
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

  // ========== atualizarSaldosBookmaker REMOVIDA - MOTOR v7 ==========
  // Esta função foi removida pois toda atualização de saldo agora passa
  // exclusivamente pelo motor de eventos v7 (reliquidarAposta/liquidarAposta).
  // O fluxo correto para edição de aposta com mudança de resultado é:
  // 1. Atualizar dados não-financeiros via update direto

  const handleDelete = async () => {
    if (!aposta) return;

    try {
      setLoading(true);

      // Exclusão centralizada (reversão → VOID → delete) para recompor saldo corretamente
      const result = await deletarAposta(aposta.id);
      if (!result.success) throw new Error(result.error?.message || 'Falha ao excluir');

      // CRÍTICO: Invalidar saldos imediatamente após exclusão
      // Garante que o "Saldo Operável" no formulário reflita o valor atualizado
      invalidateSaldos(projetoId);
      invalidateCanonicalCaches(queryClient, projetoId);
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
        console.warn("[ApostaMultiplaDialog] BroadcastChannel não disponível:", e);
      }

      toast.success("Aposta múltipla excluída!");
      setDeleteDialogOpen(false);
      onSuccess('delete');
      if (!embedded) onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao excluir: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const innerContent = (
    <>
          {/* Wrapper for drag events */}
          <div
            className={isDragging ? 'ring-2 ring-primary ring-offset-2' : ''}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
          {/* HEADER UNIFICADO */}
          <BetFormHeader
            formType="multipla"
            estrategia={registroValues.estrategia}
            contexto={registroValues.contexto_operacional || 'NORMAL'}
            onEstrategiaChange={(v) => setRegistroValues(prev => ({ ...prev, estrategia: v }))}
            onContextoChange={(v) => setRegistroValues(prev => ({ ...prev, contexto_operacional: v }))}
            isEditing={!!aposta}
            activeTab={activeTab}
            lockedEstrategia={!aposta && isAbaEstrategiaFixa(activeTab) ? getEstrategiaFromTab(activeTab) : null}
            showImport={!aposta}
            onImportClick={() => fileInputRef.current?.click()}
            isPrintProcessing={isPrintProcessing}
            fileInputRef={fileInputRef}
            onFileSelect={handleFileSelect}
            showCloseButton={!embedded}
            onClose={() => onOpenChange(false)}
            embedded={embedded}
            fonteSaldo={null}
            extraBadge={
              printImagePreview && !isPrintProcessing && (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-primary/10 rounded text-xs">
                  <CheckCircle2 className="h-3 w-3 text-primary" />
                  <span className="text-primary font-medium">
                    {printParsedData?.selecoes?.length || 0} seleções
                  </span>
                  <button 
                    onClick={clearPrintData}
                    className="ml-1 text-muted-foreground hover:text-foreground"
                  >
                    ✕
                  </button>
                </div>
              )
            }
            extraHeaderContent={null}
          />

          <div className="space-y-1.5 py-1.5 px-3">

            {/* Fonte da Entrada - só aparece para ValueBet */}
            {registroValues.estrategia === 'VALUEBET' && (
              <FonteEntradaSelector
                workspaceId={workspaceId}
                value={fonteEntrada}
                onChange={setFonteEntrada}
              />
            )}

            {/* Tipo de Múltipla + Casa na mesma linha */}
            <div className="grid grid-cols-[1fr_1fr] gap-2">
              <div className="space-y-0.5">
                <Label className="text-[10px] text-muted-foreground font-normal uppercase tracking-wider">Tipo de Múltipla</Label>
                <Select value={tipoMultipla} onValueChange={(v) => setTipoMultipla(v as TipoMultipla)}>
                  <SelectTrigger className="h-8 text-xs font-semibold border-primary/30 bg-primary/5 justify-center [&>svg]:ml-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="min-w-[180px]">
                    <SelectItem value="DUPLA">
                      <span className="flex items-center justify-between w-full gap-3">
                        <span>Dupla</span>
                        <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">2</span>
                      </span>
                    </SelectItem>
                    <SelectItem value="TRIPLA">
                      <span className="flex items-center justify-between w-full gap-3">
                        <span>Tripla</span>
                        <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">3</span>
                      </span>
                    </SelectItem>
                    <SelectItem value="QUADRUPLA">
                      <span className="flex items-center justify-between w-full gap-3">
                        <span>Quádrupla</span>
                        <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">4</span>
                      </span>
                    </SelectItem>
                    <SelectItem value="QUINTUPLA">
                      <span className="flex items-center justify-between w-full gap-3">
                        <span>Quíntupla</span>
                        <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">5</span>
                      </span>
                    </SelectItem>
                    <SelectItem value="SEXTUPLA">
                      <span className="flex items-center justify-between w-full gap-3">
                        <span>Sêxtupla</span>
                        <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">6</span>
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Casa */}
              <div className="space-y-0.5">
                <Label className="text-[10px] text-muted-foreground font-normal uppercase tracking-wider">Casa</Label>
                <Select value={bookmakerId} onValueChange={setBookmakerId}>
                  <SelectTrigger className="h-8 text-xs font-medium border-border/50">
                    {(() => {
                      const selectedBk = bookmakerId ? bookmakers.find(b => b.id === bookmakerId) : null;
                      if (selectedBk) {
                        return (
                          <div className="flex items-center gap-1.5 w-full min-w-0 justify-center">
                            {selectedBk.logo_url && (
                              <img src={selectedBk.logo_url} alt="" className="h-4 w-4 rounded object-contain flex-shrink-0" />
                            )}
                            <span className="uppercase text-[11px] font-medium truncate">{selectedBk.nome}</span>
                            {selectedBk.instance_identifier && (
                              <span className="text-[10px] text-primary font-medium truncate normal-case">{selectedBk.instance_identifier}</span>
                            )}
                            <CurrencyBadge moeda={selectedBk.moeda} size="xs" />
                          </div>
                        );
                      }
                      return <SelectValue placeholder="Selecione..." />;
                    })()}
                  </SelectTrigger>
                  <BookmakerSearchableSelectContent
                    bookmakers={bookmakers.map(bk => ({
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
                    }))}
                    className="z-50 w-[var(--radix-select-trigger-width)] min-w-[300px]"
                  />
                </Select>
              </div>
            </div>
            {/* Saldo breakdown - full width */}
            {bookmakerSaldo && (
              <SaldoBreakdownDisplay
                saldoReal={bookmakerSaldo.saldo}
                saldoFreebet={bookmakerSaldo.saldoFreebet}
                saldoBonus={bookmakerSaldo.saldoBonus}
                saldoOperavel={bookmakerSaldo.saldoOperavel}
                moeda={bookmakerSaldo.moeda}
              />
            )}
            {/* Toggle Usar Freebet */}
            {bookmakerSaldo &&
              bookmakerSaldo.saldoFreebet > 0 &&
              !aposta?.gerou_freebet && (
                <FreebetToggle
                  checked={usarFreebet}
                  onCheckedChange={(checked) => {
                    setUsarFreebet(checked);
                    if (checked) {
                      setGerouFreebet(false);
                      setValorFreebetGerada("");
                    }
                  }}
                  saldoFreebet={bookmakerSaldo.saldoFreebet}
                  moeda={bookmakerSaldo.moeda}
                  disabled={!!aposta?.tipo_freebet}
                  valorFreebet={valorFreebetUsar}
                  onValorFreebetChange={setValorFreebetUsar}
                />
              )}

            {/* Seleções */}
            <div className="space-y-0.5">
              <Label className="text-[10px] text-muted-foreground font-normal uppercase tracking-wider">Seleções</Label>
              <div className="space-y-1">
                {selecoes.map((selecao, index) => (
                  <div 
                    key={index}
                    className={`flex items-center gap-1 px-1.5 py-1 rounded border transition-colors ${
                      selecao.resultado === "GREEN" ? "bg-emerald-500/10 border-emerald-500/30" :
                      selecao.resultado === "RED" ? "bg-red-500/10 border-red-500/30" :
                      selecao.resultado === "MEIO_GREEN" ? "bg-emerald-500/5 border-emerald-500/20" :
                      selecao.resultado === "MEIO_RED" ? "bg-red-500/5 border-red-500/20" :
                      selecao.resultado === "VOID" ? "bg-muted/50 border-muted-foreground/20" :
                      "border-border/30"
                    }`}
                  >
                    <span className="text-[9px] font-bold text-muted-foreground w-3 shrink-0 text-center">{index + 1}</span>
                    <Input
                      placeholder="Evento - Seleção"
                      value={selecao.descricao}
                      onChange={(e) => handleSelecaoChange(index, "descricao", e.target.value)}
                      className="uppercase text-[11px] h-6 flex-1 min-w-0 border-0 bg-transparent px-1 focus-visible:ring-0 shadow-none"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Odd"
                      value={selecao.odd}
                      onChange={(e) => handleSelecaoChange(index, "odd", e.target.value)}
                      className="text-[11px] h-6 w-[52px] shrink-0 text-center font-semibold border-border/30"
                    />
                    <Select 
                      value={selecao.resultado || "PENDENTE"} 
                      onValueChange={(v) => handleSelecaoChange(index, "resultado", v)}
                    >
                      <SelectTrigger className="w-[70px] h-6 text-[9px] shrink-0 border-0 bg-muted/40 px-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PENDENTE">Pendente</SelectItem>
                        <SelectItem value="GREEN">Green</SelectItem>
                        <SelectItem value="MEIO_GREEN">½ Green</SelectItem>
                        <SelectItem value="RED">Red</SelectItem>
                        <SelectItem value="MEIO_RED">½ Red</SelectItem>
                        <SelectItem value="VOID">Void</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview compacto */}
            <div className="flex items-center justify-between px-2 py-1 rounded bg-muted/30 border border-border/20">
              <div className="flex items-center gap-2">
                <Badge className={`text-[9px] px-1.5 py-0 h-4 ${
                  previewCalculo.resultado === "GREEN" ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400" :
                  previewCalculo.resultado === "RED" ? "bg-red-500/20 text-red-700 dark:text-red-400" :
                  previewCalculo.resultado === "MEIO_GREEN" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" :
                  previewCalculo.resultado === "MEIO_RED" ? "bg-red-500/10 text-red-600 dark:text-red-300" :
                  previewCalculo.resultado === "VOID" ? "bg-gray-500/20 text-gray-600 dark:text-gray-400" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {previewCalculo.resultado === "MEIO_GREEN" ? "½ GREEN" :
                   previewCalculo.resultado === "MEIO_RED" ? "½ RED" :
                   previewCalculo.resultado}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-[10px]">
                <span className="text-muted-foreground">Retorno: <span className="text-foreground font-medium">{formatCurrency(previewCalculo.retorno)}</span></span>
                <span className={`font-semibold ${previewCalculo.lucro >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                  P/L: {previewCalculo.lucro >= 0 ? "+" : ""}{formatCurrency(previewCalculo.lucro)}
                </span>
              </div>
            </div>

            {/* Stake + Boost + Odd Final + Retorno — grid 2x2 */}
            <div className="grid grid-cols-2 gap-x-2 gap-y-1">
              <div className="space-y-0.5">
                <Label className="text-[10px] text-muted-foreground">Stake ({bookmakerSaldo?.moeda || 'R$'}) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px] text-muted-foreground">Boost %</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="0"
                  value={boostPercent}
                  onChange={(e) => setBoostPercent(e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px] text-muted-foreground">Odd Final{boostMultiplier > 1 ? ' 🚀' : ''}</Label>
                <Input
                  value={oddFinal > 0 ? oddFinal.toFixed(3) : "-"}
                  disabled
                  className={`bg-muted/50 h-7 text-xs ${boostMultiplier > 1 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : ''}`}
                />
                {boostMultiplier > 1 && oddFinalSemBoost > 0 && (
                  <p className="text-[8px] text-muted-foreground">
                    {oddFinalSemBoost.toFixed(3)} → +{boostPercent}%
                  </p>
                )}
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px] text-muted-foreground">Retorno</Label>
                <Input
                  value={retornoPotencial > 0 ? formatCurrency(retornoPotencial) : "-"}
                  disabled
                  className="bg-muted/50 h-7 text-xs"
                />
              </div>
            </div>

            {/* Resultado calculado (quando não pendente) */}
            {resultadoCalculado !== "PENDENTE" && (
              <div className={`flex items-center justify-between px-2 py-1.5 rounded border ${
                resultadoCalculado === "GREEN" ? "bg-emerald-500/10 border-emerald-500/30" :
                resultadoCalculado === "MEIO_GREEN" ? "bg-emerald-500/5 border-emerald-500/20" :
                resultadoCalculado === "RED" ? "bg-red-500/10 border-red-500/30" :
                resultadoCalculado === "MEIO_RED" ? "bg-red-500/5 border-red-500/20" :
                "bg-gray-500/10 border-gray-500/30"
              }`}>
                <span className="text-xs text-muted-foreground">Resultado:</span>
                <Badge className={`text-[10px] ${
                  resultadoCalculado === "GREEN" ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400" :
                  resultadoCalculado === "MEIO_GREEN" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" :
                  resultadoCalculado === "RED" ? "bg-red-500/20 text-red-700 dark:text-red-400" :
                  resultadoCalculado === "MEIO_RED" ? "bg-red-500/10 text-red-600 dark:text-red-300" :
                  "bg-gray-500/20 text-gray-600 dark:text-gray-400"
                }`}>
                  {resultadoCalculado === "MEIO_GREEN" ? "½ GREEN" : 
                   resultadoCalculado === "MEIO_RED" ? "½ RED" : 
                   resultadoCalculado}
                </Badge>
                {(resultadoCalculado === "GREEN" || resultadoCalculado === "MEIO_GREEN") && oddFinalReal !== oddFinal && (
                  <span className="text-[10px] text-muted-foreground">Odd ajust.: <span className="font-medium text-foreground">{oddFinalReal.toFixed(3)}</span></span>
                )}
              </div>
            )}


            {/* Resultado da Múltipla */}
            <div className="space-y-0.5">
              <Label className="text-[10px] text-muted-foreground font-normal uppercase tracking-wider">Resultado da Múltipla</Label>
              <Select 
                value={resultadoCalculado} 
                onValueChange={(v) => {
                  if (hasPerLegResults) return; // Locked — per-leg drives result
                  
                  if (v === "PENDENTE") {
                    setResultadoManual(null);
                    // Reset all legs to PENDENTE
                    setSelecoes(prev => prev.map(s => ({ ...s, resultado: "PENDENTE" as const })));
                  } else {
                    setResultadoManual(v);
                    // Apply result to ALL legs (shortcut)
                    const typedResult = v as Selecao['resultado'];
                    setSelecoes(prev => prev.map(s => ({ ...s, resultado: typedResult })));
                  }
                }}
                disabled={hasPerLegResults}
              >
                <SelectTrigger className={`h-7 text-xs ${hasPerLegResults ? 'opacity-70' : ''}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDENTE">Pendente</SelectItem>
                  <SelectItem value="GREEN">Green</SelectItem>
                  <SelectItem value="MEIO_GREEN">Meio Green</SelectItem>
                  <SelectItem value="RED">Red</SelectItem>
                  <SelectItem value="MEIO_RED">Meio Red</SelectItem>
                  <SelectItem value="VOID">Void</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[9px] text-muted-foreground">
                {hasPerLegResults 
                  ? "🔒 Calculado pelas seleções individuais"
                  : resultadoManual 
                    ? "Aplicado a todas as seleções"
                    : "Edite as seleções ou escolha aqui"
                }
              </p>
            </div>

            {/* Timestamp discreto */}
            <p className="text-[9px] text-muted-foreground text-right">
              {dataAposta ? new Date(dataAposta).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-1.5 px-3 pb-3 pt-1">
            {aposta && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={loading}
                className="sm:mr-auto h-7 text-xs"
              >
                <Trash2 className="mr-1 h-3 w-3" />
                Excluir
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="h-7 text-xs"
            >
              Cancelar
            </Button>
            {podeSalvarRascunho && (
              <Button 
                variant="secondary"
                size="sm"
                onClick={handleSalvarRascunho}
                disabled={loading}
                className="h-7 text-xs"
              >
                <FileText className="h-3 w-3 mr-1" />
                Rascunho
              </Button>
            )}
            <Button type="button" size="sm" onClick={handleSubmit} disabled={loading || !canSave} className="h-7 text-xs">
              {loading ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Save className="mr-1 h-3 w-3" />
              )}
              Salvar
            </Button>
          </DialogFooter>
          </div>
    </>
  );

  // Embedded mode: render content directly without Dialog wrapper
  if (embedded) {
    return (
      <>
        <div className="p-0">
          {innerContent}
        </div>

        {/* Delete Confirmation */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir aposta múltipla?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. A aposta será removida
                permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent 
          className={`max-w-[480px] w-[95vw] max-h-[90vh] overflow-y-auto p-0 ${isDragging ? 'ring-2 ring-primary ring-offset-2' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          {innerContent}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir aposta múltipla?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A aposta será removida
              permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
