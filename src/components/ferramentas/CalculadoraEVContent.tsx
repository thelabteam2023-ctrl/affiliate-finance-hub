import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Copy, Check, History, TrendingUp, AlertTriangle, XCircle, Zap, HelpCircle, ClipboardPaste, X, Loader2, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface SimulationResult {
  id: number;
  oddAtual: number;
  oddJusta: number;
  ev: number;
  classification: string;
  stakeSugerida: number | null;
  timestamp: Date;
}

interface OcrDualOdds {
  trueOddsPinnacle: number | null;
  fairOdds: number | null;
  evVsPinnacle: number | null;
  evVsFairOdds: number | null;
}

type Classification = {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ReactNode;
  description: string;
};

function getClassification(ev: number): Classification {
  if (ev > 5) return {
    label: 'Alto Valor',
    color: 'text-emerald-700 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/40',
    borderColor: 'border-emerald-200 dark:border-emerald-800',
    icon: <TrendingUp className="h-4 w-4" />,
    description: 'Entrada forte recomendada',
  };
  if (ev > 2) return {
    label: 'Valor Moderado',
    color: 'text-amber-700 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/40',
    borderColor: 'border-amber-200 dark:border-amber-800',
    icon: <Zap className="h-4 w-4" />,
    description: 'Entrada reduzida sugerida',
  };
  if (ev > 0) return {
    label: 'Marginal',
    color: 'text-orange-700 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-950/40',
    borderColor: 'border-orange-200 dark:border-orange-800',
    icon: <AlertTriangle className="h-4 w-4" />,
    description: 'Entrada cautelosa',
  };
  return {
    label: 'Sem Valor',
    color: 'text-red-700 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-950/40',
    borderColor: 'border-red-200 dark:border-red-800',
    icon: <XCircle className="h-4 w-4" />,
    description: 'Não apostar',
  };
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="ml-1 text-muted-foreground hover:text-foreground transition-colors">
            <HelpCircle className="h-3 w-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-xs">{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Comprime imagem via canvas para reduzir payload */
function compressImage(base64: string, maxWidth: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(base64); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = base64;
  });
}

