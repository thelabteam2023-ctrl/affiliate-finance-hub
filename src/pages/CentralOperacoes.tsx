import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
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
  RefreshCw,
  Loader2,
  FolderKanban,
  Package,
  Target,
  Users,
  Banknote,
  CheckCircle2,
  TrendingUp,
  Gift,
  Zap,
  UserPlus,
} from "lucide-react";
import { EntregaConciliacaoDialog } from "@/components/entregas/EntregaConciliacaoDialog";
import { ConfirmarSaqueDialog } from "@/components/caixa/ConfirmarSaqueDialog";
import { PagamentoOperadorDialog } from "@/components/operadores/PagamentoOperadorDialog";
import { PropostasPagamentoCard } from "@/components/operadores/PropostasPagamentoCard";
import { PagamentoParticipacaoDialog } from "@/components/projetos/PagamentoParticipacaoDialog";
import { useCicloAlertas } from "@/hooks/useCicloAlertas";

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

interface ParticipacaoPendente {
  id: string;
  projeto_id: string;
  ciclo_id: string;
  investidor_id: string;
  percentual_aplicado: number;
  base_calculo: string;
  lucro_base: number;
  valor_participacao: number;
  data_apuracao: string;
  investidor_nome?: string;
  projeto_nome?: string;
  ciclo_numero?: number;
}

