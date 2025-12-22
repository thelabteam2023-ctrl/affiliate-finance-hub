import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Gift, Search, Building2, User, Calendar, Target, CheckCircle2, Clock, TrendingUp, Percent, XCircle, Trophy, AlertTriangle, CircleDot } from "lucide-react";
import { format, startOfDay, endOfDay, subDays, startOfMonth, startOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ProjetoFreebetsTabProps {
  projetoId: string;
  periodFilter?: string;
  customDateRange?: { start: Date; end: Date } | null;
}

interface FreebetRecebida {
  id: string;
  bookmaker_id: string;
  bookmaker_nome: string;
  parceiro_nome: string | null;
  logo_url: string | null;
  valor: number;
  motivo: string;
  data_recebida: string;
  utilizada: boolean;
  data_utilizacao: string | null;
  aposta_id: string | null;
  status: "PENDENTE" | "LIBERADA" | "NAO_LIBERADA";
}

interface BookmakerComFreebet {
  id: string;
  nome: string;
  parceiro_nome: string | null;
  logo_url: string | null;
  saldo_freebet: number;
}

// Interface expandida para apostas operacionais com freebet
interface ApostaOperacionalFreebet {
  id: string;
  tipo: "simples" | "multipla";
  evento: string;
  mercado: string | null;
  selecao: string;
  odd: number;
  stake: number;
  lucro_prejuizo: number | null;
  valor_retorno: number | null;
  data_aposta: string;
  status: string;
  resultado: string | null;
  tipo_freebet: string | null;
  bookmaker_nome: string;
  logo_url: string | null;
  parceiro_nome: string | null;
}

export function ProjetoFreebetsTab({ projetoId, periodFilter = "tudo", customDateRange }: ProjetoFreebetsTabProps) {
  const [loading, setLoading] = useState(true);
  const [freebets, setFreebets] = useState<FreebetRecebida[]>([]);
  const [bookmakersComFreebet, setBookmakersComFreebet] = useState<BookmakerComFreebet[]>([]);
  const [apostasOperacionais, setApostasOperacionais] = useState<ApostaOperacionalFreebet[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todas" | "pendente" | "liquidada">("todas");
  const [resultadoFilter, setResultadoFilter] = useState<"todas" | "ganhas" | "perdidas">("todas");
  const [casaFilter, setCasaFilter] = useState<string>("todas");

  // Calcular range de datas baseado no filtro
  const dateRange = useMemo(() => {
    const now = new Date();
    const today = startOfDay(now);
    
    switch (periodFilter) {
      case "hoje":
        return { start: today, end: endOfDay(now) };
      case "ontem":
        const yesterday = subDays(today, 1);
        return { start: yesterday, end: endOfDay(yesterday) };
      case "7dias":
        return { start: subDays(today, 7), end: endOfDay(now) };
      case "mes":
        return { start: startOfMonth(now), end: endOfDay(now) };
      case "ano":
        return { start: startOfYear(now), end: endOfDay(now) };
      case "periodo":
        if (customDateRange) {
          return { start: customDateRange.start, end: endOfDay(customDateRange.end) };
        }
        return null;
      default:
        return null; // "tudo"
    }
  }, [periodFilter, customDateRange]);

  useEffect(() => {
    fetchData();
  }, [projetoId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        fetchFreebets(), 
        fetchBookmakersComFreebet(), 
        fetchApostasOperacionais()
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchFreebets = async () => {
    try {
      const { data, error } = await supabase
        .from("freebets_recebidas")
        .select(`
          id,
          bookmaker_id,
          valor,
          motivo,
          data_recebida,
          utilizada,
          data_utilizacao,
          aposta_id,
          status,
          bookmakers!freebets_recebidas_bookmaker_id_fkey (
            nome,
            parceiro_id,
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
          id,
          nome,
          saldo_freebet,
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

  // Buscar apostas OPERACIONAIS com contexto freebet (não eventos financeiros)
  const fetchApostasOperacionais = async () => {
    try {
      // Buscar apostas simples com contexto_operacional = FREEBET
      const { data: apostasSimples, error: errorSimples } = await supabase
        .from("apostas")
        .select(`
          id,
          evento,
          mercado,
          selecao,
          odd,
          stake,
          lucro_prejuizo,
          valor_retorno,
          data_aposta,
          status,
          resultado,
          tipo_freebet,
          contexto_operacional,
          bookmakers!apostas_bookmaker_id_fkey (
            nome,
            parceiros!bookmakers_parceiro_id_fkey (nome),
            bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url)
          )
        `)
        .eq("projeto_id", projetoId)
        .eq("contexto_operacional", "FREEBET")
        .is("cancelled_at", null)
        .order("data_aposta", { ascending: false });

      if (errorSimples) throw errorSimples;

      // Buscar apostas múltiplas com contexto_operacional = FREEBET
      const { data: apostasMultiplas, error: errorMultiplas } = await supabase
        .from("apostas_multiplas")
        .select(`
          id,
          selecoes,
          odd_final,
          stake,
          lucro_prejuizo,
          valor_retorno,
          data_aposta,
          status,
          resultado,
          tipo_freebet,
          contexto_operacional,
          bookmakers!apostas_multiplas_bookmaker_id_fkey (
            nome,
            parceiros!bookmakers_parceiro_id_fkey (nome),
            bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url)
          )
        `)
        .eq("projeto_id", projetoId)
        .eq("contexto_operacional", "FREEBET")
        .is("cancelled_at", null)
        .order("data_aposta", { ascending: false });

      if (errorMultiplas) throw errorMultiplas;

      // Formatar apostas simples
      const simplesFormatted: ApostaOperacionalFreebet[] = (apostasSimples || []).map((ap: any) => ({
        id: ap.id,
        tipo: "simples" as const,
        evento: ap.evento,
        mercado: ap.mercado,
        selecao: ap.selecao,
        odd: ap.odd,
        stake: ap.stake,
        lucro_prejuizo: ap.lucro_prejuizo,
        valor_retorno: ap.valor_retorno,
        data_aposta: ap.data_aposta,
        status: ap.status,
        resultado: ap.resultado,
        tipo_freebet: ap.tipo_freebet,
        bookmaker_nome: ap.bookmakers?.nome || "Desconhecida",
        logo_url: ap.bookmakers?.bookmakers_catalogo?.logo_url || null,
        parceiro_nome: ap.bookmakers?.parceiros?.nome || null,
      }));

      // Formatar apostas múltiplas
      const multiplasFormatted: ApostaOperacionalFreebet[] = (apostasMultiplas || []).map((ap: any) => {
        const selecoes = Array.isArray(ap.selecoes) ? ap.selecoes : [];
        const primeiraSelecao = selecoes[0] || {};
        return {
          id: ap.id,
          tipo: "multipla" as const,
          evento: primeiraSelecao.evento || `Múltipla (${selecoes.length} seleções)`,
          mercado: primeiraSelecao.mercado || null,
          selecao: selecoes.map((s: any) => s.selecao).join(" + ") || "Múltipla",
          odd: ap.odd_final,
          stake: ap.stake,
          lucro_prejuizo: ap.lucro_prejuizo,
          valor_retorno: ap.valor_retorno,
          data_aposta: ap.data_aposta,
          status: ap.status,
          resultado: ap.resultado,
          tipo_freebet: ap.tipo_freebet,
          bookmaker_nome: ap.bookmakers?.nome || "Desconhecida",
          logo_url: ap.bookmakers?.bookmakers_catalogo?.logo_url || null,
          parceiro_nome: ap.bookmakers?.parceiros?.nome || null,
        };
      });

      // Combinar e ordenar por data
      const todasApostas = [...simplesFormatted, ...multiplasFormatted].sort(
        (a, b) => new Date(b.data_aposta).getTime() - new Date(a.data_aposta).getTime()
      );

      setApostasOperacionais(todasApostas);
    } catch (error: any) {
      console.error("Erro ao buscar apostas operacionais:", error);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  // Filtrar freebets e apostas pelo período - APENAS LIBERADAS para métricas
  const freebetsLiberadasNoPeriodo = useMemo(() => {
    const liberadas = freebets.filter(fb => fb.status === "LIBERADA");
    if (!dateRange) return liberadas;
    return liberadas.filter(fb => {
      const dataRecebida = new Date(fb.data_recebida);
      return dataRecebida >= dateRange.start && dataRecebida <= dateRange.end;
    });
  }, [freebets, dateRange]);

  // Todas freebets no período para listagem (inclui pendentes para visualização)
  const freebetsNoPeriodo = useMemo(() => {
    if (!dateRange) return freebets;
    return freebets.filter(fb => {
      const dataRecebida = new Date(fb.data_recebida);
      return dataRecebida >= dateRange.start && dataRecebida <= dateRange.end;
    });
  }, [freebets, dateRange]);

  // Apostas operacionais no período
  const apostasNoPeriodo = useMemo(() => {
    if (!dateRange) return apostasOperacionais;
    return apostasOperacionais.filter(ap => {
      const dataAposta = new Date(ap.data_aposta);
      return dataAposta >= dateRange.start && dataAposta <= dateRange.end;
    });
  }, [apostasOperacionais, dateRange]);

  // Métricas de extração - APENAS FREEBETS LIBERADAS
  const metricas = useMemo(() => {
    const totalRecebido = freebetsLiberadasNoPeriodo.reduce((acc, fb) => acc + fb.valor, 0);
    
    // Total extraído: soma do lucro de apostas operacionais com freebet
    const apostasFinalizadas = apostasNoPeriodo.filter(ap => 
      ap.status === "LIQUIDADA" && ap.resultado && ap.resultado !== "PENDENTE"
    );
    
    const totalExtraido = apostasFinalizadas.reduce((acc, ap) => {
      const lucro = ap.lucro_prejuizo || 0;
      return acc + Math.max(0, lucro);
    }, 0);
    
    // Taxa de extração
    const taxaExtracao = totalRecebido > 0 ? (totalExtraido / totalRecebido) * 100 : 0;

    // Métricas de apostas
    const totalApostas = apostasNoPeriodo.length;
    const apostasGanhas = apostasNoPeriodo.filter(ap => 
      ap.resultado === "GREEN" || ap.resultado === "MEIO_GREEN"
    ).length;
    const taxaAcerto = totalApostas > 0 ? (apostasGanhas / totalApostas) * 100 : 0;

    return {
      totalRecebido,
      totalExtraido,
      taxaExtracao,
      totalApostas,
      apostasGanhas,
      taxaAcerto
    };
  }, [freebetsLiberadasNoPeriodo, apostasNoPeriodo]);

  // Casas disponíveis para filtro
  const casasDisponiveis = [...new Set(apostasNoPeriodo.map(ap => ap.bookmaker_nome))];
  
  // Filtrar apostas operacionais
  const apostasFiltradas = apostasNoPeriodo.filter(ap => {
    // Filtro de status
    if (statusFilter === "pendente" && ap.status !== "PENDENTE") return false;
    if (statusFilter === "liquidada" && ap.status !== "LIQUIDADA") return false;
    
    // Filtro de resultado
    if (resultadoFilter === "ganhas" && ap.resultado !== "GREEN" && ap.resultado !== "MEIO_GREEN") return false;
    if (resultadoFilter === "perdidas" && ap.resultado !== "RED" && ap.resultado !== "MEIO_RED") return false;
    
    // Filtro de casa
    if (casaFilter !== "todas" && ap.bookmaker_nome !== casaFilter) return false;
    
    // Filtro de busca
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

  // KPIs de estoque atual
  const totalFreebetDisponivel = bookmakersComFreebet.reduce((acc, bk) => acc + bk.saldo_freebet, 0);
  const casasComFreebet = bookmakersComFreebet.length;
  const freebetsUtilizadas = freebetsNoPeriodo.filter(f => f.utilizada).length;
  const freebetsDisponiveis = freebetsNoPeriodo.filter(f => !f.utilizada).length;

  // Helper para badge de resultado
  const getResultadoBadge = (resultado: string | null, status: string) => {
    if (status === "PENDENTE" || !resultado || resultado === "PENDENTE") {
      return (
        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
          <Clock className="h-3 w-3 mr-1" />
          Pendente
        </Badge>
      );
    }
    
    switch (resultado) {
      case "GREEN":
        return (
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
            <Trophy className="h-3 w-3 mr-1" />
            Green
          </Badge>
        );
      case "MEIO_GREEN":
        return (
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Meio Green
          </Badge>
        );
      case "RED":
        return (
          <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
            <XCircle className="h-3 w-3 mr-1" />
            Red
          </Badge>
        );
      case "MEIO_RED":
        return (
          <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Meio Red
          </Badge>
        );
      case "VOID":
        return (
          <Badge variant="secondary">
            <CircleDot className="h-3 w-3 mr-1" />
            Void
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            {resultado}
          </Badge>
        );
    }
  };

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

  return (
    <div className="space-y-4">
      {/* KPIs - Métricas de Período */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Freebets Recebidas</CardTitle>
            <Gift className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">{formatCurrency(metricas.totalRecebido)}</div>
            <p className="text-xs text-muted-foreground">
              {freebetsNoPeriodo.length} freebets no período
            </p>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lucro Extraído</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">{formatCurrency(metricas.totalExtraido)}</div>
            <p className="text-xs text-muted-foreground">
              {metricas.totalApostas} apostas realizadas
            </p>
          </CardContent>
        </Card>

        <Card className={`border-${metricas.taxaExtracao >= 70 ? 'emerald' : metricas.taxaExtracao >= 50 ? 'amber' : 'red'}-500/20 bg-${metricas.taxaExtracao >= 70 ? 'emerald' : metricas.taxaExtracao >= 50 ? 'amber' : 'red'}-500/5`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Extração</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${metricas.taxaExtracao >= 70 ? 'text-emerald-400' : metricas.taxaExtracao >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
              {metricas.taxaExtracao.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Taxa de acerto: {metricas.taxaAcerto.toFixed(0)}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* KPIs - Estoque Atual */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Freebet Disponível</CardTitle>
            <Gift className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">{formatCurrency(totalFreebetDisponivel)}</div>
            <p className="text-xs text-muted-foreground">
              Saldo atual para uso
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Casas com Freebet</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{casasComFreebet}</div>
            <p className="text-xs text-muted-foreground">
              Bookmakers com saldo
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Freebets no Período</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{freebetsNoPeriodo.length}</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-emerald-400">{freebetsDisponiveis} disponíveis</span>
              {" · "}
              <span className="text-muted-foreground">{freebetsUtilizadas} utilizadas</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Casas com Saldo de Freebet */}
      {bookmakersComFreebet.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Gift className="h-4 w-4 text-amber-400" />
              Saldo de Freebet por Casa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {bookmakersComFreebet.map(bk => (
                <div
                  key={bk.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                >
                  {bk.logo_url ? (
                    <img
                      src={bk.logo_url}
                      alt={bk.nome}
                      className="h-10 w-10 rounded-lg object-contain bg-white p-1"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{bk.nome}</p>
                    {bk.parceiro_nome && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {bk.parceiro_nome}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-amber-400">
                      {formatCurrency(bk.saldo_freebet)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Layout 2 colunas: Apostas Operacionais (principal) + Freebets do Período (secundário) */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Card Principal - Apostas Operacionais com Freebet */}
        <Card className="min-h-[400px]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Apostas com Freebet
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Apostas realizadas utilizando Freebet como recurso
            </p>
          </CardHeader>
          <CardContent>
            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por evento, seleção, casa..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  <SelectItem value="pendente">Pendentes</SelectItem>
                  <SelectItem value="liquidada">Liquidadas</SelectItem>
                </SelectContent>
              </Select>
              <Select value={resultadoFilter} onValueChange={(v) => setResultadoFilter(v as any)}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Resultado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  <SelectItem value="ganhas">Ganhas</SelectItem>
                  <SelectItem value="perdidas">Perdidas</SelectItem>
                </SelectContent>
              </Select>
              <Select value={casaFilter} onValueChange={setCasaFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Casa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as Casas</SelectItem>
                  {casasDisponiveis.map(casa => (
                    <SelectItem key={casa} value={casa}>{casa}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Cards de Apostas */}
            {apostasFiltradas.length === 0 ? (
              <div className="text-center py-16 border rounded-lg bg-muted/5">
                <Target className="mx-auto h-12 w-12 text-muted-foreground/30" />
                <h3 className="mt-4 text-base font-medium text-muted-foreground">
                  Nenhuma aposta com Freebet encontrada
                </h3>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Apostas com contexto operacional Freebet aparecerão aqui
                </p>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {apostasFiltradas.map(aposta => (
                  <div
                    key={aposta.id}
                    className="p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
                  >
                    {/* Header: Casa + Badge Tipo */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {aposta.logo_url ? (
                          <img
                            src={aposta.logo_url}
                            alt={aposta.bookmaker_nome}
                            className="h-8 w-8 rounded object-contain bg-white p-0.5"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                            <Building2 className="h-4 w-4" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-sm">{aposta.bookmaker_nome}</p>
                          {aposta.parceiro_nome && (
                            <p className="text-xs text-muted-foreground">{aposta.parceiro_nome}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {aposta.tipo === "multipla" && (
                          <Badge variant="outline" className="text-xs">Múltipla</Badge>
                        )}
                        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">
                          <Gift className="h-3 w-3 mr-1" />
                          Freebet
                        </Badge>
                      </div>
                    </div>

                    {/* Evento e Seleção */}
                    <div className="mb-3">
                      <p className="font-medium text-sm truncate" title={aposta.evento}>
                        {aposta.evento}
                      </p>
                      <p className="text-sm text-primary truncate" title={aposta.selecao}>
                        {aposta.selecao}
                      </p>
                      {aposta.mercado && (
                        <p className="text-xs text-muted-foreground">{aposta.mercado}</p>
                      )}
                    </div>

                    {/* Valores */}
                    <div className="grid grid-cols-3 gap-2 mb-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Odd</p>
                        <p className="font-semibold">{aposta.odd.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Stake</p>
                        <p className="font-semibold text-amber-400">{formatCurrency(aposta.stake)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {aposta.status === "LIQUIDADA" ? "P/L" : "Retorno Pot."}
                        </p>
                        <p className={`font-semibold ${
                          aposta.lucro_prejuizo !== null 
                            ? aposta.lucro_prejuizo >= 0 ? "text-emerald-400" : "text-red-400"
                            : ""
                        }`}>
                          {aposta.status === "LIQUIDADA" && aposta.lucro_prejuizo !== null
                            ? formatCurrency(aposta.lucro_prejuizo)
                            : formatCurrency(aposta.stake * (aposta.odd - 1))
                          }
                        </p>
                      </div>
                    </div>

                    {/* Footer: Data + Resultado */}
                    <div className="flex items-center justify-between pt-2 border-t">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(aposta.data_aposta), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </div>
                      {getResultadoBadge(aposta.resultado, aposta.status)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card Secundário - Freebets do Período */}
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Gift className="h-4 w-4 text-amber-400" />
              Freebets do Período
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {freebetsNoPeriodo.length === 0 ? (
              <div className="text-center py-8 border rounded-lg bg-muted/5">
                <Gift className="mx-auto h-8 w-8 text-muted-foreground/30" />
                <p className="mt-2 text-sm text-muted-foreground">
                  Nenhuma freebet no período
                </p>
              </div>
            ) : (
              <>
                {/* Resumo */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <div className="flex items-center gap-2">
                      <Gift className="h-4 w-4 text-amber-400" />
                      <span className="text-sm font-medium">Total Recebido</span>
                    </div>
                    <span className="text-lg font-bold text-amber-400">
                      {formatCurrency(metricas.totalRecebido)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      <span className="text-sm font-medium">Disponíveis</span>
                    </div>
                    <span className="text-lg font-bold text-emerald-400">
                      {freebetsDisponiveis}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Utilizadas</span>
                    </div>
                    <span className="text-lg font-bold text-muted-foreground">
                      {freebetsUtilizadas}
                    </span>
                  </div>
                </div>

                {/* Taxa de Extração */}
                <div className="pt-3 border-t">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Taxa de Extração</span>
                    <span className={`text-sm font-bold ${metricas.taxaExtracao >= 70 ? 'text-emerald-400' : metricas.taxaExtracao >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                      {metricas.taxaExtracao.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${metricas.taxaExtracao >= 70 ? 'bg-emerald-500' : metricas.taxaExtracao >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.min(100, metricas.taxaExtracao)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Lucro: {formatCurrency(metricas.totalExtraido)}
                  </p>
                </div>

                {/* Casas com saldo */}
                {bookmakersComFreebet.length > 0 && (
                  <div className="pt-3 border-t">
                    <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                      Casas com Saldo
                    </p>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {bookmakersComFreebet.slice(0, 5).map(bk => (
                        <div
                          key={bk.id}
                          className="flex items-center gap-2 p-2 rounded-lg border bg-card"
                        >
                          {bk.logo_url ? (
                            <img
                              src={bk.logo_url}
                              alt={bk.nome}
                              className="h-6 w-6 rounded object-contain bg-white p-0.5"
                            />
                          ) : (
                            <div className="h-6 w-6 rounded bg-muted flex items-center justify-center">
                              <Building2 className="h-3 w-3" />
                            </div>
                          )}
                          <span className="text-sm font-medium flex-1 truncate">{bk.nome}</span>
                          <span className="text-sm font-bold text-amber-400">
                            {formatCurrency(bk.saldo_freebet)}
                          </span>
                        </div>
                      ))}
                      {bookmakersComFreebet.length > 5 && (
                        <p className="text-xs text-muted-foreground text-center py-1">
                          +{bookmakersComFreebet.length - 5} casas
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
