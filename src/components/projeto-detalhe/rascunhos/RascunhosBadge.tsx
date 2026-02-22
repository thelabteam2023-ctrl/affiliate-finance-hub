import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FileText } from "lucide-react";
import { useApostaRascunho } from "@/hooks/useApostaRascunho";

interface RascunhosBadgeProps {
  projetoId: string;
  workspaceId: string;
  onClick: () => void;
}

export const RascunhosBadge = memo(function RascunhosBadge({
  projetoId,
  workspaceId,
  onClick,
}: RascunhosBadgeProps) {
  const { rascunhos } = useApostaRascunho(projetoId, workspaceId);
  const count = rascunhos.length;

  if (count === 0) return null;

  // Contagem por estado
  const incompletos = rascunhos.filter(r => r.estado === "INCOMPLETO").length;
  const prontos = rascunhos.filter(r => r.estado === "PRONTO_PARA_SALVAR").length;

  // Tooltip descritivo
  const tooltipText = [
    `${count} rascunho${count > 1 ? 's' : ''}`,
    incompletos > 0 ? `${incompletos} incompleto${incompletos > 1 ? 's' : ''}` : null,
    prontos > 0 ? `${prontos} pronto${prontos > 1 ? 's' : ''}` : null,
  ].filter(Boolean).join(" • ");

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            onClick={onClick}
            className="relative gap-1.5 h-6 text-[11px] px-2"
          >
            <FileText className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Rascunhos</span>
            <Badge 
              variant={prontos > 0 ? "default" : "secondary"} 
              className="h-5 min-w-5 px-1.5 text-xs"
            >
              {count}
            </Badge>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltipText}</p>
          <p className="text-xs text-muted-foreground">Clique para gerenciar</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
