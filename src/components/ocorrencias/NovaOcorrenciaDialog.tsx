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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useCriarOcorrencia } from '@/hooks/useOcorrencias';
import { useWorkspaceMembers } from '@/hooks/useWorkspaceMembers';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { TIPO_LABELS, PRIORIDADE_LABELS, SUB_MOTIVOS } from '@/types/ocorrencias';
import type { OcorrenciaTipo, OcorrenciaPrioridade } from '@/types/ocorrencias';
import { AlertTriangle, Loader2, Plus, X, ChevronsUpDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const [bookmakerPopoverOpen, setBookmakerPopoverOpen] = useState(false);
  const [bancoPopoverOpen, setBancoPopoverOpen] = useState(false);
  const [selectedCasa, setSelectedCasa] = useState<string>('');

  // Carregar bookmakers do workspace
  const { data: bookmakers = [] } = useQuery({
    queryKey: ['ocorrencia-bookmakers', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookmakers')
        .select('id, nome, instance_identifier, parceiro_id, parceiros!bookmakers_parceiro_id_fkey (nome)')
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

  // Casas únicas para o primeiro select
  const casasUnicas = [...new Set((bookmakers as any[]).map((bk) => bk.nome).filter(Boolean))].sort();

  // Vínculos filtrados pela casa selecionada
  const vinculosDaCasa = selectedCasa
    ? (bookmakers as any[]).filter((bk) => bk.nome === selectedCasa)
    : [];

  // Agrupar contas bancárias por banco
  const contasPorBanco = (contasBancarias as any[]).reduce<Record<string, any[]>>((acc, cb) => {
    const banco = cb.banco || 'Sem banco';
    if (!acc[banco]) acc[banco] = [];
    acc[banco].push(cb);
    return acc;
  }, {});

  // Label do bookmaker selecionado
  const selectedBookmaker = (bookmakers as any[]).find((bk) => bk.id === form.watch('entidade_id'));
  const selectedConta = (contasBancarias as any[]).find((cb) => cb.id === form.watch('entidade_id'));

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
                        setSelectedCasa('');
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

            {/* Seletor de Bookmaker: Casa + Vínculo */}
            {contextoEntidade === 'bookmaker' && (
              <div className="grid grid-cols-2 gap-4">
                {/* Select da Casa */}
                <FormItem>
                  <FormLabel>Casa *</FormLabel>
                  <Select
                    value={selectedCasa}
                    onValueChange={(v) => {
                      setSelectedCasa(v);
                      form.setValue('entidade_id', '');
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a casa" />
                    </SelectTrigger>
                    <SelectContent>
                      {casasUnicas.map((casa) => (
                        <SelectItem key={casa} value={casa}>
                          {casa}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>

                {/* Select do Vínculo com busca por parceiro */}
                <FormField
                  control={form.control}
                  name="entidade_id"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Vínculo *</FormLabel>
                      <Popover open={bookmakerPopoverOpen} onOpenChange={setBookmakerPopoverOpen}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              disabled={!selectedCasa}
                              className={cn(
                                'w-full justify-between font-normal',
                                !field.value && 'text-muted-foreground'
                              )}
                            >
                              {selectedBookmaker ? (
                                <span className="truncate">
                                  {selectedBookmaker.parceiros?.nome || 'Sem parceiro'}
                                  {selectedBookmaker.instance_identifier ? ` (${selectedBookmaker.instance_identifier})` : ''}
                                </span>
                              ) : (
                                selectedCasa ? 'Selecione o vínculo...' : 'Selecione a casa primeiro'
                              )}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Buscar por parceiro..." />
                            <CommandList>
                              <CommandEmpty>Nenhum vínculo encontrado.</CommandEmpty>
                              <CommandGroup>
                                {vinculosDaCasa.map((bk: any) => (
                                  <CommandItem
                                    key={bk.id}
                                    value={`${bk.parceiros?.nome || ''} ${bk.instance_identifier || ''}`}
                                    onSelect={() => {
                                      field.onChange(bk.id);
                                      setBookmakerPopoverOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        'mr-2 h-4 w-4',
                                        field.value === bk.id ? 'opacity-100' : 'opacity-0'
                                      )}
                                    />
                                    <span className="font-medium">
                                      {bk.parceiros?.nome || 'Sem parceiro'}
                                      {bk.instance_identifier ? ` (${bk.instance_identifier})` : ''}
                                    </span>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Seletor de Conta Bancária com busca agrupada por banco */}
            {contextoEntidade === 'banco' && (
              <FormField
                control={form.control}
                name="entidade_id"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Conta Bancária *</FormLabel>
                    <Popover open={bancoPopoverOpen} onOpenChange={setBancoPopoverOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            className={cn(
                              'w-full justify-between font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {selectedConta ? (
                              <span className="truncate">
                                {selectedConta.banco} — {selectedConta.titular || selectedConta.conta || 'Sem nome'}
                              </span>
                            ) : (
                              'Selecione a conta...'
                            )}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Buscar banco ou titular..." />
                          <CommandList>
                            <CommandEmpty>Nenhuma conta encontrada.</CommandEmpty>
                            {Object.entries(contasPorBanco)
                              .sort(([a], [b]) => a.localeCompare(b))
                              .map(([banco, contas]) => (
                                <CommandGroup key={banco} heading={banco}>
                                  {contas.map((cb: any) => (
                                    <CommandItem
                                      key={cb.id}
                                      value={`${cb.banco} ${cb.titular || ''} ${cb.conta || ''}`}
                                      onSelect={() => {
                                        field.onChange(cb.id);
                                        setBancoPopoverOpen(false);
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          'mr-2 h-4 w-4',
                                          field.value === cb.id ? 'opacity-100' : 'opacity-0'
                                        )}
                                      />
                                      <span>{cb.titular || cb.conta || cb.agencia || 'Sem nome'}</span>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              ))}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
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
