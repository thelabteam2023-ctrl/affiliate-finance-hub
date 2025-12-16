import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRightLeft, ArrowUp, ArrowDown, HelpCircle, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface MovimentacaoCapitalCardProps {
  depositosBookmakers: number;
  saquesBookmakers: number;
  capitalEmOperacao: number;
  formatCurrency: (value: number) => string;
}

export function MovimentacaoCapitalCard({
  depositosBookmakers,
  saquesBookmakers,
  capitalEmOperacao,
  formatCurrency,
}: MovimentacaoCapitalCardProps) {
  const fluxoLiquido = saquesBookmakers - depositosBookmakers;
  const isRetornando = fluxoLiquido > 0;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-blue-500" />
            Movimentação de Capital
            <TooltipProvider>
              <UITooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors">
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[320px] text-xs">
                  <p className="font-medium mb-1">Movimentação de Capital</p>
                  <p className="mb-2">Alocação de capital entre Caixa e Bookmakers.</p>
                  <p><strong>Depósitos:</strong> Caixa → Bookmakers</p>
                  <p><strong>Saques:</strong> Bookmakers → Caixa</p>
                  <p className="mt-2 text-muted-foreground italic">Não impacta lucro ou fluxo real — apenas realocação patrimonial</p>
                </TooltipContent>
              </UITooltip>
            </TooltipProvider>
          </CardTitle>
          <div className={cn(
            "flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full",
            isRetornando ? "bg-success/10 text-success" : "bg-blue-500/10 text-blue-500"
          )}>
            {isRetornando ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
            {isRetornando ? "Capital Retornando" : "Capital Alocando"}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Fluxo entre Caixa e Bookmakers */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Depósitos</span>
              <ArrowDown className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <p className="text-lg font-bold text-blue-500">{formatCurrency(depositosBookmakers)}</p>
            <p className="text-[10px] text-muted-foreground">Caixa → Bookmakers</p>
          </div>
          <div className="p-3 bg-success/5 border border-success/20 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Saques</span>
              <ArrowUp className="h-3.5 w-3.5 text-success" />
            </div>
            <p className="text-lg font-bold text-success">{formatCurrency(saquesBookmakers)}</p>
            <p className="text-[10px] text-muted-foreground">Bookmakers → Caixa</p>
          </div>
        </div>

        {/* Capital em Operação */}
        <div className="p-4 bg-muted/30 border rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Capital em Operação</p>
                <p className="text-[10px] text-muted-foreground">Saldo atual em todas as casas</p>
              </div>
            </div>
            <p className="text-xl font-bold text-primary">{formatCurrency(capitalEmOperacao)}</p>
          </div>
        </div>

        {/* Fluxo Líquido */}
        <div className="flex items-center justify-between text-sm border-t pt-3">
          <span className="text-muted-foreground">Fluxo Líquido (período)</span>
          <span className={cn("font-semibold", fluxoLiquido >= 0 ? "text-success" : "text-blue-500")}>
            {fluxoLiquido >= 0 ? "+" : ""}{formatCurrency(fluxoLiquido)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
