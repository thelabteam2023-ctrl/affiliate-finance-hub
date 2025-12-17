import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFavorites } from "@/hooks/useFavorites";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface FavoriteButtonProps {
  pagePath: string;
  pageTitle: string;
  pageIcon: string;
  className?: string;
  size?: "sm" | "default";
}

export function FavoriteButton({ 
  pagePath, 
  pageTitle, 
  pageIcon, 
  className,
  size = "default"
}: FavoriteButtonProps) {
  const { isFavorite, toggleFavorite, canAddMore } = useFavorites();
  const { toast } = useToast();
  const favorited = isFavorite(pagePath);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!favorited && !canAddMore) {
      toast({
        title: "Limite atingido",
        description: "Você já tem 3 favoritos. Remova um para adicionar outro.",
        variant: "destructive",
      });
      return;
    }

    const success = await toggleFavorite(pagePath, pageTitle, pageIcon);
    
    if (success) {
      toast({
        title: favorited ? "Removido dos favoritos" : "Adicionado aos favoritos",
        description: favorited 
          ? `${pageTitle} foi removido dos seus atalhos.`
          : `${pageTitle} foi adicionado aos seus atalhos.`,
      });
    }
  };

  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const buttonSize = size === "sm" ? "h-7 w-7" : "h-8 w-8";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClick}
          className={cn(
            buttonSize,
            "shrink-0 transition-colors",
            favorited 
              ? "text-yellow-500 hover:text-yellow-600" 
              : "text-muted-foreground hover:text-foreground",
            className
          )}
        >
          <Star 
            className={cn(iconSize, favorited && "fill-current")} 
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {favorited ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      </TooltipContent>
    </Tooltip>
  );
}
