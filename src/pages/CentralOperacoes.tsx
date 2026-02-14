/**
 * REGRA DE VISIBILIDADE (NÃO MODIFICAR SEM REVISÃO DE SEGURANÇA):
 * 
 * Operadores enxergam somente eventos operacionais de projetos vinculados.
 * Financeiro, parceiros e administração NÃO fazem parte do escopo operacional.
 * 
 * Domínios:
 * - project_event: Ciclos, entregas, pagamentos de operador (filtrado por vínculo)
 * - financial_event: Saques, participações investidores (owner/admin/finance)
 * - partner_event: Parceiros, indicadores, comissões, bônus (owner/admin/finance)
 * - admin_event: Alertas críticos, configurações (owner/admin)
 */

import { useState, useEffect, useMemo } from "react";
import { formatCurrency as formatCurrencyUtil } from "@/utils/formatCurrency";
import { supabase } from "@/integrations/supabase/client";
import { getFirstLastName } from "@/lib/utils";
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
  ShieldAlert,
  Unlink,
  Wallet,
} from "lucide-react";
import { CardInfoTooltip } from "@/components/ui/card-info-tooltip";
import { EntregaConciliacaoDialog } from "@/components/entregas/EntregaConciliacaoDialog";
import { ConfirmarSaqueDialog } from "@/components/caixa/ConfirmarSaqueDialog";
import { PagamentoOperadorDialog } from "@/components/operadores/PagamentoOperadorDialog";
import { PropostasPagamentoCard } from "@/components/operadores/PropostasPagamentoCard";
import { PagamentoParticipacaoDialog } from "@/components/projetos/PagamentoParticipacaoDialog";
import { useCicloAlertas } from "@/hooks/useCicloAlertas";
import { useRole } from "@/hooks/useRole";
import { useAuth } from "@/hooks/useAuth";

// Classificação de domínio dos eventos
type EventDomain = 'project_event' | 'financial_event' | 'partner_event' | 'admin_event';

// Mapa de visibilidade por role
const ROLE_VISIBILITY: Record<string, EventDomain[]> = {
  owner: ['project_event', 'financial_event', 'partner_event', 'admin_event'],
  admin: ['project_event', 'financial_event', 'partner_event', 'admin_event'],
  finance: ['project_event', 'financial_event', 'partner_event'],
  operator: ['project_event'], // Operadores veem apenas eventos de projeto
  viewer: [], // Viewer não vê ações pendentes
};

// Mapeamento de cards para domínios
const CARD_DOMAIN_MAP: Record<string, EventDomain> = {
  'alertas-criticos': 'admin_event',
  'propostas-pagamento': 'project_event',
  'casas-pendentes-conciliacao': 'financial_event',
  'saques-aguardando': 'financial_event',
  'saques-processamento': 'financial_event',
  'casas-limitadas': 'financial_event',
  'casas-desvinculadas': 'financial_event',
  'participacoes-investidores': 'financial_event',
  'pagamentos-operador': 'project_event',
  'ciclos-apuracao': 'project_event',
  'alertas-lucro': 'partner_event',
  'entregas-pendentes': 'project_event',
  'parceiros-sem-parceria': 'partner_event',
  'pagamentos-parceiros': 'partner_event',
  'bonus-pendentes': 'partner_event',
  'comissoes-pendentes': 'partner_event',
  'parcerias-encerrando': 'partner_event',
};

interface CasaPendenteConciliacao {
  bookmaker_id: string;
  bookmaker_nome: string;
  bookmaker_logo_url: string | null;
  moeda: string;
  saldo_atual: number;
  projeto_id: string | null;
  projeto_nome: string | null;
  parceiro_nome: string | null;
  qtd_transacoes_pendentes: number;
  valor_total_pendente: number;
}

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
  destino_wallet_id: string | null;
  bookmaker_nome?: string;
  parceiro_nome?: string;
  banco_nome?: string;
  wallet_nome?: string;
  projeto_nome?: string;
  // Campos cripto para liquidação real
  coin?: string;
  qtd_coin?: number;
  cotacao_original?: number;
  moeda_origem?: string;
  moeda_destino?: string;
  valor_origem?: number; // Valor na moeda da casa
  valor_destino?: number; // Valor esperado na moeda de destino (estimativa)
  cotacao?: number; // Cotação Casa→Destino usada na estimativa (ex: EUR/BRL = 6.21)
  // Dados da wallet de destino
  wallet_network?: string;
  wallet_exchange?: string;
  wallet_moedas?: string[];
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

interface BookmakerDesvinculado {
  id: string;
  nome: string;
  status: string;
  saldo_atual: number;
  saldo_usd: number;
  saldo_freebet: number;
  moeda: string;
  workspace_id: string;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  saldo_efetivo: number;
  saldo_total: number;
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
  const [casasDesvinculadas, setCasasDesvinculadas] = useState<BookmakerDesvinculado[]>([]);
  const [casasPendentesConciliacao, setCasasPendentesConciliacao] = useState<CasaPendenteConciliacao[]>([]);
  const [propostasPagamentoCount, setPropostasPagamentoCount] = useState(0);
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
  const { role, isOperator } = useRole();
  const { user, workspaceId } = useAuth();

  // Domínios permitidos para o role atual
  const allowedDomains = useMemo(() => {
    return ROLE_VISIBILITY[role || 'viewer'] || [];
  }, [role]);

  useEffect(() => {
    if (user && workspaceId) {
      fetchData();
    }
  }, [user, role, workspaceId]);

  const fetchData = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      // Para operadores, primeiro buscar os projetos vinculados
      let operatorProjectIds: string[] = [];
      let operadorId: string | null = null;

