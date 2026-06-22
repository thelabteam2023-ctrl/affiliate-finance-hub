import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Banknote,
  TrendingUp,
  TrendingDown,
  HelpCircle,
  PiggyBank,
  AlertTriangle,
  Infinity as InfinityIcon,
  CalendarRange,
  ChevronRight,
} from "lucide-react";
import {
  ResultadoPorProjetoDrawer,
  type DrawerFocus,
} from "./ResultadoPorProjetoDrawer";
import type { ResultadoPorProjetoItem } from "@/hooks/useResultadoPorProjeto";

interface Props {
  loading: boolean;
  aportesPeriodo: number;
  liquidacoesPeriodo: number;
  capitalLiquidoPeriodo: number;
  aportesAcumulado: number;
  liquidacoesAcumulado: number;
  capitalLiquidoAcumulado: number;
  patrimonioAtual: number;
  saldoFreebet: number;
  formatCurrency: (v: number) => string;
  periodLabel: string;
  /** Itens por projeto para o drawer (Lucro Operacional / Realizado / Exposto). */
  resultadoPorProjeto?: {
    items: ResultadoPorProjetoItem[];
    totaisBRL: {
      lucroOperacional: number;
      lucroRealizado: number;
      capitalExposto: number;
    };
    loading: boolean;
  };
}

/**
 * Mostra de forma rápida quanto foi APORTADO vs LIQUIDADO (capital próprio
 * que entrou e saiu do investidor) e como esse capital se compara ao
 * patrimônio atual da operação — separando o que é capital próprio do
 * que é resultado operacional e do que é freebet.
 */
export function PosicaoCapitalCard({
  loading,
  aportesPeriodo,
  liquidacoesPeriodo,
  capitalLiquidoPeriodo,
  aportesAcumulado,
  liquidacoesAcumulado,
  capitalLiquidoAcumulado,
  patrimonioAtual,
  saldoFreebet,
  formatCurrency,
  periodLabel,
  resultadoPorProjeto,
}: Props) {
  const [modo, setModo] = useState<"acumulado" | "periodo">("acumulado");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerFocus, setDrawerFocus] = useState<DrawerFocus>("realizado");

  const openDrawer = (focus: DrawerFocus) => {
    setDrawerFocus(focus);
    setDrawerOpen(true);
  };

  const view = useMemo(() => {
    if (modo === "periodo") {
      return {
        aportes: aportesPeriodo,
        liquidacoes: liquidacoesPeriodo,
        liquido: capitalLiquidoPeriodo,
        titulo: `Capital Próprio no Período (${periodLabel})`,
      };
    }
    return {
      aportes: aportesAcumulado,
      liquidacoes: liquidacoesAcumulado,
      liquido: capitalLiquidoAcumulado,
      titulo: "Capital Próprio Investido (Acumulado)",
    };
  }, [
    modo,
    aportesPeriodo,
    liquidacoesPeriodo,
    capitalLiquidoPeriodo,
    aportesAcumulado,
    liquidacoesAcumulado,
    capitalLiquidoAcumulado,
    periodLabel,
  ]);

  // MODELO FECHADO POR CONSTRUÇÃO
  // Patrimônio Atual vem da MESMA fonte (e MESMA conversão) usada pelo
  // donut Posição de Capital. Resultado da Operação é calculado por
  // subtração — assim Capital Próprio + Resultado = Patrimônio SEMPRE.
  // A composição por projeto (engine canônica) fica disponível no drawer,
  // com bloco de reconciliação que expõe a divergência quando existir
  // (drift cambial, eventos sem projeto_id_snapshot, etc.).
  const resultadoOperacao = patrimonioAtual - capitalLiquidoAcumulado;

  const roi =
    capitalLiquidoAcumulado > 0
      ? (resultadoOperacao / capitalLiquidoAcumulado) * 100
      : null;

  const semAportes = capitalLiquidoAcumulado <= 0 && patrimonioAtual > 0;

  if (loading) {
    return (
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <Card className="border-primary/20 bg-card/50 backdrop-blur">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <CardTitle className="flex items-center gap-2 text-base">
              <PiggyBank className="h-5 w-5 text-primary" />
              Posição de Capital
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Quanto de capital próprio o investidor colocou (aportes) menos
                  o que retirou (liquidações). Não inclui depósitos/saques entre
                  caixa e bookmakers — apenas dinheiro do investidor.
                </TooltipContent>
              </Tooltip>
            </CardTitle>
            <div className="inline-flex rounded-md border border-border/50 p-0.5">
              <Button
                size="sm"
                variant={modo === "acumulado" ? "secondary" : "ghost"}
                className="h-7 px-2.5 text-xs gap-1.5"
                onClick={() => setModo("acumulado")}
                title="Soma todo o histórico, ignora o filtro de período"
              >
                <InfinityIcon className="h-3 w-3" />
                Acumulado
              </Button>
              <Button
                size="sm"
                variant={modo === "periodo" ? "secondary" : "ghost"}
                className="h-7 px-2.5 text-xs gap-1.5"
                onClick={() => setModo("periodo")}
                title="Respeita o filtro de período do dashboard"
              >
                <CalendarRange className="h-3 w-3" />
                {periodLabel}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Bloco principal */}
          <div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {modo === "acumulado" ? (
                <InfinityIcon className="h-3 w-3" />
              ) : (
                <CalendarRange className="h-3 w-3" />
              )}
              <span>{view.titulo}</span>
            </div>
            <div className="text-2xl md:text-3xl font-bold font-mono mt-0.5">
              {formatCurrency(view.liquido)}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-md bg-emerald-500/5 border border-emerald-500/15 px-2.5 py-1.5">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <TrendingUp className="h-3 w-3 text-emerald-500" />
                  Aportes
                </div>
                <div className="font-mono font-semibold text-emerald-500">
                  + {formatCurrency(view.aportes)}
                </div>
              </div>
              <div className="rounded-md bg-red-500/5 border border-red-500/15 px-2.5 py-1.5">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <TrendingDown className="h-3 w-3 text-red-500" />
                  Liquidações
                </div>
                <div className="font-mono font-semibold text-red-500">
                  − {formatCurrency(view.liquidacoes)}
                </div>
              </div>
            </div>
          </div>

          {/* Quebra do Patrimônio Atual */}
          <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <Banknote className="h-3.5 w-3.5 text-primary" />
                Composição do Patrimônio Atual
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Snapshot do agora — sempre acumulado, não muda com o
                    filtro de período nem com o toggle acima. Separa capital
                    próprio, resultado da operação e freebet (não sacável).
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="font-mono text-sm font-bold">
                {formatCurrency(patrimonioAtual)}
              </div>
            </div>

            <BreakdownRow
              label="Capital próprio investido"
              value={capitalLiquidoAcumulado}
              formatCurrency={formatCurrency}
              hint="Aportes − Liquidações (acumulado)"
            />
            <BreakdownRow
              label="Resultado da operação (acumulado)"
              value={resultadoOperacao}
              formatCurrency={formatCurrency}
              tone={resultadoOperacao >= 0 ? "positive" : "negative"}
              hint="Calculado como Patrimônio Atual − Capital Próprio Investido. É todo o ganho ou perda implícito no patrimônio que não veio do bolso do investidor. Clique para ver a origem por projeto (engine canônica) e a reconciliação."
              onClick={() => openDrawer("teorico")}
            />
            <BreakdownRow
              label="Freebet em estoque (informativo)"
              value={saldoFreebet}
              formatCurrency={formatCurrency}
              tone="muted"
              hint="Crédito promocional ainda não consumido. É contabilizado em campo separado do saldo da bookmaker e não entra no Patrimônio Atual — só vira capital quando convertido em saldo real."
            />

            {roi !== null && (
              <div className="mt-2 pt-2 border-t border-border/50 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Resultado da operação sobre capital próprio
                </span>
                <Badge
                  variant="outline"
                  className={
                    roi >= 0
                      ? "text-emerald-500 border-emerald-500/30"
                      : "text-red-500 border-red-500/30"
                  }
                >
                  {roi >= 0 ? "+" : ""}
                  {roi.toFixed(1)}%
                </Badge>
              </div>
            )}
          </div>

          {semAportes && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 text-[11px] text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                Não há aportes registrados — todo o patrimônio veio de
                operações, bônus ou freebets.
              </span>
            </div>
          )}
        </CardContent>
      </Card>
      {resultadoPorProjeto && (
        <ResultadoPorProjetoDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          focus={drawerFocus}
          items={resultadoPorProjeto.items}
          totaisBRL={resultadoPorProjeto.totaisBRL}
          loading={resultadoPorProjeto.loading}
          formatBRL={formatCurrency}
          resultadoOperacaoBRL={resultadoOperacao}
        />
      )}
    </TooltipProvider>
  );
}

