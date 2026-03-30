import { useMemo, useState } from "react";
import { addDays, startOfDay, startOfMonth, endOfMonth } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TrendingUp, TrendingDown, Building2, Users, Calendar, Globe, FolderOpen, BarChart3 } from "lucide-react";
import { ChartEmptyState } from "@/components/ui/chart-empty-state";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarioLucros } from "./CalendarioLucros";
import { getFirstLastName } from "@/lib/utils";
import { parseLocalDateTime, extractLocalDateKey } from "@/utils/dateUtils";
import { getConsolidatedLucro, getConsolidatedStake, getConsolidatedLucroDirect } from "@/utils/consolidatedValues";

// =====================================================
// TIPOS
// =====================================================

interface Perna {
  bookmaker_id?: string;
  bookmaker_nome?: string;
  parceiro_nome?: string | null;
  instance_identifier?: string | null;
  stake?: number;
  lucro_prejuizo?: number;
  resultado?: string;
  odd?: number;
  selecao?: string;
  moeda?: string;
  stake_brl_referencia?: number | null;
  lucro_prejuizo_brl_referencia?: number | null;
}

interface ApostaBase {
  data_aposta: string;
  lucro_prejuizo: number | null;
  resultado?: string | null;
  stake: number;
  stake_total?: number | null;
  bookmaker_nome?: string;
  parceiro_nome?: string | null;
  instance_identifier?: string | null;
  bookmaker_id?: string | null;
  pernas?: Perna[] | null;
  forma_registro?: string;
  // Campos multi-moeda
  moeda_operacao?: string | null;
  stake_consolidado?: number | null;
  pl_consolidado?: number | null;
  consolidation_currency?: string | null;
  valor_brl_referencia?: number | null;
  lucro_prejuizo_brl_referencia?: number | null;
  is_multicurrency?: boolean | null;
}

interface VinculoDetalhe {
  vinculo: string;
  apostas: number;
  volume: number;
  lucro: number;
  roi: number;
}

interface CasaUsada {
  casa: string;
  apostas: number;
  volume: number;
  lucro: number;
  roi: number;
  moeda?: string;
  logo_url?: string | null;
  vinculos: VinculoDetalhe[];
}

interface EvolucaoData {
  entrada: number;
  data: string;
  hora: string;
  xLabel: string; // Label formatado para o eixo X (hora ou data)
  dateKey?: string; // yyyy-MM-dd para smart tick formatting
  acumulado: number;
  impacto: number;
  resultado: string;
  // Campos extras para modo consolidado diário
  isConsolidated?: boolean;
  apostasNoDia?: number;
  // Extras para fontes de lucro adicionais
  incluiExtras?: boolean;
}

// Re-exporta o tipo canônico para compatibilidade com consumidores existentes
export type { ProjetoExtraEntry as ExtraLucroEntry } from '@/services/fetchProjetoExtras';
import type { ProjetoExtraEntry as ExtraLucroEntry } from '@/services/fetchProjetoExtras';

interface VisaoGeralChartsProps {
  apostas: ApostaBase[];
  /** Apostas de todos os projetos (para visão global) */
  apostasGlobal?: ApostaBase[];
  /**
   * DESACOPLAMENTO CALENDÁRIO-FILTROS:
   * Apostas específicas para o calendário (SEM filtro de período).
   * O calendário é VISUAL e deve exibir dados do mês navegado,
   * independente dos filtros analíticos aplicados.
   */
  apostasCalendario?: ApostaBase[];
  /** Entradas extras de lucro (cashback, giros grátis, freebets, bônus) */
  extrasLucro?: ExtraLucroEntry[];
  accentColor?: string;
  title?: string;
  logoMap?: Map<string, string | null>;
  showCalendar?: boolean;
  showEvolucaoChart?: boolean;
  showCasasCard?: boolean;
  isSingleDayPeriod?: boolean;
  /** Início do período selecionado (para preencher dias sem apostas no gráfico) */
  periodStart?: Date;
  /** Fim do período selecionado (para preencher dias sem apostas no gráfico) */
  periodEnd?: Date;
  /** Função de formatação obrigatória - deve vir do useProjetoCurrency */
  formatCurrency: (value: number) => string;
  /** Função de formatação para eixos de gráfico (compacta, sem quebra) */
  formatChartAxis?: (value: number) => string;
  /** Habilita toggle de escopo global para o card de Casas */
  showScopeToggle?: boolean;
  /** Função de conversão para moeda de consolidação */
  convertToConsolidation?: (valor: number, moedaOrigem: string) => number;
  /** Moeda de consolidação do projeto */
  moedaConsolidacao?: string;
  /** Lucro Operacional canônico (via RPC server-side) — se fornecido, usado como badge total */
  lucroOperacionalKpi?: number | null;
}

// =====================================================
// HELPERS
// =====================================================

// defaultFormatCurrency removido - formatCurrency agora é obrigatório

const getStake = (a: ApostaBase): number => {
  const val = typeof a.stake_total === "number" ? a.stake_total : a.stake;
  return Number.isFinite(val) ? val : 0;
};

// =====================================================
// GRÁFICO DE ÁREA — Evolução do Lucro
// =====================================================

interface EvolucaoLucroChartProps {
  data: EvolucaoData[];
  accentColor: string;
  isSingleDayPeriod: boolean;
  formatCurrency: (value: number) => string;
  formatChartAxis: (value: number) => string;
}

