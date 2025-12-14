import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { 
  Plus, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  XCircle,
  Play,
  TrendingUp,
  TrendingDown,
  Target,
  Zap,
  AlertTriangle
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CicloDialog } from "./CicloDialog";

interface Ciclo {
  id: string;
  numero_ciclo: number;
  data_inicio: string;
  data_fim_prevista: string;
  data_fim_real: string | null;
  status: string;
  lucro_bruto: number;
  lucro_liquido: number;
  observacoes: string | null;
  tipo_gatilho: string;
  meta_volume: number | null;
  metrica_acumuladora: string;
  valor_acumulado: number;
  excedente_anterior: number;
  excedente_proximo: number;
  operador_projeto_id: string | null;
}

interface ProjetoCiclosTabProps {
  projetoId: string;
}

export function ProjetoCiclosTab({ projetoId }: ProjetoCiclosTabProps) {
  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCiclo, setSelectedCiclo] = useState<Ciclo | null>(null);

  useEffect(() => {
    fetchCiclos();
  }, [projetoId]);

  const fetchCiclos = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("projeto_ciclos")
        .select("*")
        .eq("projeto_id", projetoId)
        .order("numero_ciclo", { ascending: false });

      if (error) throw error;
      setCiclos(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar ciclos: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCiclo = () => {
    setSelectedCiclo(null);
    setDialogOpen(true);
  };

  const handleEditCiclo = (ciclo: Ciclo) => {
    setSelectedCiclo(ciclo);
    setDialogOpen(true);
  };

  const handleFecharCiclo = async (ciclo: Ciclo) => {
    try {
      // Calcular métricas completas do período
      const [apostasResult, apostasMultiplasResult, surebetsResult] = await Promise.all([
        supabase
          .from("apostas")
          .select("lucro_prejuizo, stake")
          .eq("projeto_id", projetoId)
          .gte("data_aposta", ciclo.data_inicio)
          .lte("data_aposta", ciclo.data_fim_prevista)
          .eq("status", "FINALIZADA"),
        supabase
          .from("apostas_multiplas")
          .select("lucro_prejuizo, stake")
          .eq("projeto_id", projetoId)
          .gte("data_aposta", ciclo.data_inicio)
          .lte("data_aposta", ciclo.data_fim_prevista)
          .in("resultado", ["GREEN", "RED", "VOID", "MEIO_GREEN", "MEIO_RED"]),
        supabase
          .from("surebets")
          .select("lucro_real, stake_total")
          .eq("projeto_id", projetoId)
          .gte("data_evento", ciclo.data_inicio)
          .lte("data_evento", ciclo.data_fim_prevista)
          .eq("status", "FINALIZADA"),
      ]);

      const apostas = apostasResult.data || [];
      const apostasMultiplas = apostasMultiplasResult.data || [];
      const surebets = surebetsResult.data || [];

      // Calcular totais
      const qtdApostas = apostas.length + apostasMultiplas.length + surebets.length;
      const volumeApostado = 
        apostas.reduce((acc, a) => acc + (a.stake || 0), 0) +
        apostasMultiplas.reduce((acc, a) => acc + (a.stake || 0), 0) +
        surebets.reduce((acc, a) => acc + (a.stake_total || 0), 0);
      const lucroBruto = 
        apostas.reduce((acc, a) => acc + (a.lucro_prejuizo || 0), 0) +
        apostasMultiplas.reduce((acc, a) => acc + (a.lucro_prejuizo || 0), 0) +
        surebets.reduce((acc, a) => acc + (a.lucro_real || 0), 0);

      // Calcular ROI
      const roi = volumeApostado > 0 ? (lucroBruto / volumeApostado) * 100 : 0;

      // Calcular excedente se ciclo por volume
      let excedenteProximo = 0;
      if (ciclo.tipo_gatilho !== "TEMPO" && ciclo.meta_volume) {
        const metricaFinal = ciclo.metrica_acumuladora === "VOLUME_APOSTADO" ? volumeApostado : lucroBruto;
        if (metricaFinal > ciclo.meta_volume) {
          excedenteProximo = metricaFinal - ciclo.meta_volume;
        }
      }

      const { error } = await supabase
        .from("projeto_ciclos")
        .update({
          status: "FECHADO",
          data_fim_real: new Date().toISOString().split("T")[0],
          lucro_bruto: lucroBruto,
          lucro_liquido: lucroBruto,
          valor_acumulado: ciclo.metrica_acumuladora === "VOLUME_APOSTADO" ? volumeApostado : lucroBruto,
          excedente_proximo: excedenteProximo,
          gatilho_fechamento: "MANUAL",
          data_fechamento: new Date().toISOString(),
          // Store additional metrics in observacoes JSON-like format
          observacoes: ciclo.observacoes 
            ? `${ciclo.observacoes}\n\n📊 Métricas: ${qtdApostas} apostas | Volume: R$ ${volumeApostado.toFixed(2)} | ROI: ${roi.toFixed(2)}%`
            : `📊 Métricas: ${qtdApostas} apostas | Volume: R$ ${volumeApostado.toFixed(2)} | ROI: ${roi.toFixed(2)}%`,
        })
        .eq("id", ciclo.id);

      if (error) throw error;
      toast.success(`Ciclo fechado! ${qtdApostas} apostas, Lucro: R$ ${lucroBruto.toFixed(2)}, ROI: ${roi.toFixed(2)}%`);
      fetchCiclos();
    } catch (error: any) {
      toast.error("Erro ao fechar ciclo: " + error.message);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "EM_ANDAMENTO":
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30"><Play className="h-3 w-3 mr-1" />Em Andamento</Badge>;
      case "FECHADO":
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30"><CheckCircle2 className="h-3 w-3 mr-1" />Fechado</Badge>;
      case "CANCELADO":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><XCircle className="h-3 w-3 mr-1" />Cancelado</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getTipoGatilhoBadge = (tipo: string) => {
    switch (tipo) {
      case "TEMPO":
        return <Badge variant="outline" className="text-blue-400 border-blue-500/30"><Clock className="h-3 w-3 mr-1" />Tempo</Badge>;
      case "VOLUME":
        return <Badge variant="outline" className="text-purple-400 border-purple-500/30"><Target className="h-3 w-3 mr-1" />Volume</Badge>;
      case "HIBRIDO":
        return <Badge variant="outline" className="text-amber-400 border-amber-500/30"><Zap className="h-3 w-3 mr-1" />Híbrido</Badge>;
      default:
        return null;
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getDiasRestantes = (dataFim: string) => {
    const fim = new Date(dataFim);
    const hoje = new Date();
    return differenceInDays(fim, hoje);
  };

  const getProgressoVolume = (ciclo: Ciclo) => {
    if (!ciclo.meta_volume || ciclo.meta_volume === 0) return 0;
    return Math.min(100, (ciclo.valor_acumulado / ciclo.meta_volume) * 100);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Ciclos de Apuração</h3>
          <p className="text-sm text-muted-foreground">
            Períodos de apuração financeira (por tempo ou volume)
          </p>
        </div>
        <Button onClick={handleCreateCiclo}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Ciclo
        </Button>
      </div>

      {ciclos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <h4 className="text-lg font-medium mb-2">Nenhum ciclo criado</h4>
            <p className="text-muted-foreground text-center mb-4">
              Crie o primeiro ciclo para iniciar a apuração financeira
            </p>
            <Button onClick={handleCreateCiclo}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Primeiro Ciclo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {ciclos.map((ciclo) => {
            const diasRestantes = getDiasRestantes(ciclo.data_fim_prevista);
            const isAtrasado = ciclo.status === "EM_ANDAMENTO" && diasRestantes < 0;
            const progressoVolume = getProgressoVolume(ciclo);
            const isVolumeProximo = ciclo.tipo_gatilho !== "TEMPO" && progressoVolume >= 90;

            return (
              <Card key={ciclo.id} className={isAtrasado || isVolumeProximo ? "border-amber-500/50" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-bold">
                        {ciclo.numero_ciclo}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base">Ciclo {ciclo.numero_ciclo}</CardTitle>
                          {getTipoGatilhoBadge(ciclo.tipo_gatilho)}
                        </div>
                        <CardDescription className="flex items-center gap-2">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(ciclo.data_inicio), "dd/MM/yyyy", { locale: ptBR })} - {format(new Date(ciclo.data_fim_prevista), "dd/MM/yyyy", { locale: ptBR })}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(ciclo.status)}
                      {ciclo.status === "EM_ANDAMENTO" && ciclo.tipo_gatilho === "TEMPO" && (
                        <Badge variant="outline" className={isAtrasado ? "text-amber-400 border-amber-500/50" : ""}>
                          <Clock className="h-3 w-3 mr-1" />
                          {isAtrasado ? `${Math.abs(diasRestantes)} dias atrasado` : `${diasRestantes} dias restantes`}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Barra de progresso para ciclos volumétricos */}
                  {ciclo.tipo_gatilho !== "TEMPO" && ciclo.meta_volume && ciclo.status === "EM_ANDAMENTO" && (
                    <div className="mb-4 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          Progresso: {formatCurrency(ciclo.valor_acumulado)} de {formatCurrency(ciclo.meta_volume)}
                        </span>
                        <span className={progressoVolume >= 90 ? "text-amber-400 font-medium" : "text-muted-foreground"}>
                          {progressoVolume.toFixed(1)}%
                        </span>
                      </div>
                      <Progress 
                        value={progressoVolume} 
                        className={progressoVolume >= 90 ? "bg-amber-500/20" : ""} 
                      />
                      {isVolumeProximo && (
                        <div className="flex items-center gap-2 text-amber-400 text-sm">
                          <AlertTriangle className="h-4 w-4" />
                          <span>Meta próxima de ser atingida!</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Lucro Bruto</p>
                      <p className={`text-lg font-semibold ${ciclo.lucro_bruto >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                        {ciclo.lucro_bruto >= 0 ? <TrendingUp className="h-4 w-4 inline mr-1" /> : <TrendingDown className="h-4 w-4 inline mr-1" />}
                        {formatCurrency(ciclo.lucro_bruto)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {ciclo.excedente_anterior > 0 ? "Excedente Anterior" : "Lucro Líquido"}
                      </p>
                      <p className={`text-lg font-semibold ${ciclo.lucro_liquido >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                        {ciclo.excedente_anterior > 0 
                          ? formatCurrency(ciclo.excedente_anterior)
                          : formatCurrency(ciclo.lucro_liquido)
                        }
                      </p>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      {ciclo.status === "EM_ANDAMENTO" && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => handleEditCiclo(ciclo)}>
                            Editar
                          </Button>
                          <Button size="sm" onClick={() => handleFecharCiclo(ciclo)}>
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            Fechar
                          </Button>
                        </>
                      )}
                      {ciclo.status === "FECHADO" && (
                        <Button variant="ghost" size="sm" onClick={() => handleEditCiclo(ciclo)}>
                          Ver Detalhes
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Info de excedente */}
                  {ciclo.excedente_proximo > 0 && ciclo.status === "FECHADO" && (
                    <div className="mt-2 pt-2 border-t flex items-center gap-2 text-sm text-muted-foreground">
                      <Target className="h-4 w-4" />
                      <span>Excedente de {formatCurrency(ciclo.excedente_proximo)} transferido para próximo ciclo</span>
                    </div>
                  )}

                  {ciclo.observacoes && (
                    <p className="text-sm text-muted-foreground mt-2 pt-2 border-t">
                      {ciclo.observacoes}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CicloDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projetoId={projetoId}
        ciclo={selectedCiclo}
        proximoNumero={ciclos.length > 0 ? Math.max(...ciclos.map(c => c.numero_ciclo)) + 1 : 1}
        onSuccess={fetchCiclos}
      />
    </div>
  );
}