export const CalculadoraEVContent: React.FC = () => {
  const [oddAtual, setOddAtual] = useState('');
  const [oddJusta, setOddJusta] = useState('');
  const [stakeBase, setStakeBase] = useState('');
  const [oddInicial, setOddInicial] = useState('');
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<SimulationResult[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [simCounter, setSimCounter] = useState(0);

  // OCR state
  const [pastedImage, setPastedImage] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedInfo, setParsedInfo] = useState<string | null>(null);
  const [dualOdds, setDualOdds] = useState<OcrDualOdds | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const parseNum = (v: string) => {
    const n = parseFloat(v.replace(',', '.'));
    return isNaN(n) ? null : n;
  };

  const parseImage = useCallback(async (imageBase64: string) => {
    setIsParsing(true);
    setDualOdds(null);
    try {
      if (imageBase64.length > 6 * 1024 * 1024) {
        toast.error('Imagem muito grande', { description: 'Use uma imagem menor (máx ~4MB).' });
        return;
      }

      if (!imageBase64.startsWith('data:image/')) {
        toast.error('Formato inválido', { description: 'Cole uma imagem válida (PNG, JPEG).' });
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      if (!supabaseUrl || !supabaseKey) {
        toast.error('Configuração ausente', { description: 'Variáveis de ambiente não encontradas.' });
        return;
      }

      const endpoint = `${supabaseUrl}/functions/v1/parse-ev-print`;

      // Compress image
      let processedBase64 = imageBase64;
      try {
        const compressed = await compressImage(imageBase64, 800, 0.8);
        if (compressed && compressed.length < imageBase64.length) {
          processedBase64 = compressed;
        }
      } catch {
        // Use original
      }

      const payload = JSON.stringify({ imageBase64: processedBase64 });

      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: payload,
        });
      } catch (fetchError) {
        console.error('[EV OCR] FETCH FAILED:', fetchError);
        toast.error('Erro de conexão', {
          description: 'Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.',
        });
        return;
      }

      const rawText = await response.text();
      let data: any = null;
      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch {
        toast.error('Resposta inválida', { description: 'O servidor retornou dados inválidos.' });
        return;
      }

      if (!response.ok) {
        const message = data?.error
          || (response.status === 402
            ? 'Créditos de IA insuficientes.'
            : response.status === 429
              ? 'Limite de requisições. Tente em alguns segundos.'
              : `Erro ao processar (código ${response.status}).`);
        toast.error('Erro ao interpretar print', { description: message });
        return;
      }

      if (data?.error) {
        toast.error('Erro ao interpretar print', { description: data.error });
        return;
      }

      if (!data?.success || !data?.data) {
        toast.error('Não foi possível interpretar o print', { description: 'Tente outro print.' });
        return;
      }

      const d = data.data;

      // Set fields - usar fair_odds como padrão para "Odd Justa"
      let fieldsSet = 0;
      if (d.odd_atual && d.odd_atual > 1) {
        setOddAtual(String(d.odd_atual));
        fieldsSet++;
      }
      // Prioridade: fair_odds > true_odds_pinnacle > odd_justa (legacy)
      const bestOddJusta = d.fair_odds || d.true_odds_pinnacle || d.odd_justa;
      if (bestOddJusta && bestOddJusta > 1) {
        setOddJusta(String(bestOddJusta));
        fieldsSet++;
      }
      if (d.stake && d.stake > 0) {
        setStakeBase(String(d.stake));
        fieldsSet++;
      }

      // Dual odds display
      const hasDual = d.true_odds_pinnacle && d.fair_odds && d.true_odds_pinnacle !== d.fair_odds;
      if (hasDual || d.true_odds_pinnacle || d.fair_odds) {
        setDualOdds({
          trueOddsPinnacle: d.true_odds_pinnacle || null,
          fairOdds: d.fair_odds || null,
          evVsPinnacle: d.ev_vs_pinnacle || null,
          evVsFairOdds: d.ev_vs_fair_odds || null,
        });
      }

      const infoParts: string[] = [];
      if (d.evento) infoParts.push(d.evento);
      if (d.mercado) infoParts.push(d.mercado);
      if (d.selecao) infoParts.push(d.selecao);
      if (d.bookmaker) infoParts.push(d.bookmaker);
      if (d.limite) infoParts.push(`Limite: R$ ${d.limite}`);

      setParsedInfo(infoParts.length > 0 ? infoParts.join(' • ') : null);

      toast.success('Print interpretado!', {
        description: `Odd: ${d.odd_atual || '?'} | Justa: ${bestOddJusta || '?'}${d.ev_percent ? ` | EV: ${d.ev_percent}%` : ''} | ${fieldsSet} campos`,
      });
    } catch (err) {
      console.error('[EV OCR] UNEXPECTED ERROR:', err);
      toast.error('Erro ao processar print', {
        description: err instanceof Error ? err.message : 'Erro inesperado.',
      });
    } finally {
      setIsParsing(false);
    }
  }, []);

  // Paste handler
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) return;

          const reader = new FileReader();
          reader.onload = async (ev) => {
            const base64 = ev.target?.result as string;
            if (!base64) return;
            setPastedImage(base64);
            setParsedInfo(null);
            setDualOdds(null);
            try {
              await parseImage(base64);
            } catch (err) {
              console.error('[EV Calculator] Unhandled parse error:', err);
            }
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [parseImage]);

  const clearImage = () => {
    setPastedImage(null);
    setParsedInfo(null);
    setDualOdds(null);
  };

  const results = useMemo(() => {
    const oa = parseNum(oddAtual);
    const oj = parseNum(oddJusta);
    if (!oa || !oj || oa <= 0 || oj <= 0) return null;

    const probAtual = (1 / oa) * 100;
    const probJusta = (1 / oj) * 100;
    const ev = (oa / oj - 1) * 100;
    const classification = getClassification(ev);

    let stakeSugerida: number | null = null;
    let valorRestante: number | null = null;
    const sb = parseNum(stakeBase);
    const oi = parseNum(oddInicial);

    if (sb && sb > 0 && oi && oi > 0 && (oi - oj) !== 0) {
      let fator = (oa - oj) / (oi - oj);
      fator = Math.min(1, Math.max(0, fator));
      stakeSugerida = Math.round(sb * fator * 100) / 100;
      valorRestante = Math.round(fator * 100 * 100) / 100;
    }

    return {
      probAtual: Math.round(probAtual * 100) / 100,
      probJusta: Math.round(probJusta * 100) / 100,
      ev: Math.round(ev * 100) / 100,
      classification,
      stakeSugerida,
      valorRestante,
    };
  }, [oddAtual, oddJusta, stakeBase, oddInicial]);

  const handleSaveToHistory = useCallback(() => {
    if (!results) return;
    const oa = parseNum(oddAtual)!;
    const oj = parseNum(oddJusta)!;
    setSimCounter(c => c + 1);
    setHistory(prev => {
      const next = [{
        id: simCounter + 1,
        oddAtual: oa,
        oddJusta: oj,
        ev: results.ev,
        classification: results.classification.label,
        stakeSugerida: results.stakeSugerida,
        timestamp: new Date(),
      }, ...prev];
      return next.slice(0, 5);
    });
  }, [results, oddAtual, oddJusta, simCounter]);

  const handleCopy = useCallback(() => {
    if (!results) return;
    const oa = parseNum(oddAtual);
    const oj = parseNum(oddJusta);
    const lines = [
      `📊 Análise EV — LABBET`,
      `Odd Atual: ${oa}  |  Odd Justa: ${oj}`,
      `Prob. Atual: ${results.probAtual}%  |  Prob. Justa: ${results.probJusta}%`,
      `EV: ${results.ev > 0 ? '+' : ''}${results.ev}%  →  ${results.classification.label}`,
    ];
    if (dualOdds?.trueOddsPinnacle && dualOdds?.fairOdds) {
      lines.push(`Pinnacle: ${dualOdds.trueOddsPinnacle} (EV ${dualOdds.evVsPinnacle ? (dualOdds.evVsPinnacle > 0 ? '+' : '') + dualOdds.evVsPinnacle + '%' : '?'}) | Fair: ${dualOdds.fairOdds} (EV ${dualOdds.evVsFairOdds ? (dualOdds.evVsFairOdds > 0 ? '+' : '') + dualOdds.evVsFairOdds + '%' : '?'})`);
    }
    if (results.stakeSugerida !== null) {
      lines.push(`Stake Sugerida: R$ ${results.stakeSugerida.toFixed(2)} (${results.valorRestante}% do valor restante)`);
    }
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [results, oddAtual, oddJusta, dualOdds]);

  const handleReset = () => {
    setOddAtual('');
    setOddJusta('');
    setStakeBase('');
    setOddInicial('');
    setDualOdds(null);
    clearImage();
  };

  // Helper to switch odd justa source
  const switchToOddSource = (value: number) => {
    setOddJusta(String(value));
  };

  return (
    <div ref={containerRef} className="p-3 space-y-2.5">
      {/* Paste zone */}
      {!pastedImage && !isParsing && (
        <div className="border border-dashed border-muted-foreground/30 rounded-md p-2 text-center hover:border-primary/50 transition-colors cursor-default">
          <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
            <ClipboardPaste className="h-3.5 w-3.5" />
            <span className="text-[10px]">Cole um print (Ctrl+V) para preencher automaticamente</span>
          </div>
        </div>
      )}

      {/* Parsing loader */}
      {isParsing && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-2.5 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-xs text-primary font-medium">Interpretando print...</span>
          </CardContent>
        </Card>
      )}

      {/* Pasted image preview + parsed info */}
      {pastedImage && !isParsing && (
        <div className="space-y-1.5">
          <div className="relative">
            <img
              src={pastedImage}
              alt="Print colado"
              className="w-full max-h-28 object-contain rounded-md border border-border bg-muted/30"
            />
            <button
              onClick={clearImage}
              className="absolute top-1 right-1 p-0.5 rounded-full bg-background/80 hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          {parsedInfo && (
            <p className="text-[9px] text-muted-foreground truncate px-1">
              <ImageIcon className="h-2.5 w-2.5 inline mr-1" />
              {parsedInfo}
            </p>
          )}
        </div>
      )}

      {/* Dual odds comparison (when OCR detected both) */}
      {dualOdds && dualOdds.trueOddsPinnacle && dualOdds.fairOdds && dualOdds.trueOddsPinnacle !== dualOdds.fairOdds && (
        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30">
          <CardContent className="p-2">
            <p className="text-[9px] uppercase tracking-wider text-blue-600 dark:text-blue-400 font-semibold mb-1.5">
              Comparação de Odds Justas
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {/* Pinnacle */}
              <button
                onClick={() => switchToOddSource(dualOdds.trueOddsPinnacle!)}
                className={cn(
                  'rounded-md p-1.5 text-left transition-all border',
                  parseNum(oddJusta) === dualOdds.trueOddsPinnacle
                    ? 'border-blue-400 dark:border-blue-500 bg-blue-100 dark:bg-blue-900/50'
                    : 'border-transparent hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-100/50 dark:hover:bg-blue-900/30'
                )}
              >
                <p className="text-[9px] text-muted-foreground">Pinnacle</p>
                <p className="text-xs font-bold font-mono text-foreground">{dualOdds.trueOddsPinnacle}</p>
                {dualOdds.evVsPinnacle !== null && (
                  <p className={cn('text-[9px] font-mono font-medium', dualOdds.evVsPinnacle > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                    EV {dualOdds.evVsPinnacle > 0 ? '+' : ''}{dualOdds.evVsPinnacle}%
                  </p>
                )}
              </button>
              {/* Fair Odds (média sharp) */}
              <button
                onClick={() => switchToOddSource(dualOdds.fairOdds!)}
                className={cn(
                  'rounded-md p-1.5 text-left transition-all border',
                  parseNum(oddJusta) === dualOdds.fairOdds
                    ? 'border-blue-400 dark:border-blue-500 bg-blue-100 dark:bg-blue-900/50'
                    : 'border-transparent hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-100/50 dark:hover:bg-blue-900/30'
                )}
              >
                <p className="text-[9px] text-muted-foreground">Fair Odds (média sharp)</p>
                <p className="text-xs font-bold font-mono text-foreground">{dualOdds.fairOdds}</p>
                {dualOdds.evVsFairOdds !== null && (
                  <p className={cn('text-[9px] font-mono font-medium', dualOdds.evVsFairOdds > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                    EV {dualOdds.evVsFairOdds > 0 ? '+' : ''}{dualOdds.evVsFairOdds}%
                  </p>
                )}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inputs */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] font-medium flex items-center">
            Odd Atual *
            <InfoTooltip text="A odd disponível agora na casa de apostas." />
          </Label>
          <Input
            placeholder="ex: 1.83"
            value={oddAtual}
            onChange={e => setOddAtual(e.target.value)}
            className="text-right font-mono h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] font-medium flex items-center">
            Odd Justa *
            <InfoTooltip text="A odd que representa a probabilidade real do evento. Quando detectado no print, usa Fair Odds (média sharp) como padrão." />
          </Label>
          <Input
            placeholder="ex: 1.77"
            value={oddJusta}
            onChange={e => setOddJusta(e.target.value)}
            className="text-right font-mono h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] font-medium flex items-center">
            Stake Base
            <InfoTooltip text="Valor padrão de aposta." />
          </Label>
          <Input
            placeholder="ex: 100"
            value={stakeBase}
            onChange={e => setStakeBase(e.target.value)}
            className="text-right font-mono h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] font-medium flex items-center">
            Odd Inicial
            <InfoTooltip text="Odd quando a oportunidade foi identificada." />
          </Label>
          <Input
            placeholder="ex: 1.90"
            value={oddInicial}
            onChange={e => setOddInicial(e.target.value)}
            className="text-right font-mono h-8 text-sm"
          />
        </div>
      </div>

      {/* Results */}
      {results && (
        <div className="space-y-2 animate-in fade-in-0 duration-200">
          <Card className={cn('border-2', results.classification.borderColor, results.classification.bgColor)}>
            <CardContent className="p-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={results.classification.color}>
                    {results.classification.icon}
                  </div>
                  <div>
                    <p className={cn('font-bold text-sm', results.classification.color)}>
                      {results.classification.label}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{results.classification.description}</p>
                  </div>
                </div>
                <div className={cn('text-lg font-bold font-mono', results.classification.color)}>
                  {results.ev > 0 ? '+' : ''}{results.ev}%
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-2">
            <Card>
              <CardContent className="p-2">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">Prob. Implícita</p>
                <p className="text-sm font-bold font-mono text-foreground">{results.probAtual}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-2">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">Prob. Justa</p>
                <p className="text-sm font-bold font-mono text-foreground">{results.probJusta}%</p>
              </CardContent>
            </Card>
            {results.stakeSugerida !== null && (
              <>
                <Card>
                  <CardContent className="p-2">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">Stake Sugerida</p>
                    <p className="text-sm font-bold font-mono text-foreground">R$ {results.stakeSugerida.toFixed(2)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-2">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">Valor Restante</p>
                    <p className="text-sm font-bold font-mono text-foreground">{results.valorRestante}%</p>
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1 flex-1 h-7 text-[11px]">
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copiado!' : 'Copiar resultado'}
            </Button>
            <Button variant="outline" size="sm" onClick={handleSaveToHistory} className="gap-1 flex-1 h-7 text-[11px]">
              <History className="h-3 w-3" />
              Salvar simulação
            </Button>
            <Button variant="ghost" size="sm" onClick={handleReset} className="h-7 text-[11px]">
              Limpar
            </Button>
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <>
          <Separator />
          <div>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors w-full"
            >
              <History className="h-3 w-3" />
              Últimas {history.length} simulações
              <span className="ml-auto text-[9px]">{showHistory ? '▲' : '▼'}</span>
            </button>
            {showHistory && (
              <div className="mt-1.5 space-y-1 animate-in fade-in-0 duration-150">
                {history.map(h => {
                  const cls = getClassification(h.ev);
                  return (
                    <div key={h.id} className={cn(
                      'flex items-center justify-between p-1.5 rounded-md text-[10px] border',
                      cls.bgColor, cls.borderColor
                    )}>
                      <div className="flex items-center gap-1.5">
                        <span className={cn('font-mono font-bold', cls.color)}>
                          {h.ev > 0 ? '+' : ''}{h.ev}%
                        </span>
                        <span className="text-muted-foreground">
                          {h.oddAtual} / {h.oddJusta}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {h.stakeSugerida !== null && (
                          <span className="text-muted-foreground">R$ {h.stakeSugerida.toFixed(2)}</span>
                        )}
                        <span className="text-muted-foreground/60">
                          {h.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* EV Explanation */}
      {!results && !pastedImage && !isParsing && (
        <Card className="border-dashed">
          <CardContent className="p-2.5">
            <div className="flex items-start gap-2">
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="space-y-1 text-[10px] text-muted-foreground">
                <p className="font-medium text-xs text-foreground">O que é Expected Value (EV)?</p>
                <p>
                  EV mede se uma aposta tem valor positivo a longo prazo. Odd oferecida maior que a justa = vantagem estatística.
                </p>
                <p><strong>EV+ = lucro esperado.</strong> Quanto maior, mais forte a oportunidade.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};