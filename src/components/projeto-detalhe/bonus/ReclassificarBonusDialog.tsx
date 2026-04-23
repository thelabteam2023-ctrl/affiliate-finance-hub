import { useState, useEffect } from "react";
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
import { Loader2, ArrowRightLeft, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface ReclassificarBonusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bonus: {
    id: string;
    title: string | null;
    bonus_amount: number;
    currency: string;
    project_id: string;
    bookmaker_id: string;
    bookmaker_nome?: string | null;
  } | null;
  onSuccess?: () => void;
}

const MOEDAS_DISPONIVEIS = ["BRL", "USD", "EUR", "GBP", "MYR", "MXN", "ARS", "COP"];

export function ReclassificarBonusDialog({
  open,
  onOpenChange,
  bonus,
  onSuccess,
}: ReclassificarBonusDialogProps) {
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const [novoProjetoId, setNovoProjetoId] = useState<string>("");
  const [novaMoeda, setNovaMoeda] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Reset state on open
  useEffect(() => {
    if (open && bonus) {
      setNovoProjetoId("");
      setNovaMoeda(bonus.currency);
    }
  }, [open, bonus]);

  // Buscar projeto atual da casa (onde a casa está fisicamente vinculada hoje)
  const { data: bookmaker } = useQuery({
    queryKey: ["reclassificar-bonus-bookmaker", bonus?.bookmaker_id],
    queryFn: async () => {
      if (!bonus?.bookmaker_id) return null;
      const { data, error } = await supabase
        .from("bookmakers")
        .select("id, nome, projeto_id, moeda")
        .eq("id", bonus.bookmaker_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: open && !!bonus?.bookmaker_id,
  });

  // Buscar projetos do workspace (excluindo o atual do bônus)
  const { data: projetos = [] } = useQuery({
    queryKey: ["reclassificar-bonus-projetos", workspace?.id, bonus?.project_id],
    queryFn: async () => {
      if (!workspace?.id) return [];
      const { data, error } = await supabase
        .from("projetos")
        .select("id, nome, moeda_consolidacao, status")
        .eq("workspace_id", workspace.id)
        .neq("id", bonus?.project_id || "")
        .order("nome");
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!workspace?.id && !!bonus,
  });

  // Validar: zero apostas dessa casa no projeto atual do bônus
  const { data: validacao, isLoading: validandoApostas } = useQuery({
    queryKey: ["reclassificar-bonus-validacao", bonus?.bookmaker_id, bonus?.project_id],
    queryFn: async () => {
      if (!bonus?.bookmaker_id || !bonus?.project_id) return { count: 0 };
      const { count, error } = await supabase
        .from("apostas_unificada")
        .select("id", { count: "exact", head: true })
        .eq("bookmaker_id", bonus.bookmaker_id)
        .eq("projeto_id", bonus.project_id);
      if (error) throw error;
      return { count: count || 0 };
    },
    enabled: open && !!bonus,
  });

  const apostasNoAntigo = validacao?.count ?? 0;
  const bookmakerJaTransferido =
    bookmaker?.projeto_id && bonus && bookmaker.projeto_id !== bonus.project_id;
  const podeReclassificar =
    !!bonus && apostasNoAntigo === 0 && !!bookmakerJaTransferido && !validandoApostas;

  // Sugerir automaticamente o projeto atual da casa
  useEffect(() => {
    if (open && bookmakerJaTransferido && bookmaker?.projeto_id && !novoProjetoId) {
      setNovoProjetoId(bookmaker.projeto_id);
    }
  }, [open, bookmakerJaTransferido, bookmaker?.projeto_id, novoProjetoId]);

  // Sugerir moeda da casa
  useEffect(() => {
    if (open && bonus && bookmaker?.moeda && novaMoeda === bonus.currency && bookmaker.moeda !== bonus.currency) {
      setNovaMoeda(bookmaker.moeda);
    }
  }, [open, bookmaker?.moeda, bonus, novaMoeda]);

  const handleSubmit = async () => {
    if (!bonus) return;
    if (!novoProjetoId) {
      toast.error("Selecione o projeto de destino");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("reclassificar_bonus_origem" as any, {
        p_bonus_id: bonus.id,
        p_novo_projeto_id: novoProjetoId,
        p_nova_moeda: novaMoeda || null,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string } | null;
      if (!result?.success) {
        toast.error(result?.error || "Falha ao reclassificar bônus");
        return;
      }
      toast.success("Bônus reclassificado com sucesso");
      // Invalidar caches relevantes
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project-bonuses"] }),
        queryClient.invalidateQueries({ queryKey: ["bonus-historico-ajustes"] }),
      ]);
      invalidateCanonicalCaches(queryClient, bonus.project_id);
      invalidateCanonicalCaches(queryClient, novoProjetoId);
      onSuccess?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error("[ReclassificarBonus] erro:", err);
      toast.error(err?.message || "Erro inesperado ao reclassificar");
    } finally {
      setSubmitting(false);
    }
  };

  if (!bonus) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            Reclassificar Bônus de Origem
          </DialogTitle>
          <DialogDescription>
            Mover este bônus para outro projeto sem alterar saldo físico. Útil quando a
            casa foi transferida entre projetos antes de ser operada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Resumo */}
          <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Bônus:</span>
              <span className="font-medium">{bonus.title || "Sem título"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Casa:</span>
              <span className="font-medium">{bonus.bookmaker_nome || bookmaker?.nome || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor:</span>
              <span className="font-medium">
                {bonus.bonus_amount.toFixed(2)} {bonus.currency}
              </span>
            </div>
          </div>

          {/* Validações */}
          {validandoApostas && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Validando histórico de apostas...
            </div>
          )}

          {!validandoApostas && apostasNoAntigo > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Esta casa tem <strong>{apostasNoAntigo} aposta(s)</strong> registrada(s) no
                projeto de origem. Reclassificar quebraria a auditoria histórica.
              </AlertDescription>
            </Alert>
          )}

          {!validandoApostas && apostasNoAntigo === 0 && !bookmakerJaTransferido && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                A casa ainda está vinculada ao projeto de origem do bônus. Transfira a
                casa para o novo projeto antes de reclassificar.
              </AlertDescription>
            </Alert>
          )}

          {!validandoApostas && podeReclassificar && (
            <Alert className="border-primary/30 bg-primary/5">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <AlertDescription>
                Elegível: zero apostas no projeto de origem e a casa já está no novo projeto.
              </AlertDescription>
            </Alert>
          )}

          {/* Form */}
          <fieldset disabled={!podeReclassificar || submitting} className="space-y-4">
            <div className="space-y-2">
              <Label>Projeto de destino</Label>
              <Select value={novoProjetoId} onValueChange={setNovoProjetoId}>
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

            <div className="space-y-2">
              <Label>Moeda do bônus</Label>
              <Select value={novaMoeda} onValueChange={setNovaMoeda}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MOEDAS_DISPONIVEIS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                      {bookmaker?.moeda === m && (
                        <span className="text-xs text-muted-foreground ml-2">
                          (moeda da casa)
                        </span>
                      )}
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
          <Button
            onClick={handleSubmit}
            disabled={!podeReclassificar || submitting || !novoProjetoId}
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Reclassificar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}