      if (isOperator && user) {
        const { data: operadorData } = await supabase
          .from("operadores")
          .select("id")
          .eq("auth_user_id", user.id)
          .single();

        if (operadorData) {
          operadorId = operadorData.id;
          const { data: vinculos } = await supabase
            .from("operador_projetos")
            .select("projeto_id")
            .eq("operador_id", operadorData.id)
            .eq("status", "ATIVO");
          operatorProjectIds = (vinculos || []).map((v: any) => v.projeto_id);
        }
      }

      // Operadores não devem ver dados administrativos, financeiros ou de parceiros
      const canSeeAdminData = allowedDomains.includes('admin_event');
      const canSeeFinancialData = allowedDomains.includes('financial_event');
      const canSeePartnerData = allowedDomains.includes('partner_event');

      // Buscar dados em paralelo, respeitando restrições de role
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
        // Alertas do painel operacional (saques e casas limitadas) - financial_event
        canSeeFinancialData 
          ? supabase.from("v_painel_operacional").select("*")
          : Promise.resolve({ data: [], error: null }),
        // Entregas pendentes - filtrar por projetos do operador se for operador
        supabase.from("v_entregas_pendentes").select("*").in("status_conciliacao", ["PRONTA"]),
        // Parcerias para pagamentos - apenas se puder ver dados de parceiros
        canSeePartnerData
          ? supabase
              .from("parcerias")
              .select(`id, valor_parceiro, origem_tipo, data_fim_prevista, custo_aquisicao_isento, parceiro:parceiros(nome)`)
              .in("status", ["ATIVA", "EM_ENCERRAMENTO"])
              .or("custo_aquisicao_isento.is.null,custo_aquisicao_isento.eq.false")
              .gt("valor_parceiro", 0)
          : Promise.resolve({ data: [], error: null }),
        // Movimentações para filtrar pagamentos já feitos
        canSeePartnerData
          ? supabase.from("movimentacoes_indicacao").select("parceria_id, tipo, status, indicador_id")
          : Promise.resolve({ data: [], error: null }),
        // Parcerias próximas do encerramento - apenas se puder ver dados de parceiros
        canSeePartnerData
          ? supabase
              .from("parcerias")
              .select(`id, data_fim_prevista, parceiro:parceiros(nome)`)
              .in("status", ["ATIVA", "EM_ENCERRAMENTO"])
              .not("data_fim_prevista", "is", null)
          : Promise.resolve({ data: [], error: null }),
        // Parceiros sem parceria - apenas se puder ver dados de parceiros
        canSeePartnerData
          ? supabase.from("parceiros").select("id, nome, cpf, created_at").eq("status", "ativo")
          : Promise.resolve({ data: [], error: null }),
        canSeePartnerData
          ? supabase.from("parcerias").select("parceiro_id").in("status", ["ATIVA", "EM_ENCERRAMENTO"])
          : Promise.resolve({ data: [], error: null }),
        // Saques pendentes - apenas se puder ver dados financeiros (incluindo dados cripto)
        // NOTA: cotacao = Casa→Destino (ex: EUR/BRL), valor_destino = estimativa na moeda de destino
        canSeeFinancialData
          ? supabase
              .from("cash_ledger")
              .select(`id, valor, moeda, data_transacao, descricao, origem_bookmaker_id, destino_parceiro_id, destino_conta_bancaria_id, destino_wallet_id, coin, qtd_coin, cotacao, moeda_origem, moeda_destino, valor_origem, valor_destino`)
              .eq("tipo_transacao", "SAQUE")
              .eq("status", "PENDENTE")
              .order("data_transacao", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        // Alertas de lucro - apenas se puder ver dados de parceiros
        canSeePartnerData
          ? supabase
              .from("parceiro_lucro_alertas")
              .select(`id, parceiro_id, marco_valor, lucro_atual, data_atingido, parceiro:parceiros(nome)`)
              .eq("notificado", false)
              .order("data_atingido", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        // Custos para bonus - apenas se puder ver dados de parceiros
        canSeePartnerData
          ? supabase.from("v_custos_aquisicao").select("*")
          : Promise.resolve({ data: [], error: null }),
        canSeePartnerData
          ? supabase.from("indicador_acordos").select("*").eq("ativo", true)
          : Promise.resolve({ data: [], error: null }),
        // Comissões pendentes - apenas se puder ver dados de parceiros
        canSeePartnerData
          ? supabase
              .from("parcerias")
              .select(`id, valor_comissao_indicador, comissao_paga, parceiro_id, parceiro:parceiros(nome)`)
              .eq("comissao_paga", false)
              .not("valor_comissao_indicador", "is", null)
              .gt("valor_comissao_indicador", 0)
          : Promise.resolve({ data: [], error: null }),
        canSeePartnerData
          ? supabase.from("indicacoes").select("parceiro_id, indicador_id")
          : Promise.resolve({ data: [], error: null }),
        canSeePartnerData
          ? supabase.from("indicadores_referral").select("id, nome")
          : Promise.resolve({ data: [], error: null }),
        // Pagamentos de operador pendentes
        supabase
          .from("pagamentos_operador")
          .select(`id, operador_id, tipo_pagamento, valor, data_pagamento, projeto_id, operador:operadores(nome), projeto:projetos(nome)`)
          .eq("status", "PENDENTE")
          .order("data_pagamento", { ascending: false }),
      ]);

      if (alertasResult.error) throw alertasResult.error;
      setAlertas(alertasResult.data || []);

