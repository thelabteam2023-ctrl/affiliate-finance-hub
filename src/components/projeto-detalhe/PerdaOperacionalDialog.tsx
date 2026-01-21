import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useBookmakerSaldosQuery } from "@/hooks/useBookmakerSaldosQuery";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { toast } from "sonner";
import { Clock, CheckCircle } from "lucide-react";

interface PerdaOperacionalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projetoId: string;
  onSuccess: () => void;
}

// Interface removida - usando BookmakerSaldo da RPC canônica

const CATEGORIAS = [
  { value: "CONTA_LIMITADA", label: "Conta Limitada" },
  { value: "BONUS_TRAVADO", label: "Bônus Travado" },
  { value: "TAXA_CONVERSAO", label: "Taxa de Conversão" },
  { value: "FRAUDE_DETECTADA", label: "Fraude Detectada" },
  { value: "SALDO_BLOQUEADO", label: "Saldo Bloqueado" },
  { value: "SALDO_RESIDUAL", label: "Saldo Residual" },
  { value: "OUTRO", label: "Outro" },
];

const STATUS_OPTIONS = [
  { value: "PENDENTE", label: "Pendente", description: "Capital bloqueado, não afeta lucro ainda", icon: Clock },
  { value: "CONFIRMADA", label: "Confirmada", description: "Prejuízo efetivo, impacta lucro e ROI", icon: CheckCircle },
];

export function PerdaOperacionalDialog({
  open,
  onOpenChange,
  projetoId,
  onSuccess,
}: PerdaOperacionalDialogProps) {
  const { workspaceId } = useWorkspace();
  const [saving, setSaving] = useState(false);

  const [bookmakerId, setBookmakerId] = useState<string>("");
  const [valor, setValor] = useState<string>("");
  const [categoria, setCategoria] = useState<string>("");
  const [status, setStatus] = useState<string>("PENDENTE");
  const [descricao, setDescricao] = useState<string>("");

  // Usar RPC canônica para obter saldos
  const { data: bookmakers = [], isLoading: loading } = useBookmakerSaldosQuery({
    projetoId,
    enabled: open && !!projetoId,
    includeZeroBalance: true, // Mostrar todas as casas do projeto
  });

  useEffect(() => {
    if (open) {
      resetForm();
    }
  }, [open, projetoId]);

  const resetForm = () => {
    setBookmakerId("");
    setValor("");
    setCategoria("");
    setStatus("PENDENTE");
    setDescricao("");
  };

  const handleSubmit = async () => {
    if (!bookmakerId) {
      toast.error("Selecione um bookmaker");
      return;
    }

    if (!categoria) {
      toast.error("Selecione uma categoria");
      return;
    }

    const valorNumerico = parseFloat(valor.replace(",", "."));
    if (isNaN(valorNumerico) || valorNumerico <= 0) {
      toast.error("Informe um valor válido");
      return;
    }

    try {
      setSaving(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const insertData = {
        user_id: user.id,
        workspace_id: workspaceId,
        projeto_id: projetoId,
        bookmaker_id: bookmakerId,
        valor: valorNumerico,
        categoria,
        status,
        descricao: descricao || null,
        data_confirmacao: status === 'CONFIRMADA' ? new Date().toISOString() : null,
      };

      const { error } = await supabase.from("projeto_perdas").insert(insertData);

      if (error) throw error;

      // Se confirmando imediatamente, registrar no ledger (trigger atualiza saldo)
      if (status === 'CONFIRMADA') {
        const selectedBk = bookmakers.find(b => b.id === bookmakerId);
        if (selectedBk && workspaceId) {
          const { data: { user } } = await supabase.auth.getUser();
          // Registrar no cash_ledger - trigger atualiza saldo automaticamente
          await supabase.from("cash_ledger").insert({
            user_id: user?.id,
            workspace_id: workspaceId,
            tipo_transacao: "AJUSTE_SALDO",
            tipo_moeda: "FIAT",
            moeda: selectedBk.moeda || "BRL",
            valor: valorNumerico,
            origem_tipo: "BOOKMAKER",
            origem_bookmaker_id: bookmakerId,
            destino_tipo: "CAIXA_OPERACIONAL",
            ajuste_direcao: "SAIDA",
            ajuste_motivo: `Perda operacional: ${categoria} - ${descricao || 'Sem descrição'}`,
            status: "CONFIRMADO",
            data_transacao: new Date().toISOString(),
          });
        }
      }

      toast.success("Perda registrada com sucesso");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao registrar perda: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Registrar Perda Operacional</DialogTitle>
          <DialogDescription>
            Registre perdas que impactam o resultado do projeto (contas limitadas, bônus travados, etc.)
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Bookmaker */}
          <div className="grid gap-2">
            <Label htmlFor="bookmaker">Bookmaker *</Label>
            <Select value={bookmakerId} onValueChange={setBookmakerId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o bookmaker" />
              </SelectTrigger>
              <SelectContent>
                {bookmakers.map((bk) => (
                  <SelectItem key={bk.id} value={bk.id}>
                    <div className="flex items-center justify-between w-full gap-4">
                      <span>{bk.nome} {bk.parceiro_nome ? `- ${bk.parceiro_nome}` : ""}</span>
                      <span className="text-xs text-muted-foreground">
                        Saldo: {bk.moeda} {bk.saldo_operavel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Exibir saldo operável da bookmaker selecionada (fonte: RPC canônica) */}
            {bookmakerId && (() => {
              const selectedBk = bookmakers.find(b => b.id === bookmakerId);
              if (selectedBk) {
                return (
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Saldo operável da casa:</span>
                      <span className="text-lg font-semibold text-primary">
                        {selectedBk.moeda} {selectedBk.saldo_operavel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                );
              }
              return null;
            })()}
          </div>

          {/* Categoria */}
          <div className="grid gap-2">
            <Label htmlFor="categoria">Categoria *</Label>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a categoria" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Valor */}
          <div className="grid gap-2">
            <Label htmlFor="valor">Valor da Perda (R$) *</Label>
            <Input
              id="valor"
              type="text"
              placeholder="0,00"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </div>

          {/* Status */}
          <div className="grid gap-2">
            <Label>Status Inicial *</Label>
            <div className="grid grid-cols-2 gap-2">
              {STATUS_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isSelected = status === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStatus(opt.value)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      isSelected 
                        ? opt.value === 'PENDENTE' 
                          ? 'border-yellow-500 bg-yellow-500/10' 
                          : 'border-red-500 bg-red-500/10'
                        : 'border-border hover:border-muted-foreground/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={`h-4 w-4 ${
                        opt.value === 'PENDENTE' ? 'text-yellow-500' : 'text-red-500'
                      }`} />
                      <span className="font-medium text-sm">{opt.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{opt.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Descrição */}
          <div className="grid gap-2">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea
              id="descricao"
              placeholder="Detalhes sobre a perda..."
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Salvando..." : "Registrar Perda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
