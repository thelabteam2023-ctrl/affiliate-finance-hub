import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Bell,
  Clock,
  DollarSign,
  Building2,
  User,
  Calendar,
  ArrowRight,
  RefreshCw,
  Loader2,
  FolderKanban,
  Package,
  Target,
} from "lucide-react";
import { EntregaConciliacaoDialog } from "@/components/entregas/EntregaConciliacaoDialog";

interface Alerta {
  tipo_alerta: string;
  entidade_tipo: string;
  entidade_id: string;
  user_id: string;
  titulo: string;
  descricao: string;
  valor: number | null;
  moeda: string;
  nivel_urgencia: string;
  ordem_urgencia: number;
  data_limite: string | null;
  created_at: string;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  projeto_id: string | null;
  projeto_nome: string | null;
}

interface EntregaPendente {
  id: string;
  numero_entrega: number;
  resultado_nominal: number;
  saldo_inicial: number;
  meta_valor: number | null;
  meta_percentual: number | null;
  tipo_gatilho: string;
  data_inicio: string;
  data_fim_prevista: string | null;
  status_conciliacao: string;
  nivel_urgencia: string;
  operador_nome: string;
  projeto_nome: string;
  modelo_pagamento: string;
  valor_fixo: number | null;
  percentual: number | null;
}

