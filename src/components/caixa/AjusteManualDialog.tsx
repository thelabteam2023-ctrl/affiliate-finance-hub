import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useWorkspace } from "@/hooks/useWorkspace";
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
import { Loader2, AlertTriangle, TrendingDown, TrendingUp, Wrench } from "lucide-react";

interface AjusteManualDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface Bookmaker {
  id: string;
  nome: string;
  saldo_operavel: number;
  moeda: string;
}

interface ContaBancaria {
  id: string;
  banco: string;
  titular: string;
  parceiro_id: string;
}

interface WalletCrypto {
  id: string;
  exchange: string;
  endereco: string;
  parceiro_id: string;
}

const MOEDAS_FIAT = [
  { value: "BRL", label: "Real Brasileiro" },
  { value: "USD", label: "Dólar Americano" },
  { value: "EUR", label: "Euro" },
  { value: "GBP", label: "Libra Esterlina" },
];

export function AjusteManualDialog({
  open,
  onClose,
  onSuccess,
}: AjusteManualDialogProps) {
  const { toast } = useToast();
  const { isOwnerOrAdmin, isSystemOwner } = usePermissions();
  const { workspaceId } = useWorkspace();
  const [loading, setLoading] = useState(false);

  // Form state
  const [direcao, setDirecao] = useState<"ENTRADA" | "SAIDA">("ENTRADA");
  const [tipoDestino, setTipoDestino] = useState<string>("CAIXA_OPERACIONAL");
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

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open]);

  const fetchData = async () => {
    try {
      // Para bookmakers, usamos RPC canônica via query direta
      // (não temos projetoId aqui, então buscamos todos os bookmakers via tabela)
      const [bookmarkersRes, contasRes, walletsRes] = await Promise.all([
        supabase.from("bookmakers").select("id, nome, saldo_atual, moeda").order("nome"),
        supabase.from("contas_bancarias").select("id, banco, titular, parceiro_id").order("banco"),
        supabase.from("wallets_crypto").select("id, exchange, endereco, parceiro_id").order("exchange"),
      ]);

      // Mapear para formato compatível com UI (usar saldo_atual como operável neste contexto)
      const mappedBookmakers: Bookmaker[] = (bookmarkersRes.data || []).map(bk => ({
        id: bk.id,
        nome: bk.nome,
        saldo_operavel: bk.saldo_atual || 0,
        moeda: bk.moeda || "BRL",
      }));

      setBookmakers(mappedBookmakers);
      setContas(contasRes.data || []);
      setWallets(walletsRes.data || []);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
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

  const handleSubmit = async () => {
    if (!valor || parseFloat(valor) <= 0) {
      toast({
        title: "Valor inválido",
        description: "Informe um valor maior que zero.",
        variant: "destructive",
      });
      return;
    }

    if (!motivo.trim()) {
      toast({
        title: "Motivo obrigatório",
        description: "Informe o motivo do ajuste.",
        variant: "destructive",
      });
      return;
    }

    if (tipoDestino === "BOOKMAKER" && !bookmakerId) {
      toast({
        title: "Bookmaker obrigatório",
        description: "Selecione o bookmaker para o ajuste.",
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
      const valorFinal = direcao === "SAIDA" ? -valorNumerico : valorNumerico;

      // Criar transação no cash_ledger com campos de auditoria obrigatórios
      const transactionData: any = {
        user_id: user.id,
        workspace_id: workspaceId,
        tipo_transacao: "AJUSTE_MANUAL",
        tipo_moeda: "FIAT",
        moeda: moeda,
        valor: Math.abs(valorNumerico),
        descricao: `[AJUSTE ${direcao}] ${motivo}`,
        status: "CONFIRMADO",
        data_transacao: new Date().toISOString(),
        // Campos obrigatórios para ajustes (trigger validará)
        ajuste_motivo: motivo.trim(),
        ajuste_direcao: direcao,
        auditoria_metadata: {
          registrado_em: new Date().toISOString(),
          tipo_destino_selecionado: tipoDestino,
          user_agent: navigator.userAgent,
        },
      };

      // Definir origem/destino baseado na direção
      // Para ajustes manuais, usamos CAIXA_OPERACIONAL como contraparte padrão
      if (direcao === "ENTRADA") {
        // Entrada: origem é CAIXA_OPERACIONAL (ajuste), destino é onde o valor entra
        transactionData.origem_tipo = "CAIXA_OPERACIONAL";
        if (tipoDestino === "CAIXA_OPERACIONAL") {
          transactionData.destino_tipo = "CAIXA_OPERACIONAL";
        } else if (tipoDestino === "BOOKMAKER") {
          transactionData.destino_tipo = "BOOKMAKER";
          transactionData.destino_bookmaker_id = bookmakerId;
        } else if (tipoDestino === "CONTA_BANCARIA") {
          transactionData.destino_tipo = "PARCEIRO_CONTA";
          transactionData.destino_conta_bancaria_id = contaId;
        } else if (tipoDestino === "WALLET") {
          transactionData.destino_tipo = "PARCEIRO_WALLET";
          transactionData.destino_wallet_id = walletId;
        }
      } else {
        // Saída: origem é de onde sai o valor, destino é CAIXA_OPERACIONAL (ajuste)
        transactionData.destino_tipo = "CAIXA_OPERACIONAL";
        if (tipoDestino === "CAIXA_OPERACIONAL") {
          transactionData.origem_tipo = "CAIXA_OPERACIONAL";
        } else if (tipoDestino === "BOOKMAKER") {
          transactionData.origem_tipo = "BOOKMAKER";
          transactionData.origem_bookmaker_id = bookmakerId;
        } else if (tipoDestino === "CONTA_BANCARIA") {
          transactionData.origem_tipo = "PARCEIRO_CONTA";
          transactionData.origem_conta_bancaria_id = contaId;
        } else if (tipoDestino === "WALLET") {
          transactionData.origem_tipo = "PARCEIRO_WALLET";
          transactionData.origem_wallet_id = walletId;
        }
      }

      const { error } = await supabase.from("cash_ledger").insert([transactionData]);
      if (error) throw error;

      // Não atualizar saldo diretamente - o trigger do cash_ledger cuida disso
      // A inserção acima no ledger já dispara atualizar_saldo_bookmaker_v2

      toast({
        title: "Ajuste registrado",
        description: `Ajuste de ${direcao === "ENTRADA" ? "entrada" : "saída"} no valor de ${valorDisplay} registrado com sucesso.`,
      });

      handleClose();
      onSuccess();
    } catch (error: any) {
      console.error("Erro ao registrar ajuste:", error);
      
      // Traduzir erros de domínio do banco para mensagens claras
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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-amber-500" />
            Ajuste Manual
          </DialogTitle>
          <DialogDescription>
            Correção contábil para conciliação de saldos.
          </DialogDescription>
        </DialogHeader>

        {/* Aviso de imutabilidade */}
        <Alert className="border-amber-500/30 bg-amber-500/5">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertDescription className="text-xs text-muted-foreground">
            Este lançamento é contábil, auditável e <strong>não poderá ser editado ou removido</strong>. 
            Toda correção gera um novo registro permanente no histórico financeiro.
          </AlertDescription>
        </Alert>

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
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                  Entrada (+)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="SAIDA" id="saida" />
                <Label htmlFor="saida" className="flex items-center gap-1 cursor-pointer">
                  <TrendingDown className="h-4 w-4 text-red-500" />
                  Saída (-)
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Destino do Ajuste */}
          <div className="space-y-2">
            <Label>Aplicar ajuste em</Label>
            <Select value={tipoDestino} onValueChange={setTipoDestino}>
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

          {/* Seleção específica baseada no tipo */}
          {tipoDestino === "BOOKMAKER" && (
            <div className="space-y-2">
              <Label>Bookmaker</Label>
              <Select value={bookmakerId} onValueChange={setBookmakerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o bookmaker" />
                </SelectTrigger>
                <SelectContent>
                  {bookmakers.map((bk) => {
                    const symbol = bk.moeda === "USD" || bk.moeda === "USDT" ? "$" : "R$";
                    return (
                      <SelectItem key={bk.id} value={bk.id}>
                        {bk.nome} (Saldo: {symbol}{bk.saldo_operavel.toFixed(2)})
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

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
                      {conta.banco} - {conta.titular}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

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
                      {wallet.exchange} - {wallet.endereco.slice(0, 10)}...
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Moeda */}
          <div className="space-y-2">
            <Label>Moeda</Label>
            <Select value={moeda} onValueChange={setMoeda}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOEDAS_FIAT.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.value} - {m.label}
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
                {moeda === "USD" ? "$" : moeda === "EUR" ? "€" : moeda === "GBP" ? "£" : "R$"}
              </span>
              <Input
                value={valorDisplay}
                onChange={handleValorChange}
                placeholder="0,00"
                className="pl-10"
              />
            </div>
          </div>

          {/* Motivo */}
          <div className="space-y-2">
            <Label>Motivo do Ajuste *</Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Descreva o motivo da correção..."
              rows={3}
            />
          </div>

          {/* Preview */}
          {valor && parseFloat(valor) > 0 && (
            <Alert className={direcao === "ENTRADA" ? "border-emerald-500/30 bg-emerald-500/10" : "border-red-500/30 bg-red-500/10"}>
              <AlertDescription className="flex items-center gap-2">
                {direcao === "ENTRADA" ? (
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                )}
                <span>
                  {direcao === "ENTRADA" ? "Adicionar" : "Subtrair"}{" "}
                  <strong>{valorDisplay}</strong> {moeda} em{" "}
                  <strong>
                    {tipoDestino === "CAIXA_OPERACIONAL" && "Caixa Operacional"}
                    {tipoDestino === "BOOKMAKER" && (bookmakers.find(b => b.id === bookmakerId)?.nome || "Bookmaker")}
                    {tipoDestino === "CONTA_BANCARIA" && (contas.find(c => c.id === contaId)?.banco || "Conta")}
                    {tipoDestino === "WALLET" && (wallets.find(w => w.id === walletId)?.exchange || "Wallet")}
                  </strong>
                </span>
              </AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={handleClose} disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Registrar Ajuste
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
