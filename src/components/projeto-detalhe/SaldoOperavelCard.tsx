import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Wallet } from "lucide-react";
import { useSaldoOperavel } from "@/hooks/useSaldoOperavel";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
import { Skeleton } from "@/components/ui/skeleton";

interface SaldoOperavelCardProps {
  projetoId: string;
  variant?: "default" | "compact";
}

export function SaldoOperavelCard({ projetoId, variant = "default" }: SaldoOperavelCardProps) {
  const { saldoOperavel, totalCasas, isLoading } = useSaldoOperavel(projetoId);
  const { formatCurrency } = useProjetoCurrency(projetoId);

  if (isLoading) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6">
          <Skeleton className="h-4 w-24" />
        </CardHeader>
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
          <Skeleton className="h-8 w-32" />
        </CardContent>
      </Card>
    );
  }

  if (variant === "compact") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary/10 border border-primary/20 cursor-help">
              <Wallet className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">
                {formatCurrency(saldoOperavel)}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs font-medium">Saldo Operável</p>
            <p className="text-xs text-muted-foreground">
              Soma dos saldos de {totalCasas} casa{totalCasas !== 1 ? 's' : ''}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6">
          <CardTitle className="text-xs md:text-sm font-medium flex items-center gap-1.5">
            Saldo Operável
            <Tooltip>
              <TooltipTrigger asChild>
                <Wallet className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-[280px]">
                <p className="text-xs font-medium mb-1">Saldo real consolidado</p>
                <p className="text-xs text-muted-foreground">
                  Soma dos saldos reais de todas as casas vinculadas ao projeto.
                </p>
              </TooltipContent>
            </Tooltip>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
          <div className="text-lg md:text-2xl font-bold text-primary">
            {formatCurrency(saldoOperavel)}
          </div>
          <p className="text-[10px] md:text-xs text-muted-foreground">
            {totalCasas} casa{totalCasas !== 1 ? 's' : ''} vinculada{totalCasas !== 1 ? 's' : ''}
          </p>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
