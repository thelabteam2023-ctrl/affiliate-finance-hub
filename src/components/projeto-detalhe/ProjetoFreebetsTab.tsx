import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiSummaryBar } from "@/components/ui/kpi-summary-bar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCrossWindowSync } from "@/hooks/useCrossWindowSync";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Gift, Search, Building2, Target, CheckCircle2, Clock, 
  TrendingUp, Percent, LayoutGrid, List, Minimize2, BarChart3,
  LayoutDashboard, History, PanelLeft, LayoutList, Zap, Package,
  Plus, RefreshCw
} from "lucide-react";
import { startOfDay, endOfDay, subDays, startOfMonth, startOfYear } from "date-fns";
import { useFreebetViewPreferences, FreebetSubTab } from "@/hooks/useFreebetViewPreferences";
import { cn } from "@/lib/utils";
import { OperationsSubTabHeader, type HistorySubTab } from "./operations";
import { parseLocalDateTime } from "@/utils/dateUtils";
import { 
  FreebetApostaCard, 
  FreebetApostasList, 
  FreebetResumoPorCasa,
  FreebetGraficos,
  FreebetEstoqueView,
  FreebetDialog,
  ApostaOperacionalFreebet,
  FreebetRecebida,
  BookmakerComFreebet,
  BookmakerFreebetStats
} from "./freebets";
// Removido: Dialogs agora abrem em janelas externas
// import { ApostaDialog } from "@/components/projeto-detalhe/ApostaDialog";
// import { ApostaMultiplaDialog } from "@/components/projeto-detalhe/ApostaMultiplaDialog";
import { StandardTimeFilter, StandardPeriodFilter, getDateRangeFromPeriod, NavigationMode as FilterNavMode } from "./StandardTimeFilter";
import { DateRange } from "react-day-picker";

interface ProjetoFreebetsTabProps {
  projetoId: string;
  onDataChange?: () => void;
  refreshTrigger?: number;
  formatCurrency?: (value: number) => string;
}

// Fallback para formatação de moeda
const defaultFormatCurrency = (value: number): string => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

type NavigationMode = "tabs" | "sidebar";
type NavTabValue = "estoque" | "por-casa";

const NAV_STORAGE_KEY = "freebets-nav-mode";

const NAV_ITEMS = [
  { value: "estoque" as NavTabValue, label: "Estoque", icon: Package },
  { value: "por-casa" as NavTabValue, label: "Por Casa", icon: Building2 },
];

