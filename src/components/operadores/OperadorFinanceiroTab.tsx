import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  DollarSign, 
  Plus, 
  Calendar,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  Percent,
  Target,
  Award,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  BarChart3
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PagamentoOperadorDialog } from "./PagamentoOperadorDialog";
import { ConfirmarPagamentoOperadorDialog } from "./ConfirmarPagamentoOperadorDialog";
import { toast } from "sonner";
import { ModernBarChart } from "@/components/ui/modern-bar-chart";

interface ProjetoLucro {
  operador_projeto_id: string;
  projeto_id: string;
  projeto_nome: string;
  modelo_pagamento: string;
  valor_fixo: number;
  percentual: number;
  base_calculo: string;
  frequencia_entrega: string;
  meta_valor: number | null;
  meta_percentual: number | null;
  tipo_meta: string | null;
  faixas_escalonadas: any;
  status: string;
  lucro_projeto: number;
  faturamento_projeto: number;
  total_apostas: number;
  apostas_ganhas: number;
  total_depositado: number;
  total_sacado: number;
}

interface Pagamento {
  id: string;
  tipo_pagamento: string;
  valor: number;
  moeda: string;
  data_pagamento: string;
  data_competencia: string | null;
  descricao: string | null;
  status: string;
  projeto_id?: string | null;
  projeto_nome?: string | null;
}

interface Entrega {
  id: string;
  numero_entrega: number;
  status: string;
  meta_valor: number | null;
  resultado_nominal: number;
  valor_pagamento_operador: number;
  pagamento_realizado: boolean;
  data_inicio: string;
  data_fim_prevista: string | null;
  data_fim_real: string | null;
  operador_projeto_id: string;
  projeto_nome?: string;
}

interface OperadorFinanceiroTabProps {
  operadorId: string;
  operadorNome: string;
}

const MODELOS_LABELS: Record<string, string> = {
  FIXO_MENSAL: "Fixo Mensal",
  PORCENTAGEM: "Porcentagem",
  HIBRIDO: "Híbrido",
  POR_ENTREGA: "Por Entrega",
  COMISSAO_ESCALONADA: "Comissão Escalonada",
  PROPORCIONAL_LUCRO: "Proporcional ao Lucro",
};

const TIPOS_PAGAMENTO_LABELS: Record<string, string> = {
  SALARIO: "Salário",
  COMISSAO: "Comissão",
  BONUS: "Bônus",
  ADIANTAMENTO: "Adiantamento",
  REEMBOLSO: "Reembolso",
  OUTROS: "Outros",
};

