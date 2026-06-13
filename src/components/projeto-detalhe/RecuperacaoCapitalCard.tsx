import { TrendingUp, CheckCircle2, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useProjetoRecuperacaoCapital } from "@/hooks/useProjetoRecuperacaoCapital";
import { useProjectCurrencyFormat } from "@/hooks/useProjectCurrencyFormat";

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
  const { formatCurrency } = useProjectCurrencyFormat(projetoId);

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

  const { investido, recuperado, percentual, percentualBruto, pendente, excedente, status } = data;

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
    ? `Projeto operando acima do capital investido (+${formatCurrency(excedente)} de lucro líquido acumulado).`
    : isRecuperado
      ? "Capital totalmente recuperado."
      : `Faltam ${formatCurrency(pendente)} para recuperar integralmente o capital.`;

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

        {/* Barra de progresso */}
        <Progress
          value={percentual}
          className="h-2 mb-3"
          aria-label="Progresso da recuperação de capital"
        />

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
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
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {isAcima ? "Excedente (lucro)" : "Pendente"}
            </span>
            <span
              className={cn(
                "text-sm font-semibold font-mono tabular-nums",
                isAcima ? "text-emerald-500" : isRecuperado ? "text-muted-foreground" : "text-foreground"
              )}
            >
              {formatCurrency(isAcima ? excedente : pendente)}
            </span>
          </div>
        </div>

        {/* Mensagem complementar */}
        <p className="text-xs text-muted-foreground leading-relaxed">{mensagem}</p>
      </CardContent>
    </Card>
  );
}