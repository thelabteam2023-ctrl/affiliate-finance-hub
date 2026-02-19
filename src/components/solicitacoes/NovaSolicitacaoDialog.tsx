import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCriarSolicitacao } from '@/hooks/useSolicitacoes';
import { useWorkspaceMembers } from '@/hooks/useWorkspaceMembers';
import { useWorkspaceBookmakers } from '@/hooks/useWorkspaceBookmakers';
import {
  SOLICITACAO_TIPO_LABELS,
  SOLICITACAO_PRIORIDADE_LABELS,
} from '@/types/solicitacoes';
import type { SolicitacaoTipo, SolicitacaoPrioridade } from '@/types/solicitacoes';
import { ClipboardList, Loader2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const schema = z.object({
  titulo: z.string().min(5, 'Título deve ter pelo menos 5 caracteres').max(200),
  descricao: z.string().min(10, 'Descreva a solicitação com pelo menos 10 caracteres'),
  tipo: z.enum(['abertura_conta', 'verificacao_kyc', 'transferencia', 'outros'] as const),
  prioridade: z.enum(['baixa', 'media', 'alta', 'urgente'] as const),
  executor_id: z.string().min(1, 'Selecione o responsável pela execução'),
  bookmaker_id: z.string().optional(),
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

/** Dropdown genérico com busca — não depende de dados financeiros */
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

  useEffect(() => {
    setSearch('');
  }, [items.length]);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
  }, []);

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
                <div className="flex items-center gap-2">
                  {item.logo_url ? (
                    <img
                      src={item.logo_url}
                      alt={item.label}
                      className="h-5 w-5 rounded object-contain flex-shrink-0"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="h-5 w-5 rounded bg-muted flex-shrink-0" />
                  )}
                  <div className="flex flex-col">
                    <span>{item.label}</span>
                    {item.sublabel && (
                      <span className="text-xs text-muted-foreground">{item.sublabel}</span>
                    )}
                  </div>
                </div>
              </SelectItem>
            ))
          )}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
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
      prioridade: 'media',
      executor_id: '',
      bookmaker_id: '',
    },
  });

  const tipoSelecionado = form.watch('tipo');

  // Listas formatadas para o SearchableSelectContent
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

    if (data.tipo === 'abertura_conta' && data.bookmaker_id) {
      const bm = workspaceBookmakers.find((b) => b.id === data.bookmaker_id);
      metadata['bookmaker_id'] = data.bookmaker_id;
      if (bm) metadata['bookmaker_nome'] = bm.nome;
    }

    await criar({
      titulo: data.titulo,
      descricao: data.descricao,
      tipo: data.tipo,
      prioridade: data.prioridade,
      executor_id: data.executor_id,
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
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
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

            {/* Tipo + Prioridade */}
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
                        {(Object.entries(SOLICITACAO_PRIORIDADE_LABELS) as [SolicitacaoPrioridade, string][]).map(
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
            </div>

            {/* Bookmaker — apenas quando tipo = abertura_conta */}
            {tipoSelecionado === 'abertura_conta' && (
              <FormField
                control={form.control}
                name="bookmaker_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bookmaker *</FormLabel>
                    {bookmakersLoading ? (
                      <Skeleton className="h-10 w-full" />
                    ) : (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Qual bookmaker deve ser aberto?" />
                          </SelectTrigger>
                        </FormControl>
                        {bookmakerItems.length === 0 ? (
                          <SelectContent>
                            <div className="p-3 text-center text-sm text-muted-foreground">
                              Nenhuma bookmaker ativa neste workspace
                            </div>
                          </SelectContent>
                        ) : (
                          <SearchableSelectContent
                            items={bookmakerItems}
                            placeholder="Buscar bookmaker..."
                            emptyMessage="Nenhuma bookmaker ativa neste workspace"
                          />
                        )}
                      </Select>
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
                    <Skeleton className="h-10 w-full" />
                  ) : (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
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
