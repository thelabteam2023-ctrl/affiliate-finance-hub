import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { dispatchCaixaDataChanged } from "@/hooks/useInvalidateCaixaData";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useExchangeRates } from "@/contexts/ExchangeRatesContext";
import { FIAT_CURRENCIES, CRYPTO_CURRENCIES, getCurrencySymbol, type SupportedCurrency } from "@/types/currency";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, TrendingDown, TrendingUp, Wrench, Info } from "lucide-react";

interface AjusteManualDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface Bookmaker {
  id: string;
  nome: string;
  saldo_atual: number;
  moeda: string;
  parceiro_id: string | null;
  parceiro_nome?: string;
}

interface ContaBancaria {
  id: string;
  banco: string;
  titular: string;
  parceiro_id: string;
  moeda: string;
}

interface WalletCrypto {
  id: string;
  exchange: string;
  endereco: string;
  parceiro_id: string;
  parceiro_nome?: string;
  moeda: string[]; // Array de moedas suportadas
}

type TipoDestino = "CAIXA_OPERACIONAL" | "BOOKMAKER" | "CONTA_BANCARIA" | "WALLET";

export function AjusteManualDialog({
  open,
  onClose,
  onSuccess,
}: AjusteManualDialogProps) {
  const { toast } = useToast();
  const { isOwnerOrAdmin, isSystemOwner } = usePermissions();
  const { workspaceId } = useWorkspace();
  const { getRate, lastUpdate } = useExchangeRates();

  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(false);

  // Form state
  const [direcao, setDirecao] = useState<"ENTRADA" | "SAIDA">("ENTRADA");
  const [tipoDestino, setTipoDestino] = useState<TipoDestino>("CAIXA_OPERACIONAL");
  const [moeda, setMoeda] = useState<string>("BRL");
  const [valor, setValor] = useState<string>("");
  const [valorDisplay, setValorDisplay] = useState<string>("");
  const [motivo, setMotivo] = useState<string>("");
  
  // Destino específico
  const [bookmakerId, setBookmakerId] = useState<string>("");
  const [contaId, setContaId] = useState<string>("");
  const [walletId, setWalletId] = useState<string>("");

  // Data
  const [bookmakers, setBookmakers] = useState<Bookmaker[]>([]);
  const [contas, setContas] = useState<ContaBancaria[]>([]);
  const [wallets, setWallets] = useState<WalletCrypto[]>([]);

  // Verificar permissão
  const canAccess = isOwnerOrAdmin || isSystemOwner;

  // Moedas disponíveis baseadas na entidade selecionada
  const moedasDisponiveis = useMemo(() => {
    if (tipoDestino === "CAIXA_OPERACIONAL") {
      // Caixa Operacional: todas as moedas FIAT do sistema
      return FIAT_CURRENCIES.map(c => ({ value: c.value, label: `${c.value} - ${c.label}`, symbol: c.symbol }));
    }
    
    if (tipoDestino === "BOOKMAKER" && bookmakerId) {
      const bk = bookmakers.find(b => b.id === bookmakerId);
      if (bk) {
        // Apenas a moeda nativa da bookmaker
        const currencyInfo = [...FIAT_CURRENCIES, ...CRYPTO_CURRENCIES].find(c => c.value === bk.moeda);
        return [{
          value: bk.moeda,
          label: currencyInfo ? `${bk.moeda} - ${currencyInfo.label}` : bk.moeda,
          symbol: getCurrencySymbol(bk.moeda)
        }];
      }
    }
    
    if (tipoDestino === "CONTA_BANCARIA" && contaId) {
      const conta = contas.find(c => c.id === contaId);
      if (conta && conta.moeda) {
        const currencyInfo = FIAT_CURRENCIES.find(c => c.value === conta.moeda);
        return [{
          value: conta.moeda,
          label: currencyInfo ? `${conta.moeda} - ${currencyInfo.label}` : conta.moeda,
          symbol: getCurrencySymbol(conta.moeda)
        }];
      }
    }
    
    if (tipoDestino === "WALLET" && walletId) {
      const wallet = wallets.find(w => w.id === walletId);
      if (wallet && wallet.moeda && wallet.moeda.length > 0) {
        // Wallet suporta múltiplas moedas crypto
        return wallet.moeda.map(m => {
          const currencyInfo = CRYPTO_CURRENCIES.find(c => c.value === m);
          return {
            value: m,
            label: currencyInfo ? `${m} - ${currencyInfo.label}` : m,
            symbol: getCurrencySymbol(m)
          };
        });
      }
    }
    
    // Fallback: BRL para casos não cobertos
    return [{ value: "BRL", label: "BRL - Real Brasileiro", symbol: "R$" }];
  }, [tipoDestino, bookmakerId, contaId, walletId, bookmakers, contas, wallets]);

  // Auto-selecionar moeda quando há apenas uma opção
  useEffect(() => {
    if (moedasDisponiveis.length === 1 && moeda !== moedasDisponiveis[0].value) {
      setMoeda(moedasDisponiveis[0].value);
    } else if (moedasDisponiveis.length > 0 && !moedasDisponiveis.find(m => m.value === moeda)) {
      setMoeda(moedasDisponiveis[0].value);
    }
  }, [moedasDisponiveis, moeda]);

  // Calcular valor de referência em BRL
  const valorBRLReferencia = useMemo(() => {
    const valorNum = parseFloat(valor) || 0;
    if (moeda === "BRL" || valorNum === 0) return null;
    
    const rate = getRate(moeda);
    return valorNum * rate;
  }, [valor, moeda, getRate]);

  // Obter cotação atual para snapshot
  const cotacaoAtual = useMemo(() => {
    if (moeda === "BRL") return 1;
    return getRate(moeda);
  }, [moeda, getRate]);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open]);

  // Limpar seleções específicas quando muda o tipo de destino
  useEffect(() => {
    setBookmakerId("");
    setContaId("");
    setWalletId("");
    setMoeda("BRL");
    setValor("");
    setValorDisplay("");
  }, [tipoDestino]);

  const fetchData = async () => {
    setFetchingData(true);
    try {
      // PROTEÇÃO DE PARCEIROS INATIVOS:
      // Buscar bookmakers, contas e wallets apenas de PARCEIROS ATIVOS
      // O banco de dados também valida via trigger, mas a UI deve prevenir a seleção
      const [bookmakersRes, contasRes, walletsRes] = await Promise.all([
        supabase
          .from("bookmakers")
          .select(`
            id, 
            nome, 
            saldo_atual, 
            moeda, 
            parceiro_id,
            parceiros!inner(nome, status)
          `)
          .in("status", ["ativo", "limitada"])
          // CRÍTICO: Apenas bookmakers de parceiros ATIVOS
          .eq("parceiros.status", "ativo")
          .order("nome"),
        supabase
          .from("contas_bancarias")
          .select(`
            id, 
            banco, 
            titular, 
            parceiro_id, 
            moeda,
            parceiros!inner(status)
          `)
          // CRÍTICO: Apenas contas de parceiros ATIVOS
          .eq("parceiros.status", "ativo")
          .order("banco"),
        supabase
          .from("wallets_crypto")
          .select(`
            id, 
            exchange, 
            endereco, 
            parceiro_id, 
            moeda,
            parceiros!inner(nome, status)
          `)
          // CRÍTICO: Apenas wallets de parceiros ATIVOS
          .eq("parceiros.status", "ativo")
          .order("exchange"),
      ]);

      const mappedBookmakers: Bookmaker[] = (bookmakersRes.data || []).map((bk: any) => ({
        id: bk.id,
        nome: bk.nome,
        saldo_atual: bk.saldo_atual || 0,
        moeda: bk.moeda || "BRL",
        parceiro_id: bk.parceiro_id,
        parceiro_nome: bk.parceiros?.nome,
      }));

      const mappedContas: ContaBancaria[] = (contasRes.data || []).map((c: any) => ({
        id: c.id,
        banco: c.banco,
        titular: c.titular,
        parceiro_id: c.parceiro_id,
        moeda: c.moeda || "BRL",
      }));

      const mappedWallets: WalletCrypto[] = (walletsRes.data || []).map((w: any) => ({
        id: w.id,
        exchange: w.exchange,
        endereco: w.endereco,
        parceiro_id: w.parceiro_id,
        parceiro_nome: w.parceiros?.nome,
        moeda: Array.isArray(w.moeda) ? w.moeda : ["USDT"],
      }));

      setBookmakers(mappedBookmakers);
      setContas(mappedContas);
      setWallets(mappedWallets);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast({
        title: "Erro ao carregar dados",
        description: "Não foi possível carregar as entidades disponíveis.",
        variant: "destructive",
      });
    } finally {
      setFetchingData(false);
    }
  };

  const resetForm = () => {
    setDirecao("ENTRADA");
    setTipoDestino("CAIXA_OPERACIONAL");
    setMoeda("BRL");
    setValor("");
    setValorDisplay("");
    setMotivo("");
    setBookmakerId("");
    setContaId("");
    setWalletId("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // Format currency input
  const formatCurrencyInput = (value: string): string => {
    const numericValue = value.replace(/[^\d]/g, "");
    if (!numericValue) return "";
    const numberValue = parseInt(numericValue, 10) / 100;
    return numberValue.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCurrencyInput(e.target.value);
    setValorDisplay(formatted);
    const numericValue = formatted.replace(/\./g, "").replace(",", ".");
    setValor(numericValue);
  };

  // Obter nome da entidade selecionada
  const getEntidadeNome = (): string => {
    if (tipoDestino === "CAIXA_OPERACIONAL") return "Caixa Operacional";
    if (tipoDestino === "BOOKMAKER") {
      const bk = bookmakers.find(b => b.id === bookmakerId);
      return bk ? `${bk.nome}${bk.parceiro_nome ? ` (${bk.parceiro_nome})` : ""}` : "Bookmaker";
    }
    if (tipoDestino === "CONTA_BANCARIA") {
      const conta = contas.find(c => c.id === contaId);
      return conta ? `${conta.banco} - ${conta.titular}` : "Conta Bancária";
    }
    if (tipoDestino === "WALLET") {
      const wallet = wallets.find(w => w.id === walletId);
      return wallet ? `${wallet.exchange} - ${wallet.endereco.slice(0, 10)}...` : "Wallet";
    }
    return "";
  };

  // Validar se pode submeter
  const canSubmit = (): boolean => {
    if (!valor || parseFloat(valor) <= 0) return false;
    if (!motivo.trim()) return false;
    if (tipoDestino === "BOOKMAKER" && !bookmakerId) return false;
    if (tipoDestino === "CONTA_BANCARIA" && !contaId) return false;
    if (tipoDestino === "WALLET" && !walletId) return false;
    return true;
  };

  const handleSubmit = async () => {
    if (!canSubmit()) {
      toast({
        title: "Dados incompletos",
        description: "Preencha todos os campos obrigatórios.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      if (!workspaceId) throw new Error("Workspace não encontrado");

      const valorNumerico = parseFloat(valor);
      const isCrypto = CRYPTO_CURRENCIES.some(c => c.value === moeda);
      
      // Snapshot de cotação para moedas estrangeiras
      const cotacaoSnapshot = moeda !== "BRL" ? cotacaoAtual : null;
      const cotacaoSnapshotAt = moeda !== "BRL" ? new Date().toISOString() : null;
      const valorBrlRef = moeda !== "BRL" ? valorNumerico * cotacaoAtual : null;

      // Construir dados da transação com campos de auditoria completos
      const transactionData: Record<string, any> = {
        user_id: user.id,
        workspace_id: workspaceId,
        tipo_transacao: "AJUSTE_MANUAL",
        tipo_moeda: isCrypto ? "CRYPTO" : "FIAT",
        moeda: moeda,
        valor: valorNumerico,
        descricao: `[AJUSTE ${direcao}] ${motivo}`,
        status: "CONFIRMADO",
        data_transacao: new Date().toISOString().split("T")[0],
        impacta_caixa_operacional: tipoDestino === "CAIXA_OPERACIONAL",
        // Campos obrigatórios de auditoria para ajustes
        ajuste_motivo: motivo.trim(),
        ajuste_direcao: direcao,
        // Campos de snapshot multi-moeda
        cotacao: cotacaoSnapshot,
        cotacao_snapshot_at: cotacaoSnapshotAt,
        valor_usd_referencia: valorBrlRef,
        auditoria_metadata: {
          registrado_em: new Date().toISOString(),
          tipo_destino: tipoDestino,
          entidade_nome: getEntidadeNome(),
          moeda_entidade: moeda,
          cotacao_fonte: moeda !== "BRL" ? "ExchangeRatesContext" : null,
          cotacao_timestamp: lastUpdate?.toISOString(),
          user_agent: navigator.userAgent,
        },
      };

      // Definir origem/destino baseado na direção e tipo
      if (direcao === "ENTRADA") {
        // Entrada: origem é CAIXA_OPERACIONAL (ajuste), destino é a entidade
        transactionData.origem_tipo = "CAIXA_OPERACIONAL";
        
        switch (tipoDestino) {
          case "CAIXA_OPERACIONAL":
            transactionData.destino_tipo = "CAIXA_OPERACIONAL";
            break;
          case "BOOKMAKER":
            transactionData.destino_tipo = "BOOKMAKER";
            transactionData.destino_bookmaker_id = bookmakerId;
            // Valor na moeda da casa
            transactionData.valor_destino = valorNumerico;
            transactionData.moeda_destino = moeda;
            break;
          case "CONTA_BANCARIA":
            transactionData.destino_tipo = "PARCEIRO_CONTA";
            transactionData.destino_conta_bancaria_id = contaId;
            transactionData.valor_destino = valorNumerico;
            transactionData.moeda_destino = moeda;
            break;
          case "WALLET":
            transactionData.destino_tipo = "PARCEIRO_WALLET";
            transactionData.destino_wallet_id = walletId;
            transactionData.valor_destino = valorNumerico;
            transactionData.moeda_destino = moeda;
            break;
        }
      } else {
        // Saída: origem é a entidade, destino é CAIXA_OPERACIONAL (ajuste)
        transactionData.destino_tipo = "CAIXA_OPERACIONAL";
        
        switch (tipoDestino) {
          case "CAIXA_OPERACIONAL":
            transactionData.origem_tipo = "CAIXA_OPERACIONAL";
            break;
          case "BOOKMAKER":
            transactionData.origem_tipo = "BOOKMAKER";
            transactionData.origem_bookmaker_id = bookmakerId;
            transactionData.valor_origem = valorNumerico;
            transactionData.moeda_origem = moeda;
            break;
          case "CONTA_BANCARIA":
            transactionData.origem_tipo = "PARCEIRO_CONTA";
            transactionData.origem_conta_bancaria_id = contaId;
            transactionData.valor_origem = valorNumerico;
            transactionData.moeda_origem = moeda;
            break;
          case "WALLET":
            transactionData.origem_tipo = "PARCEIRO_WALLET";
            transactionData.origem_wallet_id = walletId;
            transactionData.valor_origem = valorNumerico;
            transactionData.moeda_origem = moeda;
            break;
        }
      }

      const { error } = await supabase.from("cash_ledger").insert([transactionData] as any);
      if (error) throw error;

      toast({
        title: "Ajuste registrado",
        description: `Ajuste de ${direcao === "ENTRADA" ? "entrada" : "saída"} de ${getCurrencySymbol(moeda)} ${valorDisplay} em ${getEntidadeNome()} registrado com sucesso.`,
      });

      handleClose();
      
      // Disparar evento para atualizar UI imediatamente
      dispatchCaixaDataChanged();
      
      onSuccess();
    } catch (error: any) {
      console.error("Erro ao registrar ajuste:", error);
      
      let errorMessage = error.message;
      if (error.message?.includes("Ajustes manuais requerem um motivo")) {
        errorMessage = "O motivo do ajuste é obrigatório. Por favor, descreva a razão da correção.";
      } else if (error.message?.includes("Ajustes manuais requerem direção")) {
        errorMessage = "Selecione se o ajuste é uma entrada ou saída de valores.";
      } else if (error.code === "23503") {
        errorMessage = "A entidade selecionada não existe mais. Atualize a página e tente novamente.";
      } else if (error.code === "23514") {
        errorMessage = "Valor inválido. Verifique os dados e tente novamente.";
      }
      
      toast({
        title: "Erro ao registrar ajuste",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!canAccess) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Acesso Negado</DialogTitle>
          </DialogHeader>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Apenas administradores e proprietários do workspace podem realizar ajustes manuais.
            </AlertDescription>
          </Alert>
        </DialogContent>
      </Dialog>
    );
  }

  const selectedCurrency = moedasDisponiveis.find(m => m.value === moeda);
  const currencySymbol = selectedCurrency?.symbol || getCurrencySymbol(moeda);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-warning" />
            Ajuste Manual Multi-Moeda
          </DialogTitle>
          <DialogDescription>
            Lançamento contábil vinculado a entidade real do sistema.
          </DialogDescription>
        </DialogHeader>

        {/* Aviso de imutabilidade */}
        <Alert className="border-warning/30 bg-warning/5">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-xs text-muted-foreground">
            Este lançamento é contábil, auditável e <strong>não poderá ser editado ou removido</strong>. 
            A moeda é derivada automaticamente da entidade selecionada.
          </AlertDescription>
        </Alert>

        {fetchingData ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Direção */}
            <div className="space-y-2">
              <Label>Direção do Ajuste</Label>
              <RadioGroup
                value={direcao}
                onValueChange={(value) => setDirecao(value as "ENTRADA" | "SAIDA")}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="ENTRADA" id="entrada" />
                  <Label htmlFor="entrada" className="flex items-center gap-1 cursor-pointer">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Entrada (+)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="SAIDA" id="saida" />
                  <Label htmlFor="saida" className="flex items-center gap-1 cursor-pointer">
                    <TrendingDown className="h-4 w-4 text-destructive" />
                    Saída (-)
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Destino do Ajuste */}
            <div className="space-y-2">
              <Label>Aplicar ajuste em</Label>
              <Select value={tipoDestino} onValueChange={(v) => setTipoDestino(v as TipoDestino)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione onde aplicar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CAIXA_OPERACIONAL">Caixa Operacional</SelectItem>
                  <SelectItem value="BOOKMAKER">Bookmaker</SelectItem>
                  <SelectItem value="CONTA_BANCARIA">Conta Bancária</SelectItem>
                  <SelectItem value="WALLET">Wallet Crypto</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Seleção específica: Bookmaker */}
            {tipoDestino === "BOOKMAKER" && (
              <div className="space-y-2">
                <Label>Bookmaker</Label>
                <Select value={bookmakerId} onValueChange={setBookmakerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o bookmaker" />
                  </SelectTrigger>
                  <SelectContent>
                    {bookmakers.map((bk) => (
                      <SelectItem key={bk.id} value={bk.id}>
                        <div className="flex items-center gap-2">
                          <span>{bk.nome}</span>
                          <Badge variant="secondary" className="text-xs">
                            {bk.moeda}
                          </Badge>
                          <span className="text-muted-foreground text-xs">
                            ({getCurrencySymbol(bk.moeda)} {bk.saldo_atual.toFixed(2)})
                          </span>
                          {bk.parceiro_nome && (
                            <span className="text-muted-foreground text-xs">• {bk.parceiro_nome}</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Seleção específica: Conta Bancária */}
            {tipoDestino === "CONTA_BANCARIA" && (
              <div className="space-y-2">
                <Label>Conta Bancária</Label>
                <Select value={contaId} onValueChange={setContaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a conta" />
                  </SelectTrigger>
                  <SelectContent>
                    {contas.map((conta) => (
                      <SelectItem key={conta.id} value={conta.id}>
                        <div className="flex items-center gap-2">
                          <span>{conta.banco} - {conta.titular}</span>
                          <Badge variant="secondary" className="text-xs">
                            {conta.moeda}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Seleção específica: Wallet */}
            {tipoDestino === "WALLET" && (
              <div className="space-y-2">
                <Label>Wallet</Label>
                <Select value={walletId} onValueChange={setWalletId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a wallet" />
                  </SelectTrigger>
                  <SelectContent>
                    {wallets.map((wallet) => (
                      <SelectItem key={wallet.id} value={wallet.id}>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium uppercase">{wallet.exchange}</span>
                            <div className="flex gap-1">
                              {wallet.moeda.slice(0, 3).map((m) => (
                                <Badge key={m} variant="secondary" className="text-[10px] px-1.5 py-0">
                                  {m}
                                </Badge>
                              ))}
                              {wallet.moeda.length > 3 && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  +{wallet.moeda.length - 3}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            {wallet.parceiro_nome && <span>{wallet.parceiro_nome}</span>}
                            {wallet.parceiro_nome && <span>•</span>}
                            <span className="font-mono">{wallet.endereco.slice(0, 6)}...{wallet.endereco.slice(-4)}</span>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Moeda - Derivada da entidade */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Moeda
                {moedasDisponiveis.length === 1 && tipoDestino !== "CAIXA_OPERACIONAL" && (
                  <Badge variant="outline" className="text-xs font-normal">
                    <Info className="h-3 w-3 mr-1" />
                    Moeda da entidade
                  </Badge>
                )}
              </Label>
              <Select 
                value={moeda} 
                onValueChange={setMoeda}
                disabled={moedasDisponiveis.length === 1 && tipoDestino !== "CAIXA_OPERACIONAL"}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {moedasDisponiveis.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Valor */}
            <div className="space-y-2">
              <Label>Valor</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {currencySymbol}
                </span>
                <Input
                  value={valorDisplay}
                  onChange={handleValorChange}
                  placeholder="0,00"
                  className="pl-10"
                />
              </div>
              {/* Referência em BRL para moedas estrangeiras */}
              {valorBRLReferencia !== null && valorBRLReferencia > 0 && (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  ≈ R$ {valorBRLReferencia.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 
                  <span className="text-muted-foreground/70">
                    (cotação: {cotacaoAtual.toFixed(4)})
                  </span>
                </div>
              )}
            </div>

            {/* Motivo */}
            <div className="space-y-2">
              <Label>Motivo do Ajuste *</Label>
              <Textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Descreva o motivo da correção contábil..."
                rows={3}
              />
            </div>

            {/* Preview */}
            {valor && parseFloat(valor) > 0 && (
              <Alert className={direcao === "ENTRADA" ? "border-primary/30 bg-primary/10" : "border-destructive/30 bg-destructive/10"}>
                <AlertDescription className="flex items-center gap-2">
                  {direcao === "ENTRADA" ? (
                    <TrendingUp className="h-4 w-4 text-primary shrink-0" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-destructive shrink-0" />
                  )}
                  <span>
                    {direcao === "ENTRADA" ? "Adicionar" : "Subtrair"}{" "}
                    <strong>{currencySymbol} {valorDisplay}</strong> em{" "}
                    <strong>{getEntidadeNome()}</strong>
                    {valorBRLReferencia !== null && (
                      <span className="text-muted-foreground"> (≈ R$ {valorBRLReferencia.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
                    )}
                  </span>
                </AlertDescription>
              </Alert>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={handleClose} disabled={loading}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={loading || !canSubmit()}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Registrar Ajuste
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