      // Filtrar entregas por projetos do operador se necessário
      if (entregasResult.error) throw entregasResult.error;
      let entregasData = entregasResult.data || [];
      if (isOperator && operatorProjectIds.length > 0) {
        entregasData = entregasData.filter((e: any) => operatorProjectIds.includes(e.projeto_id));
      } else if (isOperator) {
        entregasData = []; // Operador sem projetos vinculados não vê entregas
      }
      setEntregasPendentes(entregasData);

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

      if (!saquesPendentesResult.error && saquesPendentesResult.data && saquesPendentesResult.data.length > 0) {
        const bookmakersIds = saquesPendentesResult.data.map((s: any) => s.origem_bookmaker_id).filter(Boolean);
        const parceirosIds = saquesPendentesResult.data.map((s: any) => s.destino_parceiro_id).filter(Boolean);
        const contasIds = saquesPendentesResult.data.map((s: any) => s.destino_conta_bancaria_id).filter(Boolean);
        const walletsIds = saquesPendentesResult.data.map((s: any) => s.destino_wallet_id).filter(Boolean);

        const [bookmakersData, parceirosNomes, contasNomes, walletsNomes] = await Promise.all([
          bookmakersIds.length > 0 ? supabase.from("bookmakers").select("id, nome, projeto_id").in("id", bookmakersIds) : Promise.resolve({ data: [] }),
          parceirosIds.length > 0 ? supabase.from("parceiros").select("id, nome").in("id", parceirosIds) : Promise.resolve({ data: [] }),
          contasIds.length > 0 ? supabase.from("contas_bancarias").select("id, banco, titular").in("id", contasIds) : Promise.resolve({ data: [] }),
          walletsIds.length > 0 ? supabase.from("wallets_crypto").select("id, exchange, moeda, network").in("id", walletsIds) : Promise.resolve({ data: [] }),
        ]);

        // Buscar nomes dos projetos vinculados às bookmakers
        const projetosIds = (bookmakersData.data || []).map((b: any) => b.projeto_id).filter(Boolean);
        const projetosNomes = projetosIds.length > 0 
          ? await supabase.from("projetos").select("id, nome").in("id", projetosIds)
          : { data: [] };

        const bookmakersMap = Object.fromEntries((bookmakersData.data || []).map((b: any) => [b.id, { nome: b.nome, projeto_id: b.projeto_id }]));
        const projetosMap = Object.fromEntries((projetosNomes.data || []).map((p: any) => [p.id, p.nome]));
        const parceirosMap = Object.fromEntries((parceirosNomes.data || []).map((p: any) => [p.id, p.nome]));
        const contasMap = Object.fromEntries((contasNomes.data || []).map((c: any) => [c.id, `${c.banco} - ${c.titular}`]));
        // Criar mapa estruturado das wallets (com dados completos, não apenas label)
        const walletsDataMap = Object.fromEntries(
          (walletsNomes.data || []).map((w: any) => {
            const moedas = Array.isArray(w.moeda) ? w.moeda : [];
            const exchange = w.exchange ? String(w.exchange).replace(/-/g, " ").toUpperCase() : "WALLET";
            const label = moedas.length > 0 ? `${exchange} (${moedas.join(", ")})` : exchange;
            return [w.id, { 
              label, 
              network: w.network,
              exchange,
              moedas 
            }];
          })
        );

        const saquesEnriquecidos: SaquePendenteConfirmacao[] = saquesPendentesResult.data.map((s: any) => {
          const bkData = bookmakersMap[s.origem_bookmaker_id] || { nome: "Bookmaker", projeto_id: null };
          const walletData = s.destino_wallet_id ? walletsDataMap[s.destino_wallet_id] : null;
          
          return {
            ...s,
            bookmaker_nome: bkData.nome,
            parceiro_nome: parceirosMap[s.destino_parceiro_id] || "",
            banco_nome: s.destino_conta_bancaria_id ? contasMap[s.destino_conta_bancaria_id] : undefined,
            wallet_nome: walletData?.label || undefined,
            projeto_nome: bkData.projeto_id ? projetosMap[bkData.projeto_id] : undefined,
            // Dados cripto do cash_ledger
            coin: s.coin || undefined,
            qtd_coin: s.qtd_coin || undefined,
            cotacao_original: s.cotacao || undefined,
            moeda_origem: s.moeda_origem || undefined,
            valor_origem: s.valor_origem || undefined,
            moeda_destino: s.moeda_destino || undefined,
            // Dados de conversão para conciliação
            valor_destino: s.valor_destino || undefined,
            cotacao_snapshot: s.cotacao_snapshot || s.cotacao || undefined,
            // Dados da wallet
            wallet_network: walletData?.network || undefined,
            wallet_exchange: walletData?.exchange || undefined,
            wallet_moedas: walletData?.moedas || undefined,
          };
        });

        setSaquesPendentes(saquesEnriquecidos);
      } else {
        setSaquesPendentes([]);
      }

      // Filtrar pagamentos de operador
      if (!pagamentosOperadorResult.error && pagamentosOperadorResult.data) {
        let pagamentosOp: PagamentoOperadorPendente[] = pagamentosOperadorResult.data.map((p: any) => ({
          id: p.id,
          operador_id: p.operador_id,
          operador_nome: p.operador?.nome || "N/A",
          tipo_pagamento: p.tipo_pagamento,
          valor: p.valor,
          data_pagamento: p.data_pagamento,
          projeto_id: p.projeto_id || null,
          projeto_nome: p.projeto?.nome || null,
        }));

        // Operador vê apenas seus próprios pagamentos
        if (isOperator && operadorId) {
          pagamentosOp = pagamentosOp.filter(p => p.operador_id === operadorId);
        }
        
        setPagamentosOperadorPendentes(pagamentosOp);
      }

