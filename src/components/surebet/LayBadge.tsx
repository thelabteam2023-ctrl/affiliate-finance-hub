/**
 * LayBadge — chip compartilhado para identificar pernas LAY.
 *
 * Mantém paridade visual com o cabeçalho do formulário de criação
 * (SurebetColumnsView/SurebetMobileCard/SurebetTableRow) e é reutilizado
 * no SurebetCard (histórico) para pernas pendentes e resolvidas.
 *
 * Dark theme premium: chip vermelho-translúcido, uppercase, baixa altura.
 */
import { cn } from "@/lib/utils";

interface LayBadgeProps {
  className?: string;
  /** Tamanho compacto (para variantes em lista/coluna). */
  size?: "xs" | "sm";
}

export function LayBadge({ className, size = "xs" }: LayBadgeProps) {
  return (
    <span
      title="Chance CONTRA (Lay)"
      className={cn(
        "inline-flex items-center font-bold uppercase tracking-wide leading-none rounded-sm",
        "bg-red-500/15 text-red-300 border border-red-500/30",
        size === "xs" ? "text-[9px] px-1 py-[1px]" : "text-[10px] px-1.5 py-0.5",
        className,
      )}
    >
      Lay
    </span>
  );
}

export default LayBadge;