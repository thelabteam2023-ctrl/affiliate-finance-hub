import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, TrendingUp, TrendingDown, Minus, HelpCircle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ModernDonutChart } from "@/components/ui/modern-donut-chart";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface CustoCategoria {
  name: string;
  value: number;
  color?: string;
  variacao?: number;
}

// Interfaces para drill-down
export interface CustoAquisicaoDetalhe {
  tipo: string; // PAGTO_PARCEIRO ou PAGTO_FORNECEDOR
  valor: number;
}

export interface ComissaoDetalhe {
  indicadorNome: string;
  valor: number;
}

export interface BonusDetalhe {
  indicadorNome: string;
  valor: number;
}

export interface InfraestruturaDetalhe {
  categoria: string;
  valor: number;
}

export interface OperadorDetalhe {
  operadorNome: string;
  valor: number;
}

interface ComposicaoCustosCardProps {
  categorias: CustoCategoria[];
  totalAtual: number;
  totalAnterior: number;
  formatCurrency: (value: number) => string;
  // Props para drill-down
  custosAquisicaoDetalhes?: CustoAquisicaoDetalhe[];
  comissoesDetalhes?: ComissaoDetalhe[];
  bonusDetalhes?: BonusDetalhe[];
  infraestruturaDetalhes?: InfraestruturaDetalhe[];
  operadoresDetalhes?: OperadorDetalhe[];
}

interface DetalheItemProps {
  nome: string;
  valor: number;
  total: number;
  formatCurrency: (value: number) => string;
  color?: string;
}

