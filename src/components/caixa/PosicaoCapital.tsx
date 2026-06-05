import { useMemo, useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface BreakdownEntry {
  id: string;              
  label: string;           
  currency: string;        
  amount: number;          
  amountFormatted: string; 
  amountBRL: number;       
  amountBRLFormatted: string; 
  pctOfSegment: number;    
}

interface CapitalSegment {
  id: string;
  name: string;
  color: string;
  pct: number;             
  value: number;
  valueFormatted: string;  
  detail: string;
  dashFilled: number;
  dashEmpty: number;
  dashOffset: number;
  breakdown: BreakdownEntry[];
}

interface PosicaoCapitalProps {
  saldosFiat: Array<{ moeda: string; saldo: number }>;
  saldoCaixaCrypto: number;
  saldosBookmakers: Array<{ moeda: string; saldo: number }>;
  saldosBroker: Array<{ moeda: string; saldo: number }>;
  saldosContasParceiros: Array<{ moeda: string; saldo: number }>;
  saldoWalletsParceiros: number;
  cotacaoUSD: number;
  onViewPerdas?: () => void;
}

const CURRENCY_COLORS: Record<string, { bg: string, color: string }> = {
  BRL:  { bg: '#0c2a1a', color: '#22c55e' },
  ETH:  { bg: '#0e2d36', color: '#0e7490' },
  USDC: { bg: '#0c2a1a', color: '#22c55e' },
  USDT: { bg: '#0c2a1a', color: '#22c55e' },
  BTC:  { bg: '#1a1a0a', color: '#eab308' },
  LTC:  { bg: '#1a1f2a', color: '#94a3b8' },
  USD:  { bg: '#0a1a2a', color: '#22d3ee' },
};

function CurrencyTag({ currency }: { currency: string }) {
  const cfg = CURRENCY_COLORS[currency] ?? { bg: '#161b27', color: '#6b7280' };
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 10,
      fontWeight: 600,
      padding: '2px 6px',
      borderRadius: 4,
      background: cfg.bg,
      color: cfg.color,
      minWidth: 36,
    }}>
      {currency}
    </span>
  );
}

function BreakdownRow({ entry, segmentColor }: { entry: BreakdownEntry, segmentColor: string }) {
  return (
    <div className="flex items-center gap-3 py-2 px-2 hover:bg-[var(--bg-hover)] rounded-md transition-colors group/row">
      <CurrencyTag currency={entry.currency} />
      
      <span className="text-[11px] text-[var(--text-secondary)] flex-1 truncate">
        {entry.label}
      </span>

      <div className="text-right shrink-0">
        <p className="text-[11px] font-medium text-[var(--text-primary)] tabular-nums">
          {entry.amountFormatted}
        </p>
        <p className="text-[9px] text-[var(--text-faint)] tabular-nums">
          {entry.currency !== 'BRL' ? `≈ R$ ${entry.amountBRLFormatted}` : `R$ ${entry.amountBRLFormatted}`}
        </p>
      </div>
    </div>
  );
}

