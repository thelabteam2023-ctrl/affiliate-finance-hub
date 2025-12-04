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
} from "lucide-react";

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

export default function CentralOperacoes() {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchAlertas();
  }, []);

  const fetchAlertas = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const { data, error } = await supabase
        .from("v_painel_operacional")
        .select("*");

      if (error) throw error;

      setAlertas(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar alertas: " + error.message);
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

  const getAlertTypeIcon = (tipo: string) => {
    switch (tipo) {
      case "SAQUE_PENDENTE":
        return <DollarSign className="h-5 w-5 text-emerald-400" />;
      case "PARCERIA_VENCIDA":
        return <AlertTriangle className="h-5 w-5 text-red-400" />;
      case "PARCERIA_VENCENDO":
        return <Calendar className="h-5 w-5 text-yellow-400" />;
      default:
        return <Bell className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const handleSaqueAction = (alerta: Alerta) => {
    // Navegar para Caixa com contexto para abrir dialog de saque
    navigate("/caixa", {
      state: {
        openDialog: true,
        tipoTransacao: "SAQUE",
        origemBookmakerId: alerta.entidade_id,
      },
    });
  };

  const handleParceriaAction = (alerta: Alerta) => {
    navigate("/programa-indicacao");
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
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

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
          onClick={() => fetchAlertas(true)}
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
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-red-500/30 bg-red-500/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alertas Críticos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-400">{alertasCriticos.length}</div>
            <p className="text-xs text-muted-foreground">Exigem ação imediata</p>
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
      {alertas.length === 0 ? (
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
    </div>
  );
}