function DetalheItem({ nome, valor, total, formatCurrency, color = "#3B82F6" }: DetalheItemProps) {
  const percent = total > 0 ? (valor / total) * 100 : 0;
  
  return (
    <div className="flex items-center gap-2 py-1.5">
      <div 
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs truncate">{nome}</span>
          <span className="text-xs font-medium">{formatCurrency(valor)}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${percent}%`, backgroundColor: color }}
            />
          </div>
          <span className="text-[9px] text-muted-foreground w-8 text-right">
            {percent.toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  );
}

export function ComposicaoCustosCard({
  categorias,
  totalAtual,
  totalAnterior,
  formatCurrency,
  custosAquisicaoDetalhes = [],
  comissoesDetalhes = [],
  bonusDetalhes = [],
  infraestruturaDetalhes = [],
  operadoresDetalhes = [],
}: ComposicaoCustosCardProps) {
  const variacaoTotal = totalAnterior > 0 
    ? ((totalAtual - totalAnterior) / totalAnterior) * 100
    : 0;

  // Sort by value descending
  const sortedCategorias = [...categorias].sort((a, b) => b.value - a.value);

  // Colors for donut
  const colors = [
    "#22C55E", // Green
    "#3B82F6", // Blue  
    "#F59E0B", // Amber
    "#8B5CF6", // Violet
    "#EF4444", // Red
    "#06B6D4", // Cyan
  ];

  const donutData = sortedCategorias.map((cat, i) => ({
    name: cat.name,
    value: cat.value,
    color: cat.color || colors[i % colors.length],
  }));

  // Função para obter detalhes por categoria
  const getDetalhesForCategoria = (name: string): { items: { nome: string; valor: number }[]; total: number; color: string } => {
    const cat = categorias.find(c => c.name === name);
    const color = cat?.color || colors[categorias.indexOf(cat!) % colors.length] || "#3B82F6";
    
    switch (name) {
      case "Custos Aquisição":
        const aquisicaoItems = custosAquisicaoDetalhes.length > 0 
          ? custosAquisicaoDetalhes.map(d => ({
              nome: d.tipo === "PAGTO_PARCEIRO" ? "Pagamentos Parceiros" : "Pagamentos Fornecedores",
              valor: d.valor
            }))
          : [{ nome: "Total", valor: cat?.value || 0 }];
        // Agrupar por tipo
        const aquisicaoAgrupado = aquisicaoItems.reduce((acc, item) => {
          const existing = acc.find(a => a.nome === item.nome);
          if (existing) existing.valor += item.valor;
          else acc.push({ ...item });
          return acc;
        }, [] as { nome: string; valor: number }[]);
        return { items: aquisicaoAgrupado.sort((a, b) => b.valor - a.valor), total: cat?.value || 0, color };
        
      case "Comissões":
        const comissoesItems = comissoesDetalhes.length > 0
          ? comissoesDetalhes.map(d => ({ nome: d.indicadorNome || "Indicador", valor: d.valor }))
          : [{ nome: "Total", valor: cat?.value || 0 }];
        // Agrupar por indicador
        const comissoesAgrupado = comissoesItems.reduce((acc, item) => {
          const existing = acc.find(a => a.nome === item.nome);
          if (existing) existing.valor += item.valor;
          else acc.push({ ...item });
          return acc;
        }, [] as { nome: string; valor: number }[]);
        return { items: comissoesAgrupado.sort((a, b) => b.valor - a.valor), total: cat?.value || 0, color };
        
      case "Bônus":
        const bonusItems = bonusDetalhes.length > 0
          ? bonusDetalhes.map(d => ({ nome: d.indicadorNome || "Indicador", valor: d.valor }))
          : [{ nome: "Total", valor: cat?.value || 0 }];
        // Agrupar por indicador
        const bonusAgrupado = bonusItems.reduce((acc, item) => {
          const existing = acc.find(a => a.nome === item.nome);
          if (existing) existing.valor += item.valor;
          else acc.push({ ...item });
          return acc;
        }, [] as { nome: string; valor: number }[]);
        return { items: bonusAgrupado.sort((a, b) => b.valor - a.valor), total: cat?.value || 0, color };
        
      case "Infraestrutura":
        const infraItems = infraestruturaDetalhes.length > 0
          ? infraestruturaDetalhes.map(d => ({ nome: d.categoria, valor: d.valor }))
          : [{ nome: "Total", valor: cat?.value || 0 }];
        // Agrupar por categoria
        const infraAgrupado = infraItems.reduce((acc, item) => {
          const existing = acc.find(a => a.nome === item.nome);
          if (existing) existing.valor += item.valor;
          else acc.push({ ...item });
          return acc;
        }, [] as { nome: string; valor: number }[]);
        return { items: infraAgrupado.sort((a, b) => b.valor - a.valor), total: cat?.value || 0, color };
        
      case "Operadores":
        const opItems = operadoresDetalhes.length > 0
          ? operadoresDetalhes.map(d => ({ nome: d.operadorNome || "Operador", valor: d.valor }))
          : [{ nome: "Total", valor: cat?.value || 0 }];
        // Agrupar por operador
        const opAgrupado = opItems.reduce((acc, item) => {
          const existing = acc.find(a => a.nome === item.nome);
          if (existing) existing.valor += item.valor;
          else acc.push({ ...item });
          return acc;
        }, [] as { nome: string; valor: number }[]);
        return { items: opAgrupado.sort((a, b) => b.valor - a.valor), total: cat?.value || 0, color };
        
      default:
        return { items: [{ nome: "Total", valor: cat?.value || 0 }], total: cat?.value || 0, color };
    }
  };

  // Verificar se tem detalhes para uma categoria
  const hasDetalhes = (name: string): boolean => {
    switch (name) {
      case "Custos Aquisição":
        return custosAquisicaoDetalhes.length > 0;
      case "Comissões":
        return comissoesDetalhes.length > 0;
      case "Bônus":
        return bonusDetalhes.length > 0;
      case "Infraestrutura":
        return infraestruturaDetalhes.length > 0;
      case "Operadores":
        return operadoresDetalhes.length > 0;
      default:
        return false;
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <PieChart className="h-4 w-4 text-primary" />
            Composição de Custos
            <TooltipProvider>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors">
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[280px] text-xs">
                  <p className="font-medium mb-1">Composição de Custos</p>
                  <p>Distribuição dos custos por categoria:</p>
                  <p><strong>Aquisição:</strong> Pagamentos a parceiros e fornecedores</p>
                  <p><strong>Comissões:</strong> Pagamentos recorrentes a indicadores</p>
                  <p><strong>Bônus:</strong> Pagamentos por meta atingida</p>
                  <p><strong>Infraestrutura:</strong> Despesas administrativas</p>
                  <p><strong>Operadores:</strong> Pagamentos a operadores</p>
                  <p className="mt-2 text-muted-foreground">Clique em ▸ para ver detalhes</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
          <div className={cn(
            "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full",
            variacaoTotal > 5 ? "bg-destructive/10 text-destructive" :
            variacaoTotal < -5 ? "bg-success/10 text-success" :
            "bg-muted text-muted-foreground"
          )}>
            {variacaoTotal > 0 ? <TrendingUp className="h-3 w-3" /> : 
             variacaoTotal < 0 ? <TrendingDown className="h-3 w-3" /> : 
             <Minus className="h-3 w-3" />}
            {variacaoTotal > 0 ? "+" : ""}{variacaoTotal.toFixed(1)}% vs anterior
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Donut Chart */}
        <div className="h-[180px]">
          <ModernDonutChart
            data={donutData}
            height={180}
            innerRadius={55}
            outerRadius={75}
            showLabels={false}
            centerValue={formatCurrency(totalAtual)}
            centerLabel="Total"
            formatValue={formatCurrency}
          />
        </div>

        {/* Legend with values and drill-down */}
        <div className="space-y-2">
          {sortedCategorias.map((cat, index) => {
            const percent = totalAtual > 0 ? (cat.value / totalAtual) * 100 : 0;
            const color = cat.color || colors[index % colors.length];
            const detalhes = getDetalhesForCategoria(cat.name);
            const temDetalhes = hasDetalhes(cat.name);
            
            return (
              <div key={cat.name} className="flex items-center gap-3">
                <div 
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm truncate">{cat.name}</span>
                    <div className="flex items-center gap-1.5 ml-2">
                      <span className="text-sm font-bold">{formatCurrency(cat.value)}</span>
                      {temDetalhes && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="text-muted-foreground hover:text-foreground transition-colors p-0.5">
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent 
                            side="left" 
                            align="start" 
                            className="w-72 p-3"
                          >
                            <div className="space-y-2">
                              <div className="flex items-center justify-between border-b border-border/50 pb-2">
                                <h4 className="text-sm font-semibold">{cat.name}</h4>
                                <span className="text-xs text-muted-foreground">
                                  {detalhes.items.length} {detalhes.items.length === 1 ? "item" : "itens"}
                                </span>
                              </div>
                              
                              <div className="max-h-[200px] overflow-y-auto space-y-0.5">
                                {detalhes.items.slice(0, 10).map((item, idx) => (
                                  <DetalheItem
                                    key={idx}
                                    nome={item.nome}
                                    valor={item.valor}
                                    total={detalhes.total}
                                    formatCurrency={formatCurrency}
                                    color={detalhes.color}
                                  />
                                ))}
                                {detalhes.items.length > 10 && (
                                  <p className="text-[10px] text-muted-foreground text-center pt-1">
                                    +{detalhes.items.length - 10} itens não exibidos
                                  </p>
                                )}
                              </div>
                              
                              <div className="pt-2 border-t border-border/50">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-medium">Total</span>
                                  <span className="text-sm font-bold">{formatCurrency(detalhes.total)}</span>
                                </div>
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${percent}%`, backgroundColor: color }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground w-10 text-right">
                      {percent.toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Comparativo */}
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/50">
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Período Atual</p>
            <p className="text-lg font-bold">{formatCurrency(totalAtual)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Período Anterior</p>
            <p className="text-lg font-bold text-muted-foreground">{formatCurrency(totalAnterior)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
