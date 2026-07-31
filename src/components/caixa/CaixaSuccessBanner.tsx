import { CheckCircle2, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface CaixaSuccessBannerProps {
  /** Mensagem de confirmação (null = banner oculto). */
  message: string | null;
  /** Quantidade de lançamentos registrados nesta sessão. */
  count: number;
  /** True enquanto os saldos estão sendo recarregados. */
  isRefreshing?: boolean;
  onDismiss?: () => void;
  className?: string;
}

/**
 * Confirmação inline para formulários financeiros.
 *
 * O toast do canto superior direito não é suficiente: o operador precisa de
 * feedback no PRÓPRIO formulário indicando que a operação foi processada e que
 * os saldos exibidos já refletem o estado atual do sistema.
 */
export function CaixaSuccessBanner({
  message,
  count,
  isRefreshing = false,
  onDismiss,
  className,
}: CaixaSuccessBannerProps) {
  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2",
        "animate-in fade-in slide-in-from-top-1 duration-200",
        className
      )}
    >
      {isRefreshing ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-600" />
      ) : (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
      )}
      <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
        {isRefreshing ? "Atualizando saldos…" : message}
      </span>
      {count > 1 && (
        <span className="ml-auto rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          {count} lançamentos nesta sessão
        </span>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className={cn(
            "shrink-0 rounded p-0.5 text-emerald-700/70 transition-colors hover:text-emerald-700 dark:text-emerald-400/70",
            count > 1 ? "ml-1" : "ml-auto"
          )}
          aria-label="Fechar confirmação"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
