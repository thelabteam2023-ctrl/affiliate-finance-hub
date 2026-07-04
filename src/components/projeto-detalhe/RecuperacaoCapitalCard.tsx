import { TrendingUp, CheckCircle2, Sparkles, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useProjetoRecuperacaoCapital } from "@/hooks/useProjetoRecuperacaoCapital";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";

interface RecuperacaoCapitalCardProps {
  projetoId: string;
}

/**
 * Card "Recuperação de Capital" — exibido no topo do Extrato do Projeto.
 * Replica 1:1 a lógica do Break Even do ProjetoFinancialMetricsCard.
 * Sempre acumulado total (não respeita filtros de período do extrato).
 */
export function RecuperacaoCapitalCard({ projetoId }: RecuperacaoCapitalCardProps) {
  const { data, isLoading } = useProjetoRecuperacaoCapital(projetoId);
  const { formatCurrency } = useProjetoCurrency(projetoId);

  if (isLoading) {
    return (
      <Card className="border-border/50">
        <CardContent className="p-4">
          <Skeleton className="h-5 w-48 mb-3" />
          <Skeleton className="h-3 w-full mb-3" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const {
    investido,
    recuperado,
    emTransito,
    emTransitoCount,
    percentual,
    percentualBruto,
    pendente,
    pendenteEmTransito,
    pendenteRestante,
    excedente,
    status,
  } = data;

  // Estado vazio: sem aportes
  if (status === "vazio") {
    return (
      <Card className="border-border/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Recuperação de Capital</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Nenhum aporte registrado neste projeto. Adicione um depósito para acompanhar a recuperação do capital.
          </p>
        </CardContent>
      </Card>
    );
  }

  const isAcima = status === "acima";
  const isRecuperado = status === "recuperado" || isAcima;

  const accentColor = isRecuperado ? "text-emerald-500" : "text-amber-500";
  const Icon = isAcima ? Sparkles : isRecuperado ? CheckCircle2 : TrendingUp;

  const mensagem = isAcima
    ? `Projeto operando acima do capital investido. Lucro Realizado: +${formatCurrency(excedente)}.`
    : isRecuperado
      ? "Capital totalmente recuperado."
      : pendenteEmTransito > 0.005
        ? `Faltam ${formatCurrency(pendente)} para recuperar o capital — ${formatCurrency(pendenteEmTransito)} já em trânsito (saque solicitado) e ${formatCurrency(pendenteRestante)} ainda no saldo das casas.`
        : `Faltam ${formatCurrency(pendente)} para recuperar integralmente o capital.`;

  // Percentuais para a barra empilhada (verde = recuperado, amarelo = em trânsito)
  const pctTransito = investido > 0 ? Math.min(100 - percentual, (pendenteEmTransito / investido) * 100) : 0;

  return (
    <Card className="border-border/50">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Icon className={cn("h-4 w-4", accentColor)} />
            <h3 className="text-sm font-semibold">Recuperação de Capital</h3>
          </div>
          <div className="flex items-center gap-2">
            {isAcima && (
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-500 text-[10px] py-0">
                Lucro acumulado
              </Badge>
            )}
            <span className={cn("text-sm font-bold font-mono tabular-nums", accentColor)}>
              {percentual.toFixed(percentual >= 100 ? 0 : 1)}%
            </span>
          </div>
        </div>

        {/* Linha resumo Recuperado / Investido */}
        <div className="flex items-baseline justify-between gap-2 mb-1.5 text-xs">
          <span className="text-muted-foreground">
            Recuperado:{" "}
            <span className="font-mono font-medium text-foreground">{formatCurrency(recuperado)}</span>
            {" / "}
            <span className="font-mono text-muted-foreground">{formatCurrency(investido)}</span>
          </span>
          {percentualBruto > 100 && (
            <span className="text-[10px] text-muted-foreground">
              ({percentualBruto.toFixed(0)}% real)
            </span>
          )}
        </div>

        {/* Barra de progresso empilhada: recuperado (verde) + em trânsito (amarelo) */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="relative h-2 w-full overflow-hidden rounded-full bg-secondary mb-1.5 cursor-help"
              role="progressbar"
              aria-valuenow={percentual + pctTransito}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Recuperação de capital (recuperado + em trânsito)"
            >
              <div
                className="absolute inset-y-0 left-0 bg-emerald-500 transition-all"
                style={{ width: `${percentual}%` }}
              />
              {pctTransito > 0 && (
                <div
                  className="absolute inset-y-0 bg-amber-400 transition-all"
                  style={{ left: `${percentual}%`, width: `${pctTransito}%` }}
                />
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs max-w-[280px]">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                <span>Recuperado: {formatCurrency(recuperado)} ({percentual.toFixed(1)}%)</span>
              </div>
              {pendenteEmTransito > 0.005 && (
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                  <span>Em trânsito: {formatCurrency(pendenteEmTransito)} ({pctTransito.toFixed(1)}%)</span>
                </div>
              )}
              {pendenteRestante > 0.005 && (
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/50" />
                  <span>A recuperar: {formatCurrency(pendenteRestante)}</span>
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>

        {/* Legenda inline compacta */}
        {pendenteEmTransito > 0.005 && !isRecuperado && (
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground mb-2">
            <span className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Recuperado
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
              Em trânsito
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
              A recuperar
            </span>
          </div>
        )}
        {(!pendenteEmTransito || pendenteEmTransito <= 0.005) && <div className="mb-1.5" />}

        {/* KPIs */}
        <div className={cn("grid grid-cols-1 gap-3 mb-3", pendenteEmTransito > 0.005 ? "sm:grid-cols-4" : "sm:grid-cols-3")}>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Capital Aportado
            </span>
            <span className="text-sm font-semibold font-mono tabular-nums">
              {formatCurrency(investido)}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Capital Recuperado
            </span>
            <span className={cn("text-sm font-semibold font-mono tabular-nums", accentColor)}>
              {formatCurrency(recuperado)}
            </span>
          </div>
          {pendenteEmTransito > 0.005 && (
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                Em Trânsito
              </span>
              <span className="text-sm font-semibold font-mono tabular-nums text-amber-400">
                {formatCurrency(emTransito)}
              </span>
              <span className="text-[9px] text-muted-foreground">
                {emTransitoCount} saque{emTransitoCount === 1 ? "" : "s"} solicitado{emTransitoCount === 1 ? "" : "s"}
              </span>
            </div>
          )}
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {isAcima ? "Lucro Realizado" : "Pendente"}
            </span>
            <span
              className={cn(
                "text-sm font-semibold font-mono tabular-nums",
                isAcima ? "text-emerald-500" : isRecuperado ? "text-muted-foreground" : "text-foreground"
              )}
            >
              {isAcima ? `+${formatCurrency(excedente)}` : formatCurrency(pendente)}
            </span>
            {!isAcima && pendenteEmTransito > 0.005 && (
              <span className="text-[9px] text-muted-foreground">
                = aportado − recuperado
              </span>
            )}
          </div>
        </div>

        {/* Destaque do Lucro Realizado quando em lucro */}
        {isAcima && (
          <div className="mb-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs">
              <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
              <span className="font-medium text-foreground">Lucro Realizado</span>
              <span className="text-muted-foreground">
                (Recuperado − Aportado)
              </span>
            </div>
            <span className="text-sm font-bold font-mono tabular-nums text-emerald-500">
              +{formatCurrency(excedente)}
            </span>
          </div>
        )}

        {/* Mensagem complementar */}
        <p className="text-xs text-muted-foreground leading-relaxed">{mensagem}</p>
      </CardContent>
    </Card>
  );
}