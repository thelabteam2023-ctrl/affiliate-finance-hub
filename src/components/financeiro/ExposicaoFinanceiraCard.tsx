import { ReactNode, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Landmark,
  Wallet,
  Wallet2,
  ShieldAlert,
  ChevronRight,
  User,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  useExposicaoFinanceira,
  type OcorrenciaDetalhe,
  type PerdaDetalhe,
} from "@/hooks/useExposicaoFinanceira";
import { cn } from "@/lib/utils";
import { useBookmakerLogoMap } from "@/hooks/useBookmakerLogoMap";

function formatDataBR(value?: string | null): string {
  if (!value) return "—";
  try {
    const d = value.length <= 10 ? parseISO(`${value}T00:00:00`) : parseISO(value);
    if (Number.isNaN(d.getTime())) return "—";
    return format(d, "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return "—";
  }
}

function toTitleCase(value?: string | null): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/\b([a-záàâãéèêíïóôõöúçñ])/gi, (m) => m.toUpperCase())
    .replace(/\b(De|Da|Do|Das|Dos|E)\b/g, (m) => m.toLowerCase());
}

const CATEGORIA_META: Record<
  PerdaDetalhe["categoria"],
  { label: string; icon: typeof Building2; dot: string; iconBg: string; iconColor: string }
> = {
  casa: {
    label: "Casa de Apostas",
    icon: Building2,
    dot: "bg-emerald-500",
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-500",
  },
  parceiro: {
    label: "Parceiro",
    icon: User,
    dot: "bg-blue-500",
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-500",
  },
  banco: {
    label: "Banco / Processador",
    icon: Landmark,
    dot: "bg-amber-500",
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-500",
  },
  wallet: {
    label: "Wallet Crypto",
    icon: Wallet2,
    dot: "bg-violet-500",
    iconBg: "bg-violet-500/10",
    iconColor: "text-violet-500",
  },
  outro: {
    label: "Outro",
    icon: AlertTriangle,
    dot: "bg-muted-foreground/60",
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
  },
};

interface Props {
  dataInicio: string | null;
  dataFim: string | null;
  patrimonioTotal: number;
  lucroOperacional: number;
  formatCurrency: (value: number, currency?: string) => string;
  /** Badge "Período ativo" (passado pelo container) */
  periodBadge?: ReactNode;
  /** Badge "Posição atual" (passado pelo container) */
  realtimeBadge?: ReactNode;
}

type DrillKey =
  | "disputa-bookmakers"
  | "disputa-contas-parc"
  | "disputa-wallets"
  | "disputa-caixa"
  | "perdas"
  | null;