export default function CentralOperacoes() {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [entregasPendentes, setEntregasPendentes] = useState<EntregaPendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [conciliacaoOpen, setConciliacaoOpen] = useState(false);
  const [selectedEntrega, setSelectedEntrega] = useState<EntregaPendente | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      // Fetch alertas
      const { data: alertasData, error: alertasError } = await supabase
        .from("v_painel_operacional")
        .select("*");

      if (alertasError) throw alertasError;
      setAlertas(alertasData || []);

      // Fetch entregas pendentes
      const { data: entregasData, error: entregasError } = await supabase
        .from("v_entregas_pendentes")
        .select("*")
        .in("status_conciliacao", ["PRONTA"]);

      if (entregasError) throw entregasError;
      setEntregasPendentes(entregasData || []);
    } catch (error: any) {
      toast.error("Erro ao carregar dados: " + error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const formatCurrency = (value: number, moeda: string = "BRL") => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: moeda,
    }).format(value);
  };

  const getUrgencyBadge = (nivel: string) => {
    switch (nivel) {
      case "CRITICA":
        return (
          <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Crítico
          </Badge>
        );
      case "ALTA":
        return (
          <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">
            <Bell className="h-3 w-3 mr-1" />
            Alta
          </Badge>
        );
      case "NORMAL":
        return (
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
            <Clock className="h-3 w-3 mr-1" />
            Normal
          </Badge>
        );
      case "BAIXA":
        return (
          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
            Baixa
          </Badge>
        );
      default:
        return (
          <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">
            {nivel}
          </Badge>
        );
    }
  };

  const handleSaqueAction = (alerta: Alerta) => {
    navigate("/caixa", {
      state: {
        openDialog: true,
      },
    });
  };

  const handleParceriaAction = (alerta: Alerta) => {
    navigate("/programa-indicacao");
  };

  const handleConciliarEntrega = (entrega: EntregaPendente) => {
    setSelectedEntrega(entrega);
    setConciliacaoOpen(true);
  };

  const alertasSaques = alertas.filter((a) => a.tipo_alerta === "SAQUE_PENDENTE");
  const alertasParcerias = alertas.filter(
    (a) => a.tipo_alerta === "PARCERIA_VENCIDA" || a.tipo_alerta === "PARCERIA_VENCENDO"
  );
  const alertasCriticos = alertas.filter((a) => a.nivel_urgencia === "CRITICA");

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const totalAlertas = alertasCriticos.length + entregasPendentes.filter(e => e.nivel_urgencia === "CRITICA").length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Central de Operações</h1>
          <p className="text-muted-foreground">
            Acompanhe alertas e ações que demandam atenção imediata
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => fetchData(true)}
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-2">Atualizar</span>
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-red-500/30 bg-red-500/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alertas Críticos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-400">{totalAlertas}</div>
            <p className="text-xs text-muted-foreground">Exigem ação imediata</p>
          </CardContent>
        </Card>

        <Card className="border-purple-500/30 bg-purple-500/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Entregas Pendentes</CardTitle>
            <Package className="h-4 w-4 text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-400">{entregasPendentes.length}</div>
            <p className="text-xs text-muted-foreground">Aguardando conciliação</p>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saques Pendentes</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">{alertasSaques.length}</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(
                alertasSaques.reduce((acc, a) => acc + (a.valor || 0), 0)
              )}{" "}
              a resgatar
            </p>
          </CardContent>
        </Card>

        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Parcerias em Alerta</CardTitle>
            <Calendar className="h-4 w-4 text-yellow-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-400">{alertasParcerias.length}</div>
            <p className="text-xs text-muted-foreground">Próximas do vencimento</p>
          </CardContent>
        </Card>
      </div>

      {/* Alertas List */}
      {alertas.length === 0 && entregasPendentes.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-10">
              <Bell className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">Nenhum alerta pendente</h3>
              <p className="text-muted-foreground">
                Todas as operações estão em dia! 🎉
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Entregas Pendentes de Conciliação */}
          {entregasPendentes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-purple-400" />
                  Entregas Pendentes de Conciliação
                </CardTitle>
                <CardDescription>
                  Entregas que atingiram a meta ou período encerrado
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {entregasPendentes.map((entrega) => (
                    <div
                      key={entrega.id}
                      className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
                        entrega.nivel_urgencia === "CRITICA"
                          ? "border-red-500/30 bg-red-500/5"
                          : "bg-card hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                            entrega.nivel_urgencia === "CRITICA"
                              ? "bg-red-500/10"
                              : "bg-purple-500/10"
                          }`}
                        >
                          <Target
                            className={`h-5 w-5 ${
                              entrega.nivel_urgencia === "CRITICA"
                                ? "text-red-400"
                                : "text-purple-400"
                            }`}
                          />
                        </div>
                        <div>
                          <p className="font-medium">
                            {entrega.operador_nome} - Entrega #{entrega.numero_entrega}
                          </p>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <FolderKanban className="h-3 w-3" />
                              {entrega.projeto_nome}
                            </span>
                            {entrega.meta_valor && (
                              <span>Meta: {formatCurrency(entrega.meta_valor)}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-lg font-bold text-emerald-400">
                          {formatCurrency(entrega.resultado_nominal)}
                        </span>
                        {getUrgencyBadge(entrega.nivel_urgencia)}
                        <Badge className={
                          entrega.tipo_gatilho === "META_ATINGIDA"
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                            : "bg-blue-500/20 text-blue-400 border-blue-500/30"
                        }>
                          {entrega.tipo_gatilho === "META_ATINGIDA" ? "Meta Atingida" : "Período Fim"}
                        </Badge>
                        <Button size="sm" onClick={() => handleConciliarEntrega(entrega)}>
                          Conciliar
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Saques Pendentes */}
          {alertasSaques.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-emerald-400" />
                  Saques Pendentes
                </CardTitle>
                <CardDescription>
                  Bookmakers liberados de projetos com saldo a resgatar
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {alertasSaques.map((alerta) => (
                    <div
                      key={alerta.entidade_id}
                      className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-emerald-400" />
                        </div>
                        <div>
                          <p className="font-medium">{alerta.titulo}</p>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            {alerta.parceiro_nome && (
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {alerta.parceiro_nome}
                              </span>
                            )}
                            {alerta.projeto_nome && (
                              <span className="flex items-center gap-1">
                                <FolderKanban className="h-3 w-3" />
                                {alerta.projeto_nome}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {alerta.valor && (
                          <span className="text-lg font-bold text-emerald-400">
                            {formatCurrency(alerta.valor, alerta.moeda)}
                          </span>
                        )}
                        {getUrgencyBadge(alerta.nivel_urgencia)}
                        <Button size="sm" onClick={() => handleSaqueAction(alerta)}>
                          Processar Saque
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Parcerias */}
          {alertasParcerias.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-yellow-400" />
                  Parcerias em Alerta
                </CardTitle>
                <CardDescription>
                  Parcerias próximas do vencimento ou já vencidas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {alertasParcerias.map((alerta) => (
                    <div
                      key={alerta.entidade_id}
                      className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
                        alerta.tipo_alerta === "PARCERIA_VENCIDA"
                          ? "border-red-500/30 bg-red-500/5"
                          : "bg-card hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                            alerta.tipo_alerta === "PARCERIA_VENCIDA"
                              ? "bg-red-500/10"
                              : "bg-yellow-500/10"
                          }`}
                        >
                          <User
                            className={`h-5 w-5 ${
                              alerta.tipo_alerta === "PARCERIA_VENCIDA"
                                ? "text-red-400"
                                : "text-yellow-400"
                            }`}
                          />
                        </div>
                        <div>
                          <p className="font-medium">{alerta.titulo}</p>
                          <p className="text-sm text-muted-foreground">{alerta.descricao}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {getUrgencyBadge(alerta.nivel_urgencia)}
                        <Button
                          size="sm"
                          variant={alerta.tipo_alerta === "PARCERIA_VENCIDA" ? "destructive" : "outline"}
                          onClick={() => handleParceriaAction(alerta)}
                        >
                          Ver Detalhes
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Dialog de Conciliação */}
      {selectedEntrega && (
        <EntregaConciliacaoDialog
          open={conciliacaoOpen}
          onOpenChange={setConciliacaoOpen}
          entrega={{
            id: selectedEntrega.id,
            numero_entrega: selectedEntrega.numero_entrega,
            resultado_nominal: selectedEntrega.resultado_nominal,
            saldo_inicial: selectedEntrega.saldo_inicial,
            meta_valor: selectedEntrega.meta_valor,
            meta_percentual: selectedEntrega.meta_percentual,
            tipo_gatilho: selectedEntrega.tipo_gatilho,
            data_inicio: selectedEntrega.data_inicio,
            data_fim_prevista: selectedEntrega.data_fim_prevista,
          }}
          operadorNome={selectedEntrega.operador_nome}
          modeloPagamento={selectedEntrega.modelo_pagamento}
          valorFixo={selectedEntrega.valor_fixo || 0}
          percentual={selectedEntrega.percentual || 0}
          onSuccess={() => fetchData(true)}
        />
      )}
    </div>
  );
}
