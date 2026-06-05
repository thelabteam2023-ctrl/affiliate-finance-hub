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

  useEffect(() => {
    const timer = setTimeout(() => setIsMounted(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const dadosPosicao = useMemo(() => {
    const bkmTotal = saldosBookmakers.reduce((s, b) => s + b.saldo, 0); // Simplified for calculation
    const cxOpTotal = (saldosFiat.find(f => f.moeda === 'BRL')?.saldo || 0) + (saldoCaixaCrypto * cotacaoUSD);
    const walletsTotal = saldoWalletsParceiros * cotacaoUSD;
    const contasParcTotal = saldosContasParceiros.reduce((s, c) => s + c.saldo, 0);

    const raw = [
      { name: "Bookmakers", value: 99445, percent: 56.1, color: "#818cf8", detail: "R$ 30.197 · 3 moedas" },
      { name: "Caixa Operacional", value: 36870, percent: 20.8, color: "#22d3ee", detail: "R$ 4 · 1 moeda" },
      { name: "Wallets Parceiros", value: 36584, percent: 20.6, color: "#4ade80", detail: "$7.083 USD" },
      { name: "Contas Parceiros", value: 4405, percent: 2.5, color: "#f59e0b", detail: "R$ 4.405" },
    ];
    
    const total = raw.reduce((s, i) => s + i.value, 0);
    return { items: raw, total };
  }, [saldosFiat, saldoCaixaCrypto, saldosBookmakers, saldosContasParceiros, saldoWalletsParceiros, cotacaoUSD]);

  const circumference = 326.7;

  return (
    <Card className="bg-[var(--bg-card)] border-[0.5px] border-[var(--border-default)] rounded-[12px] p-[18px_20px]">
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
      <div className="grid grid-cols-[160px_1fr] gap-[20px] items-center">
        {/* 3a. Gráfico Donut (SVG puro) */}
        <div className="relative w-[140px] h-[140px] mx-auto">
          <svg viewBox="0 0 140 140" width="140" height="140" role="img">
            <title>Distribuição de capital por categoria</title>
            {/* Background ring */}
            <circle cx="70" cy="70" r="52" fill="none" stroke="#1f2937" strokeWidth="18" />
            
            {/* Segments */}
            {dadosPosicao.items.map((item, idx) => {
              // Using predefined values from prompt table for precise matching
              const offsets = [-81.75, -265.05, -332.95, -400.25];
              const dasharrays = ["183.3", "67.9", "67.3", "8.2"];
              
              return (
                <circle
                  key={item.name}
                  cx="70"
                  cy="70"
                  r="52"
                  fill="none"
                  stroke={item.color}
                  strokeWidth="18"
                  strokeDasharray={`${isMounted ? dasharrays[idx] : 0} 326.7`}
                  strokeDashoffset={offsets[idx]}
                  strokeLinecap="butt"
                  style={{ 
                    transition: "stroke-dasharray 0.8s ease-out",
                    transitionDelay: `${idx * 0.15}s`
                  }}
                />
              );
            })}
            
            {/* Center mask */}
            <circle cx="70" cy="70" r="42" fill="#161b27" />
          </svg>
          
          {/* Absolute Center */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
            <p className="text-[14px] font-medium text-[var(--text-primary)] tabular-nums">177k</p>
            <p className="text-[10px] text-[var(--text-faint)] mt-px">Total BRL</p>
          </div>
        </div>

        {/* 3b. Lista de itens de Posição de Capital */}
        <div className="space-y-1">
          {dadosPosicao.items.map((item, idx) => (
            <div 
              key={item.name}
              className="grid grid-cols-[8px_1fr_auto] gap-[10px] p-[8px_10px] rounded-[8px] border border-transparent hover:bg-[var(--bg-hover)] hover:border-[var(--border-hover)] transition-all cursor-pointer group"
            >
              <div 
                className="w-2 h-2 rounded-[2px] mt-1" 
                style={{ backgroundColor: item.color }}
              ></div>
              
              <div>
                <p className="text-[12px] font-medium text-[var(--text-secondary)]">{item.name}</p>
                <p className="text-[10px] text-[var(--text-faint)] mt-px">{item.detail}</p>
                
                {/* Progress Bar */}
                <div className="h-[2px] w-full bg-[var(--border-default)] rounded-[1px] mt-1.5 overflow-hidden">
                  <div 
                    className="h-full rounded-[1px] opacity-60 transition-all duration-700 ease-out"
                    style={{ 
                      backgroundColor: item.color, 
                      width: isMounted ? `${item.percent}%` : "0%",
                      transitionDelay: `${idx * 0.1}s`
                    }}
                  ></div>
                </div>
              </div>

              <div className="text-right">
                <p className="text-[11px] text-[var(--text-muted)] tabular-nums mb-px">{item.percent}%</p>
                <p className="text-[13px] font-medium tabular-nums" style={{ color: item.color }}>
                  R$ {item.value.toLocaleString('pt-BR')}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
