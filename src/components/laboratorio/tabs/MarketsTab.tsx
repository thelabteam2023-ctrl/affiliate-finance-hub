import { useMemo, useState } from "react";
import { RawBet } from "@/hooks/useValueBetLabData";
import { MarketDrillDownModal } from "../MarketDrillDownModal";
import { resolverMercado, TipoMercadoKey, TIPOS_MERCADO } from "@/utils/mercadoResolver";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";

interface MarketsTabProps {
  markets: Record<string, MarketStats>;
  bets?: RawBet[];
  selectedSport?: string | null;
}

interface SubTipoAgg {
  label: string;
  bets: RawBet[];
  stake: number;
  profit: number;
  hasGen1: boolean;
  hasGen2: boolean;
  countGen1: number;
  countGen2: number;
  edgeCount: number;
}

interface TipoAgg {
  key: TipoMercadoKey;
  label: string;
  bets: RawBet[];
  stake: number;
  profit: number;
  subTipos: Map<string, SubTipoAgg>;
  hasGen1: boolean;
  hasGen2: boolean;
  edgeCount: number;
}

const TIPO_COLORS: Record<TipoMercadoKey, string> = {
  handicap: "from-violet-500/20 to-violet-500/5 border-violet-500/30",
  total: "from-cyan-500/20 to-cyan-500/5 border-cyan-500/30",
  resultado: "from-amber-500/20 to-amber-500/5 border-amber-500/30",
  outro: "from-slate-500/20 to-slate-500/5 border-slate-500/30",
};

