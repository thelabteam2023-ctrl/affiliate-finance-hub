import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
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
import * as SelectPrimitive from '@radix-ui/react-select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { useCriarSolicitacao } from '@/hooks/useSolicitacoes';
import { useWorkspaceMembers } from '@/hooks/useWorkspaceMembers';
import { useWorkspaceBookmakers } from '@/hooks/useWorkspaceBookmakers';
import { SOLICITACAO_TIPO_LABELS } from '@/types/solicitacoes';
import type { SolicitacaoTipo } from '@/types/solicitacoes';
import { CalendarIcon, ClipboardList, Loader2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const schema = z.object({
  titulo: z.string().min(5, 'Título deve ter pelo menos 5 caracteres').max(200),
  descricao: z.string().min(10, 'Descreva a solicitação com pelo menos 10 caracteres'),
  tipo: z.enum(['abertura_conta', 'verificacao_kyc', 'transferencia', 'outros'] as const),
  prazo: z.date({ required_error: 'Selecione o prazo limite' }),
  executor_id: z.string().min(1, 'Selecione o responsável pela execução'),
  bookmaker_ids: z.array(z.string()).optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contextoInicial?: {
    tipo?: SolicitacaoTipo;
    titulo?: string;
    bookmaker_id?: string;
    projeto_id?: string;
    parceiro_id?: string;
    contexto_metadata?: Record<string, unknown>;
  };
}

/** Dropdown genérico com busca */
function SearchableSelectContent({
  items,
  emptyMessage = 'Nenhum item encontrado',
  placeholder = 'Buscar...',
}: {
  items: { id: string; label: string; sublabel?: string; logo_url?: string }[];
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
                <div className="flex items-center gap-2 w-full">
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
                  <span className="truncate">{item.label}</span>
                </div>
              </SelectItem>
            ))
          )}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

/** Multi-select de bookmakers com checkboxes */
function BookmakerMultiSelect({
  items,
  value,
  onChange,
  loading,
}: {
  items: { id: string; label: string; logo_url?: string }[];
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
        <div className="max-h-60 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="p-3 text-center text-sm text-muted-foreground">
              {search.trim() ? 'Nenhum resultado' : 'Nenhuma bookmaker ativa'}
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
  );
}

export function NovaSolicitacaoDialog({ open, onOpenChange, contextoInicial }: Props) {
  const { mutateAsync: criar, isPending } = useCriarSolicitacao();
  const { data: members = [], isLoading: membersLoading } = useWorkspaceMembers();
  const { data: workspaceBookmakers = [], isLoading: bookmakersLoading } = useWorkspaceBookmakers();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      titulo: contextoInicial?.titulo || '',
      descricao: '',
      tipo: contextoInicial?.tipo || 'outros',
      prazo: undefined,
      executor_id: '',
      bookmaker_ids: [],
    },
  });

  const tipoSelecionado = form.watch('tipo');

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
    const metadata: Record<string, unknown> = {
      ...(contextoInicial?.contexto_metadata ?? {}),
    };

    if (data.tipo === 'abertura_conta' && data.bookmaker_ids?.length) {
      const selectedBms = workspaceBookmakers.filter((b) => data.bookmaker_ids!.includes(b.id));
      metadata['bookmaker_ids'] = data.bookmaker_ids;
      metadata['bookmaker_nomes'] = selectedBms.map((b) => b.nome).join(', ');
    }

    await criar({
      titulo: data.titulo,
      descricao: data.descricao,
      tipo: data.tipo,
      prazo: data.prazo.toISOString(),
      executor_id: data.executor_id,
      bookmaker_ids: data.tipo === 'abertura_conta' ? (data.bookmaker_ids ?? []) : [],
      bookmaker_id: contextoInicial?.bookmaker_id,
      projeto_id: contextoInicial?.projeto_id,
      parceiro_id: contextoInicial?.parceiro_id,
      contexto_metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    });
    onOpenChange(false);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            Nova Solicitação
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
                  <FormLabel>Título *</FormLabel>
                  <FormControl>
                    <Input placeholder="Descreva brevemente a solicitação..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                        <SelectTrigger className="[&>span]:w-full [&>span]:text-center">
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

              {/* Prazo limite (substitui Prioridade) */}
              <FormField
                control={form.control}
                name="prazo"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Prazo Limite *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full h-9 px-3 justify-center font-normal border-input gap-2',
                              !field.value && 'text-muted-foreground',
                            )}
                          >
                            <CalendarIcon className="h-4 w-4 shrink-0" />
                            {field.value
                              ? format(field.value, 'dd/MM/yyyy', { locale: ptBR })
                              : 'Selecionar data'}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 z-[9999]" align="center">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                          initialFocus
                          locale={ptBR}
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Bookmakers — multi-select, apenas quando tipo = abertura_conta */}
            {tipoSelecionado === 'abertura_conta' && (
              <FormField
                control={form.control}
                name="bookmaker_ids"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bookmakers *</FormLabel>
                    <BookmakerMultiSelect
                      items={bookmakerItems}
                      value={field.value ?? []}
                      onChange={field.onChange}
                      loading={bookmakersLoading}
                    />
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
                        <SelectTrigger className="h-9 [&>span]:w-full [&>span]:text-center">
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
                      placeholder="Detalhe o que precisa ser feito, incluindo todas as informações necessárias para execução..."
                      className="min-h-[100px]"
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

            <div className="flex justify-end gap-2 pt-1">
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
                Criar Solicitação
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
