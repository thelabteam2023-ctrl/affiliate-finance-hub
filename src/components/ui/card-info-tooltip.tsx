import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CardInfoTooltipProps {
  title: string;
  description: string;
  flow?: string;
}

export function CardInfoTooltip({ title, description, flow }: CardInfoTooltipProps) {
  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <button className="ml-1 text-muted-foreground hover:text-foreground transition-colors">
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs p-3 space-y-2">
          <p className="font-medium text-sm">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
          {flow && (
            <div className="pt-2 border-t border-border">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-1">Como chega aqui:</p>
              <p className="text-xs text-muted-foreground">{flow}</p>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
