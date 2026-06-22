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
} from "lucide-react";

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

  // Para a quebra, sempre usamos o ACUMULADO — é a única base coerente
  // para responder "do que é feito meu patrimônio hoje".
  const resultadoOperacionalAcumulado =
    patrimonioAtual - capitalLiquidoAcumulado - saldoFreebet;

  const roi =
    capitalLiquidoAcumulado > 0
      ? (resultadoOperacionalAcumulado / capitalLiquidoAcumulado) * 100
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
                className="h-7 px-2.5 text-xs"
                onClick={() => setModo("acumulado")}
              >
                Acumulado
              </Button>
              <Button
                size="sm"
                variant={modo === "periodo" ? "secondary" : "ghost"}
                className="h-7 px-2.5 text-xs"
                onClick={() => setModo("periodo")}
              >
                No período
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Bloco principal */}
          <div>
            <div className="text-xs text-muted-foreground">{view.titulo}</div>
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
                    Separa o capital que você de fato investiu, do resultado
                    gerado pela operação, e do saldo de freebets — que não é
                    capital sacável.
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
              label="Resultado operacional acumulado"
              value={resultadoOperacionalAcumulado}
              formatCurrency={formatCurrency}
              tone={resultadoOperacionalAcumulado >= 0 ? "positive" : "negative"}
              hint="Patrimônio − Capital Próprio − Saldo Freebet"
            />
            <BreakdownRow
              label="Saldo freebet (não é capital)"
              value={saldoFreebet}
              formatCurrency={formatCurrency}
              tone="muted"
              hint="Soma de saldo_freebet dos bookmakers ativos"
            />

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