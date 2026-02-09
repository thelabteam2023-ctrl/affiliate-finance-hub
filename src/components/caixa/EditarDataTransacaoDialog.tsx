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

interface EditarDataTransacaoDialogProps {
  open: boolean;
  onClose: () => void;
  transacaoId: string;
  dataAtual: string;
  onSuccess: () => void;
}

export function EditarDataTransacaoDialog({
  open,
  onClose,
  transacaoId,
  dataAtual,
  onSuccess,
}: EditarDataTransacaoDialogProps) {
  const { toast } = useToast();
  const dataAtualParsed = parseLocalDateTime(dataAtual);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(dataAtualParsed);
  const [hora, setHora] = useState(format(dataAtualParsed, "HH:mm"));
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

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Format the new date as ISO string for storage
      const novaDataStr = format(novaData, "yyyy-MM-dd HH:mm:ss");

      // Build audit metadata
      const auditEntry = {
        tipo: "EDICAO_DATA",
        data_anterior: dataAtual,
        data_nova: novaDataStr,
        alterado_por: user?.id || "unknown",
        alterado_em: new Date().toISOString(),
      };

      // Fetch current auditoria_metadata to append
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

      const { error } = await supabase
        .from("cash_ledger")
        .update({
          data_transacao: novaDataStr,
          auditoria_metadata: {
            ...existingMetadata,
            historico_edicoes: [...prevHistorico, newAudit],
          } as unknown as Json,
        })
        .eq("id", transacaoId);

      if (error) throw error;

      toast({ title: "Data atualizada", description: `Nova data: ${format(novaData, "dd/MM/yyyy HH:mm")}` });
      onSuccess();
      onClose();
    } catch (error: any) {
      toast({ title: "Erro ao atualizar data", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>Editar Data da Transação</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Data atual:{" "}
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
            <Label htmlFor="hora">Horário</Label>
            <Input
              id="hora"
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              className="w-full"
            />
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
