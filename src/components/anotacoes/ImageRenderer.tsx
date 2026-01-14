import { useState } from "react";
import { Expand, ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { ImagePreviewDialog } from "./ImagePreviewDialog";

interface ImageRendererProps {
  src: string;
  alt?: string;
  className?: string;
  compact?: boolean;
}

/**
 * Renderiza uma imagem com:
 * - Thumbnail clicável
 * - Botão "ampliar" no hover
 * - Dialog para visualização em tela cheia
 * - Fallback em caso de erro
 */
export function ImageRenderer({
  src,
  alt = "Imagem",
  className,
  compact = false,
}: ImageRendererProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  if (hasError) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 text-muted-foreground/60 text-xs py-2",
          className
        )}
      >
        <ImageOff className="h-4 w-4" />
        <span>Imagem não disponível</span>
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          "relative group inline-block my-1",
          compact ? "max-w-[120px]" : "max-w-full",
          className
        )}
      >
        {/* Thumbnail */}
        <img
          src={src}
          alt={alt}
          onError={() => setHasError(true)}
          onLoad={() => setIsLoaded(true)}
          onClick={() => setShowPreview(true)}
          className={cn(
            "rounded-md cursor-pointer transition-opacity",
            "hover:opacity-90",
            compact ? "max-h-20 object-cover" : "max-h-40 object-contain",
            !isLoaded && "opacity-0"
          )}
          loading="lazy"
        />

        {/* Loading placeholder */}
        {!isLoaded && !hasError && (
          <div
            className={cn(
              "absolute inset-0 bg-muted/30 rounded-md animate-pulse",
              compact ? "h-20 w-20" : "h-32 w-full"
            )}
          />
        )}

        {/* Botão ampliar - aparece no hover */}
        {isLoaded && (
          <button
            onClick={() => setShowPreview(true)}
            className={cn(
              "absolute bottom-1 right-1 p-1 rounded",
              "bg-background/80 border border-border/50 shadow-sm",
              "opacity-0 group-hover:opacity-100 transition-opacity",
              "hover:bg-background text-muted-foreground hover:text-foreground"
            )}
            title="Ampliar imagem"
          >
            <Expand className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Dialog de preview */}
      <ImagePreviewDialog
        imageUrl={src}
        alt={alt}
        open={showPreview}
        onOpenChange={setShowPreview}
      />
    </>
  );
}
