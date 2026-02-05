import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { dispatchCaixaDataChanged } from "@/hooks/useInvalidateCaixaData";
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
  Info,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  qtd_coin?: number; // Estimativa de coins a receber
  cotacao_original?: number;
  moeda_origem?: string;
  valor_origem?: number; // Valor na moeda da casa (débito)
  valor_destino?: number; // Valor esperado na moeda de destino (estimativa)
  cotacao?: number; // Cotação Casa→Destino (ex: EUR/BRL = 6.21)
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

// Símbolos de moeda
const CURRENCY_SYMBOLS: Record<string, string> = {
  BRL: "R$", USD: "$", EUR: "€", GBP: "£", MXN: "$", MYR: "RM", ARS: "$", COP: "$"
};

export function ConfirmarSaqueDialog({
  open,
  onClose,
  onSuccess,
  saque,
}: ConfirmarSaqueDialogProps) {
  const [loading, setLoading] = useState(false);
  const [observacoes, setObservacoes] = useState("");
  const [showRecusaConfirm, setShowRecusaConfirm] = useState(false);
  const [parceiroInativo, setParceiroInativo] = useState<string | null>(null);
  
  // Estados para saque FIAT
  const [valorRecebido, setValorRecebido] = useState<string>("");
  
  // Estados para saque CRIPTO - SIMPLIFICADO (apenas quantidade de coins)
  const [qtdCoinRecebida, setQtdCoinRecebida] = useState<string>("");
  
  // Data real de confirmação/recebimento (para métricas de tempo de saque)
  const [dataConfirmacao, setDataConfirmacao] = useState<string>("");

  // Determinar se é saque cripto
  const isCryptoWithdrawal = !!saque?.destino_wallet_id;

  // Resetar estados quando abre o dialog e verificar status do parceiro
  useEffect(() => {
    if (open && saque) {
      setObservacoes("");
      setParceiroInativo(null);
      // Data de confirmação padrão = hoje
      setDataConfirmacao(new Date().toISOString().split("T")[0]);
      
      if (isCryptoWithdrawal) {
        // Pré-preencher com estimativa
        setQtdCoinRecebida(saque.qtd_coin?.toString() || "");
        setValorRecebido("");
      } else {
        // Saque FIAT - pré-preencher com valor ESPERADO na moeda de destino
        const valorDestinoEstimado = saque.valor_destino || saque.valor;
        setValorRecebido(valorDestinoEstimado.toString());
        setQtdCoinRecebida("");
      }
      
      // PROTEÇÃO: Verificar se o parceiro ainda está ativo
      // O banco também valida via trigger, mas a UI deve prevenir ação
      const verificarParceiroAtivo = async () => {
        if (saque.origem_bookmaker_id) {
          const { data } = await supabase
            .from("bookmakers")
            .select("parceiros:parceiro_id(nome, status)")
            .eq("id", saque.origem_bookmaker_id)
            .single();
          
          const parceiro = (data as any)?.parceiros;
          if (parceiro && parceiro.status !== "ativo") {
            setParceiroInativo(parceiro.nome);
          }
        }
      };
      verificarParceiroAtivo();
    }
  }, [open, saque, isCryptoWithdrawal]);

  const formatCurrency = (value: number, currency: string = "BRL") => {
    // Tratar moedas cripto
    const cryptoCoins = ["USDT", "USDC", "ETH", "BTC", "BNB", "TRX", "SOL", "MATIC"];
    if (cryptoCoins.includes(currency.toUpperCase())) {
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

  // Dados do saque cripto
  const qtdCoinRecebidaNum = parseFloat(qtdCoinRecebida) || 0;
  const qtdCoinEsperada = saque?.qtd_coin || 0;
  const coinMoeda = saque?.coin || "USDT";
  const moedaCasa = saque?.moeda_origem || saque?.moeda || "USD";
  const valorCasa = saque?.valor_origem || saque?.valor || 0;
  const simboloMoedaCasa = CURRENCY_SYMBOLS[moedaCasa] || moedaCasa;
  
  // Diferença simples em coins (esperado - recebido)
  const diferencaCoin = qtdCoinEsperada - qtdCoinRecebidaNum;
  const temDiferencaCrypto = Math.abs(diferencaCoin) > 0.001;

  // Dados do saque FIAT - CORRIGIDO para moeda de destino
  const valorRecebidoNum = parseFloat(valorRecebido) || 0;
  const moedaDestinoFiat = saque?.moeda_destino || "BRL";
  const valorEsperadoDestino = saque?.valor_destino || saque?.valor || 0;
  const cotacaoUsada = saque?.cotacao || 0; // Cotação Casa→Destino (ex: EUR/BRL = 6.21)
  
  // Diferença calculada na moeda de DESTINO (BRL), não na moeda da casa
  const diferencaFiat = valorRecebidoNum - valorEsperadoDestino;
  const temDiferencaFiat = Math.abs(diferencaFiat) > 0.01;

  // Validação - SIMPLIFICADA para crypto (apenas quantidade)
  // PROTEÇÃO: Bloquear se parceiro está inativo
  const isValidCrypto = isCryptoWithdrawal && qtdCoinRecebidaNum > 0;
  const isValidFiat = !isCryptoWithdrawal && valorRecebidoNum > 0;
  const isValid = (isValidCrypto || isValidFiat) && !parceiroInativo;

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
        // Adicionar detalhes da liquidação cripto (SIMPLIFICADO)
        if (temDiferencaCrypto) {
          const tipoDif = diferencaCoin > 0 ? "PERDA" : "GANHO";
          descricaoFinal = descricaoFinal
            ? `${descricaoFinal}\n[Diferença ${tipoDif}]: ${Math.abs(diferencaCoin).toFixed(6)} ${coinMoeda}`
            : `[Diferença ${tipoDif}]: ${Math.abs(diferencaCoin).toFixed(6)} ${coinMoeda}`;
        }

        // Atualizar com dados reais de cripto
        const { data: updateResult, error } = await supabase
          .from("cash_ledger")
          .update({
            status: "CONFIRMADO",
            qtd_coin: qtdCoinRecebidaNum,
            descricao: descricaoFinal || null,
            transit_status: "CONFIRMED", // Confirmar trânsito para creditação na wallet
            data_confirmacao: dataConfirmacao ? new Date(dataConfirmacao + "T12:00:00").toISOString() : new Date().toISOString(),
          })
          .eq("id", saque.id)
          .eq("status", "PENDENTE")
          .select("id");

        if (error) throw error;
        
        // Verificar se o update afetou a linha (proteção contra concorrência)
        if (!updateResult || updateResult.length === 0) {
          toast.error("Este saque já foi processado por outro usuário.");
          onClose();
          return;
        }

        // Registrar diferença se houver (SIMPLIFICADO - apenas em coins)
        if (temDiferencaCrypto && saque.origem_bookmaker_id) {
          const { data: userData } = await supabase.auth.getUser();
          const { data: bookmaker } = await supabase
            .from("bookmakers")
            .select("workspace_id")
            .eq("id", saque.origem_bookmaker_id)
            .single();

          if (bookmaker && userData?.user) {
            // diferencaCoin > 0 significa que recebemos MENOS do que esperado = PERDA
            const tipoAjuste = diferencaCoin > 0 ? "PERDA_CAMBIAL" : "GANHO_CAMBIAL";
            await supabase.from("cash_ledger").insert({
              tipo_transacao: tipoAjuste,
              valor: Math.abs(diferencaCoin),
              moeda: coinMoeda,
              status: "CONFIRMADO",
              data_transacao: new Date().toISOString().split("T")[0],
              descricao: `${tipoAjuste === "GANHO_CAMBIAL" ? "Ganho" : "Perda"} na liquidação cripto - ${saque.bookmaker_nome || "Saque"} (diferença: ${Math.abs(diferencaCoin).toFixed(6)} ${coinMoeda})`,
              workspace_id: bookmaker.workspace_id,
              user_id: userData.user.id,
              tipo_moeda: "CRYPTO",
              impacta_caixa_operacional: false,
              referencia_transacao_id: saque.id,
              destino_wallet_id: saque.destino_wallet_id,
              coin: coinMoeda,
              qtd_coin: Math.abs(diferencaCoin),
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

        const { data: updateResultFiat, error } = await supabase
          .from("cash_ledger")
          .update({
            status: "CONFIRMADO",
            valor_confirmado: valorRecebidoNum,
            descricao: descricaoFinal || null,
            data_confirmacao: dataConfirmacao ? new Date(dataConfirmacao + "T12:00:00").toISOString() : new Date().toISOString(),
          })
          .eq("id", saque.id)
          .eq("status", "PENDENTE")
          .select("id");

        if (error) throw error;
        
        // Verificar se o update afetou a linha (proteção contra concorrência)
        if (!updateResultFiat || updateResultFiat.length === 0) {
          toast.error("Este saque já foi processado por outro usuário.");
          onClose();
          return;
        }

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

      toast.success("Saque confirmado com sucesso!");
      resetForm();
      
      // Disparar evento para atualizar UI imediatamente
      dispatchCaixaDataChanged();
      
      onSuccess();
      onClose();
    } catch (error: any) {
      // Tratamento especial para erros de parceiro inativo (trigger do banco)
      if (error.message?.includes("inativo") || error.message?.includes("Parceiro")) {
        toast.error("Parceiro está inativo. Reative-o antes de confirmar esta operação.");
      } else {
        toast.error("Erro ao confirmar saque: " + error.message);
      }
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
    setDataConfirmacao("");
  };

  if (!saque) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-warning" />
              Confirmação de Saque {isCryptoWithdrawal ? "Cripto" : ""}
            </DialogTitle>
            <DialogDescription>
              {isCryptoWithdrawal 
                ? "Informe a quantidade real de coins recebida na wallet"
                : "Informe o valor real recebido no banco para confirmar"
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* ALERTA DE PARCEIRO INATIVO */}
            {parceiroInativo && (
              <Card className="border-destructive/50 bg-destructive/10">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-destructive">Parceiro Inativo</p>
                      <p className="text-sm text-muted-foreground">
                        O parceiro <strong>{parceiroInativo}</strong> está inativo. 
                        Não é possível confirmar este saque até que o parceiro seja reativado.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Resumo do Saque */}
            <Card className="bg-muted/30 border-border/50">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Building2 className="h-4 w-4" />
                    <span>Origem</span>
                  </div>
                  <div className="text-right">
                    <span className="font-medium">{saque.bookmaker_nome || "Bookmaker"}</span>
                    {isCryptoWithdrawal && (
                      <div className="text-xs text-muted-foreground">
                        Sacou: {simboloMoedaCasa} {valorCasa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                    )}
                  </div>
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
                        <span className="text-sm text-muted-foreground">Estimativa</span>
                        <div className="text-right">
                          <span className="text-lg font-semibold text-muted-foreground">
                            ~{qtdCoinEsperada.toFixed(4)} {coinMoeda}
                          </span>
                          <Badge variant="outline" className="ml-2 text-xs">
                            estimado
                          </Badge>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Valor Sacado (moeda da casa) */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Valor Sacado</span>
                        <span className="text-lg font-semibold">
                          {formatCurrency(valorCasa, moedaCasa)}
                        </span>
                      </div>
                      {/* Valor Esperado (moeda de destino) */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Valor Esperado</span>
                        <div className="text-right">
                          <span className="text-lg font-semibold text-muted-foreground">
                            ~{formatCurrency(valorEsperadoDestino, moedaDestinoFiat)}
                          </span>
                          <Badge variant="outline" className="ml-2 text-xs">
                            estimado
                          </Badge>
                        </div>
                      </div>
                      {/* Cotação usada na estimativa */}
                      {cotacaoUsada > 0 && moedaCasa !== moedaDestinoFiat && (
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Cotação ({moedaCasa}/{moedaDestinoFiat})</span>
                          <span>{cotacaoUsada.toFixed(4)}</span>
                        </div>
                      )}
                    </>
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

            {/* SEÇÃO CRIPTO - SIMPLIFICADA */}
            {isCryptoWithdrawal ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Coins className="h-4 w-4 text-primary" />
                  <span className="font-medium">Quantidade Real Recebida</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Informe a quantidade exata de {coinMoeda} recebida na wallet. A diferença será registrada automaticamente.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                {/* Campo único: Quantidade de coins recebida */}
                <div className="space-y-2">
                  <Label htmlFor="qtd-coin" className="flex items-center gap-1">
                    Quantidade de {coinMoeda} Recebida <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="qtd-coin"
                    type="number"
                    step="0.000001"
                    min="0"
                    value={qtdCoinRecebida}
                    onChange={(e) => setQtdCoinRecebida(e.target.value)}
                    placeholder="0.000000"
                    className="font-mono text-lg"
                    autoFocus
                  />
                </div>

                {/* Indicador de diferença - SIMPLIFICADO */}
                {qtdCoinRecebidaNum > 0 && temDiferencaCrypto && (
                  <div className={`flex items-center gap-2 text-sm p-3 rounded-md ${
                    diferencaCoin > 0 
                      ? "bg-warning/10 text-warning border border-warning/30" 
                      : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                  }`}>
                    <AlertTriangle className="h-4 w-4" />
                    <span>
                      {diferencaCoin > 0 ? "Diferença (perda): " : "Diferença (ganho): "}
                      <strong>{Math.abs(diferencaCoin).toFixed(6)} {coinMoeda}</strong>
                    </span>
                  </div>
                )}
              </div>
            ) : (
              /* SEÇÃO FIAT - CORRIGIDA para moeda de destino */
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-primary" />
                  <span className="font-medium">Valor Real Recebido</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Informe o valor exato que você recebeu na conta bancária em {moedaDestinoFiat}. A diferença entre esperado e recebido será registrada como resultado da liquidação cambial.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="valor-recebido" className="flex items-center gap-2">
                    Valor Recebido ({moedaDestinoFiat})
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
                </div>
                
                {temDiferencaFiat && valorRecebidoNum > 0 && (
                  <div className={`flex items-center gap-2 text-sm p-3 rounded-md ${
                    diferencaFiat > 0 
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" 
                      : "bg-warning/10 text-warning border border-warning/30"
                  }`}>
                    <AlertTriangle className="h-4 w-4" />
                    <span>
                      {diferencaFiat > 0 ? "Ganho na liquidação: +" : "Perda na liquidação: "}
                      <strong>{formatCurrency(Math.abs(diferencaFiat), moedaDestinoFiat)}</strong>
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Data de Confirmação (Recebimento Real) */}
            <div className="space-y-2">
              <Label htmlFor="data-confirmacao" className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Data de Recebimento
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Data em que o valor foi efetivamente recebido na conta/wallet. Usado para calcular métricas de "tempo médio de saque".</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <Input
                id="data-confirmacao"
                type="date"
                value={dataConfirmacao}
                onChange={(e) => setDataConfirmacao(e.target.value)}
                className="max-w-[200px]"
              />
              <p className="text-xs text-muted-foreground">
                Solicitado em: {saque?.data_transacao ? new Date(saque.data_transacao).toLocaleDateString("pt-BR") : "-"}
              </p>
            </div>

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
