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
import { Loader2, Plus } from "lucide-react";
import { OrigemPagamentoSelect, OrigemPagamentoData } from "@/components/programa-indicacao/OrigemPagamentoSelect";
import { PagamentoOperadorDialog } from "@/components/operadores/PagamentoOperadorDialog";

interface DespesaAdministrativa {
  id?: string;
  categoria: string;
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
  categoriasExtras?: string[];
}

// Removido "OPERADORES" - agora usa fluxo unificado via PagamentoOperadorDialog
const categoriasBase = [
  { value: "ENERGIA", label: "Energia" },
  { value: "INTERNET_MOVEL", label: "Internet Móvel" },
  { value: "ALUGUEL", label: "Aluguel" },
  { value: "DARF", label: "DARF" },
  { value: "CONTABILIDADE", label: "Contabilidade" },
  { value: "OUTROS", label: "Outros" },
];

export function DespesaAdministrativaDialog({
  open,
  onOpenChange,
  despesa,
  onSuccess,
  categoriasExtras = [],
}: DespesaAdministrativaDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showNovaCategoria, setShowNovaCategoria] = useState(false);
  const [novaCategoria, setNovaCategoria] = useState("");
  const [categoriasLocais, setCategoriasLocais] = useState<string[]>([]);
  
  // Estado para redirecionamento ao PagamentoOperadorDialog
  const [showPagamentoOperador, setShowPagamentoOperador] = useState(false);
  
  const [formData, setFormData] = useState<DespesaAdministrativa>({
    categoria: "ENERGIA",
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
  // Combina categorias base com extras (do banco) e locais (criadas nesta sessão)
  const todasCategorias = [
    ...categoriasBase,
    ...categoriasExtras
      .filter(c => !categoriasBase.some(b => b.value === c))
      .map(c => ({ value: c, label: c })),
    ...categoriasLocais
      .filter(c => !categoriasBase.some(b => b.value === c) && !categoriasExtras.includes(c))
      .map(c => ({ value: c, label: c })),
  ];

  useEffect(() => {
    if (despesa) {
      setFormData({
        ...despesa,
        data_despesa: despesa.data_despesa.split("T")[0],
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
        categoria: "ENERGIA",
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
    if (!formData.categoria || formData.valor <= 0) {
      toast({
        title: "Campos obrigatórios",
        description: "Selecione a categoria e informe um valor válido.",
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

      const payload: any = {
        categoria: formData.categoria,
        descricao: formData.descricao || null,
        valor: formData.valor,
        data_despesa: formData.data_despesa,
        recorrente: formData.recorrente,
        status: formData.status,
        user_id: user.id,
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
          
          const { error: ledgerError } = await supabase
            .from("cash_ledger")
            .insert({
              user_id: user.id,
              tipo_transacao: "DESPESA_ADMINISTRATIVA",
              tipo_moeda: origemData.tipoMoeda,
              moeda: isCrypto ? "BRL" : origemData.moeda,
              valor: formData.valor,
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
              <Label>Categoria *</Label>
              {showNovaCategoria ? (
                <div className="flex gap-2">
                  <Input
                    value={novaCategoria}
                    onChange={(e) => setNovaCategoria(e.target.value.toUpperCase())}
                    placeholder="Nome da nova categoria"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      if (novaCategoria.trim()) {
                        const novaCat = novaCategoria.trim();
                        setCategoriasLocais(prev => [...prev, novaCat]);
                        setFormData({ ...formData, categoria: novaCat });
                        setShowNovaCategoria(false);
                        setNovaCategoria("");
                      }
                    }}
                  >
                    OK
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowNovaCategoria(false);
                      setNovaCategoria("");
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Select
                    value={formData.categoria}
                    onValueChange={(value) => {
                      // Se selecionou OPERADORES (pode vir de categoriasExtras), redireciona
                      if (value === "OPERADORES") {
                        setShowPagamentoOperador(true);
                        return;
                      }
                      setFormData({ ...formData, categoria: value });
                    }}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Selecione a categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {todasCategorias.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowNovaCategoria(true)}
                    title="Criar nova categoria"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}
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
