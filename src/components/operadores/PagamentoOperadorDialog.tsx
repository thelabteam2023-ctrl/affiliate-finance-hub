import { useState, useEffect } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";
import { OrigemPagamentoSelect, OrigemPagamentoData } from "@/components/programa-indicacao/OrigemPagamentoSelect";

interface Operador {
  operador_id: string;
  nome: string;
}

interface Projeto {
  id: string;
  nome: string;
}

interface CicloRef {
  data_inicio: string;
  data_fim_prevista: string;
}

interface PagamentoOperador {
  id?: string;
  operador_id: string;
  projeto_id: string | null;
  tipo_pagamento: string;
  valor: number;
  moeda: string;
  data_pagamento: string;
  data_competencia: string | null;
  descricao: string | null;
  status: string;
}

interface PagamentoOperadorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pagamento?: PagamentoOperador | null;
  defaultOperadorId?: string | null;
  onSuccess?: () => void;
}

const tiposPagamento = [
  { value: "SALARIO", label: "Salário" },
  { value: "COMISSAO", label: "Comissão" },
  { value: "BONUS", label: "Bônus" },
  { value: "ADIANTAMENTO", label: "Adiantamento" },
  { value: "REEMBOLSO", label: "Reembolso" },
  { value: "OUTROS", label: "Outros" },
];

