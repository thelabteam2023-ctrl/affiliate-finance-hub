import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { 
  Calculator, 
  Save, 
  Target, 
  TrendingUp, 
  TrendingDown,
  LayoutGrid,
  List,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DateRange } from "react-day-picker";
import { startOfDay, endOfDay, subDays, startOfMonth, startOfYear } from "date-fns";
import { SurebetDialog } from "./SurebetDialog";

type PeriodFilter = "hoje" | "ontem" | "7dias" | "mes" | "ano" | "todo" | "custom";

interface ProjetoSurebetTabProps {
  projetoId: string;
  onDataChange?: () => void;
  periodFilter?: PeriodFilter;
  dateRange?: DateRange;
}

interface SurebetPerna {
  id: string;
  selecao: string;
  odd: number;
  stake: number;
  resultado: string | null;
  bookmaker_nome: string;
}

interface Surebet {
  id: string;
  data_operacao: string;
  evento: string;
  esporte: string;
  modelo: string;
  stake_total: number;
  spread_calculado: number | null;
  roi_esperado: number | null;
  lucro_esperado: number | null;
  lucro_real: number | null;
  roi_real: number | null;
  status: string;
  resultado: string | null;
  observacoes: string | null;
  pernas?: SurebetPerna[];
}

interface Bookmaker {
  id: string;
  nome: string;
  saldo_atual: number;
  saldo_freebet?: number;
  parceiro?: {
    nome: string;
  };
  bookmakers_catalogo?: {
    logo_url: string | null;
  } | null;
}

