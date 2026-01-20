import { Home, HomeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useProjectTabPreference } from "@/hooks/useProjectTabPreference";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface SetDefaultTabButtonProps {
  projectId: string;
  tabKey: string;
  tabLabel: string;
  className?: string;
}

export function SetDefaultTabButton({ 
  projectId, 
  tabKey, 
  tabLabel,
  className 
}: SetDefaultTabButtonProps) {
  const { isDefaultTab, setDefaultTab, removeDefaultTab } = useProjectTabPreference(projectId);
  const { toast } = useToast();
  const isDefault = isDefaultTab(tabKey);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isDefault) {
      const success = await removeDefaultTab();
      if (success) {
        toast({
          title: "Página inicial removida",
          description: "O projeto abrirá na aba padrão.",
        });
      }
    } else {
      const success = await setDefaultTab(tabKey);
      if (success) {
        toast({
          title: "Página inicial definida",
          description: `"${tabLabel}" será a página inicial deste projeto.`,
        });
      }
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClick}
          className={cn(
            "h-6 w-6 shrink-0 transition-colors",
            isDefault 
              ? "text-primary hover:text-primary/80" 
              : "text-muted-foreground hover:text-foreground",
            className
          )}
        >
          {isDefault ? (
            <Home className="h-3.5 w-3.5 fill-current" />
          ) : (
            <HomeIcon className="h-3.5 w-3.5" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {isDefault 
          ? "Remover como página inicial" 
          : "Definir como página inicial do projeto"
        }
      </TooltipContent>
    </Tooltip>
  );
}
