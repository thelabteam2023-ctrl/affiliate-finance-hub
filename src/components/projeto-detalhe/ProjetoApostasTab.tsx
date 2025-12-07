import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { 
  Plus, 
  Search, 
  Target,
  Calendar,
  TrendingUp,
  TrendingDown,
  LayoutGrid,
  List,
  ArrowLeftRight,
  ArrowUp,
  ArrowDown,
  Shield
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ApostaDialog } from "@/components/projeto-detalhe/ApostaDialog";
import { ResultadoPill } from "@/components/projeto-detalhe/ResultadoPill";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { DateRange } from "react-day-picker";
import { startOfDay, endOfDay, subDays, startOfMonth, startOfYear } from "date-fns";

type PeriodFilter = "hoje" | "ontem" | "7dias" | "mes" | "ano" | "todo" | "custom";

interface ProjetoApostasTabProps {
  projetoId: string;
  onDataChange?: () => void;
  periodFilter?: PeriodFilter;
  dateRange?: DateRange;
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
  bookmaker?: {
    nome: string;
    parceiro_id: string;
    bookmaker_catalogo_id?: string | null;
    parceiro?: {
      nome: string;
    };
    bookmakers_catalogo?: {
      logo_url: string | null;
    } | null;
  };
}

export function ProjetoApostasTab({ projetoId, onDataChange, periodFilter = "todo", dateRange }: ProjetoApostasTabProps) {
  const [apostas, setApostas] = useState<Aposta[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [resultadoFilter, setResultadoFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedAposta, setSelectedAposta] = useState<Aposta | null>(null);

  const getDateRangeFromFilter = (): { start: Date | null; end: Date | null } => {
    const today = new Date();
    
    switch (periodFilter) {
      case "hoje":
        return { start: startOfDay(today), end: endOfDay(today) };
      case "ontem":
        const yesterday = subDays(today, 1);
        return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
      case "7dias":
        return { start: startOfDay(subDays(today, 7)), end: endOfDay(today) };
      case "mes":
        return { start: startOfMonth(today), end: endOfDay(today) };
      case "ano":
        return { start: startOfYear(today), end: endOfDay(today) };
      case "custom":
        return { 
          start: dateRange?.from || null, 
          end: dateRange?.to || dateRange?.from || null 
        };
      case "todo":
      default:
        return { start: null, end: null };
    }
  };

  useEffect(() => {
    fetchApostas();
  }, [projetoId, periodFilter, dateRange]);

  const fetchApostas = async () => {
    try {
      setLoading(true);
      const { start, end } = getDateRangeFromFilter();
      
      let query = supabase
        .from("apostas")
        .select(`
          *,
          bookmaker:bookmakers (
            nome,
            parceiro_id,
            bookmaker_catalogo_id,
            parceiro:parceiros (nome),
            bookmakers_catalogo (logo_url)
          )
        `)
        .eq("projeto_id", projetoId)
        .order("data_aposta", { ascending: false });
      
      if (start) {
        query = query.gte("data_aposta", start.toISOString());
      }
      if (end) {
        query = query.lte("data_aposta", end.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;
      setApostas(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar apostas: " + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleApostaUpdated = () => {
    fetchApostas();
    onDataChange?.();
  };

  const filteredApostas = apostas.filter((aposta) => {
    const matchesSearch = 
      aposta.evento.toLowerCase().includes(searchTerm.toLowerCase()) ||
      aposta.esporte.toLowerCase().includes(searchTerm.toLowerCase()) ||
      aposta.selecao.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || aposta.status === statusFilter;
    const matchesResultado = resultadoFilter === "all" || aposta.resultado === resultadoFilter;
    return matchesSearch && matchesStatus && matchesResultado;
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getResultadoColor = (resultado: string | null) => {
    switch (resultado) {
      case "GREEN": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "RED": return "bg-red-500/20 text-red-400 border-red-500/30";
      case "MEIO_GREEN": return "bg-teal-500/20 text-teal-400 border-teal-500/30";
      case "MEIO_RED": return "bg-orange-500/20 text-orange-400 border-orange-500/30";
      case "VOID": return "bg-gray-500/20 text-gray-400 border-gray-500/30";
      case "HALF": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      default: return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    }
  };

  const getResultadoLabel = (resultado: string | null) => {
    switch (resultado) {
      case "MEIO_GREEN": return "Meio Green";
      case "MEIO_RED": return "Meio Red";
      default: return resultado;
    }
  };

  const parseLocalDateTime = (dateString: string): Date => {
    if (!dateString) return new Date();
    // Remove timezone info e trata como horário local
    const cleanDate = dateString.replace(/\+00:00$/, '').replace(/Z$/, '').replace(/\+\d{2}:\d{2}$/, '');
    const [datePart, timePart] = cleanDate.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hours, minutes] = (timePart || '00:00').split(':').map(Number);
    return new Date(year, month - 1, day, hours || 0, minutes || 0);
  };

  const getFirstLastName = (fullName: string): string => {
    if (!fullName) return "";
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${parts[parts.length - 1]}`;
  };

  // Determina o tipo de operação da aposta para exibição
  const getOperationType = (aposta: Aposta): { type: "bookmaker" | "back" | "lay" | "cobertura"; label: string; color: string } => {
    if (aposta.modo_entrada === "EXCHANGE" || aposta.estrategia?.includes("EXCHANGE") || aposta.estrategia === "COBERTURA_LAY") {
      if (aposta.estrategia === "COBERTURA_LAY") {
        return { type: "cobertura", label: "COB", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" };
      }
      if (aposta.estrategia === "EXCHANGE_LAY" || aposta.lay_odd) {
        return { type: "lay", label: "LAY", color: "bg-rose-500/20 text-rose-400 border-rose-500/30" };
      }
      return { type: "back", label: "BACK", color: "bg-sky-500/20 text-sky-400 border-sky-500/30" };
    }
    return { type: "bookmaker", label: "", color: "" };
  };

  // Calcula o lucro/prejuízo correto baseado no tipo de operação
  const getCalculatedProfit = (aposta: Aposta): number | null => {
    if (aposta.lucro_prejuizo === null || aposta.lucro_prejuizo === undefined) {
      return null;
    }
    
    const opType = getOperationType(aposta);
    
    // Para operações Exchange Lay, o cálculo é diferente
    if (opType.type === "lay") {
      // Se GREEN (o lay ganhou = seleção perdeu), lucro = stake do lay (menos comissão)
      // Se RED (o lay perdeu = seleção ganhou), prejuízo = liability
      // O valor já deve estar correto no banco, mas podemos recalcular se necessário
      return aposta.lucro_prejuizo;
    }
    
    // Para operações Exchange Back, similar ao bookmaker normal
    if (opType.type === "back") {
      return aposta.lucro_prejuizo;
    }
    
    // Para cobertura, o lucro garantido já está calculado
    if (opType.type === "cobertura") {
      return aposta.lucro_prejuizo;
    }
    
    // Bookmaker padrão
    return aposta.lucro_prejuizo;
  };

  // Formata informação de exibição da aposta baseado no tipo
  const getApostaDisplayInfo = (aposta: Aposta) => {
    const opType = getOperationType(aposta);
    
    if (opType.type === "cobertura") {
      return {
        primaryLine: aposta.bookmaker?.nome || "Casa",
        secondaryLine: aposta.lay_exchange ? `Lay @ ${aposta.lay_odd?.toFixed(2)} • Resp: ${formatCurrency(aposta.lay_liability || 0)}` : null,
        badgeType: opType
      };
    }
    
    if (opType.type === "lay") {
      return {
        primaryLine: aposta.bookmaker?.nome || "Exchange",
        secondaryLine: `Liability: ${formatCurrency(aposta.lay_liability || 0)}`,
        badgeType: opType
      };
    }
    
    if (opType.type === "back") {
      return {
        primaryLine: aposta.bookmaker?.nome || "Exchange",
        secondaryLine: null,
        badgeType: opType
      };
    }
    
    // Bookmaker padrão
    return {
      primaryLine: aposta.bookmaker?.nome || "",
      secondaryLine: aposta.bookmaker?.parceiro?.nome ? getFirstLastName(aposta.bookmaker.parceiro.nome) : null,
      badgeType: opType
    };
  };

  const handleOpenDialog = (aposta: Aposta | null) => {
    setSelectedAposta(aposta);
    setDialogOpen(true);
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

  return (
    <div className="space-y-4">
      {/* Filtros e Ações */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => setViewMode(viewMode === "cards" ? "list" : "cards")}
            >
              {viewMode === "cards" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
            </Button>
            <Button onClick={() => handleOpenDialog(null)} size="sm" className="h-9">
              <Plus className="mr-1 h-4 w-4" />
              Nova Aposta
            </Button>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px] h-9">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Status</SelectItem>
                <SelectItem value="PENDENTE">Pendente</SelectItem>
                <SelectItem value="REALIZADA">Realizada</SelectItem>
                <SelectItem value="CONCLUIDA">Concluída</SelectItem>
              </SelectContent>
            </Select>
            <Select value={resultadoFilter} onValueChange={setResultadoFilter}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue placeholder="Resultado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="GREEN">Green</SelectItem>
                <SelectItem value="RED">Red</SelectItem>
                <SelectItem value="MEIO_GREEN">Meio Green</SelectItem>
                <SelectItem value="MEIO_RED">Meio Red</SelectItem>
                <SelectItem value="VOID">Void</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Apostas */}
      {filteredApostas.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-10">
              <Target className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">Nenhuma aposta encontrada</h3>
              <p className="text-muted-foreground">
                {searchTerm || statusFilter !== "all" || resultadoFilter !== "all"
                  ? "Tente ajustar os filtros"
                  : "Registre sua primeira aposta"}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : viewMode === "cards" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredApostas.map((aposta) => {
            const displayInfo = getApostaDisplayInfo(aposta);
            const opType = displayInfo.badgeType;
            
            return (
              <Card 
                key={aposta.id} 
                className="hover:border-primary/50 transition-colors cursor-default"
              >
                <CardHeader className="pb-1 pt-3 px-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-sm truncate">{aposta.evento}</CardTitle>
                      <p className="text-xs text-muted-foreground truncate">{aposta.esporte}</p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0 items-center">
                      {opType.label && (
                        <Badge className={`${opType.color} text-[10px] px-1.5 py-0`}>
                          {opType.type === "cobertura" && <Shield className="h-2.5 w-2.5 mr-0.5" />}
                          {opType.type === "back" && <ArrowUp className="h-2.5 w-2.5 mr-0.5" />}
                          {opType.type === "lay" && <ArrowDown className="h-2.5 w-2.5 mr-0.5" />}
                          {opType.label}
                        </Badge>
                      )}
                      <ResultadoPill
                        apostaId={aposta.id}
                        bookmarkerId={aposta.bookmaker_id}
                        resultado={aposta.resultado}
                        status={aposta.status}
                        stake={aposta.stake}
                        odd={aposta.odd}
                        operationType={opType.type}
                        layLiability={aposta.lay_liability || undefined}
                        layOdd={aposta.lay_odd || undefined}
                        onResultadoUpdated={handleApostaUpdated}
                        onEditClick={() => handleOpenDialog(aposta)}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-1 pb-3 px-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground truncate flex-1">{aposta.selecao}</span>
                      <span className="font-medium ml-2">@{aposta.odd.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Stake:</span>
                      <span className="font-medium">{formatCurrency(aposta.stake)}</span>
                    </div>
                    
                    {/* Informações específicas para Cobertura/Lay */}
                    {opType.type === "cobertura" && aposta.lay_odd && (
                      <div className="flex items-center justify-between text-xs text-purple-400">
                        <span className="flex items-center gap-1">
                          <ArrowDown className="h-3 w-3" />
                          Lay @{aposta.lay_odd.toFixed(2)}
                        </span>
                        <span>Resp: {formatCurrency(aposta.lay_liability || 0)}</span>
                      </div>
                    )}
                    
                    {opType.type === "lay" && aposta.lay_liability && (
                      <div className="flex items-center justify-between text-xs text-rose-400">
                        <span>Liability:</span>
                        <span className="font-medium">{formatCurrency(aposta.lay_liability)}</span>
                      </div>
                    )}
                    
                    {(() => {
                      const profit = getCalculatedProfit(aposta);
                      const baseValue = opType.type === "lay" ? (aposta.lay_liability || aposta.stake) : aposta.stake;
                      if (profit === null) return null;
                      return (
                        <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
                          <span className="text-muted-foreground">P/L:</span>
                          <div className="flex items-center gap-2">
                            <span className={`font-medium flex items-center gap-0.5 ${profit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                              {profit >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                              {formatCurrency(profit)}
                            </span>
                            <span className={`text-[10px] px-1 py-0.5 rounded ${profit >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                              {((profit / baseValue) * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-2.5 w-2.5" />
                        {format(parseLocalDateTime(aposta.data_aposta), "dd/MM HH:mm", { locale: ptBR })}
                      </span>
                      {aposta.bookmaker && (
                        <span className="flex items-center gap-1.5 truncate ml-2">
                          {aposta.bookmaker.bookmakers_catalogo?.logo_url ? (
                            <img 
                              src={aposta.bookmaker.bookmakers_catalogo.logo_url} 
                              alt={aposta.bookmaker.nome}
                              className="h-4 w-4 rounded-sm object-contain flex-shrink-0"
                            />
                          ) : (
                            <div className="h-4 w-4 rounded-sm bg-muted flex items-center justify-center flex-shrink-0">
                              <Target className="h-2.5 w-2.5 text-muted-foreground" />
                            </div>
                          )}
                          <span className="truncate">
                            {displayInfo.primaryLine}
                            {displayInfo.secondaryLine && opType.type === "bookmaker" && (
                              <> - {displayInfo.secondaryLine}</>
                            )}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <ScrollArea className="h-[600px]">
            <div className="divide-y">
              {filteredApostas.map((aposta) => (
                <div
                  key={aposta.id}
                  className="flex items-center justify-between p-4 hover:bg-muted/50"
                >
                  <div 
                    className="flex items-center gap-4 flex-1"
                  >
                    {aposta.bookmaker?.bookmakers_catalogo?.logo_url ? (
                      <img 
                        src={aposta.bookmaker.bookmakers_catalogo.logo_url} 
                        alt={aposta.bookmaker.nome}
                        className="h-10 w-10 rounded-lg object-contain bg-muted/50 p-1"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Target className="h-5 w-5 text-primary" />
                      </div>
                    )}
                    <div>
                      <p className="font-medium">
                        {aposta.evento}
                        {aposta.bookmaker && (
                          <span className="text-muted-foreground font-normal text-sm ml-2">
                            • {aposta.bookmaker.nome}
                            {aposta.bookmaker.parceiro?.nome && (
                              <> - {getFirstLastName(aposta.bookmaker.parceiro.nome)}</>
                            )}
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {aposta.esporte} • {aposta.selecao} @ {aposta.odd.toFixed(2)} • {format(parseLocalDateTime(aposta.data_aposta), "dd/MM HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-medium">{formatCurrency(aposta.stake)}</p>
                      {(() => {
                        const opType = getOperationType(aposta);
                        const profit = getCalculatedProfit(aposta);
                        const baseValue = opType.type === "lay" ? (aposta.lay_liability || aposta.stake) : aposta.stake;
                        if (profit === null) return null;
                        return (
                          <div className="flex items-center justify-end gap-2">
                            <p className={`text-sm ${profit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                              {formatCurrency(profit)}
                            </p>
                            <span className={`text-[10px] px-1 py-0.5 rounded ${profit >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                              {((profit / baseValue) * 100).toFixed(1)}%
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                    <ResultadoPill
                      apostaId={aposta.id}
                      bookmarkerId={aposta.bookmaker_id}
                      resultado={aposta.resultado}
                      status={aposta.status}
                      stake={aposta.stake}
                      odd={aposta.odd}
                      operationType={getOperationType(aposta).type}
                      layLiability={aposta.lay_liability || undefined}
                      layOdd={aposta.lay_odd || undefined}
                      onResultadoUpdated={handleApostaUpdated}
                      onEditClick={() => handleOpenDialog(aposta)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>
      )}

      {/* Dialog */}
      <ApostaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        aposta={selectedAposta}
        projetoId={projetoId}
        onSuccess={() => {
          fetchApostas();
          onDataChange?.();
        }}
      />
    </div>
  );
}