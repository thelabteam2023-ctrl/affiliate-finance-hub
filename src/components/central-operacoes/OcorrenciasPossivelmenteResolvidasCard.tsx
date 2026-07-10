import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Info, Link as LinkIcon, X } from "lucide-react";
import { toast } from "sonner";

interface OrphanRow {
  ocorrencia_id: string;
  titulo: string;
  tipo: string;
  moeda: string;
  valor_risco: number;
  ocorrencia_criada_em: string;
  ajuste_ledger_id: string;
  ajuste_valor: number;
  ajuste_moeda: string;
  ajuste_data: string;
}

const fmt = (v: number, m: string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: m || "BRL" }).format(v || 0);

/**
 * Card auto-contido para a Central de Operações:
 * Lista ocorrências abertas cuja casa recebeu AJUSTE_RECONCILIACAO após a
 * abertura, sem vínculo formal. Permite ao operador vincular (marcando a
 * ocorrência como já ajustada) ou dispensar o alerta abrindo a ocorrência
 * para resolução normal.
 */
export function OcorrenciasPossivelmenteResolvidasCard() {
  const { workspaceId } = useWorkspace();
  const qc = useQueryClient();

  const { data = [], isLoading } = useQuery({
    queryKey: ["ocorrencias-possiveis-orfaos", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<OrphanRow[]> => {
      const { data, error } = await (supabase as any)
        .from("v_ocorrencias_possivelmente_resolvidas")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("ocorrencia_criada_em", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as OrphanRow[];
    },
  });

  const vincular = useMutation({
    mutationFn: async (row: OrphanRow) => {
      const { error: e1 } = await (supabase as any)
        .from("cash_ledger")
        .update({ ocorrencia_id: row.ocorrencia_id })
        .eq("id", row.ajuste_ledger_id);
      if (e1) throw e1;
      const { error: e2 } = await (supabase as any)
        .from("ocorrencias")
        .update({ resolucao_via_ajuste: true, ajuste_ledger_id: row.ajuste_ledger_id })
        .eq("id", row.ocorrencia_id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Ajuste vinculado à ocorrência");
      qc.invalidateQueries({ queryKey: ["ocorrencias-possiveis-orfaos"] });
      qc.invalidateQueries({ queryKey: ["ocorrencias"] });
    },
    onError: (e: any) => toast.error(`Erro ao vincular: ${e.message || e}`),
  });

  if (isLoading || data.length === 0) return null;

  return (
    <Card className="border-blue-500/30 bg-blue-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-blue-400" />
          <CardTitle className="text-sm">Possivelmente resolvidas por reconciliação</CardTitle>
          <span className="ml-auto text-xs text-muted-foreground">{data.length}</span>
        </div>
        <CardDescription className="text-xs">
          Ocorrências abertas cuja casa recebeu ajuste manual depois da abertura, sem vínculo.
          Revise e vincule se o ajuste representa a resolução.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.slice(0, 8).map((row) => (
          <div
            key={`${row.ocorrencia_id}-${row.ajuste_ledger_id}`}
            className="rounded-lg border border-border/50 bg-card/60 p-3 flex items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold truncate">{row.titulo}</div>
              <div className="text-[11px] text-muted-foreground">
                Risco: {fmt(Number(row.valor_risco), row.moeda)} • Ajuste em {row.ajuste_data}:{" "}
                <span className="font-mono">{fmt(Number(row.ajuste_valor), row.ajuste_moeda)}</span>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => vincular.mutate(row)}
              disabled={vincular.isPending}
              className="h-7 text-[11px]"
            >
              <LinkIcon className="h-3 w-3 mr-1" /> Vincular
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}