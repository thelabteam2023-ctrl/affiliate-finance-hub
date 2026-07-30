import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export type PerdaCategoria = "PERDA_ATIVO" | "PERDA_SCAN" | "PERDA_CAMBIAL";

const CATEGORIA_TO_TIPO: Record<PerdaCategoria, string> = {
  PERDA_ATIVO: "PERDA_ATIVO",
  PERDA_SCAN: "PERDA_OPERACIONAL",
  PERDA_CAMBIAL: "PERDA_CAMBIAL",
};

interface PerdaRow {
  id: string;
  data_transacao: string | null;
  created_at: string;
  descricao: string | null;
  valor: number | null;
  moeda: string | null;
  valor_usd: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoria: PerdaCategoria | null;
  categoriaLabel: string;
  workspaceId: string | null | undefined;
  dataInicio?: Date;
  dataFim?: Date;
  cotacaoUsdBrl?: number;
  currency: "BRL" | "USD";
  onVerNoHistorico?: () => void;
}

function fmt(value: number, currency: "BRL" | "USD") {
  return value.toLocaleString(currency === "BRL" ? "pt-BR" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  });
}

export function PerdasDetalheDialog({
  open,
  onOpenChange,
  categoria,
  categoriaLabel,
  workspaceId,
  dataInicio,
  dataFim,
  cotacaoUsdBrl,
  currency,
  onVerNoHistorico,
}: Props) {
  const [rows, setRows] = useState<PerdaRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !categoria || !workspaceId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      let query = supabase
        .from("cash_ledger")
        .select("id, data_transacao, created_at, descricao, valor, moeda, valor_usd")
        .eq("workspace_id", workspaceId)
        .eq("tipo_transacao", CATEGORIA_TO_TIPO[categoria])
        .eq("status", "CONFIRMADO")
        .is("reversed_at", null)
        .order("data_transacao", { ascending: false })
        .limit(300);

      if (dataInicio) query = query.gte("data_transacao", dataInicio.toISOString());
      if (dataFim) query = query.lt("data_transacao", dataFim.toISOString());

      const { data, error } = await query;
      if (cancelled) return;
      if (error) {
        console.error("[PerdasDetalheDialog]", error.message);
        setRows([]);
      } else {
        setRows((data ?? []) as PerdaRow[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, categoria, workspaceId, dataInicio?.getTime(), dataFim?.getTime()]);

  const rate = cotacaoUsdBrl && cotacaoUsdBrl > 0 ? cotacaoUsdBrl : 5;

  const toDisplay = (row: PerdaRow) => {
    const moeda = (row.moeda ?? "BRL").toUpperCase();
    let usd: number;
    if (row.valor_usd) usd = Math.abs(row.valor_usd);
    else if (["USD", "USDT", "USDC"].includes(moeda)) usd = Math.abs(row.valor ?? 0);
    else usd = Math.abs(row.valor ?? 0) / rate;
    return currency === "USD" ? usd : usd * rate;
  };

  const total = rows.reduce((acc, r) => acc + toDisplay(r), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Histórico — {categoriaLabel}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between text-[12px] mb-2">
          <span className="text-muted-foreground">
            {rows.length} evento{rows.length === 1 ? "" : "s"} no período
          </span>
          <span className="font-semibold text-red-500">{fmt(total, currency)}</span>
        </div>

        <div className="max-h-[55vh] overflow-y-auto divide-y divide-border/40 rounded-md border border-border/40">
          {loading && <div className="p-4 text-[12px] text-muted-foreground">Carregando...</div>}
          {!loading && rows.length === 0 && (
            <div className="p-4 text-[12px] text-muted-foreground">Nenhuma perda registrada no período.</div>
          )}
          {!loading &&
            rows.map((row) => {
              const dataRef = row.data_transacao ?? row.created_at;
              return (
                <div key={row.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <div className="text-[12px] truncate">{row.descricao || "Sem descrição"}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {dataRef ? format(new Date(dataRef), "dd MMM yyyy", { locale: ptBR }) : "—"} ·{" "}
                      {(row.moeda ?? "BRL").toUpperCase()}{" "}
                      {Math.abs(row.valor ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="text-[13px] font-medium text-red-500 shrink-0">
                    {fmt(toDisplay(row), currency)}
                  </div>
                </div>
              );
            })}
        </div>

        {onVerNoHistorico && (
          <div className="flex justify-end pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                onVerNoHistorico();
              }}
            >
              Ver no histórico completo
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}