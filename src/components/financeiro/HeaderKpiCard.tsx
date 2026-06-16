import { ReactNode } from "react";
import { Info, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface HeaderKpiCardProps {
  label: ReactNode;
  value: string;
  /** Conteúdo exibido em tooltip ao passar o mouse no ícone (i). Substitui o antigo `hint` visível. */
  tooltip?: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "positive" | "negative" | "warning";
  /** Linha secundária — APENAS contexto numérico (label curta + valor). Sem prosa. */
  secondary?: ReactNode;
  /** Quando definido, exibe um link discreto "Ver detalhamento" e torna o card clicável. */
  onDetailClick?: () => void;
  /** Texto do link de detalhamento. Default: "Ver detalhamento". */
  detailLabel?: string;
}

const TONE: Record<NonNullable<HeaderKpiCardProps["tone"]>, string> = {
  default: "text-foreground",
  positive: "text-emerald-600 dark:text-emerald-400",
  negative: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
};

export function HeaderKpiCard({
  label,
  value,
  tooltip,
  icon,
  tone = "default",
  secondary,
  onDetailClick,
  detailLabel = "Ver detalhamento",
}: HeaderKpiCardProps) {
  const clickable = Boolean(onDetailClick);
  return (
    <Card
      onClick={onDetailClick}
      className={cn(
        "p-5 flex flex-col gap-3 min-h-[128px] transition-colors",
        clickable
          ? "cursor-pointer hover:border-primary/40 hover:bg-muted/30"
          : "hover:border-border",
      )}
    >
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5 font-medium uppercase tracking-wide">
          {label}
          {tooltip ? (
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Mais informações"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center justify-center rounded-full opacity-40 hover:opacity-90 transition-opacity"
                  >
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="max-w-[280px] text-xs normal-case tracking-normal leading-relaxed"
                >
                  {tooltip}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
        </span>
        {icon ? <span className="opacity-50">{icon}</span> : null}
      </div>

      <div
        className={cn(
          "text-2xl md:text-3xl font-bold leading-none tabular-nums tracking-tight",
          TONE[tone],
        )}
      >
        {value}
      </div>

      <div className="mt-auto pt-2 border-t border-border/40 min-h-[20px] flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">{secondary ?? null}</div>
        {clickable ? (
          <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground group-hover:text-foreground">
            {detailLabel}
            <ChevronRight className="h-3 w-3" />
          </span>
        ) : null}
      </div>
    </Card>
  );
}
