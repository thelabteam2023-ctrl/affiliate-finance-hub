import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useEditarOcorrencia } from '@/hooks/useOcorrencias';
import { TIPO_LABELS, PRIORIDADE_LABELS, SUB_MOTIVOS } from '@/types/ocorrencias';
import type { Ocorrencia, OcorrenciaTipo, OcorrenciaPrioridade } from '@/types/ocorrencias';
import { Loader2, Pencil, CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const schema = z.object({
  titulo: z.string().min(5, 'Título deve ter pelo menos 5 caracteres').max(200),
  descricao: z.string().min(10, 'Descreva o problema com pelo menos 10 caracteres'),
  tipo: z.enum([
    'movimentacao_financeira',
    'kyc',
    'bloqueio_bancario',
    'bloqueio_contas',
  ] as const),
  sub_motivo: z.string().optional(),
  prioridade: z.enum(['baixa', 'media', 'alta', 'urgente'] as const),
  valor_risco: z.coerce.number().min(0).optional(),
  data_ocorrencia: z.date().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ocorrencia: Ocorrencia & { valor_risco?: number; moeda?: string; data_ocorrencia?: string };
}

export function EditarOcorrenciaDialog({ open, onOpenChange, ocorrencia }: Props) {
  const { mutateAsync: editar, isPending } = useEditarOcorrencia();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      titulo: ocorrencia.titulo,
      descricao: ocorrencia.descricao,
      tipo: ocorrencia.tipo,
      sub_motivo: (ocorrencia as any).sub_motivo || '',
      prioridade: ocorrencia.prioridade,
      valor_risco: Number((ocorrencia as any).valor_risco) || 0,
      data_ocorrencia: (ocorrencia as any).data_ocorrencia
        ? parseISO((ocorrencia as any).data_ocorrencia)
        : new Date(ocorrencia.created_at),
    },
  });

  // Reset when ocorrencia changes
  useEffect(() => {
    if (open) {
      form.reset({
        titulo: ocorrencia.titulo,
        descricao: ocorrencia.descricao,
        tipo: ocorrencia.tipo,
        sub_motivo: (ocorrencia as any).sub_motivo || '',
        prioridade: ocorrencia.prioridade,
        valor_risco: Number((ocorrencia as any).valor_risco) || 0,
        data_ocorrencia: (ocorrencia as any).data_ocorrencia
          ? parseISO((ocorrencia as any).data_ocorrencia)
          : new Date(ocorrencia.created_at),
      });
    }
  }, [open, ocorrencia.id]);

  const tipoSelecionado = form.watch('tipo');
  const subMotivos = SUB_MOTIVOS[tipoSelecionado] || [];

  const onSubmit = async (data: FormData) => {
    await editar({
      id: ocorrencia.id,
      titulo: data.titulo,
      descricao: data.descricao,
      tipo: data.tipo,
      sub_motivo: data.sub_motivo || null,
      prioridade: data.prioridade,
      valor_risco: data.valor_risco || 0,
      data_ocorrencia: data.data_ocorrencia ? format(data.data_ocorrencia, 'yyyy-MM-dd') : undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            Editar Ocorrência
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Título */}
            <FormField
              control={form.control}
              name="titulo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título</FormLabel>
                  <FormControl>
                    <Input placeholder="Título da ocorrência" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Descrição */}
            <FormField
              control={form.control}
              name="descricao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Descreva o problema..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Tipo + Sub-motivo */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="tipo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(Object.entries(TIPO_LABELS) as [OcorrenciaTipo, string][]).map(
                          ([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sub_motivo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sub-motivo</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || ''}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Opcional" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {subMotivos.map((sm) => (
                          <SelectItem key={sm.value} value={sm.value}>
                            {sm.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Prioridade */}
            <FormField
              control={form.control}
              name="prioridade"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prioridade</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(Object.entries(PRIORIDADE_LABELS) as [OcorrenciaPrioridade, string][]).map(
                        ([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Data da ocorrência */}
            <FormField
              control={form.control}
              name="data_ocorrencia"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Data da ocorrência</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full pl-3 text-left font-normal',
                            !field.value && 'text-muted-foreground'
                          )}
                        >
                          {field.value ? (
                            format(field.value, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                          ) : (
                            <span>Selecione a data</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) => date > new Date()}
                        initialFocus
                        className={cn('p-3 pointer-events-auto')}
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Valor em risco */}
            <FormField
              control={form.control}
              name="valor_risco"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor em risco (opcional)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      className="font-mono"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Salvar Alterações
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