      // Participações - apenas para quem pode ver dados financeiros
      if (canSeeFinancialData) {
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

        // Buscar casas desvinculadas
        const casasResult = await supabase
          .from("v_bookmakers_desvinculados")
          .select("*");

        if (!casasResult.error && casasResult.data) {
          setCasasDesvinculadas(casasResult.data as BookmakerDesvinculado[]);
        }

        // Buscar casas pendentes de conciliação (globalmente no workspace)
        const conciliacaoResult = await supabase.rpc("get_bookmakers_pendentes_conciliacao", {
          p_workspace_id: workspaceId,
        });

        if (!conciliacaoResult.error && conciliacaoResult.data) {
          setCasasPendentesConciliacao(conciliacaoResult.data as CasaPendenteConciliacao[]);
        }
      } else {
        setParticipacoesPendentes([]);
        setCasasDesvinculadas([]);
        setCasasPendentesConciliacao([]);
      }

      // Propostas de pagamento - buscar contagem para renderização condicional
      const propostasResult = await supabase
        .from("pagamentos_propostos")
        .select("id", { count: "exact", head: true })
        .eq("status", "PENDENTE");
      
      setPropostasPagamentoCount(propostasResult.count || 0);

    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Usa helper centralizado que previne RangeError em tokens cripto
  const formatCurrency = (value: number, moeda: string = "BRL") => {
    return formatCurrencyUtil(value, moeda);
  };

  const handleSaqueAction = (alerta: Alerta) => {
    // Determinar se é FIAT ou CRYPTO baseado na moeda
    const moedaAlerta = alerta.moeda || "BRL";
    const isCrypto = ["USDT", "USDC", "BTC", "ETH", "BNB", "TRX", "SOL", "MATIC", "ADA", "DOT", "AVAX", "LINK", "UNI", "LTC", "XRP"].includes(moedaAlerta);
    
    // Navegar para Caixa com dados pré-preenchidos para saque incluindo moeda
    navigate("/caixa", { 
      state: { 
        openDialog: true, 
        bookmakerId: alerta.entidade_id,
        bookmakerNome: alerta.titulo,
        parceiroId: alerta.parceiro_id,
        parceiroNome: alerta.parceiro_nome,
        tipoMoeda: isCrypto ? "CRYPTO" : "FIAT",
        moeda: isCrypto ? undefined : moedaAlerta,
        coin: isCrypto ? moedaAlerta : undefined,
      } 
    });
  };

  const handleConciliarEntrega = (entrega: EntregaPendente) => {
    setSelectedEntrega(entrega);
    setConciliacaoOpen(true);
  };

  const handleConfirmarSaque = (saque: SaquePendenteConfirmacao) => {
    setSelectedSaque(saque);
    setConfirmarSaqueOpen(true);
  };

  const handleSolicitarSaqueCasaDesvinculada = (casa: BookmakerDesvinculado) => {
    navigate("/caixa", { state: { openDialog: true, bookmakerId: casa.id, bookmakerNome: casa.nome } });
  };

  // Marcar casa para saque (decisão do responsável)
  // Usa RPC que preserva estado_conta antes de entrar no workflow
  const handleMarcarParaSaque = async (casa: BookmakerDesvinculado) => {
    try {
      const { error } = await supabase.rpc('marcar_para_saque', {
        p_bookmaker_id: casa.id
      });

      if (error) throw error;
      
      toast.success(`"${casa.nome}" marcada para saque`);
      fetchData(true);
    } catch (err) {
      console.error("Erro ao marcar para saque:", err);
      toast.error("Erro ao marcar para saque");
    }
  };

  // Disponibilizar casa para novos projetos (decisão do responsável)
  // Limpa workflow de saque e restaura estado anterior
  const handleDisponibilizarCasa = async (casa: BookmakerDesvinculado) => {
    try {
      // Se estava em workflow de saque, usar RPC para restaurar estado corretamente
      const { error } = await supabase.rpc('confirmar_saque_concluido', {
        p_bookmaker_id: casa.id
      });

      if (error) throw error;
      
      toast.success(`"${casa.nome}" disponibilizada para novos projetos`);
      fetchData(true);
    } catch (err) {
      console.error("Erro ao disponibilizar casa:", err);
      toast.error("Erro ao disponibilizar casa");
    }
  };

  const handleAcknowledgeCasaDesvinculada = async (casa: BookmakerDesvinculado) => {
    try {
      const { error } = await supabase
        .from("bookmaker_unlinked_acks")
        .insert({
          bookmaker_id: casa.id,
          workspace_id: casa.workspace_id,
          acknowledged_by: user?.id,
          reason: "Usuário reconheceu a pendência",
        });

      if (error) throw error;
      
      toast.success(`Alerta de "${casa.nome}" removido`);
      fetchData(true);
    } catch (err) {
      console.error("Erro ao registrar acknowledge:", err);
      toast.error("Erro ao confirmar ciência");
    }
  };

  const alertasSaques = alertas.filter((a) => a.tipo_alerta === "BOOKMAKER_SAQUE");
  const alertasLimitadas = alertas.filter((a) => a.tipo_alerta === "BOOKMAKER_LIMITADA");
  const alertasCriticos = alertas.filter((a) => a.nivel_urgencia === "CRITICA");

