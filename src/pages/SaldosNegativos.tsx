import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { format } from "date-fns";
import { CheckCircle2, Loader2, RefreshCw, TrendingDown } from "lucide-react";

interface LinhaSaldoNegativo {
  id: string;
  nome: string;
  moeda: string;
  saldo_atual: number;
  saldo_freebet: number;
  status: string | null;
  projeto_id: string | null;
  projeto_nome: string | null;
  parceiro_nome: string | null;
  updated_at: string;
}

const fmt = (v: number, moeda: string) =>
  `${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moeda}`;

export default function SaldosNegativos() {
  const { workspaceId } = useWorkspace();
  const [rows, setRows] = useState<LinhaSaldoNegativo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [apenasSemProjeto, setApenasSemProjeto] = useState(false);

  const fetchRows = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("v_bookmakers_saldo_negativo")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("saldo_atual", { ascending: true })
      .limit(1000);
    setLoading(false);
    if (error) {
      toast.error("Não foi possível carregar a lista: " + error.message);
      return;
    }
    setRows((data as LinhaSaldoNegativo[]) ?? []);
  }, [workspaceId]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const filtered = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return rows.filter((r) => {
      if (apenasSemProjeto && r.projeto_id) return false;
      if (!term) return true;
      return (
        r.nome?.toLowerCase().includes(term) ||
        r.parceiro_nome?.toLowerCase().includes(term) ||
        r.projeto_nome?.toLowerCase().includes(term)
      );
    });
  }, [rows, filter, apenasSemProjeto]);

  const resumo = useMemo(() => {
    const porMoeda = new Map<string, { real: number; freebet: number }>();
    rows.forEach((r) => {
      const atual = porMoeda.get(r.moeda) ?? { real: 0, freebet: 0 };
      if (r.saldo_atual < 0) atual.real += r.saldo_atual;
      if (r.saldo_freebet < 0) atual.freebet += r.saldo_freebet;
      porMoeda.set(r.moeda, atual);
    });
    return {
      total: rows.length,
      semProjeto: rows.filter((r) => !r.projeto_id).length,
      porMoeda: Array.from(porMoeda.entries()).sort((a, b) => a[1].real - b[1].real),
    };
  }, [rows]);

  return (
    <div className="container mx-auto space-y-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <TrendingDown className="h-6 w-6 text-destructive" />
            Casas com saldo negativo
          </h1>
          <p className="text-sm text-muted-foreground">
            Nenhuma operação nova consegue deixar uma casa negativa. O que aparece aqui são casos
            antigos, para revisão caso a caso.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Filtrar por casa, parceiro ou projeto"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-72"
          />
          <Button
            variant={apenasSemProjeto ? "default" : "outline"}
            onClick={() => setApenasSemProjeto((v) => !v)}
          >
            {apenasSemProjeto ? "Só sem projeto" : "Todas"}
          </Button>
          <Button variant="outline" onClick={fetchRows} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Badge variant="destructive">{resumo.total} casas</Badge>
          <Badge variant="secondary">{resumo.semProjeto} sem projeto</Badge>
          {resumo.porMoeda.map(([moeda, v]) => (
            <Badge key={moeda} variant="outline">
              {moeda}: saldo {fmt(v.real, "")} · freebet {fmt(v.freebet, "")}
            </Badge>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <Card>
          <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            Nenhuma casa com saldo negativo.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {filtered.map((r) => (
          <Card key={r.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-[200px]">
                <div className="text-sm font-medium">{r.nome}</div>
                <div className="text-xs text-muted-foreground">
                  {r.parceiro_nome ?? "sem parceiro"} · {r.projeto_nome ?? "sem projeto"}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                {r.saldo_atual < 0 && (
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Saldo</div>
                    <div className="text-sm font-semibold text-destructive">
                      {fmt(r.saldo_atual, r.moeda)}
                    </div>
                  </div>
                )}
                {r.saldo_freebet < 0 && (
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Freebet</div>
                    <div className="text-sm font-semibold text-destructive">
                      {fmt(r.saldo_freebet, r.moeda)}
                    </div>
                  </div>
                )}
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Última alteração</div>
                  <div className="text-sm">{format(new Date(r.updated_at), "dd/MM/yyyy")}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
