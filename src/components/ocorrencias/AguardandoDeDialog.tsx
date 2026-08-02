import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  AGUARDANDO_DE_LABELS,
  AGUARDANDO_DE_DESCRICOES,
  type OcorrenciaAguardandoDe,
} from '@/types/ocorrencias';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (aguardandoDe: OcorrenciaAguardandoDe) => void;
  isPending?: boolean;
  valorAtual?: string | null;
}

const OPCOES = Object.keys(AGUARDANDO_DE_LABELS) as OcorrenciaAguardandoDe[];

/**
 * Ao mover a ocorrência para "Aguardando Retorno", o operador declara
 * DE QUEM se aguarda. Mantém o enum de status enxuto e o badge preciso.
 */
export function AguardandoDeDialog({ open, onOpenChange, onConfirm, isPending, valorAtual }: Props) {
  const [selecionado, setSelecionado] = useState<OcorrenciaAguardandoDe | null>(
    (valorAtual as OcorrenciaAguardandoDe) || null
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Aguardando retorno de quem?</DialogTitle>
          <DialogDescription>
            Essa informação aparece no badge da ocorrência e nos filtros.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 py-2">
          {OPCOES.map((op) => (
            <button
              key={op}
              type="button"
              onClick={() => setSelecionado(op)}
              className={cn(
                'rounded-lg border p-3 text-left transition-colors',
                selecionado === op
                  ? 'border-primary bg-primary/10'
                  : 'border-border/60 hover:bg-muted/40'
              )}
            >
              <p className="text-xs font-bold uppercase tracking-wide text-foreground">
                Aguardando {AGUARDANDO_DE_LABELS[op]}
              </p>
              <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">
                {AGUARDANDO_DE_DESCRICOES[op]}
              </p>
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!selecionado || isPending}
            onClick={() => selecionado && onConfirm(selecionado)}
          >
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}