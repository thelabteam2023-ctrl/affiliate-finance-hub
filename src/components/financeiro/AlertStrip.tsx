import { cn } from "@/lib/utils";

interface AlertStripProps {
  emDisputa: number;
  perdasConfirmadas: number;
  qtdOcorrencias: number;
  formatCurrency: (v: number) => string;
}

export function AlertStrip({
  emDisputa,
  perdasConfirmadas,
  qtdOcorrencias,
  formatCurrency,
}: AlertStripProps) {
  const Chip = ({
    label,
    value,
    tone,
  }: {
    label: string;
    value: string;
    tone: "warn" | "danger";
  }) => (
    <div
      className={cn(
        "flex items-center gap-2 px-2.5 py-1 rounded-full border text-[11px]",
        tone === "warn" &&
          "border-amber-500/25 bg-amber-500/5",
        tone === "danger" &&
          "border-red-500/25 bg-red-500/5",
      )}
    >
      <span className="text-[9px] uppercase tracking-[0.04em] text-muted-foreground/70">
        {label}
      </span>
      <span
        className={cn(
          "font-semibold tabular-nums",
          tone === "warn" && "text-amber-500",
          tone === "danger" && "text-red-500",
        )}
      >
        {value}
      </span>
    </div>
  );

  return (
    <div className="flex items-center gap-2 flex-wrap border-y border-border/30 px-3 py-2.5">
      <span className="text-[9px] uppercase tracking-[0.06em] text-muted-foreground/70 mr-1">
        Alertas
      </span>
      <Chip label="Em disputa" value={formatCurrency(emDisputa)} tone="warn" />
      <Chip
        label={`Perdas · ${qtdOcorrencias} ${qtdOcorrencias === 1 ? "ocorrência" : "ocorrências"}`}
        value={formatCurrency(perdasConfirmadas)}
        tone="danger"
      />
    </div>
  );
}