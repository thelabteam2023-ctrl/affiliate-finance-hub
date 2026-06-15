import { useState } from "react";
import {
  AlertTriangle,
  Building2,
  Landmark,
  Wallet,
  Wallet2,
  ShieldAlert,
  Lock,
  ChevronRight,
} from "lucide-react";
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
  type IrrecuperavelDetalhe,
} from "@/hooks/useExposicaoFinanceira";
import { cn } from "@/lib/utils";

interface Props {
  dataInicio: string | null;
  dataFim: string | null;
  patrimonioTotal: number;
  lucroOperacional: number;
  formatCurrency: (value: number, currency?: string) => string;
}

type DrillKey =
  | "disputa-bookmakers"
  | "disputa-contas-parc"
  | "disputa-wallets"
  | "disputa-caixa"
  | "perdas"
  | "irrecuperavel"
  | null;

export function ExposicaoFinanceiraCard({
  dataInicio,
  dataFim,
  patrimonioTotal,
  lucroOperacional,
  formatCurrency,
}: Props) {
  const exp = useExposicaoFinanceira({ dataInicio, dataFim });
  const [drill, setDrill] = useState<DrillKey>(null);

  const pctPatrimonio = patrimonioTotal > 0 ? (exp.totalConsolidado / patrimonioTotal) * 100 : 0;
  const pctLucro = lucroOperacional > 0 ? (exp.totalPerdasPeriodo / lucroOperacional) * 100 : 0;

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

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Exposição &amp; Perdas
        </CardTitle>
        <div className="pt-2">
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
            {formatCurrency(exp.totalConsolidado)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {pctPatrimonio > 0
              ? `${pctPatrimonio.toFixed(1)}% do patrimônio total`
              : "Sem exposição registrada"}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* SEÇÃO 1: Em disputa */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
              Em disputa
            </h4>
            <span className="text-xs font-medium">{formatCurrency(exp.totalEmDisputa)}</span>
          </div>
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
          <div className="flex items-center justify-between">
            <h4 className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5 text-red-500" />
              Perdas confirmadas no período
            </h4>
          </div>
          <button
            onClick={() => exp.countPerdas > 0 && setDrill("perdas")}
            disabled={exp.countPerdas === 0}
            className={cn(
              "w-full text-left rounded-md transition-colors p-2 -mx-2 group",
              exp.countPerdas > 0 && "hover:bg-muted/60 cursor-pointer"
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-red-600 dark:text-red-400">
                  {formatCurrency(exp.totalPerdasPeriodo)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {exp.countPerdas} ocorrência{exp.countPerdas === 1 ? "" : "s"} ·{" "}
                  {lucroOperacional > 0 ? `${pctLucro.toFixed(1)}% do lucro op.` : "—"}
                </div>
              </div>
              {exp.countPerdas > 0 && (
                <ChevronRight className="h-4 w-4 opacity-40 group-hover:opacity-100 transition" />
              )}
            </div>
          </button>
        </section>

        {/* SEÇÃO 3: Saldo irrecuperável */}
        <section className="space-y-2 pt-3 border-t border-border/50">
          <div className="flex items-center justify-between">
            <h4 className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-purple-500" />
              Saldo irrecuperável (estoque)
            </h4>
          </div>
          <button
            onClick={() => exp.countIrrecuperavel > 0 && setDrill("irrecuperavel")}
            disabled={exp.countIrrecuperavel === 0}
            className={cn(
              "w-full text-left rounded-md transition-colors p-2 -mx-2 group",
              exp.countIrrecuperavel > 0 && "hover:bg-muted/60 cursor-pointer"
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-purple-600 dark:text-purple-400">
                  {formatCurrency(exp.totalIrrecuperavel)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {exp.countIrrecuperavel === 0
                    ? "Nenhuma casa com saldo travado"
                    : `${exp.countIrrecuperavel} casa${exp.countIrrecuperavel === 1 ? "" : "s"} com saldo bloqueado sem previsão de saque`}
                </div>
              </div>
              {exp.countIrrecuperavel > 0 && (
                <ChevronRight className="h-4 w-4 opacity-40 group-hover:opacity-100 transition" />
              )}
            </div>
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
    body = <OcorrenciasList items={exp.detalhes.disputaBookmakers} formatCurrency={formatCurrency} />;
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
  } else if (drill === "irrecuperavel") {
    title = "Saldo irrecuperável";
    description = "Capital travado em bookmakers sem previsão de saque";
    body = <IrrecList items={exp.detalhes.irrecuperavel} formatCurrency={formatCurrency} />;
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
  if (items.length === 0) return <EmptyList msg="Nenhuma perda confirmada no período." />;
  return (
    <div className="space-y-2">
      {items.map(p => (
        <div key={p.id} className="rounded-md border border-border/60 p-3 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{p.descricao}</div>
              <div className="text-[11px] text-muted-foreground">
                {p.origem_label ?? "Origem desconhecida"}
                {p.origem_titular ? ` · Titular: ${p.origem_titular}` : ""}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm font-semibold text-red-600 dark:text-red-400">
                {formatCurrency(p.valor)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Badge variant="outline" className="h-4 text-[10px]">
              {p.fonte === "ledger" ? "Lançamento" : "Ocorrência"}
            </Badge>
            <span className="ml-auto">{p.data}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function IrrecList({
  items,
  formatCurrency,
}: {
  items: IrrecuperavelDetalhe[];
  formatCurrency: (v: number, c?: string) => string;
}) {
  if (items.length === 0) return <EmptyList msg="Nenhuma casa com saldo bloqueado." />;
  return (
    <div className="space-y-2">
      {items.map(i => (
        <div key={i.id} className="rounded-md border border-border/60 p-3 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{i.bookmaker_nome}</div>
              <div className="text-[11px] text-muted-foreground">
                {i.projeto_nome ?? "—"}
                {i.parceiro_nome ? ` · Titular: ${i.parceiro_nome}` : ""}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm font-semibold text-purple-600 dark:text-purple-400">
                {formatCurrency(i.valor)}
              </div>
              {i.moeda !== "BRL" && (
                <div className="text-[10px] text-muted-foreground">
                  {i.moeda} {i.valor_original.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}