export function OperadorFinanceiroTab({ operadorId, operadorNome }: OperadorFinanceiroTabProps) {
  const [projetos, setProjetos] = useState<ProjetoLucro[]>([]);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPagamento, setSelectedPagamento] = useState<Pagamento | null>(null);
  const [confirmarPagamentoOpen, setConfirmarPagamentoOpen] = useState(false);
  const [pagamentoParaPagar, setPagamentoParaPagar] = useState<Pagamento | null>(null);

  useEffect(() => {
    if (operadorId) {
      fetchData();
    }
  }, [operadorId]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch projetos com lucro
      const { data: projData, error: projError } = await supabase
        .from("v_projeto_lucro_operador")
        .select("*")
        .eq("operador_id", operadorId);

      if (projError) throw projError;
      setProjetos(projData || []);

      // Fetch pagamentos
      const { data: pagData, error: pagError } = await supabase
        .from("pagamentos_operador")
        .select(`
          id,
          tipo_pagamento,
          valor,
          moeda,
          data_pagamento,
          data_competencia,
          descricao,
          status,
          projeto_id,
          projetos(nome)
        `)
        .eq("operador_id", operadorId)
        .order("data_pagamento", { ascending: false });

      if (pagError) throw pagError;
      setPagamentos(
        (pagData || []).map((p: any) => ({
          ...p,
          projeto_id: p.projeto_id || null,
          projeto_nome: p.projetos?.nome || null,
        }))
      );

      // Fetch entregas do operador
      if (projData && projData.length > 0) {
        const opProjetoIds = projData.map(p => p.operador_projeto_id);
        const { data: entregasData, error: entregasError } = await supabase
          .from("entregas")
          .select("*")
          .in("operador_projeto_id", opProjetoIds)
          .order("created_at", { ascending: false })
          .limit(10);

        if (!entregasError && entregasData) {
          // Enrich with project names
          const enrichedEntregas = entregasData.map(e => {
            const proj = projData.find(p => p.operador_projeto_id === e.operador_projeto_id);
            return {
              ...e,
              projeto_nome: proj?.projeto_nome || "N/A"
            };
          });
          setEntregas(enrichedEntregas);
        }
      }
    } catch (error: any) {
      console.error("Erro ao carregar dados:", error);
      toast.error("Erro ao carregar dados financeiros");
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

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  // Calcular valores por projeto
  const projetosCalculados = useMemo(() => {
    return projetos.map((proj) => {
      const lucro = proj.lucro_projeto;
      let valorCalculado = 0;
      let baseUtilizada = 0;
      let percentualAplicado = 0;

      switch (proj.modelo_pagamento) {
        case "FIXO_MENSAL":
          valorCalculado = proj.valor_fixo;
          break;
        case "PORCENTAGEM":
        case "PROPORCIONAL_LUCRO":
          baseUtilizada = proj.base_calculo === "FATURAMENTO_PROJETO" 
            ? proj.faturamento_projeto 
            : lucro;
          percentualAplicado = proj.percentual;
          valorCalculado = baseUtilizada > 0 ? baseUtilizada * (percentualAplicado / 100) : 0;
          break;
        case "HIBRIDO":
          baseUtilizada = proj.base_calculo === "FATURAMENTO_PROJETO" 
            ? proj.faturamento_projeto 
            : lucro;
          percentualAplicado = proj.percentual;
          valorCalculado = proj.valor_fixo + (baseUtilizada > 0 ? baseUtilizada * (percentualAplicado / 100) : 0);
          break;
        case "POR_ENTREGA":
          if (proj.meta_valor && lucro >= proj.meta_valor) {
            baseUtilizada = lucro;
            percentualAplicado = proj.percentual;
            valorCalculado = lucro * (percentualAplicado / 100);
          }
          break;
        case "COMISSAO_ESCALONADA":
          if (proj.faixas_escalonadas && lucro > 0) {
            const faixas = proj.faixas_escalonadas as any[];
            for (const faixa of faixas) {
              if (lucro >= faixa.min && (faixa.max === null || lucro <= faixa.max)) {
                baseUtilizada = lucro;
                percentualAplicado = faixa.percentual;
                valorCalculado = lucro * (faixa.percentual / 100);
                break;
              }
            }
          }
          break;
      }

      // Calcular progresso da meta (se aplicável)
      let progressoMeta = 0;
      if (proj.modelo_pagamento === "POR_ENTREGA" && proj.meta_valor) {
        progressoMeta = Math.min((lucro / proj.meta_valor) * 100, 100);
      }

      // Calcular ROI do projeto
      const roi = proj.total_depositado > 0 
        ? (lucro / proj.total_depositado) * 100 
        : 0;
      
      // Calcular win rate
      const winRate = proj.total_apostas > 0 
        ? (proj.apostas_ganhas / proj.total_apostas) * 100 
        : 0;

      return {
        ...proj,
        valorCalculado,
        baseUtilizada,
        percentualAplicado,
        progressoMeta,
        roi,
        winRate,
      };
    });
  }, [projetos]);

  // Totais
  const totalPago = useMemo(() => {
    return pagamentos
      .filter((p) => p.status === "CONFIRMADO")
      .reduce((acc, p) => acc + p.valor, 0);
  }, [pagamentos]);

  const totalPendente = useMemo(() => {
    return pagamentos
      .filter((p) => p.status === "PENDENTE")
      .reduce((acc, p) => acc + p.valor, 0);
  }, [pagamentos]);

  const valorEstimadoMes = useMemo(() => {
    return projetosCalculados.reduce((acc, p) => acc + p.valorCalculado, 0);
  }, [projetosCalculados]);

  const lucroTotalGerado = useMemo(() => {
    return projetosCalculados.reduce((acc, p) => acc + p.lucro_projeto, 0);
  }, [projetosCalculados]);

  const entregasPendentes = useMemo(() => {
    return entregas.filter(e => e.status === "EM_ANDAMENTO" || e.status === "CONCLUIDA" && !e.pagamento_realizado);
  }, [entregas]);

  const entregasPagas = useMemo(() => {
    return entregas.filter(e => e.pagamento_realizado);
  }, [entregas]);

  // Chart data for payments by month
  const pagamentosPorMes = useMemo(() => {
    const months: Record<string, number> = {};
    pagamentos
      .filter(p => p.status === "CONFIRMADO")
      .forEach(p => {
        const month = format(new Date(p.data_pagamento), "MMM/yy", { locale: ptBR });
        months[month] = (months[month] || 0) + p.valor;
      });
    
    return Object.entries(months)
      .slice(-6)
      .map(([mes, valor]) => ({ mes, valor }));
  }, [pagamentos]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "CONFIRMADO": return "bg-emerald-500/20 text-emerald-400";
      case "PENDENTE": return "bg-yellow-500/20 text-yellow-400";
      case "CANCELADO": return "bg-red-500/20 text-red-400";
      default: return "bg-gray-500/20 text-gray-400";
    }
  };

  const getEntregaStatusColor = (status: string, pago: boolean) => {
    if (pago) return "bg-emerald-500/20 text-emerald-400";
    switch (status) {
      case "EM_ANDAMENTO": return "bg-blue-500/20 text-blue-400";
      case "CONCLUIDA": return "bg-yellow-500/20 text-yellow-400";
      case "CANCELADA": return "bg-red-500/20 text-red-400";
      default: return "bg-gray-500/20 text-gray-400";
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              Total Pago
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-500">
              {formatCurrency(totalPago)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {pagamentos.filter(p => p.status === "CONFIRMADO").length} pagamento(s)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              Pendente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-500">
              {formatCurrency(totalPendente)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {pagamentos.filter(p => p.status === "PENDENTE").length} pagamento(s)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Estimado (Período)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">
              {formatCurrency(valorEstimadoMes)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {projetosCalculados.length} projeto(s) ativo(s)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Wallet className="h-4 w-4 text-blue-500" />
              Lucro Gerado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${lucroTotalGerado >= 0 ? "text-emerald-500" : "text-red-500"}`}>
              {formatCurrency(lucroTotalGerado)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Acumulado dos projetos
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de Pagamentos */}
      {pagamentosPorMes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Histórico de Pagamentos
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-hidden">
            <div className="h-[200px] overflow-hidden">
              <ModernBarChart
                data={pagamentosPorMes}
                categoryKey="mes"
                bars={[
                  {
                    dataKey: "valor",
                    label: "Valor Pago",
                    gradientStart: "#22C55E",
                    gradientEnd: "#16A34A",
                  },
                ]}
                height={180}
                showLabels={false}
                showLegend={false}
                formatValue={(value) => formatCurrency(value)}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Entregas Recentes */}
      {entregas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Entregas Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {entregas.slice(0, 5).map((entrega) => {
                const progresso = entrega.meta_valor 
                  ? Math.min((entrega.resultado_nominal / entrega.meta_valor) * 100, 100)
                  : 0;
                
                return (
                  <div 
                    key={entrega.id}
                    className="p-3 rounded-lg bg-muted/30 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">#{entrega.numero_entrega}</Badge>
                        <span className="text-sm font-medium">{entrega.projeto_nome}</span>
                      </div>
                      <Badge className={getEntregaStatusColor(entrega.status, entrega.pagamento_realizado)}>
                        {entrega.pagamento_realizado ? "Pago" : entrega.status.replace("_", " ")}
                      </Badge>
                    </div>
                    
                    {entrega.meta_valor && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span>Resultado: {formatCurrency(entrega.resultado_nominal)}</span>
                          <span>Meta: {formatCurrency(entrega.meta_valor)}</span>
                        </div>
                        <Progress value={progresso} className="h-1.5" />
                      </div>
                    )}
                    
                    {entrega.valor_pagamento_operador > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Valor Calculado:</span>
                        <span className="font-medium text-primary">
                          {formatCurrency(entrega.valor_pagamento_operador)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resumo por Projeto */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Cálculo por Projeto
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {projetosCalculados.map((proj) => (
              <div
                key={proj.operador_projeto_id}
                className="p-4 rounded-lg bg-muted/30 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-medium">{proj.projeto_nome}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline">
                        {MODELOS_LABELS[proj.modelo_pagamento] || proj.modelo_pagamento}
                      </Badge>
                      <Badge className={proj.status === "ATIVO" ? "bg-emerald-500/20 text-emerald-400" : "bg-gray-500/20 text-gray-400"}>
                        {proj.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-primary">
                      {formatCurrency(proj.valorCalculado)}
                    </p>
                    <p className="text-xs text-muted-foreground">a pagar</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Lucro:</span>
                    <span className={`ml-2 font-medium ${proj.lucro_projeto >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {formatCurrency(proj.lucro_projeto)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">ROI:</span>
                    <span className={`ml-2 font-medium ${proj.roi >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {formatPercent(proj.roi)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Win Rate:</span>
                    <span className="ml-2 font-medium">
                      {formatPercent(proj.winRate)}
                    </span>
                  </div>
                  {proj.modelo_pagamento !== "FIXO_MENSAL" && (
                    <div>
                      <span className="text-muted-foreground">% Acordo:</span>
                      <span className="ml-2 font-medium">
                        {formatPercent(proj.percentualAplicado)}
                      </span>
                    </div>
                  )}
                  {(proj.modelo_pagamento === "FIXO_MENSAL" || proj.modelo_pagamento === "HIBRIDO") && (
                    <div>
                      <span className="text-muted-foreground">Fixo:</span>
                      <span className="ml-2 font-medium">
                        {formatCurrency(proj.valor_fixo)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Progress bar para meta */}
                {proj.modelo_pagamento === "POR_ENTREGA" && proj.meta_valor && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>Meta: {formatCurrency(proj.meta_valor)}</span>
                      <span>{formatPercent(proj.progressoMeta)} concluído</span>
                    </div>
                    <Progress 
                      value={proj.progressoMeta}
                      className="h-2"
                    />
                    {proj.progressoMeta < 100 && (
                      <p className="text-xs text-muted-foreground">
                        Faltam {formatCurrency(proj.meta_valor - proj.lucro_projeto)} para próxima entrega
                      </p>
                    )}
                    {proj.progressoMeta >= 100 && (
                      <p className="text-xs text-emerald-500 font-medium flex items-center gap-1">
                        <Award className="h-3 w-3" />
                        Meta atingida! Valor estimado: {formatCurrency(proj.valorCalculado)}
                      </p>
                    )}
                  </div>
                )}

                {/* Faixas escalonadas */}
                {proj.modelo_pagamento === "COMISSAO_ESCALONADA" && proj.faixas_escalonadas && (
                  <div className="text-xs space-y-1">
                    <span className="text-muted-foreground">Faixas:</span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {(proj.faixas_escalonadas as any[]).map((faixa, idx) => {
                        const isActive = proj.lucro_projeto >= faixa.min && 
                          (faixa.max === null || proj.lucro_projeto <= faixa.max);
                        return (
                          <Badge 
                            key={idx} 
                            variant={isActive ? "default" : "outline"}
                            className={isActive ? "bg-primary" : ""}
                          >
                            {formatCurrency(faixa.min)} - {faixa.max ? formatCurrency(faixa.max) : "∞"}: {faixa.percentual}%
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {projetosCalculados.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Nenhum projeto vinculado</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Histórico de Pagamentos */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Histórico de Pagamentos
          </CardTitle>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Registrar Pagamento
          </Button>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[90px]">Data</TableHead>
                  <TableHead className="w-[80px]">Compet.</TableHead>
                  <TableHead className="w-[90px]">Tipo</TableHead>
                  <TableHead>Projeto</TableHead>
                  <TableHead className="text-right w-[100px]">Valor</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="text-right w-[90px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagamentos.map((pag) => (
                  <TableRow 
                    key={pag.id}
                    className="hover:bg-muted/50 transition-colors"
                  >
                    <TableCell>
                      {format(new Date(pag.data_pagamento), "dd/MM/yyyy", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      {pag.data_competencia 
                        ? format(new Date(pag.data_competencia), "MMM/yyyy", { locale: ptBR })
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {TIPOS_PAGAMENTO_LABELS[pag.tipo_pagamento] || pag.tipo_pagamento}
                    </TableCell>
                    <TableCell>{pag.projeto_nome || "-"}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(pag.valor)}
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(pag.status)}>
                        {pag.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {pag.status === "PENDENTE" ? (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPagamentoParaPagar(pag);
                            setConfirmarPagamentoOpen(true);
                          }}
                        >
                          <DollarSign className="h-3 w-3 mr-1" />
                          Pagar
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPagamento(pag);
                            setDialogOpen(true);
                          }}
                        >
                          Detalhes
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {pagamentos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhum pagamento registrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      <PagamentoOperadorDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setSelectedPagamento(null);
        }}
        defaultOperadorId={operadorId}
        pagamento={selectedPagamento ? {
          id: selectedPagamento.id,
          operador_id: operadorId,
          projeto_id: selectedPagamento.projeto_id || null,
          tipo_pagamento: selectedPagamento.tipo_pagamento,
          valor: selectedPagamento.valor,
          moeda: selectedPagamento.moeda,
          data_pagamento: selectedPagamento.data_pagamento,
          data_competencia: selectedPagamento.data_competencia,
          descricao: selectedPagamento.descricao,
          status: selectedPagamento.status,
        } : undefined}
        onSuccess={fetchData}
      />

      <ConfirmarPagamentoOperadorDialog
        open={confirmarPagamentoOpen}
        onOpenChange={(open) => {
          setConfirmarPagamentoOpen(open);
          if (!open) setPagamentoParaPagar(null);
        }}
        pagamento={pagamentoParaPagar ? {
          id: pagamentoParaPagar.id,
          operador_id: operadorId,
          operador_nome: operadorNome,
          projeto_id: pagamentoParaPagar.projeto_id || null,
          projeto_nome: pagamentoParaPagar.projeto_nome || undefined,
          tipo_pagamento: pagamentoParaPagar.tipo_pagamento,
          valor: pagamentoParaPagar.valor,
          moeda: pagamentoParaPagar.moeda,
          data_pagamento: pagamentoParaPagar.data_pagamento,
          descricao: pagamentoParaPagar.descricao,
        } : null}
        onSuccess={fetchData}
      />
    </div>
  );
}
