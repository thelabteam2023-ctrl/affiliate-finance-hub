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
  Users,
  Banknote,
  CheckCircle2,
  XCircle,
  Landmark,
} from "lucide-react";
import { EntregaConciliacaoDialog } from "@/components/entregas/EntregaConciliacaoDialog";
import { ConfirmarSaqueDialog } from "@/components/caixa/ConfirmarSaqueDialog";

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
  status_anterior: string | null;
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

interface PagamentoParceiroPendente {
  parceriaId: string;
  parceiroNome: string;
  valorParceiro: number;
  origemTipo: string;
  diasRestantes: number;
}

interface ParceriaAlertaEncerramento {
  id: string;
  parceiroNome: string;
  diasRestantes: number;
  dataFim: string;
}

interface ParceiroSemParceria {
  id: string;
  nome: string;
  cpf: string;
  createdAt: string;
}

interface SaquePendenteConfirmacao {
  id: string;
  valor: number;
  moeda: string;
  data_transacao: string;
  descricao: string | null;
  origem_bookmaker_id: string | null;
  destino_parceiro_id: string | null;
  destino_conta_bancaria_id: string | null;
  bookmaker_nome?: string;
  parceiro_nome?: string;
  banco_nome?: string;
}

export default function CentralOperacoes() {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [entregasPendentes, setEntregasPendentes] = useState<EntregaPendente[]>([]);
  const [pagamentosParceiros, setPagamentosParceiros] = useState<PagamentoParceiroPendente[]>([]);
  const [parceriasEncerramento, setParceriasEncerramento] = useState<ParceriaAlertaEncerramento[]>([]);
  const [parceirosSemParceria, setParceirosSemParceria] = useState<ParceiroSemParceria[]>([]);
  const [saquesPendentes, setSaquesPendentes] = useState<SaquePendenteConfirmacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [conciliacaoOpen, setConciliacaoOpen] = useState(false);
  const [selectedEntrega, setSelectedEntrega] = useState<EntregaPendente | null>(null);
  const [confirmarSaqueOpen, setConfirmarSaqueOpen] = useState(false);
  const [selectedSaque, setSelectedSaque] = useState<SaquePendenteConfirmacao | null>(null);
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

      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      // Fetch all data in parallel
      const [
        alertasResult,
        entregasResult,
        parceirosResult,
        movimentacoesResult,
        encerResult,
        todosParceirosResult,
        todasParceriasResult,
        saquesPendentesResult
      ] = await Promise.all([
        supabase.from("v_painel_operacional").select("*"),
        supabase.from("v_entregas_pendentes").select("*").in("status_conciliacao", ["PRONTA"]),
        supabase
          .from("parcerias")
          .select(`
            id,
            valor_parceiro,
            origem_tipo,
            data_fim_prevista,
            custo_aquisicao_isento,
            parceiro:parceiros(nome)
          `)
          .in("status", ["ATIVA", "EM_ENCERRAMENTO"])
          .or("custo_aquisicao_isento.is.null,custo_aquisicao_isento.eq.false")
          .gt("valor_parceiro", 0),
        supabase
          .from("movimentacoes_indicacao")
          .select("parceria_id, tipo, status")
          .eq("tipo", "PAGTO_PARCEIRO")
          .eq("status", "CONFIRMADO"),
        supabase
          .from("parcerias")
          .select(`
            id,
            data_fim_prevista,
            parceiro:parceiros(nome)
          `)
          .in("status", ["ATIVA", "EM_ENCERRAMENTO"])
          .not("data_fim_prevista", "is", null),
        // Buscar todos os parceiros ativos
        supabase
          .from("parceiros")
          .select("id, nome, cpf, created_at")
          .eq("status", "ativo"),
        // Buscar todas as parcerias ativas ou em encerramento (para identificar parceiros com parceria)
        supabase
          .from("parcerias")
          .select("parceiro_id")
          .in("status", ["ATIVA", "EM_ENCERRAMENTO"]),
        // Buscar saques pendentes de confirmação
        supabase
          .from("cash_ledger")
          .select(`
            id,
            valor,
            moeda,
            data_transacao,
            descricao,
            origem_bookmaker_id,
            destino_parceiro_id,
            destino_conta_bancaria_id
          `)
          .eq("tipo_transacao", "SAQUE")
          .eq("status", "PENDENTE")
          .order("data_transacao", { ascending: false })
      ]);

      if (alertasResult.error) throw alertasResult.error;
      setAlertas(alertasResult.data || []);

      if (entregasResult.error) throw entregasResult.error;
      setEntregasPendentes(entregasResult.data || []);

      // Pagamentos pendentes a parceiros - excluir os já pagos
      if (!parceirosResult.error && !movimentacoesResult.error) {
        const parceriasPagas = (movimentacoesResult.data || []).map((m: any) => m.parceria_id);
        
        const pagamentosMap: PagamentoParceiroPendente[] = (parceirosResult.data || [])
          .filter((p: any) => !parceriasPagas.includes(p.id))
          .map((p: any) => {
            const dataFim = p.data_fim_prevista ? new Date(p.data_fim_prevista) : null;
            let diasRestantes = 999;
            if (dataFim) {
              dataFim.setHours(0, 0, 0, 0);
              diasRestantes = Math.ceil((dataFim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
            }
            return {
              parceriaId: p.id,
              parceiroNome: p.parceiro?.nome || "N/A",
              valorParceiro: p.valor_parceiro,
              origemTipo: p.origem_tipo || "INDICADOR",
              diasRestantes,
            };
          });
        setPagamentosParceiros(pagamentosMap);
      }

      // Parcerias próximas do encerramento (≤ 7 dias)
      if (!encerResult.error) {
        const alertasEncer: ParceriaAlertaEncerramento[] = (encerResult.data || [])
          .map((p: any) => {
            const dataFim = new Date(p.data_fim_prevista);
            dataFim.setHours(0, 0, 0, 0);
            const diasRestantes = Math.ceil((dataFim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
            return {
              id: p.id,
              parceiroNome: p.parceiro?.nome || "N/A",
              diasRestantes,
              dataFim: p.data_fim_prevista,
            };
          })
          .filter((p) => p.diasRestantes <= 7)
          .sort((a, b) => a.diasRestantes - b.diasRestantes);

        setParceriasEncerramento(alertasEncer);
      }

      // Parceiros sem parceria ativa - identificar parceiros que precisam ter parceria criada
      if (!todosParceirosResult.error && !todasParceriasResult.error) {
        const parceirosComParceria = new Set(
          (todasParceriasResult.data || []).map((p: any) => p.parceiro_id)
        );
        
        const semParceria: ParceiroSemParceria[] = (todosParceirosResult.data || [])
          .filter((p: any) => !parceirosComParceria.has(p.id))
          .map((p: any) => ({
            id: p.id,
            nome: p.nome,
            cpf: p.cpf,
            createdAt: p.created_at,
          }));
        
        setParceirosSemParceria(semParceria);
      }

      // Saques pendentes de confirmação - buscar nomes relacionados
      if (!saquesPendentesResult.error && saquesPendentesResult.data) {
        // Buscar dados adicionais para os saques
        const bookmakersIds = saquesPendentesResult.data
          .map((s: any) => s.origem_bookmaker_id)
          .filter(Boolean);
        const parceirosIds = saquesPendentesResult.data
          .map((s: any) => s.destino_parceiro_id)
          .filter(Boolean);
        const contasIds = saquesPendentesResult.data
          .map((s: any) => s.destino_conta_bancaria_id)
          .filter(Boolean);

        const [bookmakersNomes, parceirosNomes, contasNomes] = await Promise.all([
          bookmakersIds.length > 0
            ? supabase.from("bookmakers").select("id, nome").in("id", bookmakersIds)
            : Promise.resolve({ data: [] }),
          parceirosIds.length > 0
            ? supabase.from("parceiros").select("id, nome").in("id", parceirosIds)
            : Promise.resolve({ data: [] }),
          contasIds.length > 0
            ? supabase.from("contas_bancarias").select("id, banco, titular").in("id", contasIds)
            : Promise.resolve({ data: [] }),
        ]);

        const bookmakersMap = Object.fromEntries(
          (bookmakersNomes.data || []).map((b: any) => [b.id, b.nome])
        );
        const parceirosMap = Object.fromEntries(
          (parceirosNomes.data || []).map((p: any) => [p.id, p.nome])
        );
        const contasMap = Object.fromEntries(
          (contasNomes.data || []).map((c: any) => [c.id, `${c.banco} - ${c.titular}`])
        );

        const saquesEnriquecidos: SaquePendenteConfirmacao[] = saquesPendentesResult.data.map((s: any) => ({
          ...s,
          bookmaker_nome: bookmakersMap[s.origem_bookmaker_id] || "Bookmaker",
          parceiro_nome: parceirosMap[s.destino_parceiro_id] || "",
          banco_nome: contasMap[s.destino_conta_bancaria_id] || "Conta Bancária",
        }));

        setSaquesPendentes(saquesEnriquecidos);
      }
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

  const handleConfirmarSaque = (saque: SaquePendenteConfirmacao) => {
    setSelectedSaque(saque);
    setConfirmarSaqueOpen(true);
  };

  const alertasSaques = alertas.filter((a) => a.tipo_alerta === "SAQUE_PENDENTE");
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

        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saques Aguardando</CardTitle>
            <Clock className="h-4 w-4 text-yellow-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-400">{saquesPendentes.length}</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(
                saquesPendentes.reduce((acc, s) => acc + (s.valor || 0), 0)
              )}{" "}
              aguardando confirmação
            </p>
          </CardContent>
        </Card>

        <Card className="border-cyan-500/30 bg-cyan-500/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Captação Pendente</CardTitle>
            <Users className="h-4 w-4 text-cyan-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-cyan-400">{pagamentosParceiros.length + parceriasEncerramento.length + parceirosSemParceria.length}</div>
            <p className="text-xs text-muted-foreground">
              {parceirosSemParceria.length > 0 && `${parceirosSemParceria.length} sem parceria • `}
              {formatCurrency(pagamentosParceiros.reduce((acc, p) => acc + p.valorParceiro, 0))} pendentes
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Alertas List */}
      {alertas.length === 0 && entregasPendentes.length === 0 && pagamentosParceiros.length === 0 && parceriasEncerramento.length === 0 && parceirosSemParceria.length === 0 && saquesPendentes.length === 0 ? (
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
          {/* SEÇÃO: SAQUES PENDENTES DE CONFIRMAÇÃO */}
          {saquesPendentes.length > 0 && (
            <Card className="border-yellow-500/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-yellow-400" />
                  Saques Aguardando Confirmação
                </CardTitle>
                <CardDescription>
                  Verifique se o valor foi recebido no banco/wallet antes de confirmar
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {saquesPendentes.map((saque) => (
                    <div
                      key={saque.id}
                      className="flex items-center justify-between p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5 hover:bg-yellow-500/10 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-yellow-400" />
                        </div>
                        <div>
                          <p className="font-medium">{saque.bookmaker_nome}</p>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <ArrowRight className="h-3 w-3" />
                              {saque.banco_nome}
                            </span>
                            {saque.parceiro_nome && (
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {saque.parceiro_nome}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-lg font-bold text-yellow-400">
                          {formatCurrency(saque.valor, saque.moeda)}
                        </span>
                        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                          <Clock className="h-3 w-3 mr-1" />
                          Aguardando
                        </Badge>
                        <Button 
                          size="sm" 
                          onClick={() => handleConfirmarSaque(saque)}
                          className="bg-yellow-600 hover:bg-yellow-700"
                        >
                          Confirmar Saque
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* SEÇÃO: CAPTAÇÃO DE PARCERIAS */}
          {(pagamentosParceiros.length > 0 || parceriasEncerramento.length > 0 || parceirosSemParceria.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-cyan-400" />
                  Captação de Parcerias
                </CardTitle>
                <CardDescription>
                  Parceiros sem parceria, pagamentos pendentes e alertas de encerramento
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Parceiros sem Parceria Cadastrada */}
                {parceirosSemParceria.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-400" />
                      Parceiros sem Registro de Captação e Pagamento ({parceirosSemParceria.length})
                    </h4>
                    <div className="space-y-2">
                      {parceirosSemParceria.map((parceiro) => (
                        <div
                          key={parceiro.id}
                          className="flex items-center justify-between p-3 rounded-lg border border-orange-500/30 bg-orange-500/5 hover:bg-orange-500/10 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                              <User className="h-4 w-4 text-orange-400" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{parceiro.nome}</p>
                              <p className="text-xs text-muted-foreground">
                                Cadastrado em {new Date(parceiro.createdAt).toLocaleDateString("pt-BR")}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">
                              Sem parceria
                            </Badge>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => navigate("/programa-indicacao", { state: { tab: "parcerias" } })}
                            >
                              Criar Parceria
                              <ArrowRight className="ml-2 h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pagamentos Pendentes a Parceiros */}
                {pagamentosParceiros.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                      <Banknote className="h-4 w-4" />
                      Pagamentos Pendentes a Parceiros ({pagamentosParceiros.length})
                    </h4>
                    <div className="space-y-2">
                      {pagamentosParceiros.map((pag) => (
                        <div
                          key={pag.parceriaId}
                          className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                              <User className="h-4 w-4 text-cyan-400" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{pag.parceiroNome}</p>
                              <p className="text-xs text-muted-foreground">
                                {pag.origemTipo === "DIRETO" ? "Aquisição Direta" : "Via Indicador"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-bold text-cyan-400">
                              {formatCurrency(pag.valorParceiro)}
                            </span>
                            <Button size="sm" variant="outline" onClick={() => navigate("/programa-indicacao", { state: { tab: "financeiro" } })}>
                              Pagar
                              <ArrowRight className="ml-2 h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Alertas de Encerramento de Parcerias */}
                {parceriasEncerramento.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Parcerias Próximas do Encerramento ({parceriasEncerramento.length})
                    </h4>
                    <div className="space-y-2">
                      {parceriasEncerramento.map((parc) => {
                        // ≤5 dias = vermelho, ≤7 dias = amarelo
                        const isRed = parc.diasRestantes <= 5;
                        const isYellow = parc.diasRestantes > 5 && parc.diasRestantes <= 7;
                        
                        return (
                          <div
                            key={parc.id}
                            className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                              isRed
                                ? "border-red-500/30 bg-red-500/5"
                                : isYellow
                                ? "border-yellow-500/30 bg-yellow-500/5"
                                : "bg-card hover:bg-muted/50"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                                  isRed
                                    ? "bg-red-500/10"
                                    : isYellow
                                    ? "bg-yellow-500/10"
                                    : "bg-muted"
                                }`}
                              >
                                <Calendar
                                  className={`h-4 w-4 ${
                                    isRed
                                      ? "text-red-400"
                                      : isYellow
                                      ? "text-yellow-400"
                                      : "text-muted-foreground"
                                  }`}
                                />
                              </div>
                              <div>
                                <p className="font-medium text-sm">{parc.parceiroNome}</p>
                                <p className="text-xs text-muted-foreground">
                                  Vence em {new Date(parc.dataFim).toLocaleDateString("pt-BR")}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <Badge
                                className={
                                  isRed
                                    ? "bg-red-500/20 text-red-400 border-red-500/30"
                                    : isYellow
                                    ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                                    : "bg-muted text-muted-foreground"
                                }
                              >
                                {parc.diasRestantes <= 0
                                  ? "Vencida"
                                  : parc.diasRestantes === 1
                                  ? "1 dia restante"
                                  : `${parc.diasRestantes} dias restantes`}
                              </Badge>
                              <Button
                                size="sm"
                                variant={isRed ? "destructive" : "outline"}
                                onClick={() => navigate("/programa-indicacao")}
                              >
                                {isRed ? "Encerrar" : "Ver"}
                                <ArrowRight className="ml-2 h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

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
                        {alerta.status_anterior !== "limitada" && (
                          <Button size="sm" variant="outline" onClick={() => navigate("/projetos")}>
                            Realocar
                          </Button>
                        )}
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

      {/* Dialog de Confirmação de Saque */}
      <ConfirmarSaqueDialog
        open={confirmarSaqueOpen}
        onClose={() => {
          setConfirmarSaqueOpen(false);
          setSelectedSaque(null);
        }}
        onSuccess={() => fetchData(true)}
        saque={selectedSaque}
      />
    </div>
  );
}
