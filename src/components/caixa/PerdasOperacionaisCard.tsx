import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { AlertOctagon, ShieldX, RefreshCw } from "lucide-react";
import { useResumoPerdas, type PerdaBreakdownItem } from "@/hooks/useResumoPerdas";
import { PerdasDetalheDialog } from "./PerdasDetalheDialog";

interface Props {
  workspaceId: string | null | undefined;
  dataInicio?: Date;
  dataFim?: Date;
  cotacaoUsdBrl?: number;
  onDrillDown?: (categoria: PerdaBreakdownItem["categoria"]) => void;
}

const CATEGORY_META: Record<
  PerdaBreakdownItem["categoria"],
  { label: string; color: string; icon: any; tipoFilter: string }
> = {
  PERDA_ATIVO: { label: "Ativo Perdido", color: "#ef4444", icon: AlertOctagon, tipoFilter: "PERDA_ATIVO" },
  PERDA_SCAN: { label: "Scan / Limitação", color: "#a855f7", icon: ShieldX, tipoFilter: "PERDA_OPERACIONAL" },
  PERDA_CAMBIAL: { label: "Cambial", color: "#f59e0b", icon: RefreshCw, tipoFilter: "PERDA_CAMBIAL" },
};

function fmtUsd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}
function fmtBrl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}

export function PerdasOperacionaisCard({ workspaceId, dataInicio, dataFim, cotacaoUsdBrl, onDrillDown }: Props) {
  const { data, loading } = useResumoPerdas(workspaceId, dataInicio, dataFim);
  const [currency, setCurrency] = useState<"BRL" | "USD">("BRL");
  const [detalheCategoria, setDetalheCategoria] = useState<PerdaBreakdownItem["categoria"] | null>(null);

  const rate = cotacaoUsdBrl && cotacaoUsdBrl > 0 ? cotacaoUsdBrl : null;
  // Sem cotação disponível, força exibição em USD (fonte canônica da RPC)
  const activeCurrency: "BRL" | "USD" = rate ? currency : "USD";
  const fmt = (usdValue: number) =>
    activeCurrency === "USD" ? fmtUsd(usdValue) : fmtBrl(usdValue * (rate ?? 1));

  const items = useMemo(() => {
    const map = new Map<string, PerdaBreakdownItem>();
    (data.breakdown ?? []).forEach((b) => map.set(b.categoria, b));
    return (Object.keys(CATEGORY_META) as PerdaBreakdownItem["categoria"][]).map((cat) => ({
      categoria: cat,
      total_usd: map.get(cat)?.total_usd ?? 0,
      count: map.get(cat)?.count ?? 0,
    }));
  }, [data]);

  const secondary =
    rate === null
      ? null
      : activeCurrency === "BRL"
        ? fmtUsd(data.total_usd)
        : fmtBrl(data.total_usd * rate);

  return (
    <>
    <Card className="bg-card/50 border-border/50 p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-[var(--text-faint)]">
            Perdas Operacionais no Período
          </div>
          <div className="text-[22px] font-semibold text-red-500 mt-1">
            {loading ? "..." : fmt(data.total_usd)}
          </div>
          {secondary && !loading && (
            <div className="text-[11px] text-[var(--text-faint)] mt-0.5">≈ {secondary}</div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          {rate !== null && (
            <button
              type="button"
              onClick={() => setCurrency((c) => (c === "BRL" ? "USD" : "BRL"))}
              className="text-[10px] font-medium px-2 py-1 rounded-md border border-border/50 text-[var(--text-muted)] hover:bg-white/5 transition-colors"
              title="Alternar entre Real e Dólar"
            >
              {activeCurrency === "BRL" ? "R$ · BRL" : "US$ · USD"}
            </button>
          )}
          <div className="text-[10px] text-[var(--text-faint)]">
            {data.total_count} evento{data.total_count === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {items.map((item) => {
          const meta = CATEGORY_META[item.categoria];
          const Icon = meta.icon;
          const clickable = item.count > 0;
          return (
            <button
              key={item.categoria}
              type="button"
              disabled={!clickable}
              onClick={clickable ? () => setDetalheCategoria(item.categoria) : undefined}
              className={`flex items-center gap-2 rounded-md border border-border/40 p-2 text-left transition-colors ${
                clickable ? "hover:bg-white/5 cursor-pointer" : "opacity-70 cursor-default"
              }`}
            >
              <div
                className="w-7 h-7 rounded flex items-center justify-center shrink-0"
                style={{ background: `${meta.color}18`, color: meta.color }}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wider text-[var(--text-faint)]">{meta.label}</div>
                <div className="text-[13px] font-medium" style={{ color: meta.color }}>
                  {fmt(item.total_usd)}
                </div>
                <div className="text-[10px] text-[var(--text-faint)]">
                  {item.count} evento{item.count === 1 ? "" : "s"}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </Card>

    <PerdasDetalheDialog
      open={detalheCategoria !== null}
      onOpenChange={(o) => !o && setDetalheCategoria(null)}
      categoria={detalheCategoria}
      categoriaLabel={detalheCategoria ? CATEGORY_META[detalheCategoria].label : ""}
      workspaceId={workspaceId}
      dataInicio={dataInicio}
      dataFim={dataFim}
      cotacaoUsdBrl={cotacaoUsdBrl}
      currency={activeCurrency}
      onVerNoHistorico={
        onDrillDown && detalheCategoria ? () => onDrillDown(detalheCategoria) : undefined
      }
    />
    </>
  );
}
