import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "sonner";
import { useCrossWindowSync } from "@/hooks/useCrossWindowSync";
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
import { liquidarSurebet, deletarAposta, reliquidarAposta, liquidarPernaSurebet, type LiquidarSurebetPernaInput } from "@/services/aposta";
import { calcularImpactoResultado } from "@/lib/bookmakerBalanceHelper";
import { useInvalidateBookmakerSaldos } from "@/hooks/useBookmakerSaldosQuery";
import { useBonusBalanceManager } from "@/hooks/useBonusBalanceManager";
import { type SurebetQuickResult } from "@/components/apostas/SurebetRowActionsMenu";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ApostaDialog } from "@/components/projeto-detalhe/ApostaDialog";
import { ApostaMultiplaDialog } from "@/components/projeto-detalhe/ApostaMultiplaDialog";
import { SurebetCard, SurebetData } from "@/components/projeto-detalhe/SurebetCard";
import { SurebetDialog } from "@/components/projeto-detalhe/SurebetDialog";
import { ResultadoPill } from "@/components/projeto-detalhe/ResultadoPill";
import { ApostaCard } from "@/components/projeto-detalhe/ApostaCard";
import { useProjectBonuses, FinalizeReason } from "@/hooks/useProjectBonuses";
import { cn, getFirstLastName } from "@/lib/utils";
import { 
  OperationsSubTabHeader,
  type HistorySubTab,
  HistoryDimensionalFilter,
  useHistoryDimensionalFilter,
} from "../operations";
import { parseLocalDateTime } from "@/utils/dateUtils";

interface BonusApostasTabProps {
  projetoId: string;
  dateRange?: { start: Date; end: Date } | null;
}

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
  estrategia?: string | null;
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
  workspace_id: string;
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

