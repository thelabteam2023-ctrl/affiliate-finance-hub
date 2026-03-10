import { useState } from "react";
import { Target } from "lucide-react";
import { cn } from "@/lib/utils";

interface BookmakerLogoProps {
  logoUrl?: string | null;
  alt?: string;
  /** Tailwind classes for the container size, e.g. "h-8 w-8 sm:h-10 sm:w-10" */
  size?: string;
  className?: string;
  /** Icon size classes for the fallback icon */
  iconSize?: string;
}

/**
 * Componente de logo de bookmaker com fallback automático.
 * 
 * Quando a URL do logo existe mas falha ao carregar (domínio bloqueado,
 * URL morta, antivírus bloqueando), exibe automaticamente o ícone fallback
 * em vez de um espaço vazio.
 */
export function BookmakerLogo({
  logoUrl,
  alt = "",
  size = "h-8 w-8 sm:h-10 sm:w-10",
  className,
  iconSize = "h-4 w-4 sm:h-5 sm:w-5",
}: BookmakerLogoProps) {
  const [hasError, setHasError] = useState(false);

  if (!logoUrl || hasError) {
    return (
      <div className={cn(size, "rounded-lg bg-muted/30 flex items-center justify-center shrink-0", className)}>
        <Target className={cn(iconSize, "text-muted-foreground")} />
      </div>
    );
  }

  return (
    <img
      src={logoUrl}
      alt={alt}
      className={cn(size, "rounded-lg object-contain logo-blend p-1 shrink-0", className)}
      onError={() => setHasError(true)}
    />
  );
}
