import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TrendingUp, TrendingDown, Building2, Users, Calendar, Globe, FolderOpen } from "lucide-react";
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

// =====================================================
// TIPOS
// =====================================================

interface Perna {
  bookmaker_id?: string;
  bookmaker_nome?: string;
  parceiro_nome?: string | null;
  stake?: number;
  lucro_prejuizo?: number;
  resultado?: string;
  odd?: number;
  selecao?: string;
}

interface ApostaBase {
  data_aposta: string;
  lucro_prejuizo: number | null;
  stake: number;
  stake_total?: number | null;
  bookmaker_nome?: string;
  parceiro_nome?: string | null;
  bookmaker_id?: string | null;
  pernas?: Perna[] | null;
  forma_registro?: string;
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
  logo_url?: string | null;
  vinculos: VinculoDetalhe[];
}

interface EvolucaoData {
  entrada: number;
  data: string;
  hora: string;
  xLabel: string; // Label formatado para o eixo X (hora ou data)
  acumulado: number;
  impacto: number;
  resultado: string;
  // Campos extras para modo consolidado diário
  isConsolidated?: boolean;
  apostasNoDia?: number;
  // Extras para fontes de lucro adicionais
  incluiExtras?: boolean;
}

// Interface para entradas de lucro extra (cashback, giros grátis, freebets, etc.)
export interface ExtraLucroEntry {
  data: string; // formato YYYY-MM-DD ou ISO
  valor: number;
  tipo: 'cashback' | 'giro_gratis' | 'freebet' | 'bonus' | 'promocional';
}

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
  /** Função de formatação obrigatória - deve vir do useProjetoCurrency */
  formatCurrency: (value: number) => string;
  /** Função de formatação para eixos de gráfico (compacta, sem quebra) */
  formatChartAxis?: (value: number) => string;
  /** Habilita toggle de escopo global para o card de Casas */
  showScopeToggle?: boolean;
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
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Sem dados para exibir
      </div>
    );
  }

  const lastValue = data[data.length - 1]?.acumulado ?? 0;
  const isPositive = lastValue >= 0;

  // Gradient colors based on positive/negative
  const gradientId = `areaGradient-${accentColor.replace(/[^a-zA-Z0-9]/g, "")}`;
  const strokeColor = isPositive ? "hsl(var(--chart-2))" : "hsl(var(--destructive))";
  const fillColor = isPositive ? "hsl(var(--chart-2))" : "hsl(var(--destructive))";

  // Para período de 1 dia, usa intervalo baseado na quantidade
  // Para múltiplos dias, mostra apenas os ticks com label (filtra vazios)
  const tickInterval = isSingleDayPeriod 
    ? (data.length > 50 ? Math.floor(data.length / 10) : data.length > 20 ? 5 : 0)
    : 0; // Mostra todos, mas o tickFormatter vai filtrar vazios

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
          interval={tickInterval}
          tick={({ x, y, payload }: { x: number; y: number; payload: { value: string } }) => {
            // Não renderiza tick se o label for vazio
            if (!payload.value) return <text />;
            return (
              <text 
                x={x} 
                y={y + 10} 
                textAnchor="middle" 
                fill="hsl(var(--muted-foreground))" 
                fontSize={11}
              >
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
  const [scope, setScope] = useState<"projeto" | "global">("projeto");
  
  const activeCasas = scope === "global" && casasGlobal ? casasGlobal : casas;
  
  const topCasas = useMemo(() => 
    [...activeCasas].sort((a, b) => b.volume - a.volume).slice(0, 6), 
    [activeCasas]
  );

  // Normaliza nome para comparação: remove acentos, espaços extras, caracteres especiais
  const normalizeName = (name: string): string => {
    return name
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remove acentos
      .replace(/[^A-Z0-9]/g, "") // mantém apenas letras e números
      .trim();
  };

  const getLogoUrl = (casaData: CasaUsada): string | null | undefined => {
    // 1. Prioridade: logo_url já processado na agregação
    if (casaData.logo_url) return casaData.logo_url;
    
    // 2. Fallback: buscar no logoMap se disponível
    if (!logoMap) return null;
    
    const normalizedInput = normalizeName(casaData.casa);
    
    // Match exato normalizado
    for (const [key, value] of logoMap.entries()) {
      if (normalizeName(key) === normalizedInput) return value;
    }
    
    // Match parcial (um contém o outro)
    for (const [key, value] of logoMap.entries()) {
      const normalizedKey = normalizeName(key);
      if (normalizedInput.includes(normalizedKey) || normalizedKey.includes(normalizedInput)) {
        return value;
      }
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
      <CardContent className="space-y-3">
        {/* Header row */}
        <div className="grid grid-cols-[auto_24px_1fr_60px_90px_70px] gap-2 items-center text-xs text-muted-foreground border-b pb-2">
          <span className="w-5"></span>
          <span></span>
          <span>Casa</span>
          <span className="text-right">Qtd</span>
          <span className="text-right">Volume</span>
          <span className="text-right">ROI</span>
        </div>
        
        {topCasas.map((casa, idx) => {
          const barWidth = (casa.volume / maxVolume) * 100;
          const roiColor = casa.roi >= 0 ? "text-emerald-500" : "text-red-500";
          const logoUrl = getLogoUrl(casa);
          return (
            <Tooltip key={casa.casa}>
              <TooltipTrigger asChild>
                <div className="space-y-1.5 cursor-default">
                  <div className="grid grid-cols-[auto_24px_1fr_60px_90px_70px] gap-2 items-center text-sm">
                    <span className="text-xs text-muted-foreground w-5">{idx + 1}.</span>
                    <div className="w-6 h-6 rounded bg-muted/50 flex items-center justify-center overflow-hidden shrink-0">
                      {logoUrl ? (
                        <img src={logoUrl} alt={casa.casa} className="w-5 h-5 object-contain" />
                      ) : (
                        <Building2 className="w-3 h-3 text-muted-foreground" />
                      )}
                    </div>
                    <span className="font-medium truncate">{casa.casa}</span>
                    <span className="text-right text-muted-foreground tabular-nums">{casa.apostas}</span>
                    <span className="text-right font-medium tabular-nums">{formatCurrency(casa.volume)}</span>
                    <span className={`text-right font-semibold tabular-nums ${roiColor}`}>
                      {casa.roi >= 0 ? '+' : ''}{casa.roi.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-muted overflow-hidden ml-12">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${barWidth}%`,
                        backgroundColor: accentColor,
                        opacity: 1 - idx * 0.08,
                      }}
                    />
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs space-y-2 max-w-[300px]">
                <p className="font-semibold border-b pb-1 mb-1">{casa.casa}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                  <span>Apostas:</span>
                  <span className="text-right font-medium text-foreground">{casa.apostas}</span>
                  <span>Volume:</span>
                  <span className="text-right font-medium text-foreground">{formatCurrency(casa.volume)}</span>
                  <span>Lucro:</span>
                  <span className={`text-right font-medium ${casa.lucro >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    {casa.lucro >= 0 ? '+' : ''}{formatCurrency(casa.lucro)}
                  </span>
                  <span>ROI:</span>
                  <span className={`text-right font-semibold ${roiColor}`}>{casa.roi.toFixed(2)}%</span>
                </div>
                {casa.vinculos.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t">
                    <div className="flex items-center gap-1 text-muted-foreground mb-2">
                      <Users className="h-3 w-3" />
                      <span className="font-medium">Por vínculo:</span>
                    </div>
                    <div className="grid grid-cols-[1fr_60px_60px] gap-x-2 text-[10px] text-muted-foreground border-b pb-1 mb-1">
                      <span>Vínculo</span>
                      <span className="text-right">Volume</span>
                      <span className="text-right">ROI</span>
                    </div>
                    {casa.vinculos.slice(0, 5).map((v) => (
                      <div key={v.vinculo} className="grid grid-cols-[1fr_60px_60px] gap-x-2 items-center">
                        <span className="truncate">{v.vinculo}</span>
                        <span className="text-right text-muted-foreground tabular-nums">{formatCurrency(v.volume)}</span>
                        <span className={`text-right font-medium tabular-nums ${v.roi >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                          {v.roi >= 0 ? '+' : ''}{v.roi.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                    {casa.vinculos.length > 5 && (
                      <div className="text-muted-foreground">+{casa.vinculos.length - 5} vínculos...</div>
                    )}
                  </div>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </CardContent>
    </Card>
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
  formatCurrency,
  formatChartAxis,
  showScopeToggle = false
}: VisaoGeralChartsProps) {
  
  // DESACOPLAMENTO: O calendário usa seus próprios dados (sem filtro de período)
  // Se apostasCalendario não for fornecido, usa apostas como fallback
  const calendarData = apostasCalendario ?? apostas;
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
  const [calendarMonthTotal, setCalendarMonthTotal] = useState<number>(0);
  
  // Prepara mapa de extras por data para inclusão no gráfico de evolução
  const extrasMap = useMemo(() => {
    const map = new Map<string, number>();
    extrasLucro.forEach(e => {
      // Normaliza data para formato yyyy-MM-dd
      const dateStr = e.data.includes('T') ? e.data.split('T')[0] : e.data;
      const current = map.get(dateStr) || 0;
      map.set(dateStr, current + e.valor);
    });
    return map;
  }, [extrasLucro]);
  
  const evolucaoData = useMemo((): EvolucaoData[] => {
    const sorted = [...apostas].sort(
      (a, b) => parseLocalDateTime(a.data_aposta).getTime() - parseLocalDateTime(b.data_aposta).getTime()
    );
    
    // MODO 1: Período de 1 dia → entrada por entrada (não inclui extras neste modo)
    if (isSingleDayPeriod) {
      let acumulado = 0;
      return sorted.map((a, index) => {
        // Usa lucro_prejuizo diretamente (já vem corrigido com pl_consolidado aplicado)
        const impacto = a.lucro_prejuizo ?? 0;
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
      // Usa lucro_prejuizo diretamente (já vem corrigido do ProjetoDashboardTab com pl_consolidado aplicado)
      const impacto = a.lucro_prejuizo ?? 0;
      
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
    extrasMap.forEach((valor, dateKey) => {
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
        acumulado,
        impacto: day.lucroTotal,
        resultado: day.lucroTotal >= 0 ? 'GREEN' : 'RED',
        isConsolidated: true,
        apostasNoDia: day.apostasCount,
        incluiExtras: day.incluiExtras,
      };
    });
  }, [apostas, isSingleDayPeriod, extrasMap]);

  // Casas mais utilizadas (por volume) — agrupa por CASA, com detalhamento por vínculo
  // Formato esperado: "PARIMATCH - RAFAEL GOMES" → Casa = "PARIMATCH", Vínculo = "RAFAEL GOMES"
  const casasData = useMemo((): CasaUsada[] => {
    // Estrutura: casa → { total, vinculos: Map<vinculo, { apostas, volume, lucro }> }
    const casaMap = new Map<string, { 
      apostas: number; 
      volume: number;
      lucro: number;
      vinculos: Map<string, { apostas: number; volume: number; lucro: number }> 
    }>();

    const processEntry = (bookmakerNome: string, parceiroNome: string | null | undefined, stake: number, lucro: number) => {
      // Se tem parceiro_nome separado, usa diretamente
      // Caso contrário, tenta extrair do nome completo (formato: "CASA - VÍNCULO")
      let casa: string;
      let vinculo: string;
      
      if (parceiroNome) {
        // Parceiro fornecido separadamente - usa diretamente
        casa = bookmakerNome;
        vinculo = getFirstLastName(parceiroNome);
      } else {
        // Tenta extrair do nome completo
        const separatorIdx = bookmakerNome.indexOf(" - ");
        if (separatorIdx > 0) {
          casa = bookmakerNome.substring(0, separatorIdx).trim();
          const vinculoRaw = bookmakerNome.substring(separatorIdx + 3).trim();
          vinculo = getFirstLastName(vinculoRaw);
        } else {
          casa = bookmakerNome;
          vinculo = "Principal";
        }
      }

      if (!casaMap.has(casa)) {
        casaMap.set(casa, { apostas: 0, volume: 0, lucro: 0, vinculos: new Map() });
      }
      const casaData = casaMap.get(casa)!;
      casaData.apostas += 1;
      casaData.volume += stake;
      casaData.lucro += lucro;

      // Agregar por vínculo
      if (!casaData.vinculos.has(vinculo)) {
        casaData.vinculos.set(vinculo, { apostas: 0, volume: 0, lucro: 0 });
      }
      const vinculoData = casaData.vinculos.get(vinculo)!;
      vinculoData.apostas += 1;
      vinculoData.volume += stake;
      vinculoData.lucro += lucro;
    };

    apostas.forEach((a) => {
      // Se tem pernas (aposta multi-pernas), itera sobre cada perna
      if (a.pernas && Array.isArray(a.pernas) && a.pernas.length > 0) {
        a.pernas.forEach((perna) => {
          const nomeCompleto = perna.bookmaker_nome || "Desconhecida";
          const parceiroNome = perna.parceiro_nome;
          const pernaStake = typeof perna.stake === "number" ? perna.stake : 0;
          const pernaLucro = typeof perna.lucro_prejuizo === "number" ? perna.lucro_prejuizo : 0;
          processEntry(nomeCompleto, parceiroNome, pernaStake, pernaLucro);
        });
      } else {
        // Aposta simples — usa bookmaker_nome e parceiro_nome
        const nomeCompleto = a.bookmaker_nome || "Desconhecida";
        const parceiroNome = a.parceiro_nome;
        const lucro = a.lucro_prejuizo || 0;
        processEntry(nomeCompleto, parceiroNome, getStake(a), lucro);
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
      const roi = data.volume > 0 ? (data.lucro / data.volume) * 100 : 0;
      return {
        casa,
        apostas: data.apostas,
        volume: data.volume,
        lucro: data.lucro,
        roi,
        logo_url: findLogoForCasa(casa),
        vinculos: Array.from(data.vinculos.entries()).map(([vinculo, v]) => {
          const vinculoRoi = v.volume > 0 ? (v.lucro / v.volume) * 100 : 0;
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
  }, [apostas, logoMap]);

  // Badge exibe o lucro do mês atualmente navegado no calendário (apostas + extras)
  const isPositive = calendarMonthTotal >= 0;

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
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
              <CardTitle className="text-sm font-medium">
                Evolução do Lucro Geral
                <span className="text-muted-foreground/60 font-normal ml-1">(Unificação de estratégias)</span>
              </CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {showCalendar && (
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
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
                        lucro_prejuizo: a.lucro_prejuizo
                      }))} 
                      extrasLucro={extrasLucro}
                      titulo="Calendário de Lucros"
                      accentColor="purple"
                      compact
                      formatCurrency={formatCurrency}
                      onMonthTotalChange={setCalendarMonthTotal}
                    />
                  </PopoverContent>
                </Popover>
              )}
              <Badge
                variant="outline"
                className={isPositive ? "border-emerald-500/30 text-emerald-500" : "border-red-500/30 text-red-500"}
              >
                {formatCurrency(calendarMonthTotal)}
              </Badge>
            </div>
          </div>
          <CardDescription className="text-xs">
            {isSingleDayPeriod 
              ? `Evolução por entrada (${apostas.length} apostas)` 
              : `Acumulado diário (${evolucaoData.length} dias • ${apostas.length} apostas)`
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="h-[280px]">
            <EvolucaoLucroChart data={evolucaoData} accentColor={accentColor} isSingleDayPeriod={isSingleDayPeriod} formatCurrency={formatCurrency} formatChartAxis={axisFormatter} />
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
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
              <CardTitle className="text-sm font-medium">Evolução do Lucro</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {showCalendar && (
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
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
                        lucro_prejuizo: a.lucro_prejuizo
                      }))} 
                      extrasLucro={extrasLucro}
                      titulo="Calendário de Lucros"
                      accentColor="purple"
                      compact
                      formatCurrency={formatCurrency}
                      onMonthTotalChange={setCalendarMonthTotal}
                    />
                  </PopoverContent>
                </Popover>
              )}
              <Badge
                variant="outline"
                className={isPositive ? "border-emerald-500/30 text-emerald-500" : "border-red-500/30 text-red-500"}
              >
                {formatCurrency(calendarMonthTotal)}
              </Badge>
            </div>
          </div>
          <CardDescription className="text-xs">
            {isSingleDayPeriod 
              ? `Evolução por entrada (${apostas.length} apostas)` 
              : `Acumulado diário (${evolucaoData.length} dias • ${apostas.length} apostas)`
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="h-[280px]">
            <EvolucaoLucroChart data={evolucaoData} accentColor={accentColor} isSingleDayPeriod={isSingleDayPeriod} formatCurrency={formatCurrency} formatChartAxis={axisFormatter} />
          </div>
        </CardContent>
      </Card>

      {/* Card — Casas Mais Utilizadas (CONTEXTUAL - 1 coluna) */}
      <CasasMaisUtilizadasCard casas={casasData} accentColor={accentColor} logoMap={logoMap} formatCurrency={formatCurrency} showScopeToggle={showScopeToggle} />
    </div>
  );
}

export default VisaoGeralCharts;
