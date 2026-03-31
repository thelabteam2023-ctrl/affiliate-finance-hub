import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCotacoes } from "@/hooks/useCotacoes";
import { usePendingTransactions, useInvalidatePendingTransactions } from "@/hooks/usePendingTransactions";
import { useTabWorkspace } from "@/hooks/useTabWorkspace";
import { useWorkspaceChangeListener } from "@/hooks/useWorkspaceCacheClear";
import { CAIXA_DATA_CHANGED_EVENT } from "@/hooks/useInvalidateCaixaData";
import { CASH_REAL_TYPES } from "@/lib/cashOperationalTypes";
import { getGrupoFromCategoria, getGrupoInfo } from "@/lib/despesaGrupos";
import { Button } from "@/components/ui/button";
import { useTopBar } from "@/contexts/TopBarContext";
import { Plus, TrendingUp, TrendingDown, Wallet, AlertCircle, ArrowRight, Calendar, Filter, Info, Wrench, MoreHorizontal, HelpCircle } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActionAccess } from "@/hooks/useModuleAccess";
import { usePermissions } from "@/contexts/PermissionsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CaixaTransacaoDialog } from "@/components/caixa/CaixaTransacaoDialog";
import { CaixaTabsContainer } from "@/components/caixa/CaixaTabsContainer";
import { SaldosParceirosSheet } from "@/components/caixa/SaldosParceirosSheet";
import { PosicaoCapital } from "@/components/caixa/PosicaoCapital";
import { ConfirmarSaqueDialog } from "@/components/caixa/ConfirmarSaqueDialog";
import { AjusteManualDialog } from "@/components/caixa/AjusteManualDialog";
import { ReconciliacaoDialog } from "@/components/caixa/ReconciliacaoDialog";
import { SaldosFiatCard } from "@/components/caixa/SaldosFiatCard";
import { ExposicaoCryptoCard } from "@/components/caixa/ExposicaoCryptoCard";
// TransacoesEmTransito removido - lógica unificada na Conciliação
import { subDays, startOfDay, endOfDay, format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { parseLocalDateTime, extractCivilDateKey } from "@/utils/dateUtils";

interface LocationState {
  openDialog?: boolean;
  bookmakerId?: string;
  bookmakerNome?: string;
  parceiroId?: string;
  parceiroNome?: string;
  tipoMoeda?: "FIAT" | "CRYPTO";
  moeda?: string;
  coin?: string;
}

interface Transacao {
  id: string;
  data_transacao: string;
  tipo_transacao: string;
  tipo_moeda: string;
  moeda: string;
  coin: string | null;
  valor: number;
  valor_usd: number | null;
  qtd_coin: number | null;
  cotacao: number | null;
  origem_tipo: string | null;
  destino_tipo: string | null;
  descricao: string | null;
  status: string;
  origem_parceiro_id: string | null;
  origem_conta_bancaria_id: string | null;
  origem_wallet_id: string | null;
  origem_bookmaker_id: string | null;
  destino_parceiro_id: string | null;
  destino_conta_bancaria_id: string | null;
  destino_wallet_id: string | null;
  destino_bookmaker_id: string | null;
  nome_investidor: string | null;
  operador_id: string | null;
  // Snapshot imutável do projeto no momento da transação
  projeto_id_snapshot: string | null;
  ajuste_direcao: string | null;
  ajuste_motivo: string | null;
  data_confirmacao: string | null;
  created_at: string;
  auditoria_metadata: any;
}

interface SaldoFiat {
  moeda: string;
  saldo: number;
}

interface SaldoCrypto {
  coin: string;
  saldo_coin: number;
  saldo_usd: number;
}

export default function Caixa() {
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const { setContent: setTopBarContent } = useTopBar();
  const [searchParams] = useSearchParams();
  const locationState = location.state as LocationState | null;
  
  // Ler aba inicial da URL (?tab=conciliacao)
  const initialTab = searchParams.get("tab") || "analise";
  
  // Workspace reactivo para isolamento multi-tenant
  const { workspaceId } = useTabWorkspace();
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [saldosFiat, setSaldosFiat] = useState<SaldoFiat[]>([]);
  const [saldosCrypto, setSaldosCrypto] = useState<SaldoCrypto[]>([]);
  const [saldosBookmakersPorMoeda, setSaldosBookmakersPorMoeda] = useState<Array<{ moeda: string; saldo: number }>>([]);
  const [saldoBookmakers, setSaldoBookmakers] = useState(0); // Legacy: BRL total (para CaixaTabsContainer)
  const [saldosContasParceiros, setSaldosContasParceiros] = useState<Array<{ moeda: string; saldo: number }>>([]);
  const [saldoWalletsParceiros, setSaldoWalletsParceiros] = useState(0);
  const [loading, setLoading] = useState(true);
  const { canCreate } = useActionAccess();
  const { isOwnerOrAdmin, isSystemOwner } = usePermissions();
  
  // Estado para confirmação de saque
  const [saqueParaConfirmar, setSaqueParaConfirmar] = useState<any>(null);
  const [confirmSaqueDialogOpen, setConfirmSaqueDialogOpen] = useState(false);
  
  // Estado para ajuste manual
  const [ajusteDialogOpen, setAjusteDialogOpen] = useState(false);
  const [reconciliacaoDialogOpen, setReconciliacaoDialogOpen] = useState(false);
  const [caixaParceiroId, setCaixaParceiroId] = useState<string | null>(null);

  // Estado para pré-preenchimento do dialog de transação (vindo de navegação)
  const [dialogDefaultData, setDialogDefaultData] = useState<{
    tipoTransacao?: string;
    origemBookmakerId?: string;
    origemBookmakerNome?: string;
    destinoParceiroId?: string;
    destinoParceiroNome?: string;
    tipoMoeda?: "FIAT" | "CRYPTO";
    moeda?: string;
    coin?: string;
  } | null>(null);

  // Hook centralizado de cotações
  const cryptoSymbols = useMemo(() => saldosCrypto.map(s => s.coin), [saldosCrypto]);
  const { cotacaoUSD, cryptoPrices, getCryptoUSDValue, lastUpdate } = useCotacoes(cryptoSymbols);

  // Hook para transações pendentes - busca GLOBAL sem filtro de data
  const { data: pendingTransactions = [], refetch: refetchPending } = usePendingTransactions();
  const invalidatePending = useInvalidatePendingTransactions();

  // NOTA: Cotações NÃO devem disparar refetch de dados.
  // As cotações são usadas apenas para exibição de valores convertidos.
  // O fetchData só deve rodar quando: filtros mudam, nova transação criada, ou mount inicial.
  
  // Filters
  const [filtroTipo, setFiltroTipo] = useState<string[]>([]);
  const [filtroProjeto, setFiltroProjeto] = useState<string>("TODOS");
  const [filtroParceiro, setFiltroParceiro] = useState<string>("TODOS");
  const [dataInicio, setDataInicio] = useState<Date | undefined>(subDays(new Date(), 30));
  const [dataFim, setDataFim] = useState<Date | undefined>(new Date());
  
  // Data for displaying names
  const [parceiros, setParceiros] = useState<{ [key: string]: string }>({});
  const [contas, setContas] = useState<{ [key: string]: string }>({});
  const [contasBancarias, setContasBancarias] = useState<Array<{ id: string; banco: string; titular: string }>>([]);
  const [wallets, setWallets] = useState<{ [key: string]: string }>({});
  const [walletsDetalhes, setWalletsDetalhes] = useState<Array<{ id: string; exchange: string; endereco: string; network: string; parceiro_id: string }>>([]);
  const [bookmakers, setBookmakers] = useState<{ [key: string]: { nome: string; status: string; parceiro_id?: string; projeto_id?: string } }>({});
  const [operadoresMap, setOperadoresMap] = useState<{ [key: string]: string }>({});
  const [projetos, setProjetos] = useState<Array<{ id: string; nome: string }>>([]);
  const [despesasAdminGrupoMap, setDespesasAdminGrupoMap] = useState<{ [descricao: string]: { grupo: string; categoria: string } }>({});

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch transactions with date filter applied server-side
      // Use current filter dates or default to last 90 days for better coverage
      const queryStartDate = dataInicio 
        ? format(dataInicio, "yyyy-MM-dd")
        : format(subDays(new Date(), 90), "yyyy-MM-dd");
      const queryEndDate = dataFim 
        ? format(dataFim, "yyyy-MM-dd")
        : format(new Date(), "yyyy-MM-dd");
      
      // ARQUITETURA: Caixa Operacional só exibe transações de CASH REAL
      // Eventos promocionais (GIRO_GRATIS, BONUS_CREDITADO, etc.) são filtrados
      // para manter a visão pura de "dinheiro que entra e sai do sistema"
      // Motor Financeiro v11: Exclui status de duplicidade para evitar confusão visual
      // Busca principal: transações pela data_transacao no período
      const { data: transacoesData, error: transacoesError } = await supabase
        .from("cash_ledger")
        .select("*")
        .in("tipo_transacao", [...CASH_REAL_TYPES])
        .not("status", "in", "(DUPLICADO_CORRIGIDO,DUPLICADO_BLOQUEADO)")
        .gte("data_transacao", `${queryStartDate}T00:00:00.000Z`)
        .lte("data_transacao", `${queryEndDate}T23:59:59.999Z`)
        .order("data_transacao", { ascending: false });

      if (transacoesError) throw transacoesError;

      // Busca complementar: saques confirmados no período cujo pedido foi ANTES do período
      // Isso garante que saques recebidos apareçam na cronologia correta
      const { data: transacoesConfirmadas } = await supabase
        .from("cash_ledger")
        .select("*")
        .in("tipo_transacao", [...CASH_REAL_TYPES])
        .not("status", "in", "(DUPLICADO_CORRIGIDO,DUPLICADO_BLOQUEADO)")
        .lt("data_transacao", `${queryStartDate}T00:00:00.000Z`)
        .gte("data_confirmacao", `${queryStartDate}T00:00:00.000Z`)
        .lte("data_confirmacao", `${queryEndDate}T23:59:59.999Z`);

      // Merge e deduplicar
      const allIds = new Set((transacoesData || []).map((t: any) => t.id));
      const merged = [...(transacoesData || [])];
      for (const t of (transacoesConfirmadas || [])) {
        if (!allIds.has(t.id)) {
          merged.push(t);
        }
      }

      setTransacoes(merged);

      // Fetch reference data for names
      const { data: parceirosData } = await supabase
        .from("parceiros")
        .select("id, nome, is_caixa_operacional");
      
      // Identify the caixa operacional partner and filter it from regular partners
      const caixaParceiro = parceirosData?.find((p: any) => p.is_caixa_operacional === true);
      setCaixaParceiroId(caixaParceiro?.id || null);
      
      const { data: contasData } = await supabase
        .from("contas_bancarias")
        .select("id, banco, titular");
      
      const { data: walletsData } = await supabase
        .from("wallets_crypto")
        .select("id, exchange, endereco, network, parceiro_id");
      
      const { data: bookmakersData } = await supabase
        .from("bookmakers")
        .select("id, nome, status, parceiro_id, projeto_id");

      // Fetch operadores for operator payment traceability
      const { data: operadoresData } = await supabase
        .from("operadores")
        .select("id, nome");

      // Fetch projetos for project filter
      const { data: projetosData } = await supabase
        .from("projetos")
        .select("id, nome")
        .order("nome");

      // Create lookup maps (include caixa parceiro in map for label resolution, but filter from lists)
      const parceirosMap: { [key: string]: string } = {};
      parceirosData?.forEach((p: any) => parceirosMap[p.id] = p.nome);
      setParceiros(parceirosMap);

      const contasMap: { [key: string]: string } = {};
      contasData?.forEach(c => contasMap[c.id] = c.banco);
      setContas(contasMap);
      setContasBancarias(contasData || []);

      const walletsMap: { [key: string]: string } = {};
      walletsData?.forEach(w => walletsMap[w.id] = w.exchange?.replace(/-/g, ' ').toUpperCase() || 'WALLET');
      setWallets(walletsMap);
      setWalletsDetalhes(walletsData || []);

      const bookmakersMap: { [key: string]: { nome: string; status: string; parceiro_id?: string; projeto_id?: string } } = {};
      bookmakersData?.forEach(b => bookmakersMap[b.id] = { nome: b.nome, status: b.status, parceiro_id: b.parceiro_id ?? undefined, projeto_id: b.projeto_id ?? undefined });
      setBookmakers(bookmakersMap);

      setProjetos(projetosData || []);

      const operadoresLookup: { [key: string]: string } = {};
      operadoresData?.forEach(op => operadoresLookup[op.id] = op.nome);
      setOperadoresMap(operadoresLookup);

      // Fetch despesas administrativas grupo para lookup no histórico
      const { data: despAdminData } = await supabase
        .from("despesas_administrativas")
        .select("id, grupo, descricao, categoria, valor, data_despesa");
      const despAdminMap: { [key: string]: { grupo: string; categoria: string } } = {};
      despAdminData?.forEach(d => {
        const grupo = d.grupo || "OUTROS";
        const categoria = d.categoria || "";
        // Key by description
        if (d.descricao) {
          despAdminMap[d.descricao.trim().toLowerCase()] = { grupo, categoria };
        }
        // Key by valor+data composite for legacy records without category in description
        if (d.valor && d.data_despesa) {
          despAdminMap[`${d.valor}_${d.data_despesa}`] = { grupo, categoria };
        }
      });
      setDespesasAdminGrupoMap(despAdminMap);

      // Fetch FIAT balances = soma das contas bancárias da Caixa Operacional
      // Usa v_saldo_parceiro_contas (que filtra por moeda da conta) para garantir
      // paridade exata com os saldos exibidos em "Contas da Empresa"
      if (caixaParceiro?.id) {
        const { data: contasSaldoData, error: fiatError } = await supabase
          .from("v_saldo_parceiro_contas")
          .select("moeda, saldo")
          .eq("parceiro_id", caixaParceiro.id);

        if (fiatError) throw fiatError;

        // Agrupar por moeda (pode ter múltiplas contas na mesma moeda)
        const fiatMap: Record<string, number> = {};
        (contasSaldoData || []).forEach((row: any) => {
          const m = row.moeda || "BRL";
          fiatMap[m] = (fiatMap[m] || 0) + Math.max(0, row.saldo || 0);
        });
        setSaldosFiat(Object.entries(fiatMap).map(([moeda, saldo]) => ({ moeda, saldo })));
      } else {
        setSaldosFiat([]);
      }

      // Fetch CRYPTO balances from wallets linked to Caixa Operacional partner
      if (caixaParceiro?.id) {
        const { data: walletsSaldoData, error: cryptoError } = await supabase
          .from("v_saldo_parceiro_wallets")
          .select("coin, saldo_coin, saldo_usd")
          .eq("parceiro_id", caixaParceiro.id);

        if (cryptoError) throw cryptoError;

        // Agrupar por coin (pode ter múltiplas wallets com a mesma coin)
        const cryptoMap: Record<string, { saldo_coin: number; saldo_usd: number }> = {};
        (walletsSaldoData || []).forEach((row: any) => {
          const c = row.coin || "USDT";
          if (!cryptoMap[c]) cryptoMap[c] = { saldo_coin: 0, saldo_usd: 0 };
          cryptoMap[c].saldo_coin += Math.max(0, row.saldo_coin || 0);
          cryptoMap[c].saldo_usd += Math.max(0, row.saldo_usd || 0);
        });
        setSaldosCrypto(Object.entries(cryptoMap).map(([coin, vals]) => ({ 
          coin, 
          saldo_coin: vals.saldo_coin, 
          saldo_usd: vals.saldo_usd 
        })));
      } else {
        setSaldosCrypto([]);
      }

      // Fetch total bookmaker balance - agregar por moeda
      // Inclui status 'ativo' e 'limitada' (casas com saldo mas operacionalmente limitadas)
      // FIX: Incluir AGUARDANDO_SAQUE - essas casas ainda têm saldo real
      const { data: bookmakersBalanceData } = await supabase
        .from("bookmakers")
        .select("saldo_atual, moeda")
        .in("status", ["ativo", "limitada", "AGUARDANDO_SAQUE"]);
      
      // Agregar saldos por moeda
      const saldosPorMoeda: Record<string, number> = {};
      bookmakersBalanceData?.forEach(b => {
        const moeda = b.moeda || 'BRL';
        saldosPorMoeda[moeda] = (saldosPorMoeda[moeda] || 0) + Math.max(0, b.saldo_atual || 0);
      });
      
      // Converter para array
      const saldosArray = Object.entries(saldosPorMoeda)
        .filter(([_, saldo]) => saldo !== 0)
        .map(([moeda, saldo]) => ({ moeda, saldo }));
      
      setSaldosBookmakersPorMoeda(saldosArray);
      
      // Legacy: manter compatibilidade com saldoBookmakers (BRL total para CaixaTabsContainer)
      setSaldoBookmakers(saldosPorMoeda['BRL'] || 0);

      // Fetch partner bank accounts balance BY CURRENCY (EXCLUDING caixa operacional to avoid double-counting)
      // FIX: Agrupar por moeda ao invés de somar cegamente BRL + USD + EUR
      const contasQuery = supabase
        .from("v_saldo_parceiro_contas")
        .select("moeda, saldo");
      if (caixaParceiro?.id) {
        contasQuery.neq("parceiro_id", caixaParceiro.id);
      }
      const { data: contasSaldoData } = await contasQuery;
      
      const contasPorMoeda: Record<string, number> = {};
      (contasSaldoData || []).forEach((row: any) => {
        const m = row.moeda || "BRL";
        contasPorMoeda[m] = (contasPorMoeda[m] || 0) + Math.max(0, row.saldo || 0);
      });
      setSaldosContasParceiros(
        Object.entries(contasPorMoeda)
          .filter(([_, saldo]) => saldo !== 0)
          .map(([moeda, saldo]) => ({ moeda, saldo }))
      );

      // Fetch partner wallets balance in USD (EXCLUDING caixa operacional to avoid double-counting)
      const walletsQuery = supabase
        .from("v_saldo_parceiro_wallets")
        .select("saldo_usd");
      if (caixaParceiro?.id) {
        walletsQuery.neq("parceiro_id", caixaParceiro.id);
      }
      const { data: walletsSaldoData } = await walletsQuery;
      
      const totalWallets = walletsSaldoData?.reduce((sum, w) => sum + Math.max(0, w.saldo_usd || 0), 0) || 0;
      setSaldoWalletsParceiros(totalWallets);

    } catch (error: any) {
      console.error("Erro ao carregar dados:", error);
      toast({
        title: "Erro ao carregar dados",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // SEGURANÇA: workspaceId como dependência garante refetch na troca de tenant
  useEffect(() => {
    if (workspaceId) {
      fetchData();
    }
  }, [dataInicio, dataFim, workspaceId]);

  // Listener para evento global de troca de workspace
  // O refetch é garantido pelo useEffect com workspaceId como dependência.
  // NÃO resetar estados aqui para evitar race condition onde o reset
  // ocorre APÓS o fetchData já ter completado com dados válidos.
  useWorkspaceChangeListener(useCallback(() => {
    console.log("[Caixa] Workspace changed - refetch will be triggered by workspaceId dependency");
  }, []));

  // Listener para evento de mudança de dados do Caixa (reatividade pós-transação)
  // Dispara refetch quando qualquer componente cria/atualiza transações
  useEffect(() => {
    const handleCaixaDataChanged = () => {
      console.log("[Caixa] Data changed event received - refetching data");
      fetchData();
      refetchPending();
    };

    window.addEventListener(CAIXA_DATA_CHANGED_EVENT, handleCaixaDataChanged);
    return () => {
      window.removeEventListener(CAIXA_DATA_CHANGED_EVENT, handleCaixaDataChanged);
    };
  }, [fetchData, refetchPending]);

  // Handle navigation state to open dialog
  useEffect(() => {
    if (locationState?.openDialog) {
      // Se veio com dados de bookmaker/parceiro, pré-preencher o dialog como SAQUE
      if (locationState.bookmakerId) {
        setDialogDefaultData({
          tipoTransacao: "SAQUE",
          origemBookmakerId: locationState.bookmakerId,
          origemBookmakerNome: locationState.bookmakerNome,
          destinoParceiroId: locationState.parceiroId,
          destinoParceiroNome: locationState.parceiroNome,
          tipoMoeda: locationState.tipoMoeda,
          moeda: locationState.moeda,
          coin: locationState.coin,
        });
      }
      setDialogOpen(true);
      // Clear state to prevent reopening on refresh
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [locationState]);
  const getTotalCryptoUSD = () => {
    return saldosCrypto.reduce((acc, s) => {
      return acc + getCryptoUSDValue(s.coin, s.saldo_coin, s.saldo_usd);
    }, 0);
  };

  const getTransacoesFiltradas = () => {
    return transacoes.filter((t) => {
      // Ocultar tipos internos/reconciliação do histórico (não são operações principais)
      const HIDDEN_TYPES = ['GANHO_CAMBIAL', 'PERDA_CAMBIAL', 'AJUSTE_RECONCILIACAO', 'AJUSTE_SALDO', 'AJUSTE_MANUAL', 'CONCILIACAO'];
      if (HIDDEN_TYPES.includes(t.tipo_transacao)) {
        return false;
      }
      // Ocultar transações canceladas
      if (t.status === 'CANCELADO') {
        return false;
      }
      
      // Data efetiva: para saques confirmados, usar data_confirmacao como referência cronológica
      const dataEfetiva = t.data_confirmacao 
        ? parseLocalDateTime(t.data_confirmacao) 
        : parseLocalDateTime(t.data_transacao);
      const matchDataInicio = !dataInicio || dataEfetiva >= startOfDay(dataInicio);
      const matchDataFim = !dataFim || dataEfetiva <= endOfDay(dataFim);
      
      // Include both APORTE and LIQUIDACAO when filter is APORTE_FINANCEIRO
      const knownTypes = ["TRANSFERENCIA", "DEPOSITO", "SAQUE", "APORTE_FINANCEIRO", "SWAP"];
      const matchTipo = filtroTipo.length === 0 || 
        filtroTipo.some(f => 
          (f === "APORTE_FINANCEIRO" && t.tipo_transacao === "APORTE_FINANCEIRO") ||
          (f === "SWAP" && (t.tipo_transacao === "SWAP_OUT" || t.tipo_transacao === "SWAP_IN")) ||
          (f === "OUTROS" && !knownTypes.includes(t.tipo_transacao) && t.tipo_transacao !== "SWAP_OUT" && t.tipo_transacao !== "SWAP_IN") ||
          t.tipo_transacao === f
        );
      
      // Filtro por projeto usando projeto_id_snapshot (imutável, gravado no momento da transação)
      // MODELO: Atribuição temporal - cada transação pertence ao projeto que era dono no momento
      let matchProjeto = true;
      if (filtroProjeto !== "TODOS") {
        // Usar o snapshot imutável ao invés de inferir do vínculo atual
        const projetoSnapshot = t.projeto_id_snapshot;
        
        if (filtroProjeto === "SEM_PROJETO") {
          // Transações órfãs (sem projeto no momento da transação)
          matchProjeto = !projetoSnapshot;
        } else {
          // Transações do projeto específico
          matchProjeto = projetoSnapshot === filtroProjeto;
        }
      }
      
      // Filtro por parceiro via bookmaker/wallet/conta origem/destino
      let matchParceiro = true;
      if (filtroParceiro !== "TODOS") {
        // Buscar parceiro via bookmaker
        const origemParceiroViaBm = t.origem_bookmaker_id ? bookmakers[t.origem_bookmaker_id]?.parceiro_id : null;
        const destinoParceiroViaBm = t.destino_bookmaker_id ? bookmakers[t.destino_bookmaker_id]?.parceiro_id : null;
        
        // Buscar parceiro via wallet
        const origemParceiroViaWallet = t.origem_wallet_id ? walletsDetalhes.find(w => w.id === t.origem_wallet_id)?.parceiro_id : null;
        const destinoParceiroViaWallet = t.destino_wallet_id ? walletsDetalhes.find(w => w.id === t.destino_wallet_id)?.parceiro_id : null;
        
        // Parceiro direto
        const origemParceiroDireto = t.origem_parceiro_id;
        const destinoParceiroDireto = t.destino_parceiro_id;
        
        // Verificar se alguma das origens/destinos pertence ao parceiro selecionado
        matchParceiro = 
          origemParceiroViaBm === filtroParceiro ||
          destinoParceiroViaBm === filtroParceiro ||
          origemParceiroViaWallet === filtroParceiro ||
          destinoParceiroViaWallet === filtroParceiro ||
          origemParceiroDireto === filtroParceiro ||
          destinoParceiroDireto === filtroParceiro;
      }
      
      return matchTipo && matchDataInicio && matchDataFim && matchProjeto && matchParceiro;
    }).sort((a, b) => {
      // Ordenar pela data civil (YYYY-MM-DD), depois por created_at como desempate
      // CORREÇÃO: Usar extractCivilDateKey em vez de parseLocalDateTime para datas civis
      // parseLocalDateTime aplica offset -3h, fazendo datas civis (meia-noite UTC) 
      // parecerem do dia anterior, quebrando a ordenação relativa
      const dateKeyA = a.data_confirmacao 
        ? extractCivilDateKey(a.data_confirmacao) 
        : extractCivilDateKey(a.data_transacao);
      const dateKeyB = b.data_confirmacao 
        ? extractCivilDateKey(b.data_confirmacao) 
        : extractCivilDateKey(b.data_transacao);
      
      // Comparar datas como strings (YYYY-MM-DD é lexicograficamente ordenável)
      if (dateKeyA !== dateKeyB) {
        return dateKeyB.localeCompare(dateKeyA); // Mais recente primeiro
      }
      
      // Mesmo dia: ordenar por created_at (timestamp real de inserção)
      const createdA = new Date(a.created_at).getTime();
      const createdB = new Date(b.created_at).getTime();
      return createdB - createdA; // Mais recente primeiro
    });
  };


  const getTipoLabel = (tipo: string, transacao?: Transacao) => {
    // Para APORTE_FINANCEIRO, determinamos se é Aporte ou Liquidação pela direção
    if (tipo === "APORTE_FINANCEIRO" && transacao) {
      // Se destino é CAIXA_OPERACIONAL → é Aporte (Investidor → Caixa)
      if (transacao.destino_tipo === "CAIXA_OPERACIONAL") {
        const base = "Aporte";
        return transacao.status === "CANCELADO" ? `${base} Cancelado` : base;
      }
      // Se origem é CAIXA_OPERACIONAL → é Liquidação (Caixa → Investidor)
      if (transacao.origem_tipo === "CAIXA_OPERACIONAL") {
        const base = "Liquidação";
        return transacao.status === "CANCELADO" ? `${base} Cancelada` : base;
      }
    }
    
    const labels: { [key: string]: string } = {
      APORTE: "Aporte",
      LIQUIDACAO: "Liquidação",
      TRANSFERENCIA: "Transferência",
      DEPOSITO: "Depósito",
      SAQUE: "Saque",
      PAGTO_PARCEIRO: "Pagto. Parceiro",
      PAGTO_FORNECEDOR: "Pagto. Fornecedor",
      COMISSAO_INDICADOR: "Comissão Indicador",
      BONUS_INDICADOR: "Bônus Indicador",
      DESPESA_ADMINISTRATIVA: "Despesa Admin.",
      PAGTO_OPERADOR: "Pagto. Operador",
      AJUSTE_MANUAL: "Ajuste Manual",
      AJUSTE_SALDO: "Ajuste Saldo",
      AJUSTE_RECONCILIACAO: "Reconciliação",
      RENOVACAO_PARCERIA: "Renovação Parceria",
      BONIFICACAO_ESTRATEGICA: "Bonif. Estratégica",
      ESTORNO_COMISSAO_INDICADOR: "Estorno Comissão",
      SWAP_OUT: "Swap (Saída)",
      SWAP_IN: "Swap (Entrada)",
    };
    const base = labels[tipo] || tipo;
    
    // Append "Cancelado/a" for cancelled transactions
    if (transacao?.status === "CANCELADO") {
      const femininos = ["TRANSFERENCIA", "LIQUIDACAO", "BONIFICACAO_ESTRATEGICA", "DESPESA_ADMINISTRATIVA", "RENOVACAO_PARCERIA"];
      return `${base} ${femininos.includes(tipo) ? "Cancelada" : "Cancelado"}`;
    }
    
    return base;
  };

  const getTipoColor = (tipo: string, transacao?: Transacao) => {
    // Cancelled transactions always get a distinct muted/red style
    if (transacao?.status === "CANCELADO") {
      return "bg-red-500/10 text-red-400/70 border-red-500/20 line-through";
    }
    
    // Para APORTE_FINANCEIRO, determinamos a cor pela direção
    if (tipo === "APORTE_FINANCEIRO" && transacao) {
      if (transacao.destino_tipo === "CAIXA_OPERACIONAL") {
        return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      }
      if (transacao.origem_tipo === "CAIXA_OPERACIONAL") {
        return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      }
    }
    
    const colors: { [key: string]: string } = {
      APORTE: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      LIQUIDACAO: "bg-amber-500/20 text-amber-400 border-amber-500/30",
      TRANSFERENCIA: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      DEPOSITO: "bg-amber-500/20 text-amber-400 border-amber-500/30",
      SAQUE: "bg-purple-500/20 text-purple-400 border-purple-500/30",
      PAGTO_PARCEIRO: "bg-orange-500/20 text-orange-400 border-orange-500/30",
      PAGTO_FORNECEDOR: "bg-orange-500/20 text-orange-400 border-orange-500/30",
      COMISSAO_INDICADOR: "bg-pink-500/20 text-pink-400 border-pink-500/30",
      BONUS_INDICADOR: "bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30",
      DESPESA_ADMINISTRATIVA: "bg-red-500/20 text-red-400 border-red-500/30",
      PAGTO_OPERADOR: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
      AJUSTE_MANUAL: "bg-amber-600/20 text-amber-500 border-amber-600/30",
      AJUSTE_SALDO: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      AJUSTE_RECONCILIACAO: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
      RENOVACAO_PARCERIA: "bg-teal-500/20 text-teal-400 border-teal-500/30",
      BONIFICACAO_ESTRATEGICA: "bg-violet-500/20 text-violet-400 border-violet-500/30",
      ESTORNO_COMISSAO_INDICADOR: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      SWAP_OUT: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
      SWAP_IN: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    };
    return colors[tipo] || "bg-muted text-muted-foreground";
  };

  const formatCurrency = (value: number, currency: string) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency,
    }).format(value);
  };

  const getOrigemLabel = (transacao: Transacao): string => {
    const info = getOrigemInfo(transacao);
    return info.primary;
  };

  const getOrigemInfo = (transacao: Transacao): { primary: string; secondary?: string } => {
    // Para APORTE_FINANCEIRO, verificamos o fluxo pela direção
    if (transacao.tipo_transacao === "APORTE_FINANCEIRO") {
      // Se destino é CAIXA_OPERACIONAL, é um aporte (Investidor → Caixa)
      if (transacao.destino_tipo === "CAIXA_OPERACIONAL") {
        return { primary: transacao.nome_investidor || "Investidor Externo" };
      }
      // Se origem é CAIXA_OPERACIONAL, é uma liquidação (Caixa → Investidor)
      if (transacao.origem_tipo === "CAIXA_OPERACIONAL") {
        return { primary: "Caixa Operacional" };
      }
    }
    
    if (transacao.tipo_transacao === "APORTE") {
      return { primary: transacao.nome_investidor || "Investidor Externo" };
    }
    
    if (transacao.tipo_transacao === "LIQUIDACAO") {
      return { primary: "Caixa Operacional" };
    }
    
    // AJUSTE_SALDO: origem é a bookmaker ajustada
    if (transacao.tipo_transacao === "AJUSTE_SALDO" && transacao.origem_bookmaker_id) {
      const bookmaker = bookmakers[transacao.origem_bookmaker_id];
      const parceiroNome = bookmaker?.parceiro_id ? parceiros[bookmaker.parceiro_id] : undefined;
      return { 
        primary: bookmaker?.nome || "Bookmaker",
        secondary: parceiroNome
      };
    }
    
    if (transacao.origem_tipo === "CAIXA_OPERACIONAL") {
      return { primary: "Caixa Operacional" };
    }
    
    if (transacao.origem_tipo === "PARCEIRO_CONTA" && transacao.origem_conta_bancaria_id) {
      const conta = contasBancarias.find(c => c.id === transacao.origem_conta_bancaria_id);
      if (conta) {
        return { primary: conta.banco, secondary: conta.titular };
      }
      return { primary: "Conta Bancária" };
    }
    
    if (transacao.origem_tipo === "PARCEIRO_WALLET" && transacao.origem_wallet_id) {
      const wallet = walletsDetalhes.find(w => w.id === transacao.origem_wallet_id);
      if (wallet) {
        const parceiroNome = wallet.parceiro_id ? parceiros[wallet.parceiro_id] : undefined;
        return { 
          primary: wallet.exchange?.replace(/-/g, ' ').toUpperCase() || 'WALLET',
          secondary: parceiroNome
        };
      }
      return { primary: wallets[transacao.origem_wallet_id] || "Wallet" };
    }
    
    if (transacao.origem_tipo === "BOOKMAKER" && transacao.origem_bookmaker_id) {
      const bookmaker = bookmakers[transacao.origem_bookmaker_id];
      const parceiroNome = bookmaker?.parceiro_id ? parceiros[bookmaker.parceiro_id] : undefined;
      return { 
        primary: bookmaker?.nome || "Bookmaker",
        secondary: parceiroNome
      };
    }
    
    return { primary: "Origem" };
  };

  const getDestinoLabel = (transacao: Transacao): string => {
    const info = getDestinoInfo(transacao);
    return info.primary;
  };

  const getDestinoInfo = (transacao: Transacao): { primary: string; secondary?: string; badgeLabel?: string; badgeColor?: string; BadgeIcon?: any } => {
    // Para APORTE_FINANCEIRO, verificamos o fluxo pela direção
    if (transacao.tipo_transacao === "APORTE_FINANCEIRO") {
      // Se destino é CAIXA_OPERACIONAL, é um aporte (Investidor → Caixa)
      if (transacao.destino_tipo === "CAIXA_OPERACIONAL") {
        return { primary: "Caixa Operacional" };
      }
      // Se origem é CAIXA_OPERACIONAL, é uma liquidação (Caixa → Investidor)
      if (transacao.origem_tipo === "CAIXA_OPERACIONAL") {
        return { primary: transacao.nome_investidor || "Investidor Externo" };
      }
    }
    
    if (transacao.tipo_transacao === "APORTE") {
      return { primary: "Caixa Operacional" };
    }
    
    if (transacao.tipo_transacao === "LIQUIDACAO") {
      return { primary: transacao.nome_investidor || "Investidor Externo" };
    }
    
    if (transacao.destino_tipo === "CAIXA_OPERACIONAL") {
      return { primary: "Caixa Operacional" };
    }
    
    if (transacao.destino_tipo === "PARCEIRO_CONTA" && transacao.destino_conta_bancaria_id) {
      const conta = contasBancarias.find(c => c.id === transacao.destino_conta_bancaria_id);
      if (conta) {
        return { primary: conta.banco, secondary: conta.titular };
      }
      return { primary: "Conta Bancária" };
    }
    
    if (transacao.destino_tipo === "PARCEIRO_WALLET" && transacao.destino_wallet_id) {
      const wallet = walletsDetalhes.find(w => w.id === transacao.destino_wallet_id);
      if (wallet) {
        const parceiroNome = wallet.parceiro_id ? parceiros[wallet.parceiro_id] : undefined;
        return { 
          primary: wallet.exchange?.replace(/-/g, ' ').toUpperCase() || 'WALLET',
          secondary: parceiroNome
        };
      }
      return { primary: wallets[transacao.destino_wallet_id] || "Wallet" };
    }
    
    if (transacao.destino_tipo === "BOOKMAKER" && transacao.destino_bookmaker_id) {
      const bookmaker = bookmakers[transacao.destino_bookmaker_id];
      const parceiroNome = bookmaker?.parceiro_id ? parceiros[bookmaker.parceiro_id] : undefined;
      return { 
        primary: bookmaker?.nome || "Bookmaker",
        secondary: parceiroNome
      };
    }
    
    // Pagamentos para parceiros, indicadores, operadores
    if (transacao.destino_tipo === "PARCEIRO") {
      if (transacao.destino_parceiro_id && parceiros[transacao.destino_parceiro_id]) {
        return { 
          primary: "Parceiro", 
          secondary: parceiros[transacao.destino_parceiro_id] 
        };
      }
      // Fallback: extrair nome do parceiro da descrição
      const match = transacao.descricao?.match(/parceiro\s+(.+)/i);
      if (match) {
        return { 
          primary: "Parceiro", 
          secondary: match[1].trim() 
        };
      }
      return { primary: "Parceiro" };
    }
    
    if (transacao.destino_tipo === "INDICADOR") {
      // Extrair nome do indicador da descrição
      const match = transacao.descricao?.match(/indicação\s+(?:de\s+)?(.+)/i);
      if (match) {
        return { primary: match[1].trim() };
      }
      return { primary: transacao.descricao?.split(" - ")[0] || "Indicador" };
    }
    
    if (transacao.destino_tipo === "OPERADOR") {
      // Usar operador_id diretamente para rastreabilidade
      if (transacao.operador_id && operadoresMap[transacao.operador_id]) {
        return { primary: operadoresMap[transacao.operador_id] };
      }
      // Fallback para descrição (registros antigos)
      return { primary: transacao.descricao?.split(" - ")[0] || "Operador" };
    }
    
    // Fallback: tentar extrair nome da descrição para transações com descrição formatada
    if (transacao.descricao) {
      // "Pagamento ao parceiro NOME" ou "Comissão por indicação de NOME"
      const parceiroMatch = transacao.descricao.match(/parceiro\s+(.+)/i);
      if (parceiroMatch) {
        return { primary: parceiroMatch[1].trim() };
      }
      const indicadorMatch = transacao.descricao.match(/indicação\s+(?:de\s+)?(.+)/i);
      if (indicadorMatch) {
        return { primary: indicadorMatch[1].trim() };
      }
    }
    
    // AJUSTE_SALDO: destino é "Conciliação" com motivo
    if (transacao.tipo_transacao === "AJUSTE_SALDO") {
      const motivo = transacao.ajuste_motivo;
      return { 
        primary: transacao.ajuste_direcao === "SAIDA" ? "Saída (Conciliação)" : "Entrada (Conciliação)",
        secondary: motivo || undefined
      };
    }
    
    // Despesas administrativas - mostrar grupo/finalidade com badge
    if (transacao.tipo_transacao === "DESPESA_ADMINISTRATIVA") {
      // Extrair categoria e detalhe: "Despesa administrativa - CATEGORIA: detalhe" ou "Despesa administrativa - : detalhe" (legacy)
      const catMatch = transacao.descricao?.match(/^Despesa administrativa\s*(?:\(?\s*confirmada\s*\)?\s*)?-\s*([^:]*?)(?::\s*(.+))?$/i);
      const categoriaRaw = catMatch?.[1]?.trim() || "";
      const detalhe = catMatch?.[2]?.trim() || "";
      
      // 0. Prioridade máxima: auditoria_metadata.grupo (registros novos)
      const meta = transacao.auditoria_metadata as any;
      let grupoKey = meta?.grupo || "";
      
      // 1. Tentar resolver grupo pela categoria extraída da descrição (ex: "Recursos Humanos")
      if (!grupoKey && categoriaRaw) {
        grupoKey = getGrupoFromCategoria(categoriaRaw);
      }
      if (!grupoKey) grupoKey = "OUTROS";
      
      // 2. Fallback: buscar grupo pela descrição no mapa de despesas administrativas
      if (grupoKey === "OUTROS" && detalhe) {
        const lookupKey = detalhe.trim().toLowerCase();
        if (despesasAdminGrupoMap[lookupKey]) {
          grupoKey = despesasAdminGrupoMap[lookupKey].grupo;
        }
      }
      
      // 3. Fallback: buscar por valor+data (registros legados sem categoria na descrição)
      if (grupoKey === "OUTROS" && transacao.valor && transacao.data_transacao) {
        const compositeKey = `${transacao.valor}_${transacao.data_transacao}`;
        if (despesasAdminGrupoMap[compositeKey]) {
          grupoKey = despesasAdminGrupoMap[compositeKey].grupo;
        }
      }
      
      
      const grupoInfo = getGrupoInfo(grupoKey);
      
      // Show operator name when linked (HR payments)
      const operadorNome = meta?.operador_nome || 
        (transacao.operador_id && operadoresMap[transacao.operador_id]) || null;
      
      return { 
        primary: operadorNome || detalhe || "Despesa",
        secondary: operadorNome ? (detalhe || undefined) : undefined,
        badgeLabel: grupoInfo.label,
        badgeColor: grupoInfo.color,
        BadgeIcon: grupoInfo.icon,
      };
    }

    // Outros sem destino definido
    if (!transacao.destino_tipo) {
      return { primary: "Despesa Externa" };
    }
    
    return { primary: "Destino" };
  };

  // Inject title into global TopBar
  useEffect(() => {
    setTopBarContent(
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 cursor-default">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <Wallet className="h-4 w-4 text-primary" />
            </div>
            <span className="font-semibold text-sm">Caixa Operacional</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Gestão centralizada de movimentações financeiras
        </TooltipContent>
      </Tooltip>
    );
    return () => setTopBarContent(null);
  }, [setTopBarContent]);

  return (
    <div className="flex flex-col min-h-0 h-full">
      {/* Actions bar */}
      <div className="flex-shrink-0 px-6 pt-3 pb-2 flex items-center justify-end gap-2">
        <SaldosParceirosSheet />
        {canCreate('caixa', 'caixa.transactions.create') && (
          <Button onClick={() => setDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova Transação
          </Button>
        )}
        {(isOwnerOrAdmin || isSystemOwner) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Mais ações</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-popover">
              <DropdownMenuSeparator />
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuItem 
                    onClick={() => setAjusteDialogOpen(true)}
                    className="flex items-center gap-2 text-muted-foreground cursor-pointer"
                  >
                    <Wrench className="h-4 w-4" />
                    <span>Ajuste Manual</span>
                    <HelpCircle className="h-3 w-3 ml-auto opacity-50" />
                  </DropdownMenuItem>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-[280px] text-xs space-y-1.5 p-3">
                  <p className="font-semibold">Use quando souber o valor e o motivo</p>
                  <p className="text-muted-foreground">Ex: "A bookmaker cobrou R$15 de taxa que não registrei" → Ajuste de -15</p>
                  <p className="text-muted-foreground">Ex: "Recebi R$50 de cashback que esqueci de lançar" → Ajuste de +50</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuItem 
                    onClick={() => setReconciliacaoDialogOpen(true)}
                    className="flex items-center gap-2 text-muted-foreground cursor-pointer"
                  >
                    <TrendingUp className="h-4 w-4" />
                    <span>Reconciliação de Saldo</span>
                    <HelpCircle className="h-3 w-3 ml-auto opacity-50" />
                  </DropdownMenuItem>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-[280px] text-xs space-y-1.5 p-3">
                  <p className="font-semibold">Use quando souber apenas o saldo real</p>
                  <p className="text-muted-foreground">Ex: "O sistema diz R$1.200, mas na conta real tem R$1.350. Não sei por quê."</p>
                  <p className="text-muted-foreground">Você informa o saldo real e o sistema calcula o ajuste automaticamente. Uso raro — é um "ponto zero".</p>
                </TooltipContent>
              </Tooltip>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* PageContent - ÚNICO scroll vertical */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-6 pb-6 space-y-6">
          {/* KPI Cards */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 max-w-[960px]">
            {/* Saldos FIAT - Interactive Card */}
            <SaldosFiatCard
              caixaParceiroId={caixaParceiroId}
              formatCurrency={formatCurrency}
              onDataChanged={fetchData}
            />

            {/* Exposição Crypto - Interactive Card */}
            <ExposicaoCryptoCard
              caixaParceiroId={caixaParceiroId}
              cryptoPrices={cryptoPrices}
              getCryptoUSDValue={getCryptoUSDValue}
              formatCurrency={formatCurrency}
              onDataChanged={fetchData}
            />
          </div>

          {/* Posição de Capital */}
          <PosicaoCapital
            saldosFiat={saldosFiat}
            saldoCaixaCrypto={getTotalCryptoUSD()}
            saldosBookmakers={saldosBookmakersPorMoeda}
            saldosContasParceiros={saldosContasParceiros}
            saldoWalletsParceiros={saldoWalletsParceiros}
            cotacaoUSD={cotacaoUSD}
          />

          {/* Container com Abas */}
          <CaixaTabsContainer
            transacoes={transacoes}
            pendingTransactions={pendingTransactions}
            parceiros={parceiros}
            contas={contas}
            contasBancarias={contasBancarias}
            wallets={wallets}
            walletsDetalhes={walletsDetalhes}
            bookmakers={bookmakers}
            loading={loading}
            filtroTipo={filtroTipo}
            setFiltroTipo={setFiltroTipo}
            filtroProjeto={filtroProjeto}
            setFiltroProjeto={setFiltroProjeto}
            filtroParceiro={filtroParceiro}
            setFiltroParceiro={setFiltroParceiro}
            projetos={projetos}
            parceirosLista={Object.entries(parceiros).filter(([id]) => id !== caixaParceiroId).map(([id, nome]) => ({ id, nome }))}
            dataInicio={dataInicio}
            setDataInicio={setDataInicio}
            dataFim={dataFim}
            setDataFim={setDataFim}
            getTransacoesFiltradas={getTransacoesFiltradas}
            getTipoLabel={getTipoLabel}
            getTipoColor={getTipoColor}
            getOrigemLabel={getOrigemLabel}
            getDestinoLabel={getDestinoLabel}
            getOrigemInfo={getOrigemInfo}
            getDestinoInfo={getDestinoInfo}
            formatCurrency={formatCurrency}
            onConfirmarSaque={(transacao) => {
              setSaqueParaConfirmar(transacao);
              setConfirmSaqueDialogOpen(true);
            }}
            saldoBookmakers={saldoBookmakers}
            onRefresh={async () => {
              await fetchData();
              refetchPending();
            }}
            initialTab={initialTab}
          />
        </div>
      </div>

      {/* Dialog Nova Transação */}
      <CaixaTransacaoDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setDialogDefaultData(null);
        }}
        onSuccess={async () => {
          setDialogOpen(false);
          setDialogDefaultData(null);
          await new Promise(resolve => setTimeout(resolve, 600));
          await fetchData();
        }}
        defaultTipoTransacao={dialogDefaultData?.tipoTransacao}
        defaultOrigemBookmakerId={dialogDefaultData?.origemBookmakerId}
        defaultDestinoParceiroId={dialogDefaultData?.destinoParceiroId}
        defaultTipoMoeda={dialogDefaultData?.tipoMoeda}
        defaultMoeda={dialogDefaultData?.moeda}
        defaultCoin={dialogDefaultData?.coin}
      />

      {/* Dialog Confirmar Saque */}
      <ConfirmarSaqueDialog
        open={confirmSaqueDialogOpen}
        onClose={() => {
          setConfirmSaqueDialogOpen(false);
          setSaqueParaConfirmar(null);
        }}
        onSuccess={async () => {
          await new Promise(resolve => setTimeout(resolve, 600));
          await fetchData();
        }}
        saque={saqueParaConfirmar ? (() => {
          const walletDetail = saqueParaConfirmar.destino_wallet_id
            ? walletsDetalhes.find(w => w.id === saqueParaConfirmar.destino_wallet_id)
            : null;
          const walletLabel = walletDetail
            ? `${(walletDetail.exchange || "WALLET").replace(/-/g, " ").toUpperCase()}${walletDetail.network ? ` (${walletDetail.network})` : ""}`
            : undefined;
          return {
            id: saqueParaConfirmar.id,
            valor: saqueParaConfirmar.valor,
            moeda: saqueParaConfirmar.moeda,
            data_transacao: saqueParaConfirmar.data_transacao,
            descricao: saqueParaConfirmar.descricao,
            origem_bookmaker_id: saqueParaConfirmar.origem_bookmaker_id,
            destino_parceiro_id: saqueParaConfirmar.destino_parceiro_id,
            destino_conta_bancaria_id: saqueParaConfirmar.destino_conta_bancaria_id,
            destino_wallet_id: saqueParaConfirmar.destino_wallet_id || null,
            bookmaker_nome: bookmakers[saqueParaConfirmar.origem_bookmaker_id]?.nome,
            parceiro_nome: parceiros[saqueParaConfirmar.destino_parceiro_id],
            banco_nome: saqueParaConfirmar.destino_conta_bancaria_id 
              ? contasBancarias.find(c => c.id === saqueParaConfirmar.destino_conta_bancaria_id)?.banco 
              : undefined,
            wallet_nome: saqueParaConfirmar.wallet_nome || walletLabel,
            // Campos cripto
            coin: saqueParaConfirmar.coin || undefined,
            qtd_coin: saqueParaConfirmar.qtd_coin || undefined,
            cotacao_original: saqueParaConfirmar.cotacao || undefined,
            moeda_origem: saqueParaConfirmar.moeda_origem || undefined,
            valor_origem: saqueParaConfirmar.valor_origem || undefined,
            moeda_destino: saqueParaConfirmar.moeda_destino || undefined,
            valor_destino: saqueParaConfirmar.valor_destino || undefined,
            cotacao: saqueParaConfirmar.cotacao || undefined,
            // Dados da wallet
            wallet_network: walletDetail?.network || undefined,
            wallet_exchange: walletDetail?.exchange?.replace(/-/g, " ").toUpperCase() || undefined,
            // Snapshot do projeto para rastreabilidade FX
            projeto_id_snapshot: saqueParaConfirmar.projeto_id_snapshot || null,
          };
        })() : null}
      />

      {/* Dialog Ajuste Manual */}
      <AjusteManualDialog
        open={ajusteDialogOpen}
        onClose={() => setAjusteDialogOpen(false)}
        onSuccess={async () => {
          setAjusteDialogOpen(false);
          await new Promise(resolve => setTimeout(resolve, 600));
          await fetchData();
        }}
      />

      {/* Dialog Reconciliação */}
      <ReconciliacaoDialog
        open={reconciliacaoDialogOpen}
        onClose={() => setReconciliacaoDialogOpen(false)}
        onSuccess={async () => {
          setReconciliacaoDialogOpen(false);
          await new Promise(resolve => setTimeout(resolve, 600));
          await fetchData();
        }}
      />
    </div>
  );
}