export function BonusApostasTab({ projetoId, dateRange }: BonusApostasTabProps) {
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
  
  // Filtros dimensionais independentes para o histórico
  const { dimensionalFilter, setDimensionalFilter } = useHistoryDimensionalFilter();

  // Hooks do motor financeiro unificado
  const invalidateSaldos = useInvalidateBookmakerSaldos();
  const { hasActiveRolloverBonus, atualizarProgressoRollover } = useBonusBalanceManager();

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
            id,
            aposta_id,
            bookmaker_id,
            selecao,
            selecao_livre,
            odd,
            stake,
            resultado,
            lucro_prejuizo,
            moeda,
            bookmakers (nome, moeda, parceiro:parceiros(nome))
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
            id: p.id,
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
            moeda: p.moeda || bookmaker?.moeda || 'BRL',
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
          workspace_id: surebet.workspace_id,
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
                workspace_id: surebet.workspace_id,
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

  // Hook centralizado para sincronização cross-window
  useCrossWindowSync({
    projetoId,
    onSync: handleApostaUpdated,
  });

  // Dimensional filter helpers
  const matchesDimensionalFilter = (bookmaker_id: string | undefined, parceiro_id: string | undefined) => {
    const { bookmakerIds, parceiroIds } = dimensionalFilter;
    if (bookmakerIds.length > 0 && bookmaker_id && !bookmakerIds.includes(bookmaker_id)) return false;
    if (parceiroIds.length > 0 && parceiro_id && !parceiroIds.includes(parceiro_id)) return false;
    if (parceiroIds.length > 0 && !parceiro_id) return false;
    return true;
  };

  // Filter apostas
  const filteredApostas = apostas.filter((aposta) => {
    const matchesSearch = 
      aposta.evento.toLowerCase().includes(searchTerm.toLowerCase()) ||
      aposta.esporte.toLowerCase().includes(searchTerm.toLowerCase()) ||
      aposta.selecao.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || aposta.status === statusFilter;
    const matchesResultado = resultadoFilter === "all" || aposta.resultado === resultadoFilter;
    const matchesTipo = tipoFilter === "todas" || tipoFilter === "simples";
    const matchesDim = matchesDimensionalFilter(aposta.bookmaker_id, aposta.bookmaker?.parceiro_id);
    return matchesSearch && matchesStatus && matchesResultado && matchesTipo && matchesDim;
  });

  // Filter multiplas
  const filteredMultiplas = apostasMultiplas.filter((am) => {
    const matchesSearch = am.selecoes.some(s => 
      s.descricao.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const matchesStatus = statusFilter === "all" || am.status === statusFilter;
    const matchesResultado = resultadoFilter === "all" || am.resultado === resultadoFilter;
    const matchesTipo = tipoFilter === "todas" || tipoFilter === "multiplas";
    const matchesDim = matchesDimensionalFilter(am.bookmaker_id, am.bookmaker?.parceiro_id);
    return (searchTerm === "" || matchesSearch) && matchesStatus && matchesResultado && matchesTipo && matchesDim;
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
    // Surebets: match if ANY perna matches the dimensional filter
    const matchesDim = dimensionalFilter.bookmakerIds.length === 0 && dimensionalFilter.parceiroIds.length === 0
      ? true
      : (sb.pernas || []).some(p => matchesDimensionalFilter(p.bookmaker_id, undefined));
    return matchesSearch && matchesStatus && matchesResultado && matchesTipo && matchesDim;
  });

  // Unify and sort
  const apostasUnificadasRaw: ApostaUnificada[] = [
    ...filteredApostas.map(a => ({ tipo: "simples" as const, data: a, data_aposta: a.data_aposta })),
    ...filteredMultiplas.map(am => ({ tipo: "multipla" as const, data: am, data_aposta: am.data_aposta })),
    ...filteredSurebets.map(sb => ({ tipo: "surebet" as const, data: sb, data_aposta: sb.data_operacao })),
  ].sort((a, b) => parseLocalDateTime(b.data_aposta).getTime() - parseLocalDateTime(a.data_aposta).getTime());

  // Apply date range filter (exclusive to Operações, does not affect Visão Geral)
  const apostasUnificadas = dateRange
    ? apostasUnificadasRaw.filter(item => {
        const itemDate = parseLocalDateTime(item.data_aposta);
        return itemDate >= dateRange.start && itemDate <= dateRange.end;
      })
    : apostasUnificadasRaw;

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
    if (!loading && apostasAbertas.length === 0 && apostasHistorico.length > 0 && subTab === 'abertas') {
      setSubTab('historico');
    }
  }, [loading, apostasAbertas.length, apostasHistorico.length]);

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
      const shortName = getFirstLastName(bk.parceiro?.nome || "");
      const nomeCompleto = shortName ? `${bk.nome} - ${shortName}` : bk.nome;
      map.set(bk.id, nomeCompleto);
    });
    return map;
  }, [bookmakers]);


  // Resolução rápida de apostas simples/múltiplas - USA RPC ATÔMICA + ROLLOVER (Motor Financeiro Unificado)
  const handleQuickResolve = useCallback(async (apostaId: string, resultado: string) => {
    try {
      const aposta = apostas.find(a => a.id === apostaId) || apostasMultiplas.find(am => am.id === apostaId);
      if (!aposta) return;

      const stake = aposta.stake || 0;
      const odd = 'odd' in aposta && aposta.odd ? aposta.odd : (aposta as ApostaMultipla).odd_final || 1;
      const bookmakerId = aposta.bookmaker_id;

      // Calcular lucro usando função canônica
      const lucro = calcularImpactoResultado(stake, odd, resultado);

      // 1. Liquidar via RPC atômica (atualiza aposta + registra no ledger + trigger atualiza saldo)
      const rpcResult = await reliquidarAposta(apostaId, resultado, lucro);

      if (!rpcResult.success) {
        toast.error(rpcResult.error?.message || "Erro ao liquidar aposta");
        return;
      }

      // 2. Atualizar rollover se houver bônus ativo para a casa
      if (bookmakerId && resultado !== "VOID") {
        const temBonusAtivo = await hasActiveRolloverBonus(projetoId, bookmakerId);
        if (temBonusAtivo) {
          await atualizarProgressoRollover(projetoId, bookmakerId, stake, odd);
        }
      }

      // 3. Atualizar lista local
      setApostas(prev => prev.map(a =>
        a.id === apostaId
          ? { ...a, resultado, lucro_prejuizo: lucro, status: "LIQUIDADA" }
          : a
      ));
      setApostasMultiplas(prev => prev.map(am =>
        am.id === apostaId
          ? { ...am, resultado, lucro_prejuizo: lucro, status: "LIQUIDADA" }
          : am
      ));

      // 4. Invalidar cache de saldos
      invalidateSaldos(projetoId);

      const resultLabel = {
        GREEN: "Green",
        RED: "Red",
        MEIO_GREEN: "½ Green",
        MEIO_RED: "½ Red",
        VOID: "Void"
      }[resultado] || resultado;

      toast.success(`Aposta marcada como ${resultLabel}`);
    } catch (error) {
      console.error("Erro ao resolver aposta:", error);
      toast.error("Erro ao atualizar resultado");
    }
  }, [apostas, apostasMultiplas, projetoId, invalidateSaldos, hasActiveRolloverBonus, atualizarProgressoRollover]);

  // Handler para deletar aposta simples/múltipla
  const handleDeleteAposta = useCallback(async (apostaId: string) => {
    try {
      const result = await deletarAposta(apostaId);
      if (result.success) {
        toast.success("Aposta excluída com sucesso");
        handleApostaUpdated();
      } else {
        const errorMsg = typeof result.error === 'string' ? result.error : result.error?.message || "Erro ao excluir aposta";
        toast.error(errorMsg);
      }
    } catch (error: any) {
      toast.error("Erro ao excluir aposta: " + error.message);
    }
  }, [handleApostaUpdated]);

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

  // Handler para liquidação granular por perna (inline pill) - Motor Financeiro Unificado
  const handleSurebetPernaResolve = useCallback(async (input: {
    pernaId: string;
    surebetId: string;
    bookmarkerId: string;
    resultado: string;
    stake: number;
    odd: number;
    moeda: string;
    resultadoAnterior: string | null;
    workspaceId: string;
    bookmakerNome?: string;
    silent?: boolean;
  }) => {
    try {
      const result = await liquidarPernaSurebet({
        surebet_id: input.surebetId,
        perna_id: input.pernaId,
        bookmaker_id: input.bookmarkerId,
        resultado: input.resultado as any,
        resultado_anterior: input.resultadoAnterior,
        stake: input.stake,
        odd: input.odd,
        moeda: input.moeda,
        workspace_id: input.workspaceId,
      });

      if (!result.success) {
        toast.error(result.error?.message || "Erro ao liquidar perna");
        return;
      }

      // Invalidar cache e recarregar
      invalidateSaldos(projetoId);
      handleApostaUpdated();

      // Atualizar rollover se houver bônus ativo
      if (input.bookmarkerId && input.resultado !== "VOID") {
        const temBonusAtivo = await hasActiveRolloverBonus(projetoId, input.bookmarkerId);
        if (temBonusAtivo) {
          await atualizarProgressoRollover(projetoId, input.bookmarkerId, input.stake, input.odd);
        }
      }

      const resultLabel = {
        GREEN: "Green", RED: "Red", MEIO_GREEN: "½ Green",
        MEIO_RED: "½ Red", VOID: "Void",
      }[input.resultado] || input.resultado;

      if (!input.silent) {
        const nome = input.bookmakerNome || '';
        toast.success(nome ? `${resultLabel} na ${nome}` : `Resultado alterado com sucesso`);
      }
    } catch (error: any) {
      console.error("Erro ao liquidar perna:", error);
      toast.error("Erro ao atualizar resultado da perna");
    }
  }, [projetoId, invalidateSaldos, handleApostaUpdated, hasActiveRolloverBonus, atualizarProgressoRollover]);

  // Handler para liquidação rápida de Surebet (menu cascata) - USA PER-PERNA (Motor Financeiro Unificado)
  const handleQuickResolveSurebet = useCallback(async (surebetId: string, quickResult: SurebetQuickResult) => {
    const surebet = surebets.find(sb => sb.id === surebetId);
    if (!surebet || !surebet.pernas || surebet.pernas.length === 0) {
      toast.error("Surebet não encontrada ou sem pernas");
      return;
    }

    try {
      const pernas = surebet.pernas.filter((p: any) => p.bookmaker_id && p.odd > 0);

      for (let i = 0; i < pernas.length; i++) {
        const perna = pernas[i];
        const isWinner = quickResult.winners.includes(i);
        const resultado = quickResult.type === "all_void" ? "VOID" : (isWinner ? "GREEN" : "RED");

        await handleSurebetPernaResolve({
          pernaId: perna.id,
          surebetId,
          bookmarkerId: perna.bookmaker_id!,
          resultado,
          stake: perna.stake,
          odd: perna.odd,
          moeda: perna.moeda || 'BRL',
          resultadoAnterior: perna.resultado,
          workspaceId: surebet.workspace_id!,
          silent: true,
        });
      }

      toast.success("Resultado da surebet alterado com sucesso");
    } catch (error: any) {
      console.error("Erro ao liquidar surebet:", error);
      toast.error("Erro ao liquidar surebet");
    }
  }, [surebets, handleSurebetPernaResolve]);

  // Handler para deletar Surebet
  const handleDeleteSurebet = async (surebetId: string) => {
    try {
      const result = await deletarAposta(surebetId);
      
      if (result.success) {
        toast.success("Surebet excluída com sucesso");
        handleApostaUpdated();
      } else {
        const errorMsg = typeof result.error === 'string' ? result.error : result.error?.message || "Erro ao excluir surebet";
        toast.error(errorMsg);
      }
    } catch (error: any) {
      toast.error("Erro ao excluir surebet: " + error.message);
    }
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
        ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3" 
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
              onQuickResolve={(surebetId, result) => handleQuickResolveSurebet(surebetId, result)}
              onPernaResultChange={handleSurebetPernaResolve}
              onDelete={handleDeleteSurebet}
            />
          );
        }
        
        // ===== APOSTA SIMPLES - Usando ApostaCard padronizado =====
        if (item.tipo === "simples") {
          const aposta = item.data as Aposta;
          const bookmakerBase = aposta.bookmaker?.nome?.split(" - ")[0] || aposta.bookmaker?.nome;
          const parceiroNome = aposta.bookmaker?.parceiro?.nome ? getFirstLastName(aposta.bookmaker.parceiro.nome) : null;
          const logoUrl = aposta.bookmaker?.bookmakers_catalogo?.logo_url;
          
          // Preparar dados para ApostaCard
          const apostaCardData = {
            id: aposta.id,
            evento: aposta.evento,
            esporte: aposta.esporte,
            selecao: aposta.selecao,
            odd: aposta.odd,
            stake: aposta.stake,
            data_aposta: aposta.data_aposta,
            resultado: aposta.resultado,
            status: aposta.status,
            lucro_prejuizo: aposta.lucro_prejuizo,
            estrategia: aposta.estrategia,
            bookmaker_nome: bookmakerBase,
            parceiro_nome: parceiroNome,
            moeda: aposta.bookmaker?.moeda || 'BRL',
            logo_url: logoUrl,
          };
          
          return (
            <ApostaCard
              key={aposta.id}
              aposta={apostaCardData}
              estrategia="BONUS"
              variant={viewMode === "cards" ? "card" : "list"}
              onEdit={() => handleOpenDialog(aposta)}
              onQuickResolve={handleQuickResolve}
              onDelete={handleDeleteAposta}
              formatCurrency={(val) => formatCurrencyWithMoeda(val, aposta.bookmaker?.moeda || 'BRL')}
            />
          );
        }
        
        // ===== APOSTA MÚLTIPLA - Usando ApostaCard padronizado =====
        const multipla = item.data as ApostaMultipla;
        const bookmakerBaseMultipla = multipla.bookmaker?.nome?.split(" - ")[0] || multipla.bookmaker?.nome;
        const parceiroNomeMultipla = multipla.bookmaker?.parceiro?.nome ? getFirstLastName(multipla.bookmaker.parceiro.nome) : null;
        const logoUrlMultipla = multipla.bookmaker?.bookmakers_catalogo?.logo_url;
        
        // Preparar dados para ApostaCard
        const multiplaCardData = {
          id: multipla.id,
          evento: `MÚLTIPLA ${multipla.tipo_multipla || ''}`,
          esporte: `${multipla.selecoes.length} seleções`,
          odd_final: multipla.odd_final,
          stake: multipla.stake,
          data_aposta: multipla.data_aposta,
          resultado: multipla.resultado,
          status: multipla.status,
          lucro_prejuizo: multipla.lucro_prejuizo,
          estrategia: multipla.estrategia,
          tipo_multipla: multipla.tipo_multipla,
          selecoes: multipla.selecoes,
          bookmaker_nome: bookmakerBaseMultipla,
          parceiro_nome: parceiroNomeMultipla,
          moeda: multipla.bookmaker?.moeda || 'BRL',
          logo_url: logoUrlMultipla,
        };
        
        return (
          <ApostaCard
            key={multipla.id}
            aposta={multiplaCardData}
            estrategia="BONUS"
            variant={viewMode === "cards" ? "card" : "list"}
            onEdit={() => handleOpenMultiplaDialog(multipla)}
            onQuickResolve={handleQuickResolve}
            onDelete={handleDeleteAposta}
            formatCurrency={(val) => formatCurrencyWithMoeda(val, multipla.bookmaker?.moeda || 'BRL')}
          />
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
              historyCount={apostasHistorico.length}
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
            <div className="space-y-4">
              {/* Filtros dimensionais independentes do histórico */}
              <HistoryDimensionalFilter
                projetoId={projetoId}
                value={dimensionalFilter}
                onChange={setDimensionalFilter}
                className="pb-3 border-b border-border/50"
              />
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
              
              {/* Empty state for histórico */}
              {apostasHistorico.length === 0 && (
                <div className="text-center py-10">
                  <History className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <h3 className="mt-4 text-lg font-semibold">Nenhum histórico</h3>
                  <p className="text-muted-foreground">
                    Apostas liquidadas aparecerão aqui
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