export function PagamentoOperadorDialog({
  open,
  onOpenChange,
  pagamento,
  defaultOperadorId,
  onSuccess,
}: PagamentoOperadorDialogProps) {
  const { workspaceId } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [formData, setFormData] = useState<PagamentoOperador>({
    operador_id: "",
    projeto_id: null,
    tipo_pagamento: "SALARIO",
    valor: 0,
    moeda: "BRL",
    data_pagamento: new Date().toISOString().split("T")[0],
    data_competencia: null,
    descricao: null,
    status: "PENDENTE",
  });
  const [origemData, setOrigemData] = useState<OrigemPagamentoData>({
    origemTipo: "CAIXA_OPERACIONAL",
    tipoMoeda: "FIAT",
    moeda: "BRL",
    saldoDisponivel: 0,
    saldoInsuficiente: false,
  });
  const [cicloRef, setCicloRef] = useState<CicloRef | null>(null);

  const isEditing = !!pagamento?.id;
  const isSaldoInsuficiente = formData.status === "CONFIRMADO" && formData.valor > 0 && (origemData.saldoInsuficiente || origemData.saldoDisponivel < formData.valor);

  useEffect(() => {
    if (open) {
      fetchOperadores();
      fetchProjetos();
      
      if (pagamento) {
        setFormData({
          ...pagamento,
          data_competencia: pagamento.data_competencia || null,
        });
        if (pagamento.id) {
          fetchCicloRef(pagamento.id);
        }
      } else {
        setFormData({
          operador_id: defaultOperadorId || "",
          projeto_id: null,
          tipo_pagamento: "SALARIO",
          valor: 0,
          moeda: "BRL",
          data_pagamento: new Date().toISOString().split("T")[0],
          data_competencia: null,
          descricao: null,
          status: "PENDENTE",
        });
        setOrigemData({
          origemTipo: "CAIXA_OPERACIONAL",
          tipoMoeda: "FIAT",
          moeda: "BRL",
          saldoDisponivel: 0,
          saldoInsuficiente: false,
        });
        setCicloRef(null);
      }
    }
  }, [open, pagamento, defaultOperadorId]);

  const fetchOperadores = async () => {
    const { data, error } = await supabase
      .from("v_operadores_workspace")
      .select("operador_id, nome")
      .eq("is_active", true)
      .not("operador_id", "is", null)
      .order("nome");

    if (!error && data) {
      setOperadores(data.filter(op => op.operador_id) as Operador[]);
    }
  };

  const fetchProjetos = async () => {
    const { data, error } = await supabase
      .from("projetos")
      .select("id, nome")
      .in("status", ["PLANEJADO", "EM_ANDAMENTO"])
      .order("nome");

    if (!error && data) {
      setProjetos(data);
    }
  };

  const fetchCicloRef = async (pagamentoId: string) => {
    const { data } = await supabase
      .from("pagamentos_propostos")
      .select("ciclo_id, projeto_ciclos:ciclo_id(data_inicio, data_fim_prevista)")
      .eq("pagamento_id", pagamentoId)
      .limit(1)
      .maybeSingle();

    if (data?.projeto_ciclos) {
      const ciclo = data.projeto_ciclos as any;
      setCicloRef({ data_inicio: ciclo.data_inicio, data_fim_prevista: ciclo.data_fim_prevista });
    } else {
      setCicloRef(null);
    }
  };

  const handleSubmit = async () => {
    if (!formData.operador_id) {
      toast.error("Selecione o operador");
      return;
    }
    if (formData.valor <= 0) {
      toast.error("Informe um valor válido");
      return;
    }
    if (!formData.data_pagamento) {
      toast.error("Informe a data do pagamento");
      return;
    }

    // Validar saldo se status for CONFIRMADO
    if (formData.status === "CONFIRMADO" && isSaldoInsuficiente) {
      toast.error("Saldo insuficiente para realizar este pagamento");
      return;
    }

    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        toast.error("Usuário não autenticado");
        return;
      }

      const userId = session.session.user.id;
      let cashLedgerId: string | null = null;

      // Validar workspace ativo
      if (!workspaceId) {
        toast.error("Workspace não definido. Recarregue a página.");
        return;
      }

      // Se status for CONFIRMADO, criar registro no cash_ledger para debitar a origem
      if (formData.status === "CONFIRMADO") {
        // 🔒 REGRA DE CONVERSÃO CRYPTO:
        // A dívida é sempre em BRL (valor base). Se pagando com crypto:
        // - Converter BRL → USD usando cotação atual
        // - Para cada moeda, calcular quantidade usando o preço real (BTC/ETH) ou 1:1 (stablecoins)
        const cotacaoUSD = origemData.cotacao || 5.40; // Fallback se não tiver cotação
        const coinPriceUSD = origemData.coinPriceUSD || 1; // Preço da crypto em USD (1 para stablecoins)
        const isCrypto = origemData.tipoMoeda === "CRYPTO";
        
        // Calcular valor em USD e quantidade de coins (se crypto)
        const valorUSD = isCrypto ? formData.valor / cotacaoUSD : null;
        // Para stablecoins (USDT/USDC): qtdCoin = valorUSD (1:1)
        // Para outras cryptos (BTC/ETH): qtdCoin = valorUSD / coinPriceUSD
        const qtdCoin = isCrypto && valorUSD ? valorUSD / coinPriceUSD : null;

        // Buscar nome do operador para descrição
        const operadorSelecionado = operadores.find(op => op.operador_id === formData.operador_id);
        const nomeOperador = operadorSelecionado?.nome || "Operador";

        const ledgerPayload: any = {
          user_id: userId,
          workspace_id: workspaceId,
          tipo_transacao: "PAGTO_OPERADOR",
          valor: formData.valor, // Sempre o valor da dívida em BRL
          moeda: "BRL", // A dívida é sempre em BRL
          tipo_moeda: origemData.tipoMoeda,
          data_transacao: formData.data_pagamento,
          descricao: `${nomeOperador} - ${formData.tipo_pagamento}${formData.descricao ? `: ${formData.descricao}` : ""}`,
          status: "CONFIRMADO",
          destino_tipo: "OPERADOR",
          operador_id: formData.operador_id, // Link direto para rastreabilidade
        };

        // Se pagando com crypto, registrar os dados de conversão
        if (isCrypto) {
          ledgerPayload.valor_usd = valorUSD;
          ledgerPayload.qtd_coin = qtdCoin;
          ledgerPayload.coin = origemData.coin;
          ledgerPayload.cotacao = cotacaoUSD;
        }

        // Configurar origem baseado no tipo selecionado
        if (origemData.origemTipo === "CAIXA_OPERACIONAL") {
          ledgerPayload.origem_tipo = "CAIXA_OPERACIONAL";
        } else if (origemData.origemTipo === "PARCEIRO_CONTA") {
          ledgerPayload.origem_tipo = "PARCEIRO_CONTA";
          ledgerPayload.origem_parceiro_id = origemData.origemParceiroId;
          ledgerPayload.origem_conta_bancaria_id = origemData.origemContaBancariaId;
        } else if (origemData.origemTipo === "PARCEIRO_WALLET") {
          ledgerPayload.origem_tipo = "PARCEIRO_WALLET";
          ledgerPayload.origem_parceiro_id = origemData.origemParceiroId;
          ledgerPayload.origem_wallet_id = origemData.origemWalletId;
          ledgerPayload.coin = origemData.coin;
          ledgerPayload.cotacao = cotacaoUSD;
          ledgerPayload.valor_usd = valorUSD;
          ledgerPayload.qtd_coin = qtdCoin;
        }

        const { data: ledgerData, error: ledgerError } = await supabase
          .from("cash_ledger")
          .insert(ledgerPayload)
          .select("id")
          .single();

        if (ledgerError) throw ledgerError;
        cashLedgerId = ledgerData.id;
      }

      const payload = {
        operador_id: formData.operador_id,
        projeto_id: formData.projeto_id || null,
        tipo_pagamento: formData.tipo_pagamento,
        valor: formData.valor,
        moeda: formData.moeda,
        data_pagamento: formData.data_pagamento,
        data_competencia: formData.data_competencia || null,
        descricao: formData.descricao || null,
        status: formData.status,
        user_id: userId,
        workspace_id: workspaceId,
        cash_ledger_id: cashLedgerId,
      };

      if (pagamento?.id) {
        // Se está atualizando de PENDENTE para CONFIRMADO e não tem cash_ledger_id ainda
        // precisa criar o registro no ledger
        const needsLedgerEntry = formData.status === "CONFIRMADO" && 
                                  pagamento.status === "PENDENTE" && 
                                  !cashLedgerId;
        
        if (needsLedgerEntry) {
          // Criar registro no cash_ledger para o pagamento que está sendo confirmado
          const operadorSelecionado = operadores.find(op => op.operador_id === formData.operador_id);
          const nomeOperador = operadorSelecionado?.nome || "Operador";
          const cotacaoUSD = origemData.cotacao || 5.40;
          const coinPriceUSD = origemData.coinPriceUSD || 1;
          const isCrypto = origemData.tipoMoeda === "CRYPTO";
          const valorUSD = isCrypto ? formData.valor / cotacaoUSD : null;
          const qtdCoin = isCrypto && valorUSD ? valorUSD / coinPriceUSD : null;

          const ledgerPayload: any = {
            user_id: userId,
            workspace_id: workspaceId,
            tipo_transacao: "PAGTO_OPERADOR",
            valor: formData.valor,
            moeda: "BRL",
            tipo_moeda: origemData.tipoMoeda,
            data_transacao: formData.data_pagamento,
            descricao: `${nomeOperador} - ${formData.tipo_pagamento}${formData.descricao ? `: ${formData.descricao}` : ""}`,
            status: "CONFIRMADO",
            destino_tipo: "OPERADOR",
            operador_id: formData.operador_id,
          };

          if (isCrypto) {
            ledgerPayload.valor_usd = valorUSD;
            ledgerPayload.qtd_coin = qtdCoin;
            ledgerPayload.coin = origemData.coin;
            ledgerPayload.cotacao = cotacaoUSD;
          }

          if (origemData.origemTipo === "CAIXA_OPERACIONAL") {
            ledgerPayload.origem_tipo = "CAIXA_OPERACIONAL";
          } else if (origemData.origemTipo === "PARCEIRO_CONTA") {
            ledgerPayload.origem_tipo = "PARCEIRO_CONTA";
            ledgerPayload.origem_parceiro_id = origemData.origemParceiroId;
            ledgerPayload.origem_conta_bancaria_id = origemData.origemContaBancariaId;
          } else if (origemData.origemTipo === "PARCEIRO_WALLET") {
            ledgerPayload.origem_tipo = "PARCEIRO_WALLET";
            ledgerPayload.origem_parceiro_id = origemData.origemParceiroId;
            ledgerPayload.origem_wallet_id = origemData.origemWalletId;
            ledgerPayload.coin = origemData.coin;
            ledgerPayload.cotacao = cotacaoUSD;
            ledgerPayload.valor_usd = valorUSD;
            ledgerPayload.qtd_coin = qtdCoin;
          }

          const { data: ledgerData, error: ledgerError } = await supabase
            .from("cash_ledger")
            .insert(ledgerPayload)
            .select("id")
            .single();

          if (ledgerError) throw ledgerError;
          payload.cash_ledger_id = ledgerData.id;
        }

        const { error } = await supabase
          .from("pagamentos_operador")
          .update(payload)
          .eq("id", pagamento.id);
        if (error) throw error;
        toast.success("Pagamento atualizado com sucesso");
      } else {
        const { error } = await supabase
          .from("pagamentos_operador")
          .insert(payload);
        if (error) throw error;
        toast.success("Pagamento registrado com sucesso");
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {pagamento?.id ? "Editar Pagamento" : "Novo Pagamento de Operador"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Operador *</Label>
            <Select
              value={formData.operador_id}
              onValueChange={(value) => setFormData({ ...formData, operador_id: value })}
              disabled={!!defaultOperadorId || isEditing}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o operador" />
              </SelectTrigger>
              <SelectContent>
                {operadores.map((op) => (
                  <SelectItem key={op.operador_id} value={op.operador_id}>
                    {op.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Projeto (opcional)</Label>
            <Select
              value={formData.projeto_id || "none"}
              onValueChange={(value) => setFormData({ ...formData, projeto_id: value === "none" ? null : value })}
              disabled={isEditing}
            >
              <SelectTrigger>
                <SelectValue placeholder="Vincular a um projeto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum projeto</SelectItem>
                {projetos.map((proj) => (
                  <SelectItem key={proj.id} value={proj.id}>
                    {proj.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo de Pagamento *</Label>
              <Select
                value={formData.tipo_pagamento}
                onValueChange={(value) => setFormData({ ...formData, tipo_pagamento: value })}
                disabled={isEditing}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tiposPagamento.map((tipo) => (
                    <SelectItem key={tipo.value} value={tipo.value}>
                      {tipo.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Valor *</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={formData.valor || ""}
                onChange={(e) => setFormData({ ...formData, valor: parseFloat(e.target.value) || 0 })}
                placeholder="R$ 0,00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data do Pagamento *</Label>
              <DatePicker
                value={formData.data_pagamento}
                onChange={(date) => setFormData({ ...formData, data_pagamento: date })}
              />
            </div>

            <div className="space-y-2">
              <Label>Competência</Label>
              {cicloRef ? (
                <div className="flex items-center gap-1.5 h-10 px-3 rounded-md border bg-muted/50 text-sm">
                  {format(new Date(cicloRef.data_inicio + "T12:00:00"), "dd/MM/yyyy")} — {format(new Date(cicloRef.data_fim_prevista + "T12:00:00"), "dd/MM/yyyy")}
                </div>
              ) : (
                <DatePicker
                  value={formData.data_competencia || ""}
                  onChange={(date) => setFormData({ ...formData, data_competencia: date || null })}
                  placeholder="Mês de referência"
                />
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={formData.status}
              onValueChange={(value) => setFormData({ ...formData, status: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDENTE">Pendente</SelectItem>
                <SelectItem value="CONFIRMADO">Confirmado</SelectItem>
                <SelectItem value="CANCELADO">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Origem de Pagamento - apenas quando status é CONFIRMADO */}
          {formData.status === "CONFIRMADO" && (
            <div className="space-y-2 p-4 border rounded-lg bg-muted/30">
              <OrigemPagamentoSelect
                value={origemData}
                onChange={setOrigemData}
                valorPagamento={formData.valor}
              />
              
              {isSaldoInsuficiente && (
                <div className="flex items-center gap-2 text-destructive text-sm mt-2">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Saldo insuficiente na origem selecionada</span>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              value={formData.descricao || ""}
              onChange={(e) => setFormData({ ...formData, descricao: e.target.value || null })}
              placeholder="Descrição opcional do pagamento..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={loading || (formData.status === "CONFIRMADO" && isSaldoInsuficiente)}
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {pagamento?.id ? "Salvar" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
