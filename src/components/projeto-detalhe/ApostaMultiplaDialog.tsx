import { useState, useEffect, useMemo, useRef, useCallback } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useBookmakerSaldosQuery, useInvalidateBookmakerSaldos, type BookmakerSaldo } from "@/hooks/useBookmakerSaldosQuery";
import { criarAposta, deletarAposta, liquidarAposta, reliquidarAposta, type SelecaoMultipla } from "@/services/aposta";
import { creditarFreebetViaLedger, estornarFreebetViaLedger } from "@/lib/freebetLedgerService";
import { useExchangeRatesSafe } from "@/contexts/ExchangeRatesContext";
import { isForeignCurrency } from "@/types/currency";
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
import { toLocalTimestamp, validarDataAposta } from "@/utils/dateUtils";
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

interface Selecao {
  descricao: string;
  odd: string;
  resultado?: "PENDENTE" | "GREEN" | "RED" | "MEIO_GREEN" | "MEIO_RED" | "VOID";
}

interface ApostaMultipla {
  id: string;
  tipo_multipla: string;
  stake: number;
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
}

// Interface de Bookmaker local (mapeada do hook canônico)
interface Bookmaker {
  id: string;
  nome: string;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  saldo_atual: number;
  saldo_freebet: number;
  saldo_bonus: number;
  saldo_operavel: number;
  moeda: string;
  logo_url: string | null;
  bonus_rollover_started?: boolean;
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
  const exchangeRates = useExchangeRatesSafe();
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
  
  // Mapear saldos canônicos para formato local (retrocompatibilidade)
  const bookmakers = useMemo((): Bookmaker[] => {
    return bookmakerSaldos.map(bk => ({
      id: bk.id,
      nome: bk.nome,
      parceiro_id: bk.parceiro_id,
      parceiro_nome: bk.parceiro_nome,
      saldo_atual: bk.saldo_real,
      saldo_freebet: bk.saldo_freebet,
      saldo_bonus: bk.saldo_bonus,
      saldo_operavel: bk.saldo_operavel,
      moeda: bk.moeda,
      logo_url: bk.logo_url,
      bonus_rollover_started: bk.bonus_rollover_started
    }));
  }, [bookmakerSaldos]);

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
  const [tipoMultipla, setTipoMultipla] = useState<"DUPLA" | "TRIPLA">("DUPLA");
  const [stake, setStake] = useState("");
  const [resultadoManual, setResultadoManual] = useState<string | null>(null);
  const [statusResultado, setStatusResultado] = useState("PENDENTE");
  const [dataAposta, setDataAposta] = useState("");
  const [observacoes, setObservacoes] = useState("");

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

  // Freebet state
  const [usarFreebet, setUsarFreebet] = useState(false);
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
      setBookmakerId(aposta.bookmaker_id);
      setTipoMultipla(aposta.tipo_multipla as "DUPLA" | "TRIPLA");
      setStake(aposta.stake.toString());
      setStatusResultado(aposta.resultado || "PENDENTE");
      setDataAposta(aposta.data_aposta.slice(0, 16));
      setObservacoes(aposta.observacoes || "");

      // Restaurar campos de registro (incluindo fonte_saldo)
      const suggestions = getSuggestionsForTab(activeTab);
      setRegistroValues({
        forma_registro: (aposta.forma_registro as FormaRegistro) || "MULTIPLA",
        estrategia: (aposta.estrategia as ApostaEstrategia) || (suggestions.estrategia || (defaultEstrategia as ApostaEstrategia)),
        contexto_operacional: (aposta.contexto_operacional as ContextoOperacional) || (suggestions.contexto_operacional || "NORMAL"),
        fonte_saldo: ((aposta as any).fonte_saldo as FonteSaldo) || 'REAL', // Legado: default REAL
      });

      // Parse selecoes from JSONB
      const parsedSelecoes = aposta.selecoes || [];
      if (parsedSelecoes.length > 0) {
        setSelecoes(
          parsedSelecoes.map((s: any) => ({
            descricao: s.descricao || "",
            odd: s.odd?.toString() || "",
            resultado: s.resultado || "PENDENTE",
          }))
        );
      }

