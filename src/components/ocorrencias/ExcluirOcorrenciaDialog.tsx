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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Archive, ShieldAlert, Ban } from 'lucide-react';
import { useExcluirOcorrencia, useAtualizarStatusOcorrencia } from '@/hooks/useOcorrencias';
import type { Ocorrencia } from '@/types/ocorrencias';

interface Props {
  ocorrencia: Ocorrencia;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado após arquivar com sucesso (ex.: fechar o drawer) */
  onArquivada?: () => void;
}

/**
 * Exclusão de ocorrências = SOFT DELETE auditável.
 * - Somente owner/admin (validado também no banco pela RPC).
 * - Bloqueado quando existe perda registrada no ledger → oferece cancelamento.
 */
export function ExcluirOcorrenciaDialog({ ocorrencia, open, onOpenChange, onArquivada }: Props) {
  const [motivo, setMotivo] = useState('');
  const { mutate: arquivar, isPending } = useExcluirOcorrencia();
  const { mutate: atualizarStatus, isPending: cancelando } = useAtualizarStatusOcorrencia();

  const temVinculoFinanceiro =
    !!ocorrencia.perda_registrada_ledger || !!ocorrencia.perda_ledger_id;
  const motivoValido = motivo.trim().length >= 10;

  const handleArquivar = () => {
    arquivar(
      { id: ocorrencia.id, motivo: motivo.trim() },
      {
        onSuccess: () => {
          setMotivo('');
          onOpenChange(false);
          onArquivada?.();
        },
      }
    );
  };

  const handleCancelarPorEngano = () => {
    atualizarStatus(
      {
        id: ocorrencia.id,
        novoStatus: 'cancelado',
        statusAnterior: ocorrencia.status,
        motivo: motivo.trim() || 'Aberta por engano',
      },
      {
        onSuccess: () => {
          setMotivo('');
          onOpenChange(false);
          onArquivada?.();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-4 w-4 text-destructive" />
            Excluir ocorrência
          </DialogTitle>
          <DialogDescription>
            A exclusão é lógica: a ocorrência sai das listas operacionais, mas o registro, a linha do
            tempo e os anexos permanecem arquivados para auditoria.
          </DialogDescription>
        </DialogHeader>

        {temVinculoFinanceiro ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-2">
            <div className="flex items-center gap-2 text-destructive font-semibold text-sm">
              <ShieldAlert className="h-4 w-4" />
              Exclusão bloqueada
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Esta ocorrência possui perda registrada no ledger financeiro. Excluí-la deixaria o
              lançamento órfão. Cancele a ocorrência (o estorno da perda é feito automaticamente) ou
              estorne a perda antes de arquivar.
            </p>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="motivo-exclusao" className="text-xs font-semibold uppercase tracking-wide">
            Motivo {temVinculoFinanceiro ? '(opcional)' : '(obrigatório, mín. 10 caracteres)'}
          </Label>
          <Textarea
            id="motivo-exclusao"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: Registro criado por engano durante testes de homologação."
            rows={3}
          />
          <p className="text-[11px] text-muted-foreground">
            O motivo, seu usuário, a data/hora e uma cópia integral dos dados atuais serão gravados
            no log de auditoria e na linha do tempo.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          {ocorrencia.status !== 'cancelado' && (
            <Button
              variant="outline"
              className="gap-2"
              disabled={cancelando}
              onClick={handleCancelarPorEngano}
            >
              <Ban className="h-4 w-4" />
              Cancelar (aberta por engano)
            </Button>
          )}
          <Button
            variant="destructive"
            className="gap-2"
            disabled={isPending || temVinculoFinanceiro || !motivoValido}
            onClick={handleArquivar}
          >
            <Archive className="h-4 w-4" />
            Excluir e arquivar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}