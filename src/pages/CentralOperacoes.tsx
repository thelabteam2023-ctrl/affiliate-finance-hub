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
  TrendingUp,
  Gift,
} from "lucide-react";
import { EntregaConciliacaoDialog } from "@/components/entregas/EntregaConciliacaoDialog";
import { ConfirmarSaqueDialog } from "@/components/caixa/ConfirmarSaqueDialog";
import { PagamentoOperadorDialog } from "@/components/operadores/PagamentoOperadorDialog";
import { PropostasPagamentoCard } from "@/components/operadores/PropostasPagamentoCard";

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
  operador_projeto_id: string;
  operador_id: string;
  projeto_id: string;
}

interface PagamentoParceiroPendente {
  parceriaId: string;
  parceiroNome: string;
  valorParceiro: number;
  origemTipo: string;
  diasRestantes: number;
}

interface BonusPendente {
  indicadorId: string;
  indicadorNome: string;
  valorBonus: number;
  qtdParceiros: number;
  meta: number;
  ciclosPendentes: number;
  totalBonusPendente: number;
}

interface ComissaoPendente {
  parceriaId: string;
  parceiroNome: string;
  indicadorId: string;
  indicadorNome: string;
  valorComissao: number;
}

interface PagamentoOperadorPendente {
  id: string;
  operador_id: string;
  operador_nome: string;
  tipo_pagamento: string;
  valor: number;
  data_pagamento: string;
  projeto_id?: string | null;
  projeto_nome?: string | null;
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

interface AlertaLucroParceiro {
  id: string;
  parceiro_id: string;
  parceiro_nome: string;
  marco_valor: number;
  lucro_atual: number;
  data_atingido: string;
}

export default function CentralOperacoes() {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [entregasPendentes, setEntregasPendentes] = useState<EntregaPendente[]>([]);
  const [pagamentosParceiros, setPagamentosParceiros] = useState<PagamentoParceiroPendente[]>([]);
  const [bonusPendentes, setBonusPendentes] = useState<BonusPendente[]>([]);
  const [comissoesPendentes, setComissoesPendentes] = useState<ComissaoPendente[]>([]);
  const [parceriasEncerramento, setParceriasEncerramento] = useState<ParceriaAlertaEncerramento[]>([]);
  const [parceirosSemParceria, setParceirosSemParceria] = useState<ParceiroSemParceria[]>([]);
  const [saquesPendentes, setSaquesPendentes] = useState<SaquePendenteConfirmacao[]>([]);
  const [alertasLucro, setAlertasLucro] = useState<AlertaLucroParceiro[]>([]);
  const [pagamentosOperadorPendentes, setPagamentosOperadorPendentes] = useState<PagamentoOperadorPendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [conciliacaoOpen, setConciliacaoOpen] = useState(false);
  const [selectedEntrega, setSelectedEntrega] = useState<EntregaPendente | null>(null);
  const [confirmarSaqueOpen, setConfirmarSaqueOpen] = useState(false);
  const [selectedSaque, setSelectedSaque] = useState<SaquePendenteConfirmacao | null>(null);
  const [pagamentoOperadorOpen, setPagamentoOperadorOpen] = useState(false);
  const [selectedPagamentoOperador, setSelectedPagamentoOperador] = useState<PagamentoOperadorPendente | null>(null);
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
        saquesPendentesResult,
        alertasLucroResult,
        custosResult,
        acordosResult,
        comissoesResult,
        indicacoesResult,
        indicadoresResult,
        pagamentosOperadorResult
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
          .select("parceria_id, tipo, status, indicador_id"),
        supabase
          .from("parcerias")
          .select(`
            id,
            data_fim_prevista,
            parceiro:parceiros(nome)
          `)
          .in("status", ["ATIVA", "EM_ENCERRAMENTO"])
          .not("data_fim_prevista", "is", null),
        supabase
          .from("parceiros")
          .select("id, nome, cpf, created_at")
          .eq("status", "ativo"),
        supabase
          .from("parcerias")
          .select("parceiro_id")
          .in("status", ["ATIVA", "EM_ENCERRAMENTO"]),
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
          .order("data_transacao", { ascending: false }),
        supabase
          .from("parceiro_lucro_alertas")
          .select(`
            id,
            parceiro_id,
            marco_valor,
            lucro_atual,
            data_atingido,
            parceiro:parceiros(nome)
          `)
          .eq("notificado", false)
          .order("data_atingido", { ascending: false }),
        // For bonus calculation
        supabase.from("v_custos_aquisicao").select("*"),
        supabase.from("indicador_acordos").select("*").eq("ativo", true),
        // For comissões pendentes - fetch parcerias separately
        supabase
          .from("parcerias")
          .select(`
            id,
            valor_comissao_indicador,
            comissao_paga,
            parceiro_id,
            parceiro:parceiros(nome)
          `)
          .eq("comissao_paga", false)
          .not("valor_comissao_indicador", "is", null)
          .gt("valor_comissao_indicador", 0),
        // Fetch indicacoes for mapping parceiro -> indicador
        supabase
          .from("indicacoes")
          .select("parceiro_id, indicador_id"),
        // Fetch indicadores for names
        supabase
          .from("indicadores_referral")
          .select("id, nome"),
        // Pagamentos de operador pendentes
        supabase
          .from("pagamentos_operador")
          .select(`
            id,
            operador_id,
            tipo_pagamento,
            valor,
            data_pagamento,
            projeto_id,
            operador:operadores(nome),
            projeto:projetos(nome)
          `)
          .eq("status", "PENDENTE")
          .order("data_pagamento", { ascending: false })
      ]);

      if (alertasResult.error) throw alertasResult.error;
      setAlertas(alertasResult.data || []);

      if (entregasResult.error) throw entregasResult.error;
      setEntregasPendentes(entregasResult.data || []);

      // Alertas de lucro
      if (!alertasLucroResult.error && alertasLucroResult.data) {
        setAlertasLucro(
          alertasLucroResult.data.map((a: any) => ({
            id: a.id,
            parceiro_id: a.parceiro_id,
            parceiro_nome: a.parceiro?.nome || "Parceiro",
            marco_valor: a.marco_valor,
            lucro_atual: a.lucro_atual,
            data_atingido: a.data_atingido,
          }))
        );
      }

      if (entregasResult.error) throw entregasResult.error;
      setEntregasPendentes(entregasResult.data || []);

      // Pagamentos pendentes a parceiros - excluir os já pagos
      if (!parceirosResult.error && !movimentacoesResult.error) {
        const parceriasPagas = (movimentacoesResult.data || [])
          .filter((m: any) => m.tipo === "PAGTO_PARCEIRO" && m.status === "CONFIRMADO")
          .map((m: any) => m.parceria_id);
        
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

      // Calculate bonus pendentes (with multiple cycles support)
      if (custosResult.data && acordosResult.data && movimentacoesResult.data) {
        const indicadorStats: Record<string, { nome: string; qtd: number }> = {};
        
        custosResult.data.forEach((c: any) => {
          if (c.indicador_id && c.indicador_nome) {
            if (!indicadorStats[c.indicador_id]) {
              indicadorStats[c.indicador_id] = { nome: c.indicador_nome, qtd: 0 };
            }
            indicadorStats[c.indicador_id].qtd += 1;
          }
        });

        // Count paid bonuses per indicator
        const bonusPagosPorIndicador: Record<string, number> = {};
        (movimentacoesResult.data || [])
          .filter((m: any) => m.tipo === "BONUS_INDICADOR" && m.status === "CONFIRMADO")
          .forEach((m: any) => {
            if (m.indicador_id) {
              bonusPagosPorIndicador[m.indicador_id] = (bonusPagosPorIndicador[m.indicador_id] || 0) + 1;
            }
          });

        const pendentes: BonusPendente[] = [];
        acordosResult.data.forEach((acordo: any) => {
          const stats = indicadorStats[acordo.indicador_id];
          if (stats && acordo.meta_parceiros && acordo.meta_parceiros > 0) {
            const ciclosCompletos = Math.floor(stats.qtd / acordo.meta_parceiros);
            const bonusJaPagos = bonusPagosPorIndicador[acordo.indicador_id] || 0;
            const ciclosPendentes = ciclosCompletos - bonusJaPagos;
            
            if (ciclosPendentes > 0) {
              const valorBonusUnitario = acordo.valor_bonus || 0;
              pendentes.push({
                indicadorId: acordo.indicador_id,
                indicadorNome: stats.nome,
                valorBonus: valorBonusUnitario,
                qtdParceiros: stats.qtd,
                meta: acordo.meta_parceiros,
                ciclosPendentes: ciclosPendentes,
                totalBonusPendente: valorBonusUnitario * ciclosPendentes,
              });
            }
          }
        });
        setBonusPendentes(pendentes);
      }

      // Calculate comissões pendentes - build mapping from indicacoes table
      if (comissoesResult.data && indicacoesResult.data && indicadoresResult.data) {
        // Build indicadores map
        const indicadoresMap: Record<string, { id: string; nome: string }> = {};
        indicadoresResult.data.forEach((ind: any) => {
          if (ind.id) {
            indicadoresMap[ind.id] = { id: ind.id, nome: ind.nome };
          }
        });

        // Build parceiro -> indicador map from indicacoes table
        const parceiroIndicadorMap: Record<string, { id: string; nome: string }> = {};
        indicacoesResult.data.forEach((ind: any) => {
          if (ind.parceiro_id && ind.indicador_id && indicadoresMap[ind.indicador_id]) {
            parceiroIndicadorMap[ind.parceiro_id] = indicadoresMap[ind.indicador_id];
          }
        });

        // Map comissões using the parceiro -> indicador relationship
        const comissoes: ComissaoPendente[] = comissoesResult.data
          .filter((p: any) => p.parceiro_id && parceiroIndicadorMap[p.parceiro_id])
          .map((p: any) => {
            const indicador = parceiroIndicadorMap[p.parceiro_id];
            return {
              parceriaId: p.id,
              parceiroNome: p.parceiro?.nome || "N/A",
              indicadorId: indicador.id,
              indicadorNome: indicador.nome,
              valorComissao: p.valor_comissao_indicador || 0,
            };
          });
        setComissoesPendentes(comissoes);
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

      // Pagamentos de operador pendentes
      if (!pagamentosOperadorResult.error && pagamentosOperadorResult.data) {
        const pagamentosOp: PagamentoOperadorPendente[] = pagamentosOperadorResult.data.map((p: any) => ({
          id: p.id,
          operador_id: p.operador_id,
          operador_nome: p.operador?.nome || "N/A",
          tipo_pagamento: p.tipo_pagamento,
          valor: p.valor,
          data_pagamento: p.data_pagamento,
          projeto_id: p.projeto_id || null,
          projeto_nome: p.projeto?.nome || null,
        }));
        setPagamentosOperadorPendentes(pagamentosOp);
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
            <div className="text-2xl font-bold text-cyan-400">
              {pagamentosParceiros.length + bonusPendentes.reduce((acc, b) => acc + b.ciclosPendentes, 0) + comissoesPendentes.length + parceriasEncerramento.length + parceirosSemParceria.length}
            </div>
            <p className="text-xs text-muted-foreground">
              {parceirosSemParceria.length > 0 && `${parceirosSemParceria.length} sem parceria • `}
              {formatCurrency(
                pagamentosParceiros.reduce((acc, p) => acc + p.valorParceiro, 0) +
                bonusPendentes.reduce((acc, b) => acc + b.totalBonusPendente, 0) +
                comissoesPendentes.reduce((acc, c) => acc + c.valorComissao, 0)
              )} pendentes
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Propostas de Pagamento Pendentes */}
      <PropostasPagamentoCard />

      {/* Alertas List */}
      {alertas.length === 0 && entregasPendentes.length === 0 && pagamentosParceiros.length === 0 && bonusPendentes.length === 0 && comissoesPendentes.length === 0 && parceriasEncerramento.length === 0 && parceirosSemParceria.length === 0 && saquesPendentes.length === 0 && alertasLucro.length === 0 && pagamentosOperadorPendentes.length === 0 ? (
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
        <div className="space-y-6">
          {/* Alertas de Marco de Lucro */}
          {alertasLucro.length > 0 && (
            <Card className="border-amber-500/30 max-w-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <TrendingUp className="h-4 w-4 text-amber-400" />
                  Marcos de Lucro Atingidos
                </CardTitle>
                <CardDescription className="text-xs">
                  Atenção: lucros altos podem gerar riscos fiscais
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-1.5">
                  {alertasLucro.map((alerta) => {
                    // Gradiente de cores baseado no lucro atual
                    const lucro = alerta.lucro_atual;
                    let colorClasses = {
                      border: "border-emerald-500/30",
                      bg: "bg-emerald-500/10 hover:bg-emerald-500/15",
                      iconBg: "bg-emerald-500/20",
                      iconText: "text-emerald-400",
                      valueText: "text-emerald-400",
                    };
                    
                    if (lucro >= 30000) {
                      // CRÍTICO - estourou a cota
                      colorClasses = {
                        border: "border-rose-600/50",
                        bg: "bg-rose-600/20 hover:bg-rose-600/25",
                        iconBg: "bg-rose-600/30",
                        iconText: "text-rose-400",
                        valueText: "text-rose-400",
                      };
                    } else if (lucro >= 27000) {
                      // MUITO ALTO - próximo de estourar
                      colorClasses = {
                        border: "border-red-500/40",
                        bg: "bg-red-500/15 hover:bg-red-500/20",
                        iconBg: "bg-red-500/25",
                        iconText: "text-red-400",
                        valueText: "text-red-400",
                      };
                    } else if (lucro >= 23000) {
                      // ALTO - atenção redobrada
                      colorClasses = {
                        border: "border-orange-500/40",
                        bg: "bg-orange-500/10 hover:bg-orange-500/15",
                        iconBg: "bg-orange-500/20",
                        iconText: "text-orange-400",
                        valueText: "text-orange-400",
                      };
                    } else if (lucro >= 20000) {
                      // MÉDIO - atenção
                      colorClasses = {
                        border: "border-yellow-500/30",
                        bg: "bg-yellow-500/10 hover:bg-yellow-500/15",
                        iconBg: "bg-yellow-500/20",
                        iconText: "text-yellow-400",
                        valueText: "text-yellow-400",
                      };
                    }
                    // else: lucro < 20000 = verde (padrão definido acima)
                    
                    return (
                      <div
                        key={alerta.id}
                        className={`flex items-center justify-between p-2.5 rounded-lg border ${colorClasses.border} ${colorClasses.bg} transition-colors`}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className={`h-7 w-7 rounded-md ${colorClasses.iconBg} flex items-center justify-center shrink-0`}>
                            <TrendingUp className={`h-3.5 w-3.5 ${colorClasses.iconText}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-xs truncate">{alerta.parceiro_nome}</p>
                            <p className="text-[10px] text-muted-foreground">
                              Lucro: {formatCurrency(alerta.lucro_atual)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`text-xs font-bold ${colorClasses.valueText}`}>
                            R$ {alerta.marco_valor.toLocaleString("pt-BR")}
                          </span>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => navigate("/gestao-parceiros")}
                            className="h-6 text-[10px] px-2"
                          >
                            Ver
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={async () => {
                              try {
                                await supabase
                                  .from("parceiro_lucro_alertas")
                                  .update({ notificado: true })
                                  .eq("id", alerta.id);
                                setAlertasLucro(prev => prev.filter(a => a.id !== alerta.id));
                                toast.success("Marco verificado");
                              } catch (error) {
                                toast.error("Erro ao confirmar");
                              }
                            }}
                            className="h-6 text-[10px] px-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            OK
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* GRID: Saques Agrupados (Aguardando Confirmação + Pendentes de Processamento) */}
          {(saquesPendentes.length > 0 || alertasSaques.length > 0) && (
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Saques Aguardando Confirmação */}
              {saquesPendentes.length > 0 && (
                <Card className="border-yellow-500/30">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Clock className="h-5 w-5 text-yellow-400" />
                      Saques Aguardando Confirmação
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Verifique se o valor foi recebido antes de confirmar
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {saquesPendentes.map((saque) => (
                        <div
                          key={saque.id}
                          className="flex items-center justify-between p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 hover:bg-yellow-500/10 transition-colors"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="h-8 w-8 rounded-lg bg-yellow-500/10 flex items-center justify-center shrink-0">
                              <Building2 className="h-4 w-4 text-yellow-400" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{saque.bookmaker_nome}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                → {saque.banco_nome}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-sm font-bold text-yellow-400">
                              {formatCurrency(saque.valor, saque.moeda)}
                            </span>
                            <Button 
                              size="sm" 
                              onClick={() => handleConfirmarSaque(saque)}
                              className="bg-yellow-600 hover:bg-yellow-700 h-7 text-xs"
                            >
                              Atualizar Status
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Saques Pendentes de Processamento */}
              {alertasSaques.length > 0 && (
                <Card className="border-emerald-500/30">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <DollarSign className="h-5 w-5 text-emerald-400" />
                      Saques Pendentes de Processamento
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Bookmakers liberados com saldo a resgatar
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {alertasSaques.map((alerta) => (
                        <div
                          key={alerta.entidade_id}
                          className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                              <Building2 className="h-4 w-4 text-emerald-400" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{alerta.titulo}</p>
                              {alerta.parceiro_nome && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {alerta.parceiro_nome}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {alerta.valor && (
                              <span className="text-sm font-bold text-emerald-400">
                                {formatCurrency(alerta.valor, alerta.moeda)}
                              </span>
                            )}
                            <Button 
                              size="sm" 
                              onClick={() => handleSaqueAction(alerta)}
                              className="h-7 text-xs"
                            >
                              Processar
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Placeholder para manter grid 2 colunas quando só tem 1 */}
              {saquesPendentes.length > 0 && alertasSaques.length === 0 && (
                <div className="hidden lg:block" />
              )}
              {alertasSaques.length > 0 && saquesPendentes.length === 0 && (
                <div className="hidden lg:block" />
              )}
            </div>
          )}

          {/* GRID: Entregas + Captação de Parcerias + Pagamentos Operador */}
          {(entregasPendentes.length > 0 || pagamentosParceiros.length > 0 || bonusPendentes.length > 0 || comissoesPendentes.length > 0 || parceriasEncerramento.length > 0 || parceirosSemParceria.length > 0 || pagamentosOperadorPendentes.length > 0) && (
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Pagamentos de Operador Pendentes */}
              {pagamentosOperadorPendentes.length > 0 && (
                <Card className="border-orange-500/30">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Users className="h-5 w-5 text-orange-400" />
                      Pagamentos de Operador Pendentes
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Pagamentos registrados aguardando confirmação
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {pagamentosOperadorPendentes.slice(0, 5).map((pag) => (
                        <div
                          key={pag.id}
                          className="flex items-center justify-between p-3 rounded-lg border border-orange-500/20 bg-orange-500/5 hover:bg-orange-500/10 transition-colors cursor-pointer"
                          onClick={() => {
                            setSelectedPagamentoOperador(pag);
                            setPagamentoOperadorOpen(true);
                          }}
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="h-8 w-8 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                              <DollarSign className="h-4 w-4 text-orange-400" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{pag.operador_nome}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {pag.tipo_pagamento} {pag.projeto_nome ? `• ${pag.projeto_nome}` : ""}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-sm font-bold text-orange-400">
                              {formatCurrency(pag.valor)}
                            </span>
                            <Button
                              size="sm"
                              className="bg-orange-600 hover:bg-orange-700 h-7 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPagamentoOperador(pag);
                                setPagamentoOperadorOpen(true);
                              }}
                            >
                              Pagar
                            </Button>
                          </div>
                        </div>
                      ))}
                      {pagamentosOperadorPendentes.length > 5 && (
                        <p className="text-xs text-muted-foreground text-center py-1">
                          +{pagamentosOperadorPendentes.length - 5} pagamentos pendentes
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Entregas Pendentes de Conciliação */}
              {entregasPendentes.length > 0 && (
                <Card className="border-purple-500/30">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Package className="h-5 w-5 text-purple-400" />
                      Entregas Pendentes
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Entregas que atingiram a meta ou período encerrado
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {entregasPendentes.map((entrega) => (
                        <div
                          key={entrega.id}
                          className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                            entrega.nivel_urgencia === "CRITICA"
                              ? "border-red-500/30 bg-red-500/5"
                              : "bg-card hover:bg-muted/50"
                          }`}
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div
                              className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                                entrega.nivel_urgencia === "CRITICA"
                                  ? "bg-red-500/10"
                                  : "bg-purple-500/10"
                              }`}
                            >
                              <Target
                                className={`h-4 w-4 ${
                                  entrega.nivel_urgencia === "CRITICA"
                                    ? "text-red-400"
                                    : "text-purple-400"
                                }`}
                              />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">
                                {entrega.operador_nome} - #{entrega.numero_entrega}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {entrega.projeto_nome}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-sm font-bold text-emerald-400">
                              {formatCurrency(entrega.resultado_nominal)}
                            </span>
                            <Button size="sm" onClick={() => handleConciliarEntrega(entrega)} className="h-7 text-xs">
                              Conciliar
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Captação de Parcerias */}
              {(pagamentosParceiros.length > 0 || bonusPendentes.length > 0 || comissoesPendentes.length > 0 || parceriasEncerramento.length > 0 || parceirosSemParceria.length > 0) && (
                <Card className="border-cyan-500/30">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Users className="h-5 w-5 text-cyan-400" />
                      Captação de Parcerias
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Parceiros, pagamentos, bônus e comissões pendentes
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Parceiros sem Parceria */}
                    {parceirosSemParceria.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3 text-orange-400" />
                          Sem Parceria ({parceirosSemParceria.length})
                        </h4>
                        <div className="space-y-1">
                          {parceirosSemParceria.slice(0, 3).map((parceiro) => (
                            <div
                              key={parceiro.id}
                              className="flex items-center justify-between p-2 rounded-lg border border-orange-500/30 bg-orange-500/5"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <User className="h-3 w-3 text-orange-400 shrink-0" />
                                <span className="text-xs font-medium truncate">{parceiro.nome}</span>
                              </div>
                              <Button 
                                size="sm" 
                                variant="ghost"
                                className="h-6 text-xs px-2"
                                onClick={() => navigate("/programa-indicacao", { state: { tab: "parcerias" } })}
                              >
                                Criar
                              </Button>
                            </div>
                          ))}
                          {parceirosSemParceria.length > 3 && (
                            <p className="text-xs text-muted-foreground text-center py-1">
                              +{parceirosSemParceria.length - 3} parceiros
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Pagamentos ao Parceiro */}
                    {pagamentosParceiros.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                          <User className="h-3 w-3 text-emerald-400" />
                          Pagamentos ao Parceiro ({pagamentosParceiros.length})
                        </h4>
                        <div className="space-y-1">
                          {pagamentosParceiros.slice(0, 3).map((pag) => (
                            <div
                              key={pag.parceriaId}
                              className="flex items-center justify-between p-2 rounded-lg border bg-card"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <User className="h-3 w-3 text-emerald-400 shrink-0" />
                                <span className="text-xs font-medium truncate">{pag.parceiroNome}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-emerald-400">
                                  {formatCurrency(pag.valorParceiro)}
                                </span>
                                <Button 
                                  size="sm" 
                                  variant="ghost"
                                  className="h-6 text-xs px-2"
                                  onClick={() => navigate("/programa-indicacao", { state: { tab: "financeiro" } })}
                                >
                                  Pagar
                                </Button>
                              </div>
                            </div>
                          ))}
                          {pagamentosParceiros.length > 3 && (
                            <p className="text-xs text-muted-foreground text-center py-1">
                              +{pagamentosParceiros.length - 3} pagamentos
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Bônus por Meta Atingida */}
                    {bonusPendentes.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                          <Gift className="h-3 w-3 text-primary" />
                          Bônus por Meta ({bonusPendentes.reduce((acc, b) => acc + b.ciclosPendentes, 0)})
                        </h4>
                        <div className="space-y-1">
                          {bonusPendentes.slice(0, 3).map((bonus) => (
                            <div
                              key={bonus.indicadorId}
                              className="flex items-center justify-between p-2 rounded-lg border border-primary/30 bg-primary/5"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Gift className="h-3 w-3 text-primary shrink-0" />
                                <div className="min-w-0">
                                  <span className="text-xs font-medium truncate block">{bonus.indicadorNome}</span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {bonus.qtdParceiros}/{bonus.meta} parceiros
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-primary">
                                  {bonus.ciclosPendentes > 1 
                                    ? `${bonus.ciclosPendentes}x ${formatCurrency(bonus.valorBonus)}`
                                    : formatCurrency(bonus.valorBonus)
                                  }
                                </span>
                                <Button 
                                  size="sm" 
                                  variant="ghost"
                                  className="h-6 text-xs px-2"
                                  onClick={() => navigate("/programa-indicacao", { state: { tab: "financeiro" } })}
                                >
                                  Pagar
                                </Button>
                              </div>
                            </div>
                          ))}
                          {bonusPendentes.length > 3 && (
                            <p className="text-xs text-muted-foreground text-center py-1">
                              +{bonusPendentes.length - 3} indicadores
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Comissões por Indicação */}
                    {comissoesPendentes.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                          <Banknote className="h-3 w-3 text-chart-2" />
                          Comissões ({comissoesPendentes.length})
                        </h4>
                        <div className="space-y-1">
                          {comissoesPendentes.slice(0, 3).map((comissao) => (
                            <div
                              key={comissao.parceriaId}
                              className="flex items-center justify-between p-2 rounded-lg border bg-card"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Banknote className="h-3 w-3 text-chart-2 shrink-0" />
                                <div className="min-w-0">
                                  <span className="text-xs font-medium truncate block">{comissao.indicadorNome}</span>
                                  <span className="text-[10px] text-muted-foreground">
                                    → {comissao.parceiroNome}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-chart-2">
                                  {formatCurrency(comissao.valorComissao)}
                                </span>
                                <Button 
                                  size="sm" 
                                  variant="ghost"
                                  className="h-6 text-xs px-2"
                                  onClick={() => navigate("/programa-indicacao", { state: { tab: "financeiro" } })}
                                >
                                  Pagar
                                </Button>
                              </div>
                            </div>
                          ))}
                          {comissoesPendentes.length > 3 && (
                            <p className="text-xs text-muted-foreground text-center py-1">
                              +{comissoesPendentes.length - 3} comissões
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Parcerias Encerrando */}
                    {parceriasEncerramento.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Encerrando ({parceriasEncerramento.length})
                        </h4>
                        <div className="space-y-1">
                          {parceriasEncerramento.slice(0, 3).map((parc) => {
                            const isRed = parc.diasRestantes <= 5;
                            return (
                              <div
                                key={parc.id}
                                className={`flex items-center justify-between p-2 rounded-lg border ${
                                  isRed ? "border-red-500/30 bg-red-500/5" : "border-yellow-500/30 bg-yellow-500/5"
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <Calendar className={`h-3 w-3 shrink-0 ${isRed ? "text-red-400" : "text-yellow-400"}`} />
                                  <span className="text-xs font-medium truncate">{parc.parceiroNome}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge className={`text-[10px] h-5 ${
                                    isRed ? "bg-red-500/20 text-red-400" : "bg-yellow-500/20 text-yellow-400"
                                  }`}>
                                    {parc.diasRestantes}d
                                  </Badge>
                                  <Button 
                                    size="sm" 
                                    variant={isRed ? "destructive" : "ghost"}
                                    className="h-6 text-xs px-2"
                                    onClick={() => navigate("/programa-indicacao")}
                                  >
                                    {isRed ? "Encerrar" : "Ver"}
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                          {parceriasEncerramento.length > 3 && (
                            <p className="text-xs text-muted-foreground text-center py-1">
                              +{parceriasEncerramento.length - 3} parcerias
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Placeholders para manter grid equilibrado */}
              {entregasPendentes.length > 0 && pagamentosParceiros.length === 0 && bonusPendentes.length === 0 && comissoesPendentes.length === 0 && parceriasEncerramento.length === 0 && parceirosSemParceria.length === 0 && (
                <div className="hidden lg:block" />
              )}
              {entregasPendentes.length === 0 && (pagamentosParceiros.length > 0 || bonusPendentes.length > 0 || comissoesPendentes.length > 0 || parceriasEncerramento.length > 0 || parceirosSemParceria.length > 0) && (
                <div className="hidden lg:block" />
              )}
            </div>
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
            operador_projeto_id: selectedEntrega.operador_projeto_id,
          }}
          operadorNome={selectedEntrega.operador_nome}
          operadorId={selectedEntrega.operador_id}
          projetoId={selectedEntrega.projeto_id}
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

      {/* Dialog de Pagamento de Operador */}
      <PagamentoOperadorDialog
        open={pagamentoOperadorOpen}
        onOpenChange={(open) => {
          setPagamentoOperadorOpen(open);
          if (!open) setSelectedPagamentoOperador(null);
        }}
        pagamento={selectedPagamentoOperador ? {
          id: selectedPagamentoOperador.id,
          operador_id: selectedPagamentoOperador.operador_id,
          projeto_id: selectedPagamentoOperador.projeto_id || null,
          tipo_pagamento: selectedPagamentoOperador.tipo_pagamento,
          valor: selectedPagamentoOperador.valor,
          moeda: "BRL",
          data_pagamento: selectedPagamentoOperador.data_pagamento,
          data_competencia: null,
          descricao: null,
          status: "PENDENTE", // Sempre PENDENTE pois só mostramos pendentes nesta lista
        } : undefined}
        onSuccess={() => fetchData(true)}
      />
    </div>
  );
}
