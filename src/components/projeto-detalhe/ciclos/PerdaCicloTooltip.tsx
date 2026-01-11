import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert } from "lucide-react";

interface PerdaDetalhe {
  valor: number;
  bookmaker_nome?: string;
  categoria: string;
}

interface PerdaCicloTooltipProps {
  totalPerdas: number;
  perdas: PerdaDetalhe[];
  formatCurrency: (value: number) => string;
}

const getCategoriaLabel = (categoria: string): string => {
  const labels: Record<string, string> = {
    "SALDO_BLOQUEADO": "Bloqueio",
    "CONTA_LIMITADA": "Limitação", 
    "BONUS_TRAVADO": "Bônus Travado",
    "BONUS_EXPIRADO": "Bônus Expirado",
    "CONTA_FECHADA": "Conta Fechada",
    "FRAUDE_DETECTADA": "Fraude",
    "VERIFICACAO_FALHOU": "Verificação",
    "OUTRO": "Outro"
  };
  return labels[categoria] || categoria;
};

export function PerdaCicloTooltip({ totalPerdas, perdas, formatCurrency }: PerdaCicloTooltipProps) {
  if (totalPerdas === 0 || perdas.length === 0) {
    return (
      <span className="text-muted-foreground text-sm">—</span>
    );
  }

  // Agrupar por bookmaker
  const porBookmaker = perdas.reduce((acc, perda) => {
    const key = perda.bookmaker_nome || "Não identificado";
    if (!acc[key]) {
      acc[key] = { valor: 0, categorias: new Set<string>() };
    }
    acc[key].valor += perda.valor;
    acc[key].categorias.add(getCategoriaLabel(perda.categoria));
    return acc;
  }, {} as Record<string, { valor: number; categorias: Set<string> }>);

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className="text-red-400 border-red-500/30 bg-red-500/10 cursor-help font-medium"
          >
            <ShieldAlert className="h-3 w-3 mr-1" />
            {formatCurrency(totalPerdas)}
          </Badge>
        </TooltipTrigger>
        <TooltipContent 
          side="top" 
          className="max-w-xs bg-popover border border-border p-3"
        >
          <div className="space-y-2">
            <div className="font-semibold text-sm border-b border-border pb-1.5">
              Perdas totais: {formatCurrency(totalPerdas)}
            </div>
            <div className="space-y-1.5">
              {Object.entries(porBookmaker).map(([bookmaker, data]) => (
                <div key={bookmaker} className="flex justify-between items-start gap-3 text-xs">
                  <div>
                    <span className="font-medium">{bookmaker}</span>
                    <div className="text-muted-foreground">
                      {Array.from(data.categorias).join(", ")}
                    </div>
                  </div>
                  <span className="text-red-400 font-medium whitespace-nowrap">
                    {formatCurrency(data.valor)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
