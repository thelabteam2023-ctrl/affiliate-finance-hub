import { useState } from 'react';
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
import { Loader2, CheckCircle, XCircle, AlertTriangle, CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export type ResultadoFinanceiro = 'sem_impacto' | 'perda_confirmada' | 'perda_parcial';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  valorRisco: number;
  moeda: string;
  onConfirmar: (resultado: ResultadoFinanceiro, valorPerda: number, dataResolucao: Date) => Promise<void>;
}

const formatCurrency = (value: number, moeda: string) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda || 'BRL' }).format(value);

export function ResolucaoFinanceiraDialog({
  open,
  onOpenChange,
  valorRisco,
  moeda,
  onConfirmar,
}: Props) {
  const [resultado, setResultado] = useState<ResultadoFinanceiro>('sem_impacto');
  const [valorPerda, setValorPerda] = useState<string>(String(valorRisco || 0));
  const [dataResolucao, setDataResolucao] = useState<Date>(new Date());
  const [loading, setLoading] = useState(false);

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
      description: `Todo o valor em risco (${formatCurrency(valorRisco, moeda)}) será contabilizado como prejuízo.`,
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
              Valor em risco: {formatCurrency(valorRisco, moeda)} — Informe quanto foi efetivamente perdido.
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