export function ExposicaoFinanceiraCard({
  dataInicio,
  dataFim,
  patrimonioTotal,
  lucroOperacional,
  formatCurrency,
  periodBadge,
  realtimeBadge: _realtimeBadge,
}: Props) {
  const exp = useExposicaoFinanceira({ dataInicio, dataFim });
  const [drill, setDrill] = useState<DrillKey>(null);

  const pctDisputaPatrimonio =
    patrimonioTotal > 0 ? (exp.totalEmDisputa / patrimonioTotal) * 100 : 0;
  const pctPerdasPatrimonio =
    patrimonioTotal > 0 ? (exp.totalPerdasPeriodo / patrimonioTotal) * 100 : 0;
  void lucroOperacional;

  const segs = [
    {
      key: "disputa-bookmakers" as const,
      label: "Casas de Apostas",
      icon: Building2,
      value: exp.bySegmentDisputa.bookmakers,
      count: exp.detalhes.disputaBookmakers.length,
    },
    {
      key: "disputa-contas-parc" as const,
      label: "Bancos / Processadores",
      icon: Landmark,
      value: exp.bySegmentDisputa["contas-parc"],
      count: exp.detalhes.disputaContasParceiros.length,
    },
    {
      key: "disputa-wallets" as const,
      label: "Wallets Crypto",
      icon: Wallet2,
      value: exp.bySegmentDisputa.wallets,
      count: exp.detalhes.disputaWallets.length,
    },
    {
      key: "disputa-caixa" as const,
      label: "Caixa Operacional",
      icon: Wallet,
      value: exp.bySegmentDisputa["caixa-op"],
      count: exp.detalhes.disputaCaixa.length,
    },
  ];

  const activeSegs = segs.filter((s) => s.value > 0);
  const showDisputaSummary = activeSegs.length >= 2;

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Exposição &amp; Perdas
          </CardTitle>
          {periodBadge}
        </div>
        <div className="grid grid-cols-2 gap-3 pt-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Em disputa
            </div>
            <div className="text-xl font-bold text-amber-600 dark:text-amber-400 tabular-nums mt-0.5">
              {formatCurrency(exp.totalEmDisputa)}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {pctDisputaPatrimonio > 0
                ? `${pctDisputaPatrimonio.toFixed(1)}% do patrimônio`
                : "—"}
            </div>
          </div>
          <div className="border-l border-border/50 pl-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Perdas no período
            </div>
            <div className="text-xl font-bold text-red-600 dark:text-red-400 tabular-nums mt-0.5">
              {formatCurrency(exp.totalPerdasPeriodo)}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {pctPerdasPatrimonio > 0
                ? `${pctPerdasPatrimonio.toFixed(1)}% do patrimônio`
                : "—"}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* SEÇÃO 1: Em disputa */}
        <section className="space-y-2">
          <h4 className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
            Em disputa por segmento
          </h4>
          {exp.loading ? (
            <div className="text-xs text-muted-foreground">Carregando…</div>
          ) : segs.every(s => s.value === 0) ? (
            <div className="text-xs text-muted-foreground">
              Nenhuma ocorrência aberta no momento.
            </div>
          ) : (
            <div className="space-y-1.5">
              {segs.map(s => {
                if (s.value === 0) return null;
                const Icon = s.icon;
                const pct = exp.totalEmDisputa > 0 ? (s.value / exp.totalEmDisputa) * 100 : 0;
                return (
                  <button
                    key={s.key}
                    onClick={() => setDrill(s.key)}
                    className="w-full text-left rounded-md hover:bg-muted/60 transition-colors p-2 -mx-2 group"
                  >
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Icon className="h-3.5 w-3.5" />
                        {s.label}
                        <Badge variant="outline" className="ml-1 text-[10px] h-4 px-1.5">
                          {s.count}
                        </Badge>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="font-medium">{formatCurrency(s.value)}</span>
                        <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60 transition" />
                      </span>
                    </div>
                    <div className="h-1 mt-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-amber-500/70 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* SEÇÃO 2: Perdas confirmadas no período */}
        <section className="space-y-2 pt-3 border-t border-border/50">
          <h4 className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 text-red-500" />
            Perdas confirmadas
          </h4>
          <button
            onClick={() => exp.countPerdas > 0 && setDrill("perdas")}
            disabled={exp.countPerdas === 0}
            className={cn(
              "w-full text-left rounded-md transition-colors p-2 -mx-2 group flex items-center justify-between gap-3",
              exp.countPerdas > 0 && "hover:bg-muted/60 cursor-pointer"
            )}
          >
            <span className="text-xs text-muted-foreground">
              {exp.countPerdas === 0
                ? "Nenhuma perda confirmada no período."
                : `Ver ${exp.countPerdas} ocorrência${exp.countPerdas === 1 ? "" : "s"}`}
            </span>
            {exp.countPerdas > 0 && (
              <ChevronRight className="h-4 w-4 opacity-40 group-hover:opacity-100 transition" />
            )}
          </button>
        </section>
      </CardContent>

      <DrillDrawer
        drill={drill}
        onClose={() => setDrill(null)}
        exp={exp}
        formatCurrency={formatCurrency}
      />
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function DrillDrawer({
  drill,
  onClose,
  exp,
  formatCurrency,
}: {
  drill: DrillKey;
  onClose: () => void;
  exp: ReturnType<typeof useExposicaoFinanceira>;
  formatCurrency: (v: number, c?: string) => string;
}) {
  let title = "";
  let description = "";
  let body: React.ReactNode = null;

  if (drill === "disputa-bookmakers") {
    title = "Em disputa · Casas de Apostas";
    description = "Ocorrências abertas com valor em risco nas bookmakers";
    body = <DisputaBookmakerList items={exp.detalhes.disputaBookmakers} formatCurrency={formatCurrency} />;
  } else if (drill === "disputa-contas-parc") {
    title = "Em disputa · Bancos / Processadores";
    description = "Ocorrências em aberto vinculadas a contas de parceiros";
    body = <OcorrenciasList items={exp.detalhes.disputaContasParceiros} formatCurrency={formatCurrency} />;
  } else if (drill === "disputa-wallets") {
    title = "Em disputa · Wallets Crypto";
    description = "Ocorrências em aberto em carteiras crypto";
    body = <OcorrenciasList items={exp.detalhes.disputaWallets} formatCurrency={formatCurrency} />;
  } else if (drill === "disputa-caixa") {
    title = "Em disputa · Caixa Operacional";
    description = "Ocorrências em aberto em contas próprias da operação";
    body = <OcorrenciasList items={exp.detalhes.disputaCaixa} formatCurrency={formatCurrency} />;
  } else if (drill === "perdas") {
    title = "Perdas confirmadas no período";
    description = "Inclui perdas operacionais lançadas (scan/fraude) e ocorrências resolvidas com perda";
    body = <PerdasList items={exp.detalhes.perdas} formatCurrency={formatCurrency} />;
  }

  return (
    <Sheet open={drill !== null} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md md:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="mt-4">{body}</div>
      </SheetContent>
    </Sheet>
  );
}

function EmptyList({ msg }: { msg: string }) {
  return <div className="text-sm text-muted-foreground py-6 text-center">{msg}</div>;
}

function OcorrenciasList({
  items,
  formatCurrency,
}: {
  items: OcorrenciaDetalhe[];
  formatCurrency: (v: number, c?: string) => string;
}) {
  if (items.length === 0) return <EmptyList msg="Nenhuma ocorrência neste segmento." />;
  return (
    <div className="space-y-2">
      {items.map(o => (
        <div key={o.id} className="rounded-md border border-border/60 p-3 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{o.titulo}</div>
              <div className="text-[11px] text-muted-foreground">
                {[o.bookmaker_nome, o.conta_banco, o.wallet_label].filter(Boolean).join(" · ") ||
                  "—"}
                {o.parceiro_nome ? ` · Titular: ${o.parceiro_nome}` : ""}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                {formatCurrency(o.valor)}
              </div>
              {o.moeda !== "BRL" && (
                <div className="text-[10px] text-muted-foreground">
                  {o.moeda} {o.valor_original.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Badge variant="outline" className="h-4 text-[10px]">
              {o.status}
            </Badge>
            {o.sub_motivo && (
              <Badge variant="secondary" className="h-4 text-[10px]">
                {o.sub_motivo}
              </Badge>
            )}
            <span className="ml-auto">{o.data_ocorrencia ?? ""}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function PerdasList({
  items,
  formatCurrency,
}: {
  items: PerdaDetalhe[];
  formatCurrency: (v: number, c?: string) => string;
}) {
  // (preserved below)
  return PerdasListImpl({ items, formatCurrency });
}

function DisputaBookmakerList({
  items,
  formatCurrency,
}: {
  items: OcorrenciaDetalhe[];
  formatCurrency: (v: number, c?: string) => string;
}) {
  const { getLogoUrl } = useBookmakerLogoMap();
  if (items.length === 0) return <EmptyList msg="Nenhuma ocorrência neste segmento." />;

  return (
    <div className="space-y-2">
      {items.map((o) => {
        const logo = o.bookmaker_nome ? getLogoUrl(o.bookmaker_nome) : null;
        const titularLabel = toTitleCase(o.parceiro_nome);
        const tituloLabel = toTitleCase(o.titulo);
        return (
          <div
            key={o.id}
            className="group rounded-lg border border-border/50 bg-card/40 px-3 py-2.5 hover:bg-muted/40 hover:border-border transition-colors"
            title={o.sub_motivo ?? undefined}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "shrink-0 h-10 w-10 rounded-md flex items-center justify-center overflow-hidden ring-1 ring-border/60",
                  !logo && "bg-emerald-500/10"
                )}
              >
                {logo ? (
                  <img
                    src={logo}
                    alt={o.bookmaker_nome ?? ""}
                    className="h-full w-full object-contain"
                    loading="lazy"
                  />
                ) : (
                  <Building2 className="h-4 w-4 text-emerald-500" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground truncate">
                      {o.bookmaker_nome ?? "—"}
                    </div>
                    {titularLabel && (
                      <div className="text-[12px] text-muted-foreground truncate">
                        {titularLabel}
                      </div>
                    )}
                    <div className="mt-1 text-[11px] text-muted-foreground/80 truncate">
                      {tituloLabel}
                      <span className="opacity-50"> · </span>
                      {formatDataBR(o.data_ocorrencia)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                      {formatCurrency(o.valor)}
                    </div>
                    {o.moeda !== "BRL" && (
                      <div className="text-[10px] text-muted-foreground tabular-nums">
                        {o.moeda}{" "}
                        {o.valor_original.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PerdasListImpl({
  items,
  formatCurrency,
}: {
  items: PerdaDetalhe[];
  formatCurrency: (v: number, c?: string) => string;
}) {
  const { getLogoUrl } = useBookmakerLogoMap();
  if (items.length === 0) return <EmptyList msg="Nenhuma perda confirmada no período." />;

  const total = items.reduce((acc, p) => acc + p.valor, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between text-[11px] text-muted-foreground px-1">
        <span>
          {items.length} perda{items.length === 1 ? "" : "s"} confirmada{items.length === 1 ? "" : "s"}
        </span>
        <span className="font-medium text-red-500/90 tabular-nums">{formatCurrency(total)}</span>
      </div>
      <div className="space-y-2">
        {items.map((p) => {
          const meta = CATEGORIA_META[p.categoria];
          const Icon = meta.icon;
          const logo =
            p.categoria === "casa" && p.bookmaker_nome ? getLogoUrl(p.bookmaker_nome) : null;
          return (
            <div
              key={p.id}
              className="group rounded-lg border border-border/50 bg-card/40 px-3 py-2.5 hover:bg-muted/40 hover:border-border transition-colors"
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "shrink-0 h-9 w-9 rounded-md flex items-center justify-center overflow-hidden ring-1 ring-border/60",
                    !logo && meta.iconBg
                  )}
                >
                  {logo ? (
                    <img
                      src={logo}
                      alt={p.bookmaker_nome ?? ""}
                      className="h-full w-full object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <Icon className={cn("h-4 w-4", meta.iconColor)} />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground line-clamp-2 leading-snug">
                        {p.descricao}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap">
                        <span className={cn("inline-block h-1.5 w-1.5 rounded-full", meta.dot)} />
                        <span className="font-medium text-foreground/70">{meta.label}</span>
                        {p.is_scan && (
                          <span className="inline-flex items-center px-1.5 py-px rounded text-[10px] font-semibold uppercase tracking-wide bg-red-500/10 text-red-400 ring-1 ring-red-500/20">
                            Scan
                          </span>
                        )}
                        {p.origem_label && (
                          <>
                            <span className="opacity-50">·</span>
                            <span className="truncate">{p.origem_label}</span>
                          </>
                        )}
                        {p.origem_titular && (
                          <>
                            <span className="opacity-50">·</span>
                            <span className="truncate">Titular: {p.origem_titular}</span>
                          </>
                        )}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground/80">
                        {formatDataBR(p.data)}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold text-red-500 tabular-nums">
                        {formatCurrency(p.valor)}
                      </div>
                      {p.moeda !== "BRL" && (
                        <div className="text-[10px] text-muted-foreground tabular-nums">
                          {p.moeda}{" "}
                          {p.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
