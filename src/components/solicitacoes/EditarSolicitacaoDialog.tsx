import { useForm } from 'react-hook-form';
import { getFirstLastName } from '@/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { useEditarSolicitacao } from '@/hooks/useSolicitacoes';
import { useWorkspaceMembers } from '@/hooks/useWorkspaceMembers';
import { useWorkspaceBookmakers } from '@/hooks/useWorkspaceBookmakers';
import { SOLICITACAO_TIPO_LABELS } from '@/types/solicitacoes';
import type { Solicitacao, SolicitacaoTipo } from '@/types/solicitacoes';
import { ClipboardList, Search, Pencil, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const schema = z.object({
  descricao: z.string().min(1, 'Descrição é obrigatória'),
  tipo: z.enum(['abertura_conta', 'verificacao_kyc', 'transferencia', 'outros'] as const),
  prazo: z.string().optional(),
  executor_ids: z.array(z.string()).min(1, 'Selecione ao menos um responsável'),
  bookmaker_ids: z.array(z.string()).optional(),
});

type FormData = z.infer<typeof schema>;

/** Multi-select de membros com checkboxes */
function MemberMultiSelect({
  items,
  value,
  onChange,
  loading,
}: {
  items: { id: string; label: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
  loading: boolean;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const term = search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return items.filter((item) =>
      item.label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(term),
    );
  }, [items, search]);

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  const allSelected = items.length > 0 && items.every((i) => value.includes(i.id));
  const someSelected = value.length > 0 && !allSelected;

  const toggleAll = () => {
    if (allSelected) {
      onChange([]);
    } else {
      onChange(items.map((i) => i.id));
    }
  };

  const selectedLabels = useMemo(
    () => value.map((id) => items.find((i) => i.id === id)?.label).filter(Boolean) as string[],
    [value, items],
  );

  if (loading) return <Skeleton className="h-9 w-full" />;

  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            className={cn(
              'w-full h-9 px-3 justify-between font-normal border-input',
              value.length === 0 && 'text-muted-foreground',
            )}
          >
            <span className="truncate text-sm">
              {value.length === 0
                ? 'Quem vai executar esta solicitação?'
                : value.length === 1
                ? selectedLabels[0]
                : `${value.length} responsáveis selecionados`}
            </span>
            <span className="ml-2 text-muted-foreground text-xs shrink-0">▼</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0 z-[9999]"
          align="start"
          sideOffset={4}
        >
          <div className="px-2 pt-2 pb-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar membro..."
                className="w-full h-8 pl-7 pr-2 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
          {!search.trim() && items.length > 0 && (
            <div
              onClick={toggleAll}
              className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent text-sm border-b border-border"
            >
              <Checkbox
                checked={allSelected}
                data-state={someSelected ? 'indeterminate' : allSelected ? 'checked' : 'unchecked'}
                onCheckedChange={toggleAll}
                className="pointer-events-none"
              />
              <span className="font-medium text-foreground">Selecionar todos</span>
            </div>
          )}
          <div className="max-h-60 overflow-y-auto p-1" onWheel={(e) => e.stopPropagation()}>
            {filtered.length === 0 ? (
              <p className="p-3 text-center text-sm text-muted-foreground">
                {search.trim() ? 'Nenhum resultado' : 'Nenhum membro encontrado'}
              </p>
            ) : (
              filtered.map((item) => (
                <div
                  key={item.id}
                  onClick={() => toggle(item.id)}
                  className="flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer hover:bg-accent text-sm"
                >
                  <Checkbox
                    checked={value.includes(item.id)}
                    onCheckedChange={() => toggle(item.id)}
                    className="pointer-events-none"
                  />
                  <span className="truncate">{item.label}</span>
                </div>
              ))
            )}
          </div>
          {value.length > 0 && (
            <div className="border-t border-border px-2 py-1.5">
              <button
                onClick={() => onChange([])}
                className="text-xs text-muted-foreground hover:text-foreground w-full text-left"
              >
                Limpar seleção ({value.length})
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Badges dos selecionados */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedLabels.map((label, i) => (
            <span
              key={value[i]}
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30"
            >
              {label}
              <button
                type="button"
                onClick={() => toggle(value[i])}
                className="hover:text-primary/70"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Multi-select de bookmakers com destaque das novas */
function BookmakerMultiSelect({
  items,
  value,
  onChange,
  loading,
  originalIds,
}: {
  items: { id: string; label: string; logo_url?: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
  loading: boolean;
  originalIds: string[];
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const term = search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return items.filter((item) =>
      item.label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(term),
    );
  }, [items, search]);

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  const label = useMemo(() => {
    if (value.length === 0) return null;
    if (value.length === 1) {
      const bm = items.find((i) => i.id === value[0]);
      return bm?.label ?? '1 selecionada';
    }
    return `${value.length} bookmakers selecionadas`;
  }, [value, items]);

  if (loading) return <Skeleton className="h-9 w-full" />;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className={cn(
            'w-full h-9 px-3 justify-between font-normal border-input',
            !label && 'text-muted-foreground',
          )}
        >
          <span className="truncate text-sm">{label ?? 'Selecionar bookmakers...'}</span>
          <span className="ml-2 text-muted-foreground text-xs shrink-0">▼</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0 z-[9999]"
        align="start"
        sideOffset={4}
      >
        <div className="px-2 pt-2 pb-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar bookmaker..."
              className="w-full h-8 pl-7 pr-2 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
        <div className="max-h-60 overflow-y-auto p-1" onWheel={(e) => e.stopPropagation()}>
          {filtered.length === 0 ? (
            <p className="p-3 text-center text-sm text-muted-foreground">
              {search.trim() ? 'Nenhum resultado' : 'Nenhuma bookmaker ativa'}
            </p>
          ) : (
            filtered.map((item) => {
              const isNova = value.includes(item.id) && !originalIds.includes(item.id);
              return (
                <div
                  key={item.id}
                  onClick={() => toggle(item.id)}
                  className={cn(
                    'flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer hover:bg-accent text-sm',
                    isNova && 'bg-primary/5',
                  )}
                >
                  <Checkbox
                    checked={value.includes(item.id)}
                    onCheckedChange={() => toggle(item.id)}
                    className="pointer-events-none"
                  />
                  {item.logo_url ? (
                    <img
                      src={item.logo_url}
                      alt={item.label}
                      className="h-4 w-4 rounded object-contain flex-shrink-0"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="h-4 w-4 rounded bg-muted flex-shrink-0" />
                  )}
                  <span className={cn('truncate', isNova && 'text-primary font-medium')}>
                    {item.label}
                  </span>
                  {isNova && (
                    <span className="ml-auto text-[10px] text-primary font-semibold uppercase tracking-wide shrink-0">
                      nova
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
        {value.length > 0 && (
          <div className="border-t border-border px-2 py-1.5">
            <button
              onClick={() => onChange([])}
              className="text-xs text-muted-foreground hover:text-foreground w-full text-left"
            >
              Limpar seleção ({value.length})
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

interface Props {
  solicitacao: Solicitacao;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditarSolicitacaoDialog({ solicitacao, open, onOpenChange }: Props) {
  const { mutateAsync: editar, isPending } = useEditarSolicitacao();
  const { data: members = [], isLoading: membersLoading } = useWorkspaceMembers();
  const { data: workspaceBookmakers = [], isLoading: bookmakersLoading } = useWorkspaceBookmakers();

  // IDs originais das bookmakers (antes da edição)
  const originalBookmakerIds = useMemo<string[]>(() => {
    const meta = solicitacao.contexto_metadata as Record<string, unknown> | null;
    if (!meta) return [];
    const ids = meta['bookmaker_ids'];
    if (Array.isArray(ids)) return ids as string[];
    return [];
  }, [solicitacao]);

  // IDs dos executores atuais — suporte a múltiplos ou legado único
  const originalExecutorIds = useMemo<string[]>(() => {
    const meta = solicitacao.contexto_metadata as Record<string, unknown> | null;
    if (meta) {
      const ids = meta['executor_ids'];
      if (Array.isArray(ids) && ids.length > 0) return ids as string[];
    }
    return solicitacao.executor_id ? [solicitacao.executor_id] : [];
  }, [solicitacao]);

  const prazo = (solicitacao as unknown as { prazo?: string | null }).prazo;

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      descricao: solicitacao.descricao ?? '',
      tipo: solicitacao.tipo,
      prazo: prazo ?? undefined,
      executor_ids: originalExecutorIds,
      bookmaker_ids: originalBookmakerIds,
    },
  });

  // Reset quando abre
  useEffect(() => {
    if (open) {
      form.reset({
        descricao: solicitacao.descricao ?? '',
        tipo: solicitacao.tipo,
        prazo: prazo ?? undefined,
        executor_ids: originalExecutorIds,
        bookmaker_ids: originalBookmakerIds,
      });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const tipoSelecionado = form.watch('tipo');
  const bookmakerIdsWatch = form.watch('bookmaker_ids') ?? [];

  const bookmakerItems = useMemo(
    () =>
      workspaceBookmakers.map((bm) => ({
        id: bm.id,
        label: bm.nome,
        logo_url: bm.logo_url ?? undefined,
      })),
    [workspaceBookmakers],
  );

  const memberItems = useMemo(
    () =>
      members.map((m) => ({
        id: m.user_id,
        label: m.full_name ? getFirstLastName(m.full_name) : (m.email || m.user_id),
      })),
    [members],
  );

  const onSubmit = async (data: FormData) => {
    const selectedBms = workspaceBookmakers.filter((b) =>
      (data.bookmaker_ids ?? []).includes(b.id),
    );

    const executorNomes = data.executor_ids.map(
      (id) => members.find((m) => m.user_id === id)?.full_name || id,
    );

    await editar({
      id: solicitacao.id,
      descricao: data.descricao,
      tipo: data.tipo,
      prazo: data.prazo ?? null,
      executor_id: data.executor_ids[0],
      executor_ids: data.executor_ids,
      executor_nomes: executorNomes,
      bookmaker_ids: data.tipo === 'abertura_conta' ? (data.bookmaker_ids ?? []) : [],
      bookmaker_nomes: selectedBms.map((b) => b.nome).join(', '),
      bookmaker_ids_originais: originalBookmakerIds,
      contexto_metadata: solicitacao.contexto_metadata as Record<string, unknown> | null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            Editar Solicitação
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Tipo + Prazo — alinhados */}
            <div className="grid grid-cols-2 gap-4 items-start">
              <FormField
                control={form.control}
                name="tipo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o tipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(Object.entries(SOLICITACAO_TIPO_LABELS) as [SolicitacaoTipo, string][]).map(
                          ([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="prazo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prazo Limite</FormLabel>
                    <FormControl>
                      <DateTimePicker
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Selecionar data e hora"
                        fromYear={new Date().getFullYear()}
                        toYear={new Date().getFullYear() + 3}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Bookmakers — apenas quando tipo = abertura_conta */}
            {tipoSelecionado === 'abertura_conta' && (
              <FormField
                control={form.control}
                name="bookmaker_ids"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bookmakers</FormLabel>
                    <BookmakerMultiSelect
                      items={bookmakerItems}
                      value={field.value ?? []}
                      onChange={field.onChange}
                      loading={bookmakersLoading}
                      originalIds={originalBookmakerIds}
                    />
                    {bookmakerIdsWatch.some((id) => !originalBookmakerIds.includes(id)) && (
                      <p className="text-xs text-primary mt-1 flex items-center gap-1">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary" />
                        Novas casas serão destacadas para o executor
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Responsáveis — multi-select */}
            <FormField
              control={form.control}
              name="executor_ids"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Responsáveis pela Execução *</FormLabel>
                  <MemberMultiSelect
                    items={memberItems}
                    value={field.value}
                    onChange={field.onChange}
                    loading={membersLoading}
                  />
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
                  <FormLabel>Descrição *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Detalhe o que precisa ser feito..."
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Salvando...' : 'Salvar alterações'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
