import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Building2, Users, Briefcase, HelpCircle, TrendingDown, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export interface OperadorDetalhe {
  operadorNome: string;
  valor: number;
}

interface CustoSustentacaoCardProps {
  custosOperacionais: number;
  despesasAdministrativas: number;
  pagamentosOperadores: number;
  formatCurrency: (value: number) => string;
  operadoresDetalhes?: OperadorDetalhe[];
}

export function CustoSustentacaoCard({
  custosOperacionais,
  despesasAdministrativas,
  pagamentosOperadores,
  formatCurrency,
  operadoresDetalhes = [],
}: CustoSustentacaoCardProps) {
  const [operadoresExpanded, setOperadoresExpanded] = useState(false);
  
  const custoTotal = custosOperacionais + despesasAdministrativas + pagamentosOperadores;
  const custoMensal = custoTotal; // Já é mensal baseado no período filtrado

  // Separar RH de operadores tradicionais para visualização
  const rhDetalhes = operadoresDetalhes.filter(d => d.operadorNome.startsWith("RH - "));
  const operadoresTradicionais = operadoresDetalhes.filter(d => !d.operadorNome.startsWith("RH - "));
  const totalRH = rhDetalhes.reduce((acc, d) => acc + d.valor, 0);
  const totalOperadoresTrad = operadoresTradicionais.reduce((acc, d) => acc + d.valor, 0);

  const categorias = [
    { 
      label: "Custos Operacionais", 
      valor: custosOperacionais, 
      icon: Briefcase, 
      color: "text-orange-500",
      bg: "bg-orange-500/10",
      barColor: "rgb(249 115 22)",
      percent: custoTotal > 0 ? (custosOperacionais / custoTotal) * 100 : 0,
      hasExpand: false,
    },
    { 
      label: "Infraestrutura", 
      valor: despesasAdministrativas, 
      icon: Building2, 
      color: "text-purple-500",
      bg: "bg-purple-500/10",
      barColor: "rgb(168 85 247)",
      percent: custoTotal > 0 ? (despesasAdministrativas / custoTotal) * 100 : 0,
      hasExpand: false,
    },
    { 
      label: "Operadores", 
      valor: pagamentosOperadores, 
      icon: Users, 
      color: "text-cyan-500",
      bg: "bg-cyan-500/10",
      barColor: "rgb(6 182 212)",
      percent: custoTotal > 0 ? (pagamentosOperadores / custoTotal) * 100 : 0,
      hasExpand: operadoresDetalhes.length > 0,
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
            <div key={cat.label}>
              {cat.hasExpand ? (
                <Collapsible open={operadoresExpanded} onOpenChange={setOperadoresExpanded}>
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center gap-3 hover:bg-muted/50 rounded-lg transition-colors p-1 -m-1 cursor-pointer">
                      <div className={cn("p-2 rounded-lg", cat.bg)}>
                        <cat.icon className={cn("h-4 w-4", cat.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-muted-foreground truncate flex items-center gap-1">
                            {cat.label}
                            {operadoresExpanded ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                          </span>
                          <span className={cn("text-sm font-semibold", cat.color)}>{formatCurrency(cat.valor)}</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full rounded-full transition-all"
                            style={{ width: `${cat.percent}%`, backgroundColor: cat.barColor }}
                          />
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground w-10 text-right">{cat.percent.toFixed(0)}%</span>
                    </div>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent className="pl-11 pr-2 pt-2 space-y-1.5">
                    {/* Operadores Tradicionais */}
                    {operadoresTradicionais.length > 0 && (
                      <div className="space-y-1">
                        {operadoresTradicionais.map((op) => {
                          const opPercent = pagamentosOperadores > 0 ? (op.valor / pagamentosOperadores) * 100 : 0;
                          return (
                            <div key={op.operadorNome} className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground truncate flex-1">{op.operadorNome}</span>
                              <span className="text-cyan-400 font-medium ml-2">{formatCurrency(op.valor)}</span>
                              <span className="text-[10px] text-muted-foreground w-10 text-right">{opPercent.toFixed(0)}%</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    
                    {/* Separador visual se tiver ambos */}
                    {operadoresTradicionais.length > 0 && rhDetalhes.length > 0 && (
                      <div className="border-t border-dashed border-muted-foreground/20 my-2" />
                    )}
                    
                    {/* Despesas de RH por subcategoria */}
                    {rhDetalhes.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[10px] uppercase text-pink-500 font-medium mb-1">
                          Recursos Humanos
                        </div>
                        {rhDetalhes.map((rh) => {
                          const rhPercent = pagamentosOperadores > 0 ? (rh.valor / pagamentosOperadores) * 100 : 0;
                          // Extrair label limpo (remover prefixo "RH - ")
                          const label = rh.operadorNome.replace("RH - ", "");
                          // Identificar se é fixo ou variável
                          const isFixo = label === "Salário Mensal";
                          
                          return (
                            <div key={rh.operadorNome} className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground truncate flex-1 flex items-center gap-1.5">
                                {label}
                                {isFixo ? (
                                  <span className="text-[9px] bg-green-500/10 text-green-500 px-1 py-0.5 rounded">
                                    Fixo
                                  </span>
                                ) : (
                                  <span className="text-[9px] bg-amber-500/10 text-amber-500 px-1 py-0.5 rounded">
                                    Var
                                  </span>
                                )}
                              </span>
                              <span className="text-pink-400 font-medium ml-2">{formatCurrency(rh.valor)}</span>
                              <span className="text-[10px] text-muted-foreground w-10 text-right">{rhPercent.toFixed(0)}%</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              ) : (
                <div className="flex items-center gap-3">
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
                        className="h-full rounded-full transition-all"
                        style={{ width: `${cat.percent}%`, backgroundColor: cat.barColor }}
                      />
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground w-10 text-right">{cat.percent.toFixed(0)}%</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