export function ProjetoSurebetTab({ projetoId, onDataChange, periodFilter = "todo", dateRange }: ProjetoSurebetTabProps) {
  const [surebets, setSurebets] = useState<Surebet[]>([]);
  const [bookmakers, setBookmakers] = useState<Bookmaker[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSurebet, setSelectedSurebet] = useState<Surebet | null>(null);

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
    fetchData();
  }, [projetoId, periodFilter, dateRange]);

  const fetchData = async () => {
    try {
      setLoading(true);
      await Promise.all([fetchSurebets(), fetchBookmakers()]);
    } finally {
      setLoading(false);
    }
  };

  const fetchSurebets = async () => {
    try {
      const { start, end } = getDateRangeFromFilter();
      
      let query = supabase
        .from("surebets")
        .select("*")
        .eq("projeto_id", projetoId)
        .order("data_operacao", { ascending: false });
      
      if (start) {
        query = query.gte("data_operacao", start.toISOString());
      }
      if (end) {
        query = query.lte("data_operacao", end.toISOString());
      }

      const { data: surebetsData, error } = await query;

      if (error) throw error;
      
      // Buscar pernas (apostas) de cada surebet
      if (surebetsData && surebetsData.length > 0) {
        const surebetIds = surebetsData.map(s => s.id);
        
        const { data: pernasData, error: pernasError } = await supabase
          .from("apostas")
          .select(`
            id,
            surebet_id,
            selecao,
            odd,
            stake,
            resultado,
            bookmaker:bookmakers (nome)
          `)
          .in("surebet_id", surebetIds);
        
        if (pernasError) throw pernasError;
        
        // Mapear pernas para cada surebet
        const surebetsComPernas = surebetsData.map(surebet => ({
          ...surebet,
          pernas: (pernasData || [])
            .filter(p => p.surebet_id === surebet.id)
            .map(p => ({
              id: p.id,
              selecao: p.selecao,
              odd: p.odd,
              stake: p.stake,
              resultado: p.resultado,
              bookmaker_nome: (p.bookmaker as any)?.nome || "—"
            }))
            .sort((a, b) => {
              // Ordenar: Casa/1 primeiro, depois Empate/X, depois Fora/2
              const order: Record<string, number> = { 
                "Casa": 1, "1": 1,
                "Empate": 2, "X": 2,
                "Fora": 3, "2": 3
              };
              return (order[a.selecao] || 99) - (order[b.selecao] || 99);
            })
        }));
        
        setSurebets(surebetsComPernas);
      } else {
        setSurebets([]);
      }
    } catch (error: any) {
      console.error("Erro ao carregar surebets:", error.message);
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

  const handleDataChange = () => {
    fetchSurebets();
    onDataChange?.();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatPercent = (value: number | null) => {
    if (value === null) return "-";
    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "PENDENTE": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "LIQUIDADA": return "bg-gray-500/20 text-gray-400 border-gray-500/30";
      default: return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  const getResultadoColor = (resultado: string | null) => {
    switch (resultado) {
      case "GREEN": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "RED": return "bg-red-500/20 text-red-400 border-red-500/30";
      case "VOID": return "bg-gray-500/20 text-gray-400 border-gray-500/30";
      default: return "";
    }
  };

  const parseLocalDateTime = (dateString: string): Date => {
    if (!dateString) return new Date();
    const cleanDate = dateString.replace(/\+00:00$/, '').replace(/Z$/, '').replace(/\+\d{2}:\d{2}$/, '');
    const [datePart, timePart] = cleanDate.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hours, minutes] = (timePart || '00:00').split(':').map(Number);
    return new Date(year, month - 1, day, hours || 0, minutes || 0);
  };

  // KPIs calculados
  const kpis = useMemo(() => {
    const total = surebets.length;
    const pendentes = surebets.filter(s => s.status === "PENDENTE").length;
    const liquidadas = surebets.filter(s => s.status === "LIQUIDADA").length;
    const greens = surebets.filter(s => s.resultado === "GREEN").length;
    const reds = surebets.filter(s => s.resultado === "RED").length;
    const lucroTotal = surebets.reduce((acc, s) => acc + (s.lucro_real || 0), 0);
    const stakeTotal = surebets.reduce((acc, s) => acc + s.stake_total, 0);
    const roi = stakeTotal > 0 ? (lucroTotal / stakeTotal) * 100 : 0;
    
    return { total, pendentes, liquidadas, greens, reds, lucroTotal, stakeTotal, roi };
  }, [surebets]);

  return (
    <div className="space-y-4">
      {/* KPIs Resumo */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Surebets</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.total}</div>
            <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs">
              <span className="text-blue-400">{kpis.pendentes} Pendentes</span>
              <span className="text-emerald-500">{kpis.greens} G</span>
              <span className="text-red-500">{kpis.reds} R</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Volume</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis.stakeTotal)}</div>
            <p className="text-xs text-muted-foreground">Total investido</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {kpis.lucroTotal >= 0 ? "Lucro" : "Prejuízo"}
            </CardTitle>
            {kpis.lucroTotal >= 0 ? (
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${kpis.lucroTotal >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {formatCurrency(Math.abs(kpis.lucroTotal))}
            </div>
            <p className="text-xs text-muted-foreground">Resultado liquidado</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ROI</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${kpis.roi >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {formatPercent(kpis.roi)}
            </div>
            <p className="text-xs text-muted-foreground">Retorno sobre investimento</p>
          </CardContent>
        </Card>
      </div>

      {/* Ações */}
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
            <Button 
              size="sm" 
              className="h-9"
              onClick={() => {
                setSelectedSurebet(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              Nova Arbitragem
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Surebets */}
      {surebets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Calculator className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">Nenhuma Surebet registrada</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Clique em "Nova Surebet" para criar uma operação de arbitragem ou extração de bônus.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[calc(100vh-500px)]">
          <div className={viewMode === "cards" 
            ? "grid gap-4 md:grid-cols-2 lg:grid-cols-3" 
            : "space-y-2"
          }>
            {surebets.map((surebet) => {
              // Função helper para obter label de seleção
              const getSelecaoLabel = (selecao: string) => {
                const labels: Record<string, string> = {
                  "Casa": "1", "1": "1",
                  "Empate": "X", "X": "X",
                  "Fora": "2", "2": "2"
                };
                return labels[selecao] || selecao;
              };

              return (
                <Card 
                  key={surebet.id} 
                  className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => {
                    setSelectedSurebet(surebet);
                    setDialogOpen(true);
                  }}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                            SUREBET
                          </Badge>
                          <Badge variant="outline" className={getStatusColor(surebet.status)}>
                            {surebet.status === "PENDENTE" ? <Clock className="h-3 w-3 mr-1" /> : null}
                            {surebet.status}
                          </Badge>
                        </div>
                        <CardTitle className="text-base uppercase">{surebet.evento}</CardTitle>
                        <p className="text-xs text-muted-foreground">{surebet.esporte}</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Posições/Pernas da Surebet */}
                    {surebet.pernas && surebet.pernas.length > 0 && (
                      <div className="space-y-1.5">
                        {surebet.pernas.map((perna) => (
                          <div 
                            key={perna.id} 
                            className="flex items-center justify-between gap-2 text-sm bg-muted/30 rounded-md px-2 py-1.5"
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="font-bold text-primary w-4 flex-shrink-0">
                                {getSelecaoLabel(perna.selecao)}
                              </span>
                              <span className="text-muted-foreground">–</span>
                              <span className="font-medium truncate uppercase">
                                {perna.bookmaker_nome}
                              </span>
                              <span className="text-muted-foreground">•</span>
                              <span className="text-xs">
                                Odd {perna.odd.toFixed(2)}
                              </span>
                              <span className="text-muted-foreground">•</span>
                              <span className="text-xs font-medium">
                                {formatCurrency(perna.stake)}
                              </span>
                            </div>
                            {/* Badge de Resultado */}
                            {perna.resultado && (
                              <Badge 
                                variant="outline" 
                                className={`text-[10px] px-1.5 py-0.5 flex-shrink-0 ${
                                  perna.resultado === "GREEN" 
                                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" 
                                    : perna.resultado === "RED"
                                    ? "bg-red-500/20 text-red-400 border-red-500/30"
                                    : "bg-gray-500/20 text-gray-400 border-gray-500/30"
                                }`}
                              >
                                {perna.resultado}
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    
                    <Separator />
                    
                    {/* Resumo */}
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground text-xs">Stake Total:</span>
                        <p className="font-medium">{formatCurrency(surebet.stake_total)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">
                          {surebet.status === "LIQUIDADA" ? "ROI Real:" : "ROI Esp.:"}
                        </span>
                        <p className={`font-medium ${(surebet.status === "LIQUIDADA" ? surebet.roi_real : surebet.roi_esperado) || 0 >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                          {formatPercent(surebet.status === "LIQUIDADA" ? surebet.roi_real : surebet.roi_esperado)}
                        </p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground text-xs">
                          {surebet.status === "LIQUIDADA" ? "Lucro Real:" : "Lucro Esp.:"}
                        </span>
                        <p className={`font-medium ${
                          (surebet.status === "LIQUIDADA" ? surebet.lucro_real : surebet.lucro_esperado) || 0 >= 0 
                            ? 'text-emerald-500' 
                            : 'text-red-500'
                        }`}>
                          {formatCurrency(
                            (surebet.status === "LIQUIDADA" ? surebet.lucro_real : surebet.lucro_esperado) || 0
                          )}
                        </p>
                      </div>
                      <div className="flex items-end">
                        <span className="text-xs text-muted-foreground">
                          {format(parseLocalDateTime(surebet.data_operacao), "dd/MM HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {/* Dialog */}
      <SurebetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projetoId={projetoId}
        bookmakers={bookmakers}
        surebet={selectedSurebet}
        onSuccess={handleDataChange}
      />
    </div>
  );
}
