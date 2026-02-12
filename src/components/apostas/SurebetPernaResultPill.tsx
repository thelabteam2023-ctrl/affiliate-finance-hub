import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CheckCircle2, X, CircleDot, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SurebetPernaResultPillProps {
  resultado: string | null;
  onResultChange: (resultado: string) => Promise<void>;
  disabled?: boolean;
}

const RESULT_OPTIONS = [
  { value: "GREEN", label: "Green", icon: CheckCircle2, color: "text-emerald-400", bg: "hover:bg-emerald-500/20" },
  { value: "RED", label: "Red", icon: X, color: "text-red-400", bg: "hover:bg-red-500/20" },
  { value: "MEIO_GREEN", label: "½ Green", icon: CheckCircle2, color: "text-teal-400", bg: "hover:bg-teal-500/20" },
  { value: "MEIO_RED", label: "½ Red", icon: X, color: "text-orange-400", bg: "hover:bg-orange-500/20" },
  { value: "VOID", label: "Void", icon: CircleDot, color: "text-gray-400", bg: "hover:bg-gray-500/20" },
];

function getResultConfig(resultado: string | null) {
  const found = RESULT_OPTIONS.find(o => o.value === resultado);
  if (found) return { ...found, pillBg: getBadgeBg(resultado) };
  return {
    value: "PENDENTE",
    label: "•••",
    icon: Clock,
    color: "text-blue-400",
    bg: "hover:bg-blue-500/20",
    pillBg: "bg-blue-500/15 border-blue-500/30",
  };
}

function getBadgeBg(resultado: string | null): string {
  switch (resultado) {
    case "GREEN": return "bg-emerald-500/15 border-emerald-500/30";
    case "RED": return "bg-red-500/15 border-red-500/30";
    case "MEIO_GREEN": return "bg-teal-500/15 border-teal-500/30";
    case "MEIO_RED": return "bg-orange-500/15 border-orange-500/30";
    case "VOID": return "bg-gray-500/15 border-gray-500/30";
    default: return "bg-blue-500/15 border-blue-500/30";
  }
}

export function SurebetPernaResultPill({
  resultado,
  onResultChange,
  disabled,
}: SurebetPernaResultPillProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const config = getResultConfig(resultado);
  const Icon = config.icon;

  const handleSelect = async (value: string) => {
    if (value === resultado) {
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      await onResultChange(value);
      setOpen(false);
    } catch (err) {
      console.error("[SurebetPernaResultPill] Error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          disabled={disabled || loading}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium border cursor-pointer transition-all shrink-0",
            config.pillBg,
            config.color,
            "hover:ring-1 hover:ring-current/30",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          {loading ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
          ) : (
            <Icon className="h-2.5 w-2.5" />
          )}
          {config.label}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-32 p-1"
        align="end"
        side="bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-0.5">
          {RESULT_OPTIONS.map((opt) => {
            const OptIcon = opt.icon;
            const isActive = opt.value === resultado;
            return (
              <button
                key={opt.value}
                onClick={() => handleSelect(opt.value)}
                disabled={loading}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors",
                  isActive ? "bg-muted font-medium" : opt.bg,
                  opt.color
                )}
              >
                <OptIcon className="h-3.5 w-3.5" />
                {opt.label}
                {isActive && <span className="ml-auto text-[10px] opacity-60">✓</span>}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
