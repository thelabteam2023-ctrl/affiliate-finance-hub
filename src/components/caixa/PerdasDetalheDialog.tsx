import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { User, Building2, Wallet, Landmark, FolderKanban } from "lucide-react";

export type PerdaCategoria = "PERDA_ATIVO" | "PERDA_SCAN" | "PERDA_CAMBIAL";

interface PerdaRow {
  id: string;
  data_ref: string | null;
  valor: number | null;
  moeda: string | null;
  valor_usd_abs: number | null;
  descricao: string | null;
  ajuste_motivo: string | null;
  auditoria_metadata: Record<string, any> | null;
  parceiro_nome: string | null;
  ativo_tipo: "BOOKMAKER" | "CONTA_BANCARIA" | "WALLET" | null;
  ativo_nome: string | null;
  projeto_nome: string | null;
}

const ATIVO_META: Record<
  NonNullable<PerdaRow["ativo_tipo"]>,
  { label: string; icon: any }
> = {
  BOOKMAKER: { label: "Casa de apostas", icon: Building2 },
  CONTA_BANCARIA: { label: "Conta bancária", icon: Landmark },
  WALLET: { label: "Carteira cripto", icon: Wallet },
};

const MOTIVO_LABELS: Record<string, string> = {
  REDE_INCORRETA: "Envio em rede incorreta (irrecuperável)",
  PERDA_TRANSIT_WALLET: "Saldo em trânsito perdido",
  DIVERGENCIA: "Divergência de conciliação",
  SCAN: "Conta limitada / scan",
};

/** Remove IDs internos, prefixos técnicos e códigos de conciliação da descrição. */
function humanizeDescricao(row: PerdaRow): string {
  const meta = row.auditoria_metadata || {};
  const rawMotivo: string | undefined = meta.motivo || undefined;
  const observacao: string | undefined = meta.observacao || undefined;

  let base =
    observacao ||
    (row.ajuste_motivo && !MOTIVO_LABELS[row.ajuste_motivo] ? row.ajuste_motivo : null) ||
    row.descricao ||
    "";

  base = base
    .replace(/\[[^\]]+\]\s*/g, "")
    .replace(/-?\s*concilia[çc][ãa]o\s*#\S+/gi, "")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "")
    .replace(/^SCAN:\s*/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!base && rawMotivo) base = MOTIVO_LABELS[rawMotivo] ?? rawMotivo.replace(/_/g, " ").toLowerCase();
  return base || "Sem motivo informado";
}

function tipoPerdaLabel(row: PerdaRow, categoria: PerdaCategoria): string | null {
  const meta = row.auditoria_metadata || {};
  const key = meta.motivo || row.ajuste_motivo;
  if (key && MOTIVO_LABELS[key]) return MOTIVO_LABELS[key];
  if (categoria === "PERDA_SCAN") return "Limitação / scan de conta";
  if (categoria === "PERDA_CAMBIAL") return "Variação cambial na conciliação";
  if (categoria === "PERDA_ATIVO") return "Ativo perdido";
  return null;
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

function fmtOriginal(valor: number, moeda: string) {
  return `${moeda} ${Math.abs(valor).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`;
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
      const { data, error } = await supabase.rpc("get_perdas_detalhe", {
        p_workspace_id: workspaceId,
        p_categoria: categoria,
        p_start: dataInicio ? dataInicio.toISOString() : null,
        p_end: dataFim ? dataFim.toISOString() : null,
      });
      if (cancelled) return;
      if (error) {
        console.error("[PerdasDetalheDialog]", error.message);
        setRows([]);
      } else {
        setRows((Array.isArray(data) ? data : []) as unknown as PerdaRow[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, categoria, workspaceId, dataInicio?.getTime(), dataFim?.getTime()]);

  const rate = cotacaoUsdBrl && cotacaoUsdBrl > 0 ? cotacaoUsdBrl : 5;

  const toDisplay = (row: PerdaRow) => {
    const usd = Math.abs(row.valor_usd_abs ?? 0);
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
              const dataRef = row.data_ref;
              const ativoMeta = row.ativo_tipo ? ATIVO_META[row.ativo_tipo] : null;
              const AtivoIcon = ativoMeta?.icon;
              const tipo = tipoPerdaLabel(row, categoria!);
              return (
                <div key={row.id} className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-[12px] font-medium">
                        <User className="w-3 h-3 text-muted-foreground" />
                        {row.parceiro_nome || "Parceiro não identificado"}
                      </span>
                      {ativoMeta && AtivoIcon && row.ativo_nome && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <AtivoIcon className="w-3 h-3" />
                          {row.ativo_nome}
                          <span className="opacity-60">· {ativoMeta.label}</span>
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-muted-foreground">{humanizeDescricao(row)}</div>

                    <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
                      <span>
                        {dataRef
                          ? format(new Date(dataRef), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })
                          : "Data não informada"}
                      </span>
                      <span className="opacity-50">•</span>
                      <span>Valor original: {fmtOriginal(row.valor ?? 0, (row.moeda ?? "BRL").toUpperCase())}</span>
                      {row.projeto_nome && (
                        <>
                          <span className="opacity-50">•</span>
                          <span className="inline-flex items-center gap-1">
                            <FolderKanban className="w-3 h-3" />
                            {row.projeto_nome}
                          </span>
                        </>
                      )}
                    </div>

                    {tipo && (
                      <Badge variant="outline" className="text-[9px] font-normal px-1.5 py-0">
                        {tipo}
                      </Badge>
                    )}
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