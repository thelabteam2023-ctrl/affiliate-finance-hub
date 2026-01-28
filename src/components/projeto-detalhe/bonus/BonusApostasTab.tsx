import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "sonner";
import { 
  Target,
  Calendar,
  TrendingUp,
  TrendingDown,
  Coins,
  Layers,
  Building2,
  Clock,
  CheckCircle2,
  History,
  XCircle,
  AlertTriangle,
  RotateCcw,
  LayoutGrid,
  List,
  Gift
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ApostaDialog } from "@/components/projeto-detalhe/ApostaDialog";
import { ApostaMultiplaDialog } from "@/components/projeto-detalhe/ApostaMultiplaDialog";
import { SurebetCard, SurebetData } from "@/components/projeto-detalhe/SurebetCard";
import { SurebetDialog } from "@/components/projeto-detalhe/SurebetDialog";
import { ResultadoPill } from "@/components/projeto-detalhe/ResultadoPill";
import { useProjectBonuses, FinalizeReason } from "@/hooks/useProjectBonuses";
import { cn, getFirstLastName } from "@/lib/utils";
import { 
  OperationsSubTabHeader,
  type HistorySubTab 
} from "../operations";
import { parseLocalDateTime } from "@/utils/dateUtils";

interface BonusApostasTabProps {
  projetoId: string;
}

// SubTabValue agora usa o tipo HistorySubTab exportado de operations

const REASON_LABELS: Record<FinalizeReason, { label: string; icon: React.ElementType; color: string }> = {
  rollover_completed: { label: "Rollover Concluído", icon: CheckCircle2, color: "text-emerald-400 bg-emerald-500/20 border-emerald-500/30" },
  bonus_consumed: { label: "Bônus Consumido", icon: AlertTriangle, color: "text-yellow-400 bg-yellow-500/20 border-yellow-500/30" },
  expired: { label: "Expirou", icon: XCircle, color: "text-red-400 bg-red-500/20 border-red-500/30" },
  cancelled_reversed: { label: "Cancelado/Revertido", icon: RotateCcw, color: "text-gray-400 bg-gray-500/20 border-gray-500/30" },
};

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
  back_comissao?: number | null;
  back_em_exchange?: boolean;
  gerou_freebet?: boolean;
  valor_freebet_gerada?: number | null;
  tipo_freebet?: string | null;
  forma_registro?: string | null;
  contexto_operacional?: string | null;
  is_bonus_bet?: boolean;
  bookmaker?: {
    nome: string;
    parceiro_id: string;
    moeda?: string;
    bookmaker_catalogo_id?: string | null;
    parceiro?: {
      nome: string;
    };
    bookmakers_catalogo?: {
      logo_url: string | null;
    } | null;
  };
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
  is_bonus_bet?: boolean;
  bookmaker?: {
    nome: string;
    parceiro_id: string;
    moeda?: string;
    bookmaker_catalogo_id?: string | null;
    parceiro?: {
      nome: string;
    };
    bookmakers_catalogo?: {
      logo_url: string | null;
    } | null;
  };
}

interface Surebet {
  id: string;
  evento: string;
  esporte: string;
  modelo: string;
  mercado?: string | null;
  stake_total: number;
  spread_calculado: number | null;
  roi_esperado: number | null;
  roi_real: number | null;
  lucro_esperado: number | null;
  lucro_real: number | null;
  status: string;
  resultado: string | null;
  data_operacao: string;
  observacoes: string | null;
  pernas?: {
    id: string;
    bookmaker_id: string;
    selecao: string;
    odd: number;
    stake: number;
    resultado: string | null;
    moeda?: string;
    bookmaker_nome?: string;
    bookmaker?: {
      nome: string;
      parceiro?: { nome: string };
    };
  }[];
}

type ApostaUnificada = {
  tipo: "simples" | "multipla" | "surebet";
  data: Aposta | ApostaMultipla | Surebet;
  data_aposta: string;
};

