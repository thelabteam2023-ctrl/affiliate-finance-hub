import { useState, useEffect } from "react";
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
import { Switch } from "@/components/ui/switch";
import { DatePicker } from "@/components/ui/date-picker";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { OrigemPagamentoSelect, OrigemPagamentoData } from "@/components/programa-indicacao/OrigemPagamentoSelect";
import { PagamentoOperadorDialog } from "@/components/operadores/PagamentoOperadorDialog";
import { useWorkspace } from "@/hooks/useWorkspace";
import { GRUPOS_DESPESA_LIST, getGrupoInfo } from "@/lib/despesaGrupos";

interface DespesaAdministrativa {
  id?: string;
  categoria: string;
  grupo?: string;
  descricao: string;
  valor: number;
  data_despesa: string;
  recorrente: boolean;
  status: string;
  origem_tipo?: string;
  origem_caixa_operacional?: boolean;
  origem_conta_bancaria_id?: string;
  origem_wallet_id?: string;
  origem_parceiro_id?: string;
  tipo_moeda?: string;
  moeda?: string;
  coin?: string;
  qtd_coin?: number;
  cotacao?: number;
}

interface DespesaAdministrativaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  despesa?: DespesaAdministrativa | null;
  onSuccess?: () => void;
}

export function DespesaAdministrativaDialog({
  open,
  onOpenChange,
  despesa,
  onSuccess,
}: DespesaAdministrativaDialogProps) {
  const { toast } = useToast();
  const { workspaceId } = useWorkspace();
  const [loading, setLoading] = useState(false);
  
  // Estado para redirecionamento ao PagamentoOperadorDialog
  const [showPagamentoOperador, setShowPagamentoOperador] = useState(false);
  
  const [formData, setFormData] = useState<DespesaAdministrativa>({
    categoria: "", // Agora preenchido automaticamente pelo grupo
    grupo: "UTILIDADES_E_SERVICOS_BASICOS",
    descricao: "",
    valor: 0,
    data_despesa: new Date().toISOString().split("T")[0],
    recorrente: false,
    status: "CONFIRMADO",
  });
  const [origemData, setOrigemData] = useState<OrigemPagamentoData>({
    origemTipo: "CAIXA_OPERACIONAL",
    origemParceiroId: null,
    origemContaBancariaId: null,
    origemWalletId: null,
    saldoDisponivel: 0,
    tipoMoeda: "FIAT",
    moeda: "BRL",
    coin: null,
    cotacao: null,
  });

  useEffect(() => {
    if (despesa) {
      setFormData({
        ...despesa,
        data_despesa: despesa.data_despesa.split("T")[0],
        grupo: despesa.grupo || "OUTROS",
      });
      // Set origem data from existing despesa
      setOrigemData({
        origemTipo: (despesa.origem_tipo as "CAIXA_OPERACIONAL" | "PARCEIRO_CONTA" | "PARCEIRO_WALLET") || "CAIXA_OPERACIONAL",
        origemParceiroId: despesa.origem_parceiro_id || null,
        origemContaBancariaId: despesa.origem_conta_bancaria_id || null,
        origemWalletId: despesa.origem_wallet_id || null,
        saldoDisponivel: 0,
        tipoMoeda: (despesa.tipo_moeda as "FIAT" | "CRYPTO") || "FIAT",
        moeda: despesa.moeda || "BRL",
        coin: despesa.coin || null,
        cotacao: despesa.cotacao || null,
      });
    } else {
      setFormData({
        categoria: "",
        grupo: "UTILIDADES_E_SERVICOS_BASICOS",
        descricao: "",
        valor: 0,
        data_despesa: new Date().toISOString().split("T")[0],
        recorrente: false,
        status: "CONFIRMADO",
      });
      setOrigemData({
        origemTipo: "CAIXA_OPERACIONAL",
        origemParceiroId: null,
        origemContaBancariaId: null,
        origemWalletId: null,
        saldoDisponivel: 0,
        tipoMoeda: "FIAT",
        moeda: "BRL",
        coin: null,
        cotacao: null,
      });
    }
  }, [despesa, open]);

  // 🔒 VALIDAÇÃO DE SALDO INSUFICIENTE - Apenas para status CONFIRMADO
  const isSaldoInsuficiente = formData.status === "CONFIRMADO" && formData.valor > 0 && (
    Boolean(origemData.saldoInsuficiente) || origemData.saldoDisponivel < formData.valor
  );

  const handleSubmit = async () => {
    if (!formData.grupo || formData.valor <= 0) {
      toast({
        title: "Campos obrigatórios",
        description: "Selecione o grupo e informe um valor válido.",
        variant: "destructive",
      });
      return;
    }

    // 🔒 VALIDAÇÃO CENTRAL: Bloquear se saldo insuficiente para status CONFIRMADO (dupla verificação)
    if (formData.status === "CONFIRMADO") {
      const saldoRealInsuficiente = Boolean(origemData.saldoInsuficiente) || (formData.valor > 0 && origemData.saldoDisponivel < formData.valor);
      if (saldoRealInsuficiente) {
        toast({
          title: "Transação bloqueada",
          description: `Saldo insuficiente. Disponível: R$ ${origemData.saldoDisponivel.toFixed(2)} | Necessário: R$ ${formData.valor.toFixed(2)}`,
          variant: "destructive",
        });
        return;
      }
    }

    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      if (!workspaceId) throw new Error("Workspace não encontrado");

      const grupoInfo = getGrupoInfo(formData.grupo || "OUTROS");
      const payload: any = {
        categoria: grupoInfo.label, // Categoria recebe o label do grupo para compatibilidade
        grupo: formData.grupo,
        descricao: formData.descricao || null,
        valor: formData.valor,
        data_despesa: formData.data_despesa,
        recorrente: formData.recorrente,
        status: formData.status,
        user_id: user.id,
        workspace_id: workspaceId,
        origem_tipo: origemData.origemTipo,
        origem_caixa_operacional: origemData.origemTipo === "CAIXA_OPERACIONAL",
        origem_conta_bancaria_id: origemData.origemContaBancariaId || null,
        origem_wallet_id: origemData.origemWalletId || null,
        origem_parceiro_id: origemData.origemParceiroId || null,
        tipo_moeda: origemData.tipoMoeda,
        coin: origemData.coin || null,
        qtd_coin: origemData.tipoMoeda === "CRYPTO" && origemData.cotacao 
          ? formData.valor / origemData.cotacao 
          : null,
        cotacao: origemData.cotacao || null,
      };

      if (despesa?.id) {
        // 🔄 RECONCILIAÇÃO: Calcular diferença e ajustar saldo
        const valorAnterior = despesa.valor || 0;
        const valorNovo = formData.valor;
        const diferencaValor = valorNovo - valorAnterior;
        
        // Verificar se houve mudança de valor E se a despesa está confirmada
        const deveReconciliar = diferencaValor !== 0 && 
          despesa.status === "CONFIRMADO" && 
          formData.status === "CONFIRMADO";
        
        // Verificar se houve mudança de origem de pagamento
        const mudouOrigem = 
          despesa.origem_tipo !== origemData.origemTipo ||
          despesa.origem_conta_bancaria_id !== origemData.origemContaBancariaId ||
          despesa.origem_wallet_id !== origemData.origemWalletId;

        if (deveReconciliar || mudouOrigem) {
          // Se mudou origem, precisa estornar totalmente a antiga e debitar na nova
          if (mudouOrigem && despesa.origem_tipo) {
            // Estornar valor total da origem antiga
            const estornoPayload: any = {
              user_id: user.id,
              workspace_id: workspaceId,
              tipo_transacao: "AJUSTE_MANUAL",
              tipo_moeda: despesa.tipo_moeda || "FIAT",
              moeda: despesa.moeda || "BRL",
              valor: valorAnterior,
              destino_tipo: despesa.origem_tipo,
              destino_parceiro_id: despesa.origem_parceiro_id || null,
              destino_conta_bancaria_id: despesa.origem_conta_bancaria_id || null,
              destino_wallet_id: despesa.origem_wallet_id || null,
              data_transacao: new Date().toISOString().split("T")[0],
              descricao: `Estorno por edição de despesa: ${formData.descricao || grupoInfo.label} - origem alterada`,
              status: "CONFIRMADO",
              ajuste_direcao: "ENTRADA",
              ajuste_motivo: "Correção automática por edição de despesa administrativa",
            };
            
            const { error: estornoError } = await supabase
              .from("cash_ledger")
              .insert(estornoPayload);
            
            if (estornoError) throw estornoError;
            
            // Debitar valor novo da nova origem
            const novoDebitoPayload: any = {
              user_id: user.id,
              workspace_id: workspaceId,
              tipo_transacao: "DESPESA_ADMINISTRATIVA",
              tipo_moeda: origemData.tipoMoeda,
              moeda: origemData.tipoMoeda === "CRYPTO" ? "USD" : origemData.moeda,
              valor: valorNovo,
              origem_tipo: origemData.origemTipo,
              origem_parceiro_id: origemData.origemParceiroId || null,
              origem_conta_bancaria_id: origemData.origemContaBancariaId || null,
              origem_wallet_id: origemData.origemWalletId || null,
              data_transacao: formData.data_despesa,
              descricao: `Despesa administrativa - ${grupoInfo.label}${formData.descricao ? `: ${formData.descricao}` : ''} (edição)`,
              status: "CONFIRMADO",
            };
            
            const { error: debitoError } = await supabase
              .from("cash_ledger")
              .insert(novoDebitoPayload);
            
            if (debitoError) throw debitoError;
          } else if (deveReconciliar) {
            // Mesma origem, apenas ajustar a diferença
            if (diferencaValor > 0) {
              // Valor aumentou: debitar a diferença da origem
              const debitoPayload: any = {
                user_id: user.id,
                workspace_id: workspaceId,
                tipo_transacao: "DESPESA_ADMINISTRATIVA",
                tipo_moeda: origemData.tipoMoeda,
                moeda: origemData.tipoMoeda === "CRYPTO" ? "USD" : origemData.moeda,
                valor: diferencaValor,
                origem_tipo: origemData.origemTipo,
                origem_parceiro_id: origemData.origemParceiroId || null,
                origem_conta_bancaria_id: origemData.origemContaBancariaId || null,
                origem_wallet_id: origemData.origemWalletId || null,
                data_transacao: formData.data_despesa,
                descricao: `Ajuste de despesa - ${grupoInfo.label}: valor aumentado em R$ ${diferencaValor.toFixed(2)}`,
                status: "CONFIRMADO",
              };
              
              const { error: ajusteError } = await supabase
                .from("cash_ledger")
                .insert(debitoPayload);
              
              if (ajusteError) throw ajusteError;
            } else {
              // Valor diminuiu: creditar a diferença de volta
              const creditoPayload: any = {
                user_id: user.id,
                workspace_id: workspaceId,
                tipo_transacao: "AJUSTE_MANUAL",
                tipo_moeda: origemData.tipoMoeda,
                moeda: origemData.tipoMoeda === "CRYPTO" ? "USD" : origemData.moeda,
                valor: Math.abs(diferencaValor),
                destino_tipo: origemData.origemTipo,
                destino_parceiro_id: origemData.origemParceiroId || null,
                destino_conta_bancaria_id: origemData.origemContaBancariaId || null,
                destino_wallet_id: origemData.origemWalletId || null,
                data_transacao: formData.data_despesa,
                descricao: `Estorno de despesa - ${grupoInfo.label}: valor reduzido em R$ ${Math.abs(diferencaValor).toFixed(2)}`,
                status: "CONFIRMADO",
                ajuste_direcao: "ENTRADA",
                ajuste_motivo: "Correção automática por edição de despesa administrativa",
              };
              
              const { error: ajusteError } = await supabase
                .from("cash_ledger")
                .insert(creditoPayload);
              
              if (ajusteError) throw ajusteError;
            }
          }
        }
        
        // Verificar mudança de status: PENDENTE -> CONFIRMADO
        if (despesa.status === "PENDENTE" && formData.status === "CONFIRMADO") {
          const debitoPayload: any = {
            user_id: user.id,
            workspace_id: workspaceId,
            tipo_transacao: "DESPESA_ADMINISTRATIVA",
            tipo_moeda: origemData.tipoMoeda,
            moeda: origemData.tipoMoeda === "CRYPTO" ? "USD" : origemData.moeda,
            valor: valorNovo,
            origem_tipo: origemData.origemTipo,
            origem_parceiro_id: origemData.origemParceiroId || null,
            origem_conta_bancaria_id: origemData.origemContaBancariaId || null,
            origem_wallet_id: origemData.origemWalletId || null,
            data_transacao: formData.data_despesa,
            descricao: `Despesa administrativa confirmada - ${grupoInfo.label}${formData.descricao ? `: ${formData.descricao}` : ''}`,
            status: "CONFIRMADO",
          };
          
          const { error: debitoError } = await supabase
            .from("cash_ledger")
            .insert(debitoPayload);
          
          if (debitoError) throw debitoError;
        }
        
        // Verificar mudança de status: CONFIRMADO -> PENDENTE (estornar)
        if (despesa.status === "CONFIRMADO" && formData.status === "PENDENTE") {
          const estornoPayload: any = {
            user_id: user.id,
            workspace_id: workspaceId,
            tipo_transacao: "AJUSTE_MANUAL",
            tipo_moeda: despesa.tipo_moeda || "FIAT",
            moeda: despesa.moeda || "BRL",
            valor: valorAnterior,
            destino_tipo: despesa.origem_tipo,
            destino_parceiro_id: despesa.origem_parceiro_id || null,
            destino_conta_bancaria_id: despesa.origem_conta_bancaria_id || null,
            destino_wallet_id: despesa.origem_wallet_id || null,
            data_transacao: formData.data_despesa,
            descricao: `Estorno de despesa - ${grupoInfo.label}: status alterado para PENDENTE`,
            status: "CONFIRMADO",
            ajuste_direcao: "ENTRADA",
            ajuste_motivo: "Correção automática por alteração de status",
          };
          
          const { error: estornoError } = await supabase
            .from("cash_ledger")
            .insert(estornoPayload);
          
          if (estornoError) throw estornoError;
        }
        
        const { error } = await supabase
          .from("despesas_administrativas")
          .update(payload)
          .eq("id", despesa.id);
        if (error) throw error;
        toast({ title: "Despesa atualizada com sucesso!" });
      } else {
        // PASSO 1: Debitar da origem selecionada via cash_ledger (apenas para CONFIRMADO)
        if (formData.status === "CONFIRMADO") {
          // 🔒 REGRA DE CONVERSÃO CRYPTO:
          const isCrypto = origemData.tipoMoeda === "CRYPTO";
          const cotacaoUSD = origemData.cotacao || 5.40;
          const coinPriceUSD = origemData.coinPriceUSD || 1;
          const valorUSD = isCrypto ? formData.valor / cotacaoUSD : null;
          const qtdCoin = isCrypto && valorUSD ? valorUSD / coinPriceUSD : null;

          // CRYPTO: moeda = USD (USDT = 1:1), valor = valor em USD
          // FIAT: moeda = BRL, valor = valor em BRL
          const valorLedger = isCrypto ? valorUSD : formData.valor;
          
          const { error: ledgerError } = await supabase
            .from("cash_ledger")
            .insert({
              user_id: user.id,
              workspace_id: workspaceId,
              tipo_transacao: "DESPESA_ADMINISTRATIVA",
              tipo_moeda: origemData.tipoMoeda,
              moeda: isCrypto ? "USD" : origemData.moeda, // CRÍTICO: CRYPTO = USD, não BRL
              valor: isCrypto ? formData.valor : formData.valor, // valor referência BRL para histórico
              coin: origemData.coin || null,
              qtd_coin: qtdCoin,
              valor_usd: valorUSD,
              cotacao: isCrypto ? cotacaoUSD : null,
              origem_tipo: origemData.origemTipo,
              origem_parceiro_id: origemData.origemParceiroId || null,
              origem_conta_bancaria_id: origemData.origemContaBancariaId || null,
              origem_wallet_id: origemData.origemWalletId || null,
              // destino_tipo: NULL - despesas administrativas são externas ao sistema
              data_transacao: formData.data_despesa,
              descricao: `Despesa administrativa - ${formData.categoria}${formData.descricao ? `: ${formData.descricao}` : ''}`,
              status: "CONFIRMADO",
            });
          
          if (ledgerError) throw ledgerError;
        }

        // PASSO 2: Registrar em despesas_administrativas
        const { error } = await supabase
          .from("despesas_administrativas")
          .insert(payload);
        if (error) throw error;
        toast({ title: "Despesa registrada com sucesso!" });
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast({
        title: "Erro ao salvar despesa",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Handler para quando PagamentoOperadorDialog finalizar
  const handlePagamentoOperadorSuccess = () => {
    setShowPagamentoOperador(false);
    onOpenChange(false);
    onSuccess?.();
  };

  return (
    <>
      {/* Dialog de Pagamento de Operador (redirecionamento) */}
      <PagamentoOperadorDialog
        open={showPagamentoOperador}
        onOpenChange={(isOpen) => {
          setShowPagamentoOperador(isOpen);
          if (!isOpen) {
            // Se fechou sem salvar, volta para o dialog principal
          }
        }}
        onSuccess={handlePagamentoOperadorSuccess}
      />

      <Dialog open={open && !showPagamentoOperador} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>
              {despesa?.id ? "Editar Despesa Administrativa" : "Nova Despesa Administrativa"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4 overflow-y-auto flex-1 pr-2">
            <div className="space-y-2">
              <Label>Grupo de Despesa *</Label>
              <Select
                value={formData.grupo || "OUTROS"}
                onValueChange={(value) => {
                  setFormData({ ...formData, grupo: value });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o grupo" />
                </SelectTrigger>
                <SelectContent>
                  {GRUPOS_DESPESA_LIST.map((grupo) => {
                    const IconComponent = grupo.icon;
                    return (
                      <SelectItem key={grupo.value} value={grupo.value}>
                        <span className="flex items-center gap-2">
                          <IconComponent className="h-4 w-4" />
                          <span>{grupo.label}</span>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {getGrupoInfo(formData.grupo || "OUTROS").description}
              </p>
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

          <div className="space-y-2">
            <Label>Data da Despesa *</Label>
            <DatePicker
              value={formData.data_despesa}
              onChange={(date) => setFormData({ ...formData, data_despesa: date })}
              placeholder="Selecione a data"
            />
          </div>

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              value={formData.descricao}
              onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
              placeholder="Descrição opcional da despesa..."
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Despesa Recorrente</Label>
              <p className="text-xs text-muted-foreground">
                Marque se esta despesa se repete mensalmente
              </p>
            </div>
            <Switch
              checked={formData.recorrente}
              onCheckedChange={(checked) => setFormData({ ...formData, recorrente: checked })}
            />
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
                <SelectItem value="CONFIRMADO">Confirmado</SelectItem>
                <SelectItem value="PENDENTE">Pendente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <OrigemPagamentoSelect
            value={origemData}
            onChange={setOrigemData}
            valorPagamento={formData.valor}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={loading || isSaldoInsuficiente}
            title={isSaldoInsuficiente ? "Saldo insuficiente para confirmar esta despesa" : undefined}
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {despesa?.id ? "Salvar" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