function BreakdownRow({
  label,
  value,
  formatCurrency,
  tone = "default",
  hint,
  onClick,
  badge,
  indent = false,
}: {
  label: string;
  value: number;
  formatCurrency: (v: number) => string;
  tone?: "default" | "positive" | "negative" | "muted" | "warning";
  hint?: string;
  onClick?: () => void;
  badge?: string;
  indent?: boolean;
}) {
  const colorClass =
    tone === "positive"
      ? "text-emerald-500"
      : tone === "negative"
        ? "text-red-500"
        : tone === "warning"
          ? "text-amber-500"
          : tone === "muted"
            ? "text-muted-foreground"
            : "text-foreground";
  const clickable = !!onClick;
  return (
    <div
      className={`flex items-center justify-between py-1 text-xs ${
        clickable
          ? "cursor-pointer rounded-md -mx-1 px-1 hover:bg-foreground/[0.04] transition-colors"
          : ""
      } ${indent ? "pl-3" : ""}`}
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      <span className="text-muted-foreground flex items-center gap-1.5">
        {label}
        {badge && (
          <Badge
            variant="outline"
            className="text-[9px] h-3.5 px-1 py-0 border-border/60 text-muted-foreground"
          >
            {badge}
          </Badge>
        )}
        {hint && (
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-3 w-3 cursor-help opacity-60" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">{hint}</TooltipContent>
          </Tooltip>
        )}
      </span>
      <span className={`font-mono font-semibold flex items-center gap-1 ${colorClass}`}>
        {formatCurrency(value)}
        {clickable && (
          <ChevronRight className="h-3 w-3 opacity-40" />
        )}
      </span>
    </div>
  );
}