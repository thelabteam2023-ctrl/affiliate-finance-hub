import { ReactNode } from "react";
import { Info } from "lucide-react";
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
}: HeaderKpiCardProps) {
  return (
    <Card className="p-5 flex flex-col gap-3 min-h-[128px] transition-colors hover:border-border">
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

      <div className="mt-auto pt-2 border-t border-border/40 min-h-[20px]">
        {secondary ?? null}
      </div>
    </Card>
  );
}
