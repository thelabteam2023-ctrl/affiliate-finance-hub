import { Lightbulb, PlayCircle, CheckCircle2, StickyNote, LucideIcon } from "lucide-react";

export type FluxoVariant = "primary" | "accent" | "muted" | "neutral";

export interface FluxoColumnMeta {
  icon: LucideIcon;
  variant: FluxoVariant;
  /** Text color for the header title */
  titleClass: string;
  /** Badge background for the counter */
  badgeClass: string;
  /** Activity dot color when hasRecent */
  dotClass: string;
}

/**
 * Maps a column name to its visual meta.
 * Priority visual weight: Ideias/Em Andamento (pending work) > Finalizado (done).
 */
export function getColumnMeta(nome: string): FluxoColumnMeta {
  const normalized = nome.trim().toLowerCase();

  if (normalized.includes("ideia")) {
    return {
      icon: Lightbulb,
      variant: "primary",
      titleClass: "text-foreground",
      badgeClass: "bg-primary/15 text-primary border-primary/30",
      dotClass: "bg-primary",
    };
  }
  if (normalized.includes("andamento") || normalized.includes("progresso")) {
    return {
      icon: PlayCircle,
      variant: "accent",
      titleClass: "text-foreground",
      badgeClass: "bg-amber-500/15 text-amber-500 border-amber-500/30",
      dotClass: "bg-amber-500",
    };
  }
  if (normalized.includes("finaliz") || normalized.includes("concluí") || normalized.includes("feito")) {
    return {
      icon: CheckCircle2,
      variant: "muted",
      titleClass: "text-muted-foreground",
      badgeClass: "bg-muted/50 text-muted-foreground border-border/40",
      dotClass: "bg-muted-foreground/40",
    };
  }
  // "Geral" or others
  return {
    icon: StickyNote,
    variant: "neutral",
    titleClass: "text-foreground/80",
    badgeClass: "bg-muted/40 text-foreground/70 border-border/40",
    dotClass: "bg-foreground/40",
  };
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function isRecent(iso: string | undefined, windowMs = DAY_MS): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < windowMs;
}

export function isBrandNew(iso: string | undefined): boolean {
  return isRecent(iso, HOUR_MS);
}

export function daysSince(iso: string | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.floor((Date.now() - t) / DAY_MS);
}