// Enum for card priority
const PRIORITY = {
  CRITICAL: 1,
  HIGH: 2,
  MEDIUM: 3,
  LOW: 4,
} as const;

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
  const [participacoesPendentes, setParticipacoesPendentes] = useState<ParticipacaoPendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [conciliacaoOpen, setConciliacaoOpen] = useState(false);
  const [selectedEntrega, setSelectedEntrega] = useState<EntregaPendente | null>(null);
  const [confirmarSaqueOpen, setConfirmarSaqueOpen] = useState(false);
  const [selectedSaque, setSelectedSaque] = useState<SaquePendenteConfirmacao | null>(null);
  const [pagamentoOperadorOpen, setPagamentoOperadorOpen] = useState(false);
  const [selectedPagamentoOperador, setSelectedPagamentoOperador] = useState<PagamentoOperadorPendente | null>(null);
  const [pagamentoParticipacaoOpen, setPagamentoParticipacaoOpen] = useState(false);
  const [selectedParticipacao, setSelectedParticipacao] = useState<ParticipacaoPendente | null>(null);
  const navigate = useNavigate();

  const { alertas: alertasCiclos, refetch: refetchCiclos } = useCicloAlertas();

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
          .select(`id, valor_parceiro, origem_tipo, data_fim_prevista, custo_aquisicao_isento, parceiro:parceiros(nome)`)
          .in("status", ["ATIVA", "EM_ENCERRAMENTO"])
          .or("custo_aquisicao_isento.is.null,custo_aquisicao_isento.eq.false")
          .gt("valor_parceiro", 0),
        supabase.from("movimentacoes_indicacao").select("parceria_id, tipo, status, indicador_id"),
        supabase
          .from("parcerias")
          .select(`id, data_fim_prevista, parceiro:parceiros(nome)`)
          .in("status", ["ATIVA", "EM_ENCERRAMENTO"])
          .not("data_fim_prevista", "is", null),
        supabase.from("parceiros").select("id, nome, cpf, created_at").eq("status", "ativo"),
        supabase.from("parcerias").select("parceiro_id").in("status", ["ATIVA", "EM_ENCERRAMENTO"]),
        supabase
          .from("cash_ledger")
          .select(`id, valor, moeda, data_transacao, descricao, origem_bookmaker_id, destino_parceiro_id, destino_conta_bancaria_id`)
          .eq("tipo_transacao", "SAQUE")
          .eq("status", "PENDENTE")
          .order("data_transacao", { ascending: false }),
        supabase
          .from("parceiro_lucro_alertas")
          .select(`id, parceiro_id, marco_valor, lucro_atual, data_atingido, parceiro:parceiros(nome)`)
          .eq("notificado", false)
          .order("data_atingido", { ascending: false }),
        supabase.from("v_custos_aquisicao").select("*"),
        supabase.from("indicador_acordos").select("*").eq("ativo", true),
        supabase
          .from("parcerias")
          .select(`id, valor_comissao_indicador, comissao_paga, parceiro_id, parceiro:parceiros(nome)`)
          .eq("comissao_paga", false)
          .not("valor_comissao_indicador", "is", null)
          .gt("valor_comissao_indicador", 0),
        supabase.from("indicacoes").select("parceiro_id, indicador_id"),
        supabase.from("indicadores_referral").select("id, nome"),
        supabase
          .from("pagamentos_operador")
          .select(`id, operador_id, tipo_pagamento, valor, data_pagamento, projeto_id, operador:operadores(nome), projeto:projetos(nome)`)
          .eq("status", "PENDENTE")
          .order("data_pagamento", { ascending: false }),
      ]);

      if (alertasResult.error) throw alertasResult.error;
      setAlertas(alertasResult.data || []);

      if (entregasResult.error) throw entregasResult.error;
      setEntregasPendentes(entregasResult.data || []);

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

      if (comissoesResult.data && indicacoesResult.data && indicadoresResult.data) {
        const indicadoresMap: Record<string, { id: string; nome: string }> = {};
        indicadoresResult.data.forEach((ind: any) => {
          if (ind.id) {
            indicadoresMap[ind.id] = { id: ind.id, nome: ind.nome };
          }
        });

        const parceiroIndicadorMap: Record<string, { id: string; nome: string }> = {};
        indicacoesResult.data.forEach((ind: any) => {
          if (ind.parceiro_id && ind.indicador_id && indicadoresMap[ind.indicador_id]) {
            parceiroIndicadorMap[ind.parceiro_id] = indicadoresMap[ind.indicador_id];
          }
        });

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

      if (!saquesPendentesResult.error && saquesPendentesResult.data) {
        const bookmakersIds = saquesPendentesResult.data.map((s: any) => s.origem_bookmaker_id).filter(Boolean);
        const parceirosIds = saquesPendentesResult.data.map((s: any) => s.destino_parceiro_id).filter(Boolean);
        const contasIds = saquesPendentesResult.data.map((s: any) => s.destino_conta_bancaria_id).filter(Boolean);

        const [bookmakersNomes, parceirosNomes, contasNomes] = await Promise.all([
          bookmakersIds.length > 0 ? supabase.from("bookmakers").select("id, nome").in("id", bookmakersIds) : Promise.resolve({ data: [] }),
          parceirosIds.length > 0 ? supabase.from("parceiros").select("id, nome").in("id", parceirosIds) : Promise.resolve({ data: [] }),
          contasIds.length > 0 ? supabase.from("contas_bancarias").select("id, banco, titular").in("id", contasIds) : Promise.resolve({ data: [] }),
        ]);

        const bookmakersMap = Object.fromEntries((bookmakersNomes.data || []).map((b: any) => [b.id, b.nome]));
        const parceirosMap = Object.fromEntries((parceirosNomes.data || []).map((p: any) => [p.id, p.nome]));
        const contasMap = Object.fromEntries((contasNomes.data || []).map((c: any) => [c.id, `${c.banco} - ${c.titular}`]));

        const saquesEnriquecidos: SaquePendenteConfirmacao[] = saquesPendentesResult.data.map((s: any) => ({
          ...s,
          bookmaker_nome: bookmakersMap[s.origem_bookmaker_id] || "Bookmaker",
          parceiro_nome: parceirosMap[s.destino_parceiro_id] || "",
          banco_nome: contasMap[s.destino_conta_bancaria_id] || "Conta Bancária",
        }));

        setSaquesPendentes(saquesEnriquecidos);
      }

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

      const participacoesResult = await supabase
        .from("participacao_ciclos")
        .select(`id, projeto_id, ciclo_id, investidor_id, percentual_aplicado, base_calculo, lucro_base, valor_participacao, data_apuracao, investidor:investidores(nome), projeto:projetos(nome), ciclo:projeto_ciclos(numero_ciclo)`)
        .eq("status", "A_PAGAR");

      if (!participacoesResult.error && participacoesResult.data) {
        const participacoes: ParticipacaoPendente[] = participacoesResult.data.map((p: any) => ({
          id: p.id,
          projeto_id: p.projeto_id,
          ciclo_id: p.ciclo_id,
          investidor_id: p.investidor_id,
          percentual_aplicado: p.percentual_aplicado,
          base_calculo: p.base_calculo,
          lucro_base: p.lucro_base,
          valor_participacao: p.valor_participacao,
          data_apuracao: p.data_apuracao,
          investidor_nome: p.investidor?.nome || "N/A",
          projeto_nome: p.projeto?.nome || "N/A",
          ciclo_numero: p.ciclo?.numero_ciclo || 0,
        }));
        setParticipacoesPendentes(participacoes);
      }

    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const formatCurrency = (value: number, moeda: string = "BRL") => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda }).format(value);
  };

  const handleSaqueAction = (alerta: Alerta) => {
    navigate("/caixa", { state: { openDialog: true } });
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

  // Build alert cards with priority
  const alertCards = useMemo(() => {
    const cards: Array<{ id: string; priority: number; component: JSX.Element }> = [];

    // 1. Alertas Críticos (highest priority)
    if (alertasCriticos.length > 0) {
      cards.push({
        id: "alertas-criticos",
        priority: PRIORITY.CRITICAL,
        component: (
          <Card key="alertas-criticos" className="border-red-500/40 bg-red-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                Alertas Críticos
                <Badge className="ml-auto bg-red-500/20 text-red-400">{alertasCriticos.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {alertasCriticos.slice(0, 5).map((alerta) => (
                  <div key={alerta.entidade_id} className="flex items-center justify-between p-2 rounded-lg border border-red-500/30 bg-red-500/10">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                      <span className="text-xs font-medium truncate">{alerta.titulo}</span>
                    </div>
                    <Button size="sm" variant="destructive" className="h-6 text-xs px-2 shrink-0">
                      Resolver
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ),
      });
    }

    // 2. Propostas de Pagamento (always show the component, it handles its own visibility)
    cards.push({
      id: "propostas-pagamento",
      priority: PRIORITY.HIGH,
      component: <PropostasPagamentoCard key="propostas-pagamento" />,
    });

    // 3. Saques Aguardando Confirmação
    if (saquesPendentes.length > 0) {
      cards.push({
        id: "saques-aguardando",
        priority: PRIORITY.HIGH,
        component: (
          <Card key="saques-aguardando" className="border-yellow-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-yellow-400" />
                Saques Aguardando Confirmação
                <Badge className="ml-auto bg-yellow-500/20 text-yellow-400">{saquesPendentes.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {saquesPendentes.slice(0, 4).map((saque) => (
                  <div key={saque.id} className="flex items-center justify-between p-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Building2 className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{saque.bookmaker_nome}</p>
                        <p className="text-[10px] text-muted-foreground truncate">→ {saque.banco_nome}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-yellow-400">{formatCurrency(saque.valor, saque.moeda)}</span>
                      <Button size="sm" onClick={() => handleConfirmarSaque(saque)} className="bg-yellow-600 hover:bg-yellow-700 h-6 text-xs px-2">
                        Confirmar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ),
      });
    }

    // 4. Saques Pendentes de Processamento
    if (alertasSaques.length > 0) {
      cards.push({
        id: "saques-processamento",
        priority: PRIORITY.HIGH,
        component: (
          <Card key="saques-processamento" className="border-emerald-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <DollarSign className="h-4 w-4 text-emerald-400" />
                Saques Pendentes de Processamento
                <Badge className="ml-auto bg-emerald-500/20 text-emerald-400">{alertasSaques.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {alertasSaques.slice(0, 4).map((alerta) => (
                  <div key={alerta.entidade_id} className="flex items-center justify-between p-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Building2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      <span className="text-xs font-medium truncate">{alerta.titulo}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {alerta.valor && <span className="text-xs font-bold text-emerald-400">{formatCurrency(alerta.valor, alerta.moeda)}</span>}
                      <Button size="sm" onClick={() => handleSaqueAction(alerta)} className="h-6 text-xs px-2">
                        Processar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ),
      });
    }

    // 5. Participações de Investidores
    if (participacoesPendentes.length > 0) {
      cards.push({
        id: "participacoes-investidores",
        priority: PRIORITY.HIGH,
        component: (
          <Card key="participacoes-investidores" className="border-indigo-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Banknote className="h-4 w-4 text-indigo-400" />
                Participações de Investidores
                <Badge className="ml-auto bg-indigo-500/20 text-indigo-400">{participacoesPendentes.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {participacoesPendentes.slice(0, 4).map((part) => (
                  <div key={part.id} className="flex items-center justify-between p-2 rounded-lg border border-indigo-500/20 bg-indigo-500/5 cursor-pointer" onClick={() => { setSelectedParticipacao(part); setPagamentoParticipacaoOpen(true); }}>
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <User className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{part.investidor_nome}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{part.projeto_nome} • Ciclo {part.ciclo_numero}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-indigo-400">{formatCurrency(part.valor_participacao)}</span>
                      <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 h-6 text-xs px-2" onClick={(e) => { e.stopPropagation(); setSelectedParticipacao(part); setPagamentoParticipacaoOpen(true); }}>
                        Pagar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ),
      });
    }

    // 6. Pagamentos de Operador
    if (pagamentosOperadorPendentes.length > 0) {
      cards.push({
        id: "pagamentos-operador",
        priority: PRIORITY.HIGH,
        component: (
          <Card key="pagamentos-operador" className="border-orange-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4 text-orange-400" />
                Pagamentos de Operador
                <Badge className="ml-auto bg-orange-500/20 text-orange-400">{pagamentosOperadorPendentes.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {pagamentosOperadorPendentes.slice(0, 4).map((pag) => (
                  <div key={pag.id} className="flex items-center justify-between p-2 rounded-lg border border-orange-500/20 bg-orange-500/5 cursor-pointer" onClick={() => { setSelectedPagamentoOperador(pag); setPagamentoOperadorOpen(true); }}>
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <DollarSign className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{pag.operador_nome}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{pag.tipo_pagamento}{pag.projeto_nome ? ` • ${pag.projeto_nome}` : ""}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-orange-400">{formatCurrency(pag.valor)}</span>
                      <Button size="sm" className="bg-orange-600 hover:bg-orange-700 h-6 text-xs px-2" onClick={(e) => { e.stopPropagation(); setSelectedPagamentoOperador(pag); setPagamentoOperadorOpen(true); }}>
                        Pagar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ),
      });
    }

    // 7. Ciclos de Apuração
    if (alertasCiclos.length > 0) {
      cards.push({
        id: "ciclos-apuracao",
        priority: PRIORITY.MEDIUM,
        component: (
          <Card key="ciclos-apuracao" className="border-violet-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Target className="h-4 w-4 text-violet-400" />
                Ciclos de Apuração
                <Badge className="ml-auto bg-violet-500/20 text-violet-400">{alertasCiclos.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {alertasCiclos.slice(0, 4).map((ciclo) => {
                  const getUrgencyColor = () => {
                    switch (ciclo.urgencia) {
                      case "CRITICA": return "border-red-500/40 bg-red-500/10";
                      case "ALTA": return "border-orange-500/40 bg-orange-500/10";
                      default: return "border-violet-500/30 bg-violet-500/10";
                    }
                  };
                  return (
                    <div key={ciclo.id} className={`p-2 rounded-lg border cursor-pointer ${getUrgencyColor()}`} onClick={() => navigate(`/projeto/${ciclo.projeto_id}`)}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <FolderKanban className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-xs font-medium truncate">{ciclo.projeto_nome}</span>
                          <Badge variant="outline" className="text-[10px] shrink-0">Ciclo {ciclo.numero_ciclo}</Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          {ciclo.tipo_gatilho === "TEMPO" && <Clock className="h-3 w-3 text-muted-foreground" />}
                          {ciclo.tipo_gatilho === "VOLUME" && <Target className="h-3 w-3 text-muted-foreground" />}
                          {ciclo.tipo_gatilho === "HIBRIDO" && <Zap className="h-3 w-3 text-muted-foreground" />}
                        </div>
                      </div>
                      {(ciclo.tipo_gatilho === "VOLUME" || ciclo.tipo_gatilho === "HIBRIDO") && ciclo.meta_volume && (
                        <div className="mt-2">
                          <Progress value={Math.min(100, ciclo.progresso_volume)} className="h-1" />
                          <p className="text-[10px] text-muted-foreground mt-1">{ciclo.progresso_volume.toFixed(0)}% concluído</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ),
      });
    }

    // 8. Alertas de Lucro (Marcos)
    if (alertasLucro.length > 0) {
      cards.push({
        id: "alertas-lucro",
        priority: PRIORITY.MEDIUM,
        component: (
          <Card key="alertas-lucro" className="border-emerald-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                Marcos de Lucro Atingidos
                <Badge className="ml-auto bg-emerald-500/20 text-emerald-400">{alertasLucro.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {alertasLucro.slice(0, 4).map((alerta) => (
                  <div key={alerta.id} className="flex items-center justify-between p-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{alerta.parceiro_nome}</p>
                        <p className="text-[10px] text-muted-foreground">Lucro: {formatCurrency(alerta.lucro_atual)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs font-bold text-emerald-400">R$ {alerta.marco_valor.toLocaleString("pt-BR")}</span>
                      <Button size="sm" variant="outline" onClick={async () => {
                        try {
                          await supabase.from("parceiro_lucro_alertas").update({ notificado: true }).eq("id", alerta.id);
                          setAlertasLucro(prev => prev.filter(a => a.id !== alerta.id));
                          toast.success("Marco verificado");
                        } catch { toast.error("Erro ao confirmar"); }
                      }} className="h-6 text-[10px] px-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">
                        <CheckCircle2 className="h-3 w-3 mr-1" />OK
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ),
      });
    }

    // 9. Entregas Pendentes
    if (entregasPendentes.length > 0) {
      cards.push({
        id: "entregas-pendentes",
        priority: PRIORITY.MEDIUM,
        component: (
          <Card key="entregas-pendentes" className="border-purple-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Package className="h-4 w-4 text-purple-400" />
                Entregas Pendentes
                <Badge className="ml-auto bg-purple-500/20 text-purple-400">{entregasPendentes.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {entregasPendentes.slice(0, 4).map((entrega) => (
                  <div key={entrega.id} className={`flex items-center justify-between p-2 rounded-lg border ${entrega.nivel_urgencia === "CRITICA" ? "border-red-500/30 bg-red-500/5" : "border-purple-500/20 bg-purple-500/5"}`}>
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Target className={`h-3.5 w-3.5 shrink-0 ${entrega.nivel_urgencia === "CRITICA" ? "text-red-400" : "text-purple-400"}`} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{entrega.operador_nome}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{entrega.projeto_nome} • Entrega #{entrega.numero_entrega}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-purple-400">{formatCurrency(entrega.resultado_nominal)}</span>
                      <Button size="sm" onClick={() => handleConciliarEntrega(entrega)} className="bg-purple-600 hover:bg-purple-700 h-6 text-xs px-2">
                        Conciliar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ),
      });
    }

    // 10. Parceiros sem Parceria
    if (parceirosSemParceria.length > 0) {
      cards.push({
        id: "parceiros-sem-parceria",
        priority: PRIORITY.LOW,
        component: (
          <Card key="parceiros-sem-parceria" className="border-amber-500/30">
            <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                <UserPlus className="h-4 w-4 text-amber-400" />
                Parceiros sem Origem
                <Badge className="ml-auto bg-amber-500/20 text-amber-400">{parceirosSemParceria.length}</Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">Parceiros sem indicação, fornecedor ou origem registrada</p>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {parceirosSemParceria.slice(0, 4).map((parceiro) => (
                  <div key={parceiro.id} className="flex items-center justify-between p-2 rounded-lg border border-amber-500/20 bg-amber-500/5">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <User className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      <span className="text-xs font-medium truncate">{parceiro.nome}</span>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => navigate("/programa-indicacao", { state: { tab: "parcerias", parceiroId: parceiro.id } })} className="h-6 text-xs px-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
                      Definir Origem
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ),
      });
    }

    // 11. Pagamentos a Parceiros
    if (pagamentosParceiros.length > 0) {
      cards.push({
        id: "pagamentos-parceiros",
        priority: PRIORITY.LOW,
        component: (
          <Card key="pagamentos-parceiros" className="border-cyan-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <DollarSign className="h-4 w-4 text-cyan-400" />
                Pagamentos a Parceiros
                <Badge className="ml-auto bg-cyan-500/20 text-cyan-400">{pagamentosParceiros.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {pagamentosParceiros.slice(0, 4).map((pag) => (
                  <div key={pag.parceriaId} className="flex items-center justify-between p-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <User className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                      <span className="text-xs font-medium truncate">{pag.parceiroNome}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-cyan-400">{formatCurrency(pag.valorParceiro)}</span>
                      <Button size="sm" variant="ghost" onClick={() => navigate("/programa-indicacao", { state: { tab: "financeiro" } })} className="h-6 text-xs px-2">
                        Pagar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ),
      });
    }

    // 12. Bônus Pendentes
    if (bonusPendentes.length > 0) {
      cards.push({
        id: "bonus-pendentes",
        priority: PRIORITY.LOW,
        component: (
          <Card key="bonus-pendentes" className="border-pink-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Gift className="h-4 w-4 text-pink-400" />
                Bônus de Indicadores
                <Badge className="ml-auto bg-pink-500/20 text-pink-400">{bonusPendentes.reduce((acc, b) => acc + b.ciclosPendentes, 0)}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {bonusPendentes.slice(0, 4).map((bonus) => (
                  <div key={bonus.indicadorId} className="flex items-center justify-between p-2 rounded-lg border border-pink-500/20 bg-pink-500/5">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Gift className="h-3.5 w-3.5 text-pink-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{bonus.indicadorNome}</p>
                        <p className="text-[10px] text-muted-foreground">{bonus.ciclosPendentes} ciclo(s) pendente(s)</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-pink-400">{formatCurrency(bonus.totalBonusPendente)}</span>
                      <Button size="sm" variant="ghost" onClick={() => navigate("/programa-indicacao", { state: { tab: "financeiro" } })} className="h-6 text-xs px-2">
                        Pagar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ),
      });
    }

    // 13. Comissões Pendentes
    if (comissoesPendentes.length > 0) {
      cards.push({
        id: "comissoes-pendentes",
        priority: PRIORITY.LOW,
        component: (
          <Card key="comissoes-pendentes" className="border-teal-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Banknote className="h-4 w-4 text-teal-400" />
                Comissões Pendentes
                <Badge className="ml-auto bg-teal-500/20 text-teal-400">{comissoesPendentes.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {comissoesPendentes.slice(0, 4).map((comissao) => (
                  <div key={comissao.parceriaId} className="flex items-center justify-between p-2 rounded-lg border border-teal-500/20 bg-teal-500/5">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Banknote className="h-3.5 w-3.5 text-teal-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{comissao.indicadorNome}</p>
                        <p className="text-[10px] text-muted-foreground truncate">→ {comissao.parceiroNome}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-teal-400">{formatCurrency(comissao.valorComissao)}</span>
                      <Button size="sm" variant="ghost" onClick={() => navigate("/programa-indicacao", { state: { tab: "financeiro" } })} className="h-6 text-xs px-2">
                        Pagar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ),
      });
    }

    // 14. Parcerias Encerrando
    if (parceriasEncerramento.length > 0) {
      cards.push({
        id: "parcerias-encerrando",
        priority: PRIORITY.LOW,
        component: (
          <Card key="parcerias-encerrando" className="border-red-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-red-400" />
                Parcerias Encerrando
                <Badge className="ml-auto bg-red-500/20 text-red-400">{parceriasEncerramento.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {parceriasEncerramento.slice(0, 4).map((parc) => {
                  const isRed = parc.diasRestantes <= 5;
                  return (
                    <div key={parc.id} className={`flex items-center justify-between p-2 rounded-lg border ${isRed ? "border-red-500/30 bg-red-500/5" : "border-yellow-500/30 bg-yellow-500/5"}`}>
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Calendar className={`h-3.5 w-3.5 shrink-0 ${isRed ? "text-red-400" : "text-yellow-400"}`} />
                        <span className="text-xs font-medium truncate">{parc.parceiroNome}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge className={`text-[10px] h-5 ${isRed ? "bg-red-500/20 text-red-400" : "bg-yellow-500/20 text-yellow-400"}`}>
                          {parc.diasRestantes}d
                        </Badge>
                        <Button size="sm" variant={isRed ? "destructive" : "ghost"} onClick={() => navigate("/programa-indicacao")} className="h-6 text-xs px-2">
                          {isRed ? "Encerrar" : "Ver"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ),
      });
    }

    // Sort by priority
    return cards.sort((a, b) => a.priority - b.priority);
  }, [
    alertasCriticos, saquesPendentes, alertasSaques, participacoesPendentes,
    pagamentosOperadorPendentes, alertasCiclos, alertasLucro, entregasPendentes,
    parceirosSemParceria, pagamentosParceiros, bonusPendentes, comissoesPendentes, parceriasEncerramento
  ]);

  const hasAnyAlerts = alertCards.length > 1; // > 1 because PropostasPagamentoCard is always added

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
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
            {hasAnyAlerts ? "Ações que demandam atenção imediata" : "Todas as operações estão em dia"}
          </p>
        </div>
        <Button variant="outline" onClick={() => { fetchData(true); refetchCiclos(); }} disabled={refreshing}>
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Atualizar</span>
        </Button>
      </div>

      {/* Empty State */}
      {!hasAnyAlerts && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="pt-6">
            <div className="text-center py-16">
              <div className="mx-auto h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-emerald-400">Nenhuma pendência</h3>
              <p className="text-muted-foreground mt-2">
                Todas as operações estão em dia! 🎉
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alert Cards Grid - 3 columns */}
      {hasAnyAlerts && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {alertCards.map((card) => card.component)}
        </div>
      )}

      {/* Dialogs */}
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

      <ConfirmarSaqueDialog
        open={confirmarSaqueOpen}
        onClose={() => { setConfirmarSaqueOpen(false); setSelectedSaque(null); }}
        onSuccess={() => fetchData(true)}
        saque={selectedSaque}
      />

      <PagamentoOperadorDialog
        open={pagamentoOperadorOpen}
        onOpenChange={(open) => { setPagamentoOperadorOpen(open); if (!open) setSelectedPagamentoOperador(null); }}
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
          status: "PENDENTE",
        } : undefined}
        onSuccess={() => fetchData(true)}
      />

      {selectedParticipacao && (
        <PagamentoParticipacaoDialog
          open={pagamentoParticipacaoOpen}
          onOpenChange={(open) => { setPagamentoParticipacaoOpen(open); if (!open) setSelectedParticipacao(null); }}
          participacao={{
            id: selectedParticipacao.id,
            projeto_id: selectedParticipacao.projeto_id,
            ciclo_id: selectedParticipacao.ciclo_id,
            investidor_id: selectedParticipacao.investidor_id,
            investidor_nome: selectedParticipacao.investidor_nome || "N/A",
            projeto_nome: selectedParticipacao.projeto_nome || "N/A",
            ciclo_numero: selectedParticipacao.ciclo_numero || 0,
            percentual_aplicado: selectedParticipacao.percentual_aplicado,
            base_calculo: selectedParticipacao.base_calculo,
            lucro_base: selectedParticipacao.lucro_base,
            valor_participacao: selectedParticipacao.valor_participacao,
            data_apuracao: selectedParticipacao.data_apuracao,
          }}
          onSuccess={() => fetchData(true)}
        />
      )}
    </div>
  );
}