// Tooltip customizado para mostrar detalhes da entrada
const createCustomTooltip = (formatCurrency: (value: number) => string, isSingleDayPeriod: boolean) => {
  return ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    
    const data = payload[0].payload as EvolucaoData;
    const isPositive = data.impacto >= 0;
    
    // Modo consolidado (período > 1 dia)
    if (data.isConsolidated) {
      return (
        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg text-sm space-y-1.5">
          <div className="font-semibold text-foreground border-b border-border pb-1.5 mb-1.5">
            {data.data}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span className="text-muted-foreground">Apostas:</span>
            <span className="text-foreground font-medium">{data.apostasNoDia}</span>
            <span className="text-muted-foreground">Lucro do dia:</span>
            <span className={`font-semibold ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
              {isPositive ? '+' : ''}{formatCurrency(data.impacto)}
            </span>
            <span className="text-muted-foreground">Acumulado:</span>
            <span className={`font-bold ${data.acumulado >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {formatCurrency(data.acumulado)}
            </span>
          </div>
        </div>
      );
    }
    
    // Modo entrada por entrada (período 1 dia)
    return (
      <div className="bg-popover border border-border rounded-lg p-3 shadow-lg text-sm space-y-1.5">
        <div className="font-semibold text-foreground border-b border-border pb-1.5 mb-1.5">
          Entrada #{data.entrada}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <span className="text-muted-foreground">Data/Hora:</span>
          <span className="text-foreground font-medium">{data.data} {data.hora}</span>
          <span className="text-muted-foreground">Impacto:</span>
          <span className={`font-semibold ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
            {isPositive ? '+' : ''}{formatCurrency(data.impacto)}
          </span>
          <span className="text-muted-foreground">Acumulado:</span>
          <span className={`font-bold ${data.acumulado >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
            {formatCurrency(data.acumulado)}
          </span>
        </div>
      </div>
    );
  };
};

function EvolucaoLucroChart({ data, accentColor, isSingleDayPeriod, formatCurrency, formatChartAxis }: EvolucaoLucroChartProps) {
  const MONTH_NAMES_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  // Detect distinct months and build boundary indices for smart X-axis labels
  const { useMonthLabels, monthBoundaryIndices } = useMemo(() => {
    if (isSingleDayPeriod || data.length === 0) {
      return { useMonthLabels: false, monthBoundaryIndices: new Set<number>() };
    }
    const months = new Set<string>();
    const boundaries = new Set<number>();
    let lastMonth = '';
    data.forEach((d, i) => {
      if (d.dateKey) {
        const month = d.dateKey.substring(0, 7);
        months.add(month);
        if (month !== lastMonth) {
          boundaries.add(i);
          lastMonth = month;
        }
      }
    });
    // Use month names when spanning 2+ months OR many data points
    return {
      useMonthLabels: months.size >= 2 || data.length > 20,
      monthBoundaryIndices: boundaries,
    };
  }, [data, isSingleDayPeriod]);

  if (data.length === 0) {
    return <ChartEmptyState isSingleDayPeriod={isSingleDayPeriod} />;
  }

  const lastValue = data[data.length - 1]?.acumulado ?? 0;
  const isPositive = lastValue >= 0;

  const gradientId = `areaGradient-${accentColor.replace(/[^a-zA-Z0-9]/g, "")}`;
  const strokeColor = isPositive ? "hsl(var(--chart-2))" : "hsl(var(--destructive))";
  const fillColor = isPositive ? "hsl(var(--chart-2))" : "hsl(var(--destructive))";

  const tickInterval = isSingleDayPeriod 
    ? (data.length > 50 ? Math.floor(data.length / 10) : data.length > 20 ? 5 : 0)
    : useMonthLabels ? 0 : (data.length > 15 ? Math.ceil(data.length / 8) : 0);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={fillColor} stopOpacity={0.3} />
            <stop offset="95%" stopColor={fillColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="xLabel"
          stroke="hsl(var(--muted-foreground))"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          interval={useMonthLabels ? 0 : tickInterval}
          tick={({ x, y, payload, index }: { x: number; y: number; payload: { value: string }; index: number }) => {
            if (useMonthLabels) {
              if (!monthBoundaryIndices.has(index)) return <text />;
              const entry = data[index];
              const monthIdx = entry?.dateKey ? parseInt(entry.dateKey.substring(5, 7), 10) - 1 : -1;
              const label = monthIdx >= 0 ? MONTH_NAMES_SHORT[monthIdx] : '';
              return (
                <text x={x} y={y + 10} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={11} fontWeight={500}>
                  {label}
                </text>
              );
            }
            if (!payload.value) return <text />;
            return (
              <text x={x} y={y + 10} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={11}>
                {payload.value}
              </text>
            );
          }}
        />
        <YAxis
          stroke="hsl(var(--muted-foreground))"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          width={60}
          tickFormatter={(v) => formatChartAxis(v)}
        />
        <RechartsTooltip content={createCustomTooltip(formatCurrency, isSingleDayPeriod)} />
        <Area
          type="monotone"
          dataKey="acumulado"
          stroke={strokeColor}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// =====================================================
// CARD — Casas Mais Utilizadas
// =====================================================

interface CasasMaisUtilizadasCardProps {
  casas: CasaUsada[];
  casasGlobal?: CasaUsada[];
  accentColor: string;
  logoMap?: Map<string, string | null>;
  formatCurrency: (value: number) => string;
  showScopeToggle?: boolean;
}

function CasasMaisUtilizadasCard({ casas, casasGlobal, accentColor, logoMap, formatCurrency, showScopeToggle }: CasasMaisUtilizadasCardProps) {
  const fmtMoedaOriginal = (valor: number, moeda?: string) => {
    const m = moeda || "BRL";
    const simbolos: Record<string, string> = { BRL: "R$", USD: "$", EUR: "€", GBP: "£", USDT: "$", USDC: "$" };
    const s = simbolos[m] || m + " ";
    return `${s} ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  const [scope, setScope] = useState<"projeto" | "global">("projeto");
  const [selectedCasa, setSelectedCasa] = useState<CasaUsada | null>(null);
  
  const activeCasas = scope === "global" && casasGlobal ? casasGlobal : casas;
  
  const topCasas = useMemo(() => 
    [...activeCasas].sort((a, b) => b.volume - a.volume).slice(0, 6), 
    [activeCasas]
  );

  const normalizeName = (name: string): string => {
    return name.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, "").trim();
  };

  const getLogoUrl = (casaData: CasaUsada): string | null | undefined => {
    if (casaData.logo_url) return casaData.logo_url;
    if (!logoMap) return null;
    const normalizedInput = normalizeName(casaData.casa);
    for (const [key, value] of logoMap.entries()) {
      if (normalizeName(key) === normalizedInput) return value;
    }
    for (const [key, value] of logoMap.entries()) {
      const normalizedKey = normalizeName(key);
      if (normalizedInput.includes(normalizedKey) || normalizedKey.includes(normalizedInput)) return value;
    }
    return null;
  };

  if (topCasas.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4" style={{ color: accentColor }} />
            <CardTitle className="text-sm font-medium">Casas Mais Utilizadas</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
            Nenhuma casa registrada
          </div>
        </CardContent>
      </Card>
    );
  }

  const maxVolume = topCasas[0]?.volume || 1;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4" style={{ color: accentColor }} />
              <CardTitle className="text-sm font-medium">Casas Mais Utilizadas</CardTitle>
            </div>
            {showScopeToggle && casasGlobal && casasGlobal.length > 0 && (
              <ToggleGroup type="single" value={scope} onValueChange={(v) => v && setScope(v as "projeto" | "global")} size="sm">
                <ToggleGroupItem value="projeto" aria-label="Projeto atual" className="h-7 px-2 text-xs">
                  <FolderOpen className="h-3 w-3 mr-1" />
                  Projeto
                </ToggleGroupItem>
                <ToggleGroupItem value="global" aria-label="Todos os projetos" className="h-7 px-2 text-xs">
                  <Globe className="h-3 w-3 mr-1" />
                  Global
                </ToggleGroupItem>
              </ToggleGroup>
            )}
          </div>
          <CardDescription className="text-xs">
            Por volume apostado {scope === "global" && "(Todos os projetos)"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {/* Header row */}
          <div className="grid grid-cols-[72px_40px_1fr_56px] gap-x-3 items-center text-[11px] text-muted-foreground border-b pb-2 uppercase tracking-wide">
            <span className="text-center">Casa</span>
            <span className="text-center">Qtd</span>
            <span className="text-right">Volume</span>
            <span className="text-right">ROI</span>
          </div>
          
          {topCasas.map((casa, idx) => {
            const barWidth = (casa.volume / maxVolume) * 100;
            const roiColor = casa.roi >= 0 ? "text-emerald-500" : "text-red-500";
            const logoUrl = getLogoUrl(casa);
            const hasMultipleVinculos = casa.vinculos.length > 1;
            const canOpenDetails = casa.vinculos.length >= 1;
            return (
              <div
                key={casa.casa}
                className={`space-y-1.5 ${canOpenDetails ? 'cursor-pointer hover:bg-muted/30 rounded-md p-1 -m-1 transition-colors' : 'cursor-default'}`}
                onClick={() => canOpenDetails && setSelectedCasa(casa)}
              >
                <div className="grid grid-cols-[72px_40px_1fr_56px] gap-x-3 items-center">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-9 h-9 rounded-md bg-muted/50 flex items-center justify-center overflow-hidden shrink-0">
                      {logoUrl ? (
                        <img src={logoUrl} alt={casa.casa} className="w-8 h-8 object-contain" />
                      ) : (
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <span className="text-[10px] font-semibold leading-tight text-center line-clamp-2 uppercase">{casa.casa}</span>
                    {hasMultipleVinculos && (
                      <span className="text-[8px] text-muted-foreground font-medium -mt-1">{casa.vinculos.length} contas</span>
                    )}
                    <span className="text-[9px] text-muted-foreground/50 font-medium -mt-0.5">{idx + 1}º</span>
                  </div>
                  <span className="text-center text-xs text-muted-foreground tabular-nums">{casa.apostas}</span>
                  <span className="text-right text-[11px] font-medium tabular-nums whitespace-nowrap">{fmtMoedaOriginal(casa.volume, casa.moeda)}</span>
                  <span className={`text-right text-xs font-semibold tabular-nums whitespace-nowrap ${roiColor}`}>
                    {casa.roi >= 0 ? '+' : ''}{casa.roi.toFixed(1)}%
                  </span>
                </div>
                <div className="h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${barWidth}%`, backgroundColor: accentColor, opacity: 1 - idx * 0.08 }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Modal de detalhamento por vínculo */}
      <Dialog open={!!selectedCasa} onOpenChange={(open) => !open && setSelectedCasa(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {selectedCasa && (() => {
                const logoUrl = getLogoUrl(selectedCasa);
                return (
                  <>
                    <div className="w-10 h-10 rounded-md bg-muted/50 flex items-center justify-center overflow-hidden shrink-0">
                      {logoUrl ? (
                        <img src={logoUrl} alt={selectedCasa.casa} className="w-9 h-9 object-contain" />
                      ) : (
                        <Building2 className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <span className="uppercase">{selectedCasa.casa}</span>
                      <p className="text-xs text-muted-foreground font-normal mt-0.5">
                        {selectedCasa.vinculos.length} contas · {selectedCasa.apostas} apostas
                      </p>
                    </div>
                  </>
                );
              })()}
            </DialogTitle>
          </DialogHeader>

          {selectedCasa && (
            <div className="space-y-4">
              {/* Resumo consolidado */}
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-muted/30 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Volume</p>
                  <p className="text-sm font-semibold tabular-nums mt-1">{fmtMoedaOriginal(selectedCasa.volume, selectedCasa.moeda)}</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Média/Conta</p>
                  <p className="text-sm font-semibold tabular-nums mt-1">
                    {fmtMoedaOriginal(
                      selectedCasa.vinculos.length > 0 ? selectedCasa.volume / selectedCasa.vinculos.length : 0,
                      selectedCasa.moeda
                    )}
                  </p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Lucro</p>
                  <p className={`text-sm font-semibold tabular-nums mt-1 ${selectedCasa.lucro >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    {selectedCasa.lucro >= 0 ? '+' : ''}{fmtMoedaOriginal(selectedCasa.lucro, selectedCasa.moeda)}
                  </p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">ROI</p>
                  <p className={`text-sm font-semibold tabular-nums mt-1 ${selectedCasa.roi >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    {selectedCasa.roi >= 0 ? '+' : ''}{selectedCasa.roi.toFixed(2)}%
                  </p>
                </div>
              </div>

              {/* Breakdown por vínculo */}
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 mb-2">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Detalhamento por conta</span>
                </div>
                <div className="grid grid-cols-[1fr_50px_80px_70px_70px_50px] gap-x-2 text-[10px] text-muted-foreground uppercase tracking-wide border-b pb-1.5 mb-1">
                  <span>Conta</span>
                  <span className="text-center">Qtd</span>
                  <span className="text-right">Volume</span>
                  <span className="text-right">Média</span>
                  <span className="text-right">Lucro</span>
                  <span className="text-right">ROI</span>
                </div>
                {selectedCasa.vinculos.map((v) => {
                  const vRoiColor = v.roi >= 0 ? "text-emerald-500" : "text-red-500";
                  const vLucroColor = v.lucro >= 0 ? "text-emerald-500" : "text-red-500";
                  const volumeShare = selectedCasa.volume > 0 ? ((v.volume / selectedCasa.volume) * 100).toFixed(0) : "0";
                  const avgVolume = v.apostas > 0 ? v.volume / v.apostas : 0;
                  return (
                    <div key={v.vinculo} className="grid grid-cols-[1fr_50px_80px_70px_70px_50px] gap-x-2 items-center py-1.5 border-b border-border/30 last:border-0">
                      <div className="flex flex-col">
                        <span className="text-xs font-medium truncate">{v.vinculo}</span>
                        <span className="text-[9px] text-muted-foreground">{volumeShare}% do volume</span>
                      </div>
                      <span className="text-center text-xs text-muted-foreground tabular-nums">{v.apostas}</span>
                      <span className="text-right text-xs font-medium tabular-nums">{fmtMoedaOriginal(v.volume, selectedCasa.moeda)}</span>
                      <span className="text-right text-xs text-muted-foreground tabular-nums">{fmtMoedaOriginal(avgVolume, selectedCasa.moeda)}</span>
                      <span className={`text-right text-xs font-medium tabular-nums ${vLucroColor}`}>
                        {v.lucro >= 0 ? '+' : ''}{fmtMoedaOriginal(v.lucro, selectedCasa.moeda)}
                      </span>
                      <span className={`text-right text-xs font-semibold tabular-nums ${vRoiColor}`}>
                        {v.roi >= 0 ? '+' : ''}{v.roi.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// =====================================================
// COMPONENTE PRINCIPAL
// =====================================================

export function VisaoGeralCharts({ 
  apostas, 
  apostasGlobal,
  apostasCalendario,
  extrasLucro = [],
  accentColor = "hsl(var(--primary))", 
  logoMap, 
  showCalendar = true,
  showEvolucaoChart = true,
  showCasasCard = true,
  isSingleDayPeriod = false,
  periodStart,
  periodEnd,
  formatCurrency,
  formatChartAxis,
  showScopeToggle = false,
  convertToConsolidation,
  moedaConsolidacao,
  lucroOperacionalKpi,
}: VisaoGeralChartsProps) {
  
  // DESACOPLAMENTO: O calendário usa seus próprios dados (sem filtro de período)
  // Se apostasCalendario não for fornecido, usa apostas como fallback
  const calendarData = apostasCalendario ?? apostas;
  // Flag: calendarData vem de RPC (já consolidado server-side, NÃO aplicar conversão novamente)
  const calendarIsRpc = !!apostasCalendario;

  // Helper de consolidação multi-moeda — usado em periodTotal, evolução e calendário
  // MULTICURRENCY: usa pernas inline para conversão direta (evita cross-rate via BRL pivot)
  const consolidateLucro = (a: ApostaBase): number => {
    return getConsolidatedLucroDirect(a, a.pernas, convertToConsolidation, moedaConsolidacao);
  };

  // Fallback para formatChartAxis se não fornecido - usa versão compacta do formatCurrency
  const axisFormatter = formatChartAxis || ((v: number) => {
    const absVal = Math.abs(v);
    const prefix = v < 0 ? "-" : "";
    if (absVal >= 1000000) {
      return `${prefix}R$${(absVal / 1000000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`;
    }
    if (absVal >= 1000) {
      return `${prefix}R$${(absVal / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
    }
    return `${prefix}R$${absVal.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
  });
  const [calendarOpen, setCalendarOpen] = useState(false);

  const handleCalendarOpenChange = (open: boolean) => {
    setCalendarOpen(open);
  };

  const calendarInitialMonth = periodStart ?? new Date();

  const periodTotal = useMemo(() => {
    if (lucroOperacionalKpi != null && periodStart && periodEnd) {
      const sameMonthRange =
        format(periodStart, "yyyy-MM") === format(periodEnd, "yyyy-MM") &&
        periodStart.getTime() === startOfMonth(periodStart).getTime() &&
        periodEnd.getTime() === startOfDay(endOfMonth(periodStart)).getTime();

      if (!sameMonthRange) {
        return lucroOperacionalKpi;
      }
    }

    if (lucroOperacionalKpi != null && !periodStart && !periodEnd) {
      return lucroOperacionalKpi;
    }

    let total = 0;

    if (apostasCalendario && periodStart && periodEnd) {
      const pStart = startOfDay(periodStart);
      apostasCalendario.forEach((a) => {
        const dateStr = a.data_aposta.includes('T') ? extractLocalDateKey(a.data_aposta) : a.data_aposta;
        const apostaDate = new Date(dateStr + 'T12:00:00');
        if (apostaDate >= pStart && apostaDate <= periodEnd) {
          total += a.lucro_prejuizo || 0;
        }
      });
    } else {
      apostas.forEach((a) => {
        total += consolidateLucro(a);
      });
    }

    extrasLucro.forEach((e) => {
      const dateStr = e.data.includes('T') ? extractLocalDateKey(e.data) : e.data;
      if (periodStart && periodEnd) {
        const extraDate = new Date(dateStr + 'T12:00:00');
        if (extraDate < startOfDay(periodStart) || extraDate > periodEnd) return;
      }
      let valorConsolidado = e.valor;
      const moedaExtra = e.moeda || "BRL";
      if (convertToConsolidation && moedaConsolidacao && moedaExtra !== moedaConsolidacao) {
        valorConsolidado = convertToConsolidation(e.valor, moedaExtra);
      }
      total += valorConsolidado;
    });

    return total;
  }, [apostas, apostasCalendario, extrasLucro, periodStart, periodEnd, lucroOperacionalKpi, convertToConsolidation, moedaConsolidacao]);

  const isPositiveBadge = periodTotal >= 0;
  
  // Prepara mapa de extras por data para inclusão no gráfico de evolução
  // CRÍTICO: Converter extras para moeda de consolidação antes de somar
  const extrasMap = useMemo(() => {
    const map = new Map<string, number>();
    extrasLucro.forEach(e => {
      // Normaliza data para formato yyyy-MM-dd
      const dateStr = e.data.includes('T') ? extractLocalDateKey(e.data) : e.data;
      
      // CORREÇÃO: Converter valor para moeda de consolidação
      let valorConsolidado = e.valor;
      const moedaExtra = e.moeda || "BRL";
      if (convertToConsolidation && moedaConsolidacao && moedaExtra !== moedaConsolidacao) {
        valorConsolidado = convertToConsolidation(e.valor, moedaExtra);
      }
      
      const current = map.get(dateStr) || 0;
      map.set(dateStr, current + valorConsolidado);
    });
    return map;
  }, [extrasLucro, convertToConsolidation, moedaConsolidacao]);

  // Extras pré-convertidos para o calendário (que espera { data, valor } sem moeda)
  const extrasConvertidos = useMemo(() => {
    return extrasLucro.map(e => {
      let valorConsolidado = e.valor;
      const moedaExtra = e.moeda || "BRL";
      if (convertToConsolidation && moedaConsolidacao && moedaExtra !== moedaConsolidacao) {
        valorConsolidado = convertToConsolidation(e.valor, moedaExtra);
      }
      return { data: e.data, valor: valorConsolidado };
    });
  }, [extrasLucro, convertToConsolidation, moedaConsolidacao]);
  
  const evolucaoData = useMemo((): EvolucaoData[] => {
    const sorted = [...apostas].sort(
      (a, b) => parseLocalDateTime(a.data_aposta).getTime() - parseLocalDateTime(b.data_aposta).getTime()
    );
    
    // MODO 1: Período de 1 dia → entrada por entrada (não inclui extras neste modo)
    if (isSingleDayPeriod) {
      let acumulado = 0;
      return sorted.map((a, index) => {
        // CRÍTICO: Usar consolidação multi-moeda
        const impacto = consolidateLucro(a);
        acumulado += impacto;
        const date = parseLocalDateTime(a.data_aposta);
        const dataFormatada = format(date, "dd/MM", { locale: ptBR });
        const horaFormatada = format(date, "HH:mm", { locale: ptBR });
        
        return {
          entrada: index + 1,
          data: dataFormatada,
          hora: horaFormatada,
          xLabel: horaFormatada,
          acumulado,
          impacto,
          resultado: impacto >= 0 ? 'GREEN' : 'RED',
          isConsolidated: false,
          apostasNoDia: 1,
        };
      });
    }
    
    // MODO 2: Período > 1 dia → consolidado diário (um ponto por data)
    // Agrupa apostas por data e soma os lucros, INCLUINDO cashback e extras
    const dailyMap = new Map<string, { 
      lucroTotal: number; 
      apostasCount: number; 
      dateKey: string;
      dataFormatada: string;
      incluiExtras: boolean;
    }>();
    
    sorted.forEach((a) => {
      // CORREÇÃO: Usar extractLocalDateKey para garantir agrupamento por dia civil correto
      const dateKey = extractLocalDateKey(a.data_aposta);
      const date = parseLocalDateTime(a.data_aposta);
      const dataFormatada = format(date, "dd/MM", { locale: ptBR });
      // CRÍTICO: Usar consolidação multi-moeda
      const impacto = consolidateLucro(a);
      
      const existing = dailyMap.get(dateKey);
      if (existing) {
        existing.lucroTotal += impacto;
        existing.apostasCount += 1;
      } else {
        dailyMap.set(dateKey, {
          lucroTotal: impacto,
          apostasCount: 1,
          dateKey,
          dataFormatada,
          incluiExtras: false,
        });
      }
    });
    
    // Adiciona lucros extras (cashback, giros grátis, freebets, bônus) ao dailyMap
    // CORREÇÃO: Filtrar extras pelo período selecionado para evitar expandir o gráfico
    extrasMap.forEach((valor, dateKey) => {
      // Se há período definido, ignorar extras fora do range
      if (periodStart && periodEnd) {
        const extraDate = new Date(dateKey + 'T12:00:00');
        if (extraDate < startOfDay(periodStart) || extraDate > periodEnd) return;
      }
      
      const existing = dailyMap.get(dateKey);
      if (existing) {
        existing.lucroTotal += valor;
        existing.incluiExtras = true;
      } else {
        // Cria entrada apenas para o dia do extra (sem apostas naquele dia)
        const date = new Date(dateKey + 'T12:00:00');
        const dataFormatada = format(date, "dd/MM", { locale: ptBR });
        dailyMap.set(dateKey, {
          lucroTotal: valor,
          apostasCount: 0,
          dateKey,
          dataFormatada,
          incluiExtras: true,
        });
      }
    });
    
    // Preencher dias ausentes no intervalo do período (calendário completo)
    // Determina limites: usa periodStart/periodEnd se disponíveis, senão min/max dos dados
    const allDateKeys = Array.from(dailyMap.keys()).sort();
    const rangeStart = periodStart ? startOfDay(periodStart) : (allDateKeys.length > 0 ? new Date(allDateKeys[0] + 'T12:00:00') : null);
    const rangeEnd = periodEnd ? startOfDay(periodEnd) : (allDateKeys.length > 0 ? new Date(allDateKeys[allDateKeys.length - 1] + 'T12:00:00') : null);
    
    if (rangeStart && rangeEnd) {
      let cursor = startOfDay(rangeStart);
      const endDay = startOfDay(rangeEnd);
      while (cursor <= endDay) {
        const dateKey = format(cursor, "yyyy-MM-dd");
        if (!dailyMap.has(dateKey)) {
          const dataFormatada = format(cursor, "dd/MM", { locale: ptBR });
          dailyMap.set(dateKey, {
            lucroTotal: 0,
            apostasCount: 0,
            dateKey,
            dataFormatada,
            incluiExtras: false,
          });
        }
        cursor = addDays(cursor, 1);
      }
    }
    
    // Converte para array ordenado e calcula acumulado
    const dailyEntries = Array.from(dailyMap.values()).sort(
      (a, b) => a.dateKey.localeCompare(b.dateKey)
    );
    
    let acumulado = 0;
    return dailyEntries.map((day, index) => {
      acumulado += day.lucroTotal;
      
      return {
        entrada: index + 1,
        data: day.dataFormatada,
        hora: "",
        xLabel: day.dataFormatada,
        dateKey: day.dateKey,
        acumulado,
        impacto: day.lucroTotal,
        resultado: day.lucroTotal >= 0 ? 'GREEN' : 'RED',
        isConsolidated: true,
        apostasNoDia: day.apostasCount,
        incluiExtras: day.incluiExtras,
      };
    });
  }, [apostas, isSingleDayPeriod, extrasMap, periodStart, periodEnd]);

  // ==================== DADOS DO GRÁFICO ====================
  // Sempre usa modo atividade: apenas dias com atividade real
  const chartDisplayData = useMemo((): EvolucaoData[] => {
    if (isSingleDayPeriod) return evolucaoData;
    
    const activeDays = evolucaoData.filter(d => (d.apostasNoDia ?? 0) > 0 || d.incluiExtras);
    
    // Recalcular acumulado sequencialmente
    let acumulado = 0;
    return activeDays.map((day, index) => {
      acumulado += day.impacto;
      return { ...day, acumulado, entrada: index + 1 };
    });
  }, [evolucaoData, isSingleDayPeriod]);

  const diasAtivos = useMemo(() => 
    evolucaoData.filter(d => (d.apostasNoDia ?? 0) > 0 || d.incluiExtras).length,
    [evolucaoData]
  );


  const getConsolidatedStakeLocal = (a: ApostaBase): number => {
    return getConsolidatedStake(a, convertToConsolidation, moedaConsolidacao);
  };

  const getConsolidatedLucroLocal = consolidateLucro;

  // Casas mais utilizadas (por volume) — agrupa por CASA, com detalhamento por vínculo
  // Formato esperado: "PARIMATCH - RAFAEL GOMES" → Casa = "PARIMATCH", Vínculo = "RAFAEL GOMES"
  const casasData = useMemo((): CasaUsada[] => {
    // Estrutura: casa → { total, vinculos: Map<vinculo, { apostas, volume, lucro }> }
    const casaMap = new Map<string, { 
      apostas: number; 
      volume: number;
      volumeLiquidado: number;
      lucro: number;
      moeda: string;
      vinculos: Map<string, { apostas: number; volume: number; volumeLiquidado: number; lucro: number }> 
    }>();

    const processEntry = (bookmakerNome: string, parceiroNome: string | null | undefined, instanceIdentifier: string | null | undefined, stake: number, lucro: number, moeda: string, isLiquidada: boolean) => {
      let casa: string;
      let vinculo: string;
      
      // Sempre agrupar pela casa BASE (ex: BET365), usando identifier ou parceiro como vínculo
      const separatorIdx = bookmakerNome.indexOf(" - ");
      casa = separatorIdx > 0 ? bookmakerNome.substring(0, separatorIdx).trim() : bookmakerNome;
      
      if (instanceIdentifier) {
        vinculo = instanceIdentifier;
      } else if (parceiroNome) {
        vinculo = getFirstLastName(parceiroNome);
      } else if (separatorIdx > 0) {
        vinculo = getFirstLastName(bookmakerNome.substring(separatorIdx + 3).trim());
      } else {
        vinculo = "Principal";
      }

      if (!casaMap.has(casa)) {
        casaMap.set(casa, { apostas: 0, volume: 0, volumeLiquidado: 0, lucro: 0, moeda, vinculos: new Map() });
      }
      const casaData = casaMap.get(casa)!;
      casaData.apostas += 1;
      casaData.volume += stake;
      if (isLiquidada) {
        casaData.volumeLiquidado += stake;
      }
      casaData.lucro += lucro;

      if (!casaData.vinculos.has(vinculo)) {
        casaData.vinculos.set(vinculo, { apostas: 0, volume: 0, volumeLiquidado: 0, lucro: 0 });
      }
      const vinculoData = casaData.vinculos.get(vinculo)!;
      vinculoData.apostas += 1;
      vinculoData.volume += stake;
      if (isLiquidada) {
        vinculoData.volumeLiquidado += stake;
      }
      vinculoData.lucro += lucro;
    };

    // Helper para converter stake/lucro de perna para moeda de consolidação
    const convertPernaStake = (valor: number, pernaMoeda: string): number => {
      if (!valor) return 0;
      if (moedaConsolidacao && pernaMoeda === moedaConsolidacao) return valor;
      if (convertToConsolidation && pernaMoeda !== (moedaConsolidacao || "BRL")) return convertToConsolidation(valor, pernaMoeda);
      return valor;
    };

    // Filtra apostas pendentes que não pertencem ao período selecionado
    // (pendentes são injetadas independente do período para visibilidade operacional,
    // mas NÃO devem inflar métricas de períodos onde não ocorreram)
    const apostasParaCasas = apostas.filter((a) => {
      const isPendente = !a.resultado || a.resultado === "PENDENTE";
      if (!isPendente) return true; // liquidadas já foram filtradas pelo período
      if (!periodStart || !periodEnd) return true; // sem filtro de período, inclui tudo
      const dateStr = a.data_aposta.includes('T') ? a.data_aposta.substring(0, 10) : a.data_aposta;
      const apostaDate = new Date(dateStr + 'T12:00:00');
      return apostaDate >= startOfDay(periodStart) && apostaDate <= periodEnd;
    });

    apostasParaCasas.forEach((a) => {
      const moedaOp = a.moeda_operacao || "BRL";
      const isLiquidada = !!(a.resultado && a.resultado !== "PENDENTE");
      
      if (a.pernas && Array.isArray(a.pernas) && a.pernas.length > 0) {
        a.pernas.forEach((perna) => {
          const nomeCompleto = perna.bookmaker_nome || "Desconhecida";
          const parceiroNome = perna.parceiro_nome;
          const pernaMoeda = perna.moeda || moedaOp;
          const pernaStakeRaw = typeof perna.stake === "number" ? perna.stake : 0;
          const pernaLucroRaw = typeof perna.lucro_prejuizo === "number" ? perna.lucro_prejuizo : 0;
          const pernaStake = (moedaConsolidacao === "BRL" && typeof perna.stake_brl_referencia === "number")
            ? perna.stake_brl_referencia
            : convertPernaStake(pernaStakeRaw, pernaMoeda);
          const pernaLucro = (moedaConsolidacao === "BRL" && typeof perna.lucro_prejuizo_brl_referencia === "number")
            ? perna.lucro_prejuizo_brl_referencia
            : convertPernaStake(pernaLucroRaw, pernaMoeda);
          processEntry(nomeCompleto, parceiroNome, perna.instance_identifier, pernaStake, pernaLucro, moedaConsolidacao || "BRL", isLiquidada);
        });
      } else {
        const nomeCompleto = a.bookmaker_nome || "Desconhecida";
        const parceiroNome = a.parceiro_nome;
        const stakeConsolidado = getConsolidatedStakeLocal(a);
        const lucroConsolidado = getConsolidatedLucroLocal(a);
        processEntry(nomeCompleto, parceiroNome, a.instance_identifier, stakeConsolidado, lucroConsolidado, moedaConsolidacao || "BRL", isLiquidada);
      }
    });

    // Função helper para buscar logo do logoMap
    const findLogoForCasa = (casaName: string): string | null => {
      if (!logoMap) return null;
      
      const normalizeName = (name: string): string => {
        return name
          .toUpperCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^A-Z0-9]/g, "")
          .trim();
      };
      
      const normalizedInput = normalizeName(casaName);
      
      for (const [key, value] of logoMap.entries()) {
        if (normalizeName(key) === normalizedInput) return value ?? null;
      }
      
      for (const [key, value] of logoMap.entries()) {
        const normalizedKey = normalizeName(key);
        if (normalizedInput.includes(normalizedKey) || normalizedKey.includes(normalizedInput)) {
          return value ?? null;
        }
      }
      
      return null;
    };

    return Array.from(casaMap.entries()).map(([casa, data]) => {
      // ROI usa volume LIQUIDADO — apostas pendentes não têm resultado
      const roi = data.volumeLiquidado > 0 ? (data.lucro / data.volumeLiquidado) * 100 : 0;
      return {
        casa,
        apostas: data.apostas,
        volume: data.volume,
        lucro: data.lucro,
        roi,
        moeda: data.moeda,
        logo_url: findLogoForCasa(casa),
        vinculos: Array.from(data.vinculos.entries()).map(([vinculo, v]) => {
          const vinculoRoi = v.volumeLiquidado > 0 ? (v.lucro / v.volumeLiquidado) * 100 : 0;
          return {
            vinculo,
            apostas: v.apostas,
            volume: v.volume,
            lucro: v.lucro,
            roi: vinculoRoi,
          };
        }).sort((a, b) => b.volume - a.volume),
      };
    });
  }, [apostas, logoMap, convertToConsolidation, moedaConsolidacao]);

  // Badge usa o total do período filtrado
  const isPositive = isPositiveBadge;

  // Se só vai mostrar um dos dois, não precisa do grid de 3 colunas
  const showBoth = showEvolucaoChart && showCasasCard;

  if (!showEvolucaoChart && !showCasasCard) {
    return null;
  }

  // Só casas
  if (!showEvolucaoChart && showCasasCard) {
    return <CasasMaisUtilizadasCard casas={casasData} accentColor={accentColor} logoMap={logoMap} formatCurrency={formatCurrency} showScopeToggle={showScopeToggle} />;
  }

  // Só evolução
  if (showEvolucaoChart && !showCasasCard) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isPositive ? (
                <TrendingUp className="h-4 w-4 text-success" />
              ) : (
                <TrendingDown className="h-4 w-4 text-destructive" />
              )}
              <CardTitle className="text-sm font-medium">
                Evolução do Lucro Geral
                <span className="text-muted-foreground/60 font-normal ml-1">(Unificação de estratégias)</span>
              </CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {showCalendar && (
                <Popover open={calendarOpen} onOpenChange={handleCalendarOpenChange}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <CalendarioLucros 
                      apostas={calendarData.map(a => ({
                        data_aposta: a.data_aposta,
                        resultado: null,
                        lucro_prejuizo: calendarIsRpc ? (a.lucro_prejuizo || 0) : consolidateLucro(a),
                        operacoes: (a as any).operacoes,
                      }))} 
                      extrasLucro={calendarIsRpc ? [] : extrasConvertidos}
                      titulo="Calendário de Lucros"
                      accentColor="purple"
                      compact
                      formatCurrency={formatCurrency}
                      initialMonth={calendarInitialMonth}
                    />
                  </PopoverContent>
                </Popover>
              )}
              <Badge
                variant="outline"
                className={isPositive ? "border-success/30 text-success" : "border-destructive/30 text-destructive"}
              >
               {formatCurrency(periodTotal)}
              </Badge>
            </div>
          </div>
          {!isSingleDayPeriod && (
            <CardDescription className="text-xs">
              {diasAtivos} dias ativos • {apostas.length} apostas
            </CardDescription>
          )}
          {isSingleDayPeriod && (
            <CardDescription className="text-xs">
              Evolução por entrada ({apostas.length} apostas)
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          <div className="h-[280px]">
            <EvolucaoLucroChart data={chartDisplayData} accentColor={accentColor} isSingleDayPeriod={isSingleDayPeriod} formatCurrency={formatCurrency} formatChartAxis={axisFormatter} />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Ambos
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Gráfico de Área — Evolução do Lucro (PROTAGONISTA - 2 colunas) */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isPositive ? (
                <TrendingUp className="h-4 w-4 text-success" />
              ) : (
                <TrendingDown className="h-4 w-4 text-destructive" />
              )}
              <CardTitle className="text-sm font-medium">Evolução do Lucro</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {showCalendar && (
                <Popover open={calendarOpen} onOpenChange={handleCalendarOpenChange}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <CalendarioLucros 
                      apostas={calendarData.map(a => ({
                        data_aposta: a.data_aposta,
                        resultado: null,
                        lucro_prejuizo: calendarIsRpc ? (a.lucro_prejuizo || 0) : consolidateLucro(a),
                        operacoes: (a as any).operacoes,
                      }))} 
                      extrasLucro={calendarIsRpc ? [] : extrasConvertidos}
                      titulo="Calendário de Lucros"
                      accentColor="purple"
                      compact
                      formatCurrency={formatCurrency}
                      initialMonth={calendarInitialMonth}
                    />
                  </PopoverContent>
                </Popover>
              )}
              <Badge
                variant="outline"
                className={isPositive ? "border-success/30 text-success" : "border-destructive/30 text-destructive"}
              >
                {formatCurrency(periodTotal)}
              </Badge>
            </div>
          </div>
          {!isSingleDayPeriod && (
            <CardDescription className="text-xs">
              {diasAtivos} dias ativos • {apostas.length} apostas
            </CardDescription>
          )}
          {isSingleDayPeriod && (
            <CardDescription className="text-xs">
              Evolução por entrada ({apostas.length} apostas)
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          <div className="h-[280px]">
            <EvolucaoLucroChart data={chartDisplayData} accentColor={accentColor} isSingleDayPeriod={isSingleDayPeriod} formatCurrency={formatCurrency} formatChartAxis={axisFormatter} />
          </div>
        </CardContent>
      </Card>

      {/* Card — Casas Mais Utilizadas (CONTEXTUAL - 1 coluna) */}
      <CasasMaisUtilizadasCard casas={casasData} accentColor={accentColor} logoMap={logoMap} formatCurrency={formatCurrency} showScopeToggle={showScopeToggle} />
    </div>
  );
}

export default VisaoGeralCharts;
