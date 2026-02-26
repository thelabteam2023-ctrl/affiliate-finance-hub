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
import { AlertTriangle, Loader2, X, ChevronsUpDown, Check, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getFirstLastName } from '@/lib/utils';

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
  const [executoresSelecionados, setExecutoresSelecionados] = useState<string[]>([]);
  const [bookmakerPopoverOpen, setBookmakerPopoverOpen] = useState(false);
  const [casaPopoverOpen, setCasaPopoverOpen] = useState(false);
  const [bancoPopoverOpen, setBancoPopoverOpen] = useState(false);
  const [selectedCasa, setSelectedCasa] = useState<string>('');

  // Carregar bookmakers do workspace com logo do catálogo
  const { data: bookmakers = [] } = useQuery({
    queryKey: ['ocorrencia-bookmakers', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookmakers')
        .select('id, nome, instance_identifier, parceiro_id, bookmaker_catalogo_id, parceiros!bookmakers_parceiro_id_fkey (nome), bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url)')
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
    },
  });

  const tipoSelecionado = form.watch('tipo');
  const contextoEntidade = form.watch('contexto_entidade');
  const subMotivos = SUB_MOTIVOS[tipoSelecionado] || [];

  // Casas únicas com logo (derivadas dos bookmakers operacionais do workspace)
  const casasUnicasMap = (bookmakers as any[]).reduce<Record<string, string | null>>((acc, bk) => {
    if (bk.nome && !acc.hasOwnProperty(bk.nome)) {
      acc[bk.nome] = (bk.bookmakers_catalogo as any)?.logo_url ?? null;
    }
    return acc;
  }, {});
  const casasUnicas = Object.keys(casasUnicasMap).sort();

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

  const allSelected = executoresSelecionados.length === members.length && members.length > 0;

  const toggleExecutor = (userId: string) => {
    setExecutoresSelecionados((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const toggleTodos = () => {
    if (allSelected) {
      setExecutoresSelecionados([]);
    } else {
      setExecutoresSelecionados(members.map((m) => m.user_id));
    }
  };

  const onSubmit = async (data: FormData) => {
    if (executoresSelecionados.length === 0) return;

    const isBookmaker = data.contexto_entidade === 'bookmaker';
    const isBanco = data.contexto_entidade === 'banco';

    // Criar uma ocorrência por executor selecionado
    for (const executorId of executoresSelecionados) {
      await criar({
        titulo: data.titulo,
        descricao: data.descricao,
        tipo: data.tipo,
        sub_motivo: data.sub_motivo || null,
        prioridade: data.prioridade,
        executor_id: executorId,
        bookmaker_id: isBookmaker ? data.entidade_id : contextoInicial?.bookmaker_id,
        conta_bancaria_id: isBanco ? data.entidade_id : undefined,
        projeto_id: contextoInicial?.projeto_id,
        parceiro_id: contextoInicial?.parceiro_id,
        contexto_metadata: contextoInicial?.contexto_metadata,
      });
    }

    onOpenChange(false);
    form.reset();
    setExecutoresSelecionados([]);
  };

  const executorError = executoresSelecionados.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Nova Ocorrência
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (executoresSelecionados.length === 0) return;
            form.handleSubmit(onSubmit)(e);
          }} className="space-y-5">
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
                {/* Select da Casa com busca e logos */}
                <FormItem className="flex flex-col">
                  <FormLabel>Casa *</FormLabel>
                  <Popover open={casaPopoverOpen} onOpenChange={setCasaPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className={cn(
                          'w-full justify-between font-normal h-10',
                          !selectedCasa && 'text-muted-foreground'
                        )}
                      >
                        {selectedCasa ? (
                          <span className="flex items-center gap-2 truncate">
                            {casasUnicasMap[selectedCasa] && (
                              <img src={casasUnicasMap[selectedCasa]!} alt="" className="h-5 w-5 rounded object-contain shrink-0" />
                            )}
                            {selectedCasa}
                          </span>
                        ) : (
                          'Selecione a casa'
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar casa..." />
                        <CommandList>
                          <CommandEmpty>Nenhuma casa encontrada.</CommandEmpty>
                          <CommandGroup>
                            {casasUnicas.map((casa) => (
                              <CommandItem
                                key={casa}
                                value={casa}
                                onSelect={() => {
                                  setSelectedCasa(casa);
                                  form.setValue('entidade_id', '');
                                  setCasaPopoverOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4 shrink-0',
                                    selectedCasa === casa ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                                {casasUnicasMap[casa] && (
                                  <img src={casasUnicasMap[casa]!} alt="" className="h-5 w-5 rounded object-contain shrink-0 mr-2" />
                                )}
                                <span>{casa}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
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
                                'w-full justify-between font-normal h-10',
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

            {/* Executor Responsável - Multi-select */}
            <div className="space-y-2.5">
              <FormLabel className="text-sm font-medium">
                Executor Responsável *
              </FormLabel>
              <div className="flex flex-wrap gap-1.5">
                {/* Botão Todos */}
                <Badge
                  variant={allSelected ? 'default' : 'outline'}
                  className={cn(
                    'cursor-pointer gap-1.5 px-3 py-1.5 text-xs font-medium transition-all',
                    allSelected
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'hover:bg-accent hover:text-accent-foreground'
                  )}
                  onClick={toggleTodos}
                >
                  <Users className="h-3 w-3" />
                  Todos
                </Badge>

                {members.map((m) => {
                  const selected = executoresSelecionados.includes(m.user_id);
                  const displayName = getFirstLastName(m.full_name || m.email || '');
                  return (
                    <Badge
                      key={m.user_id}
                      variant={selected ? 'default' : 'outline'}
                      className={cn(
                        'cursor-pointer gap-1 px-3 py-1.5 text-xs font-medium transition-all',
                        selected
                          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                          : 'hover:bg-accent hover:text-accent-foreground'
                      )}
                      onClick={() => toggleExecutor(m.user_id)}
                    >
                      {selected ? <Check className="h-3 w-3" /> : null}
                      {displayName}
                    </Badge>
                  );
                })}
              </div>
              {executorError && (
                <p className="text-[0.8rem] font-medium text-destructive">
                  Selecione pelo menos um executor
                </p>
              )}
              {executoresSelecionados.length > 1 && (
                <p className="text-xs text-muted-foreground">
                  Será criada uma ocorrência para cada executor selecionado ({executoresSelecionados.length} ocorrências)
                </p>
              )}
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
              <Button type="submit" disabled={isPending || executoresSelecionados.length === 0}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {executoresSelecionados.length > 1
                  ? `Criar ${executoresSelecionados.length} Ocorrências`
                  : 'Criar Ocorrência'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