      // Freebet
      if (aposta.tipo_freebet && aposta.tipo_freebet !== "normal") {
        setUsarFreebet(true);
      } else {
        setUsarFreebet(false);
      }
      setGerouFreebet(aposta.gerou_freebet || false);
      setValorFreebetGerada(aposta.valor_freebet_gerada?.toString() || "");
      
      // Verificar se o resultado salvo é diferente do calculado automaticamente
      // Se for, significa que foi um resultado manual
      const savedResultado = aposta.resultado || "PENDENTE";
      // Vamos verificar depois que as seleções forem carregadas
      setTimeout(() => {
        // Se o resultado salvo for MEIO_GREEN ou MEIO_RED, é certamente manual
        if (savedResultado === "MEIO_GREEN" || savedResultado === "MEIO_RED") {
          setResultadoManual(savedResultado);
        } else {
          setResultadoManual(null);
        }
      }, 100);
    } else if (rascunho && rascunho.tipo === 'MULTIPLA' && open && !aposta) {
      // PRÉ-PREENCHER COM DADOS DO RASCUNHO
      setBookmakerId(rascunho.bookmaker_id || "");
      setTipoMultipla((rascunho.tipo_multipla as "DUPLA" | "TRIPLA") || "DUPLA");
      setStake(rascunho.stake?.toString() || "");
      setObservacoes(rascunho.observacoes || "");
      setDataAposta(getLocalDateTimeString());
      setStatusResultado("PENDENTE");
      
      // Preencher seleções
      if (rascunho.selecoes && rascunho.selecoes.length > 0) {
        const novasSelecoes: Selecao[] = rascunho.selecoes.map(sel => ({
          descricao: sel.descricao?.toUpperCase() || "",
          odd: sel.odd?.toString() || "",
          resultado: "PENDENTE" as const
        }));
        // Garantir número mínimo de seleções
        while (novasSelecoes.length < 2) {
          novasSelecoes.push({ descricao: "", odd: "", resultado: "PENDENTE" });
        }
        setSelecoes(novasSelecoes);
        
        // Ajustar tipo de múltipla baseado no número de seleções
        if (rascunho.selecoes.length >= 3) {
          setTipoMultipla("TRIPLA");
        }
      }
      
      setUsarFreebet(false);
      setGerouFreebet(false);
      setValorFreebetGerada("");
      setResultadoManual(null);
    }
  }, [aposta, open, rascunho]);

  // Atualizar número de seleções quando tipo muda
  useEffect(() => {
    const numSelecoes = tipoMultipla === "DUPLA" ? 2 : 3;
    setSelecoes((prev) => {
      if (prev.length === numSelecoes) return prev;
      if (prev.length < numSelecoes) {
        return [...prev, { descricao: "", odd: "", resultado: "PENDENTE" }];
      }
      return prev.slice(0, numSelecoes);
    });
  }, [tipoMultipla]);

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
    setResultadoManual(null);
    setStatusResultado("PENDENTE");
    setDataAposta(getLocalDateTimeString());
    setObservacoes("");
    setSelecoes([
      { descricao: "", odd: "", resultado: "PENDENTE" },
      { descricao: "", odd: "", resultado: "PENDENTE" },
    ]);
    setUsarFreebet(false);
    setGerouFreebet(false);
    setValorFreebetGerada("");
    setBookmakerSaldo(null);
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

  // Calcular odd final (produto das odds) - considerando VOIDs como odd 1.00
  const { oddFinal, oddFinalReal } = useMemo(() => {
    const selecoesValidas = selecoes.filter((s) => {
      const oddNum = parseFloat(s.odd);
      return !isNaN(oddNum) && oddNum > 0;
    });
    
    if (selecoesValidas.length === 0) return { oddFinal: 0, oddFinalReal: 0 };
    
    // Odd final nominal (todas as odds)
    const oddNominal = selecoesValidas.reduce((acc, s) => acc * parseFloat(s.odd), 1);
    
    // Odd final real (excluindo VOIDs que são tratados como 1.00)
    const oddReal = selecoesValidas.reduce((acc, s) => {
      if (s.resultado === "VOID") return acc * 1; // VOID = odd 1.00
      return acc * parseFloat(s.odd);
    }, 1);
    
    return { oddFinal: oddNominal, oddFinalReal: oddReal };
  }, [selecoes]);

  // Função hierárquica para calcular resultado da múltipla
  // Regras de prioridade: RED > MEIO_RED > all GREEN > MEIO_GREEN+GREEN > VOID > PENDENTE
  const calcularResultadoMultipla = useCallback((sels: Selecao[]): string => {
    const resultados = sels.map(s => s.resultado || "PENDENTE");
    
    // 1. Qualquer RED → RED
    if (resultados.includes("RED")) return "RED";
    
    // 2. Qualquer MEIO_RED (sem RED) → MEIO_RED
    if (resultados.includes("MEIO_RED")) return "MEIO_RED";
    
    // 3. Todas GREEN → GREEN
    if (resultados.every(r => r === "GREEN")) return "GREEN";
    
    // 4. Mix de GREEN + MEIO_GREEN (ou VOID) → MEIO_GREEN
    if (resultados.includes("MEIO_GREEN")) return "MEIO_GREEN";
    
    // 5. Todas VOID → VOID
    if (resultados.every(r => r === "VOID")) return "VOID";
    
    // 6. GREEN + VOID (sem pendente) → MEIO_GREEN
    const nonPendente = resultados.filter(r => r !== "PENDENTE");
    if (nonPendente.length === resultados.length && 
        nonPendente.every(r => r === "GREEN" || r === "VOID")) {
      return "MEIO_GREEN";
    }
    
    // 7. Default → PENDENTE
    return "PENDENTE";
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

    const retorno = stakeNum * fatorTotal;
    const lucro = usarFreebet
      ? retorno > stakeNum
        ? retorno - stakeNum
        : 0
      : retorno - stakeNum;

    // Usar regra hierárquica para resultado
    const resultado = calcularResultadoMultipla(selecoes);

    return { resultado, retorno, lucro };
  }, [selecoes, stake, usarFreebet, calcularResultadoMultipla]);

  // Resultado final considerando override manual
  const resultadoCalculado = resultadoManual || previewCalculo.resultado;

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
    const numSelecoes = tipoMultipla === "DUPLA" ? 2 : 3;
    let count = 0;
    for (let i = 0; i < numSelecoes; i++) {
      const sel = selecoes[i];
      if (sel?.descricao?.trim() && parseFloat(sel?.odd) > 1) {
        count++;
      }
    }
    return count;
  }, [selecoes, tipoMultipla]);

  // Verificar se formulário está pronto para salvar
  const canSave = useMemo(() => {
    const numSelecoes = tipoMultipla === "DUPLA" ? 2 : 3;
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
  }, [bookmakerId, stake, selecoesValidasCount, tipoMultipla, registroValues]);

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

    // Validar seleções
    const numSelecoes = tipoMultipla === "DUPLA" ? 2 : 3;
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

    // Validar saldo contra saldo operável (real + freebet + bonus)
    // Em modo edição: a stake original já foi debitada, então devolver ao saldo disponível
    const saldoDisponivel = bookmakerSaldo 
      ? bookmakerSaldo.saldoOperavel + (aposta && aposta.bookmaker_id === bookmakerId ? aposta.stake : 0)
      : Infinity;
    if (bookmakerSaldo && stakeNum > saldoDisponivel) {
      toast.error(`Stake maior que o saldo operável (${formatCurrency(saldoDisponivel)})`);
      return;
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

      if (resultadoFinal !== "PENDENTE") {
        lucroPrejuizo = previewCalculo.lucro;
        valorRetorno = previewCalculo.retorno;
      }

      const selecoesFormatadas = selecoes
        .slice(0, tipoMultipla === "DUPLA" ? 2 : 3)
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
      const moedaOpEdit = bookmakerSaldo?.moeda || 'BRL';
      const isForeignEdit = isForeignCurrency(moedaOpEdit);
      const cotacaoSnapEdit = isForeignEdit && exchangeRates ? exchangeRates.getRate(moedaOpEdit) : null;
      const valorBrlRefEdit = isForeignEdit && cotacaoSnapEdit ? stakeNum * cotacaoSnapEdit : null;

      const apostaData = {
        user_id: user.id,
        workspace_id: workspaceId,
        projeto_id: projetoId,
        bookmaker_id: bookmakerId,
        tipo_multipla: tipoMultipla,
        stake: stakeNum,
        odd_final: oddFinal,
        retorno_potencial: retornoPotencial,
        lucro_prejuizo: lucroPrejuizo,
        valor_retorno: valorRetorno,
        selecoes: selecoesFormatadas,
        status: resultadoFinal === "PENDENTE" ? "PENDENTE" : "LIQUIDADA",
        resultado: resultadoFinal,
        tipo_freebet: usarFreebet ? "freebet_snr" : null,
        gerou_freebet: gerouFreebet,
        valor_freebet_gerada: gerouFreebet
          ? parseFloat(valorFreebetGerada) || 0
          : 0,
        data_aposta: toLocalTimestamp(dataAposta),
        observacoes: observacoes || null,
        estrategia: registroValues.estrategia,
        forma_registro: registroValues.forma_registro,
        contexto_operacional: registroValues.contexto_operacional,
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
        const stakeMudou = stakeNum !== aposta.stake;
        const oddMudou = oddFinal !== aposta.odd_final;
        const bookmakerMudou = bookmakerId !== aposta.bookmaker_id;
        const houveMudancaFinanceira = resultadoMudou || stakeMudou || oddMudou || bookmakerMudou;

        // Se resultado vai para PENDENTE a partir de liquidada: reverter
        if (resultadoMudou && resultadoAnterior !== "PENDENTE" && resultadoAnterior !== null && resultadoFinal === "PENDENTE") {
          await supabase.rpc('reverter_liquidacao_v4', { p_aposta_id: aposta.id });
          // Atualizar campos não-financeiros após reversão
          await supabase.from("apostas_unificada").update({
            ...apostaData,
            resultado: "PENDENTE",
            status: "PENDENTE",
            lucro_prejuizo: null,
            valor_retorno: null,
          }).eq("id", aposta.id);
        } else if (houveMudancaFinanceira) {
          // Usar RPC atômico para qualquer mudança financeira (PENDENTE ou LIQUIDADA)
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
              p_novo_stake: stakeMudou ? stakeNum : null,
              p_nova_odd: oddMudou ? oddFinal : null,
              p_novo_resultado: resultadoMudou && resultadoFinal !== "PENDENTE" ? resultadoFinal : null,
              p_nova_moeda: null,
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

          // Atualizar campos que o RPC não cobre (seleções, observações, etc.)
          await supabase.from("apostas_unificada").update({
            selecoes: selecoesFormatadas,
            tipo_multipla: tipoMultipla,
            retorno_potencial: retornoPotencial,
            data_aposta: apostaData.data_aposta,
            observacoes: apostaData.observacoes,
            estrategia: apostaData.estrategia,
            forma_registro: apostaData.forma_registro,
            contexto_operacional: apostaData.contexto_operacional,
            tipo_freebet: apostaData.tipo_freebet,
            gerou_freebet: apostaData.gerou_freebet,
            valor_freebet_gerada: apostaData.valor_freebet_gerada,
            moeda_operacao: apostaData.moeda_operacao,
            cotacao_snapshot: apostaData.cotacao_snapshot,
            valor_brl_referencia: apostaData.valor_brl_referencia,
          }).eq("id", aposta.id);
        } else {
          // Sem mudança financeira: update direto de metadados
          const { error } = await supabase.from("apostas_unificada").update({
            ...apostaData,
          }).eq("id", aposta.id);
          if (error) throw error;
        }

        // Invalidar saldos após qualquer edição financeira
        await invalidateSaldos(projetoId);

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
        const moedaOp = bookmakerSaldo?.moeda || 'BRL';
        const isForeign = isForeignCurrency(moedaOp);
        const cotacaoSnap = isForeign && exchangeRates ? exchangeRates.getRate(moedaOp) : null;
        const valorBrlRef = isForeign && cotacaoSnap ? stakeNum * cotacaoSnap : null;

        const result = await criarAposta({
          projeto_id: projetoId,
          workspace_id: workspaceId,
          user_id: user.id,
          forma_registro: 'MULTIPLA',
          estrategia: registroValues.estrategia as any,
          contexto_operacional: registroValues.contexto_operacional as any,
          fonte_saldo: registroValues.fonte_saldo || 'REAL',
          data_aposta: toLocalTimestamp(dataAposta),
          bookmaker_id: bookmakerId,
          stake: stakeNum,
          tipo_multipla: tipoMultipla,
          selecoes: selecoesFormatadas as SelecaoMultipla[],
          odd_final: oddFinal,
          retorno_potencial: retornoPotencial,
          tipo_freebet: usarFreebet ? "freebet_snr" : null,
          gerou_freebet: gerouFreebet,
          valor_freebet_gerada: gerouFreebet ? parseFloat(valorFreebetGerada) || 0 : null,
          observacoes: observacoes || null,
          // Multi-moeda
          moeda_operacao: moedaOp,
          cotacao_snapshot: cotacaoSnap,
          valor_brl_referencia: valorBrlRef,
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
          const liquidResult = await liquidarAposta({
            id: novaApostaId,
            resultado: resultadoFinal as any,
            lucro_prejuizo: undefined, // Delegar cálculo à RPC (usa odd_final para múltiplas)
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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent 
          className={`max-w-2xl max-h-[100vh] overflow-y-auto ${isDragging ? 'ring-2 ring-primary ring-offset-2' : ''} ${embedded ? 'fixed inset-0 !max-w-none !max-h-none !translate-x-0 !translate-y-0 !left-0 !top-0 !rounded-none !border-0' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          hideOverlay={embedded}
          hideCloseButton={embedded}
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
            extraHeaderContent={
              <RadioGroup
                value={tipoMultipla}
                onValueChange={(v) => setTipoMultipla(v as "DUPLA" | "TRIPLA")}
                className="flex gap-3"
              >
                <div className="flex items-center space-x-1.5">
                  <RadioGroupItem value="DUPLA" id="dupla" />
                  <Label htmlFor="dupla" className="cursor-pointer text-xs whitespace-nowrap">
                    Dupla (2)
                  </Label>
                </div>
                <div className="flex items-center space-x-1.5">
                  <RadioGroupItem value="TRIPLA" id="tripla" />
                  <Label htmlFor="tripla" className="cursor-pointer text-xs whitespace-nowrap">
                    Tripla (3)
                  </Label>
                </div>
              </RadioGroup>
            }
          />

          <div className="space-y-2 py-2 px-4">

            {/* Casa / Vínculo — centralizado, label inline */}
            <div className="flex items-center justify-center gap-2 max-w-[600px] mx-auto">
              <Label className="text-xs text-muted-foreground font-normal whitespace-nowrap shrink-0">Casa / Vínculo</Label>
              <div className="flex-1 min-w-0 max-w-[420px]">
                <Select value={bookmakerId} onValueChange={setBookmakerId}>
                  <SelectTrigger className="h-7 text-xs font-medium border-border/50">
                    {(() => {
                      const selectedBk = bookmakerId ? bookmakers.find(b => b.id === bookmakerId) : null;
                      if (selectedBk) {
                        return (
                          <div className="flex items-center justify-center gap-2 w-full">
                            {selectedBk.logo_url && (
                              <img src={selectedBk.logo_url} alt="" className="h-4 w-4 rounded object-contain flex-shrink-0" />
                            )}
                            <span className="uppercase text-xs font-medium truncate">{selectedBk.nome}</span>
                            <CurrencyBadge moeda={selectedBk.moeda} size="xs" />
                          </div>
                        );
                      }
                      return <SelectValue placeholder="Selecione a casa..." />;
                    })()}
                  </SelectTrigger>
                  <BookmakerSearchableSelectContent
                    bookmakers={bookmakers.map(bk => ({
                      id: bk.id,
                      nome: bk.nome,
                      parceiro_nome: bk.parceiro_nome,
                      moeda: bk.moeda,
                      saldo_operavel: bk.saldo_operavel,
                      saldo_disponivel: bk.saldo_atual,
                      saldo_freebet: bk.saldo_freebet,
                      saldo_bonus: bk.saldo_bonus,
                      logo_url: bk.logo_url,
                      bonus_rollover_started: bk.bonus_rollover_started,
                    }))}
                    className="z-50 w-[var(--radix-select-trigger-width)] min-w-[300px]"
                  />
                </Select>
                {bookmakerSaldo && (
                  <SaldoBreakdownDisplay
                    saldoReal={bookmakerSaldo.saldo}
                    saldoFreebet={bookmakerSaldo.saldoFreebet}
                    saldoBonus={bookmakerSaldo.saldoBonus}
                    saldoOperavel={bookmakerSaldo.saldoOperavel}
                    moeda={bookmakerSaldo.moeda}
                  />
                )}
              </div>
            </div>

            {/* Toggle Usar Freebet */}
            {bookmakerSaldo &&
              bookmakerSaldo.saldoFreebet > 0 &&
              !aposta?.gerou_freebet && (
                <Card className="border-amber-500/30 bg-amber-500/5">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Gift className="h-4 w-4 text-amber-400" />
                        <span className="text-sm font-medium">
                          Usar Freebet nesta aposta?
                        </span>
                      </div>
                      <Switch
                        checked={usarFreebet}
                        onCheckedChange={handleUsarFreebetChange}
                      />
                    </div>
                    {usarFreebet && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Stake será debitada do saldo de Freebet (SNR - stake não
                        retorna)
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

            {/* Seleções */}
            <div className="space-y-1">
              <Label className="text-xs">Seleções</Label>
              <div className={`grid gap-2 ${tipoMultipla === "TRIPLA" ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 md:grid-cols-2"}`}>
                {selecoes.map((selecao, index) => {
                  return (
                  <Card 
                    key={index} 
                    className={`relative transition-all duration-150 ${
                        selecao.resultado === "GREEN" ? "bg-emerald-500/10 border-emerald-500/30" :
                            selecao.resultado === "MEIO_GREEN" ? "bg-emerald-500/5 border-emerald-500/20" :
                            selecao.resultado === "RED" ? "bg-red-500/10 border-red-500/30" :
                            selecao.resultado === "MEIO_RED" ? "bg-red-500/5 border-red-500/20" :
                            selecao.resultado === "VOID" ? "bg-gray-500/10 border-gray-500/30" :
                            "bg-muted/30"
                    }`}
                  >
                    
                    
                    <CardContent className="pt-2 pb-2 px-3">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[10px] font-medium text-muted-foreground">
                          SELEÇÃO {index + 1}
                        </span>
                        <Select 
                          value={selecao.resultado || "PENDENTE"} 
                          onValueChange={(v) => handleSelecaoChange(index, "resultado", v)}
                        >
                          <SelectTrigger className="w-[130px] h-6 text-[10px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PENDENTE" className="hover:bg-muted hover:text-foreground focus:bg-muted focus:text-foreground">Pendente</SelectItem>
                            <SelectItem value="GREEN" className="hover:bg-emerald-500/20 hover:text-emerald-500 focus:bg-emerald-500/20 focus:text-emerald-500">Green</SelectItem>
                            <SelectItem value="MEIO_GREEN" className="hover:bg-teal-500/20 hover:text-teal-500 focus:bg-teal-500/20 focus:text-teal-500">Meio Green</SelectItem>
                            <SelectItem value="RED" className="hover:bg-red-500/20 hover:text-red-500 focus:bg-red-500/20 focus:text-red-500">Red</SelectItem>
                            <SelectItem value="MEIO_RED" className="hover:bg-orange-500/20 hover:text-orange-500 focus:bg-orange-500/20 focus:text-orange-500">Meio Red</SelectItem>
                            <SelectItem value="VOID" className="hover:bg-slate-500/20 hover:text-slate-400 focus:bg-slate-500/20 focus:text-slate-400">Void</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Input
                          placeholder="Ex: Flamengo x Palmeiras - Flamengo vence"
                          value={selecao.descricao}
                          onChange={(e) =>
                            handleSelecaoChange(index, "descricao", e.target.value)
                          }
                          className="uppercase text-xs h-8"
                        />
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Odd"
                          value={selecao.odd}
                          onChange={(e) =>
                            handleSelecaoChange(index, "odd", e.target.value)
                          }
                          className="text-xs h-8"
                        />
                      </div>
                      
                    </CardContent>
                  </Card>
                  );
                })}
              </div>
            </div>

            {/* Preview em Tempo Real da Múltipla */}
            <div className="flex items-center gap-4 px-3 py-2 rounded-md border border-blue-500/30 bg-blue-500/5 text-sm">
              <span className="text-[10px] text-muted-foreground shrink-0">Preview</span>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground">Resultado:</span>
                <Badge className={`text-[10px] px-1.5 py-0 ${
                  previewCalculo.resultado === "GREEN" ? "bg-emerald-500/20 text-emerald-400" :
                  previewCalculo.resultado === "MEIO_GREEN" ? "bg-emerald-500/10 text-emerald-300" :
                  previewCalculo.resultado === "RED" ? "bg-red-500/20 text-red-400" :
                  previewCalculo.resultado === "MEIO_RED" ? "bg-red-500/10 text-red-300" :
                  previewCalculo.resultado === "VOID" ? "bg-gray-500/20 text-gray-400" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {previewCalculo.resultado === "MEIO_GREEN" ? "MEIO GREEN" :
                   previewCalculo.resultado === "MEIO_RED" ? "MEIO RED" :
                   previewCalculo.resultado}
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground">Retorno:</span>
                <span className="font-medium text-xs">{formatCurrency(previewCalculo.retorno)}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground">P/L:</span>
                <span className={`font-medium text-xs ${previewCalculo.lucro >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {previewCalculo.lucro >= 0 ? "+" : ""}{formatCurrency(previewCalculo.lucro)}
                </span>
              </div>
            </div>

            {/* Stake e Cálculos */}
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-0.5">
                <Label className="text-xs">Stake ({bookmakerSaldo?.moeda || 'R$'}) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-0.5">
                <Label className="text-xs">Odd Final</Label>
                <Input
                  value={oddFinal > 0 ? oddFinal.toFixed(3) : "-"}
                  disabled
                  className="bg-muted/50 h-8 text-xs"
                />
              </div>
              <div className="space-y-0.5">
                <Label className="text-xs">Retorno Potencial</Label>
                <Input
                  value={
                    retornoPotencial > 0 ? formatCurrency(retornoPotencial) : "-"
                  }
                  disabled
                  className="bg-muted/50 h-8 text-xs"
                />
              </div>
            </div>

            {/* Resultado Calculado e Lucro */}
            {resultadoCalculado !== "PENDENTE" && (
              <div className={`p-3 rounded-lg border ${
                resultadoCalculado === "GREEN" ? "bg-emerald-500/10 border-emerald-500/30" :
                resultadoCalculado === "MEIO_GREEN" ? "bg-emerald-500/5 border-emerald-500/20" :
                resultadoCalculado === "RED" ? "bg-red-500/10 border-red-500/30" :
                resultadoCalculado === "MEIO_RED" ? "bg-red-500/5 border-red-500/20" :
                "bg-gray-500/10 border-gray-500/30"
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Resultado:</span>
                  <Badge className={`${
                    resultadoCalculado === "GREEN" ? "bg-emerald-500/20 text-emerald-400" :
                    resultadoCalculado === "MEIO_GREEN" ? "bg-emerald-500/10 text-emerald-300" :
                    resultadoCalculado === "RED" ? "bg-red-500/20 text-red-400" :
                    resultadoCalculado === "MEIO_RED" ? "bg-red-500/10 text-red-300" :
                    "bg-gray-500/20 text-gray-400"
                  }`}>
                    {resultadoCalculado === "MEIO_GREEN" ? "MEIO GREEN" : 
                     resultadoCalculado === "MEIO_RED" ? "MEIO RED" : 
                     resultadoCalculado}
                  </Badge>
                </div>
                {(resultadoCalculado === "GREEN" || resultadoCalculado === "MEIO_GREEN") && oddFinalReal !== oddFinal && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                    <span>Odd Ajustada (VOIDs = 1.00):</span>
                    <span className="font-medium text-foreground">{oddFinalReal.toFixed(3)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Lucro Potencial (apenas se pendente) */}
            {lucroPotencial > 0 && resultadoCalculado === "PENDENTE" && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Lucro Potencial:
                  </span>
                  <span className="text-lg font-bold text-emerald-400">
                    {formatCurrency(lucroPotencial)}
                  </span>
                </div>
              </div>
            )}

            {/* Data/Hora - metadado discreto, registrada automaticamente */}
            <div className="flex items-center justify-end">
              <span className="text-[10px] text-muted-foreground">
                Registrado em: {dataAposta ? new Date(dataAposta).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} (Horário de Brasília)
              </span>
            </div>

            {/* Resultado - Calculado automaticamente ou manual */}
            <div className="space-y-1">
              <Label className="text-xs">Resultado da Múltipla</Label>
              <Select 
                value={resultadoManual || previewCalculo.resultado} 
                onValueChange={(v) => {
                  // Se selecionar o mesmo que o automático, limpa o manual
                  if (v === previewCalculo.resultado) {
                    setResultadoManual(null);
                  } else {
                    setResultadoManual(v);
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDENTE" className="hover:bg-muted hover:text-foreground focus:bg-muted focus:text-foreground">Pendente</SelectItem>
                  <SelectItem value="GREEN" className="hover:bg-emerald-500/20 hover:text-emerald-500 focus:bg-emerald-500/20 focus:text-emerald-500">Green</SelectItem>
                  <SelectItem value="MEIO_GREEN" className="hover:bg-teal-500/20 hover:text-teal-500 focus:bg-teal-500/20 focus:text-teal-500">Meio Green</SelectItem>
                  <SelectItem value="RED" className="hover:bg-red-500/20 hover:text-red-500 focus:bg-red-500/20 focus:text-red-500">Red</SelectItem>
                  <SelectItem value="MEIO_RED" className="hover:bg-orange-500/20 hover:text-orange-500 focus:bg-orange-500/20 focus:text-orange-500">Meio Red</SelectItem>
                  <SelectItem value="VOID" className="hover:bg-slate-500/20 hover:text-slate-400 focus:bg-slate-500/20 focus:text-slate-400">Void</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {resultadoManual 
                  ? `Resultado manual selecionado (automático seria: ${previewCalculo.resultado})`
                  : "Calculado automaticamente com base nos resultados individuais"
                }
              </p>
            </div>

            {/* Gerou Freebet - Componente padronizado com suporte multimoeda */}
            {!usarFreebet && (
              <GerouFreebetInput
                gerouFreebet={gerouFreebet}
                onGerouFreebetChange={setGerouFreebet}
                valorFreebetGerada={valorFreebetGerada}
                onValorFreebetGeradaChange={setValorFreebetGerada}
                moeda={bookmakerSaldo?.moeda || "BRL"}
              />
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {aposta && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={loading}
                className="sm:mr-auto"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            {/* Botão de Rascunho: aparece quando tem dados mas não pode salvar como aposta real */}
            {podeSalvarRascunho && (
              <Button 
                variant="secondary"
                onClick={handleSalvarRascunho}
                disabled={loading}
              >
                <FileText className="h-4 w-4 mr-1" />
                Salvar Rascunho
              </Button>
            )}
            <Button type="button" onClick={handleSubmit} disabled={loading || !canSave}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Salvar
            </Button>
          </DialogFooter>
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