export function ProjetoFreebetsTab({ projetoId, onDataChange, refreshTrigger, formatCurrency: formatCurrencyProp }: ProjetoFreebetsTabProps) {
  const formatCurrency = formatCurrencyProp || defaultFormatCurrency;
  const [loading, setLoading] = useState(true);
  const loadedOnceRef = useRef(false);
  const [freebets, setFreebets] = useState<FreebetRecebida[]>([]);
  const [bookmakersComFreebet, setBookmakersComFreebet] = useState<BookmakerComFreebet[]>([]);
  const [apostasOperacionais, setApostasOperacionais] = useState<ApostaOperacionalFreebet[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [casaFilter, setCasaFilter] = useState<string>("todas");
  
  // Internal period filter (local to this tab)
  const [internalPeriod, setInternalPeriod] = useState<StandardPeriodFilter>("mes_atual");
  const [internalDateRange, setInternalDateRange] = useState<DateRange | undefined>();
  
  // Navigation mode (sidebar vs tabs)
  const [navMode, setNavMode] = useState<NavigationMode>(() => {
    const saved = localStorage.getItem(NAV_STORAGE_KEY);
    return (saved === "tabs" ? "tabs" : "sidebar") as NavigationMode;
  });
  const [activeNavTab, setActiveNavTab] = useState<NavTabValue>("estoque");
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  // Estados removidos - dialogs agora abrem em janelas externas
  // const [dialogOpen, setDialogOpen] = useState(false);
  // const [dialogMultiplaOpen, setDialogMultiplaOpen] = useState(false);
  // const [selectedAposta, setSelectedAposta] = useState<any>(null);
  // const [selectedApostaMultipla, setSelectedApostaMultipla] = useState<any>(null);
  const [selectedApostaMultipla, setSelectedApostaMultipla] = useState<any>(null);
  const [bookmakers, setBookmakers] = useState<any[]>([]);
  
  // Freebet dialog state
  const [freebetDialogOpen, setFreebetDialogOpen] = useState(false);
  const [freebetRefreshTrigger, setFreebetRefreshTrigger] = useState(0);
  const [preselectedBookmakerId, setPreselectedBookmakerId] = useState<string | undefined>();
  
  // View mode for "Por Casa" tab
  const [porCasaViewMode, setPorCasaViewMode] = useState<'card' | 'list'>('list');

  // Preferências de visualização (persistidas)
  const { 
    viewMode, setViewMode, 
    compactMode, toggleCompactMode,
    subTab, setSubTab 
  } = useFreebetViewPreferences();

  // Save nav mode preference
  useEffect(() => {
    localStorage.setItem(NAV_STORAGE_KEY, navMode);
  }, [navMode]);

  // Calcular range de datas baseado no filtro interno
  const dateRange = useMemo(() => {
    return getDateRangeFromPeriod(internalPeriod, internalDateRange);
  }, [internalPeriod, internalDateRange]);

  useEffect(() => {
    fetchData();
  }, [projetoId, refreshTrigger]);

  const fetchData = async () => {
    try {
      if (!loadedOnceRef.current) setLoading(true);
      await Promise.all([
        fetchFreebets(), 
        fetchBookmakersComFreebet(), 
        fetchApostasOperacionais(),
        fetchBookmakers()
      ]);
    } finally {
      setLoading(false);
      loadedOnceRef.current = true;
    }
  };

  const fetchBookmakers = async () => {
    try {
      const { data, error } = await supabase
        .from("bookmakers")
        .select(`
          id,
          nome,
          saldo_atual,
          saldo_freebet,
          parceiro:parceiros (nome),
          bookmakers_catalogo (logo_url)
        `)
        .eq("projeto_id", projetoId)
        .in("status", ["ativo", "ATIVO", "LIMITADA", "limitada"]);

      if (error) throw error;
      setBookmakers(data || []);
    } catch (error: any) {
      console.error("Erro ao carregar bookmakers:", error.message);
    }
  };

  const fetchFreebets = async () => {
    try {
      const { data, error } = await supabase
        .from("freebets_recebidas")
        .select(`
          id, bookmaker_id, valor, motivo, data_recebida, utilizada, 
          data_utilizacao, aposta_id, status, tem_rollover,
          bookmakers!freebets_recebidas_bookmaker_id_fkey (
            nome, parceiro_id,
            parceiros!bookmakers_parceiro_id_fkey (nome),
            bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url)
          )
        `)
        .eq("projeto_id", projetoId)
        .order("data_recebida", { ascending: false });

      if (error) throw error;

      const formatted: FreebetRecebida[] = (data || []).map((fb: any) => ({
        id: fb.id,
        bookmaker_id: fb.bookmaker_id,
        bookmaker_nome: fb.bookmakers?.nome || "Desconhecida",
        parceiro_nome: fb.bookmakers?.parceiros?.nome || null,
        logo_url: fb.bookmakers?.bookmakers_catalogo?.logo_url || null,
        valor: fb.valor,
        motivo: fb.motivo,
        data_recebida: fb.data_recebida,
        utilizada: fb.utilizada || false,
        data_utilizacao: fb.data_utilizacao,
        aposta_id: fb.aposta_id,
        status: fb.status || "LIBERADA",
        tem_rollover: fb.tem_rollover || false,
      }));

      setFreebets(formatted);
    } catch (error: any) {
      console.error("Erro ao buscar freebets:", error);
    }
  };

  const fetchBookmakersComFreebet = async () => {
    try {
      const { data, error } = await supabase
        .from("bookmakers")
        .select(`
          id, nome, saldo_freebet,
          parceiros!bookmakers_parceiro_id_fkey (nome),
          bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url)
        `)
        .eq("projeto_id", projetoId)
        .gt("saldo_freebet", 0);

      if (error) throw error;

      const formatted: BookmakerComFreebet[] = (data || []).map((bk: any) => ({
        id: bk.id,
        nome: bk.nome,
        parceiro_nome: bk.parceiros?.nome || null,
        logo_url: bk.bookmakers_catalogo?.logo_url || null,
        saldo_freebet: bk.saldo_freebet || 0,
      }));

      setBookmakersComFreebet(formatted);
    } catch (error: any) {
      console.error("Erro ao buscar bookmakers com freebet:", error);
    }
  };

  const fetchApostasOperacionais = async () => {
    try {
      // Usa tabela unificada para apostas de freebet
      const { data: apostasUnificadas, error: errorUnificadas } = await supabase
        .from("apostas_unificada")
        .select(`
          id, evento, mercado, selecao, odd, stake, lucro_prejuizo, valor_retorno,
          data_aposta, status, resultado, tipo_freebet, contexto_operacional,
          gerou_freebet, valor_freebet_gerada, bookmaker_id, estrategia, modo_entrada,
          esporte, forma_registro, lay_exchange, lay_odd, lay_stake, lay_liability,
          lay_comissao, back_comissao, back_em_exchange, selecoes, tipo_multipla
        `)
        .eq("projeto_id", projetoId)
        .or("contexto_operacional.eq.FREEBET,gerou_freebet.eq.true,tipo_freebet.not.is.null")
        .is("cancelled_at", null)
        .order("data_aposta", { ascending: false });

      if (errorUnificadas) throw errorUnificadas;

      // Buscar nomes dos bookmakers
      const bookmakerIds = [...new Set((apostasUnificadas || []).map((a: any) => a.bookmaker_id).filter(Boolean))];
      let bookmakerMap = new Map<string, { nome: string; parceiro_nome: string | null; logo_url: string | null }>();
      
      if (bookmakerIds.length > 0) {
        const { data: bookmakers } = await supabase
          .from("bookmakers")
          .select(`
            id, nome,
            parceiros!bookmakers_parceiro_id_fkey (nome),
            bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url)
          `)
          .in("id", bookmakerIds);
        
        bookmakerMap = new Map((bookmakers || []).map((b: any) => [
          b.id, 
          { 
            nome: b.nome, 
            parceiro_nome: b.parceiros?.nome || null, 
            logo_url: b.bookmakers_catalogo?.logo_url || null 
          }
        ]));
      }

      const todasApostas: ApostaOperacionalFreebet[] = (apostasUnificadas || []).map((ap: any) => {
        const bkInfo = ap.bookmaker_id ? bookmakerMap.get(ap.bookmaker_id) : null;
        const isMultipla = ap.forma_registro === 'MULTIPLA' || ap.tipo_multipla;
        const selecoes = Array.isArray(ap.selecoes) ? ap.selecoes : [];
        
        return {
          id: ap.id,
          tipo: isMultipla ? "multipla" as const : "simples" as const,
          evento: isMultipla 
            ? (selecoes[0]?.evento || `Múltipla (${selecoes.length} seleções)`)
            : (ap.evento || ""),
          mercado: isMultipla ? (selecoes[0]?.mercado || null) : ap.mercado,
          selecao: isMultipla 
            ? selecoes.map((s: any) => s.selecao || s.descricao).join(" + ") 
            : (ap.selecao || ""),
          odd: ap.odd ?? ap.odd_final ?? 0,
          stake: ap.stake ?? 0,
          lucro_prejuizo: ap.lucro_prejuizo,
          valor_retorno: ap.valor_retorno,
          data_aposta: ap.data_aposta,
          status: ap.status,
          resultado: ap.resultado,
          tipo_freebet: ap.tipo_freebet,
          bookmaker_id: ap.bookmaker_id,
          bookmaker_nome: bkInfo?.nome || "Desconhecida",
          logo_url: bkInfo?.logo_url || null,
          parceiro_nome: bkInfo?.parceiro_nome || null,
          gerou_freebet: ap.gerou_freebet || false,
          valor_freebet_gerada: ap.valor_freebet_gerada || null,
          estrategia: ap.estrategia || null,
          lado_aposta: ap.modo_entrada || null,
          contexto_operacional: ap.contexto_operacional || null,
          lay_exchange: ap.lay_exchange || null,
          lay_odd: ap.lay_odd || null,
          lay_stake: ap.lay_stake || null,
          lay_liability: ap.lay_liability || null,
          lay_comissao: ap.lay_comissao || null,
          back_comissao: ap.back_comissao || null,
          back_em_exchange: ap.back_em_exchange || null,
          esporte: ap.esporte || null,
          forma_registro: ap.forma_registro || null,
        };
      });

      setApostasOperacionais(todasApostas);
    } catch (error: any) {
      console.error("Erro ao buscar apostas operacionais:", error);
    }
  };

// formatCurrency agora vem como prop

  // Handlers para atualização de resultado e edição
  const handleApostaUpdated = () => {
    fetchData();
    onDataChange?.();
  };

  // Abrir formulário em janela externa (padronizado com Surebet)
  const handleEditClick = useCallback((aposta: ApostaOperacionalFreebet) => {
    if (aposta.tipo === "multipla") {
      const url = `/janela/multipla/${aposta.id}?projetoId=${encodeURIComponent(projetoId)}&tab=freebets&estrategia=FREEBET`;
      window.open(url, '_blank', 'width=780,height=900,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes');
    } else {
      const url = `/janela/aposta/${aposta.id}?projetoId=${encodeURIComponent(projetoId)}&tab=freebets&estrategia=FREEBET`;
      window.open(url, '_blank', 'width=780,height=900,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes');
    }
  }, [projetoId]);

  // Hook centralizado para sincronização cross-window
  useCrossWindowSync({
    projetoId,
    onSync: useCallback(() => {
      fetchData();
      onDataChange?.();
    }, [onDataChange]),
  });

  // Navigation handlers
  const handleModeToggle = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setNavMode(prev => prev === "tabs" ? "sidebar" : "tabs");
      setTimeout(() => setIsTransitioning(false), 50);
    }, 150);
  };

  const handleNavTabChange = (value: string) => {
    if (value !== activeNavTab) {
      setIsTransitioning(true);
      setActiveNavTab(value as NavTabValue);
      setTimeout(() => setIsTransitioning(false), 180);
    }
  };

  // Handler para abrir o dialog de freebet
  const handleAddFreebet = (bookmakerId?: string) => {
    setPreselectedBookmakerId(bookmakerId);
    setFreebetDialogOpen(true);
  };

  const handleFreebetSuccess = () => {
    fetchData();
    setFreebetRefreshTrigger(prev => prev + 1);
    onDataChange?.();
  };

  // Filtrar por período
  const freebetsNoPeriodo = useMemo(() => {
    if (!dateRange) return freebets;
    return freebets.filter(fb => {
      const dataRecebida = new Date(fb.data_recebida);
      return dataRecebida >= dateRange.start && dataRecebida <= dateRange.end;
    });
  }, [freebets, dateRange]);

  const apostasNoPeriodo = useMemo(() => {
    if (!dateRange) return apostasOperacionais;
    return apostasOperacionais.filter(ap => {
      const dataAposta = parseLocalDateTime(ap.data_aposta);
      return dataAposta >= dateRange.start && dataAposta <= dateRange.end;
    });
  }, [apostasOperacionais, dateRange]);

  // Casas disponíveis para filtro
  const casasDisponiveis = [...new Set(apostasNoPeriodo.map(ap => ap.bookmaker_nome))];

  // Filtrar apostas
  const apostasFiltradas = useMemo(() => {
    return apostasNoPeriodo.filter(ap => {
      if (casaFilter !== "todas" && ap.bookmaker_nome !== casaFilter) return false;
      
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        return (
          ap.evento.toLowerCase().includes(search) ||
          ap.selecao.toLowerCase().includes(search) ||
          ap.mercado?.toLowerCase().includes(search) ||
          ap.bookmaker_nome.toLowerCase().includes(search) ||
          ap.parceiro_nome?.toLowerCase().includes(search)
        );
      }
      
      return true;
    });
  }, [apostasNoPeriodo, casaFilter, searchTerm]);

  // Apostas por status
  const apostasAtivas = apostasFiltradas.filter(ap => ap.status === "PENDENTE" || ap.resultado === "PENDENTE");
  const apostasHistorico = apostasFiltradas.filter(ap => ap.status === "LIQUIDADA" && ap.resultado !== "PENDENTE");
  
  // Total counts without casa filter for badge comparison
  const totalAtivas = useMemo(() => apostasNoPeriodo.filter(ap => ap.status === "PENDENTE" || ap.resultado === "PENDENTE").length, [apostasNoPeriodo]);
  const totalHistorico = useMemo(() => apostasNoPeriodo.filter(ap => ap.status === "LIQUIDADA" && ap.resultado !== "PENDENTE").length, [apostasNoPeriodo]);

  // Auto-switch to history tab when no active operations (only on initial load)
  useEffect(() => {
    if (!loading && apostasAtivas.length === 0 && apostasHistorico.length > 0 && subTab === 'ativas') {
      setSubTab('historico');
    }
  }, [loading, apostasAtivas.length, apostasHistorico.length]);

  // Métricas globais - separar EXTRAÇÕES de QUALIFICADORAS
  const metricas = useMemo(() => {
    const freebetsLiberadas = freebetsNoPeriodo.filter(fb => fb.status === "LIBERADA");
    const totalRecebido = freebetsLiberadas.reduce((acc, fb) => acc + fb.valor, 0);
    
    // EXTRAÇÃO: aposta que USA freebet (tipo_freebet não null) E NÃO é qualificadora
    const apostasExtracao = apostasNoPeriodo.filter(ap => ap.tipo_freebet && !ap.gerou_freebet);
    
    // QUALIFICADORAS: apostas que GERAM freebet
    const apostasQualificadoras = apostasNoPeriodo.filter(ap => ap.gerou_freebet);
    
    const extracaoFinalizadas = apostasExtracao.filter(ap => 
      ap.status === "LIQUIDADA" && ap.resultado && ap.resultado !== "PENDENTE"
    );
    
    const qualificadorasFinalizadas = apostasQualificadoras.filter(ap => 
      ap.status === "LIQUIDADA" && ap.resultado && ap.resultado !== "PENDENTE"
    );
    
    // Calcular valor extraído das apostas de EXTRAÇÃO
    const totalExtraido = extracaoFinalizadas.reduce((acc, ap) => {
      const isGreen = ap.resultado === "GREEN" || ap.resultado === "MEIO_GREEN" || ap.resultado === "GREEN_BOOKMAKER";
      const isRed = ap.resultado === "RED" || ap.resultado === "MEIO_RED" || ap.resultado === "RED_BOOKMAKER";
      
      if (isGreen) {
        return acc + Math.max(0, ap.lucro_prejuizo || 0);
      } else if (isRed) {
        // Em matched betting, quando freebet perde, o lay ganha
        if (ap.lay_odd && ap.lay_stake) {
          const comissao = ap.lay_comissao || 0;
          const lucroLay = ap.lay_stake * (1 - comissao / 100);
          return acc + Math.max(0, lucroLay);
        }
      }
      return acc;
    }, 0);
    
    // Calcular juice das QUALIFICADORAS (pode ser negativo - é o custo para conseguir a freebet)
    const juiceQualificadoras = qualificadorasFinalizadas.reduce((acc, ap) => {
      return acc + (ap.lucro_prejuizo || 0);
    }, 0);
    
    const taxaExtracao = totalRecebido > 0 ? (totalExtraido / totalRecebido) * 100 : 0;
    
    // Contagens separadas
    const totalExtracoes = apostasExtracao.length;
    const totalQualificadoras = apostasQualificadoras.length;
    
    const extracoesGanhas = apostasExtracao.filter(ap => 
      ap.resultado === "GREEN" || ap.resultado === "MEIO_GREEN" || ap.resultado === "GREEN_BOOKMAKER"
    ).length;
    const extracoesPerdidas = apostasExtracao.filter(ap => 
      ap.resultado === "RED" || ap.resultado === "MEIO_RED" || ap.resultado === "RED_BOOKMAKER"
    ).length;
    const extracoesPendentes = apostasExtracao.filter(ap => 
      ap.status === "PENDENTE" || !ap.resultado
    ).length;
    
    const taxaAcerto = totalExtracoes > 0 ? (extracoesGanhas / totalExtracoes) * 100 : 0;

    return {
      totalRecebido,
      totalExtraido,
      juiceQualificadoras,
      lucroTotal: totalExtraido + juiceQualificadoras,
      taxaExtracao,
      totalExtracoes,
      totalQualificadoras,
      extracoesGanhas,
      extracoesPerdidas,
      extracoesPendentes,
      taxaAcerto
    };
  }, [freebetsNoPeriodo, apostasNoPeriodo]);

  // Estatísticas por casa
  const statsPorCasa = useMemo((): BookmakerFreebetStats[] => {
    const casasMap = new Map<string, BookmakerFreebetStats>();
    
    // Agregar freebets recebidas
    freebetsNoPeriodo.forEach(fb => {
      if (fb.status !== "LIBERADA") return;
      
      const existing = casasMap.get(fb.bookmaker_id) || {
        bookmaker_id: fb.bookmaker_id,
        bookmaker_nome: fb.bookmaker_nome,
        logo_url: fb.logo_url,
        parceiro_nome: fb.parceiro_nome,
        total_freebets_recebidas: 0,
        valor_total_recebido: 0,
        apostas_realizadas: 0,
        apostas_ganhas: 0,
        apostas_perdidas: 0,
        apostas_pendentes: 0,
        valor_total_extraido: 0,
        taxa_extracao: 0,
        taxa_conversao: 0,
        saldo_atual: 0,
      };
      
      existing.total_freebets_recebidas += 1;
      existing.valor_total_recebido += fb.valor;
      
      casasMap.set(fb.bookmaker_id, existing);
    });
    
    // Agregar apostas - SOMENTE apostas de EXTRAÇÃO (que usam freebet E não são qualificadoras)
    apostasNoPeriodo.forEach(ap => {
      const existing = casasMap.get(ap.bookmaker_id);
      if (!existing) return;
      
      // Só conta como extração se a aposta USOU uma freebet E NÃO é qualificadora
      // Apostas qualificadoras (gerou_freebet = true) não contam como extração
      if (!ap.tipo_freebet || ap.gerou_freebet) return;
      
      existing.apostas_realizadas += 1;
      
      // Verificar resultado - considerar todos os tipos de GREEN/RED
      const isGreen = ap.resultado === "GREEN" || ap.resultado === "MEIO_GREEN" || ap.resultado === "GREEN_BOOKMAKER";
      const isRed = ap.resultado === "RED" || ap.resultado === "MEIO_RED" || ap.resultado === "RED_BOOKMAKER";
      
      // Para matched betting com freebet:
      // O "valor extraído" é o lucro líquido da operação de extração
      if (isGreen) {
        existing.apostas_ganhas += 1;
        // Lucro positivo: freebet ganhou, usamos o valor direto
        existing.valor_total_extraido += Math.max(0, ap.lucro_prejuizo || 0);
      } else if (isRed) {
        existing.apostas_perdidas += 1;
        // Freebet perdeu, mas houve extração via lay na exchange
        if (ap.lay_stake && ap.lay_odd) {
          const comissao = ap.lay_comissao || 0;
          const lucroLay = ap.lay_stake * (1 - comissao / 100);
          existing.valor_total_extraido += Math.max(0, lucroLay);
        } else {
          existing.valor_total_extraido += Math.max(0, ap.lucro_prejuizo || 0);
        }
      } else if (ap.status === "PENDENTE" || !ap.resultado) {
        existing.apostas_pendentes += 1;
      }
    });
    
    // Adicionar saldo atual de bookmakers
    bookmakersComFreebet.forEach(bk => {
      const existing = casasMap.get(bk.id);
      if (existing) {
        existing.saldo_atual = bk.saldo_freebet;
      }
    });
    
    // Calcular taxas
    return Array.from(casasMap.values())
      .map(stat => ({
        ...stat,
        taxa_extracao: stat.valor_total_recebido > 0 
          ? (stat.valor_total_extraido / stat.valor_total_recebido) * 100 
          : 0,
        taxa_conversao: stat.apostas_realizadas > 0 
          ? (stat.apostas_ganhas / stat.apostas_realizadas) * 100 
          : 0
      }))
      .sort((a, b) => b.valor_total_recebido - a.valor_total_recebido);
  }, [freebetsNoPeriodo, apostasNoPeriodo, bookmakersComFreebet]);

  // Estoque atual
  const totalFreebetDisponivel = bookmakersComFreebet.reduce((acc, bk) => acc + bk.saldo_freebet, 0);
  const casasComFreebet = bookmakersComFreebet.length;
  const freebetsUtilizadas = freebetsNoPeriodo.filter(f => f.utilizada).length;
  const freebetsDisponiveis = freebetsNoPeriodo.filter(f => !f.utilizada).length;

  // Mode toggle button component
  const modeToggle = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleModeToggle}
          className="h-8 w-8 p-0 text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          {navMode === "tabs" ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <LayoutList className="h-4 w-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {navMode === "tabs" ? "Modo Gestão" : "Modo Compacto"}
      </TooltipContent>
    </Tooltip>
  );

  // Period filter component using StandardTimeFilter
  const periodFilterComponent = (
    <StandardTimeFilter
      period={internalPeriod}
      onPeriodChange={setInternalPeriod}
      customDateRange={internalDateRange}
      onCustomDateRangeChange={setInternalDateRange}
    />
  );

  // Main content renderer based on active tab
  const renderMainContent = () => {
    const contentClass = cn(
      "transition-all duration-200 ease-out",
      isTransitioning ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
    );

    return (
      <div className={cn("min-h-[400px]", contentClass)}>
        {periodFilterComponent}

        {activeNavTab === "estoque" && (
          <FreebetEstoqueView
            projetoId={projetoId}
            formatCurrency={formatCurrency}
            dateRange={dateRange}
            onAddFreebet={handleAddFreebet}
            refreshTrigger={freebetRefreshTrigger}
          />
        )}
        {activeNavTab === "por-casa" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Análise por Casa</h3>
                <Badge variant="secondary">{statsPorCasa.length} casas</Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPorCasaViewMode(porCasaViewMode === "list" ? "card" : "list")}
                className="h-8 w-8 p-0"
              >
                {porCasaViewMode === "list" ? (
                  <LayoutGrid className="h-4 w-4" />
                ) : (
                  <List className="h-4 w-4" />
                )}
              </Button>
            </div>
            <FreebetResumoPorCasa 
              stats={statsPorCasa} 
              formatCurrency={formatCurrency}
              viewMode={porCasaViewMode}
            />
          </div>
        )}
      </div>
    );
  };

  // Visão Geral content
  const renderVisaoGeral = () => (
    <div className="space-y-6">
      {/* KPIs - Faixa compacta */}
      <KpiSummaryBar
        items={[
          {
            label: "Recebido",
            value: formatCurrency(metricas.totalRecebido),
            valueClassName: "text-amber-500",
            subtitle: <span className="text-muted-foreground">{freebetsNoPeriodo.length} freebets</span>,
          },
          {
            label: "Extraído",
            value: formatCurrency(metricas.totalExtraido),
            valueClassName: "text-emerald-500",
            subtitle: <span className="text-muted-foreground">{metricas.extracoesGanhas} extração(s)</span>,
          },
          {
            label: "Juice Qualif.",
            value: formatCurrency(metricas.juiceQualificadoras),
            valueClassName: metricas.juiceQualificadoras >= 0 ? "text-emerald-500" : "text-red-500",
            subtitle: <span className="text-muted-foreground">{metricas.totalQualificadoras} qualificadora(s)</span>,
          },
          {
            label: "Taxa Extração",
            value: `${metricas.taxaExtracao.toFixed(1)}%`,
            valueClassName: metricas.taxaExtracao >= 70 ? "text-emerald-500" : metricas.taxaExtracao >= 50 ? "text-amber-500" : "text-red-500",
            subtitle: <span className="text-muted-foreground">Acerto: {metricas.taxaAcerto.toFixed(0)}%</span>,
          },
          {
            label: "Extrações",
            value: metricas.totalExtracoes,
            subtitle: (
              <div className="flex items-center gap-2">
                {metricas.extracoesPendentes > 0 && <span className="text-blue-400">{metricas.extracoesPendentes} Pend.</span>}
                <span className="inline-flex items-center gap-0.5 text-emerald-500 font-semibold">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {metricas.extracoesGanhas}
                </span>
                <span className="inline-flex items-center gap-0.5 text-red-500 font-semibold">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
                  {metricas.extracoesPerdidas}
                </span>
              </div>
            ),
          },
          {
            label: "Saldo Atual",
            value: formatCurrency(totalFreebetDisponivel),
            valueClassName: "text-amber-500",
            subtitle: <span className="text-muted-foreground">{casasComFreebet} casas</span>,
          },
          {
            label: "Freebets",
            value: freebetsNoPeriodo.length,
            subtitle: (
              <span className="text-muted-foreground">
                <span className="text-emerald-500">{freebetsDisponiveis}</span> / {freebetsUtilizadas}
              </span>
            ),
          },
        ]}
      />

      {/* Gráfico Curva de Extração + Freebets Disponíveis (lado a lado) */}
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* Gráfico Principal */}
        <FreebetGraficos 
          apostas={apostasNoPeriodo} 
          formatCurrency={formatCurrency}
          dateRange={dateRange}
          freebets={freebetsNoPeriodo}
        />

        {/* Freebets Disponíveis - Container Lateral */}
        <div className="hidden lg:block">
          <Card className="sticky top-4 border-amber-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Gift className="h-4 w-4 text-amber-400" />
                Freebets Disponíveis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {bookmakersComFreebet.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">Nenhuma freebet disponível</p>
              ) : (
                <>
                  {bookmakersComFreebet.map(bk => (
                    <div 
                      key={bk.id} 
                      className="px-3 py-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {bk.logo_url ? (
                          <img src={bk.logo_url} alt={bk.nome} className="h-6 w-6 rounded object-contain logo-blend p-0.5" />
                        ) : (
                          <Gift className="h-5 w-5 text-amber-400" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{bk.nome}</p>
                          {bk.parceiro_nome && (
                            <p className="text-[10px] text-muted-foreground truncate">{bk.parceiro_nome}</p>
                          )}
                        </div>
                        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs font-bold shrink-0">
                          {formatCurrency(bk.saldo_freebet)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                  {/* Total */}
                  <div className="pt-2 mt-2 border-t border-amber-500/20">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Total</span>
                      <span className="font-bold text-amber-400">{formatCurrency(totalFreebetDisponivel)}</span>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

    </div>
  );

  // Apostas content with sub-tabs
  const renderApostas = () => (
    <Card>
      <CardHeader className="pb-3">
        {/* Sub-abas Abertas / Histórico - usando componente padronizado */}
        <div className="mb-3">
          <OperationsSubTabHeader
            subTab={subTab === "ativas" ? "abertas" : "historico"}
            onSubTabChange={(tab) => setSubTab(tab === "abertas" ? "ativas" : "historico")}
            openCount={apostasAtivas.length}
            totalOpenCount={totalAtivas}
            historyCount={apostasHistorico.length}
            totalHistoryCount={totalHistorico}
            viewMode={viewMode === "card" ? "cards" : "list"}
            onViewModeChange={(mode) => setViewMode(mode === "cards" ? "card" : "list")}
            showViewToggle={true}
          />
        </div>
        
        {/* Título do Card */}
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          Centro de Inteligência Freebet
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Conteúdo: Apostas Ativas */}
        {subTab === "ativas" && (
          <>
            {apostasAtivas.length === 0 ? (
              <div className="text-center py-12 border rounded-lg bg-muted/5">
                <Clock className="mx-auto h-10 w-10 text-muted-foreground/30" />
                <p className="mt-3 text-sm text-muted-foreground">Nenhuma aposta pendente</p>
              </div>
            ) : viewMode === "list" ? (
              <FreebetApostasList 
                apostas={apostasAtivas} 
                projetoId={projetoId}
                formatCurrency={formatCurrency}
                onResultadoUpdated={handleApostaUpdated}
                onEditClick={handleEditClick}
              />
            ) : (
              <div className={`grid gap-3 ${compactMode ? 'space-y-0' : 'md:grid-cols-2 lg:grid-cols-3'}`}>
                {apostasAtivas.map(aposta => (
                  <FreebetApostaCard 
                    key={aposta.id} 
                    aposta={aposta} 
                    projetoId={projetoId}
                    compact={compactMode}
                    formatCurrency={formatCurrency}
                    onResultadoUpdated={handleApostaUpdated}
                    onEditClick={handleEditClick}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Conteúdo: Histórico */}
        {subTab === "historico" && (
          <>
            {apostasHistorico.length === 0 ? (
              <div className="text-center py-12 border rounded-lg bg-muted/5">
                <CheckCircle2 className="mx-auto h-10 w-10 text-muted-foreground/30" />
                <p className="mt-3 text-sm text-muted-foreground">Nenhuma aposta finalizada</p>
              </div>
            ) : viewMode === "list" ? (
              <FreebetApostasList 
                apostas={apostasHistorico} 
                projetoId={projetoId}
                formatCurrency={formatCurrency}
                onResultadoUpdated={handleApostaUpdated}
                onEditClick={handleEditClick}
              />
            ) : (
              <div className={`grid gap-3 ${compactMode ? 'space-y-0' : 'md:grid-cols-2 lg:grid-cols-3'}`}>
                {apostasHistorico.map(aposta => (
                  <FreebetApostaCard 
                    key={aposta.id} 
                    aposta={aposta} 
                    projetoId={projetoId}
                    compact={compactMode}
                    formatCurrency={formatCurrency}
                    onResultadoUpdated={handleApostaUpdated}
                    onEditClick={handleEditClick}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  // Mode: Slim Tabs
  if (navMode === "tabs") {
    return (
      <div className="space-y-6">
        {/* Header - Same pattern as Giros Grátis */}
      {/* Header - Tudo em uma linha */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Freebets</h2>
          <p className="text-sm text-muted-foreground">
            Gerencie freebets recebidas e acompanhe o estoque
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchData}
              disabled={loading}
              className="text-muted-foreground"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button onClick={() => setFreebetDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Freebet
            </Button>
          </div>
        </div>
      </div>

      <Tabs value={activeNavTab} onValueChange={handleNavTabChange} className="space-y-6">
        <div className="flex items-center justify-between border-b border-border/50">
          <TabsList className="bg-transparent border-0 rounded-none p-0 h-auto gap-6">
            {NAV_ITEMS.map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className="bg-transparent border-0 rounded-none px-1 pb-3 pt-1 h-auto shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none text-muted-foreground/70 data-[state=active]:text-foreground transition-colors"
              >
                <item.icon className="h-4 w-4 mr-2 opacity-60" />
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {modeToggle}
        </div>

          <TabsContent value={activeNavTab} className="mt-0">
            {renderMainContent()}
          </TabsContent>
        </Tabs>

        {/* FreebetDialog mantido - é específico para adicionar freebets */}
        <FreebetDialog
          open={freebetDialogOpen}
          onOpenChange={setFreebetDialogOpen}
          projetoId={projetoId}
          onSuccess={handleFreebetSuccess}
          preselectedBookmakerId={preselectedBookmakerId}
        />
      </div>
    );
  }

  // Mode: Sidebar
  return (
    <div className="space-y-6">
      {/* Header - Tudo em uma linha */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Freebets</h2>
          <p className="text-sm text-muted-foreground">
            Gerencie freebets recebidas e acompanhe o estoque
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchData}
              disabled={loading}
              className="text-muted-foreground"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button onClick={() => setFreebetDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Freebet
            </Button>
          </div>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Sidebar Navigation */}
        <div className="w-52 shrink-0 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
                Navegação
              </span>
              {modeToggle}
            </div>
            <nav className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const isActive = activeNavTab === item.value;
                return (
                  <button
                    key={item.value}
                    onClick={() => handleNavTabChange(item.value)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                      isActive
                        ? "bg-accent/10 text-foreground shadow-sm"
                        : "text-muted-foreground/70 hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <item.icon className={cn(
                      "h-4 w-4 transition-colors",
                      isActive ? "text-accent" : "opacity-60"
                    )} />
                    <span className="flex-1 text-left">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-w-0">
          {renderMainContent()}
        </div>
      </div>

      {/* FreebetDialog mantido - é específico para adicionar freebets */}
      <FreebetDialog
        open={freebetDialogOpen}
        onOpenChange={setFreebetDialogOpen}
        projetoId={projetoId}
        onSuccess={handleFreebetSuccess}
        preselectedBookmakerId={preselectedBookmakerId}
      />
    </div>
  );
}
