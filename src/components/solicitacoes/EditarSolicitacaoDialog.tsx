import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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
import * as SelectPrimitive from '@radix-ui/react-select';
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
import { ClipboardList, Search, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

const schema = z.object({
  descricao: z.string().min(1, 'Descrição é obrigatória'),
  tipo: z.enum(['abertura_conta', 'verificacao_kyc', 'transferencia', 'outros'] as const),
  prazo: z.string().optional(),
  executor_id: z.string().min(1, 'Selecione o responsável'),
  bookmaker_ids: z.array(z.string()).optional(),
});

type FormData = z.infer<typeof schema>;

/** Dropdown genérico com busca */
function SearchableSelectContent({
  items,
  emptyMessage = 'Nenhum item encontrado',
  placeholder = 'Buscar...',
}: {
  items: { id: string; label: string }[];
  emptyMessage?: string;
  placeholder?: string;
}) {
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setSearch(''); }, [items.length]);
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => { e.stopPropagation(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const term = search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return items.filter((item) => {
      const label = item.label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return label.includes(term);
    });
  }, [items, search]);

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        className={cn(
          'relative z-[9999] max-h-96 min-w-[8rem] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl',
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
          'data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1',
          'min-w-[280px] w-[var(--radix-select-trigger-width)]',
        )}
        position="popper"
        sideOffset={4}
      >
        <div className="px-2 pt-2 pb-2 bg-popover border-b border-border">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="w-full h-8 pl-7 pr-2 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
        <SelectPrimitive.Viewport className="p-1 max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-3 text-center text-sm text-muted-foreground">
              {search.trim() ? 'Nenhum resultado encontrado' : emptyMessage}
            </div>
          ) : (
            filtered.map((item) => (
              <SelectItem key={item.id} value={item.id} className="py-2">
                <span className="truncate">{item.label}</span>
              </SelectItem>
            ))
          )}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
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

  const prazo = (solicitacao as unknown as { prazo?: string | null }).prazo;

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      descricao: solicitacao.descricao ?? '',
      tipo: solicitacao.tipo,
      prazo: prazo ?? undefined,
      executor_id: solicitacao.executor_id,
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
        executor_id: solicitacao.executor_id,
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
        label: m.full_name || m.email || m.user_id,
      })),
    [members],
  );

  const onSubmit = async (data: FormData) => {
    const selectedBms = workspaceBookmakers.filter((b) =>
      (data.bookmaker_ids ?? []).includes(b.id),
    );

    await editar({
      id: solicitacao.id,
      descricao: data.descricao,
      tipo: data.tipo,
      prazo: data.prazo ?? null,
      executor_id: data.executor_id,
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
            {/* Tipo + Prazo */}
            <div className="grid grid-cols-2 gap-4">
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
                  <FormItem className="flex flex-col">
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
                    {/* Preview das novas adicionadas */}
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

            {/* Executor */}
            <FormField
              control={form.control}
              name="executor_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Responsável pela Execução *</FormLabel>
                  {membersLoading ? (
                    <Skeleton className="h-9 w-full" />
                  ) : (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Quem vai executar esta solicitação?" />
                        </SelectTrigger>
                      </FormControl>
                      <SearchableSelectContent
                        items={memberItems}
                        placeholder="Buscar membro..."
                        emptyMessage="Nenhum membro encontrado neste workspace"
                      />
                    </Select>
                  )}
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
