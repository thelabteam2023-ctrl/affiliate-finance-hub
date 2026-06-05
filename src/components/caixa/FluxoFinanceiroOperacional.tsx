import { useMemo, useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, isWithinInterval, subDays, subMonths, startOfMonth, parse, eachDayOfInterval } from "date-fns";
import { parseLocalDate } from "@/lib/dateUtils";
import { ptBR } from "date-fns/locale";
import { TrendingUp, TrendingDown, ArrowRightLeft, AlertCircle, Building2, Users, CalendarIcon, MoreVertical, Wrench, CheckCircle2, ShieldAlert } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AjusteManualDialog } from "./AjusteManualDialog";
import { ReconciliacaoDialog } from "./ReconciliacaoDialog";
import { ReportarScanDialog } from "./ReportarScanDialog";
import { cn } from "@/lib/utils";
import { useCotacoes } from "@/hooks/useCotacoes";
import Chart from "chart.js/auto";

interface Cotacoes {
  USD_BRL: number;
  USDC_BRL: number;
  USDT_BRL: number;
  BTC_BRL: number;
  ETH_BRL: number;
  LTC_BRL: number;
}

interface FluxoPonto {
  data: string;   // 'DD/MM/AAAA'
  label: string;  // 'DD/MM'
  depositos: Record<string, number>;
  saques: Record<string, number>;
  cotacoes: Cotacoes;
  isEstimada?: boolean;
}

interface Transacao {
  id: string;
  data_transacao: string;
  tipo_transacao: string;
  tipo_moeda: string;
  moeda: string;
  valor: number;
  valor_usd: number | null;
  origem_tipo: string | null;
  destino_tipo: string | null;
  descricao?: string | null;
}

interface FluxoFinanceiroOperacionalProps {
  transacoes: Transacao[];
  dataInicio?: Date;
  dataFim?: Date;
  setDataInicio?: (date: Date | undefined) => void;
  setDataFim?: (date: Date | undefined) => void;
  saldoBookmakers?: number;
  onTransacaoClick?: (transacoes: Transacao[]) => void;
}

type Periodo = "dia" | "semana" | "mes" | "customizado";

function converterParaBRL(valor: number, moeda: string, cotacoes: Cotacoes): number {
  if (moeda === 'BRL') return valor;
  const key = `${moeda.toUpperCase()}_BRL` as keyof Cotacoes;
  const taxa = cotacoes[key];
  if (!taxa || taxa <= 0) return 0;
  return valor * taxa;
}

