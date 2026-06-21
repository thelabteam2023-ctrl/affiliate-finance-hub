import { useState } from "react";
import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";

interface TeamLogoProps {
  logoUrl?: string | null;
  alt?: string;
  size?: string;
  className?: string;
  iconSize?: string;
}

/**
 * Logo de time com fallback automático.
 * URLs vêm da API de eventos (daily_events); algumas morrem com o tempo,
 * então o onError troca para um ícone neutro em vez de quebrar o card.
 */
export function TeamLogo({
  logoUrl,
  alt = "",
  size = "h-5 w-5",
  className,
  iconSize = "h-3 w-3",
}: TeamLogoProps) {
  const [hasError, setHasError] = useState(false);

  if (!logoUrl || hasError) {
    return (
      <div className={cn(size, "rounded bg-muted/30 flex items-center justify-center shrink-0", className)}>
        <Shield className={cn(iconSize, "text-muted-foreground")} />
      </div>
    );
  }

  return (
    <img
      src={logoUrl}
      alt={alt}
      className={cn(size, "rounded object-contain shrink-0", className)}
      onError={() => setHasError(true)}
    />
  );
}