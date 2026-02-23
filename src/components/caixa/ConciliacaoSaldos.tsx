import { useState, useMemo, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { dispatchCaixaDataChanged } from "@/hooks/useInvalidateCaixaData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Building2,
  Wallet,
  RefreshCcw,
  TrendingUp,
  TrendingDown,
  Loader2,
  HelpCircle,
  History,
  Lock,
  XCircle,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { parseLocalDateTime } from "@/utils/dateUtils";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { 
  registrarGanhoCambialViaLedger, 
  registrarPerdaCambialViaLedger,
  getBookmakerMoeda 
} from "@/lib/ledgerService";
import { useWalletTransitBalance } from "@/hooks/useWalletTransitBalance";
import { OperationsSubTabHeader } from "@/components/projeto-detalhe/operations/OperationsSubTabHeader";
import { useBookmakerLogoMap } from "@/hooks/useBookmakerLogoMap";
import { getFirstLastName } from "@/lib/utils";
import { SimplePagination } from "@/components/ui/simple-pagination";
import { useServerPagination } from "@/hooks/usePagination";

const PAGE_SIZE = 50;

interface ConciliacaoSaldosProps {
  transacoes: any[];
  bookmakers: { [key: string]: { nome: string; status: string } };
  wallets: { [key: string]: string };
  walletsDetalhes: Array<{ id: string; exchange: string; endereco: string; network: string; parceiro_id: string }>;
  parceiros: { [key: string]: string };
  contasBancarias: Array<{ id: string; banco: string; titular: string }>;
  onRefresh: () => void;
}

interface CurrencyAdjustmentSummary {
  ganhos: number;
  perdas: number;
  liquido: number;
}

interface ExchangeAdjustmentSummary {
  totalConciliacoes: number;
  byMoeda: Record<string, CurrencyAdjustmentSummary>;
}

interface ExchangeAdjustmentRecord {
  id: string;
  created_at: string;
  tipo: string;
  tipo_ajuste: string;
  valor_nominal: number;
  valor_confirmado: number;
  diferenca: number;
  coin: string | null;
  qtd_coin: number | null;
  observacoes: string | null;
  bookmaker_id: string | null;
  wallet_id: string | null;
  moeda_destino: string | null;
}

export function ConciliacaoSaldos({
  transacoes,
  bookmakers,
  wallets,
  walletsDetalhes,
  parceiros,
  contasBancarias,
  onRefresh,
}: ConciliacaoSaldosProps) {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { getLogoUrl } = useBookmakerLogoMap();
  const { confirmTransit, revertTransit } = useWalletTransitBalance();
  
  // Sub-tab state
  const [subTab, setSubTab] = useState<"abertas" | "historico">("abertas");
  
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [valorConfirmado, setValorConfirmado] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);
  const [failingId, setFailingId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null); // Proteção contra duplo clique
  
  // Paginação server-side para o histórico
  const pagination = useServerPagination({ initialPageSize: PAGE_SIZE });
  
  // Resumo de ajustes cambiais agrupados por moeda (calculado no backend via RPC)
  const [adjustmentSummary, setAdjustmentSummary] = useState<ExchangeAdjustmentSummary>({
    totalConciliacoes: 0,
    byMoeda: {},
  });
  const [adjustmentHistory, setAdjustmentHistory] = useState<ExchangeAdjustmentRecord[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Carregar totais via RPC (sempre retorna valores corretos, independente da paginação)
  const loadTotals = useCallback(async () => {
    if (!workspace?.id) return;
    
    try {
      // Usar query agregada diretamente até os tipos serem regenerados
      const { data, error } = await supabase
        .from("exchange_adjustments")
        .select("tipo_ajuste, diferenca, moeda_destino")
        .eq("workspace_id", workspace.id);
      
      if (error) throw error;
      
      // Calcular totais por moeda localmente (mas com todos os dados)
      const byMoeda: Record<string, CurrencyAdjustmentSummary> = {};
      let totalCount = 0;
      
      data?.forEach((adj) => {
        const moeda = adj.moeda_destino || "USD";
        
        if (!byMoeda[moeda]) {
          byMoeda[moeda] = { ganhos: 0, perdas: 0, liquido: 0 };
        }
        
        if (adj.tipo_ajuste === "GANHO_CAMBIAL") {
          byMoeda[moeda].ganhos += adj.diferenca || 0;
        } else if (adj.tipo_ajuste === "PERDA_CAMBIAL") {
          byMoeda[moeda].perdas += Math.abs(adj.diferenca || 0);
        }
        
        totalCount++;
      });
      
      // Calcular líquido por moeda
      Object.keys(byMoeda).forEach((moeda) => {
        byMoeda[moeda].liquido = byMoeda[moeda].ganhos - byMoeda[moeda].perdas;
      });
      
      setAdjustmentSummary({
        totalConciliacoes: totalCount,
        byMoeda,
      });
      
      pagination.setTotalItems(totalCount);
    } catch (error) {
      console.error("Erro ao carregar totais:", error);
    }
  }, [workspace?.id, pagination]);

  // Carregar página de histórico (paginado)
  const loadHistoryPage = useCallback(async () => {
    if (!workspace?.id) return;
    
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from("exchange_adjustments")
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .range(pagination.offset, pagination.offset + pagination.limit - 1);
      
      if (error) throw error;
      
      setAdjustmentHistory(data || []);
    } catch (error) {
      console.error("Erro ao carregar histórico:", error);
    } finally {
      setLoadingHistory(false);
    }
  }, [workspace?.id, pagination.offset, pagination.limit]);

  // Carregar totais ao montar e quando transações mudam
  useEffect(() => {
    const load = async () => {
      setLoadingSummary(true);
      await loadTotals();
      setLoadingSummary(false);
    };
    load();
  }, [workspace?.id, transacoes]);

  // Carregar página de histórico quando mudar página ou quando a aba for "historico"
  useEffect(() => {
    if (subTab === "historico") {
      loadHistoryPage();
    }
  }, [subTab, pagination.currentPage, loadHistoryPage]);

  // Filtrar transações pendentes de conciliação
  // As transações já vêm do hook usePendingTransactions filtradas por status PENDENTE
  // Aqui filtramos apenas DEPOSITOs (SAQUEs têm fluxo separado de confirmação)
  const pendingTransactions = useMemo(() => {
    return transacoes.filter(
      (t) => t.tipo_transacao === "DEPOSITO"
    );
  }, [transacoes]);

  const formatCurrency = (value: number, currency: string = "USD") => {
    const symbols: Record<string, string> = {
      USD: "$",
      BRL: "R$",
      EUR: "€",
      GBP: "£",
      MXN: "MX$",
      MYR: "RM",
      ARS: "AR$",
      COP: "COP$",
    };
    return `${symbols[currency] || currency} ${value.toFixed(2)}`;
  };

  const handleOpenConfirm = (transaction: any) => {
    // Proteção contra duplo clique no botão da lista
    if (openingId) return;
    setOpeningId(transaction.id);
    
    setSelectedTransaction(transaction);
    // Prioridade: valor_destino (estimado na moeda da casa) > valor_usd > valor
    // Se houver conversão de moeda, valor_destino contém a estimativa correta
    const valorInicial = transaction.valor_destino ?? transaction.valor_usd ?? transaction.valor ?? 0;
    setValorConfirmado(valorInicial > 0 ? valorInicial.toFixed(2) : "");
    setObservacoes("");
    setConfirmDialog(true);
    
    // Liberar lock após dialog abrir
    setTimeout(() => setOpeningId(null), 300);
  };

  const handleConfirm = async () => {
    if (!selectedTransaction || !user?.id || !workspace?.id) return;

    const valorReal = parseFloat(valorConfirmado);
    if (isNaN(valorReal) || valorReal < 0) {
      toast.error("Informe um valor válido");
      return;
    }

    setSaving(true);
    try {
      // Usar valor_destino como nominal (na moeda da casa)
      // Fallback para valor_usd ou valor para transações legacy
      const valorNominal = selectedTransaction.valor_destino 
        || selectedTransaction.valor_usd 
        || selectedTransaction.valor 
        || 0;
      const diferenca = valorReal - valorNominal;
      const hasDiferenca = Math.abs(diferenca) > 0.01;
      
      // Atualizar também valor_destino com o valor confirmado
      // Isso garante que o trigger de saldo use o valor correto
      const isCrypto = selectedTransaction.tipo_moeda === "CRYPTO";

      // 1. Atualizar transação com STATUS GUARD atômico para evitar concorrência
      // CRÍTICO: .eq("status", "PENDENTE") garante que apenas UMA request pode conciliar
      // Para transações CRYPTO: também confirma o transit_status
      const { data: updateResult, error: updateError } = await supabase
        .from("cash_ledger")
        .update({
          status: "CONFIRMADO",
          status_valor: hasDiferenca ? "AJUSTADO" : "CONFIRMADO",
          valor_confirmado: valorReal, // Novo campo: valor REAL para fins operacionais
          valor_destino: valorReal, // Atualizar valor_destino para trigger de saldo
          valor: valorReal, // Atualizar valor canônico
          // Se é transação crypto com origem wallet, confirma o trânsito
          transit_status: isCrypto && selectedTransaction.origem_wallet_id ? "CONFIRMED" : selectedTransaction.transit_status,
          cotacao_implicita: isCrypto && hasDiferenca && selectedTransaction.qtd_coin 
            ? (selectedTransaction.qtd_coin / valorReal) 
            : null,
          descricao: observacoes 
            ? `${selectedTransaction.descricao || ""} | Obs: ${observacoes}` 
            : selectedTransaction.descricao,
        })
        .eq("id", selectedTransaction.id)
        .eq("status", "PENDENTE") // STATUS GUARD: Proteção contra concorrência
        .select("id");

      if (updateError) throw updateError;
      
      // Verificar se o update realmente afetou a linha (já pode ter sido conciliado por outro usuário)
      if (!updateResult || updateResult.length === 0) {
        toast.error("Esta transação já foi conciliada por outro usuário.");
        onRefresh();
        setConfirmDialog(false);
        setSelectedTransaction(null);
        return;
      }

      // 2. Se é transação CRYPTO com origem wallet, liberar o saldo travado
      if (isCrypto && selectedTransaction.origem_wallet_id && selectedTransaction.transit_status === "PENDING") {
        const transitResult = await confirmTransit(selectedTransaction.id, valorReal);
        if (!transitResult.success) {
          console.warn("[Conciliação] Aviso ao confirmar trânsito:", transitResult.error);
          // Não falhar a conciliação, apenas logar - o status já foi atualizado
        } else {
          console.log(`[Conciliação] Trânsito confirmado - saldo liberado da wallet`);
        }
      }

      // 2. Se houve diferença, registrar ajuste cambial E atualizar saldo do bookmaker
      if (hasDiferenca) {
        const tipoAjuste = diferenca > 0 ? "GANHO_CAMBIAL" : "PERDA_CAMBIAL";
        const bookmakerId = selectedTransaction.tipo_transacao === "DEPOSITO" 
          ? selectedTransaction.destino_bookmaker_id 
          : selectedTransaction.origem_bookmaker_id;
        
        // Obter moeda destino da transação
        const moedaDestino = selectedTransaction.moeda_destino || selectedTransaction.moeda || "USD";
        
        // Registrar ajuste cambial para histórico
        const { error: adjError } = await supabase
          .from("exchange_adjustments")
          .insert({
            workspace_id: workspace.id,
            user_id: user.id,
            cash_ledger_id: selectedTransaction.id,
            bookmaker_id: bookmakerId,
            wallet_id: selectedTransaction.origem_wallet_id || selectedTransaction.destino_wallet_id,
            tipo: selectedTransaction.tipo_transacao,
            valor_nominal: valorNominal,
            valor_confirmado: valorReal,
            diferenca: diferenca,
            tipo_ajuste: tipoAjuste,
            coin: selectedTransaction.coin,
            qtd_coin: selectedTransaction.qtd_coin,
            observacoes: observacoes || null,
            moeda_destino: moedaDestino,
          });
        
        if (adjError) {
          console.error("Erro ao registrar ajuste cambial:", adjError);
        }

        // USAR LEDGER: Registrar ajuste cambial via ledger (trigger atualiza saldo automaticamente)
        if (bookmakerId) {
          const moeda = await getBookmakerMoeda(bookmakerId);
          
          if (diferenca > 0) {
            // Ganho cambial - crédito
            const result = await registrarGanhoCambialViaLedger({
              bookmakerId,
              valor: diferenca,
              moeda,
              workspaceId: workspace.id,
              userId: user.id,
              descricao: `Ganho cambial em conciliação: ${formatCurrency(valorNominal)} nominal → ${formatCurrency(valorReal)} confirmado`,
              transacaoOrigemId: selectedTransaction.id,
            });
            
            if (!result.success) {
              console.error("[Conciliação] Erro ao registrar ganho cambial:", result.error);
              toast.error("Erro ao registrar ganho cambial");
            } else {
              console.log(`[Conciliação] Ganho cambial registrado via ledger: ${diferenca}`);
            }
          } else {
            // Perda cambial - débito
            const result = await registrarPerdaCambialViaLedger({
              bookmakerId,
              valor: Math.abs(diferenca),
              moeda,
              workspaceId: workspace.id,
              userId: user.id,
              descricao: `Perda cambial em conciliação: ${formatCurrency(valorNominal)} nominal → ${formatCurrency(valorReal)} confirmado`,
              transacaoOrigemId: selectedTransaction.id,
            });
            
            if (!result.success) {
              console.error("[Conciliação] Erro ao registrar perda cambial:", result.error);
              toast.error("Erro ao registrar perda cambial");
            } else {
              console.log(`[Conciliação] Perda cambial registrada via ledger: ${Math.abs(diferenca)}`);
            }
          }
        }
      }

      if (hasDiferenca) {
        const tipoAjuste = diferenca > 0 ? "GANHO_CAMBIAL" : "PERDA_CAMBIAL";
        toast.success(`Conciliação confirmada! ${tipoAjuste === "PERDA_CAMBIAL" ? "Perda" : "Ganho"} cambial: ${formatCurrency(Math.abs(diferenca))}`);
      } else {
        toast.success("Conciliação confirmada sem diferença");
      }

      setConfirmDialog(false);
      setSelectedTransaction(null);
      onRefresh();
    } catch (error: any) {
      console.error("Erro ao confirmar conciliação:", error);
      toast.error("Erro ao confirmar: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const getBookmakerName = (id: string) => bookmakers[id]?.nome || "Bookmaker";
  
  const getWalletInfo = (id: string) => {
    const wallet = walletsDetalhes.find(w => w.id === id);
    if (!wallet) return "Wallet";
    const parceiroNome = parceiros[wallet.parceiro_id] || "";
    return `${wallet.exchange?.replace(/-/g, ' ').toUpperCase() || 'WALLET'} (${parceiroNome})`;
  };

  return (
    <div className="space-y-4">
      {/* Sub-tab header */}
      <OperationsSubTabHeader
        subTab={subTab}
        onSubTabChange={(tab) => setSubTab(tab as "abertas" | "historico")}
        openCount={pendingTransactions.length}
        historyCount={adjustmentHistory.length}
        showViewToggle={false}
        extraActions={
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="text-muted-foreground hover:text-foreground transition-colors p-1">
                  <HelpCircle className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-xs">
                <p className="text-sm">
                  <strong>Conciliação</strong> valida se o valor real creditado/recebido corresponde ao esperado.
                </p>
                <ul className="text-xs mt-2 space-y-1 text-muted-foreground">
                  <li>• <strong>Valor nominal:</strong> valor enviado na moeda de origem</li>
                  <li>• <strong>Valor confirmado:</strong> valor real creditado na casa</li>
                </ul>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        }
      />

      {/* Conteúdo baseado na sub-tab */}
      {subTab === "abertas" ? (
        /* === AGUARDANDO CONCILIAÇÃO === */
        <div className="space-y-4">
          {pendingTransactions.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Tudo Conciliado!</h3>
              <p className="text-muted-foreground">
                Não há transações pendentes de confirmação.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-3 pr-4">
                {pendingTransactions.map((t) => {
                  const isDeposito = t.tipo_transacao === "DEPOSITO";
                  const isCrypto = t.tipo_moeda === "CRYPTO";
                  const valorNominal = t.valor_usd || t.valor || 0;
                  const moedaOrigem = t.moeda_origem || (isCrypto ? t.coin : t.moeda) || "BRL";
                  const moedaDestino = t.moeda_destino || t.moeda || "BRL";
                  const valorOrigem = t.valor_origem || t.valor || 0;
                  
                  // Bookmaker info
                  const bookmakerId = isDeposito ? t.destino_bookmaker_id : t.origem_bookmaker_id;
                  const bookmakerNome = bookmakerId ? getBookmakerName(bookmakerId) : "Bookmaker";
                  const bookmakerLogo = getLogoUrl(bookmakerNome);
                  
                  // Wallet info with abbreviated partner name
                  const walletId = t.origem_wallet_id || t.destino_wallet_id;
                  const walletDetails = walletId ? walletsDetalhes.find(w => w.id === walletId) : null;
                  const walletExchange = walletDetails?.exchange?.replace(/-/g, ' ').toUpperCase() || "WALLET";
                  const walletParceiroId = walletDetails?.parceiro_id;
                  const walletParceiroNome = walletParceiroId ? parceiros[walletParceiroId] : null;
                  const walletParceiroShort = walletParceiroNome ? getFirstLastName(walletParceiroNome) : null;
                  
                  // Conta bancária info for FIAT withdrawals
                  const contaBancariaId = t.destino_conta_bancaria_id;
                  const contaBancaria = contaBancariaId ? contasBancarias.find(c => c.id === contaBancariaId) : null;
                  const contaBancoNome = contaBancaria?.banco || "Banco";
                  const contaTitularShort = contaBancaria?.titular ? getFirstLastName(contaBancaria.titular) : null;
                  
                  // Parceiro destino (pode ser via conta bancária ou diretamente)
                  const destinoParceiroId = t.destino_parceiro_id;
                  const destinoParceiroNome = destinoParceiroId ? parceiros[destinoParceiroId] : null;
                  const destinoParceiroShort = destinoParceiroNome ? getFirstLastName(destinoParceiroNome) : null;
                  
                  return (
                    <div
                      key={t.id}
                      className="flex items-center justify-between p-4 rounded-lg border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 transition-colors"
                    >
                      <div className="flex items-center gap-4 flex-wrap">
                        <Badge
                          className={
                            isDeposito
                              ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                              : "bg-purple-500/20 text-purple-400 border-purple-500/30"
                          }
                        >
                          {isDeposito ? "Depósito" : "Saque"}
                        </Badge>
                        
                        <Badge variant="outline" className="text-xs">
                          {isCrypto ? "CRYPTO" : "FIAT"}
                        </Badge>

                        {/* Indicador de saldo em trânsito (crypto) */}
                        {isCrypto && t.transit_status === "PENDING" && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="secondary" className="gap-1 text-xs bg-warning/20 text-warning border-warning/30">
                                  <Lock className="h-3 w-3" />
                                  Em Trânsito
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">
                                  Saldo travado na wallet de origem até confirmação
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}

                        {/* Fluxo visual corrigido */}
                        <div className="flex items-center gap-3 text-sm">
                          {isDeposito ? (
                            <>
                              {/* DEPÓSITO: Wallet/Banco → Bookmaker */}
                              {isCrypto && walletDetails ? (
                                <div className="flex flex-col items-center min-w-[80px]">
                                  <div className="flex items-center gap-1.5">
                                    <Wallet className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-xs font-medium uppercase">{walletExchange}</span>
                                  </div>
                                  {walletParceiroShort && (
                                    <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                                      {walletParceiroShort}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <Building2 className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-xs text-muted-foreground">{moedaOrigem}</span>
                                </div>
                              )}

                              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />

                              {/* Destino: Bookmaker */}
                              <div className="flex items-center gap-2">
                                {bookmakerLogo ? (
                                  <img
                                    src={bookmakerLogo}
                                    alt=""
                                    className="h-5 w-5 rounded object-contain"
                                  />
                                ) : (
                                  <Building2 className="h-5 w-5 text-muted-foreground" />
                                )}
                                <span className="text-xs font-medium uppercase">{bookmakerNome}</span>
                              </div>
                            </>
                          ) : (
                            <>
                              {/* SAQUE: Bookmaker → Wallet/Banco */}
                              <div className="flex items-center gap-2">
                                {bookmakerLogo ? (
                                  <img
                                    src={bookmakerLogo}
                                    alt=""
                                    className="h-5 w-5 rounded object-contain"
                                  />
                                ) : (
                                  <Building2 className="h-5 w-5 text-muted-foreground" />
                                )}
                                <span className="text-xs font-medium uppercase">{bookmakerNome}</span>
                              </div>

                              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />

                              {/* Destino do saque: Wallet ou Banco */}
                              {isCrypto && walletDetails ? (
                                <div className="flex flex-col items-center min-w-[80px]">
                                  <div className="flex items-center gap-1.5">
                                    <Wallet className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-xs font-medium uppercase">{walletExchange}</span>
                                  </div>
                                  {walletParceiroShort && (
                                    <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                                      {walletParceiroShort}
                                    </span>
                                  )}
                                </div>
                              ) : contaBancaria ? (
                                <div className="flex flex-col items-center min-w-[80px]">
                                  <div className="flex items-center gap-1.5">
                                    <Building2 className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-xs font-medium uppercase">{contaBancoNome}</span>
                                  </div>
                                  {(contaTitularShort || destinoParceiroShort) && (
                                    <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                                      {contaTitularShort || destinoParceiroShort}
                                    </span>
                                  )}
                                </div>
                              ) : destinoParceiroNome ? (
                                <div className="flex flex-col items-center min-w-[80px]">
                                  <div className="flex items-center gap-1.5">
                                    <Building2 className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-xs font-medium uppercase">Parceiro</span>
                                  </div>
                                  <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                                    {destinoParceiroShort}
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <Building2 className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-xs text-muted-foreground">{moedaDestino}</span>
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        {/* Valores */}
                        <div className="text-sm">
                          {isCrypto ? (
                            <>
                              <div className="font-mono">
                                {t.qtd_coin?.toFixed(4)} {t.coin}
                              </div>
                              <div className="text-muted-foreground text-xs">
                                ≈ {formatCurrency(valorNominal)}
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="font-mono font-medium">
                                {moedaOrigem} {valorOrigem.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </div>
                              <div className="text-muted-foreground text-xs">
                                → {moedaDestino}
                              </div>
                            </>
                          )}
                        </div>

                        <div className="text-xs text-muted-foreground">
                          {format(parseLocalDateTime(t.data_transacao), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Botão Falhar - apenas para crypto em trânsito */}
                        {isCrypto && t.transit_status === "PENDING" && t.origem_wallet_id && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                                  onClick={async () => {
                                    if (failingId) return;
                                    setFailingId(t.id);
                                    try {
                                      // Reverter o trânsito (liberar saldo)
                                      const result = await revertTransit(t.id, 'FAILED', 'Falhou na blockchain');
                                      if (!result.success) {
                                        toast.error("Erro ao reverter: " + result.error);
                                        return;
                                      }
                                      // Cancelar a transação no ledger
                                      const { error } = await supabase
                                        .from("cash_ledger")
                                        .update({
                                          status: "CANCELADO",
                                          transit_status: "FAILED",
                                          descricao: `${t.descricao || ""} | FALHOU: Transação não confirmada na blockchain`,
                                        })
                                        .eq("id", t.id)
                                        .eq("status", "PENDENTE");
                                      
                                      if (error) throw error;
                                      
                                      toast.success("Transação marcada como falha. Saldo liberado.");
                                      dispatchCaixaDataChanged();
                                      onRefresh();
                                    } catch (err: any) {
                                      console.error("Erro ao falhar transação:", err);
                                      toast.error("Erro: " + err.message);
                                    } finally {
                                      setFailingId(null);
                                    }
                                  }}
                                  disabled={failingId === t.id}
                                >
                                  {failingId === t.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <XCircle className="h-4 w-4" />
                                  )}
                                  Falhar
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">Marca como falha e libera o saldo travado na wallet</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}

                        <Button
                          size="sm"
                          className="gap-2"
                          onClick={() => handleOpenConfirm(t)}
                          disabled={openingId === t.id}
                        >
                          {openingId === t.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4" />
                          )}
                          Conciliar
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      ) : (
        /* === HISTÓRICO DE CONCILIAÇÕES === */
        <div className="space-y-4">
          {/* Resumo cambial com tooltip para detalhes por moeda */}
          {adjustmentSummary.totalConciliacoes > 0 && (
            <div className="flex items-center gap-4 p-3 rounded-lg border border-border/50 bg-muted/20">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Total:</span>
                <span className="font-medium">{adjustmentSummary.totalConciliacoes}</span>
              </div>
              
              <div className="h-4 w-px bg-border" />
              
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-3 cursor-help">
                      {/* Mostrar quantidade de moedas */}
                      <span className="text-sm text-muted-foreground">
                        {Object.keys(adjustmentSummary.byMoeda).length} moeda{Object.keys(adjustmentSummary.byMoeda).length !== 1 ? 's' : ''}
                      </span>
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs p-3">
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Resumo por moeda:</p>
                      {Object.entries(adjustmentSummary.byMoeda).map(([moeda, summary]) => (
                        <div key={moeda} className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">{moeda}</Badge>
                          </div>
                          <div className="flex items-center gap-3 text-xs pl-1">
                            <span className="text-emerald-400">+{formatCurrency(summary.ganhos, moeda)}</span>
                            <span className="text-red-400">-{formatCurrency(summary.perdas, moeda)}</span>
                            <span className={`font-medium ${summary.liquido >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              = {summary.liquido >= 0 ? '+' : ''}{formatCurrency(summary.liquido, moeda)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}

          {loadingHistory ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : adjustmentHistory.length === 0 && adjustmentSummary.totalConciliacoes === 0 ? (
            <div className="text-center py-12">
              <History className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Sem histórico</h3>
              <p className="text-muted-foreground">
                Nenhuma conciliação realizada ainda.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <ScrollArea className="h-[350px]">
                <div className="space-y-2 pr-4">
                  {adjustmentHistory.map((adj) => {
                    const isGanho = adj.tipo_ajuste === "GANHO_CAMBIAL";
                    const bookmakerNome = adj.bookmaker_id ? getBookmakerName(adj.bookmaker_id) : null;
                    const bookmakerLogo = bookmakerNome ? getLogoUrl(bookmakerNome) : null;
                    
                    // Wallet info with abbreviated partner name
                    const walletDetails = adj.wallet_id ? walletsDetalhes.find(w => w.id === adj.wallet_id) : null;
                    const walletExchange = walletDetails?.exchange?.replace(/-/g, ' ').toUpperCase() || null;
                    const walletParceiroId = walletDetails?.parceiro_id;
                    const walletParceiroNome = walletParceiroId ? parceiros[walletParceiroId] : null;
                    const walletParceiroShort = walletParceiroNome ? getFirstLastName(walletParceiroNome) : null;
                    
                    return (
                      <div
                        key={adj.id}
                        className={`flex items-center justify-between p-3 rounded-lg border ${
                          isGanho 
                            ? "bg-emerald-500/5 border-emerald-500/20" 
                            : "bg-red-500/5 border-red-500/20"
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-wrap min-w-0">
                          <Badge
                            className={
                              isGanho
                                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 shrink-0"
                                : "bg-red-500/20 text-red-400 border-red-500/30 shrink-0"
                            }
                          >
                            {isGanho ? (
                              <TrendingUp className="h-3 w-3 mr-1" />
                            ) : (
                              <TrendingDown className="h-3 w-3 mr-1" />
                            )}
                            {isGanho ? "Ganho" : "Perda"}
                          </Badge>

                          <Badge variant="outline" className="text-xs shrink-0">
                            {adj.tipo === "DEPOSITO" ? "Depósito" : "Saque"}
                          </Badge>

                          {/* Wallet info */}
                          {walletExchange && (
                            <div className="flex flex-col items-center min-w-0">
                              <div className="flex items-center gap-1">
                                <Wallet className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="text-xs font-medium uppercase truncate">{walletExchange}</span>
                              </div>
                              {walletParceiroShort && (
                                <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">
                                  {walletParceiroShort}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Bookmaker with logo */}
                          {bookmakerNome && (
                            <div className="flex items-center gap-1.5">
                              {bookmakerLogo ? (
                                <img
                                  src={bookmakerLogo}
                                  alt=""
                                  className="h-4 w-4 rounded object-contain shrink-0"
                                />
                              ) : (
                                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                              )}
                              <span className="text-xs font-medium uppercase truncate">{bookmakerNome}</span>
                            </div>
                          )}

                          {adj.qtd_coin && adj.coin && (
                            <div className="text-xs text-muted-foreground shrink-0 font-mono">
                              {adj.qtd_coin.toFixed(2)} {adj.coin}
                            </div>
                          )}

                          <div className="text-xs text-muted-foreground shrink-0">
                            {format(parseLocalDateTime(adj.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </div>
                        </div>

                        <div className="text-right shrink-0 ml-2">
                          <p className={`font-semibold ${isGanho ? "text-emerald-400" : "text-red-400"}`}>
                            {isGanho ? "+" : "-"}{formatCurrency(Math.abs(adj.diferenca), adj.moeda_destino || "USD")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency(adj.valor_nominal, adj.moeda_destino || "USD")} → {formatCurrency(adj.valor_confirmado, adj.moeda_destino || "USD")}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
              
              {/* Paginação */}
              {pagination.totalPages > 1 && (
                <SimplePagination
                  currentPage={pagination.currentPage}
                  totalPages={pagination.totalPages}
                  totalItems={pagination.totalItems}
                  startIndex={pagination.offset}
                  endIndex={Math.min(pagination.offset + pagination.limit, pagination.totalItems)}
                  hasNextPage={pagination.hasNextPage}
                  hasPrevPage={pagination.hasPrevPage}
                  onNextPage={pagination.goToNextPage}
                  onPrevPage={pagination.goToPrevPage}
                  compact
                  className="pt-2 border-t border-border/50"
                />
              )}
            </div>
          )}
        </div>
      )}


      {/* Dialog de Confirmação */}
      <Dialog open={confirmDialog} onOpenChange={setConfirmDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCcw className="h-5 w-5 text-primary" />
              Confirmar Conciliação
            </DialogTitle>
            <DialogDescription>
              Informe o valor real que foi{" "}
              {selectedTransaction?.tipo_transacao === "DEPOSITO" ? "creditado na casa" : "recebido"}
            </DialogDescription>
          </DialogHeader>

          {selectedTransaction && (() => {
            const isCrypto = selectedTransaction.tipo_moeda === "CRYPTO";
            const moedaOrigem = selectedTransaction.moeda_origem || (isCrypto ? selectedTransaction.coin : selectedTransaction.moeda) || "BRL";
            const moedaDestino = selectedTransaction.moeda_destino || selectedTransaction.moeda || "BRL";
            const valorOrigem = selectedTransaction.valor_origem || selectedTransaction.valor || 0;
            const valorNominalDestino = selectedTransaction.valor_destino || selectedTransaction.valor || 0;
            
            // Para exibição do símbolo da moeda destino
            const currencySymbols: Record<string, string> = {
              USD: "$", BRL: "R$", EUR: "€", GBP: "£", MXN: "$", MYR: "RM", ARS: "$", COP: "$"
            };
            const symbolDestino = currencySymbols[moedaDestino] || moedaDestino;
            
            return (
              <div className="space-y-4 py-4">
                {/* Resumo da transação */}
                <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Valor enviado:</span>
                    <span className="font-mono font-medium">
                      {isCrypto 
                        ? `${selectedTransaction.qtd_coin?.toFixed(6)} ${selectedTransaction.coin}`
                        : `${moedaOrigem} ${valorOrigem.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                      }
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Valor estimado ({moedaDestino}):</span>
                    <span className="font-medium">
                      {symbolDestino} {valorNominalDestino.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Destino:</span>
                    <span>
                      {selectedTransaction.destino_bookmaker_id 
                        ? getBookmakerName(selectedTransaction.destino_bookmaker_id)
                        : selectedTransaction.origem_bookmaker_id
                          ? getBookmakerName(selectedTransaction.origem_bookmaker_id)
                          : "N/A"}
                    </span>
                  </div>
                </div>

                {/* Input valor real */}
                <div className="space-y-2">
                  <Label htmlFor="valorReal">
                    Valor real {selectedTransaction.tipo_transacao === "DEPOSITO" ? "creditado" : "recebido"} ({moedaDestino})
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{symbolDestino}</span>
                    <Input
                      id="valorReal"
                      type="number"
                      step="0.01"
                      value={valorConfirmado}
                      onChange={(e) => setValorConfirmado(e.target.value)}
                      className="pl-10"
                      placeholder="0.00"
                    />
                  </div>
                  
                  {/* Indicador de diferença */}
                  {valorConfirmado && (
                    <div className="flex items-center gap-2 text-sm">
                      {(() => {
                        const valorReal = parseFloat(valorConfirmado) || 0;
                        const diferenca = valorReal - valorNominalDestino;
                        
                        if (Math.abs(diferenca) < 0.01) {
                          return (
                            <span className="text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="h-4 w-4" />
                              Valores conferem
                            </span>
                          );
                        }
                        
                        return diferenca > 0 ? (
                          <span className="text-emerald-400 flex items-center gap-1">
                            <TrendingUp className="h-4 w-4" />
                            Ganho cambial: +{symbolDestino} {diferenca.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-amber-400 flex items-center gap-1">
                            <TrendingDown className="h-4 w-4" />
                            Perda cambial: {symbolDestino} {diferenca.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* Observações */}
                <div className="space-y-2">
                  <Label htmlFor="observacoes">Observações (opcional)</Label>
                  <Textarea
                    id="observacoes"
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    placeholder="Ex: Cotação da casa estava defasada"
                    rows={2}
                  />
                </div>
              </div>
            );
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleConfirm} disabled={saving || !valorConfirmado}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Confirmando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Confirmar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
