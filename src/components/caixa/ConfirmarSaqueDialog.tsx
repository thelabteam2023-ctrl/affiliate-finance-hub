import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Building2,
  Landmark,
  ArrowRight,
  User,
  Clock,
  Wallet,
  AlertTriangle,
  Network,
  Coins,
  TrendingDown,
  Info,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Moedas cripto suportadas
const CRYPTO_COINS = ["USDT", "USDC", "ETH", "BTC", "BNB", "TRX", "SOL", "MATIC"];

// Redes blockchain suportadas
const BLOCKCHAIN_NETWORKS = [
  { value: "TRC20", label: "TRON (TRC20)" },
  { value: "ERC20", label: "Ethereum (ERC20)" },
  { value: "BEP20", label: "BNB Chain (BEP20)" },
  { value: "SOL", label: "Solana" },
  { value: "MATIC", label: "Polygon" },
  { value: "ARB", label: "Arbitrum" },
  { value: "OP", label: "Optimism" },
  { value: "AVAX", label: "Avalanche C-Chain" },
];

export interface SaquePendente {
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
  moeda_destino?: string;
  // Campos cripto
  coin?: string;
  qtd_coin?: number;
  cotacao_original?: number;
  moeda_origem?: string;
  // Dados da wallet de destino
  wallet_network?: string;
  wallet_exchange?: string;
  wallet_moedas?: string[];
}

interface ConfirmarSaqueDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  saque: SaquePendente | null;
}

