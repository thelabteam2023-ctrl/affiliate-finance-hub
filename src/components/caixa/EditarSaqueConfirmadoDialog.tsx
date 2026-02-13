import { useState } from "react";
import type { Json } from "@/integrations/supabase/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { parseLocalDateTime } from "@/utils/dateUtils";
import { Loader2 } from "lucide-react";

interface EditarSaqueConfirmadoDialogProps {
  open: boolean;
  onClose: () => void;
  transacaoId: string;
  dataConfirmacaoAtual: string;
  valorConfirmadoAtual: number | null;
  moeda: string;
  tipoCrypto: boolean;
  coin?: string;
  onSuccess: () => void;
}

export function EditarSaqueConfirmadoDialog({
  open,
  onClose,
  transacaoId,
  dataConfirmacaoAtual,
  valorConfirmadoAtual,
  moeda,
  tipoCrypto,
  coin,
  onSuccess,
}: EditarSaqueConfirmadoDialogProps) {
  const { toast } = useToast();
  const dataAtualParsed = parseLocalDateTime(dataConfirmacaoAtual);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(dataAtualParsed);
  const [hora, setHora] = useState(format(dataAtualParsed, "HH:mm"));
  const [valorConfirmado, setValorConfirmado] = useState(
    valorConfirmadoAtual?.toString() || ""
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!selectedDate) return;

    const [h, m] = hora.split(":").map(Number);
    if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
      toast({ title: "Hora inválida", description: "Use o formato HH:MM (00:00 a 23:59)", variant: "destructive" });
      return;
    }

    const novaData = new Date(selectedDate);
    novaData.setHours(h, m, 0, 0);

    if (novaData > new Date()) {
      toast({ title: "Data inválida", description: "Não é permitido registrar datas futuras.", variant: "destructive" });
      return;
    }

    const novoValor = valorConfirmado ? parseFloat(valorConfirmado) : null;
    if (valorConfirmado && (isNaN(novoValor!) || novoValor! <= 0)) {
      toast({ title: "Valor inválido", description: "Informe um valor positivo.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const novaDataStr = format(novaData, "yyyy-MM-dd HH:mm:ss");

      const auditEntry = {
        tipo: "EDICAO_SAQUE_CONFIRMADO",
        data_confirmacao_anterior: dataConfirmacaoAtual,
        data_confirmacao_nova: novaDataStr,
        valor_confirmado_anterior: valorConfirmadoAtual,
        valor_confirmado_novo: novoValor,
        alterado_por: user?.id || "unknown",
        alterado_em: new Date().toISOString(),
      };

      // Fetch current auditoria_metadata
      const { data: current, error: fetchError } = await supabase
        .from("cash_ledger")
        .select("auditoria_metadata")
        .eq("id", transacaoId)
        .single();

      if (fetchError) throw fetchError;

      const existingMetadata = (current?.auditoria_metadata ?? {}) as Record<string, Json>;
      const prevHistorico = Array.isArray(existingMetadata?.historico_edicoes)
        ? (existingMetadata.historico_edicoes as Json[])
        : [];
      const newAudit: Json = auditEntry as unknown as Json;

      const updateData: Record<string, any> = {
        data_confirmacao: novaDataStr,
        auditoria_metadata: {
          ...existingMetadata,
          historico_edicoes: [...prevHistorico, newAudit],
        } as unknown as Json,
      };

      if (novoValor !== null) {
        updateData.valor_confirmado = novoValor;
      }

      const { error } = await supabase
        .from("cash_ledger")
        .update(updateData)
        .eq("id", transacaoId);

      if (error) throw error;

      toast({
        title: "Saque atualizado",
        description: `Data de recebimento: ${format(novaData, "dd/MM/yyyy HH:mm")}${novoValor !== null ? ` · Valor: ${novoValor}` : ""}`,
      });
      onSuccess();
      onClose();
    } catch (error: any) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Editar Saque Confirmado</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Data de recebimento atual:{" "}
            <span className="font-medium text-foreground">
              {format(dataAtualParsed, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </span>
          </div>

          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            locale={ptBR}
            disabled={(date) => date > new Date()}
            className="rounded-md border pointer-events-auto"
          />

          <div className="space-y-2">
            <Label htmlFor="hora-recebimento">Horário de recebimento</Label>
            <Input
              id="hora-recebimento"
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="valor-confirmado">
              Valor recebido ({tipoCrypto ? (coin || "USDT") : moeda})
            </Label>
            <Input
              id="valor-confirmado"
              type="number"
              step="any"
              value={valorConfirmado}
              onChange={(e) => setValorConfirmado(e.target.value)}
              placeholder={valorConfirmadoAtual?.toString() || "0.00"}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Deixe em branco para manter o valor atual.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !selectedDate}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
