import { cn } from "@/lib/utils";

type Variant = "neutral" | "positive" | "negative" | "alert";

interface Props {
  label: string;
  value: string;
  caption?: string;
  variant?: Variant;
  valueTone?: "default" | "positive" | "negative";
  className?: string;
}

const ringByVariant: Record<Variant, string> = {
  neutral: "",
  positive: "shadow-[0_0_28px_hsl(var(--status-emerald)/0.10)] border-[hsl(var(--status-emerald)/0.25)]",
  negative: "shadow-[0_0_28px_hsl(var(--status-red)/0.10)] border-[hsl(var(--status-red)/0.25)]",
  alert: "shadow-[0_0_28px_hsl(var(--status-red)/0.12)] border-[hsl(var(--status-red)/0.30)]",
};

const gradientByVariant: Record<Variant, string> = {
  neutral: "",
  positive: "radial-gradient(at top, hsl(var(--status-emerald) / 0.07), transparent 60%)",
  negative: "radial-gradient(at top, hsl(var(--status-red) / 0.06), transparent 60%)",
  alert: "radial-gradient(at top, hsl(var(--status-red) / 0.08), transparent 60%)",
};

const valueToneClass = (t: Props["valueTone"]) => {
  switch (t) {
    case "positive":
      return "text-[hsl(var(--status-emerald))]";
    case "negative":
      return "text-[hsl(var(--status-red))]";
    default:
      return "text-foreground";
  }
};

export function MonthlyKpiCard({
  label,
  value,
  caption,
  variant = "neutral",
  valueTone = "default",
  className,
}: Props) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border bg-card px-3.5 py-3 transition-all",
        "border-border/80",
        ringByVariant[variant],
        className
      )}
      style={{ backgroundImage: gradientByVariant[variant] }}
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-[22px] font-semibold leading-tight tabular-nums",
          valueToneClass(valueTone)
        )}
      >
        {value}
      </div>
      {caption && (
        <div className="mt-1.5 text-[10px] text-muted-foreground/80 truncate">
          {caption}
        </div>
      )}
    </div>
  );
}