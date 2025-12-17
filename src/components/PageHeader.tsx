import { Star } from "lucide-react";
import { useFavorites } from "@/hooks/useFavorites";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PageHeaderProps {
  title: string;
  description?: string;
  /** The route path for this page (e.g., "/parceiros") */
  pagePath: string;
  /** The icon name to use in favorites (must match iconMap in AppSidebar) */
  pageIcon: string;
  /** Optional right-side actions */
  actions?: React.ReactNode;
  /** Optional className for the container */
  className?: string;
}

export function PageHeader({
  title,
  description,
  pagePath,
  pageIcon,
  actions,
  className,
}: PageHeaderProps) {
  const { isFavorite, toggleFavorite, canAddMore } = useFavorites();
  const { toast } = useToast();
  const favorited = isFavorite(pagePath);

  const handleToggleFavorite = async () => {
    if (!favorited && !canAddMore) {
      toast({
        title: "Limite de atalhos atingido",
        description: "Você já possui 3 atalhos. Remova um para adicionar outro.",
        variant: "destructive",
      });
      return;
    }

    try {
      await toggleFavorite(pagePath, title, pageIcon);
      toast({
        title: favorited ? "Atalho removido" : "Atalho adicionado",
        description: favorited 
          ? `${title} foi removido dos seus atalhos.`
          : `${title} foi adicionado aos seus atalhos.`,
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível atualizar o atalho.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className={cn("flex items-start justify-between", className)}>
      <div className="flex items-start gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleToggleFavorite}
                    className={cn(
                      "p-1.5 rounded-md transition-all hover:bg-accent/50",
                      favorited 
                        ? "text-yellow-500 hover:text-yellow-600" 
                        : "text-muted-foreground/50 hover:text-muted-foreground"
                    )}
                    aria-label={favorited ? "Remover dos atalhos" : "Adicionar aos atalhos"}
                  >
                    <Star 
                      className={cn(
                        "h-5 w-5 transition-all",
                        favorited && "fill-current"
                      )} 
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{favorited ? "Remover dos atalhos" : "Adicionar aos atalhos"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {description && (
            <p className="text-muted-foreground mt-1">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