export function FluxoFinanceiroOperacional({
  transacoes,
  dataInicio,
  dataFim,
  setDataInicio,
  setDataFim,
}: FluxoFinanceiroOperacionalProps) {
  const [periodo, setPeriodo] = useState<Periodo>("dia");
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(subDays(new Date(), 30));
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(new Date());
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  const [datasetVisibility, setDatasetVisibility] = useState<boolean[]>([true, true, true, true]);
  
  const [isAjusteOpen, setIsAjusteOpen] = useState(false);
  const [isReconciliacaoOpen, setIsReconciliacaoOpen] = useState(false);
  const [isScanOpen, setIsScanOpen] = useState(false);
  
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const { cotacaoUSD, cryptoPrices } = useCotacoes(["USDC", "USDT", "ETH", "BTC", "LTC"]);

  const cotacoesAtuais: Cotacoes = useMemo(() => ({
    USD_BRL: cotacaoUSD,
    USDC_BRL: cryptoPrices.USDC || cotacaoUSD,
    USDT_BRL: cryptoPrices.USDT || cotacaoUSD,
    BTC_BRL: cryptoPrices.BTC || 0,
    ETH_BRL: cryptoPrices.ETH || 0,
    LTC_BRL: cryptoPrices.LTC || 0,
  }), [cotacaoUSD, cryptoPrices]);

  const handlePeriodoChange = (newPeriodo: Periodo) => {
    setPeriodo(newPeriodo);
    const now = new Date();
    if (newPeriodo !== "customizado") {
      setShowCustomDatePicker(false);
      switch (newPeriodo) {
        case "mes":
          setDataInicio?.(startOfMonth(subMonths(now, 5)));
          setDataFim?.(now);
          break;
        case "semana":
          setDataInicio?.(subDays(now, 84));
          setDataFim?.(now);
          break;
        case "dia":
          setDataInicio?.(subDays(now, 30));
          setDataFim?.(now);
          break;
      }
    } else {
      setShowCustomDatePicker(true);
      if (customStartDate) setDataInicio?.(customStartDate);
      if (customEndDate) setDataFim?.(customEndDate);
    }
  };

  const handleCustomDateApply = () => {
    setDataInicio?.(customStartDate);
    setDataFim?.(customEndDate);
    setShowCustomDatePicker(false);
  };

  const pontosGrafico = useMemo(() => {
    if (!dataInicio || !dataFim) return [];
    
    const dias = eachDayOfInterval({ start: dataInicio, end: dataFim });
    const mapa = new Map<string, FluxoPonto>();

    dias.forEach(dia => {
      const dStr = format(dia, 'yyyy-MM-dd');
      mapa.set(dStr, {
        data: dStr,
        label: format(dia, 'dd/MM'),
        depositos: {},
        saques: {},
        cotacoes: cotacoesAtuais, // Em prod isso viria do histórico
      });
    });

    transacoes.forEach(t => {
      // Usar extractCivilDateKey para consistência com o backend (YYYY-MM-DD)
      const dStr = t.data_transacao.includes('T') 
        ? t.data_transacao.split('T')[0] 
        : t.data_transacao.split(' ')[0];
        
      const ponto = mapa.get(dStr);
      if (ponto) {
        const moeda = t.moeda || 'BRL';
        const valor = t.tipo_moeda === 'CRYPTO' ? (t.valor_usd || t.valor || 0) : (t.valor || 0);
        
        // Normalizar tipos: APORTE e APORTE_FINANCEIRO são entradas, LIQUIDACAO é saída
        const isEntry = t.tipo_transacao === 'DEPOSITO' || t.tipo_transacao === 'APORTE' || t.tipo_transacao === 'APORTE_FINANCEIRO';
        const isExit = t.tipo_transacao === 'SAQUE' || t.tipo_transacao === 'LIQUIDACAO';

        if (isEntry) {
          ponto.depositos[moeda] = (ponto.depositos[moeda] || 0) + valor;
        } else if (isExit) {
          ponto.saques[moeda] = (ponto.saques[moeda] || 0) + valor;
        }
      }
    });


    return Array.from(mapa.values());
  }, [transacoes, dataInicio, dataFim, cotacoesAtuais]);

  const processado = useMemo(() => {
    return pontosGrafico.map(p => {
      const moedasCrypto = ['USD', 'USDC', 'USDT', 'BTC', 'ETH', 'LTC'];
      
      const depFiat = p.depositos['BRL'] || 0;
      const depCrypto = moedasCrypto.reduce((acc, m) => acc + converterParaBRL(p.depositos[m] || 0, m, p.cotacoes), 0);
      const saqFiat = p.saques['BRL'] || 0;
      const saqCrypto = moedasCrypto.reduce((acc, m) => acc + converterParaBRL(p.saques[m] || 0, m, p.cotacoes), 0);

      return { label: p.label, depFiat, depCrypto, saqFiat, saqCrypto, raw: p };
    });
  }, [pontosGrafico]);

  const kpis = useMemo(() => {
    const totals = processado.reduce((acc, p) => ({
      depFiat: acc.depFiat + p.depFiat,
      depCrypto: acc.depCrypto + p.depCrypto,
      saqFiat: acc.saqFiat + p.saqFiat,
      saqCrypto: acc.saqCrypto + p.saqCrypto,
    }), { depFiat: 0, depCrypto: 0, saqFiat: 0, saqCrypto: 0 });

    const max = Math.max(totals.depFiat, totals.depCrypto, totals.saqFiat, totals.saqCrypto, 1);
    
    return [
      { label: 'Depósitos BRL', value: totals.depFiat, color: '#22c55e', pct: (totals.depFiat / max) * 100 },
      { label: 'Depósitos Crypto', value: totals.depCrypto, color: '#22d3ee', pct: (totals.depCrypto / max) * 100, isCrypto: true },
      { label: 'Saques BRL', value: totals.saqFiat, color: '#f472b6', pct: (totals.saqFiat / max) * 100 },
      { label: 'Saques Crypto', value: totals.saqCrypto, color: '#818cf8', pct: (totals.saqCrypto / max) * 100, isCrypto: true },
    ];
  }, [processado]);

  useEffect(() => {
    if (!chartRef.current || processado.length === 0) return;

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = chartRef.current.getContext('2d');
    if (!ctx) return;

    chartInstance.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: processado.map(p => p.label),
        datasets: [
          {
            label: 'Depósitos BRL',
            data: processado.map(p => p.depFiat),
            backgroundColor: 'rgba(34, 197, 94, 0.75)',
            borderRadius: 4,
            hidden: !datasetVisibility[0]
          },
          {
            label: 'Depósitos Crypto (R$)',
            data: processado.map(p => p.depCrypto),
            backgroundColor: 'rgba(34, 211, 238, 0.75)',
            borderRadius: 4,
            hidden: !datasetVisibility[1]
          },
          {
            label: 'Saques BRL',
            data: processado.map(p => p.saqFiat),
            backgroundColor: 'rgba(244, 114, 182, 0.75)',
            borderRadius: 4,
            hidden: !datasetVisibility[2]
          },
          {
            label: 'Saques Crypto (R$)',
            data: processado.map(p => p.saqCrypto),
            backgroundColor: 'rgba(129, 140, 248, 0.75)',
            borderRadius: 4,
            hidden: !datasetVisibility[3]
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            external: (context) => {
              const { chart, tooltip } = context;
              const tooltipEl = tooltipRef.current;
              if (!tooltipEl) return;

              if (tooltip.opacity === 0) {
                tooltipEl.style.opacity = '0';
                return;
              }

              const index = tooltip.dataPoints[0].dataIndex;
              const ponto = processado[index].raw;
              
              let html = `<div class="text-[12px] font-bold pb-2 border-b border-white/10 mb-2">📅 ${format(parseLocalDate(ponto.data), 'dd/MM/yyyy')}</div>`;
              
              // BRL Section
              html += `<div class="mb-2">
                <div class="text-[9px] uppercase font-bold text-[#22c55e] bg-[#0c2a1a] px-1.5 py-0.5 rounded w-fit mb-1">BRL</div>
                <div class="flex justify-between text-[11px] mb-0.5">
                  <span class="text-[#9ca3af]">↓ Depósitos</span>
                  <span class="text-[#22c55e] font-mono">R$ ${(ponto.depositos['BRL'] || 0).toLocaleString('pt-BR')}</span>
                </div>
                <div class="flex justify-between text-[11px]">
                  <span class="text-[#9ca3af]">↑ Saques</span>
                  <span class="text-[#f472b6] font-mono">R$ ${(ponto.saques['BRL'] || 0).toLocaleString('pt-BR')}</span>
                </div>
              </div>`;

              // Crypto Section
              const moedasCrypto = Object.keys(ponto.depositos).concat(Object.keys(ponto.saques)).filter(m => m !== 'BRL');
              const uniqueMoedas = Array.from(new Set(moedasCrypto));

              if (uniqueMoedas.length > 0) {
                html += `<div class="pt-2 border-t border-white/5">
                  <div class="text-[9px] uppercase font-bold text-[#22d3ee] bg-[#0a1a2a] px-1.5 py-0.5 rounded w-fit mb-1">Crypto</div>`;
                
                uniqueMoedas.forEach(m => {
                  const dep = ponto.depositos[m] || 0;
                  const saq = ponto.saques[m] || 0;
                  if (dep > 0) {
                    html += `<div class="flex justify-between text-[11px] mb-0.5">
                      <span class="text-[#9ca3af]">↓ Dep ${m}</span>
                      <span class="text-white font-mono">${m === 'BRL' ? '' : getCurrencySymbol(m)} ${dep.toLocaleString('pt-BR')} <span class="text-[#6b7280]">≈R$ ${converterParaBRL(dep, m, ponto.cotacoes).toLocaleString('pt-BR')}</span></span>
                    </div>`;
                  }
                  if (saq > 0) {
                    html += `<div class="flex justify-between text-[11px]">
                      <span class="text-[#9ca3af]">↑ Saq ${m}</span>
                      <span class="text-white font-mono">${m === 'BRL' ? '' : getCurrencySymbol(m)} ${saq.toLocaleString('pt-BR')} <span class="text-[#6b7280]">≈R$ ${converterParaBRL(saq, m, ponto.cotacoes).toLocaleString('pt-BR')}</span></span>
                    </div>`;
                  }
                });
                html += `</div>`;
              }

              tooltipEl.innerHTML = html;
              tooltipEl.style.opacity = '1';

              const position = chart.canvas.getBoundingClientRect();
              const left = tooltip.caretX;
              const top = tooltip.caretY;

              if (left > chart.width / 2) {
                tooltipEl.style.left = (left - tooltipEl.offsetWidth - 10) + 'px';
              } else {
                tooltipEl.style.left = (left + 10) + 'px';
              }
              tooltipEl.style.top = (top - 20) + 'px';
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#4b5563', font: { size: 10 } }
          },
          y: {
            grid: { color: 'rgba(31, 41, 55, 0.5)' },
            ticks: {
              color: '#4b5563',
              font: { size: 10 },
              callback: (val) => {
                const v = Number(val);
                if (v >= 1000000) return 'R$' + (v/1000000).toFixed(1) + 'M';
                if (v >= 1000) return 'R$' + (v/1000).toFixed(0) + 'k';
                return 'R$' + v;
              }
            }
          }
        }
      }
    });
  }, [processado, datasetVisibility]);

  const toggleDataset = (index: number) => {
    const newVisibility = [...datasetVisibility];
    newVisibility[index] = !newVisibility[index];
    setDatasetVisibility(newVisibility);
  };

  const totalDepBRL = processado.reduce((a, b) => a + b.depFiat, 0);
  const totalSaqBRL = processado.reduce((a, b) => a + b.saqFiat, 0);
  const totalDepCrypto = processado.reduce((a, b) => a + b.depCrypto, 0);
  const totalSaqCrypto = processado.reduce((a, b) => a + b.saqCrypto, 0);
  
  const fluxoBRL = totalDepBRL - totalSaqBRL;
  const fluxoCrypto = totalDepCrypto - totalSaqCrypto;
  const saldoTotal = fluxoBRL + fluxoCrypto;

  function getCurrencySymbol(m: string) {
    if (m === 'USD' || m === 'USDC' || m === 'USDT') return 'US$';
    return m;
  }

  return (
    <div className="space-y-6">
      <Card className="bg-[#0f1219] border-[#1f2937] border-[0.5px] rounded-xl overflow-visible shadow-xl">
        <CardContent className="p-5 space-y-6">
          {/* Header & Filters */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-white leading-tight">Análise Financeira</h3>
                <p className="text-[11px] text-[#4b5563]">Fluxo de caixa multi-moeda</p>
              </div>
            </div>

            <div className="flex items-center gap-1 bg-[#161b27] p-1 rounded-lg border border-[#1f2937]">
              {["dia", "semana", "mes", "customizado"].map((p) => (
                <Button
                  key={p}
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePeriodoChange(p as Periodo)}
                  className={cn(
                    "h-7 px-3 text-[11px] font-medium transition-all rounded-md",
                    periodo === p ? "bg-[#22c55e] text-white shadow-sm" : "text-[#4b5563] hover:text-[#9ca3af] hover:bg-white/5"
                  )}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </Button>
              ))}
              
              <Popover open={showCustomDatePicker} onOpenChange={setShowCustomDatePicker}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 flex items-center justify-center text-[#4b5563] hover:text-white">
                    <CalendarIcon className="h-3.5 w-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-4 bg-[#12161f] border-[#1f2937]" align="end">
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase font-bold text-[#4b5563]">Início</label>
                        <Calendar
                          mode="single"
                          selected={customStartDate}
                          onSelect={setCustomStartDate}
                          className="bg-[#0f1219] border border-[#1f2937] rounded-md"
                          locale={ptBR}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase font-bold text-[#4b5563]">Fim</label>
                        <Calendar
                          mode="single"
                          selected={customEndDate}
                          onSelect={setCustomEndDate}
                          className="bg-[#0f1219] border border-[#1f2937] rounded-md"
                          locale={ptBR}
                        />
                      </div>
                    </div>
                    <Button onClick={handleCustomDateApply} size="sm" className="w-full bg-[#22c55e] hover:bg-[#16a34a] text-white">
                      Aplicar Intervalo
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>


        {/* KPI Grid */}
        <div className="grid grid-cols-4 gap-2">
          {kpis.map((kpi, i) => (
            <div key={i} className="bg-[#161b27] border border-[#1f2937] rounded-xl p-3 relative group overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] uppercase font-bold tracking-wider" style={{ color: kpi.color }}>{kpi.label}</span>
                <div className="w-5 h-5 rounded-full flex items-center justify-center bg-white/5">
                  {kpi.label.includes('Depósitos') ? <TrendingUp className="h-3 w-3" style={{ color: kpi.color }} /> : <TrendingDown className="h-3 w-3" style={{ color: kpi.color }} />}
                </div>
              </div>
              <div className="text-[18px] font-bold text-white tabular-nums">R$ {kpi.value.toLocaleString('pt-BR')}</div>
              {kpi.isCrypto && (
                <div className="text-[9px] text-[#4b5563] mt-0.5 italic">≈ convertido p/ BRL</div>
              )}
              <div className="absolute bottom-0 left-0 h-[2px] bg-current opacity-30 transition-all duration-700" style={{ width: `${kpi.pct}%`, color: kpi.color }} />
            </div>
          ))}
        </div>

        {/* Liquid Flow Bar */}
        <div className="bg-[#161b27] border border-[#1f2937] rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <span className="text-[9px] uppercase font-bold text-[#4b5563] mb-0.5">Fluxo BRL</span>
              <span className={cn("text-[13px] font-bold font-mono", fluxoBRL >= 0 ? "text-[#22c55e]" : "text-[#ef4444]")}>
                {fluxoBRL >= 0 ? "+" : ""}R$ {Math.abs(fluxoBRL).toLocaleString('pt-BR')}
              </span>
            </div>
            <div className="w-[1px] h-6 bg-[#1f2937]" />
            <div className="flex flex-col">
              <span className="text-[9px] uppercase font-bold text-[#4b5563] mb-0.5">Fluxo Crypto</span>
              <span className={cn("text-[13px] font-bold font-mono", fluxoCrypto >= 0 ? "text-[#22d3ee]" : "text-[#ef4444]")}>
                {fluxoCrypto >= 0 ? "+" : ""}R$ {Math.abs(fluxoCrypto).toLocaleString('pt-BR')}
              </span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[9px] uppercase font-bold text-[#4b5563] block mb-0.5">Saldo Total</span>
            <span className={cn("text-[18px] font-bold font-mono", saldoTotal >= 0 ? "text-[#22c55e]" : "text-[#ef4444]")}>
              {saldoTotal >= 0 ? "+" : "−"}R$ {Math.abs(saldoTotal).toLocaleString('pt-BR')}
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex justify-center gap-6">
          {[
            { label: 'Depósitos BRL', color: '#22c55e' },
            { label: 'Depósitos Crypto', color: '#22d3ee' },
            { label: 'Saques BRL', color: '#f472b6' },
            { label: 'Saques Crypto', color: '#818cf8' },
          ].map((item, i) => (
            <button
              key={i}
              onClick={() => toggleDataset(i)}
              className={cn(
                "flex items-center gap-2 transition-opacity",
                !datasetVisibility[i] && "opacity-30"
              )}
            >
              <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: item.color }} />
              <span className="text-[11px] font-medium text-[#6b7280]">{item.label}</span>
            </button>
          ))}
        </div>

        {/* Chart Area */}
        <div className="relative h-[300px] w-full">
          <canvas ref={chartRef} />
          <div
            ref={tooltipRef}
            id="cashflow-tooltip"
            className="absolute pointer-events-none opacity-0 transition-opacity duration-150 z-[100] bg-[#12161f] border border-[#2d3748] rounded-xl p-3 min-w-[220px] shadow-2xl"
          />
        </div>

        <p className="text-[10px] text-[#374151] italic text-center">
          "Valores em crypto convertidos para R$ pela cotação de cada dia. A altura das barras reflete valor real em BRL — barras de moedas diferentes são diretamente comparáveis."
        </p>
      </CardContent>

      <AjusteManualDialog open={isAjusteOpen} onClose={() => setIsAjusteOpen(false)} onSuccess={() => {}} />
      <ReconciliacaoDialog open={isReconciliacaoOpen} onClose={() => setIsReconciliacaoOpen(false)} onSuccess={() => {}} />
      <ReportarScanDialog open={isScanOpen} onClose={() => setIsScanOpen(false)} onSuccess={() => {}} />
    </Card>
  );
}
