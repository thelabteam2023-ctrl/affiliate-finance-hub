import { useMemo, useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useCotacoes } from "@/hooks/useCotacoes";

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
  colorHex: string;
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

const isDev = process.env.NODE_ENV === 'development';

const DONUT_COLORS: Record<string, string> = {
  'bookmakers':  '#818cf8',
  'caixa-op':    '#22d3ee',
  'wallets':     '#4ade80',
  'contas-parc': '#f59e0b',
};

const CURRENCY_COLORS: Record<string, { bg: string, color: string }> = {
  BRL:  { bg: '#0c2a1a', color: '#22c55e' },
  ETH:  { bg: '#0e2d36', color: '#0e7490' },
  USDC: { bg: '#0c2a1a', color: '#22c55e' },
  USDT: { bg: '#0c2a1a', color: '#22c55e' },
  BTC:  { bg: '#1a1a0a', color: '#eab308' },
  LTC:  { bg: '#1a1f2a', color: '#94a3b8' },
  USD:  { bg: '#0a1a2a', color: '#22d3ee' },
  EUR:  { bg: '#1a1a2a', color: '#818cf8' },
  MYR:  { bg: '#2a1a0a', color: '#f59e0b' },
};

const CURRENCY_LABELS: Record<string, string> = {
  BRL: 'Real Brasileiro',
  USD: 'Dólar Americano',
  EUR: 'Euro',
  MYR: 'Ringgit Malaio',
  USDT: 'Dólar (USDT)',
  USDC: 'Dólar (USDC)',
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  LTC: 'Litecoin',
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

    const CIRCUMFERENCE = 2 * Math.PI * 52; // Aproximadamente 326.7256

    // 1. Validar e filtrar segmentos
    const validRawItems = rawItems.filter(item => {
      const segmentValue = item.breakdown.reduce((acc, b) => acc + b.amountBRL, 0);
      if (segmentValue <= 0) {
        console.warn(`Segmento "${item.id}" omitido: valor ${segmentValue} <= 0`);
        return false;
      }
      if (!item.color) {
        console.warn(`Segmento "${item.id}" omitido: cor não definida`);
        return false;
      }
      return true;
    });

    // 2. Calcular total real
    const totalBRL = validRawItems.reduce((acc, item) => 
      acc + item.breakdown.reduce((bAcc, b) => bAcc + b.amountBRL, 0), 0
    );

    // 3. Gerar segmentos com percentuais precisos
    let items: CapitalSegment[] = validRawItems.map(item => {
      const segmentValue = item.breakdown.reduce((acc, b) => acc + b.amountBRL, 0);
      const pct = (segmentValue / totalBRL) * 100;
      
      return {
        id: item.id,
        name: item.name,
        color: item.color,
        colorHex: DONUT_COLORS[item.id] || '#6b7280',
        value: segmentValue,
        valueFormatted: `R$ ${Math.round(segmentValue).toLocaleString('pt-BR')}`,
        pct: pct, 
        detail: item.id === 'bookmakers' 
          ? `R$ ${Math.round(item.breakdown[0].amount).toLocaleString('pt-BR')} · ${item.breakdown.length} moedas`
          : item.id === 'caixa-op'
          ? `R$ ${Math.round(item.breakdown[0].amount).toLocaleString('pt-BR')} · ${item.breakdown.length} moedas`
          : item.id === 'wallets'
          ? `$${Math.round(item.breakdown[0].amount).toLocaleString('pt-BR')} USD`
          : `R$ ${Math.round(segmentValue).toLocaleString('pt-BR')}`,
        dashFilled: (pct / 100) * CIRCUMFERENCE,
        dashEmpty: CIRCUMFERENCE - ((pct / 100) * CIRCUMFERENCE),
        dashOffset: 0,
        breakdown: item.breakdown.map(b => ({
          ...b,
          pctOfSegment: Number(((b.amountBRL / segmentValue) * 100).toFixed(2))
        }))
      };
    });

    // 4. Normalizar para exatos 100% (distribuindo o resíduo no maior segmento)
    if (items.length > 0) {
      const currentSum = items.reduce((acc, s) => acc + s.pct, 0);
      const diff = 100 - currentSum;
      
      const largest = items.reduce((a, b) => a.pct > b.pct ? a : b);
      largest.pct += diff;
      
      // Recalcular dash values com o percentual normalizado
      items.forEach(s => {
        s.dashFilled = (s.pct / 100) * CIRCUMFERENCE;
        s.dashEmpty = CIRCUMFERENCE - s.dashFilled;
      });
    }

    // 5. Calcular offsets
    let cumulativePct = 0;
    items.forEach((item) => {
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
      <div className="grid grid-cols-[176px_1fr] gap-[24px] items-start">
        {/* 3a. Gráfico Donut (SVG puro com Arcos Manuais) */}
        <div className="relative w-[154px] h-[154px] mx-auto group/donut">
          <svg viewBox="0 0 154 154" width="154" height="154" role="img" className="overflow-visible">
            <title>Distribuição de capital por categoria</title>
            
            {/* Background ring */}
            <circle cx="77" cy="77" r="57" fill="none" stroke="var(--border-default)" strokeWidth="20" />
            
            {/* Segments - Rendered using SVG Paths for precision */}
            {(() => {
              let currentAngle = -90; // Start at top
              const radius = 57;
              const centerX = 77;
              const centerY = 77;
              const gapAngle = 3; // Visual gap between segments in degrees

              return dadosPosicao.items.map((item, idx) => {
                const isActive = activeSegment === item.id;
                const isOtherActive = activeSegment !== null && !isActive;
                
                // Calculate angles
                const segmentAngle = (item.pct / 100) * 360;
                
                // If segment is too small, don't show gap or handle carefully
                const actualGap = segmentAngle > gapAngle ? gapAngle : 0;
                const startAngle = currentAngle + (actualGap / 2);
                const endAngle = currentAngle + segmentAngle - (actualGap / 2);
                
                // Update tracker for next segment
                currentAngle += segmentAngle;

                // SVG Arc calculation
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
                    key={item.id}
                    d={d}
                    fill="none"
                    stroke={item.colorHex}
                    strokeWidth={isActive ? 24 : 20}
                    strokeLinecap="butt"
                    className="cursor-pointer"
                    style={{ 
                      transition: "stroke-width 0.2s ease, opacity 0.2s ease, stroke 0.2s ease",
                      opacity: isOtherActive ? 0.35 : 1.0,
                      filter: isActive ? 'drop-shadow(0 0 4px rgba(0,0,0,0.2))' : 'none'
                    }}
                    onMouseEnter={() => setActiveSegment(item.id)}
                    onMouseLeave={() => {
                      if (!expandedSegment) setActiveSegment(null);
                    }}
                    onClick={() => handleSegmentClick(item.id)}
                  />
                );
              });
            })()}
            
            {/* Center mask */}
            <circle cx="77" cy="77" r="46" fill="var(--bg-card)" />
          </svg>
          
          {/* Absolute Center */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
            <p className="text-[15px] font-bold text-[var(--text-primary)] tabular-nums">
              {Math.round(dadosPosicao.total / 1000)}k
            </p>
            <p className="text-[10px] text-[var(--text-faint)] mt-px uppercase tracking-wider font-semibold">Total BRL</p>
          </div>
        </div>

        {/* 3b. Lista de itens de Posição de Capital */}
        <div className="space-y-1 relative pt-2">
          {/* Tooltip do donut (centralizado em relação ao donut) */}
          {(activeSegment && !expandedSegment) && (() => {
            const seg = dadosPosicao.items.find(s => s.id === activeSegment);
            if (!seg) return null;
            return (
              <div className="absolute top-[148px] left-[-90px] -translate-x-1/2 z-[60] whitespace-nowrap pointer-events-none" style={{
                padding: '6px 12px',
                background: '#1a2030',
                border: '0.5px solid #2d3748',
                borderRadius: 8,
                fontSize: 12,
                textAlign: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                transition: 'opacity 0.15s',
              }} role="tooltip">
                <span style={{ color: seg.color, fontWeight: 500 }}>
                  {seg.name}
                </span>
                <span className="text-[var(--text-muted)] ml-2">
                  {seg.pct.toFixed(2)}% · {seg.valueFormatted}
                </span>
              </div>
            );
          })()}


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
                    <p className="text-[11px] text-[var(--text-muted)] tabular-nums mb-px">{item.pct.toFixed(2)}%</p>
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
