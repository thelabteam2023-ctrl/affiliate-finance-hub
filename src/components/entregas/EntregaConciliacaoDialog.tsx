import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, TrendingDown, TrendingUp, Wallet, FileText } from "lucide-react";
import { OrigemPagamentoSelect, OrigemPagamentoData } from "@/components/programa-indicacao/OrigemPagamentoSelect";

interface Entrega {
  id: string;
  numero_entrega: number;
  resultado_nominal: number;
  saldo_inicial: number;
  meta_valor: number | null;
  meta_percentual: number | null;
  tipo_gatilho: string;
  data_inicio: string;
  data_fim_prevista: string | null;
  operador_projeto_id?: string;
}

interface EntregaConciliacaoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entrega: Entrega | null;
  operadorNome?: string;
  operadorId?: string;
  projetoId?: string;
  modeloPagamento: string;
  valorFixo?: number;
  percentual?: number;
  onSuccess: () => void;
}

const TIPOS_AJUSTE = [
  { value: "PERDA_FRICCIONAL", label: "Perda Friccional" },
  { value: "GANHO_OPERACIONAL", label: "Ganho Operacional" },
  { value: "OUTRO", label: "Outro" },
];

export function EntregaConciliacaoDialog({
  open,
  onOpenChange,
  entrega,
  operadorNome,
  operadorId,
  projetoId,
  modeloPagamento,
  valorFixo = 0,
  percentual = 0,
  onSuccess,
}: EntregaConciliacaoDialogProps) {
  const { workspaceId } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    resultado_real: "",
    tipo_ajuste: "PERDA_FRICCIONAL",
    observacoes_conciliacao: "",
    valor_pagamento_operador: "",
  });
  const [registrarPagamento, setRegistrarPagamento] = useState(true);
  const [origemData, setOrigemData] = useState<OrigemPagamentoData>({
    origemTipo: "CAIXA_OPERACIONAL",
    tipoMoeda: "FIAT",
    moeda: "BRL",
    saldoDisponivel: 0,
    saldoInsuficiente: false,
  });

  const valorPagamento = parseFloat(formData.valor_pagamento_operador || "0");
  const isSaldoInsuficiente = registrarPagamento && valorPagamento > 0 && (origemData.saldoInsuficiente || origemData.saldoDisponivel < valorPagamento);

  useEffect(() => {
    if (open && entrega) {
      // Sugestão baseada na referência do acordo (apenas como guia, não automático)
      const valorSugerido = calcularPagamentoSugerido(entrega.resultado_nominal);
      setFormData({
        resultado_real: entrega.resultado_nominal.toString(),
        tipo_ajuste: "PERDA_FRICCIONAL",
        observacoes_conciliacao: "",
        valor_pagamento_operador: valorSugerido.toString(),
      });
      setRegistrarPagamento(true);
      setOrigemData({
        origemTipo: "CAIXA_OPERACIONAL",
        tipoMoeda: "FIAT",
        moeda: "BRL",
        saldoDisponivel: 0,
        saldoInsuficiente: false,
      });
    }
  }, [open, entrega]);

  // Calcula sugestão baseada na referência do acordo (apenas informativo)
  const calcularPagamentoSugerido = (resultado: number) => {
    switch (modeloPagamento) {
      case "FIXO_MENSAL":
        return valorFixo;
      case "PORCENTAGEM":
        return resultado * (percentual / 100);
      case "HIBRIDO":
        return valorFixo + (resultado * (percentual / 100));
      default:
        return 0;
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const ajuste = entrega 
    ? parseFloat(formData.resultado_real || "0") - entrega.resultado_nominal
    : 0;

  const handleSave = async () => {
    if (!entrega) return;

    if (!formData.resultado_real) {
      toast.error("Informe o resultado real");
      return;
    }

    // Validar saldo se vai registrar pagamento
    if (registrarPagamento && valorPagamento > 0 && isSaldoInsuficiente) {
      toast.error("Saldo insuficiente para realizar o pagamento ao operador");
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

      // Validar workspace ativo
      if (!workspaceId) {
        toast.error("Workspace não definido. Recarregue a página.");
        return;
      }

      let cashLedgerId: string | null = null;

      // Determinar operadorId se não foi passado
      let opId = operadorId;
      let projId = projetoId;
      
      if (!opId && entrega.operador_projeto_id) {
        const { data: opProjeto } = await supabase
          .from("operador_projetos")
          .select("operador_id, projeto_id")
          .eq("id", entrega.operador_projeto_id)
          .single();
        
        if (opProjeto) {
          opId = opProjeto.operador_id;
          projId = opProjeto.projeto_id;
        }
      }

      // Se vai registrar pagamento, criar registros no cash_ledger e pagamentos_operador
      if (registrarPagamento && valorPagamento > 0 && opId) {
        // 1. Criar registro no cash_ledger para debitar a origem
        const ledgerPayload: any = {
          user_id: userId,
          workspace_id: workspaceId,
          tipo_transacao: "PAGTO_OPERADOR",
          valor: valorPagamento,
          moeda: origemData.tipoMoeda === "CRYPTO" ? "USD" : "BRL",
          tipo_moeda: origemData.tipoMoeda,
          data_transacao: new Date().toISOString(),
          descricao: `Pagamento conciliação período #${entrega.numero_entrega}${operadorNome ? ` - ${operadorNome}` : ""}`,
          status: "CONFIRMADO",
        };

        // Configurar origem baseado no tipo selecionado
        if (origemData.origemTipo === "CAIXA_OPERACIONAL") {
          ledgerPayload.origem_tipo = "CAIXA_OPERACIONAL";
          if (origemData.tipoMoeda === "CRYPTO") {
            ledgerPayload.coin = origemData.coin;
            ledgerPayload.cotacao = origemData.cotacao;
          }
        } else if (origemData.origemTipo === "PARCEIRO_CONTA") {
          ledgerPayload.origem_tipo = "PARCEIRO_CONTA";
          ledgerPayload.origem_parceiro_id = origemData.origemParceiroId;
          ledgerPayload.origem_conta_bancaria_id = origemData.origemContaBancariaId;
        } else if (origemData.origemTipo === "PARCEIRO_WALLET") {
          ledgerPayload.origem_tipo = "PARCEIRO_WALLET";
          ledgerPayload.origem_parceiro_id = origemData.origemParceiroId;
          ledgerPayload.origem_wallet_id = origemData.origemWalletId;
          ledgerPayload.coin = origemData.coin;
          ledgerPayload.cotacao = origemData.cotacao;
        }

        const { data: ledgerData, error: ledgerError } = await supabase
          .from("cash_ledger")
          .insert(ledgerPayload)
          .select("id")
          .single();

        if (ledgerError) throw ledgerError;
        cashLedgerId = ledgerData.id;

        // 2. Criar registro em pagamentos_operador
        const { error: pagtoError } = await supabase
          .from("pagamentos_operador")
          .insert({
            user_id: userId,
            workspace_id: workspaceId,
            operador_id: opId,
            projeto_id: projId || null,
            tipo_pagamento: "COMISSAO",
            valor: valorPagamento,
            moeda: "BRL",
            data_pagamento: new Date().toISOString().split("T")[0],
            descricao: `Pagamento referente ao período #${entrega.numero_entrega}`,
            status: "CONFIRMADO",
            cash_ledger_id: cashLedgerId,
          });

        if (pagtoError) throw pagtoError;
      }

      // 3. Atualizar a entrega
      const { error } = await supabase
        .from("entregas")
        .update({
          resultado_real: parseFloat(formData.resultado_real),
          ajuste: ajuste,
          tipo_ajuste: ajuste !== 0 ? formData.tipo_ajuste : null,
          observacoes_conciliacao: formData.observacoes_conciliacao || null,
          valor_pagamento_operador: valorPagamento,
          conciliado: true,
          pagamento_realizado: registrarPagamento && valorPagamento > 0,
          data_conciliacao: new Date().toISOString(),
          data_fim_real: new Date().toISOString().split("T")[0],
          status: "CONCLUIDA",
        })
        .eq("id", entrega.id);

      if (error) throw error;

      // 4. Atualizar ultima_conciliacao no operador_projetos para recalcular proxima_conciliacao
      if (entrega.operador_projeto_id) {
        await supabase
          .from("operador_projetos")
          .update({
            ultima_conciliacao: new Date().toISOString().split("T")[0],
          })
          .eq("id", entrega.operador_projeto_id);
      }

      toast.success("Período conciliado com sucesso");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao conciliar: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!entrega) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Conciliar Período #{entrega.numero_entrega}</DialogTitle>
          <DialogDescription>
            {operadorNome && `Operador: ${operadorNome}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Resumo do Período */}
          <div className="p-4 rounded-lg bg-muted/50 border space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Saldo Inicial:</span>
              <span>{formatCurrency(entrega.saldo_inicial)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Resultado Nominal:</span>
              <span className="font-medium">{formatCurrency(entrega.resultado_nominal)}</span>
            </div>
          </div>

          {/* Resultado Real */}
          <div className="space-y-2">
            <Label>Resultado Real (R$) *</Label>
            <Input
              type="number"
              step="0.01"
              value={formData.resultado_real}
              onChange={(e) => setFormData({ ...formData, resultado_real: e.target.value })}
              placeholder="0,00"
            />
          </div>

          {/* Ajuste */}
          {ajuste !== 0 && (
            <div className={`p-3 rounded-lg border ${ajuste < 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
              <div className="flex items-center gap-2 mb-2">
                {ajuste < 0 ? (
                  <TrendingDown className="h-4 w-4 text-red-400" />
                ) : (
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                )}
                <span className={`font-medium ${ajuste < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  Ajuste: {formatCurrency(ajuste)}
                </span>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Tipo de Ajuste</Label>
                <Select
                  value={formData.tipo_ajuste}
                  onValueChange={(value) => setFormData({ ...formData, tipo_ajuste: value })}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_AJUSTE.map((tipo) => (
                      <SelectItem key={tipo.value} value={tipo.value}>
                        {tipo.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Valor Pagamento - Campo manual */}
          <div className="space-y-2">
            <Label>Valor Pagamento ao Operador (R$)</Label>
            <Input
              type="number"
              step="0.01"
              value={formData.valor_pagamento_operador}
              onChange={(e) => setFormData({ ...formData, valor_pagamento_operador: e.target.value })}
              placeholder="0,00"
            />
            {(valorFixo > 0 || percentual > 0) && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <FileText className="h-3 w-3" />
                <span>
                  Referência do acordo: {formatCurrency(calcularPagamentoSugerido(parseFloat(formData.resultado_real) || 0))}
                </span>
              </div>
            )}
          </div>

          {/* Toggle para registrar pagamento */}
          {valorPagamento > 0 && (
            <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                  <Label className="font-medium">Registrar pagamento no financeiro</Label>
                </div>
                <Switch
                  checked={registrarPagamento}
                  onCheckedChange={setRegistrarPagamento}
                />
              </div>

              {registrarPagamento && (
                <div className="space-y-2">
                  <OrigemPagamentoSelect
                    value={origemData}
                    onChange={setOrigemData}
                    valorPagamento={valorPagamento}
                  />
                  
                  {isSaldoInsuficiente && (
                    <div className="flex items-center gap-2 text-destructive text-sm mt-2">
                      <AlertTriangle className="h-4 w-4" />
                      <span>Saldo insuficiente na origem selecionada</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Observações */}
          <div className="space-y-2">
            <Label>Observações da Conciliação</Label>
            <Textarea
              value={formData.observacoes_conciliacao}
              onChange={(e) => setFormData({ ...formData, observacoes_conciliacao: e.target.value })}
              placeholder="Observações sobre a conciliação..."
              rows={2}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={loading || (registrarPagamento && isSaldoInsuficiente)}
          >
            {loading ? "Conciliando..." : "Conciliar Período"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
