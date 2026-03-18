import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Loader2, CheckCircle, XCircle, AlertTriangle, CalendarIcon, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export type ResultadoFinanceiro = 'sem_impacto' | 'perda_confirmada' | 'perda_parcial';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  valorRisco: number;
  moeda: string;
  bookmaker_id?: string | null;
  projeto_id?: string | null;
  ocorrencia_id?: string;
  onConfirmar: (resultado: ResultadoFinanceiro, valorPerda: number, dataResolucao: Date) => Promise<void>;
}

const formatCurrency = (value: number, moeda: string) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda || 'BRL' }).format(value);

export function ResolucaoFinanceiraDialog({
  open,
  onOpenChange,
  valorRisco,
  moeda,
  bookmaker_id,
  projeto_id,
  ocorrencia_id,
  onConfirmar,
}: Props) {
  const [resultado, setResultado] = useState<ResultadoFinanceiro>('sem_impacto');
  const [valorPerda, setValorPerda] = useState<string>(String(valorRisco || 0));
  const [dataResolucao, setDataResolucao] = useState<Date>(new Date());
  const [loading, setLoading] = useState(false);
  const [saldoBookmaker, setSaldoBookmaker] = useState<number | null>(null);
  const [perdasJaRegistradas, setPerdasJaRegistradas] = useState<number>(0);
  const [bookmakerDesvinculada, setBookmakerDesvinculada] = useState(false);

  // Carregar saldo da bookmaker e perdas já registradas ao abrir
  useEffect(() => {
    if (!open || !bookmaker_id) return;

    const loadBalanceInfo = async () => {
      // 1. Saldo atual da bookmaker
      const { data: bk } = await supabase
        .from('bookmakers')
        .select('saldo_atual, projeto_id')
        .eq('id', bookmaker_id)
        .single();

      if (bk) {
        setSaldoBookmaker(bk.saldo_atual);
        setBookmakerDesvinculada(bk.projeto_id !== projeto_id);
      }

      // 2. Perdas já registradas em outras ocorrências abertas da mesma bookmaker
      if (projeto_id) {
        const { data: outrasOcorrencias } = await (supabase as any)
          .from('ocorrencias')
          .select('valor_perda')
          .eq('bookmaker_id', bookmaker_id)
          .eq('projeto_id', projeto_id)
          .eq('perda_registrada_ledger', true)
          .neq('id', ocorrencia_id || '');

        const total = (outrasOcorrencias || []).reduce((acc: number, o: any) => acc + (o.valor_perda || 0), 0);
        setPerdasJaRegistradas(total);
      }
    };

    loadBalanceInfo();
  }, [open, bookmaker_id, projeto_id, ocorrencia_id]);

  const handleConfirmar = async () => {
    setLoading(true);
    try {
      const valor =
        resultado === 'sem_impacto'
          ? 0
          : resultado === 'perda_confirmada'
          ? valorRisco
          : Number(valorPerda) || 0;
      await onConfirmar(resultado, valor, dataResolucao);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const valorEfetivo = resultado === 'sem_impacto' ? 0 
    : resultado === 'perda_confirmada' ? valorRisco 
    : Number(valorPerda) || 0;
  
  const saldoDisponivel = saldoBookmaker !== null 
    ? Math.max(0, saldoBookmaker - perdasJaRegistradas) 
    : null;
  
  const excedeSaldo = saldoDisponivel !== null && valorEfetivo > saldoDisponivel && !bookmakerDesvinculada;

  const OPCOES = [
    {
      value: 'sem_impacto' as const,
      label: 'Resolvido sem impacto',
      description: 'O valor foi recuperado ou não houve perda financeira.',
      icon: <CheckCircle className="h-5 w-5 text-emerald-500" />,
      color: 'border-emerald-500/30 bg-emerald-500/5',
    },
    {
      value: 'perda_confirmada' as const,
      label: 'Perda total confirmada',
      description: `Todo o valor em disputa (${formatCurrency(valorRisco, moeda)}) será contabilizado como prejuízo.`,
      icon: <XCircle className="h-5 w-5 text-red-500" />,
      color: 'border-red-500/30 bg-red-500/5',
    },
    {
      value: 'perda_parcial' as const,
      label: 'Perda parcial',
      description: 'Parte do valor foi recuperado. Informe o valor efetivamente perdido.',
      icon: <AlertTriangle className="h-5 w-5 text-amber-500" />,
      color: 'border-amber-500/30 bg-amber-500/5',
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Resolução Financeira
          </DialogTitle>
          <DialogDescription>
            Qual foi o desfecho financeiro desta ocorrência?
          </DialogDescription>
        </DialogHeader>

        {/* Aviso de bookmaker desvinculada */}
        {bookmakerDesvinculada && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm">
            <Info className="h-4 w-4 mt-0.5 text-amber-500 flex-shrink-0" />
            <p className="text-amber-200">
              A bookmaker foi desvinculada do projeto. A perda será registrada no lucro do projeto, 
              mas <strong>não debitará o saldo</strong> da casa (já saiu via Saque Virtual).
            </p>
          </div>
        )}

        <RadioGroup
          value={resultado}
          onValueChange={(v) => setResultado(v as ResultadoFinanceiro)}
          className="space-y-3"
        >
          {OPCOES.map((opcao) => (
            <Label
              key={opcao.value}
              htmlFor={opcao.value}
              className={cn(
                'flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-all',
                resultado === opcao.value ? opcao.color : 'border-border/50 hover:border-border'
              )}
            >
              <RadioGroupItem value={opcao.value} id={opcao.value} className="mt-0.5" />
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  {opcao.icon}
                  <span className="font-medium text-sm">{opcao.label}</span>
                </div>
                <p className="text-xs text-muted-foreground">{opcao.description}</p>
              </div>
            </Label>
          ))}
        </RadioGroup>

        {/* Campo de valor parcial */}
        {resultado === 'perda_parcial' && (
          <div className="space-y-2 pt-2">
            <Label htmlFor="valor-perda" className="text-sm">
              Valor da perda ({moeda || 'BRL'})
            </Label>
            <Input
              id="valor-perda"
              type="number"
              step="0.01"
              min="0"
              max={valorRisco}
              value={valorPerda}
              onChange={(e) => setValorPerda(e.target.value)}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Valor em disputa: {formatCurrency(valorRisco, moeda)} — Informe quanto foi efetivamente perdido.
            </p>
          </div>
        )}

        {/* Aviso de saldo insuficiente */}
        {excedeSaldo && resultado !== 'sem_impacto' && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-destructive flex-shrink-0" />
            <p className="text-destructive">
              A perda de {formatCurrency(valorEfetivo, moeda)} excede o saldo disponível da bookmaker 
              ({formatCurrency(saldoDisponivel!, moeda)}
              {perdasJaRegistradas > 0 && ` — já há ${formatCurrency(perdasJaRegistradas, moeda)} em perdas registradas`}).
              O saldo ficará negativo.
            </p>
          </div>
        )}

        {/* Data de resolução */}
        <div className="space-y-2 pt-2">
          <Label className="text-sm">Data de resolução</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn('w-full pl-3 text-left font-normal')}
              >
                {format(dataResolucao, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dataResolucao}
                onSelect={(d) => d && setDataResolucao(d)}
                disabled={(date) => date > new Date()}
                initialFocus
                className={cn('p-3 pointer-events-auto')}
              />
            </PopoverContent>
          </Popover>
          <p className="text-xs text-muted-foreground">
            Quando a ocorrência foi de fato resolvida.
          </p>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmar} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Confirmar Resolução
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
