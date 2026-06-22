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
} from "lucide-react";

interface Props {
  loading: boolean;
  aportesPeriodo: number;
  liquidacoesPeriodo: number;
  capitalLiquidoPeriodo: number;
  aportesAcumulado: number;
  liquidacoesAcumulado: number;
  capitalLiquidoAcumulado: number;
  /** Capital próprio investido avaliado à PTAX do dia de cada aporte/liquidação. */
  capitalLiquidoHistoricoBRL: number;
  /** Resultado operacional realizado (workspace, lifetime, fonte canônica, sem FX). */
  resultadoOperacionalRealizado: number;
  patrimonioAtual: number;
  saldoFreebet: number;
  formatCurrency: (v: number) => string;
  periodLabel: string;
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
  capitalLiquidoHistoricoBRL,
  resultadoOperacionalRealizado,
  patrimonioAtual,
  saldoFreebet,
  formatCurrency,
  periodLabel,
}: Props) {
  const [modo, setModo] = useState<"acumulado" | "periodo">("acumulado");

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

  // Decomposição honesta do Patrimônio Atual:
  //   Patrimônio (PTAX hoje)
  //     = Capital histórico (PTAX da data do aporte)
  //     + Resultado operacional realizado (canônico, sem FX)
  //     + Variação cambial não realizada (plug)
  //
  // Patrimônio usa apenas saldo_atual (real) dos bookmakers, NÃO inclui
  // saldo_freebet. Freebet entra só como linha informativa, fora da soma.
  const variacaoCambialNaoRealizada =
    patrimonioAtual - capitalLiquidoHistoricoBRL - resultadoOperacionalRealizado;

  const fxThreshold = Math.max(50, Math.abs(patrimonioAtual) * 0.001);
  const mostraFx = Math.abs(variacaoCambialNaoRealizada) >= fxThreshold;

  const roi =
    capitalLiquidoHistoricoBRL > 0
      ? (resultadoOperacionalRealizado / capitalLiquidoHistoricoBRL) * 100
      : null;

  const semAportes = capitalLiquidoHistoricoBRL <= 0 && patrimonioAtual > 0;

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
                    Snapshot do agora. Capital é avaliado pela PTAX do DIA de
                    cada aporte; saldos atuais são avaliados pela PTAX de hoje.
                    A diferença que não veio de operação é Variação Cambial não
                    realizada.
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="font-mono text-sm font-bold">
                {formatCurrency(patrimonioAtual)}
              </div>
            </div>

            <BreakdownRow
              label="Capital próprio investido"
              value={capitalLiquidoHistoricoBRL}
              formatCurrency={formatCurrency}
              hint="Aportes − Liquidações, cada um avaliado pela PTAX do dia da transação. Não oscila quando a cotação atual sobe ou desce."
            />
            <BreakdownRow
              label="Resultado operacional realizado"
              value={resultadoOperacionalRealizado}
              formatCurrency={formatCurrency}
              tone={resultadoOperacionalRealizado >= 0 ? "positive" : "negative"}
              hint="Fonte canônica do Lucro Operacional do workspace (mesma engine da Visão Geral). Inclui apostas liquidadas, bônus, cashback, perdas e ajustes — exclui efeito cambial."
            />
            {mostraFx && (
              <BreakdownRow
                label="Variação cambial não realizada"
                value={variacaoCambialNaoRealizada}
                formatCurrency={formatCurrency}
                tone={variacaoCambialNaoRealizada >= 0 ? "positive" : "negative"}
                hint="Efeito de reavaliar saldos em moeda estrangeira pela PTAX de hoje. Só vira ganho ou prejuízo de verdade quando o dinheiro volta para BRL."
              />
            )}
            {roi !== null && (
              <div className="mt-2 pt-2 border-t border-border/50 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Resultado sobre capital próprio
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
    </TooltipProvider>
  );
}

function BreakdownRow({
  label,
  value,
  formatCurrency,
  tone = "default",
  hint,
}: {
  label: string;
  value: number;
  formatCurrency: (v: number) => string;
  tone?: "default" | "positive" | "negative" | "muted";
  hint?: string;
}) {
  const colorClass =
    tone === "positive"
      ? "text-emerald-500"
      : tone === "negative"
        ? "text-red-500"
        : tone === "muted"
          ? "text-muted-foreground"
          : "text-foreground";
  return (
    <div className="flex items-center justify-between py-1 text-xs">
      <span className="text-muted-foreground flex items-center gap-1.5">
        {label}
        {hint && (
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-3 w-3 cursor-help opacity-60" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">{hint}</TooltipContent>
          </Tooltip>
        )}
      </span>
      <span className={`font-mono font-semibold ${colorClass}`}>
        {value >= 0 ? "" : ""}
        {formatCurrency(value)}
      </span>
    </div>
  );
}