import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TrendingUp, TrendingDown, Building2, Users } from "lucide-react";
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

// =====================================================
// TIPOS
// =====================================================

interface Perna {
  bookmaker_id?: string;
  bookmaker_nome?: string;
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
  data: string;
  acumulado: number;
}

interface VisaoGeralChartsProps {
  apostas: ApostaBase[];
  accentColor?: string;
  title?: string;
  logoMap?: Map<string, string | null>;
}

// =====================================================
// HELPERS
// =====================================================

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

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
}

function EvolucaoLucroChart({ data, accentColor }: EvolucaoLucroChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
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

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={fillColor} stopOpacity={0.3} />
            <stop offset="95%" stopColor={fillColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="data"
          stroke="hsl(var(--muted-foreground))"
          fontSize={11}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="hsl(var(--muted-foreground))"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `R$${v}`}
        />
        <RechartsTooltip
          formatter={(value: number) => [formatCurrency(value), "Acumulado"]}
          contentStyle={{
            backgroundColor: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          labelStyle={{ color: "hsl(var(--muted-foreground))" }}
        />
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
  accentColor: string;
  logoMap?: Map<string, string | null>;
}

function CasasMaisUtilizadasCard({ casas, accentColor, logoMap }: CasasMaisUtilizadasCardProps) {
  const topCasas = useMemo(() => 
    [...casas].sort((a, b) => b.volume - a.volume).slice(0, 8), 
    [casas]
  );

  const getLogoUrl = (casaName: string) => {
    if (!logoMap) return null;
    // Try exact match first
    if (logoMap.has(casaName)) return logoMap.get(casaName);
    // Try case-insensitive match
    const upperName = casaName.toUpperCase();
    for (const [key, value] of logoMap.entries()) {
      if (key.toUpperCase() === upperName) return value;
    }
    return null;
  };

  if (topCasas.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4" style={{ color: accentColor }} />
            <CardTitle className="text-sm font-medium">Casas Mais Utilizadas</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[180px] text-sm text-muted-foreground">
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
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4" style={{ color: accentColor }} />
          <CardTitle className="text-sm font-medium">Casas Mais Utilizadas</CardTitle>
        </div>
        <CardDescription className="text-xs">Por volume apostado</CardDescription>
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
          const logoUrl = getLogoUrl(casa.casa);
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

export function VisaoGeralCharts({ apostas, accentColor = "hsl(var(--primary))", logoMap }: VisaoGeralChartsProps) {
  // Evolução do lucro acumulado
  const evolucaoData = useMemo(() => {
    const sorted = [...apostas].sort(
      (a, b) => new Date(a.data_aposta).getTime() - new Date(b.data_aposta).getTime()
    );
    
    let acumulado = 0;
    const dataMap = new Map<string, number>();

    sorted.forEach((a) => {
      const dateKey = format(new Date(a.data_aposta), "dd/MM", { locale: ptBR });
      acumulado += a.lucro_prejuizo || 0;
      dataMap.set(dateKey, acumulado);
    });

    return Array.from(dataMap.entries()).map(([data, acc]) => ({ data, acumulado: acc }));
  }, [apostas]);

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

    const processEntry = (nomeCompleto: string, stake: number, lucro: number) => {
      // Extrair casa e vínculo do nome (formato: "CASA - VÍNCULO")
      const separatorIdx = nomeCompleto.indexOf(" - ");
      let casa: string;
      let vinculo: string;
      
      if (separatorIdx > 0) {
        casa = nomeCompleto.substring(0, separatorIdx).trim();
        vinculo = nomeCompleto.substring(separatorIdx + 3).trim();
      } else {
        casa = nomeCompleto;
        vinculo = "Principal";
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
          const pernaStake = typeof perna.stake === "number" ? perna.stake : 0;
          const pernaLucro = typeof perna.lucro_prejuizo === "number" ? perna.lucro_prejuizo : 0;
          processEntry(nomeCompleto, pernaStake, pernaLucro);
        });
      } else {
        // Aposta simples — usa bookmaker_nome diretamente
        const nomeCompleto = a.bookmaker_nome || "Desconhecida";
        const lucro = a.lucro_prejuizo || 0;
        processEntry(nomeCompleto, getStake(a), lucro);
      }
    });

    return Array.from(casaMap.entries()).map(([casa, data]) => {
      const roi = data.volume > 0 ? (data.lucro / data.volume) * 100 : 0;
      return {
        casa,
        apostas: data.apostas,
        volume: data.volume,
        lucro: data.lucro,
        roi,
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
  }, [apostas]);

  const lastAccumulated = evolucaoData[evolucaoData.length - 1]?.acumulado ?? 0;
  const isPositive = lastAccumulated >= 0;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Gráfico de Área — Evolução do Lucro */}
      <Card>
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
            <Badge
              variant="outline"
              className={isPositive ? "border-emerald-500/30 text-emerald-500" : "border-red-500/30 text-red-500"}
            >
              {formatCurrency(lastAccumulated)}
            </Badge>
          </div>
          <CardDescription className="text-xs">Lucro/Prejuízo acumulado ao longo do tempo</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <EvolucaoLucroChart data={evolucaoData} accentColor={accentColor} />
        </CardContent>
      </Card>

      {/* Card — Casas Mais Utilizadas */}
      <CasasMaisUtilizadasCard casas={casasData} accentColor={accentColor} logoMap={logoMap} />
    </div>
  );
}

export default VisaoGeralCharts;
