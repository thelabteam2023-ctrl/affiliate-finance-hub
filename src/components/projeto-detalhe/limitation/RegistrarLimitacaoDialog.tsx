import { useState, useEffect } from "react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ShieldAlert, Building2 } from "lucide-react";
import {
  LimitationType,
  LIMITATION_TYPE_LABELS,
  type CreateLimitationEventInput,
} from "@/hooks/useLimitationEvents";

interface RegistrarLimitacaoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projetoId: string;
  onSubmit: (input: CreateLimitationEventInput) => void;
  isSubmitting?: boolean;
}

interface BookmakerOption {
  id: string;
  nome: string;
  logo_url: string | null;
}

export function RegistrarLimitacaoDialog({
  open,
  onOpenChange,
  projetoId,
  onSubmit,
  isSubmitting,
}: RegistrarLimitacaoDialogProps) {
  const { workspaceId } = useWorkspace();
  const [bookmakers, setBookmakers] = useState<BookmakerOption[]>([]);
  const [selectedBookmaker, setSelectedBookmaker] = useState("");
  const [limitationType, setLimitationType] = useState<LimitationType>("unknown");
  const [observacoes, setObservacoes] = useState("");

  useEffect(() => {
    if (open && workspaceId) {
      fetchBookmakers();
      setSelectedBookmaker("");
      setLimitationType("unknown");
      setObservacoes("");
    }
  }, [open, workspaceId]);

  const fetchBookmakers = async () => {
    const { data } = await supabase
      .from("bookmakers")
      .select("id, nome, bookmaker_catalogo_id, bookmakers_catalogo(logo_url)")
      .eq("projeto_id", projetoId)
      .in("status", ["ativa", "limitada"])
      .order("nome");

    if (data) {
      setBookmakers(
        data.map((b: any) => ({
          id: b.id,
          nome: b.nome,
          logo_url: b.bookmakers_catalogo?.logo_url || null,
        }))
      );
    }
  };

  const handleSubmit = () => {
    if (!selectedBookmaker) return;
    onSubmit({
      bookmaker_id: selectedBookmaker,
      projeto_id: projetoId,
      limitation_type: limitationType,
      observacoes: observacoes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-red-500" />
            Registrar Evento de Limitação
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Bookmaker */}
          <div className="space-y-2">
            <Label>Bookmaker *</Label>
            <Select value={selectedBookmaker} onValueChange={setSelectedBookmaker}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a casa" />
              </SelectTrigger>
              <SelectContent>
                {bookmakers.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        {b.logo_url ? (
                          <AvatarImage src={b.logo_url} />
                        ) : null}
                        <AvatarFallback className="text-[8px]">
                          <Building2 className="h-3 w-3" />
                        </AvatarFallback>
                      </Avatar>
                      {b.nome}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tipo de limitação */}
          <div className="space-y-2">
            <Label>Tipo de Limitação *</Label>
            <Select
              value={limitationType}
              onValueChange={(v) => setLimitationType(v as LimitationType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(LIMITATION_TYPE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Observações */}
          <div className="space-y-2">
            <Label>Observações (opcional)</Label>
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Descreva o que aconteceu..."
              rows={3}
            />
          </div>

          <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">
              <strong>Nota:</strong> A quantidade de apostas realizadas antes da limitação será
              calculada automaticamente com base no histórico operacional.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedBookmaker || isSubmitting}
            className="bg-red-600 hover:bg-red-700"
          >
            {isSubmitting ? "Registrando..." : "Registrar Limitação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
