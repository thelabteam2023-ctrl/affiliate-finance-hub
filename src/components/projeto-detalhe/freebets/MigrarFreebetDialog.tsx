import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { invalidateCanonicalCaches } from "@/lib/invalidateCanonicalCaches";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowRightLeft, AlertTriangle, CheckCircle2, SplitSquareHorizontal, Ban } from "lucide-react";
import { toast } from "sonner";
import { CURRENCY_SYMBOLS, type SupportedCurrency } from "@/types/currency";

interface MigrarFreebetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  freebet: {
    id: string;
    motivo: string;
    valor: number;
    moeda: string;
    bookmaker_id: string;
    bookmaker_nome: string;
    projeto_id_atual: string;
    data_validade: string | null;
  } | null;
  onSuccess?: () => void;
}

type Estado = "TOTAL" | "PARCIAL" | "ESGOTADA" | "BLOQUEADA";

interface PreviewResult {
  estado: Estado;
  valor_original?: number;
  valor_restante?: number;
  valor_consumido?: number;
  apostas_no_origem?: number;
  motivo?: string;
}

function formatNative(value: number, moeda: string) {
  const symbol = CURRENCY_SYMBOLS[moeda as SupportedCurrency] || moeda;
  return `${symbol} ${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function MigrarFreebetDialog({
  open,
  onOpenChange,
  freebet,
  onSuccess,
}: MigrarFreebetDialogProps) {
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const [destinoProjetoId, setDestinoProjetoId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setDestinoProjetoId("");
  }, [open, freebet?.id]);

  // Projeto atual da casa (sugestão de destino)
  const { data: bookmaker } = useQuery({
    queryKey: ["migrar-freebet-bookmaker", freebet?.bookmaker_id],
    queryFn: async () => {
      if (!freebet?.bookmaker_id) return null;
      const { data, error } = await supabase
        .from("bookmakers")
        .select("id, projeto_id, moeda")
        .eq("id", freebet.bookmaker_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: open && !!freebet?.bookmaker_id,
  });

  // Projetos do workspace (excluindo o atual da freebet)
  const { data: projetos = [] } = useQuery({
    queryKey: ["migrar-freebet-projetos", workspace?.id, freebet?.projeto_id_atual],
    queryFn: async () => {
      if (!workspace?.id) return [];
      const { data, error } = await supabase
        .from("projetos")
        .select("id, nome, moeda_consolidacao, status")
        .eq("workspace_id", workspace.id)
        .neq("id", freebet?.projeto_id_atual || "")
        .order("nome");
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!workspace?.id && !!freebet,
  });

  // Preview do estado da freebet (TOTAL / PARCIAL / ESGOTADA)
  const { data: preview, isLoading: loadingPreview } = useQuery({
    queryKey: ["migrar-freebet-preview", freebet?.id],
    queryFn: async (): Promise<PreviewResult | null> => {
      if (!freebet?.id) return null;
      const { data, error } = await supabase.rpc("preview_migracao_freebet" as any, {
        p_freebet_id: freebet.id,
      });
      if (error) throw error;
      return (data as PreviewResult) ?? null;
    },
    enabled: open && !!freebet?.id,
  });

  const estado = preview?.estado;
  const bookmakerJaTransferido =
    bookmaker?.projeto_id && freebet && bookmaker.projeto_id !== freebet.projeto_id_atual;

  const podeMigrar = useMemo(() => {
    if (!preview || !estado) return false;
    if (estado === "ESGOTADA" || estado === "BLOQUEADA") return false;
    if (!bookmakerJaTransferido) return false;
    return true;
  }, [preview, estado, bookmakerJaTransferido]);

  // Sugerir destino: projeto atual da casa
  useEffect(() => {
    if (open && bookmakerJaTransferido && bookmaker?.projeto_id && !destinoProjetoId) {
      setDestinoProjetoId(bookmaker.projeto_id);
    }
  }, [open, bookmakerJaTransferido, bookmaker?.projeto_id, destinoProjetoId]);

  const handleSubmit = async () => {
    if (!freebet || !destinoProjetoId) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("migrar_freebet_estoque" as any, {
        p_freebet_id: freebet.id,
        p_destino_projeto_id: destinoProjetoId,
      });
      if (error) throw error;
      const result = data as {
        success: boolean;
        error?: string;
        estado?: Estado;
        valor_migrado?: number;
        projeto_destino_nome?: string;
      } | null;
      if (!result?.success) {
        toast.error(result?.error || "Falha ao migrar freebet");
        return;
      }
      const labelEstado = result.estado === "PARCIAL" ? "parcial (saldo restante)" : "total";
      toast.success(
        `Freebet migrada (${labelEstado}) — ${formatNative(result.valor_migrado || 0, freebet.moeda)} para ${result.projeto_destino_nome || "novo projeto"}`
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["freebet-estoque"] }),
        queryClient.invalidateQueries({ queryKey: ["project-bonuses"] }),
      ]);
      invalidateCanonicalCaches(queryClient, freebet.projeto_id_atual);
      invalidateCanonicalCaches(queryClient, destinoProjetoId);
      onSuccess?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error("[MigrarFreebet] erro:", err);
      toast.error(err?.message || "Erro inesperado ao migrar");
    } finally {
      setSubmitting(false);
    }
  };

  if (!freebet) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            Migrar Freebet de Estoque
          </DialogTitle>
          <DialogDescription>
            Mover esta freebet para outro projeto. O saldo físico permanece intacto na casa;
            apenas o vínculo de inventário é atualizado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Resumo da freebet */}
          <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Freebet:</span>
              <span className="font-medium truncate max-w-[260px]" title={freebet.motivo}>
                {freebet.motivo}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Casa:</span>
              <span className="font-medium">{freebet.bookmaker_nome}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor original:</span>
              <span className="font-medium">{formatNative(freebet.valor, freebet.moeda)}</span>
            </div>
          </div>

          {/* Preview do estado */}
          {loadingPreview && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analisando histórico de uso...
            </div>
          )}

          {!loadingPreview && estado === "TOTAL" && (
            <Alert className="border-primary/30 bg-primary/5">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <AlertDescription>
                <strong>Migração total:</strong> esta freebet nunca foi utilizada. O registro
                inteiro será movido para o novo projeto.
              </AlertDescription>
            </Alert>
          )}

          {!loadingPreview && estado === "PARCIAL" && (
            <Alert className="border-accent/30 bg-accent/10">
              <SplitSquareHorizontal className="h-4 w-4 text-accent-foreground" />
              <AlertDescription className="space-y-1">
                <p>
                  <strong>Migração com quebra:</strong> esta freebet já foi parcialmente usada
                  no projeto de origem.
                </p>
                <ul className="text-xs space-y-0.5 mt-1.5">
                  <li>
                    Original: <strong>{formatNative(preview?.valor_original || 0, freebet.moeda)}</strong>
                  </li>
                  <li>
                    Consumido no origem:{" "}
                    <strong>{formatNative(preview?.valor_consumido || 0, freebet.moeda)}</strong>{" "}
                    ({preview?.apostas_no_origem} aposta{preview?.apostas_no_origem === 1 ? "" : "s"})
                  </li>
                  <li>
                    Será migrado:{" "}
                    <strong className="text-accent-foreground">
                      {formatNative(preview?.valor_restante || 0, freebet.moeda)}
                    </strong>
                  </li>
                </ul>
                <p className="text-xs mt-1.5 text-muted-foreground">
                  O registro original será congelado (sem novos usos) e uma freebet "filha"
                  será criada no novo projeto com o saldo restante.
                </p>
              </AlertDescription>
            </Alert>
          )}

          {!loadingPreview && estado === "ESGOTADA" && (
            <Alert variant="destructive">
              <Ban className="h-4 w-4" />
              <AlertDescription>
                <strong>Migração bloqueada:</strong> esta freebet já foi totalmente consumida
                no projeto de origem. O histórico de P&L deve ser preservado lá.
              </AlertDescription>
            </Alert>
          )}

          {!loadingPreview && estado === "BLOQUEADA" && (
            <Alert variant="destructive">
              <Ban className="h-4 w-4" />
              <AlertDescription>
                {preview?.motivo || "Esta freebet não pode ser migrada no estado atual."}
              </AlertDescription>
            </Alert>
          )}

          {!loadingPreview && estado && estado !== "ESGOTADA" && estado !== "BLOQUEADA" && !bookmakerJaTransferido && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                A casa ainda está vinculada ao projeto de origem. Transfira a casa para o
                novo projeto antes de migrar a freebet.
              </AlertDescription>
            </Alert>
          )}

          {/* Form */}
          <fieldset disabled={!podeMigrar || submitting} className="space-y-4">
            <div className="space-y-2">
              <Label>Projeto de destino</Label>
              <Select value={destinoProjetoId} onValueChange={setDestinoProjetoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o projeto" />
                </SelectTrigger>
                <SelectContent>
                  {projetos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <div className="flex items-center gap-2">
                        <span>{p.nome}</span>
                        {bookmaker?.projeto_id === p.id && (
                          <Badge variant="secondary" className="text-[10px]">
                            atual da casa
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </fieldset>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!podeMigrar || submitting || !destinoProjetoId}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Migrar freebet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}