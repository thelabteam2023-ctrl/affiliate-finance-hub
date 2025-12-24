import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export type StakeRoundingValue = "none" | "1" | "10" | "100";

interface StakeRoundingSelectProps {
  value: StakeRoundingValue;
  onChange: (value: StakeRoundingValue) => void;
  showLabel?: boolean;
  className?: string;
  compact?: boolean;
}

const ROUNDING_OPTIONS: { value: StakeRoundingValue; label: string; description: string }[] = [
  { value: "none", label: "Sem arredondamento", description: "Valores exatos" },
  { value: "1", label: "Unidade (R$ 1)", description: "Arredonda para o Real mais próximo" },
  { value: "10", label: "Dezena (R$ 10)", description: "Arredonda para dezena mais próxima" },
  { value: "100", label: "Centena (R$ 100)", description: "Arredonda para centena mais próxima" },
];

export function StakeRoundingSelect({
  value,
  onChange,
  showLabel = true,
  className,
  compact = false,
}: StakeRoundingSelectProps) {
  const selectedOption = ROUNDING_OPTIONS.find(opt => opt.value === value);
  
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {showLabel && (
        <div className="flex items-center gap-1.5">
          <Label className="text-sm text-muted-foreground whitespace-nowrap">
            Arredondamento
          </Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs max-w-[220px]">
              As stakes serão ajustadas conforme o arredondamento definido.
            </TooltipContent>
          </Tooltip>
        </div>
      )}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={cn("h-8", compact ? "w-[140px]" : "w-[180px]")}>
          <SelectValue placeholder="Selecione..." />
        </SelectTrigger>
        <SelectContent>
          {ROUNDING_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <span className="text-sm">{option.label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// Badge para exibir o arredondamento ativo no painel de análise
interface StakeRoundingBadgeProps {
  value: StakeRoundingValue;
  className?: string;
}

export function StakeRoundingBadge({ value, className }: StakeRoundingBadgeProps) {
  if (value === "none") return null;
  
  const labels: Record<StakeRoundingValue, string> = {
    none: "",
    "1": "R$ 1",
    "10": "R$ 10",
    "100": "R$ 100",
  };
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-5", className)}>
          ≈ {labels[value]}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        Arredondamento: {labels[value]}
      </TooltipContent>
    </Tooltip>
  );
}

// Helper para aplicar arredondamento
export function applyStakeRounding(value: number, rounding: StakeRoundingValue): number {
  if (rounding === "none") return value;
  const factor = parseInt(rounding, 10);
  return Math.round(value / factor) * factor;
}

// Helper para verificar se arredondamento está ativo
export function isRoundingActive(value: StakeRoundingValue): boolean {
  return value !== "none";
}

// Helper para obter o fator de arredondamento
export function getRoundingFactor(value: StakeRoundingValue): number {
  if (value === "none") return 0;
  return parseInt(value, 10);
}
