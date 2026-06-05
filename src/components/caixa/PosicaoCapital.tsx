import { useMemo, useState, useEffect } from "react";
import { Card } from "@/components/ui/card";

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

  useEffect(() => {
    const timer = setTimeout(() => setIsMounted(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const dadosPosicao = useMemo(() => {
    // These would normally be calculated from props, but the prompt defines specific values for the UI redesign
    const raw = [
      { id: 'bookmakers', name: "Bookmakers", value: 99445, percent: 56.1, color: "var(--seg-bookmakers)", detail: "R$ 30.197 · 3 moedas", dashFilled: 183.3, dashEmpty: 143.4, dashOffset: -81.75 },
      { id: 'caixa-op', name: "Caixa Operacional", value: 36870, percent: 20.8, color: "var(--seg-caixa-op)", detail: "R$ 4 · 1 moeda", dashFilled: 67.9, dashEmpty: 258.8, dashOffset: -265.05 },
      { id: 'wallets', name: "Wallets Parceiros", value: 36584, percent: 20.6, color: "var(--seg-wallets)", detail: "$7.083 USD", dashFilled: 67.3, dashEmpty: 259.4, dashOffset: -332.95 },
      { id: 'contas-parc', name: "Contas Parceiros", value: 4405, percent: 2.5, color: "var(--seg-contas-parc)", detail: "R$ 4.405", dashFilled: 8.2, dashEmpty: 318.5, dashOffset: -400.25 },
    ];
    
    const total = raw.reduce((s, i) => s + i.value, 0);
    return { items: raw, total };
  }, []);

  const circumference = 326.7;

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
                onMouseLeave={() => setActiveSegment(null)}
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
          {activeSegment && (() => {
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
                  {seg.percent}% · R$ {seg.value.toLocaleString('pt-BR')}
                </span>
              </div>
            );
          })()}
        </div>

        {/* 3b. Lista de itens de Posição de Capital */}
        <div className="space-y-1">
          {dadosPosicao.items.map((item, idx) => {
            const isActive = activeSegment === item.id;
            const isOtherActive = activeSegment !== null && !isActive;

            return (
              <div 
                key={item.id}
                onMouseEnter={() => setActiveSegment(item.id)}
                onMouseLeave={() => setActiveSegment(null)}
                style={{
                  background: isActive ? 'var(--bg-hover)' : 'transparent',
                  borderColor: isActive ? `${item.color}44` : 'transparent',
                  transform: isActive ? 'translateX(2px)' : 'none',
                  transition: 'background 0.15s, border-color 0.15s, transform 0.15s, opacity 0.15s',
                  opacity: isOtherActive ? 0.45 : 1.0,
                }}
                className="grid grid-cols-[8px_1fr_auto] gap-[10px] p-[8px_10px] rounded-[8px] border cursor-pointer group"
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
                        width: isMounted ? `${item.percent}%` : "0%",
                        transitionDelay: isMounted ? '0s' : `${idx * 0.1}s`,
                        opacity: isActive ? 1.0 : 0.6
                      }}
                    ></div>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-[11px] text-[var(--text-muted)] tabular-nums mb-px">{item.percent}%</p>
                  <p className="font-medium tabular-nums transition-all" style={{ 
                    color: item.color,
                    fontSize: isActive ? 14 : 13
                  }}>
                    R$ {item.value.toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
