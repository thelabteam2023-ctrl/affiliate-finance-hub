import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";

interface Anomaly {
  id: string;
  workspace_id: string;
  bookmaker_id: string;
  saldo_atual: number;
  soma_ledger: number;
  delta: number;
  contexto: string | null;
  dia: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  acknowledged_note: string | null;
  created_at: string;
  bookmaker?: { nome: string };
}

export default function LedgerAnomalies() {
  const { workspaceId } = useWorkspace();
  const [rows, setRows] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [showAck, setShowAck] = useState(false);

  const fetchRows = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    let query = (supabase as any)
      .from("ledger_parity_anomalies")
      .select("*, bookmaker:bookmakers(nome)")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (!showAck) query = query.is("acknowledged_at", null);
    const { data, error } = await query;
    setLoading(false);
    if (error) {
      toast.error("Erro ao carregar anomalias: " + error.message);
      return;
    }
    setRows(data ?? []);
  }, [workspaceId, showAck]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const acknowledge = async (row: Anomaly) => {
    const note = window.prompt(
      `Reconhecer divergência de R$ ${row.delta.toFixed(2)} em ${row.bookmaker?.nome ?? row.bookmaker_id}?\n\nNota (opcional):`,
      "",
    );
    if (note === null) return;
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await (supabase as any)
      .from("ledger_parity_anomalies")
      .update({
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: userData?.user?.id ?? null,
        acknowledged_note: note,
      })
      .eq("id", row.id);
    if (error) {
      toast.error("Não foi possível reconhecer: " + error.message);
      return;
    }
    toast.success("Anomalia reconhecida");
    fetchRows();
  };

  const filtered = rows.filter((r) => {
    const term = filter.trim().toLowerCase();
    if (!term) return true;
    return (
      r.bookmaker?.nome?.toLowerCase().includes(term) ||
      r.contexto?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="container mx-auto py-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
            Anomalias de Paridade do Ledger
          </h1>
          <p className="text-sm text-muted-foreground">
            Divergências entre o saldo da bookmaker e a soma dos eventos financeiros, detectadas
            automaticamente após operações sensíveis.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Filtrar por bookmaker ou contexto"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-72"
          />
          <Button
            variant={showAck ? "default" : "outline"}
            onClick={() => setShowAck((v) => !v)}
          >
            {showAck ? "Mostrando reconhecidas" : "Apenas pendentes"}
          </Button>
          <Button variant="outline" onClick={fetchRows} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {filtered.length} {filtered.length === 1 ? "anomalia" : "anomalias"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-emerald-500" />
              Nenhuma anomalia {showAck ? "registrada" : "pendente"}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 pr-3">Data</th>
                    <th className="py-2 pr-3">Bookmaker</th>
                    <th className="py-2 pr-3">Contexto</th>
                    <th className="py-2 pr-3 text-right">Saldo</th>
                    <th className="py-2 pr-3 text-right">Σ Ledger</th>
                    <th className="py-2 pr-3 text-right">Δ</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {format(new Date(r.created_at), "dd/MM HH:mm", { locale: ptBR })}
                      </td>
                      <td className="py-2 pr-3 font-medium">
                        {r.bookmaker?.nome ?? r.bookmaker_id.slice(0, 8)}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">{r.contexto ?? "—"}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {Number(r.saldo_atual).toFixed(2)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {Number(r.soma_ledger).toFixed(2)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums font-semibold">
                        <span className={Number(r.delta) >= 0 ? "text-amber-600" : "text-red-600"}>
                          {Number(r.delta) >= 0 ? "+" : ""}
                          {Number(r.delta).toFixed(2)}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        {r.acknowledged_at ? (
                          <Badge variant="secondary" className="gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Reconhecida
                          </Badge>
                        ) : (
                          <Badge variant="destructive">Pendente</Badge>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {!r.acknowledged_at && (
                          <Button size="sm" variant="outline" onClick={() => acknowledge(r)}>
                            Reconhecer
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}