function stakeOf(b: RawBet): number {
  return Number(b.stake_consolidado ?? b.valor_brl_referencia ?? b.stake_total ?? 0);
}
function profitOf(b: RawBet): number {
  return Number(b.pl_consolidado ?? b.lucro_prejuizo ?? 0);
}
function fmtBRL(n: number): string {
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function MarketsTab({ bets = [], selectedSport }: MarketsTabProps) {
  const [openTipo, setOpenTipo] = useState<TipoMercadoKey | null>(null);

  /** Agrega bets em tipos → sub-tipos via MercadoResolver. */
  const tipos = useMemo<Map<TipoMercadoKey, TipoAgg>>(() => {
    const map = new Map<TipoMercadoKey, TipoAgg>();
    for (const b of bets) {
      const r = resolverMercado(b);
      let tipoAgg = map.get(r.tipo_key);
      if (!tipoAgg) {
        tipoAgg = {
          key: r.tipo_key,
          label: r.tipo,
          bets: [],
          stake: 0,
          profit: 0,
          subTipos: new Map(),
          hasGen1: false,
          hasGen2: false,
          edgeCount: 0,
        };
        map.set(r.tipo_key, tipoAgg);
      }
      tipoAgg.bets.push(b);
      tipoAgg.stake += stakeOf(b);
      tipoAgg.profit += profitOf(b);
      if (r.geracao === 1) tipoAgg.hasGen1 = true;
      else tipoAgg.hasGen2 = true;
      if (b.fair_odd !== null && b.fair_odd !== undefined && Number(b.fair_odd) > 1) {
        tipoAgg.edgeCount += 1;
      }

      let sub = tipoAgg.subTipos.get(r.label_completo);
      if (!sub) {
        sub = {
          label: r.label_completo,
          bets: [],
          stake: 0,
          profit: 0,
          hasGen1: false,
          hasGen2: false,
          countGen1: 0,
          countGen2: 0,
          edgeCount: 0,
        };
        tipoAgg.subTipos.set(r.label_completo, sub);
      }
      sub.bets.push(b);
      sub.stake += stakeOf(b);
      sub.profit += profitOf(b);
      if (r.geracao === 1) {
        sub.hasGen1 = true;
        sub.countGen1 += 1;
      } else {
        sub.hasGen2 = true;
        sub.countGen2 += 1;
      }
      if (b.fair_odd !== null && b.fair_odd !== undefined && Number(b.fair_odd) > 1) {
        sub.edgeCount += 1;
      }
    }
    return map;
  }, [bets]);

  /** Lista de tipos na ordem canônica + filtrando os vazios. */
  const tipoList = useMemo(() => {
    return TIPOS_MERCADO.map((t) => tipos.get(t.key)).filter(
      (t): t is TipoAgg => !!t && t.bets.length > 0,
    );
  }, [tipos]);

  const totalVolume = useMemo(() => tipoList.reduce((a, t) => a + t.stake, 0), [tipoList]);

  if (tipoList.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Nenhum mercado encontrado para os filtros atuais.
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={120}>
      <div className="space-y-6 animate-in fade-in duration-500">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest font-bold text-muted-foreground">
          <span>{selectedSport ?? "Todos os esportes"}</span>
        </div>

        {/* NÍVEL ÚNICO — Tipos (sub-tipos navegados na sidebar do modal) */}
        <>
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">
                Tipos de mercado
              </h3>
              <p className="text-[11px] text-muted-foreground/80 italic">
                Selecione um tipo para abrir a análise completa. Use a sidebar do modal para alternar entre sub-tipos.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {tipoList.map((t) => {
                const roi = t.stake > 0 ? (t.profit / t.stake) * 100 : 0;
                const subCount = t.subTipos.size;
                return (
                  <button
                    key={t.key}
                    onClick={() => setOpenTipo(t.key)}
                    className={cn(
                      "text-left p-5 rounded-xl border bg-gradient-to-br transition-all hover:scale-[1.02] hover:shadow-xl",
                      TIPO_COLORS[t.key],
                    )}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-2xl font-black tracking-tight">{t.label}</h4>
                      <span
                        className={cn(
                          "text-lg font-black tabular-nums",
                          roi >= 0 ? "text-emerald-400" : "text-red-400",
                        )}
                      >
                        {roi >= 0 ? "+" : ""}
                        {roi.toFixed(2)}%
                      </span>
                    </div>
                    <div className="space-y-1 text-[11px] text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Apostas</span>
                        <span className="font-bold text-foreground tabular-nums">{t.bets.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Stake</span>
                        <span className="font-bold text-foreground tabular-nums">{fmtBRL(t.stake)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Lucro</span>
                        <span
                          className={cn(
                            "font-bold tabular-nums",
                            t.profit >= 0 ? "text-emerald-400" : "text-red-400",
                          )}
                        >
                          {fmtBRL(t.profit)}
                        </span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-border/20">
                        <span>{subCount} sub-tipo{subCount === 1 ? "" : "s"}</span>
                        {t.edgeCount > 0 && (
                          <span className="text-blue-400 font-semibold inline-flex items-center gap-1">
                            <Sparkles className="w-3 h-3" /> {t.edgeCount} c/ edge
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
        </>

        <MarketDrillDownModal
          open={!!openTipo}
          onOpenChange={(v) => !v && setOpenTipo(null)}
          marketName={null}
          tipoKey={openTipo}
          initialSubLabel="ALL"
          sportLabel={selectedSport ?? "Todos os esportes"}
          bets={bets}
        />
      </div>
    </TooltipProvider>
  );
}

/** Converte um agg para o shape esperado por LabMarketCard. */
function aggToMarketStats(sub: SubTipoAgg): MarketStats {
  const total = sub.bets.length;
  const voids = sub.bets.filter((b) => b.resultado === "VOID").length;
  const validas = total - voids;
  const greens = sub.bets.filter((b) => b.resultado === "GREEN").length;
  const meioGreens = sub.bets.filter((b) => b.resultado === "MEIO_GREEN").length;
  const meioReds = sub.bets.filter((b) => b.resultado === "MEIO_RED").length;
  const reds = sub.bets.filter((b) => b.resultado === "RED").length;
  const roi = sub.stake > 0 ? (sub.profit / sub.stake) * 100 : 0;
  const winRate = validas > 0 ? ((greens + meioGreens * 0.5) / validas) * 100 : 0;
  return {
    name: sub.label,
    total,
    validas,
    stake: sub.stake,
    profit: sub.profit,
    roi,
    winRate,
    greens,
    meioGreens,
    meioReds,
    reds,
    voids,
    oddRanges: {},
    hasGeracao1: sub.hasGen1,
    hasGeracao2: sub.hasGen2,
    apostasComEdge: sub.edgeCount,
  };
}
