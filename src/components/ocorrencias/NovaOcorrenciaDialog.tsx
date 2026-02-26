import { useState } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { useCriarOcorrencia } from '@/hooks/useOcorrencias';
import { useWorkspaceMembers } from '@/hooks/useWorkspaceMembers';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { TIPO_LABELS, PRIORIDADE_LABELS, SUB_MOTIVOS } from '@/types/ocorrencias';
import type { OcorrenciaTipo, OcorrenciaPrioridade } from '@/types/ocorrencias';
import { AlertTriangle, Loader2, Plus, X } from 'lucide-react';

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
  contexto_entidade: z.enum(['bookmaker', 'banco'], { required_error: 'Selecione onde ocorreu' }),
  entidade_id: z.string().min(1, 'Selecione a entidade'),
  prioridade: z.enum(['baixa', 'media', 'alta', 'urgente'] as const),
  executor_id: z.string().min(1, 'Selecione o executor'),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contextoInicial?: {
    tipo?: OcorrenciaTipo;
    titulo?: string;
    bookmaker_id?: string;
    projeto_id?: string;
    parceiro_id?: string;
    contexto_metadata?: Record<string, unknown>;
  };
}

export function NovaOcorrenciaDialog({ open, onOpenChange, contextoInicial }: Props) {
  const { mutateAsync: criar, isPending } = useCriarOcorrencia();
  const { data: members = [] } = useWorkspaceMembers();
  const { workspaceId } = useAuth();
  const [observadoresSelecionados, setObservadoresSelecionados] = useState<string[]>([]);

  // Carregar bookmakers do workspace
  const { data: bookmakers = [] } = useQuery({
    queryKey: ['ocorrencia-bookmakers', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookmakers')
        .select('id, nome, instance_identifier')
        .eq('workspace_id', workspaceId!)
        .order('nome');
      if (error) throw error;
      return data || [];
    },
    enabled: !!workspaceId && open,
  });

  // Carregar contas bancárias do workspace
  const { data: contasBancarias = [] } = useQuery({
    queryKey: ['ocorrencia-contas-bancarias', workspaceId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('contas_bancarias')
        .select('id, banco, titular, agencia, conta')
        .eq('workspace_id', workspaceId!)
        .order('banco');
      if (error) throw error;
      return data || [];
    },
    enabled: !!workspaceId && open,
  });

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      titulo: contextoInicial?.titulo || '',
      descricao: '',
      tipo: contextoInicial?.tipo || 'movimentacao_financeira',
      sub_motivo: '',
      contexto_entidade: undefined as unknown as 'bookmaker' | 'banco',
      entidade_id: '',
      prioridade: 'media',
      executor_id: '',
    },
  });

  const tipoSelecionado = form.watch('tipo');
  const contextoEntidade = form.watch('contexto_entidade');
  const subMotivos = SUB_MOTIVOS[tipoSelecionado] || [];

  const onSubmit = async (data: FormData) => {
    const isBookmaker = data.contexto_entidade === 'bookmaker';
    const isBanco = data.contexto_entidade === 'banco';
    await criar({
      titulo: data.titulo,
      descricao: data.descricao,
      tipo: data.tipo,
      sub_motivo: data.sub_motivo || null,
      prioridade: data.prioridade,
      executor_id: data.executor_id,
      observadores: observadoresSelecionados,
      bookmaker_id: isBookmaker ? data.entidade_id : contextoInicial?.bookmaker_id,
      conta_bancaria_id: isBanco ? data.entidade_id : undefined,
      projeto_id: contextoInicial?.projeto_id,
      parceiro_id: contextoInicial?.parceiro_id,
      contexto_metadata: contextoInicial?.contexto_metadata,
    });
    onOpenChange(false);
    form.reset();
    setObservadoresSelecionados([]);
  };

  const toggleObservador = (userId: string) => {
    setObservadoresSelecionados((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const executorId = form.watch('executor_id');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-400" />
            Nova Ocorrência
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {/* Título */}
            <FormField
              control={form.control}
              name="titulo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título *</FormLabel>
                  <FormControl>
                    <Input placeholder="Descreva brevemente o problema..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Tipo + Prioridade */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="tipo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo *</FormLabel>
                    <Select
                      onValueChange={(v) => {
                        field.onChange(v);
                        form.setValue('sub_motivo', '');
                      }}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o tipo" />
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
                name="prioridade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prioridade *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a prioridade" />
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
            </div>

            {/* Sub-motivo + Onde ocorreu */}
            <div className="grid grid-cols-2 gap-4">
              {subMotivos.length > 0 ? (
                <FormField
                  control={form.control}
                  name="sub_motivo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Motivo específico</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ''}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Qual o motivo específico?" />
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
              ) : <div />}

              <FormField
                control={form.control}
                name="contexto_entidade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Onde ocorreu? *</FormLabel>
                    <Select
                      onValueChange={(v) => {
                        field.onChange(v);
                        form.setValue('entidade_id', '');
                      }}
                      value={field.value || ''}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="bookmaker">Bookmaker</SelectItem>
                        <SelectItem value="banco">Banco</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Seletor da entidade específica */}
            {contextoEntidade && (
              <FormField
                control={form.control}
                name="entidade_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {contextoEntidade === 'bookmaker' ? 'Bookmaker *' : 'Conta Bancária *'}
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {contextoEntidade === 'bookmaker'
                          ? bookmakers.map((bk: any) => (
                              <SelectItem key={bk.id} value={bk.id}>
                                {bk.nome}
                                {bk.instance_identifier ? ` (${bk.instance_identifier})` : ''}
                              </SelectItem>
                            ))
                          : contasBancarias.map((cb: any) => (
                              <SelectItem key={cb.id} value={cb.id}>
                                {cb.banco} — {cb.titular || cb.conta || cb.agencia || 'Sem nome'}
                              </SelectItem>
                            ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Executor */}
            <FormField
              control={form.control}
              name="executor_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Executor Responsável *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Quem vai resolver esta ocorrência?" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {members.map((m) => (
                        <SelectItem key={m.user_id} value={m.user_id}>
                          {m.full_name || m.email || m.user_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Observadores */}
            <div className="space-y-2">
              <FormLabel className="text-sm font-medium">
                Observadores <span className="text-muted-foreground font-normal">(opcional)</span>
              </FormLabel>
              <div className="flex flex-wrap gap-2">
                {members
                  .filter((m) => m.user_id !== executorId)
                  .map((m) => {
                    const selected = observadoresSelecionados.includes(m.user_id);
                    return (
                      <Badge
                        key={m.user_id}
                        variant={selected ? 'default' : 'outline'}
                        className="cursor-pointer gap-1"
                        onClick={() => toggleObservador(m.user_id)}
                      >
                        {selected ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                        {m.full_name || m.email}
                      </Badge>
                    );
                  })}
              </div>
            </div>

            {/* Descrição */}
            <FormField
              control={form.control}
              name="descricao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Descreva o problema detalhadamente, incluindo valores, datas, e qualquer contexto relevante..."
                      className="min-h-[120px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Contexto pré-preenchido */}
            {contextoInicial?.contexto_metadata && (
              <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-sm">
                <p className="text-muted-foreground mb-1 font-medium">Contexto vinculado:</p>
                {Object.entries(contextoInicial.contexto_metadata).map(([k, v]) => (
                  <p key={k} className="text-foreground">
                    <span className="text-muted-foreground">{k}:</span> {String(v)}
                  </p>
                ))}
              </div>
            )}

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
                {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Criar Ocorrência
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