  // Filtrar ciclos por projetos do operador
  const alertasCiclosFiltrados = useMemo(() => {
    if (!isOperator) return alertasCiclos;
    // Para operadores, precisaria filtrar pelos projetos vinculados
    // Por enquanto, mostrar todos (a view já deve ter RLS)
    return alertasCiclos;
  }, [alertasCiclos, isOperator]);

  // Build alert cards with priority and domain filtering
  const alertCards = useMemo(() => {
    const cards: Array<{ id: string; priority: number; component: JSX.Element; domain: EventDomain }> = [];

    // 1. Alertas Críticos (highest priority) - admin_event
    if (alertasCriticos.length > 0 && allowedDomains.includes('admin_event')) {
      cards.push({
        id: "alertas-criticos",
        priority: PRIORITY.CRITICAL,
        domain: 'admin_event',
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

    // 2. Propostas de Pagamento - project_event (operador vê apenas as próprias)
    // REGRA: Só renderizar se houver propostas pendentes
    if (allowedDomains.includes('project_event') && propostasPagamentoCount > 0) {
      cards.push({
        id: "propostas-pagamento",
        priority: PRIORITY.HIGH,
        domain: 'project_event',
        component: <PropostasPagamentoCard key="propostas-pagamento" />,
      });
    }

    // 2.5. Casas Pendentes de Conciliação - financial_event (PRIORIDADE ALTA)
    // REGRA: Casas com transações pendentes bloqueiam operação
    if (casasPendentesConciliacao.length > 0 && allowedDomains.includes('financial_event')) {
      cards.push({
        id: "casas-pendentes-conciliacao",
        priority: PRIORITY.CRITICAL, // Prioridade crítica - bloqueia operação
        domain: 'financial_event',
        component: (
          <Card key="casas-pendentes-conciliacao" className="border-amber-500/50 bg-amber-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShieldAlert className="h-4 w-4 text-amber-500" />
                Conciliação Pendente
                <CardInfoTooltip 
                  title="Conciliação Obrigatória"
                  description="Casas com transações pendentes não podem ser utilizadas para apostas ou bônus até que a conciliação seja realizada."
                  flow="Transações pendentes (depósitos, saques em processamento) devem ser conciliadas para liberar a casa para operação."
                />
                <Badge className="ml-auto bg-amber-500/20 text-amber-600 animate-pulse">{casasPendentesConciliacao.length}</Badge>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Casas bloqueadas até conciliar transações
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {casasPendentesConciliacao.slice(0, 4).map((casa) => (
                  <div key={casa.bookmaker_id} className="flex items-center justify-between p-2 rounded-lg border border-amber-500/30 bg-amber-500/10">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <ShieldAlert className="h-3.5 w-3.5 text-amber-500 shrink-0 animate-pulse" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">
                          {casa.bookmaker_nome}
                          {casa.parceiro_nome && <span className="text-muted-foreground font-normal"> de {casa.parceiro_nome}</span>}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {casa.projeto_nome ? (
                            <span className="text-primary/80">{casa.projeto_nome}</span>
                          ) : (
                            <span className="text-amber-600 italic">Nenhum projeto vinculado</span>
                          )}
                          <span className="mx-1">•</span>
                          {casa.qtd_transacoes_pendentes} {casa.qtd_transacoes_pendentes === 1 ? "transação" : "transações"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-amber-500">
                        {formatCurrency(casa.valor_total_pendente, casa.moeda)}
                      </span>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => {
                          // Navegar para a aba de conciliação do Caixa Operacional
                          navigate(`/caixa?tab=conciliacao&bookmaker=${casa.bookmaker_id}`);
                        }}
                        className="border-amber-500/50 text-amber-600 hover:bg-amber-500/10 h-6 text-xs px-2"
                      >
                        Conciliar
                      </Button>
                    </div>
                  </div>
                ))}
                {casasPendentesConciliacao.length > 4 && (
                  <p className="text-[10px] text-muted-foreground text-center pt-1">
                    +{casasPendentesConciliacao.length - 4} outras casas pendentes
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ),
      });
    }

    // 3. Saques Aguardando Confirmação - financial_event
    if (saquesPendentes.length > 0 && allowedDomains.includes('financial_event')) {
      cards.push({
        id: "saques-aguardando",
        priority: PRIORITY.HIGH,
        domain: 'financial_event',
        component: (
          <Card key="saques-aguardando" className="border-yellow-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-yellow-400" />
                Saques Aguardando Confirmação
                <CardInfoTooltip 
                  title="Saques Aguardando Confirmação"
                  description="Saques que foram iniciados e precisam de confirmação de recebimento pelo parceiro/conta bancária."
                  flow="Quando um saque é registrado no Caixa, ele fica pendente até que a tesouraria confirme que o valor foi recebido no destino."
                />
                <Badge className="ml-auto bg-yellow-500/20 text-yellow-400">{saquesPendentes.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {saquesPendentes.slice(0, 4).map((saque) => {
                  const destinoNome = saque.destino_wallet_id 
                    ? (saque.wallet_exchange || saque.wallet_nome || "Wallet") 
                    : (saque.banco_nome || "Conta Bancária");
                  const parceiroShort = saque.parceiro_nome ? getFirstLastName(saque.parceiro_nome) : "";
                  
                  return (
                    <div key={saque.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-yellow-500/30 bg-yellow-500/5">
                      {saque.destino_wallet_id ? (
                        <Wallet className="h-4 w-4 text-yellow-400 shrink-0" />
                      ) : (
                        <Building2 className="h-4 w-4 text-yellow-400 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">
                          {destinoNome}{parceiroShort ? ` · ${parceiroShort}` : ""}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {saque.bookmaker_nome}
                          {saque.coin ? ` · ${saque.coin}` : ""}
                        </p>
                      </div>
                      <span className="text-xs font-bold text-yellow-400 shrink-0">
                        {formatCurrency(saque.valor_origem || saque.valor, saque.moeda_origem || saque.moeda)}
                      </span>
                      <Button size="sm" onClick={() => handleConfirmarSaque(saque)} className="bg-yellow-600 hover:bg-yellow-700 h-6 text-xs px-2 shrink-0">
                        Confirmar
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ),
      });
    }

    // 4. Saques Pendentes de Processamento - financial_event
    if (alertasSaques.length > 0 && allowedDomains.includes('financial_event')) {
      cards.push({
        id: "saques-processamento",
        priority: PRIORITY.HIGH,
        domain: 'financial_event',
        component: (
          <Card key="saques-processamento" className="border-emerald-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <DollarSign className="h-4 w-4 text-emerald-400" />
                Saques Pendentes de Processamento
                <CardInfoTooltip 
                  title="Saques Pendentes de Processamento"
                  description="Bookmakers marcados para saque que aguardam a tesouraria processar a retirada do saldo."
                  flow="Uma casa chega aqui quando: (1) Foi desvinculada de um projeto e estava marcada como 'limitada' — nesse caso o saque é automático; ou (2) Estava em 'Casas Aguardando Decisão' e o gestor escolheu 'Marcar para Saque'."
                />
                <Badge className="ml-auto bg-emerald-500/20 text-emerald-400">{alertasSaques.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {alertasSaques.slice(0, 4).map((alerta) => (
                  <div key={alerta.entidade_id} className="flex items-center justify-between p-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Building2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{alerta.titulo}</p>
                        {alerta.parceiro_nome && (
                          <p className="text-[10px] text-muted-foreground truncate">{alerta.parceiro_nome}</p>
                        )}
                      </div>
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

    // 4.5. Casas Limitadas - financial_event
    if (alertasLimitadas.length > 0 && allowedDomains.includes('financial_event')) {
      cards.push({
        id: "casas-limitadas",
        priority: PRIORITY.HIGH,
        domain: 'financial_event',
        component: (
          <Card key="casas-limitadas" className="border-orange-500/30 bg-orange-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShieldAlert className="h-4 w-4 text-orange-400" />
                Casas Limitadas
                <CardInfoTooltip 
                  title="Casas Limitadas"
                  description="Bookmakers que foram marcadas como limitadas e ainda estão vinculadas a projetos. Precisam de atenção para saque."
                  flow="Quando uma bookmaker é marcada como 'Limitada' (conta restrita pela casa), ela aparece aqui para processamento de saque."
                />
                <Badge className="ml-auto bg-orange-500/20 text-orange-400">{alertasLimitadas.length}</Badge>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Casas devolvidas/limitadas com saldo pendente
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {alertasLimitadas.slice(0, 4).map((alerta) => (
                  <div key={alerta.entidade_id} className="flex items-center justify-between p-2 rounded-lg border border-orange-500/30 bg-orange-500/10">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Building2 className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{alerta.titulo}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {alerta.parceiro_nome && `${alerta.parceiro_nome} • `}Sacar ou realocar saldo
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {alerta.valor && <span className="text-xs font-bold text-orange-400">{formatCurrency(alerta.valor, alerta.moeda)}</span>}
                      <Button size="sm" onClick={() => handleSaqueAction(alerta)} className="bg-orange-600 hover:bg-orange-700 h-6 text-xs px-2">
                        Sacar
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

    // 4.6. Casas Aguardando Decisão - financial_event
    // Separar casas por status: AGUARDANDO_DECISAO vs ATIVO (legado)
    const casasAguardandoDecisao = casasDesvinculadas.filter(c => c.status === 'AGUARDANDO_DECISAO');
    const casasAtivasDesvinculadas = casasDesvinculadas.filter(c => c.status === 'ATIVO');
    
    if (casasAguardandoDecisao.length > 0 && allowedDomains.includes('financial_event')) {
      cards.push({
        id: "casas-aguardando-decisao",
        priority: PRIORITY.HIGH,
        domain: 'financial_event',
        component: (
          <Card key="casas-aguardando-decisao" className="border-purple-500/30 bg-purple-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Unlink className="h-4 w-4 text-purple-400" />
                Casas Aguardando Decisão
                <CardInfoTooltip 
                  title="Casas Aguardando Decisão"
                  description="Bookmakers ativas que foram desvinculadas de projetos com saldo positivo. Você decide: disponibilizar para outros projetos ou sacar."
                  flow="Quando um operador desvincula uma casa ATIVA (não limitada) com saldo, ela vem para cá aguardando decisão do responsável financeiro."
                />
                <Badge className="ml-auto bg-purple-500/20 text-purple-400">{casasAguardandoDecisao.length}</Badge>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Definir destino: disponibilizar ou sacar
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {casasAguardandoDecisao.slice(0, 4).map((casa) => (
                  <div key={casa.id} className="flex items-center justify-between p-2 rounded-lg border border-purple-500/30 bg-purple-500/10">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Unlink className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{casa.nome}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {casa.parceiro_nome || "Sem parceiro"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-purple-400">{formatCurrency(casa.saldo_efetivo, casa.moeda)}</span>
                      <div className="flex gap-1">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleDisponibilizarCasa(casa)} 
                          className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 h-6 text-xs px-2"
                        >
                          Disponibilizar
                        </Button>
                        <Button 
                          size="sm" 
                          onClick={() => handleMarcarParaSaque(casa)} 
                          className="bg-purple-600 hover:bg-purple-700 h-6 text-xs px-2"
                        >
                          Marcar Saque
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ),
      });
    }

    // Card legado para casas ativas desvinculadas (compatibilidade)
    if (casasAtivasDesvinculadas.length > 0 && allowedDomains.includes('financial_event')) {
      cards.push({
        id: "casas-desvinculadas",
        priority: PRIORITY.MEDIUM,
        domain: 'financial_event',
        component: (
          <Card key="casas-desvinculadas" className="border-slate-500/30 bg-slate-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Unlink className="h-4 w-4 text-slate-400" />
                Casas Desvinculadas
                <CardInfoTooltip 
                  title="Casas Desvinculadas (Legado)"
                  description="Bookmakers que foram desvinculadas antes da nova regra de decisão. Podem ser sacadas ou marcadas como cientes."
                  flow="Casas desvinculadas antes da implementação do novo fluxo de decisão aparecem aqui para compatibilidade."
                />
                <Badge className="ml-auto bg-slate-500/20 text-slate-400">{casasAtivasDesvinculadas.length}</Badge>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Casas sem projeto com saldo pendente
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {casasAtivasDesvinculadas.slice(0, 4).map((casa) => (
                  <div key={casa.id} className="flex items-center justify-between p-2 rounded-lg border border-slate-500/30 bg-slate-500/10">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Unlink className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{casa.nome}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {casa.parceiro_nome || "Sem parceiro"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-slate-400">{formatCurrency(casa.saldo_efetivo, casa.moeda)}</span>
                      <div className="flex gap-1">
                        <Button 
                          size="sm" 
                          onClick={() => handleSolicitarSaqueCasaDesvinculada(casa)} 
                          className="bg-slate-600 hover:bg-slate-700 h-6 text-xs px-2"
                        >
                          Sacar
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleAcknowledgeCasaDesvinculada(casa)} 
                          className="border-slate-500/30 text-slate-400 hover:bg-slate-500/10 h-6 text-xs px-2"
                        >
                          Ciente
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ),
      });
    }

    // 5. Participações de Investidores - financial_event
    if (participacoesPendentes.length > 0 && allowedDomains.includes('financial_event')) {
      cards.push({
        id: "participacoes-investidores",
        priority: PRIORITY.HIGH,
        domain: 'financial_event',
        component: (
          <Card key="participacoes-investidores" className="border-indigo-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Banknote className="h-4 w-4 text-indigo-400" />
                Participações de Investidores
                <CardInfoTooltip 
                  title="Participações de Investidores"
                  description="Pagamentos de participação nos lucros devidos aos investidores com base nos ciclos apurados."
                  flow="Quando um ciclo de projeto é fechado com lucro, é calculada a participação de cada investidor conforme percentual acordado."
                />
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

    // 6. Pagamentos de Operador - project_event
    if (pagamentosOperadorPendentes.length > 0 && allowedDomains.includes('project_event')) {
      cards.push({
        id: "pagamentos-operador",
        priority: PRIORITY.HIGH,
        domain: 'project_event',
        component: (
          <Card key="pagamentos-operador" className="border-orange-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4 text-orange-400" />
                Pagamentos de Operador
                <CardInfoTooltip 
                  title="Pagamentos de Operador"
                  description="Pagamentos pendentes aos operadores de projetos (fixos, comissões ou bonificações)."
                  flow="Quando um operador atinge meta ou tem pagamento agendado, o valor é gerado automaticamente e aguarda processamento."
                />
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

    // 7. Ciclos de Apuração - project_event
    if (alertasCiclosFiltrados.length > 0 && allowedDomains.includes('project_event')) {
      cards.push({
        id: "ciclos-apuracao",
        priority: PRIORITY.MEDIUM,
        domain: 'project_event',
        component: (
          <Card key="ciclos-apuracao" className="border-violet-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Target className="h-4 w-4 text-violet-400" />
                Ciclos de Apuração
                <CardInfoTooltip 
                  title="Ciclos de Apuração"
                  description="Ciclos de projetos que estão próximos do fechamento ou já atingiram a meta de volume/tempo."
                  flow="Ciclos são criados automaticamente para projetos e fecham por tempo, volume apostado ou ambos (híbrido)."
                />
                <Badge className="ml-auto bg-violet-500/20 text-violet-400">{alertasCiclosFiltrados.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {alertasCiclosFiltrados.slice(0, 4).map((ciclo) => {
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

    // 8. Alertas de Lucro (Marcos) - partner_event
    if (alertasLucro.length > 0 && allowedDomains.includes('partner_event')) {
      cards.push({
        id: "alertas-lucro",
        priority: PRIORITY.MEDIUM,
        domain: 'partner_event',
        component: (
          <Card key="alertas-lucro" className="border-emerald-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                Marcos de Lucro Atingidos
                <CardInfoTooltip 
                  title="Marcos de Lucro Atingidos"
                  description="Parceiros que atingiram marcos importantes de lucro acumulado (ex: R$1.000, R$5.000)."
                  flow="Quando o lucro total de um parceiro cruza um marco configurado, um alerta é gerado para acompanhamento."
                />
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

    // 9. Entregas Pendentes - project_event
    if (entregasPendentes.length > 0 && allowedDomains.includes('project_event')) {
      cards.push({
        id: "entregas-pendentes",
        priority: PRIORITY.MEDIUM,
        domain: 'project_event',
        component: (
          <Card key="entregas-pendentes" className="border-purple-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Package className="h-4 w-4 text-purple-400" />
                Entregas Pendentes
                <CardInfoTooltip 
                  title="Entregas Pendentes"
                  description="Entregas de operadores que estão prontas para conciliação e pagamento."
                  flow="Quando uma entrega atinge a meta (tempo ou valor), ela fica disponível para conciliação e posterior pagamento ao operador."
                />
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

    // 10. Parceiros sem Parceria - partner_event
    if (parceirosSemParceria.length > 0 && allowedDomains.includes('partner_event')) {
      cards.push({
        id: "parceiros-sem-parceria",
        priority: PRIORITY.LOW,
        domain: 'partner_event',
        component: (
          <Card key="parceiros-sem-parceria" className="border-amber-500/30">
            <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                <UserPlus className="h-4 w-4 text-amber-400" />
                Parceiros sem Origem
                <CardInfoTooltip 
                  title="Parceiros sem Origem"
                  description="Parceiros ativos que não possuem indicador, fornecedor ou outra origem registrada."
                  flow="Parceiros cadastrados sem origem aparecem aqui para definição de como chegaram à operação."
                />
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

    // 11. Pagamentos a Parceiros - partner_event
    if (pagamentosParceiros.length > 0 && allowedDomains.includes('partner_event')) {
      cards.push({
        id: "pagamentos-parceiros",
        priority: PRIORITY.LOW,
        domain: 'partner_event',
        component: (
          <Card key="pagamentos-parceiros" className="border-cyan-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <DollarSign className="h-4 w-4 text-cyan-400" />
                Pagamentos a Parceiros
                <CardInfoTooltip 
                  title="Pagamentos a Parceiros"
                  description="Valores devidos aos parceiros conforme acordado na parceria (valor fixo ou percentual)."
                  flow="Quando uma parceria possui valor acordado para o parceiro, ele aparece aqui para pagamento."
                />
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

    // 12. Bônus Pendentes - partner_event
    if (bonusPendentes.length > 0 && allowedDomains.includes('partner_event')) {
      cards.push({
        id: "bonus-pendentes",
        priority: PRIORITY.LOW,
        domain: 'partner_event',
        component: (
          <Card key="bonus-pendentes" className="border-pink-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Gift className="h-4 w-4 text-pink-400" />
                Bônus de Indicadores
                <CardInfoTooltip 
                  title="Bônus de Indicadores"
                  description="Bônus devidos a indicadores que atingiram metas de parceiros indicados."
                  flow="Quando um indicador atinge a meta de parceiros indicados, um bônus é gerado conforme acordo."
                />
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

    // 13. Comissões Pendentes - partner_event
    if (comissoesPendentes.length > 0 && allowedDomains.includes('partner_event')) {
      cards.push({
        id: "comissoes-pendentes",
        priority: PRIORITY.LOW,
        domain: 'partner_event',
        component: (
          <Card key="comissoes-pendentes" className="border-teal-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Banknote className="h-4 w-4 text-teal-400" />
                Comissões Pendentes
                <CardInfoTooltip 
                  title="Comissões Pendentes"
                  description="Comissões devidas a indicadores por parceiros que eles indicaram."
                  flow="Quando uma parceria indicada gera receita, uma comissão é calculada para o indicador responsável."
                />
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

    // 14. Parcerias Encerrando - partner_event
    if (parceriasEncerramento.length > 0 && allowedDomains.includes('partner_event')) {
      cards.push({
        id: "parcerias-encerrando",
        priority: PRIORITY.LOW,
        domain: 'partner_event',
        component: (
          <Card key="parcerias-encerrando" className="border-red-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-red-400" />
                Parcerias Encerrando
                <CardInfoTooltip 
                  title="Parcerias Encerrando"
                  description="Parcerias com data de fim próxima que precisam ser renovadas ou encerradas."
                  flow="Parcerias com data de encerramento nos próximos dias aparecem aqui para ação preventiva."
                />
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
    alertasCriticos, saquesPendentes, alertasSaques, alertasLimitadas, casasDesvinculadas,
    participacoesPendentes, pagamentosOperadorPendentes, alertasCiclosFiltrados, alertasLucro, 
    entregasPendentes, parceirosSemParceria, pagamentosParceiros, bonusPendentes, comissoesPendentes, 
    parceriasEncerramento, allowedDomains, propostasPagamentoCount, casasPendentesConciliacao, navigate
  ]);

  const hasAnyAlerts = alertCards.length > 0;

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
          <h1 className="text-3xl font-bold tracking-tight">
            {isOperator ? "Central de Ações de Projetos" : "Central de Operações"}
          </h1>
          <p className="text-muted-foreground">
            {hasAnyAlerts 
              ? (isOperator ? "Ações pendentes nos seus projetos" : "Ações que demandam atenção imediata")
              : "Todas as operações estão em dia"}
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

      <PagamentoParticipacaoDialog
        open={pagamentoParticipacaoOpen}
        onOpenChange={(open) => { setPagamentoParticipacaoOpen(open); if (!open) setSelectedParticipacao(null); }}
        participacao={selectedParticipacao ? {
          id: selectedParticipacao.id,
          projeto_id: selectedParticipacao.projeto_id,
          ciclo_id: selectedParticipacao.ciclo_id,
          investidor_id: selectedParticipacao.investidor_id,
          percentual_aplicado: selectedParticipacao.percentual_aplicado,
          base_calculo: selectedParticipacao.base_calculo,
          lucro_base: selectedParticipacao.lucro_base,
          valor_participacao: selectedParticipacao.valor_participacao,
          data_apuracao: selectedParticipacao.data_apuracao,
          status: "A_PAGAR",
        } : undefined}
        onSuccess={() => fetchData(true)}
      />
    </div>
  );
}
