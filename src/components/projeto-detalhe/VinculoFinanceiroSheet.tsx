import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Building2,
  TrendingUp,
  TrendingDown,
  ArrowDownCircle,
  ArrowUpCircle,
  Calendar,
  Target,
  AlertTriangle,
  ShieldAlert,
  BarChart3,
  Layers
} from "lucide-react";

interface VinculoFinanceiroSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookmaker: {
    id: string;
    nome: string;
    status: string;
    saldo_atual: number;
  } | null;
  projetoId: string;
}

interface CicloParticipacao {
  numero_ciclo: number;
  lucro: number;
  volume: number;
  status: string;
  data_inicio: string;
  data_fim: string;
}

interface EventoRisco {
  tipo: string;
  data: string;
  valor: number;
  descricao: string;
}

export function VinculoFinanceiroSheet({ 
  open, 
  onOpenChange, 
  bookmaker,
  projetoId 
}: VinculoFinanceiroSheetProps) {
  const [loading, setLoading] = useState(true);
  const [lucroTotal, setLucroTotal] = useState(0);
  const [volumeTotal, setVolumeTotal] = useState(0);
  const [qtdApostas, setQtdApostas] = useState(0);
  const [totalDepositado, setTotalDepositado] = useState(0);
  const [totalSacado, setTotalSacado] = useState(0);
  const [ciclos, setCiclos] = useState<CicloParticipacao[]>([]);
  const [eventosRisco, setEventosRisco] = useState<EventoRisco[]>([]);

  useEffect(() => {
    if (open && bookmaker) {
      fetchDados();
    }
  }, [open, bookmaker]);

  const fetchDados = async () => {
    if (!bookmaker) return;

    try {
      setLoading(true);

      // Buscar apostas
      const { data: apostas } = await supabase
        .from("apostas")
        .select("lucro_prejuizo, stake, status, data_aposta")
        .eq("projeto_id", projetoId)
        .eq("bookmaker_id", bookmaker.id);

      // Buscar apostas múltiplas
      const { data: apostasMultiplas } = await supabase
        .from("apostas_multiplas")
        .select("lucro_prejuizo, stake, resultado, data_aposta")
        .eq("projeto_id", projetoId)
        .eq("bookmaker_id", bookmaker.id);

      // Buscar depósitos
      const { data: depositos } = await supabase
        .from("cash_ledger")
        .select("valor, data_transacao")
        .eq("tipo_transacao", "DEPOSITO")
        .eq("status", "CONFIRMADO")
        .eq("destino_bookmaker_id", bookmaker.id);

      // Buscar saques
      const { data: saques } = await supabase
        .from("cash_ledger")
        .select("valor, data_transacao")
        .eq("tipo_transacao", "SAQUE")
        .eq("status", "CONFIRMADO")
        .eq("origem_bookmaker_id", bookmaker.id);

      // Buscar perdas operacionais
      const { data: perdas } = await supabase
        .from("projeto_perdas")
        .select("categoria, descricao, valor, data_registro, status")
        .eq("projeto_id", projetoId)
        .eq("bookmaker_id", bookmaker.id);

      // Buscar ciclos
      const { data: ciclosData } = await supabase
        .from("projeto_ciclos")
        .select("numero_ciclo, data_inicio, data_fim_prevista, data_fim_real, status")
        .eq("projeto_id", projetoId)
        .order("numero_ciclo", { ascending: false });

      // Calcular lucro
      const lucroApostas = (apostas || [])
        .filter(a => a.status === "LIQUIDADA")
        .reduce((acc, a) => acc + Number(a.lucro_prejuizo || 0), 0);

      const lucroMultiplas = (apostasMultiplas || [])
        .filter(a => ["GREEN", "RED", "VOID", "MEIO_GREEN", "MEIO_RED"].includes(a.resultado || ""))
        .reduce((acc, a) => acc + Number(a.lucro_prejuizo || 0), 0);

      setLucroTotal(lucroApostas + lucroMultiplas);
      setVolumeTotal(
        (apostas || []).reduce((acc, a) => acc + Number(a.stake || 0), 0) +
        (apostasMultiplas || []).reduce((acc, a) => acc + Number(a.stake || 0), 0)
      );
      setQtdApostas((apostas || []).length + (apostasMultiplas || []).length);
      setTotalDepositado((depositos || []).reduce((acc, d) => acc + Number(d.valor), 0));
      setTotalSacado((saques || []).reduce((acc, s) => acc + Number(s.valor), 0));

      // Mapear eventos de risco
      const eventos: EventoRisco[] = (perdas || [])
        .filter(p => p.status === "CONFIRMADA")
        .map(p => ({
          tipo: p.categoria === "CONTA_LIMITADA" ? "Limitação" : 
                p.categoria === "SALDO_BLOQUEADO" ? "Bloqueio" : "Perda",
          data: p.data_registro,
          valor: p.valor,
          descricao: p.descricao || ""
        }));
      setEventosRisco(eventos);

      // Mapear ciclos com participação (simplificado)
      const ciclosComParticipacao: CicloParticipacao[] = (ciclosData || []).slice(0, 5).map(c => ({
        numero_ciclo: c.numero_ciclo,
        lucro: 0, // Seria calculado por período
        volume: 0,
        status: c.status,
        data_inicio: c.data_inicio,
        data_fim: c.data_fim_real || c.data_fim_prevista
      }));
      setCiclos(ciclosComParticipacao);

    } catch (error: any) {
      console.error("Erro ao carregar dados:", error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), "dd/MM/yyyy", { locale: ptBR });
  };

  const roi = volumeTotal > 0 ? (lucroTotal / volumeTotal) * 100 : 0;
  const resultadoCaixa = totalSacado - totalDepositado;

  if (!bookmaker) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {bookmaker.nome}
          </SheetTitle>
          <SheetDescription>
            Histórico financeiro e análise de performance
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="space-y-4 mt-6">
            <Skeleton className="h-24" />
            <Skeleton className="h-32" />
            <Skeleton className="h-48" />
          </div>
        ) : (
          <ScrollArea className="h-[calc(100vh-120px)] pr-4 mt-6">
            <div className="space-y-6">
              {/* Status Atual */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                <div>
                  <p className="text-sm text-muted-foreground">Status Atual</p>
                  <div className="flex items-center gap-2 mt-1">
                    {bookmaker.status === "LIMITADA" || bookmaker.status === "limitada" ? (
                      <Badge className="bg-amber-500/20 text-amber-500">
                        <ShieldAlert className="h-3 w-3 mr-1" />
                        Limitada
                      </Badge>
                    ) : bookmaker.status === "BLOQUEADA" || bookmaker.status === "bloqueada" ? (
                      <Badge className="bg-red-500/20 text-red-500">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Bloqueada
                      </Badge>
                    ) : (
                      <Badge className="bg-emerald-500/20 text-emerald-500">
                        Ativo
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Saldo Atual</p>
                  <p className="text-lg font-bold">{formatCurrency(bookmaker.saldo_atual)}</p>
                </div>
              </div>

              {/* KPIs Principais */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      {lucroTotal >= 0 ? (
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-red-500" />
                      )}
                      <span className="text-sm">Lucro Acumulado</span>
                    </div>
                    <p className={`text-xl font-bold ${lucroTotal >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {lucroTotal >= 0 ? '+' : ''}{formatCurrency(lucroTotal)}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Target className="h-4 w-4" />
                      <span className="text-sm">ROI</span>
                    </div>
                    <p className={`text-xl font-bold ${roi >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {roi.toFixed(2)}%
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <ArrowDownCircle className="h-4 w-4 text-blue-500" />
                      <span className="text-sm">Depositado</span>
                    </div>
                    <p className="text-xl font-bold text-blue-500">
                      {formatCurrency(totalDepositado)}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <ArrowUpCircle className="h-4 w-4 text-emerald-500" />
                      <span className="text-sm">Sacado</span>
                    </div>
                    <p className="text-xl font-bold text-emerald-500">
                      {formatCurrency(totalSacado)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Resumo Financeiro */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Resumo Operacional
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Volume Apostado</span>
                    <span className="font-medium">{formatCurrency(volumeTotal)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Qtd. Apostas</span>
                    <span className="font-medium">{qtdApostas}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Ticket Médio</span>
                    <span className="font-medium">
                      {qtdApostas > 0 ? formatCurrency(volumeTotal / qtdApostas) : '-'}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Resultado Caixa (Saque - Depósito)</span>
                    <span className={`font-bold ${resultadoCaixa >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {resultadoCaixa >= 0 ? '+' : ''}{formatCurrency(resultadoCaixa)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Eventos de Risco */}
              {eventosRisco.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 text-amber-500">
                      <AlertTriangle className="h-4 w-4" />
                      Eventos de Risco ({eventosRisco.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {eventosRisco.map((evento, idx) => (
                        <div 
                          key={idx} 
                          className="flex items-center justify-between p-2 rounded bg-amber-500/10 border border-amber-500/20"
                        >
                          <div>
                            <Badge variant="outline" className="text-amber-500 border-amber-500/30 text-xs">
                              {evento.tipo}
                            </Badge>
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDate(evento.data)}
                            </p>
                          </div>
                          <span className="text-sm font-medium text-red-500">
                            -{formatCurrency(evento.valor)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Participação em Ciclos */}
              {ciclos.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Layers className="h-4 w-4" />
                      Últimos Ciclos
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {ciclos.map((ciclo, idx) => (
                        <div 
                          key={idx}
                          className="flex items-center justify-between p-2 rounded bg-muted/50"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              Ciclo {ciclo.numero_ciclo}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(ciclo.data_inicio)} - {formatDate(ciclo.data_fim)}
                            </span>
                          </div>
                          <Badge 
                            variant={ciclo.status === "FECHADO" ? "secondary" : "default"}
                            className="text-xs"
                          >
                            {ciclo.status === "FECHADO" ? "Fechado" : "Em Andamento"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
}