export function ConfirmarSaqueDialog({
  open,
  onClose,
  onSuccess,
  saque,
}: ConfirmarSaqueDialogProps) {
  const [loading, setLoading] = useState(false);
  const [observacoes, setObservacoes] = useState("");
  const [showRecusaConfirm, setShowRecusaConfirm] = useState(false);
  
  // Estados para saque FIAT
  const [valorRecebido, setValorRecebido] = useState<string>("");
  
  // Estados para saque CRIPTO
  const [qtdCoinRecebida, setQtdCoinRecebida] = useState<string>("");
  const [moedaRecebida, setMoedaRecebida] = useState<string>("");
  const [redeUtilizada, setRedeUtilizada] = useState<string>("");
  const [cotacaoReal, setCotacaoReal] = useState<string>("");

  // Determinar se é saque cripto
  const isCryptoWithdrawal = !!saque?.destino_wallet_id;

  // Resetar estados quando abre o dialog
  useEffect(() => {
    if (open && saque) {
      setObservacoes("");
      
      if (isCryptoWithdrawal) {
        // Pré-preencher com dados esperados
        setQtdCoinRecebida(saque.qtd_coin?.toString() || "");
        setMoedaRecebida(saque.coin || saque.moeda_origem || "USDT");
        setRedeUtilizada(normalizeNetwork(saque.wallet_network || ""));
        setCotacaoReal(saque.cotacao_original?.toString() || "1");
        setValorRecebido("");
      } else {
        // Saque FIAT
        setValorRecebido(saque.valor.toString());
        setQtdCoinRecebida("");
        setMoedaRecebida("");
        setRedeUtilizada("");
        setCotacaoReal("");
      }
    }
  }, [open, saque, isCryptoWithdrawal]);

  // Normalizar nome da rede para o formato do select
  const normalizeNetwork = (network: string): string => {
    const networkUpper = network.toUpperCase();
    if (networkUpper.includes("TRC20") || networkUpper.includes("TRON")) return "TRC20";
    if (networkUpper.includes("ERC20") || networkUpper.includes("ETHEREUM")) return "ERC20";
    if (networkUpper.includes("BEP20") || networkUpper.includes("BNB") || networkUpper.includes("BSC")) return "BEP20";
    if (networkUpper.includes("SOL")) return "SOL";
    if (networkUpper.includes("MATIC") || networkUpper.includes("POLYGON")) return "MATIC";
    if (networkUpper.includes("ARB")) return "ARB";
    if (networkUpper.includes("OP")) return "OP";
    if (networkUpper.includes("AVAX")) return "AVAX";
    return network;
  };

  const formatCurrency = (value: number, currency: string = "BRL") => {
    // Tratar moedas cripto
    if (CRYPTO_COINS.includes(currency.toUpperCase())) {
      return `${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${currency}`;
    }
    try {
      return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: currency,
      }).format(value);
    } catch {
      return `${currency} ${value.toFixed(2)}`;
    }
  };

  // Cálculos para saque CRIPTO
  const qtdCoinRecebidaNum = parseFloat(qtdCoinRecebida) || 0;
  const cotacaoRealNum = parseFloat(cotacaoReal) || 1;
  const qtdCoinEsperada = saque?.qtd_coin || 0;
  const cotacaoOriginal = saque?.cotacao_original || 1;
  
  // Taxa de rede = diferença entre esperado e recebido (em coins)
  const taxaRede = qtdCoinEsperada - qtdCoinRecebidaNum;
  const temTaxaRede = Math.abs(taxaRede) > 0.001;
  
  // Spread = diferença de cotação
  const spreadPercentual = cotacaoOriginal > 0 
    ? ((cotacaoRealNum - cotacaoOriginal) / cotacaoOriginal) * 100 
    : 0;
  const temSpread = Math.abs(spreadPercentual) > 0.01;
  
  // Valor USD real calculado
  const valorUsdReal = qtdCoinRecebidaNum * cotacaoRealNum;
  const valorUsdEsperado = saque?.valor || 0;
  const diferencaUsd = valorUsdReal - valorUsdEsperado;

  // Cálculos para saque FIAT
  const valorRecebidoNum = parseFloat(valorRecebido) || 0;
  const diferencaFiat = valorRecebidoNum - (saque?.valor || 0);
  const temDiferencaFiat = Math.abs(diferencaFiat) > 0.01;
  const moedaDestinoFiat = saque?.moeda_destino || saque?.moeda || "BRL";

  // Validação
  const isValidCrypto = isCryptoWithdrawal && qtdCoinRecebidaNum > 0 && moedaRecebida && redeUtilizada;
  const isValidFiat = !isCryptoWithdrawal && valorRecebidoNum > 0;
  const isValid = isValidCrypto || isValidFiat;

  const handleConfirmar = async () => {
    if (!saque || !isValid) return;

    try {
      setLoading(true);

      // Verificar status atual
      const { data: currentSaque, error: fetchError } = await supabase
        .from("cash_ledger")
        .select("status")
        .eq("id", saque.id)
        .single();

      if (fetchError) throw fetchError;

      if (currentSaque?.status !== "PENDENTE") {
        toast.error("Este saque já foi processado anteriormente.");
        onClose();
        return;
      }

      // Montar descrição
      let descricaoFinal = saque.descricao || "";
      if (observacoes.trim()) {
        descricaoFinal = descricaoFinal 
          ? `${descricaoFinal}\n\n[Confirmação]: ${observacoes}`
          : `[Confirmação]: ${observacoes}`;
      }

      if (isCryptoWithdrawal) {
        // Adicionar detalhes da liquidação cripto
        const detalhes: string[] = [];
        if (moedaRecebida !== saque.coin) {
          detalhes.push(`Moeda diferente: esperado ${saque.coin}, recebido ${moedaRecebida}`);
        }
        if (temTaxaRede) {
          detalhes.push(`Taxa de rede: ${taxaRede.toFixed(6)} ${moedaRecebida}`);
        }
        if (temSpread) {
          detalhes.push(`Spread: ${spreadPercentual > 0 ? "+" : ""}${spreadPercentual.toFixed(2)}%`);
        }
        if (detalhes.length > 0) {
          descricaoFinal = descricaoFinal
            ? `${descricaoFinal}\n[Liquidação Cripto]: ${detalhes.join(" | ")}`
            : `[Liquidação Cripto]: ${detalhes.join(" | ")}`;
        }

        // Atualizar com dados reais de cripto
        const { error } = await supabase
          .from("cash_ledger")
          .update({
            status: "CONFIRMADO",
            valor_confirmado: valorUsdReal,
            qtd_coin: qtdCoinRecebidaNum,
            coin: moedaRecebida,
            cotacao: cotacaoRealNum,
            metodo_destino: redeUtilizada,
            descricao: descricaoFinal || null,
          })
          .eq("id", saque.id)
          .eq("status", "PENDENTE");

        if (error) throw error;

        // Registrar perda se houver diferença significativa
        if (Math.abs(diferencaUsd) > 0.01 && saque.origem_bookmaker_id) {
          const { data: userData } = await supabase.auth.getUser();
          const { data: bookmaker } = await supabase
            .from("bookmakers")
            .select("workspace_id")
            .eq("id", saque.origem_bookmaker_id)
            .single();

          if (bookmaker && userData?.user) {
            const tipoAjuste = diferencaUsd > 0 ? "GANHO_CAMBIAL" : "PERDA_CAMBIAL";
            await supabase.from("cash_ledger").insert({
              tipo_transacao: tipoAjuste,
              valor: Math.abs(diferencaUsd),
              moeda: "USD",
              status: "CONFIRMADO",
              data_transacao: new Date().toISOString().split("T")[0],
              descricao: `${tipoAjuste === "GANHO_CAMBIAL" ? "Ganho" : "Perda"} na liquidação cripto - ${saque.bookmaker_nome || "Saque"} (taxa rede: ${taxaRede.toFixed(4)} ${moedaRecebida})`,
              workspace_id: bookmaker.workspace_id,
              user_id: userData.user.id,
              tipo_moeda: "CRYPTO",
              impacta_caixa_operacional: false,
              referencia_transacao_id: saque.id,
              destino_wallet_id: saque.destino_wallet_id,
              coin: moedaRecebida,
              qtd_coin: Math.abs(taxaRede),
            });
          }
        }

      } else {
        // Saque FIAT - lógica existente
        if (temDiferencaFiat) {
          const tipoDif = diferencaFiat > 0 ? "GANHO" : "PERDA";
          descricaoFinal = descricaoFinal
            ? `${descricaoFinal}\n[Ajuste ${tipoDif}]: ${formatCurrency(Math.abs(diferencaFiat), moedaDestinoFiat)}`
            : `[Ajuste ${tipoDif}]: ${formatCurrency(Math.abs(diferencaFiat), moedaDestinoFiat)}`;
        }

        const { error } = await supabase
          .from("cash_ledger")
          .update({
            status: "CONFIRMADO",
            valor_confirmado: valorRecebidoNum,
            descricao: descricaoFinal || null,
          })
          .eq("id", saque.id)
          .eq("status", "PENDENTE");

        if (error) throw error;

        // Registrar ajuste cambial se houver diferença
        if (temDiferencaFiat && saque.origem_bookmaker_id) {
          const { data: userData } = await supabase.auth.getUser();
          const { data: bookmaker } = await supabase
            .from("bookmakers")
            .select("workspace_id")
            .eq("id", saque.origem_bookmaker_id)
            .single();

          if (bookmaker && userData?.user) {
            await supabase.from("cash_ledger").insert({
              tipo_transacao: diferencaFiat > 0 ? "GANHO_CAMBIAL" : "PERDA_CAMBIAL",
              valor: Math.abs(diferencaFiat),
              moeda: moedaDestinoFiat,
              status: "CONFIRMADO",
              data_transacao: new Date().toISOString().split("T")[0],
              descricao: `Ajuste cambial - Saque ${saque.bookmaker_nome || "Bookmaker"}`,
              workspace_id: bookmaker.workspace_id,
              user_id: userData.user.id,
              tipo_moeda: "FIAT",
              impacta_caixa_operacional: false,
              referencia_transacao_id: saque.id,
              destino_conta_bancaria_id: saque.destino_conta_bancaria_id,
            });
          }
        }
      }
      
      // Verificar workflow de saque
      if (saque.origem_bookmaker_id) {
        const { data: bookmaker } = await supabase
          .from("bookmakers")
          .select("saldo_atual, saldo_usd, moeda, aguardando_saque_at")
          .eq("id", saque.origem_bookmaker_id)
          .single();

        if (bookmaker) {
          const moedaBk = bookmaker.moeda || "BRL";
          const saldoAtual = moedaBk === "USD" || moedaBk === "USDT" 
            ? (bookmaker.saldo_usd || 0) 
            : (bookmaker.saldo_atual || 0);
          
          if (saldoAtual <= 0.5 && bookmaker.aguardando_saque_at) {
            await supabase.rpc('confirmar_saque_concluido', {
              p_bookmaker_id: saque.origem_bookmaker_id
            });
          }
        }
      }

      toast.success("Saque confirmado com sucesso! Dados de liquidação registrados.");
      resetForm();
      onSuccess();
      onClose();
    } catch (error: any) {
      toast.error("Erro ao confirmar saque: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRecusar = async () => {
    if (!saque) return;

    try {
      setLoading(true);

      const updateData: any = {
        status: "RECUSADO",
      };

      if (observacoes.trim()) {
        updateData.descricao = saque.descricao 
          ? `${saque.descricao}\n\n[Recusa]: ${observacoes}`
          : `[Recusa]: ${observacoes}`;
      }

      const { error: ledgerError } = await supabase
        .from("cash_ledger")
        .update(updateData)
        .eq("id", saque.id);

      if (ledgerError) throw ledgerError;

      if (saque.origem_bookmaker_id) {
        const { data: historico } = await supabase
          .from("projeto_bookmaker_historico")
          .select("projeto_id, status_final")
          .eq("bookmaker_id", saque.origem_bookmaker_id)
          .order("data_vinculacao", { ascending: false })
          .limit(1)
          .single();

        if (historico?.projeto_id) {
          const statusAnterior = historico.status_final === "LIMITADA" ? "LIMITADA" : "ativo";
          
          await supabase
            .from("bookmakers")
            .update({ 
              projeto_id: historico.projeto_id,
              status: statusAnterior 
            })
            .eq("id", saque.origem_bookmaker_id);

          await supabase
            .from("projeto_bookmaker_historico")
            .update({ 
              data_desvinculacao: null,
              status_final: statusAnterior
            })
            .eq("bookmaker_id", saque.origem_bookmaker_id)
            .eq("projeto_id", historico.projeto_id);
        }
      }

      toast.success("Saque marcado como recusado. A conta foi revinculada ao projeto.");
      resetForm();
      setShowRecusaConfirm(false);
      onSuccess();
      onClose();
    } catch (error: any) {
      toast.error("Erro ao recusar saque: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setObservacoes("");
    setValorRecebido("");
    setQtdCoinRecebida("");
    setMoedaRecebida("");
    setRedeUtilizada("");
    setCotacaoReal("");
  };

  if (!saque) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-500" />
              Confirmação de Saque {isCryptoWithdrawal ? "Cripto" : ""}
            </DialogTitle>
            <DialogDescription>
              {isCryptoWithdrawal 
                ? "Informe os dados reais da liquidação na blockchain"
                : "Informe o valor real recebido no banco para confirmar"
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Resumo do Saque */}
            <Card className="bg-muted/30 border-border/50">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Building2 className="h-4 w-4" />
                    <span>Origem</span>
                  </div>
                  <span className="font-medium">{saque.bookmaker_nome || "Bookmaker"}</span>
                </div>

                <div className="flex justify-center">
                  <ArrowRight className="h-4 w-4 text-primary" />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {isCryptoWithdrawal ? (
                      <Wallet className="h-4 w-4" />
                    ) : (
                      <Landmark className="h-4 w-4" />
                    )}
                    <span>Destino</span>
                  </div>
                  <div className="text-right">
                    <span className="font-medium">
                      {saque.wallet_nome || saque.banco_nome || (isCryptoWithdrawal ? "Wallet Crypto" : "Conta Bancária")}
                    </span>
                    {saque.parceiro_nome && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                        <User className="h-3 w-3" />
                        {saque.parceiro_nome}
                      </div>
                    )}
                    {isCryptoWithdrawal && saque.wallet_network && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                        <Network className="h-3 w-3" />
                        {saque.wallet_network}
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-border/50 space-y-2">
                  {isCryptoWithdrawal ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Quantidade Esperada</span>
                        <div className="text-right">
                          <span className="text-lg font-semibold text-muted-foreground">
                            {saque.qtd_coin?.toFixed(4) || "0"} {saque.coin || "USDT"}
                          </span>
                          <div className="text-xs text-muted-foreground">
                            ≈ {formatCurrency(saque.valor, "USD")} @ {saque.cotacao_original?.toFixed(4) || "1.0000"}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Valor Solicitado</span>
                      <span className="text-lg font-semibold text-muted-foreground">
                        {formatCurrency(saque.valor, saque.moeda)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Solicitado em</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(saque.data_transacao).toLocaleString("pt-BR")}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* SEÇÃO CRIPTO */}
            {isCryptoWithdrawal ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Coins className="h-4 w-4 text-primary" />
                  <span className="font-medium">Dados Reais da Liquidação</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Informe os dados exatos recebidos na blockchain. Isso permite auditar taxas de rede, spreads e moedas diferentes das solicitadas.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                {/* Quantidade Real Recebida */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="qtd-coin" className="flex items-center gap-1">
                      Qtd Recebida <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="qtd-coin"
                      type="number"
                      step="0.000001"
                      min="0"
                      value={qtdCoinRecebida}
                      onChange={(e) => setQtdCoinRecebida(e.target.value)}
                      placeholder="0.000000"
                      className="font-mono"
                      autoFocus
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="moeda-recebida" className="flex items-center gap-1">
                      Moeda <span className="text-destructive">*</span>
                    </Label>
                    <Select value={moedaRecebida} onValueChange={setMoedaRecebida}>
                      <SelectTrigger id="moeda-recebida">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {CRYPTO_COINS.map((coin) => (
                          <SelectItem key={coin} value={coin}>
                            {coin}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Rede e Cotação */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="rede" className="flex items-center gap-1">
                      Rede Blockchain <span className="text-destructive">*</span>
                    </Label>
                    <Select value={redeUtilizada} onValueChange={setRedeUtilizada}>
                      <SelectTrigger id="rede">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {BLOCKCHAIN_NETWORKS.map((net) => (
                          <SelectItem key={net.value} value={net.value}>
                            {net.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cotacao" className="flex items-center gap-1">
                      Cotação USD
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-3 w-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Cotação no momento do recebimento</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </Label>
                    <Input
                      id="cotacao"
                      type="number"
                      step="0.0001"
                      min="0"
                      value={cotacaoReal}
                      onChange={(e) => setCotacaoReal(e.target.value)}
                      placeholder="1.0000"
                      className="font-mono"
                    />
                  </div>
                </div>

                {/* Indicadores de Diferença */}
                {qtdCoinRecebidaNum > 0 && (
                  <div className="space-y-2 pt-2">
                    {/* Taxa de Rede */}
                    {temTaxaRede && (
                      <div className="flex items-center gap-2 text-sm p-2 rounded-md bg-amber-500/10 text-amber-400">
                        <TrendingDown className="h-4 w-4" />
                        <span>
                          Taxa de rede: {taxaRede.toFixed(6)} {moedaRecebida}
                          {" "}(≈ {formatCurrency(taxaRede * cotacaoRealNum, "USD")})
                        </span>
                      </div>
                    )}

                    {/* Spread */}
                    {temSpread && (
                      <div className={`flex items-center gap-2 text-sm p-2 rounded-md ${
                        spreadPercentual > 0 
                          ? "bg-emerald-500/10 text-emerald-400" 
                          : "bg-amber-500/10 text-amber-400"
                      }`}>
                        <AlertTriangle className="h-4 w-4" />
                        <span>
                          Spread: {spreadPercentual > 0 ? "+" : ""}{spreadPercentual.toFixed(2)}%
                          {" "}(cotação original: {cotacaoOriginal.toFixed(4)})
                        </span>
                      </div>
                    )}

                    {/* Moeda diferente */}
                    {moedaRecebida && saque.coin && moedaRecebida !== saque.coin && (
                      <div className="flex items-center gap-2 text-sm p-2 rounded-md bg-destructive/10 text-destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <span>
                          Moeda diferente! Esperado: {saque.coin}, Recebido: {moedaRecebida}
                        </span>
                      </div>
                    )}

                    {/* Resultado Final */}
                    <div className="flex items-center justify-between p-3 rounded-md bg-muted/50 border border-border/50">
                      <span className="text-sm font-medium">Valor USD Real</span>
                      <div className="text-right">
                        <span className={`text-lg font-bold ${
                          diferencaUsd >= 0 ? "text-emerald-400" : "text-amber-400"
                        }`}>
                          {formatCurrency(valorUsdReal, "USD")}
                        </span>
                        {Math.abs(diferencaUsd) > 0.01 && (
                          <div className="text-xs text-muted-foreground">
                            {diferencaUsd > 0 ? "+" : ""}{formatCurrency(diferencaUsd, "USD")} vs esperado
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* SEÇÃO FIAT */
              <div className="space-y-2">
                <Label htmlFor="valor-recebido" className="flex items-center gap-2">
                  Valor Real Recebido ({moedaDestinoFiat})
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="valor-recebido"
                  type="number"
                  step="0.01"
                  min="0"
                  value={valorRecebido}
                  onChange={(e) => setValorRecebido(e.target.value)}
                  placeholder="0.00"
                  className="text-lg font-mono"
                  autoFocus
                />
                
                {temDiferencaFiat && valorRecebidoNum > 0 && (
                  <div className={`flex items-center gap-2 text-sm p-2 rounded-md ${
                    diferencaFiat > 0 
                      ? "bg-emerald-500/10 text-emerald-400" 
                      : "bg-amber-500/10 text-amber-400"
                  }`}>
                    <AlertTriangle className="h-4 w-4" />
                    <span>
                      {diferencaFiat > 0 ? "Ganho cambial: +" : "Perda cambial: "}
                      {formatCurrency(Math.abs(diferencaFiat), moedaDestinoFiat)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Observações */}
            <div className="space-y-2">
              <Label htmlFor="observacoes">Observações (opcional)</Label>
              <Textarea
                id="observacoes"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Adicione observações sobre a confirmação ou recusa..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="flex flex-col gap-3 sm:flex-row sm:justify-between pt-4">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                variant="destructive"
                onClick={() => setShowRecusaConfirm(true)}
                disabled={loading}
                className="flex-1 sm:flex-none"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Recusado
              </Button>
              <Button
                onClick={handleConfirmar}
                disabled={loading || !isValid}
                className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700"
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Confirmar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alert Dialog de Confirmação de Recusa */}
      <AlertDialog open={showRecusaConfirm} onOpenChange={setShowRecusaConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Recusa do Saque</AlertDialogTitle>
            <AlertDialogDescription>
              Ao marcar como recusado, a conta bookmaker será revinculada ao projeto original
              para que você possa tentar novamente ou registrar uma perda operacional.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRecusar}
              disabled={loading}
              className="bg-destructive hover:bg-destructive/90"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar Recusa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}