export function BonusApostasTab({ projetoId }: BonusApostasTabProps) {
  const { getBookmakersWithActiveBonus, bonuses } = useProjectBonuses({ projectId: projetoId });
  
  // Use refs to track previous values and prevent infinite loops
  const prevBonusIdsRef = useRef<string>("");
  const hasFetchedRef = useRef(false);
  const projetoIdRef = useRef(projetoId);
  
  // Keep projetoId ref updated
  useEffect(() => {
    projetoIdRef.current = projetoId;
  }, [projetoId]);
  
  // Memoize the bookmaker IDs with stable comparison
  const bookmakersInBonusMode = useMemo(() => {
    return getBookmakersWithActiveBonus();
  }, [getBookmakersWithActiveBonus]);
  
  // Store bonus mode IDs in ref for use in fetch functions
  const bookmakersInBonusModeRef = useRef<string[]>([]);
  useEffect(() => {
    bookmakersInBonusModeRef.current = bookmakersInBonusMode;
  }, [bookmakersInBonusMode]);
  
  // Create a stable string key for comparison only
  const currentBonusIdsKey = useMemo(() => {
    return [...bookmakersInBonusMode].sort().join(',');
  }, [bookmakersInBonusMode]);
  
  const [apostas, setApostas] = useState<Aposta[]>([]);
  const [apostasMultiplas, setApostasMultiplas] = useState<ApostaMultipla[]>([]);
  const [surebets, setSurebets] = useState<Surebet[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [resultadoFilter, setResultadoFilter] = useState<string>("all");
  const [tipoFilter, setTipoFilter] = useState<"todas" | "simples" | "multiplas" | "surebets">("todas");
  const [viewMode, setViewMode] = useState<"cards" | "list">("list");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMultiplaOpen, setDialogMultiplaOpen] = useState(false);
  const [dialogSurebetOpen, setDialogSurebetOpen] = useState(false);
  const [selectedAposta, setSelectedAposta] = useState<Aposta | null>(null);
  const [selectedApostaMultipla, setSelectedApostaMultipla] = useState<ApostaMultipla | null>(null);
  const [selectedSurebet, setSelectedSurebet] = useState<SurebetData | null>(null);
  const [bookmakers, setBookmakers] = useState<any[]>([]);
  
  // Sub-tab state (Abertas/Histórico pattern)
  const [subTab, setSubTab] = useState<HistorySubTab>("abertas");
  const [reasonFilter, setReasonFilter] = useState<string>("all");

  // Initial fetch and when projetoId changes - reset refs
  useEffect(() => {
    hasFetchedRef.current = false;
    prevBonusIdsRef.current = "";
  }, [projetoId]);

  // Fetch only when projetoId changes OR bonus IDs actually change (deep comparison)
  useEffect(() => {
    if (!projetoId) return;
    
    // Check if bonus IDs actually changed
    if (prevBonusIdsRef.current !== currentBonusIdsKey || !hasFetchedRef.current) {
      prevBonusIdsRef.current = currentBonusIdsKey;
      hasFetchedRef.current = true;
      
      // Fetch all data
      const fetchAllData = async () => {
        try {
          setLoading(true);
          const currentProjetoId = projetoIdRef.current;
          const currentBonusIds = bookmakersInBonusModeRef.current;
          
          await Promise.all([
            fetchApostasInternal(currentProjetoId, currentBonusIds),
            fetchApostasMultiplasInternal(currentProjetoId, currentBonusIds),
            fetchSurebetsInternal(currentProjetoId, currentBonusIds),
            fetchBookmakersInternal(currentProjetoId, currentBonusIds)
          ]);
        } catch (error) {
          console.error("Erro ao carregar dados:", error);
        } finally {
          setLoading(false);
        }
      };
      
      fetchAllData();
    }
  }, [projetoId, currentBonusIdsKey]);

  // Internal fetch functions that receive parameters (avoid closure issues)
  const fetchBookmakersInternal = async (projId: string, bonusIds: string[]) => {
    try {
      const { data, error } = await supabase
        .from("bookmakers")
        .select(`
          id,
          nome,
          saldo_atual,
          saldo_freebet,
          moeda,
          parceiro:parceiros (nome),
          bookmakers_catalogo (logo_url)
        `)
        .eq("projeto_id", projId)
        .in("status", ["ativo", "ATIVO", "LIMITADA", "limitada"]);

      if (error) throw error;
      
      // Adicionar indicador de qual casa tem bônus ativo
      const dataWithBonusFlag = (data || []).map(bk => ({
        ...bk,
        hasActiveBonus: bonusIds.includes(bk.id)
      }));
      
      setBookmakers(dataWithBonusFlag);
    } catch (error: any) {
      console.error("Erro ao carregar bookmakers:", error.message);
    }
  };

  const fetchApostasInternal = async (projId: string, bonusIds: string[]) => {
    try {
      let query = supabase
        .from("apostas_unificada")
        .select(`
          *,
          bookmaker:bookmakers (
            nome,
            parceiro_id,
            moeda,
            bookmaker_catalogo_id,
            parceiro:parceiros (nome),
            bookmakers_catalogo (logo_url)
          )
        `)
        .eq("projeto_id", projId)
        .eq("forma_registro", "SIMPLES");
      
      if (bonusIds.length > 0) {
        query = query.or(`bookmaker_id.in.(${bonusIds.join(',')}),contexto_operacional.eq.BONUS,estrategia.eq.EXTRACAO_BONUS`);
      } else {
        query = query.or(`contexto_operacional.eq.BONUS,estrategia.eq.EXTRACAO_BONUS`);
      }
      
      const { data, error } = await query.order("data_aposta", { ascending: false });

      if (error) throw error;
      
      const mapped = (data || []).map((a: any) => ({
        ...a,
        esporte: a.esporte || '',
        evento: a.evento || '',
        selecao: a.selecao || ''
      }));
      setApostas(mapped);
    } catch (error: any) {
      toast.error("Erro ao carregar apostas: " + error.message);
    }
  };

  const fetchApostasMultiplasInternal = async (projId: string, bonusIds: string[]) => {
    try {
      let query = supabase
        .from("apostas_unificada")
        .select(`
          *,
          bookmaker:bookmakers (
            nome,
            parceiro_id,
            moeda,
            bookmaker_catalogo_id,
            parceiro:parceiros (nome),
            bookmakers_catalogo (logo_url)
          )
        `)
        .eq("projeto_id", projId)
        .eq("forma_registro", "MULTIPLA");
      
      if (bonusIds.length > 0) {
        query = query.or(`bookmaker_id.in.(${bonusIds.join(',')}),contexto_operacional.eq.BONUS,estrategia.eq.EXTRACAO_BONUS`);
      } else {
        query = query.or(`contexto_operacional.eq.BONUS,estrategia.eq.EXTRACAO_BONUS`);
      }
      
      const { data, error } = await query.order("data_aposta", { ascending: false });

      if (error) throw error;
      
      setApostasMultiplas((data || []).map((am: any) => ({
        ...am,
        selecoes: Array.isArray(am.selecoes) ? am.selecoes : []
      })));
    } catch (error: any) {
      console.error("Erro ao carregar apostas múltiplas:", error.message);
    }
  };

  const fetchSurebetsInternal = async (projId: string, bonusIds: string[]) => {
    try {
      // Buscar operações multi-leg (ARBITRAGEM ou SUREBET) com estratégia BONUS ou contexto BONUS
      const { data: surebetsData, error } = await supabase
        .from("apostas_unificada")
        .select("*")
        .eq("projeto_id", projId)
        .or(`forma_registro.eq.ARBITRAGEM,forma_registro.eq.SUREBET`)
        .or(`estrategia.eq.EXTRACAO_BONUS,contexto_operacional.eq.BONUS`)
        .order("data_aposta", { ascending: false });

      if (error) throw error;
      
      // Buscar pernas da tabela normalizada para operações multi-leg
      const surebetIds = (surebetsData || []).map((s: any) => s.id);
      let pernasMap: Record<string, any[]> = {};
      
      if (surebetIds.length > 0) {
        const { data: pernasData } = await supabase
          .from("apostas_pernas")
          .select(`
            aposta_id,
            bookmaker_id,
            selecao,
            selecao_livre,
            odd,
            stake,
            resultado,
            lucro_prejuizo,
            bookmakers (nome, parceiro:parceiros(nome))
          `)
          .in("aposta_id", surebetIds)
          .order("ordem", { ascending: true });
        
        (pernasData || []).forEach((p: any) => {
          if (!pernasMap[p.aposta_id]) {
            pernasMap[p.aposta_id] = [];
          }
          const bookmaker = p.bookmakers as any;
          const parceiroNome = bookmaker?.parceiro?.nome;
          pernasMap[p.aposta_id].push({
            bookmaker_id: p.bookmaker_id,
            bookmaker_nome: parceiroNome 
              ? `${bookmaker?.nome || "—"} - ${parceiroNome}` 
              : (bookmaker?.nome || "—"),
            selecao: p.selecao,
            selecao_livre: p.selecao_livre,
            odd: p.odd,
            stake: p.stake,
            resultado: p.resultado,
            lucro_prejuizo: p.lucro_prejuizo,
          });
        });
      }
      
      const surebetsComPernas = (surebetsData || []).map((surebet: any) => {
        // Usar pernas da tabela normalizada (com fallback para JSONB legado)
        const pernas = pernasMap[surebet.id] || (Array.isArray(surebet.pernas) ? surebet.pernas : []);
        return {
          id: surebet.id,
          evento: surebet.evento || '',
          esporte: surebet.esporte || '',
          modelo: surebet.modelo || 'BACK_LAY',
          mercado: surebet.mercado,
          stake_total: surebet.stake_total || 0,
          spread_calculado: surebet.spread_calculado,
          roi_esperado: surebet.roi_esperado,
          roi_real: surebet.roi_real,
          lucro_esperado: surebet.lucro_esperado,
          lucro_real: surebet.lucro_prejuizo,
          status: surebet.status,
          resultado: surebet.resultado,
          data_operacao: surebet.data_aposta,
          observacoes: surebet.observacoes,
          estrategia: surebet.estrategia,
          contexto_operacional: surebet.contexto_operacional,
          pernas: pernas
        };
      });
      
      // Also include surebets with SUREBET strategy if they have pernas with bonus bookmakers
      if (bonusIds.length > 0) {
        const { data: surebetsWithBonusBk, error: error2 } = await supabase
          .from("apostas_unificada")
          .select("*")
          .eq("projeto_id", projId)
          .or(`forma_registro.eq.ARBITRAGEM,forma_registro.eq.SUREBET`)
          .eq("estrategia", "SUREBET")
          .order("data_aposta", { ascending: false });
          
        if (!error2 && surebetsWithBonusBk) {
          const additionalSurebets = surebetsWithBonusBk
            .filter((surebet: any) => {
              const pernas = Array.isArray(surebet.pernas) ? surebet.pernas : [];
              return pernas.some((p: any) => bonusIds.includes(p.bookmaker_id));
            })
            .filter((sb: any) => !surebetsComPernas.some((existing: any) => existing.id === sb.id))
            .map((surebet: any) => {
              const pernas = Array.isArray(surebet.pernas) ? surebet.pernas : [];
              return {
                id: surebet.id,
                evento: surebet.evento || '',
                esporte: surebet.esporte || '',
                modelo: surebet.modelo || 'BACK_LAY',
                mercado: surebet.mercado,
                stake_total: surebet.stake_total || 0,
                spread_calculado: surebet.spread_calculado,
                roi_esperado: surebet.roi_esperado,
                roi_real: surebet.roi_real,
                lucro_esperado: surebet.lucro_esperado,
                lucro_real: surebet.lucro_prejuizo,
                status: surebet.status,
                resultado: surebet.resultado,
                data_operacao: surebet.data_aposta,
                observacoes: surebet.observacoes,
                estrategia: surebet.estrategia,
                contexto_operacional: surebet.contexto_operacional,
                pernas: pernas
              };
            });
          
          surebetsComPernas.push(...additionalSurebets);
        }
      }
      
      // Sort by date descending
      surebetsComPernas.sort((a: any, b: any) => 
        new Date(b.data_operacao).getTime() - new Date(a.data_operacao).getTime()
      );
      
      setSurebets(surebetsComPernas);
    } catch (error: any) {
      console.error("Erro ao carregar surebets:", error.message);
    }
  };

  const handleApostaUpdated = useCallback(async () => {
    try {
      setLoading(true);
      const currentProjetoId = projetoIdRef.current;
      const currentBonusIds = bookmakersInBonusModeRef.current;
      
      await Promise.all([
        fetchApostasInternal(currentProjetoId, currentBonusIds),
        fetchApostasMultiplasInternal(currentProjetoId, currentBonusIds),
        fetchSurebetsInternal(currentProjetoId, currentBonusIds),
        fetchBookmakersInternal(currentProjetoId, currentBonusIds)
      ]);
    } catch (error) {
      console.error("Erro ao atualizar dados:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Listeners para BroadcastChannel - atualizam quando operações são salvas em janelas externas
  useEffect(() => {
    // Canais para cada tipo de operação
    const surebetChannel = new BroadcastChannel("surebet_channel");
    const apostaChannel = new BroadcastChannel("aposta_channel");
    const multiplaChannel = new BroadcastChannel("aposta_multipla_channel");
    
    const handleSurebetMessage = (event: MessageEvent) => {
      if (event.data?.type === "SUREBET_SAVED" && event.data?.projetoId === projetoId) {
        console.log("[BonusApostasTab] Surebet salva em janela externa, atualizando lista...");
        handleApostaUpdated();
      }
    };
    
    const handleApostaMessage = (event: MessageEvent) => {
      // Aceitar APOSTA_SAVED, resultado_updated e APOSTA_DELETED
      const validTypes = ["APOSTA_SAVED", "resultado_updated", "APOSTA_DELETED"];
      if (validTypes.includes(event.data?.type) && event.data?.projetoId === projetoId) {
        console.log(`[BonusApostasTab] ${event.data.type} em janela externa, atualizando lista...`);
        handleApostaUpdated();
      }
    };
    
    const handleMultiplaMessage = (event: MessageEvent) => {
      if (event.data?.type === "APOSTA_MULTIPLA_SAVED" && event.data?.projetoId === projetoId) {
        console.log("[BonusApostasTab] Aposta Múltipla salva em janela externa, atualizando lista...");
        handleApostaUpdated();
      }
    };
    
    surebetChannel.addEventListener("message", handleSurebetMessage);
    apostaChannel.addEventListener("message", handleApostaMessage);
    multiplaChannel.addEventListener("message", handleMultiplaMessage);
    
    // Fallback: listener para localStorage
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "surebet_saved" || event.key === "aposta_saved" || event.key === "aposta_multipla_saved") {
        try {
          const data = JSON.parse(event.newValue || "{}");
          if (data.projetoId === projetoId) {
            console.log(`[BonusApostasTab] ${event.key} (localStorage fallback), atualizando lista...`);
            handleApostaUpdated();
          }
        } catch (e) {
          // Ignorar erros de parse
        }
      }
    };
    
    window.addEventListener("storage", handleStorage);
    
    return () => {
      surebetChannel.removeEventListener("message", handleSurebetMessage);
      surebetChannel.close();
      apostaChannel.removeEventListener("message", handleApostaMessage);
      apostaChannel.close();
      multiplaChannel.removeEventListener("message", handleMultiplaMessage);
      multiplaChannel.close();
      window.removeEventListener("storage", handleStorage);
    };
  }, [projetoId, handleApostaUpdated]);

  // Filter apostas
  const filteredApostas = apostas.filter((aposta) => {
    const matchesSearch = 
      aposta.evento.toLowerCase().includes(searchTerm.toLowerCase()) ||
      aposta.esporte.toLowerCase().includes(searchTerm.toLowerCase()) ||
      aposta.selecao.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || aposta.status === statusFilter;
    const matchesResultado = resultadoFilter === "all" || aposta.resultado === resultadoFilter;
    const matchesTipo = tipoFilter === "todas" || tipoFilter === "simples";
    return matchesSearch && matchesStatus && matchesResultado && matchesTipo;
  });

  // Filter multiplas
  const filteredMultiplas = apostasMultiplas.filter((am) => {
    const matchesSearch = am.selecoes.some(s => 
      s.descricao.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const matchesStatus = statusFilter === "all" || am.status === statusFilter;
    const matchesResultado = resultadoFilter === "all" || am.resultado === resultadoFilter;
    const matchesTipo = tipoFilter === "todas" || tipoFilter === "multiplas";
    return (searchTerm === "" || matchesSearch) && matchesStatus && matchesResultado && matchesTipo;
  });

  // Filter surebets
  const filteredSurebets = surebets.filter((sb) => {
    const matchesSearch = 
      sb.evento.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sb.esporte.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sb.modelo.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || sb.status === statusFilter;
    const matchesResultado = resultadoFilter === "all" || sb.resultado === resultadoFilter;
    const matchesTipo = tipoFilter === "todas" || tipoFilter === "surebets";
    return matchesSearch && matchesStatus && matchesResultado && matchesTipo;
  });

  // Unify and sort
  const apostasUnificadas: ApostaUnificada[] = [
    ...filteredApostas.map(a => ({ tipo: "simples" as const, data: a, data_aposta: a.data_aposta })),
    ...filteredMultiplas.map(am => ({ tipo: "multipla" as const, data: am, data_aposta: am.data_aposta })),
    ...filteredSurebets.map(sb => ({ tipo: "surebet" as const, data: sb, data_aposta: sb.data_operacao })),
  ].sort((a, b) => parseLocalDateTime(b.data_aposta).getTime() - parseLocalDateTime(a.data_aposta).getTime());

  // Separate into Abertas (pending) and Histórico (settled)
  const apostasAbertas = apostasUnificadas.filter(item => {
    if (item.tipo === "simples") {
      const a = item.data as Aposta;
      return a.status === "PENDENTE" || !a.resultado;
    }
    if (item.tipo === "multipla") {
      const am = item.data as ApostaMultipla;
      return am.status === "PENDENTE" || !am.resultado;
    }
    if (item.tipo === "surebet") {
      const sb = item.data as Surebet;
      return sb.status === "PENDENTE" || !sb.resultado;
    }
    return false;
  });

  const apostasHistorico = apostasUnificadas.filter(item => {
    if (item.tipo === "simples") {
      const a = item.data as Aposta;
      return a.status !== "PENDENTE" && a.resultado;
    }
    if (item.tipo === "multipla") {
      const am = item.data as ApostaMultipla;
      return am.status !== "PENDENTE" && am.resultado;
    }
    if (item.tipo === "surebet") {
      const sb = item.data as Surebet;
      return sb.status !== "PENDENTE" && sb.resultado;
    }
    return false;
  });

  // Auto-switch to history tab when no open operations
  useEffect(() => {
    if (!loading && apostasAbertas.length === 0 && (apostasHistorico.length > 0 || bonuses.some(b => b.status === 'finalized')) && subTab === 'abertas') {
      setSubTab('historico');
    }
  }, [loading, apostasAbertas.length, apostasHistorico.length, bonuses]);

  // Finalized bonuses for "Histórico" sub-tab
  const finalizedBonuses = bonuses.filter(b => b.status === 'finalized');

  const filteredFinalizedBonuses = finalizedBonuses.filter(bonus => {
    const matchesSearch = 
      bonus.bookmaker_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bonus.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bonus.parceiro_nome?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesReason = reasonFilter === "all" || bonus.finalize_reason === reasonFilter;
    
    return matchesSearch && matchesReason;
  }).sort((a, b) => {
    if (!a.finalized_at) return 1;
    if (!b.finalized_at) return -1;
    return new Date(b.finalized_at).getTime() - new Date(a.finalized_at).getTime();
  });

  const getReasonBadge = (reason: FinalizeReason | null) => {
    if (!reason) return null;
    const config = REASON_LABELS[reason];
    const Icon = config.icon;
    return (
      <Badge className={config.color}>
        <Icon className="h-3 w-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };
  
  const formatCurrencyWithMoeda = (value: number, moeda: string = 'BRL') => {
    const symbols: Record<string, string> = { BRL: 'R$', USD: '$', EUR: '€', GBP: '£' };
    const symbol = symbols[moeda] || moeda;
    const formatted = value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${symbol} ${formatted}`;
  };

  // Mapa de bookmaker_id -> nome completo com parceiro para enriquecer nomes no SurebetCard
  const bookmakerNomeMap = useMemo(() => {
    const map = new Map<string, string>();
    bookmakers.forEach(bk => {
      const parceiroNome = bk.parceiro?.nome?.split(" ");
      const shortName = parceiroNome 
        ? `${parceiroNome[0]} ${parceiroNome[parceiroNome.length - 1] || ""}`.trim()
        : "";
      const nomeCompleto = shortName ? `${bk.nome} - ${shortName}` : bk.nome;
      map.set(bk.id, nomeCompleto);
    });
    return map;
  }, [bookmakers]);



  // Abrir aposta simples em janela externa (mesmo comportamento do Surebet)
  const handleOpenDialog = (aposta: Aposta | null) => {
    const apostaId = aposta?.id || 'novo';
    const url = `/janela/aposta/${apostaId}?projetoId=${encodeURIComponent(projetoId)}&tab=bonus&estrategia=EXTRACAO_BONUS`;
    window.open(url, '_blank', 'width=780,height=900,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes');
  };

  // Abrir aposta múltipla em janela externa (mesmo comportamento do Surebet)
  const handleOpenMultiplaDialog = (aposta: ApostaMultipla | null) => {
    const apostaId = aposta?.id || 'novo';
    const url = `/janela/multipla/${apostaId}?projetoId=${encodeURIComponent(projetoId)}&tab=bonus&estrategia=EXTRACAO_BONUS`;
    window.open(url, '_blank', 'width=780,height=900,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes');
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  // Render bet cards helper
  const renderBetCards = (items: ApostaUnificada[]) => (
    <div className={cn(
      viewMode === "cards" 
        ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" 
        : "space-y-2"
    )}>
      {items.map((item) => {
        // Card de Surebet
        if (item.tipo === "surebet") {
          const sb = item.data as Surebet;
          
          // Detectar moeda a partir das pernas (primeira perna define a moeda do card)
          const pernas = sb.pernas || [];
          const moedaSurebet = (pernas[0] as any)?.moeda || 'BRL';
          
          // Converter para formato SurebetData compatível com SurebetCard
          const surebetData: SurebetData = {
            ...sb,
            pernas: pernas.map((p: any) => ({
              id: p.id,
              selecao: p.selecao,
              selecao_livre: p.selecao_livre,
              odd: p.odd,
              stake: p.stake,
              resultado: p.resultado,
              bookmaker_nome: p.bookmaker_nome || p.bookmaker?.nome || "—",
              bookmaker_id: p.bookmaker_id,
              entries: p.entries,
              odd_media: p.odd_media,
              stake_total: p.stake_total,
            })),
          };
          
          // Criar formatador baseado na moeda das pernas
          const formatSurebetCurrency = (value: number) => formatCurrencyWithMoeda(value, moedaSurebet);
          
          return (
            <SurebetCard
              key={sb.id}
              surebet={surebetData}
              isBonusContext={true}
              formatCurrency={formatSurebetCurrency}
              bookmakerNomeMap={bookmakerNomeMap}
              onEdit={(surebet) => {
                // Abrir em janela externa
                const url = `/janela/surebet/${surebet.id}?projetoId=${encodeURIComponent(projetoId)}&tab=bonus`;
                window.open(url, '_blank', 'width=780,height=900,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes');
              }}
            />
          );
        }
        
        if (item.tipo === "simples") {
          const aposta = item.data as Aposta;
          const parceiroNome = aposta.bookmaker?.parceiro?.nome ? getFirstLastName(aposta.bookmaker.parceiro.nome) : null;
          
          return (
            <div 
              key={aposta.id} 
              className="rounded-lg border cursor-pointer transition-colors p-3 hover:border-amber-500/50 border-amber-500/20"
              onClick={() => handleOpenDialog(aposta)}
            >
              {/* Layout Padronizado: 3 linhas igual ApostaCard */}
              <div className="flex flex-col gap-2">
                
                {/* LINHA 1: Evento + Esporte + Badges */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <p className="text-sm font-medium truncate uppercase">{aposta.evento}</p>
                    {aposta.esporte && (
                      <span className="text-xs text-muted-foreground shrink-0">• {aposta.esporte}</span>
                    )}
                  </div>
                  
                  {/* Badges alinhadas à direita */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] px-1.5 py-0">
                      <Coins className="h-2.5 w-2.5 mr-0.5" />
                      Bônus
                    </Badge>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-500/30 text-blue-400 bg-blue-500/20">
                      SIMPLES
                    </Badge>
                    <ResultadoPill
                      apostaId={aposta.id}
                      bookmarkerId={aposta.bookmaker_id}
                      projetoId={projetoId}
                      layExchangeBookmakerId={aposta.lay_exchange && aposta.lay_odd ? aposta.lay_exchange : undefined}
                      resultado={aposta.resultado}
                      status={aposta.status}
                      stake={aposta.stake}
                      odd={aposta.odd}
                      operationType={
                        aposta.lay_exchange && aposta.lay_odd ? "cobertura" :
                        aposta.modo_entrada?.toUpperCase() === "BACK" && aposta.back_em_exchange ? "back" :
                        aposta.modo_entrada?.toUpperCase() === "LAY" ? "lay" : "bookmaker"
                      }
                      layLiability={aposta.lay_liability || undefined}
                      layOdd={aposta.lay_odd || undefined}
                      layStake={aposta.lay_stake || undefined}
                      layComissao={aposta.lay_comissao || undefined}
                      gerouFreebet={aposta.gerou_freebet || false}
                      valorFreebetGerada={aposta.valor_freebet_gerada || undefined}
                      contextoOperacional={aposta.contexto_operacional}
                      estrategia={aposta.estrategia}
                      onResultadoUpdated={handleApostaUpdated}
                      onEditClick={() => handleOpenDialog(aposta)}
                    />
                  </div>
                </div>
                
                {/* LINHA 2: Badge Seleção + Logo + Casa/Vínculo + Odd + Stake */}
                <div className="flex items-center gap-3">
                  {/* Badge de seleção */}
                  {aposta.selecao && (
                    <div className="shrink-0">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary bg-primary/10 truncate max-w-[80px]">
                        {aposta.selecao.length > 8 ? aposta.selecao.substring(0, 8) + '...' : aposta.selecao}
                      </Badge>
                    </div>
                  )}
                  
                  {/* Logo */}
                  {aposta.bookmaker?.bookmakers_catalogo?.logo_url ? (
                    <img 
                      src={aposta.bookmaker.bookmakers_catalogo.logo_url} 
                      alt={aposta.bookmaker?.nome || ''} 
                      className="h-10 w-10 rounded-lg object-contain bg-white/10 p-1 shrink-0"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-lg bg-muted/30 flex items-center justify-center shrink-0">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  
                  {/* Nome da casa + Vínculo abreviado */}
                  <span className="text-sm text-muted-foreground truncate flex-1 min-w-0 uppercase">
                    {aposta.bookmaker?.nome}
                    {parceiroNome && ` - ${parceiroNome}`}
                  </span>
                  
                  {/* Odd + Stake à direita */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-medium">@{aposta.odd.toFixed(2)}</span>
                    <span className="text-xs text-muted-foreground">{formatCurrencyWithMoeda(aposta.stake, aposta.bookmaker?.moeda || 'BRL')}</span>
                  </div>
                </div>
                
                {/* LINHA 3: Data/Hora + Lucro/ROI */}
                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <span className="text-xs text-muted-foreground">
                    {format(parseLocalDateTime(aposta.data_aposta), "dd/MM/yy HH:mm", { locale: ptBR })}
                  </span>
                  
                  {aposta.lucro_prejuizo !== null && aposta.status === "LIQUIDADA" && (
                    <div className="flex items-center gap-1">
                      <span className={cn("text-sm font-semibold", aposta.lucro_prejuizo >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {formatCurrencyWithMoeda(aposta.lucro_prejuizo, aposta.bookmaker?.moeda || 'BRL')}
                      </span>
                      {aposta.stake > 0 && (
                        <span className={cn("text-[10px]", aposta.lucro_prejuizo >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                          ({aposta.lucro_prejuizo >= 0 ? '+' : ''}{((aposta.lucro_prejuizo / aposta.stake) * 100).toFixed(1)}%)
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        }
        
        // Múltipla card - layout padronizado
        const multipla = item.data as ApostaMultipla;
        const multiplaParceiroNome = multipla.bookmaker?.parceiro?.nome ? getFirstLastName(multipla.bookmaker.parceiro.nome) : null;
        
        return (
          <div 
            key={multipla.id} 
            className="rounded-lg border cursor-pointer transition-colors p-3 hover:border-amber-500/50 border-amber-500/20"
            onClick={() => handleOpenMultiplaDialog(multipla)}
          >
            {/* Layout Padronizado: 3 linhas igual ApostaCard */}
            <div className="flex flex-col gap-2">
              
              {/* LINHA 1: Evento + Badges */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <p className="text-sm font-medium truncate uppercase">MÚLTIPLA</p>
                  <span className="text-xs text-muted-foreground shrink-0">• {multipla.selecoes.length} seleções</span>
                </div>
                
                {/* Badges alinhadas à direita */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] px-1.5 py-0">
                    <Coins className="h-2.5 w-2.5 mr-0.5" />
                    Bônus
                  </Badge>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-purple-500/30 text-purple-400 bg-purple-500/20 flex items-center gap-0.5">
                    <Layers className="h-2.5 w-2.5" />
                    {multipla.tipo_multipla || 'MULT'}
                  </Badge>
                  <Badge 
                    variant="outline"
                    className={cn("text-[10px] px-1.5 py-0",
                      multipla.resultado === 'GREEN' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                      multipla.resultado === 'RED' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                      'bg-blue-500/20 text-blue-400 border-blue-500/30'
                    )}
                  >
                    {multipla.resultado || 'Pendente'}
                  </Badge>
                </div>
              </div>
              
              {/* LINHA 2: Logo + Casa/Vínculo + Seleções inline + Odd + Stake */}
              <div className="flex items-center gap-3">
                {/* Logo */}
                {multipla.bookmaker?.bookmakers_catalogo?.logo_url ? (
                  <img 
                    src={multipla.bookmaker.bookmakers_catalogo.logo_url} 
                    alt={multipla.bookmaker?.nome || ''} 
                    className="h-10 w-10 rounded-lg object-contain bg-white/10 p-1 shrink-0"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                ) : (
                  <div className="h-10 w-10 rounded-lg bg-muted/30 flex items-center justify-center shrink-0">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                
                {/* Nome da casa + Vínculo abreviado */}
                <span className="text-sm text-muted-foreground truncate flex-1 min-w-0 uppercase">
                  {multipla.bookmaker?.nome}
                  {multiplaParceiroNome && ` - ${multiplaParceiroNome}`}
                </span>
                
                {/* Odd + Stake à direita */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-medium">@{multipla.odd_final.toFixed(2)}</span>
                  <span className="text-xs text-muted-foreground">{formatCurrencyWithMoeda(multipla.stake, multipla.bookmaker?.moeda || 'BRL')}</span>
                </div>
              </div>
              
              {/* LINHA 3: Data/Hora + Lucro/ROI */}
              <div className="flex items-center justify-between pt-2 border-t border-border/50">
                <span className="text-xs text-muted-foreground">
                  {format(parseLocalDateTime(multipla.data_aposta), "dd/MM/yy HH:mm", { locale: ptBR })}
                </span>
                
                {multipla.lucro_prejuizo !== null && multipla.status === "LIQUIDADA" && (
                  <div className="flex items-center gap-1">
                    <span className={cn("text-sm font-semibold", multipla.lucro_prejuizo >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                      {formatCurrencyWithMoeda(multipla.lucro_prejuizo, multipla.bookmaker?.moeda || 'BRL')}
                    </span>
                    {multipla.stake > 0 && (
                      <span className={cn("text-[10px]", multipla.lucro_prejuizo >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                        ({multipla.lucro_prejuizo >= 0 ? '+' : ''}{((multipla.lucro_prejuizo / multipla.stake) * 100).toFixed(1)}%)
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          {/* Sub-abas Abertas / Histórico - usando componente padronizado */}
          <div className="mb-3">
            <OperationsSubTabHeader
              subTab={subTab}
              onSubTabChange={setSubTab}
              openCount={apostasAbertas.length}
              historyCount={apostasHistorico.length + filteredFinalizedBonuses.length}
              viewMode={viewMode}
              onViewModeChange={(mode) => setViewMode(mode)}
              showViewToggle={true}
            />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-amber-400" />
              {subTab === "abertas" ? "Operações Abertas" : "Histórico de Operações"}
            </CardTitle>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Abertas Content */}
          {subTab === "abertas" && (
            <>
              {bookmakersInBonusMode.length === 0 && apostasAbertas.length === 0 ? (
                <div className="text-center py-10">
                  <Coins className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <h3 className="mt-4 text-lg font-semibold">Nenhuma casa em modo bônus</h3>
                  <p className="text-muted-foreground">
                    Adicione bônus a uma casa para ver apostas aqui
                  </p>
                </div>
              ) : apostasAbertas.length === 0 ? (
                <div className="text-center py-10">
                  <Clock className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <h3 className="mt-4 text-lg font-semibold">Nenhuma aposta aberta</h3>
                  <p className="text-muted-foreground">
                    Todas as apostas foram liquidadas
                  </p>
                </div>
              ) : (
                renderBetCards(apostasAbertas)
              )}
            </>
          )}

          {/* Histórico Content */}
          {subTab === "historico" && (
            <div className="space-y-6">
              {/* Apostas Liquidadas */}
              {apostasHistorico.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4" />
                    Apostas Liquidadas ({apostasHistorico.length})
                  </h4>
                  {renderBetCards(apostasHistorico)}
                </div>
              )}
              
              {/* Bônus Finalizados */}
              {filteredFinalizedBonuses.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                    <History className="h-4 w-4" />
                    Bônus Finalizados ({filteredFinalizedBonuses.length})
                  </h4>
                  <Card>
                    <CardContent className="pt-4">
                      <ScrollArea className="h-[400px]">
                        <div className="space-y-3">
                          {filteredFinalizedBonuses.map(bonus => (
                            <div key={bonus.id} className="flex items-center gap-4 p-4 rounded-lg bg-card border">
                              {/* Logo */}
                              {bonus.bookmaker_logo_url ? (
                                <img
                                  src={bonus.bookmaker_logo_url}
                                  alt={bonus.bookmaker_nome}
                                  className="h-10 w-10 rounded-lg object-contain bg-white p-1 flex-shrink-0"
                                />
                              ) : (
                                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                  <Building2 className="h-5 w-5 text-primary" />
                                </div>
                              )}

                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium">{bonus.bookmaker_nome}</span>
                                  <span className="text-muted-foreground">•</span>
                                  <span className="text-sm text-muted-foreground">{bonus.title || 'Bônus'}</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                                  {bonus.parceiro_nome && (
                                    <>
                                      <span>{bonus.parceiro_nome}</span>
                                      <span>•</span>
                                    </>
                                  )}
                                  {bonus.finalized_at && (
                                    <span>
                                      Finalizado em {format(parseISO(bonus.finalized_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Value */}
                              <div className="text-right flex-shrink-0">
                                <p className="font-bold">{formatCurrencyWithMoeda(bonus.bonus_amount, bonus.currency)}</p>
                                {getReasonBadge(bonus.finalize_reason)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>
              )}
              
              {/* Empty state for histórico */}
              {apostasHistorico.length === 0 && filteredFinalizedBonuses.length === 0 && (
                <div className="text-center py-10">
                  <History className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <h3 className="mt-4 text-lg font-semibold">Nenhum histórico</h3>
                  <p className="text-muted-foreground">
                    Apostas liquidadas e bônus finalizados aparecerão aqui
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs removidos - todos os formulários abrem em janela externa */}
    </div>
  );
}
