import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Building2, Users, Briefcase, HelpCircle, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CustoSustentacaoCardProps {
  custosOperacionais: number;
  despesasAdministrativas: number;
  pagamentosOperadores: number;
  formatCurrency: (value: number) => string;
}

export function CustoSustentacaoCard({
  custosOperacionais,
  despesasAdministrativas,
  pagamentosOperadores,
  formatCurrency,
}: CustoSustentacaoCardProps) {
  const custoTotal = custosOperacionais + despesasAdministrativas + pagamentosOperadores;
  const custoMensal = custoTotal; // Já é mensal baseado no período filtrado

  const categorias = [
    { 
      label: "Custos Operacionais", 
      valor: custosOperacionais, 
      icon: Briefcase, 
      color: "text-orange-500",
      bg: "bg-orange-500/10",
      percent: custoTotal > 0 ? (custosOperacionais / custoTotal) * 100 : 0
    },
    { 
      label: "Infraestrutura", 
      valor: despesasAdministrativas, 
      icon: Building2, 
      color: "text-purple-500",
      bg: "bg-purple-500/10",
      percent: custoTotal > 0 ? (despesasAdministrativas / custoTotal) * 100 : 0
    },
    { 
      label: "Operadores", 
      valor: pagamentosOperadores, 
      icon: Users, 
      color: "text-cyan-500",
      bg: "bg-cyan-500/10",
      percent: custoTotal > 0 ? (pagamentosOperadores / custoTotal) * 100 : 0
    },
  ];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-orange-500" />
            Custo de Sustentação
            <TooltipProvider>
              <UITooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors">
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[320px] text-xs">
                  <p className="font-medium mb-1">Custo de Sustentação</p>
                  <p className="mb-2">Custo mínimo mensal para manter a operação viva.</p>
                  <p><strong>Inclui:</strong> Custos operacionais, infraestrutura, operadores</p>
                  <p><strong>Exclui:</strong> Depósitos em bookmakers (realocação)</p>
                  <p className="mt-2 text-muted-foreground italic">Responde: "Quanto preciso ganhar para empatar?"</p>
                </TooltipContent>
              </UITooltip>
            </TooltipProvider>
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Total */}
        <div className="p-4 bg-gradient-to-br from-orange-500/10 to-orange-500/5 border border-orange-500/20 rounded-lg text-center">
          <DollarSign className="h-6 w-6 text-orange-500 mx-auto mb-1" />
          <p className="text-[10px] text-muted-foreground uppercase mb-1">Custo Mensal Mínimo</p>
          <p className="text-2xl font-bold text-orange-500">{formatCurrency(custoMensal)}</p>
          <p className="text-xs text-muted-foreground mt-1">para manter operação ativa</p>
        </div>

        {/* Breakdown */}
        <div className="space-y-2">
          {categorias.map((cat) => (
            <div key={cat.label} className="flex items-center gap-3">
              <div className={cn("p-2 rounded-lg", cat.bg)}>
                <cat.icon className={cn("h-4 w-4", cat.color)} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground truncate">{cat.label}</span>
                  <span className={cn("text-sm font-semibold", cat.color)}>{formatCurrency(cat.valor)}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={cn("h-full rounded-full transition-all", cat.bg.replace('/10', ''))}
                    style={{ width: `${cat.percent}%`, backgroundColor: cat.color.includes('orange') ? 'rgb(249 115 22)' : cat.color.includes('purple') ? 'rgb(168 85 247)' : 'rgb(6 182 212)' }}
                  />
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground w-10 text-right">{cat.percent.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