export function PosicaoCapital({
  saldosFiat,
  saldoCaixaCrypto,
  saldosBookmakers,
  saldosBroker,
  saldosContasParceiros,
  saldoWalletsParceiros,
  cotacaoUSD,
  onViewPerdas,
}: PosicaoCapitalProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [activeSegment, setActiveSegment] = useState<string | null>(null);
  const [expandedSegment, setExpandedSegment] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setIsMounted(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Sincronizar activeSegment com expandedSegment
  useEffect(() => {
    if (expandedSegment) {
      setActiveSegment(expandedSegment);
    }
  }, [expandedSegment]);

  const handleSegmentClick = (id: string) => {
    setExpandedSegment(prev => prev === id ? null : id);
  };

  const dadosPosicao = useMemo(() => {
    // Definimos os valores base de cada segmento
    const rawItems = [
      { 
        id: 'bookmakers', 
        name: "Bookmakers", 
        color: "var(--seg-bookmakers)", 
        breakdown: [
          {
            id: 'brl',
            label: 'Real Brasileiro',
            currency: 'BRL',
            amount: 30197,
            amountFormatted: 'R$ 30.197,00',
            amountBRL: 30197,
            amountBRLFormatted: '30.197,00',
          },
          {
            id: 'usdc',
            label: 'Dólar (USDC)',
            currency: 'USDC',
            amount: 13800,
            amountFormatted: 'US$ 13.800,00',
            amountBRL: 69248,
            amountBRLFormatted: '69.248,00',
          }
        ]
      },
      { 
        id: 'caixa-op', 
        name: "Caixa Operacional", 
        color: "var(--seg-caixa-op)", 
        breakdown: [
          {
            id: 'caixa-fiat',
            label: 'Conta Principal (FIAT)',
            currency: 'BRL',
            amount: 4.20,
            amountFormatted: 'R$ 4,20',
            amountBRL: 4.20,
            amountBRLFormatted: '4,20',
          },
          {
            id: 'caixa-crypto',
            label: 'Exposição Crypto (Total)',
            currency: 'USD',
            amount: 7137.92,
            amountFormatted: 'US$ 7.137,92',
            amountBRL: 36865.80,
            amountBRLFormatted: '36.865,80',
          }
        ]
      },
      { 
        id: 'wallets', 
        name: "Wallets Parceiros", 
        color: "var(--seg-wallets)", 
        breakdown: [
          {
            id: 'wallets-total',
            label: 'Carteiras de Parceiros',
            currency: 'USD',
            amount: 7083,
            amountFormatted: 'US$ 7.083,00',
            amountBRL: 36584,
            amountBRLFormatted: '36.584,00',
          }
        ]
      },
      { 
        id: 'contas-parc', 
        name: "Contas Parceiros", 
        color: "var(--seg-contas-parc)", 
        breakdown: [
          {
            id: 'banco-parc',
            label: 'Saldos Bancários (Parceiros)',
            currency: 'BRL',
            amount: 4405,
            amountFormatted: 'R$ 4.405,00',
            amountBRL: 4405,
            amountBRLFormatted: '4.405,00',
          }
        ]
      },
    ];

    // Cálculo dinâmico para evitar discrepâncias manuais
    const CIRCUMFERENCE = 2 * Math.PI * 52; // Aproximadamente 326.7
    const totalBRL = rawItems.reduce((acc, item) => 
      acc + item.breakdown.reduce((bAcc, b) => bAcc + b.amountBRL, 0), 0
    );

    let currentOffset = -90; // Começamos do topo (-90 graus)
    const items: CapitalSegment[] = rawItems.map(item => {
      const segmentValue = item.breakdown.reduce((acc, b) => acc + b.amountBRL, 0);
      const pct = (segmentValue / totalBRL) * 100;
      
      const dashFilled = (pct / 100) * CIRCUMFERENCE;
      const dashEmpty = CIRCUMFERENCE - dashFilled;
      
      // O offset no SVG stroke-dashoffset funciona invertido em relação à rotação
      // Calculamos o offset baseando-se no preenchimento acumulado
      const dashOffset = -((currentOffset + 90) / 360) * CIRCUMFERENCE;
      
      const segment: CapitalSegment = {
        id: item.id,
        name: item.name,
        color: item.color,
        value: segmentValue,
        valueFormatted: `R$ ${Math.round(segmentValue).toLocaleString('pt-BR')}`,
        pct: Number(pct.toFixed(1)),
        detail: item.id === 'bookmakers' 
          ? `R$ ${Math.round(item.breakdown[0].amount).toLocaleString('pt-BR')} · ${item.breakdown.length} moedas`
          : item.id === 'caixa-op'
          ? `R$ ${Math.round(item.breakdown[0].amount).toLocaleString('pt-BR')} · ${item.breakdown.length} moedas`
          : item.id === 'wallets'
          ? `$${Math.round(item.breakdown[0].amount).toLocaleString('pt-BR')} USD`
          : `R$ ${Math.round(segmentValue).toLocaleString('pt-BR')}`,
        dashFilled,
        dashEmpty,
        dashOffset: -( ( (totalBRL - segmentValue) / 2 ) / totalBRL ) * CIRCUMFERENCE, // Placeholder temporário
        breakdown: item.breakdown.map(b => ({
          ...b,
          pctOfSegment: Number(((b.amountBRL / segmentValue) * 100).toFixed(2))
        }))
      };

      return segment;
    });

    // Re-calculamos os offsets corretamente para que os segmentos fiquem encostados
    let cumulativePct = 0;
    items.forEach((item, index) => {
      // O stroke-dashoffset do SVG começa no ponto (1,0) - 3 horas.
      // Para começar no topo (12 horas), subtraímos 25% (90 graus) da circunferência.
      const startPct = cumulativePct;
      item.dashOffset = -((startPct / 100) * CIRCUMFERENCE) + (0.25 * CIRCUMFERENCE);
      cumulativePct += item.pct;
    });

    return { items, total: totalBRL };
  }, []);


  return (
    <Card className="bg-[var(--bg-card)] border-[0.5px] border-[var(--border-default)] rounded-[12px] p-[18px_20px] overflow-visible">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <i className="ti ti-chart-donut text-sm" style={{ color: "var(--accent-success)" }}></i>
          <span className="text-[13px] font-medium text-[var(--text-secondary)]">Posição de Capital</span>
        </div>
        <span className="text-[18px] font-medium text-[var(--text-primary)] tabular-nums">
          R$ {dadosPosicao.total.toLocaleString('pt-BR')}
        </span>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-[160px_1fr] gap-[20px] items-start">
        {/* 3a. Gráfico Donut (SVG puro) */}
        <div className="relative w-[140px] h-[140px] mx-auto group/donut">
          <svg viewBox="0 0 140 140" width="140" height="140" role="img" className="overflow-visible">
            <title>Distribuição de capital por categoria</title>
            {/* Background ring */}
            <circle cx="70" cy="70" r="52" fill="none" stroke="var(--border-default)" strokeWidth="18" />
            
            {/* Segments */}
            {dadosPosicao.items.map((item, idx) => {
              const isActive = activeSegment === item.id;
              const isOtherActive = activeSegment !== null && !isActive;
              
              return (
                <circle
                  key={item.id}
                  cx="70"
                  cy="70"
                  r="52"
                  fill="none"
                  stroke={item.color}
                  strokeWidth={isActive ? 22 : 18}
                  strokeDasharray={`${isMounted ? item.dashFilled : 0} 326.7`}
                  strokeDashoffset={item.dashOffset}
                  strokeLinecap="butt"
                  style={{ 
                    transition: "stroke-dasharray 0.8s ease-out, stroke-width 0.15s ease, opacity 0.15s ease",
                    transitionDelay: isMounted ? '0s' : `${idx * 0.15}s`,
                    opacity: isOtherActive ? 0.35 : 1.0
                  }}
                />
              );
            })}
            
            {/* Hit Areas (Invisíveis) */}
            {dadosPosicao.items.map((item) => (
              <circle
                key={item.id + '-hit'}
                cx="70" cy="70" r="52"
                fill="none"
                stroke="transparent"
                strokeWidth="24"
                strokeDasharray={`${item.dashFilled} 326.7`}
                strokeDashoffset={item.dashOffset}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setActiveSegment(item.id)}
                onMouseLeave={() => {
                  if (!expandedSegment) {
                    setActiveSegment(null);
                  }
                }}
                onClick={() => handleSegmentClick(item.id)}
              />
            ))}
            
            {/* Center mask */}
            <circle cx="70" cy="70" r="42" fill="var(--bg-card)" />
          </svg>
          
          {/* Absolute Center */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
            <p className="text-[14px] font-medium text-[var(--text-primary)] tabular-nums">177k</p>
            <p className="text-[10px] text-[var(--text-faint)] mt-px">Total BRL</p>
          </div>

          {/* Tooltip do donut */}
          {(activeSegment && !expandedSegment) && (() => {
            const seg = dadosPosicao.items.find(s => s.id === activeSegment);
            if (!seg) return null;
            return (
              <div className="absolute top-[148px] left-1/2 -translate-x-1/2 z-50 whitespace-nowrap" style={{
                padding: '6px 12px',
                background: '#1a2030',
                border: '0.5px solid #2d3748',
                borderRadius: 8,
                fontSize: 12,
                textAlign: 'center',
                transition: 'opacity 0.15s',
              }} role="tooltip">
                <span style={{ color: seg.color, fontWeight: 500 }}>
                  {seg.name}
                </span>
                <span className="text-[var(--text-muted)] ml-2">
                  {seg.pct}% · {seg.valueFormatted}
                </span>
              </div>
            );
          })()}
        </div>

        {/* 3b. Lista de itens de Posição de Capital */}
        <div className="space-y-1">
          {dadosPosicao.items.map((item, idx) => {
            const isActive = activeSegment === item.id;
            const isExpanded = expandedSegment === item.id;
            const isOtherActive = activeSegment !== null && !isActive;

            return (
              <div key={item.id} className="flex flex-col">
                <div 
                  onMouseEnter={() => setActiveSegment(item.id)}
                  onMouseLeave={() => {
                    if (!expandedSegment) {
                      setActiveSegment(null);
                    }
                  }}
                  onClick={() => handleSegmentClick(item.id)}
                  style={{
                    background: isActive ? 'var(--bg-hover)' : 'transparent',
                    borderColor: isActive ? `${item.color}44` : 'transparent',
                    transform: isActive ? 'translateX(2px)' : 'none',
                    transition: 'background 0.15s, border-color 0.15s, transform 0.15s, opacity 0.15s',
                    opacity: isOtherActive ? 0.45 : 1.0,
                  }}
                  className="grid grid-cols-[8px_1fr_auto_auto] gap-[10px] p-[8px_10px] rounded-[8px] border cursor-pointer group"
                >
                  <div 
                    className="rounded-[2px] mt-1" 
                    style={{ 
                      backgroundColor: item.color,
                      width: isActive ? 10 : 8,
                      height: isActive ? 10 : 8,
                      transition: 'width 0.15s, height 0.15s'
                    }}
                  ></div>
                  
                  <div>
                    <p className={`text-[12px] font-medium transition-colors ${isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>{item.name}</p>
                    <p className="text-[10px] text-[var(--text-faint)] mt-px">{item.detail}</p>
                    
                    {/* Progress Bar */}
                    <div className="h-[2px] w-full bg-[var(--border-default)] rounded-[1px] mt-1.5 overflow-hidden">
                      <div 
                        className="h-full rounded-[1px] transition-all duration-700 ease-out"
                        style={{ 
                          backgroundColor: item.color, 
                          width: isMounted ? `${item.pct}%` : "0%",
                          transitionDelay: isMounted ? '0s' : `${idx * 0.1}s`,
                          opacity: isActive ? 1.0 : 0.6
                        }}
                      ></div>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-[11px] text-[var(--text-muted)] tabular-nums mb-px">{item.pct}%</p>
                    <p className="font-medium tabular-nums transition-all" style={{ 
                      color: item.color,
                      fontSize: isActive ? 14 : 13
                    }}>
                      {item.valueFormatted}
                    </p>
                  </div>

                  <div className="flex items-center justify-center pl-1">
                    <i 
                      className={cn(
                        "ti ti-chevron-right text-[12px] text-[var(--text-faint)] transition-transform duration-200",
                        isExpanded && "rotate-90"
                      )}
                    ></i>
                  </div>
                </div>

                {/* Painel de breakdown inline */}
                {isExpanded && (
                  <div 
                    style={{
                      animation: 'expand-down 0.2s ease-out forwards',
                      background: 'rgba(22, 27, 39, 0.4)',
                      borderLeft: `2px solid ${item.color}`,
                    }}
                    className="mt-1 mb-2 mx-[10px] rounded-r-lg overflow-hidden"
                  >
                    <div className="p-3 border-l border-white/5 bg-white/[0.02]">
                      <div className="flex items-center justify-between mb-3 px-2">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                          Composição de {item.name}
                        </span>
                      </div>

                      <div className="space-y-0.5">
                        {item.breakdown.map(entry => (
                          <BreakdownRow 
                            key={entry.id} 
                            entry={entry} 
                            segmentColor={item.color} 
                          />
                        ))}
                      </div>

                      <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between px-2">
                        <span className="text-[11px] font-medium text-[var(--text-faint)]">Total</span>
                        <span className="text-[12px] font-semibold text-[var(--text-primary)] tabular-nums">
                          {item.valueFormatted}
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
    </Card>
  );
}
