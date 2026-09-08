import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";

interface LinhaAuditoria {
  ajuste_id: string;
  ajuste_tipo: string;
  ajuste_valor: number;
  ajuste_moeda: string | null;
  ajuste_competencia: string | null;
  ajuste_criado_em: string;
  pai_id: string | null;
  pai_tipo: string | null;
  pai_valor: number | null;
  pai_competencia: string | null;
  pai_status: string | null;
  pai_revertido_em: string | null;
  casa: string | null;
  parceiro: string | null;
  projeto: string | null;
  diagnostico: string;
}

const DIAGNOSTICOS: Record<string, { titulo: string; explicacao: string; grave: boolean }> = {
  PAI_INEXISTENTE: {
    titulo: "Sem operação de origem",
    explicacao: "O lançamento aponta para uma operação que não existe mais.",
    grave: true,
  },
  PAI_REVERTIDO: {
    titulo: "Origem revertida",
    explicacao: "A operação que gerou este ajuste foi revertida, mas o ajuste continua ativo.",
    grave: true,
  },
  PAI_CANCELADO: {
    titulo: "Origem cancelada",
    explicacao: "A operação que gerou este ajuste foi cancelada, mas o ajuste continua ativo.",
    grave: true,
  },
  SEM_VINCULO: {
    titulo: "Sem vínculo",
    explicacao: "O ajuste não indica de qual operação veio, o que impede rastrear a origem.",
    grave: false,
  },
  COMPETENCIA_DIVERGENTE: {
    titulo: "Data diferente da origem",
    explicacao: "O ajuste está em uma data diferente da operação que o gerou.",
    grave: false,
  },
  PROJETO_DIVERGENTE: {
    titulo: "Projeto diferente da origem",
    explicacao: "O ajuste está atribuído a um projeto diferente do da operação de origem.",
    grave: true,
  },
};

const fmtData = (v: string | null) => (v ? format(new Date(v), "dd/MM/yyyy") : "—");
const fmtValor = (v: number | null, moeda: string | null) =>
  v === null || v === undefined ? "—" : `${Number(v).toFixed(6).replace(/0+$/, "").replace(/\.$/, "")} ${moeda ?? ""}`.trim();

export default function AuditoriaCambial() {
  const { workspaceId } = useWorkspace();
  const [rows, setRows] = useState<LinhaAuditoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [mostrarOk, setMostrarOk] = useState(false);

  const fetchRows = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    let query = (supabase as any)
      .from("v_auditoria_integridade_cambial")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("ajuste_criado_em", { ascending: false })
      .limit(500);
    if (!mostrarOk) query = query.neq("diagnostico", "OK");
    const { data, error } = await query;
    setLoading(false);
    if (error) {
      toast.error("Não foi possível carregar a auditoria: " + error.message);
      return;
    }
    setRows((data as LinhaAuditoria[]) ?? []);
  }, [workspaceId, mostrarOk]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const filtered = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (r) =>
        r.casa?.toLowerCase().includes(term) ||
        r.parceiro?.toLowerCase().includes(term) ||
        r.projeto?.toLowerCase().includes(term) ||
        r.diagnostico.toLowerCase().includes(term),
    );
  }, [rows, filter]);

  const resumo = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.diagnostico, (m.get(r.diagnostico) ?? 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  return (
    <div className="container mx-auto space-y-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
            Auditoria de ganhos e perdas cambiais
          </h1>
          <p className="text-sm text-muted-foreground">
            Confere se cada ganho ou perda de câmbio ainda corresponde a uma operação válida, na data e no projeto certos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Filtrar por casa, parceiro ou projeto"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-72"
          />
          <Button variant={mostrarOk ? "default" : "outline"} onClick={() => setMostrarOk((v) => !v)}>
            {mostrarOk ? "Mostrando tudo" : "Apenas divergências"}
          </Button>
          <Button variant="outline" onClick={fetchRows} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {resumo.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {resumo.map(([d, n]) => (
            <Badge key={d} variant={DIAGNOSTICOS[d]?.grave ? "destructive" : "secondary"}>
              {DIAGNOSTICOS[d]?.titulo ?? d}: {n}
            </Badge>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <Card>
          <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            Nenhuma divergência encontrada.
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {filtered.map((r) => {
          const info = DIAGNOSTICOS[r.diagnostico];
          return (
            <Card key={r.ajuste_id}>
              <CardContent className="space-y-2 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={info?.grave ? "destructive" : "secondary"}>
                      {info?.titulo ?? r.diagnostico}
                    </Badge>
                    <span className="text-sm font-medium">
                      {r.ajuste_tipo === "GANHO_CAMBIAL" ? "Ganho" : "Perda"} de {fmtValor(r.ajuste_valor, r.ajuste_moeda)}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Lançado em {fmtData(r.ajuste_criado_em)}
                  </span>
                </div>

                {info && <p className="text-xs text-muted-foreground">{info.explicacao}</p>}

                <div className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <span className="text-muted-foreground">Casa: </span>
                    {r.casa ?? "—"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Parceiro: </span>
                    {r.parceiro ?? "—"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Projeto: </span>
                    {r.projeto ?? "—"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Data do ajuste: </span>
                    {fmtData(r.ajuste_competencia)}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Operação de origem: </span>
                    {r.pai_tipo ?? "não informada"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Valor da origem: </span>
                    {fmtValor(r.pai_valor, r.ajuste_moeda)}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Data da origem: </span>
                    {fmtData(r.pai_competencia)}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Situação da origem: </span>
                    {r.pai_revertido_em ? "Revertida" : (r.pai_status ?? "—")}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
