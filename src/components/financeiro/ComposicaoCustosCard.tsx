import { ReactNode, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, TrendingUp, TrendingDown, Minus, HelpCircle, ChevronRight, Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

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
  valorUSD?: number;
  tipoMoeda?: string;
  hasCrypto?: boolean;
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
  /** Badge opcional indicando o período aplicado */
  periodBadge?: ReactNode;
}

interface DetalheItemProps {
  nome: string;
  valor: number;
  total: number;
  formatCurrency: (value: number) => string;
  color?: string;
  hasCrypto?: boolean;
  valorUSD?: number;
}

function DetalheItem({ nome, valor, total, formatCurrency, color = "#3B82F6", hasCrypto, valorUSD }: DetalheItemProps) {
  const percent = total > 0 ? (valor / total) * 100 : 0;
  
  return (
    <div className="flex items-center gap-2 py-1.5">
      <div 
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <span className="text-xs truncate">{nome}</span>
            {hasCrypto && (
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[8px] px-1 py-0 h-4">
                <Coins className="h-2.5 w-2.5 mr-0.5" />
                USD
              </Badge>
            )}
          </div>
          <div className="flex flex-col items-end">
            <span className="text-xs font-medium">{formatCurrency(valor)}</span>
            {hasCrypto && valorUSD !== undefined && valorUSD > 0 && (
              <span className="text-[9px] text-muted-foreground">
                (${valorUSD.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
              </span>
            )}
          </div>
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
  periodBadge,
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

  const [activeSegment, setActiveSegment] = useState<string | null>(null);
  const [expandedSegment, setExpandedSegment] = useState<string | null>(null);
  const handleToggle = (name: string) => {
    setExpandedSegment(prev => (prev === name ? null : name));
  };
  const totalK = Math.round(totalAtual / 1000);

  // Função para obter detalhes por categoria
  const getDetalhesForCategoria = (name: string): { items: { nome: string; valor: number; hasCrypto?: boolean; valorUSD?: number }[]; total: number; color: string } => {
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
        type InfraItem = { nome: string; valor: number; hasCrypto?: boolean; valorUSD?: number };
        const infraItems: InfraItem[] = infraestruturaDetalhes.length > 0
          ? infraestruturaDetalhes.map(d => ({ 
              nome: d.categoria, 
              valor: d.valor,
              hasCrypto: d.hasCrypto || d.tipoMoeda === "CRYPTO",
              valorUSD: d.valorUSD
            }))
          : [{ nome: "Total", valor: cat?.value || 0 }];
        // Agrupar por categoria preservando info crypto
        const infraAgrupado = infraItems.reduce<InfraItem[]>((acc, item) => {
          const existing = acc.find(a => a.nome === item.nome);
          if (existing) {
            existing.valor += item.valor;
            if (item.hasCrypto) existing.hasCrypto = true;
            if (item.valorUSD) existing.valorUSD = (existing.valorUSD || 0) + item.valorUSD;
          } else {
            acc.push({ ...item });
          }
          return acc;
        }, []);
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
            {periodBadge}
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
      <CardContent className="space-y-4 overflow-hidden">
        {/* Donut + Lista (padrão Posição de Capital) */}
        <div className="grid grid-cols-1 sm:grid-cols-[176px_1fr] gap-[24px] items-start">
          {/* Donut Chart - SVG puro */}
          <div className="relative w-[154px] h-[154px] mx-auto group/donut">
            <svg viewBox="0 0 154 154" width="154" height="154" role="img" className="overflow-visible">
              <title>Distribuição de custos por categoria</title>
              <circle cx="77" cy="77" r="57" fill="none" stroke="var(--border-default)" strokeWidth="20" />
              {(() => {
                let currentAngle = -90;
                const radius = 57;
                const centerX = 77;
                const centerY = 77;
                const gapAngle = 3;
                return donutData.map((item) => {
                  if (totalAtual <= 0) return null;
                  const pct = (item.value / totalAtual) * 100;
                  const isActive = activeSegment === item.name;
                  const isOtherActive = activeSegment !== null && !isActive;
                  const segmentAngle = (pct / 100) * 360;
                  const actualGap = segmentAngle > gapAngle ? gapAngle : 0;
                  const startAngle = currentAngle + (actualGap / 2);
                  const endAngle = currentAngle + segmentAngle - (actualGap / 2);
                  currentAngle += segmentAngle;
                  const startRad = (startAngle * Math.PI) / 180;
                  const endRad = (endAngle * Math.PI) / 180;
                  const x1 = centerX + radius * Math.cos(startRad);
                  const y1 = centerY + radius * Math.sin(startRad);
                  const x2 = centerX + radius * Math.cos(endRad);
                  const y2 = centerY + radius * Math.sin(endRad);
                  const largeArcFlag = segmentAngle - actualGap <= 180 ? 0 : 1;
                  const d = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`;
                  return (
                    <path
                      key={item.name}
                      d={d}
                      fill="none"
                      stroke={item.color}
                      strokeWidth={isActive ? 24 : 20}
                      strokeLinecap="butt"
                      className="cursor-pointer"
                      style={{
                        transition: "stroke-width 0.2s ease, opacity 0.2s ease, stroke 0.2s ease",
                        opacity: isOtherActive ? 0.35 : 1.0,
                        filter: isActive ? "drop-shadow(0 0 4px rgba(0,0,0,0.2))" : "none",
                      }}
                      onMouseEnter={() => setActiveSegment(item.name)}
                      onMouseLeave={() => setActiveSegment(null)}
                    />
                  );
                });
              })()}
              <circle cx="77" cy="77" r="46" fill="var(--bg-card)" />
            </svg>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
              <p className="text-[15px] font-bold text-[var(--text-primary)] tabular-nums">
                {totalK}k
              </p>
              <p className="text-[10px] text-[var(--text-faint)] mt-px uppercase tracking-wider font-semibold">
                Total BRL
              </p>
            </div>
          </div>

          {/* Lista de categorias - padrão PosicaoCapital */}
          <div className="space-y-1 relative pt-2">
            {sortedCategorias.map((cat, index) => {
            const percent = totalAtual > 0 ? (cat.value / totalAtual) * 100 : 0;
            const color = cat.color || colors[index % colors.length];
            const detalhes = getDetalhesForCategoria(cat.name);
            const temDetalhes = hasDetalhes(cat.name);
            const isActive = activeSegment === cat.name;
            const isOtherActive = activeSegment !== null && !isActive;
            const isExpanded = expandedSegment === cat.name;

            return (
              <div key={cat.name} className="flex flex-col">
                <div
                  onMouseEnter={() => setActiveSegment(cat.name)}
                  onMouseLeave={() => {
                    if (!expandedSegment) setActiveSegment(null);
                  }}
                  onClick={() => temDetalhes && handleToggle(cat.name)}
                  style={{
                    background: isActive ? "var(--bg-hover)" : "transparent",
                    borderColor: isActive ? `${color}44` : "transparent",
                    transform: isActive ? "translateX(2px)" : "none",
                    transition:
                      "background 0.15s, border-color 0.15s, transform 0.15s, opacity 0.15s",
                    opacity: isOtherActive ? 0.45 : 1.0,
                  }}
                  className={cn(
                    "grid grid-cols-[8px_1fr_auto_auto] gap-[10px] p-[8px_10px] rounded-[8px] border group",
                    temDetalhes && "cursor-pointer"
                  )}
                >
                <div
                  className="rounded-[2px] mt-1"
                  style={{
                    backgroundColor: color,
                    width: isActive ? 10 : 8,
                    height: isActive ? 10 : 8,
                    transition: "width 0.15s, height 0.15s",
                  }}
                />
                <div>
                  <p
                    className={`text-[12px] font-medium transition-colors ${
                      isActive ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
                    }`}
                  >
                    {cat.name}
                  </p>
                  <div className="h-[3px] w-full bg-[var(--border-default)] rounded-[1px] mt-1.5 overflow-hidden">
                    <div
                      className="h-full transition-all duration-700 ease-out"
                      style={{
                        width: `${percent}%`,
                        backgroundColor: color,
                        opacity: isActive ? 1.0 : 0.6,
                      }}
                    />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-[var(--text-muted)] tabular-nums mb-px">
                    {percent.toFixed(2)}%
                  </p>
                  <p
                    className="font-medium tabular-nums transition-all"
                    style={{ color, fontSize: isActive ? 14 : 13 }}
                  >
                    {formatCurrency(cat.value)}
                  </p>
                </div>
                <div className="flex items-center justify-center pl-1">
                  {temDetalhes ? (
                    <ChevronRight
                      className={cn(
                        "h-3 w-3 text-[var(--text-faint)] transition-transform",
                        isExpanded && "rotate-90"
                      )}
                    />
                  ) : null}
                </div>
                </div>

                {isExpanded && temDetalhes && (
                  <div
                    style={{
                      animation: "expand-down 0.2s ease-out forwards",
                      background: "rgba(22, 27, 39, 0.4)",
                      borderLeft: `2px solid ${color}`,
                    }}
                    className="mt-1 mb-2 mx-[10px] rounded-r-lg overflow-hidden"
                  >
                    <div className="p-3 border-l border-white/5 bg-white/[0.02]">
                      <div className="flex items-center justify-between mb-3 px-2">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                          Composição de {cat.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {detalhes.items.length} {detalhes.items.length === 1 ? "item" : "itens"}
                        </span>
                      </div>

                      <div className="space-y-0.5 max-h-[260px] overflow-y-auto">
                        {detalhes.items.map((item, idx) => (
                          <DetalheItem
                            key={idx}
                            nome={item.nome}
                            valor={item.valor}
                            total={detalhes.total}
                            formatCurrency={formatCurrency}
                            color={detalhes.color}
                            hasCrypto={item.hasCrypto}
                            valorUSD={item.valorUSD}
                          />
                        ))}
                      </div>

                      <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between px-2">
                        <span className="text-[11px] font-medium text-[var(--text-faint)]">Total</span>
                        <span className="text-[12px] font-semibold text-[var(--text-primary)] tabular-nums">
                          {formatCurrency(detalhes.total)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          </div>
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
