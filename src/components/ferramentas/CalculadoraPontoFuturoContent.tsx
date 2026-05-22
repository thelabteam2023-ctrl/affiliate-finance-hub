import React, { useState, useMemo } from 'react';
import { Calculator, Target, TrendingUp, Clock, Info, ArrowRight, DollarSign, Percent } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export const CalculadoraPontoFuturoContent: React.FC = () => {
  // Inputs
  const [oddLay, setOddLay] = useState<string>('2.10');
  const [valorProtecao, setValorProtecao] = useState<string>('100');
  const [comissao, setComissao] = useState<string>('5');
  const [lucroDesejado, setLucroDesejado] = useState<number[]>([0]);

  const parseNum = (v: string) => {
    const n = parseFloat(v.replace(',', '.'));
    return isNaN(n) ? 0 : n;
  };

  const results = useMemo(() => {
    const ol = parseNum(oddLay);
    const vp = parseNum(valorProtecao);
    const comm = parseNum(comissao) / 100;
    const targetLucroPct = lucroDesejado[0] / 100;

    if (ol <= 1 || vp <= 0) return null;

    /**
     * Lógica Matemática:
     * 1. Se o evento NÃO ocorre (Ganha na Exchange):
     *    Lucro = StakeLay * (1 - Comissao) - ValorProtecao
     * 
     * 2. Queremos que esse Lucro seja igual ao (Custo Total * LucroDesejado) + Custo Total ? 
     *    Ou simplificando para o objetivo operacional:
     *    StakeLay = (ValorProtecao * (1 + targetLucroPct)) / (1 - Comissao)
     */
    
    // Stake Ideal do Lay Inicial
    const stakeLay = (vp * (1 + targetLucroPct)) / (1 - comm);
    
    // Liability
    const liability = stakeLay * (ol - 1);
    
    /**
     * 3. Se o evento OCORRE (Ganha na Bookmaker):
     *    Lucro = ValorProtecao * (OddFutura - 1) - Liability
     *    Para manter o lucro desejado sobre o valor da proteção:
     *    ValorProtecao * (OddFutura - 1) - Liability = ValorProtecao * targetLucroPct
     *    OddFutura - 1 = (ValorProtecao * targetLucroPct + Liability) / ValorProtecao
     *    OddFutura = 1 + targetLucroPct + (Liability / ValorProtecao)
     */
    const oddFutura = 1 + targetLucroPct + (liability / vp);
    
    const lucroLiquido = vp * targetLucroPct;
    const roi = (lucroLiquido / (liability + vp)) * 100; // ROI sobre o capital total exposto

    // Cálculo de Ticks (Simplificado para decimais padrão)
    const ticks = Math.round((oddFutura - ol) * 100);
    
    // Spread Efetivo (Eficiência)
    const spreadEfetivo = (1 / ol) + (1 / oddFutura);

    return {
      stakeLay,
      oddFutura,
      liability,
      lucroLiquido,
      roi,
      ticks,
      spreadEfetivo
    };
  }, [oddLay, valorProtecao, comissao, lucroDesejado]);

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Painel de Entradas */}
        <Card className="border-border/50 bg-muted/20 backdrop-blur-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Parâmetros de Entrada
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="oddLay" className="text-xs text-muted-foreground flex items-center gap-1">
                Odd Lay Atual
                <InfoTooltip text="Odd atual na Exchange onde será feita a entrada inicial." />
              </Label>
              <div className="relative">
                <Input
                  id="oddLay"
                  type="text"
                  value={oddLay}
                  onChange={(e) => setOddLay(e.target.value)}
                  className="pl-8 bg-background/50 border-primary/20 focus:border-primary transition-all"
                  placeholder="2.10"
                />
                <TrendingUp className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="valorProtecao" className="text-xs text-muted-foreground flex items-center gap-1">
                Valor Futuro da Proteção
                <InfoTooltip text="Valor fixo que você pretende apostar futuramente na Bookmaker." />
              </Label>
              <div className="relative">
                <Input
                  id="valorProtecao"
                  type="text"
                  value={valorProtecao}
                  onChange={(e) => setValorProtecao(e.target.value)}
                  className="pl-8 bg-background/50 border-primary/20 focus:border-primary transition-all"
                  placeholder="100"
                />
                <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="comissao" className="text-xs text-muted-foreground flex items-center gap-1">
                Comissão da Exchange (%)
                <InfoTooltip text="Percentual cobrado pela Exchange sobre o lucro do Lay." />
              </Label>
              <div className="relative">
                <Input
                  id="comissao"
                  type="text"
                  value={comissao}
                  onChange={(e) => setComissao(e.target.value)}
                  className="pl-8 bg-background/50 border-primary/20 focus:border-primary transition-all"
                  placeholder="5"
                />
                <Percent className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            <div className="pt-4 space-y-6">
              <div className="flex justify-between items-center">
                <Label className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Objetivo de Lucro: {lucroDesejado[0]}%
                </Label>
                <span className={cn(
                  "text-xs font-bold px-2 py-0.5 rounded-full",
                  lucroDesejado[0] > 0 ? "bg-emerald-500/10 text-emerald-500" : 
                  lucroDesejado[0] < 0 ? "bg-red-500/10 text-red-500" : "bg-blue-500/10 text-blue-500"
                )}>
                  {lucroDesejado[0] === 0 ? 'NEUTRO' : lucroDesejado[0] > 0 ? 'LUCRO' : 'DEFESA'}
                </span>
              </div>
              <Slider
                value={lucroDesejado}
                onValueChange={setLucroDesejado}
                min={-5}
                max={20}
                step={0.5}
                className="py-4"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground px-1">
                <span>-5%</span>
                <span>0% (Hedge Neutro)</span>
                <span>+20%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Output Principal */}
        <div className="space-y-6">
          <Card className="border-primary/40 bg-primary/5 shadow-lg shadow-primary/5">
            <CardContent className="pt-6 pb-8 flex flex-col items-center justify-center text-center space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70">
                Stake Ideal do Lay Inicial
              </span>
              <div className="text-5xl font-black text-primary tracking-tighter">
                {results ? `R$ ${results.stakeLay.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '---'}
              </div>
              <p className="text-xs text-muted-foreground max-w-[200px]">
                Invista este valor agora na Exchange para garantir o objetivo futuro.
              </p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <OutputCard 
              label="Odd Futura Necessária" 
              value={results ? results.oddFutura.toFixed(2) : '---'} 
              icon={<Clock className="h-3 w-3" />}
              highlight
            />
            <OutputCard 
              label="Liability (Risco)" 
              value={results ? `R$ ${results.liability.toFixed(2)}` : '---'} 
              icon={<Info className="h-3 w-3" />}
            />
            <OutputCard 
              label="Lucro Líquido" 
              value={results ? `R$ ${results.lucroLiquido.toFixed(2)}` : '---'} 
              color={lucroDesejado[0] >= 0 ? "text-emerald-500" : "text-red-500"}
            />
            <OutputCard 
              label="ROI Estimado" 
              value={results ? `${results.roi.toFixed(2)}%` : '---'} 
            />
          </div>
        </div>
      </div>

      {/* Métricas Secundárias */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricBadge 
          label="Distância em Ticks" 
          value={results ? (results.ticks > 0 ? `+${results.ticks}` : results.ticks.toString()) : '---'} 
          description="Variação necessária da odd"
        />
        <MetricBadge 
          label="Spread Efetivo" 
          value={results ? results.spreadEfetivo.toFixed(3) : '---'} 
          description="Eficiência da operação"
        />
        <MetricBadge 
          label="Equilíbrio Operacional" 
          value={lucroDesejado[0] === 0 ? "Ativo" : "Ajustado"} 
          description="Status do motor matemático"
        />
      </div>
    </div>
  );
};

function OutputCard({ label, value, icon, color, highlight }: { label: string, value: string, icon?: React.ReactNode, color?: string, highlight?: boolean }) {
  return (
    <div className={cn(
      "p-3 rounded-lg border transition-all duration-300",
      highlight ? "border-primary/30 bg-primary/5" : "border-border/50 bg-muted/10"
    )}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon && <span className="text-primary/70">{icon}</span>}
        <span className="text-[10px] font-medium text-muted-foreground uppercase">{label}</span>
      </div>
      <div className={cn("text-lg font-bold truncate", color || "text-foreground")}>
        {value}
      </div>
    </div>
  );
}

function MetricBadge({ label, value, description }: { label: string, value: string, description: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
      <div className="h-8 w-8 rounded-full bg-background flex items-center justify-center border border-border">
        <ArrowRight className="h-4 w-4 text-primary/50" />
      </div>
      <div>
        <div className="text-[10px] font-semibold text-muted-foreground uppercase leading-none mb-1">{label}</div>
        <div className="text-sm font-bold text-foreground leading-none">{value}</div>
        <div className="text-[9px] text-muted-foreground/70 mt-1">{description}</div>
      </div>
    </div>
  );
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="inline-flex items-center">
            <Info className="h-3 w-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-[10px]">
          <p>{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
