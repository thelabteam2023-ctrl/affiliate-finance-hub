import { useForm, Controller } from 'react-hook-form';
import { getFirstLastName } from '@/lib/utils';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { useCriarSolicitacao } from '@/hooks/useSolicitacoes';
import { useWorkspaceMembers } from '@/hooks/useWorkspaceMembers';
import { useWorkspaceBookmakers } from '@/hooks/useWorkspaceBookmakers';
import { SOLICITACAO_TIPO_LABELS } from '@/types/solicitacoes';
import type { SolicitacaoTipo } from '@/types/solicitacoes';
import { KycBookmakerSelect } from './KycBookmakerSelect';
import type { OperationalBookmakerOption } from '@/hooks/useOperationalBookmakers';
import { ClipboardList, Loader2, Search, X, ArrowRight, MoveRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---- Tipos para o bloco de Transferência ----
const PLATAFORMA_LABELS: Record<string, string> = {
  bookmaker: 'Bookmaker',
  exchange: 'Exchange',
  wallet: 'Wallet',
  banco: 'Banco',
};

const MOEDAS_TRANSFERENCIA = [
  'BRL', 'USD', 'EUR', 'USDT', 'BTC', 'ETH', 'PIX', 'Outro',
];

interface TransferenciaBloco {
  dono: string;
  plataforma: string;
  conta: string;
}

const transferenciaSchema = z.object({
  origem_dono: z.string().min(1, 'Informe o dono da origem'),
  origem_plataforma: z.string().min(1, 'Selecione a plataforma de origem'),
  origem_conta: z.string().min(1, 'Informe a conta/wallet de origem'),
  destino_dono: z.string().min(1, 'Informe o dono do destino'),
  destino_plataforma: z.string().min(1, 'Selecione a plataforma de destino'),
  destino_conta: z.string().min(1, 'Informe a conta/wallet de destino'),
  transferencia_valor: z.string().min(1, 'Informe o valor'),
  transferencia_moeda: z.string().min(1, 'Selecione a moeda'),
});

const schema = z.object({
  descricao: z.string().min(10, 'Descreva a solicitação com pelo menos 10 caracteres'),
  tipo: z.enum(['abertura_conta', 'verificacao_kyc', 'transferencia', 'outros'] as const),
  prazo: z.string().min(1, 'Selecione o prazo limite'),
  executor_ids: z.array(z.string()).min(1, 'Selecione ao menos um responsável'),
  bookmaker_ids: z.array(z.string()).optional(),
  kyc_bookmaker_id: z.string().optional(),
  // Transferência
  origem_dono: z.string().optional(),
  origem_plataforma: z.string().optional(),
  origem_conta: z.string().optional(),
  destino_dono: z.string().optional(),
  destino_plataforma: z.string().optional(),
  destino_conta: z.string().optional(),
  transferencia_valor: z.string().optional(),
  transferencia_moeda: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.tipo === 'transferencia') {
    if (!data.origem_dono?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Informe o dono da origem', path: ['origem_dono'] });
    if (!data.origem_plataforma?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Selecione a plataforma', path: ['origem_plataforma'] });
    if (!data.origem_conta?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Informe a conta/wallet', path: ['origem_conta'] });
    if (!data.destino_dono?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Informe o dono do destino', path: ['destino_dono'] });
    if (!data.destino_plataforma?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Selecione a plataforma', path: ['destino_plataforma'] });
    if (!data.destino_conta?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Informe a conta/wallet', path: ['destino_conta'] });
    if (!data.transferencia_valor?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Informe o valor', path: ['transferencia_valor'] });
    if (!data.transferencia_moeda?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Selecione a moeda', path: ['transferencia_moeda'] });
    // Origem e destino não podem ser iguais
    if (
      data.origem_dono?.trim() && data.origem_conta?.trim() &&
      data.destino_dono?.trim() && data.destino_conta?.trim() &&
      data.origem_dono.trim().toLowerCase() === data.destino_dono.trim().toLowerCase() &&
      data.origem_conta.trim().toLowerCase() === data.destino_conta.trim().toLowerCase()
    ) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Origem e destino não podem ser iguais', path: ['destino_conta'] });
    }
  }
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
  const [kycBookmakerData, setKycBookmakerData] = useState<OperationalBookmakerOption | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      descricao: '',
      tipo: contextoInicial?.tipo || 'outros',
      prazo: undefined,
      executor_ids: [],
      bookmaker_ids: [],
      kyc_bookmaker_id: '',
    },
  });

  const tipoSelecionado = form.watch('tipo');

  // Watch campos de transferência para o preview automático
  const origemDono = form.watch('origem_dono');
  const origemConta = form.watch('origem_conta');
  const destinoDono = form.watch('destino_dono');
  const destinoConta = form.watch('destino_conta');
  const transferenciaValor = form.watch('transferencia_valor');
  const transferenciaMoeda = form.watch('transferencia_moeda');

  const transferenciaResumo = useMemo(() => {
    if (tipoSelecionado !== 'transferencia') return null;
    if (!transferenciaValor || !transferenciaMoeda || !origemConta || !origemDono || !destinoConta || !destinoDono) return null;
    return `Transferir ${transferenciaValor} ${transferenciaMoeda} de ${origemConta} (${origemDono}) para ${destinoConta} (${destinoDono})`;
  }, [tipoSelecionado, transferenciaValor, transferenciaMoeda, origemConta, origemDono, destinoConta, destinoDono]);

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
    const metadata: Record<string, unknown> = {
      ...(contextoInicial?.contexto_metadata ?? {}),
    };

    if (data.tipo === 'abertura_conta' && data.bookmaker_ids?.length) {
      const selectedBms = workspaceBookmakers.filter((b) => data.bookmaker_ids!.includes(b.id));
      metadata['bookmaker_ids'] = data.bookmaker_ids;
      metadata['bookmaker_nomes'] = selectedBms.map((b) => b.nome).join(', ');
    }

    // KYC: armazena detalhes da conta selecionada no metadata
    if (data.tipo === 'verificacao_kyc' && data.kyc_bookmaker_id && kycBookmakerData) {
      metadata['kyc_bookmaker_id'] = data.kyc_bookmaker_id;
      metadata['kyc_bookmaker_nome'] = kycBookmakerData.nome;
      metadata['kyc_parceiro_nome'] = kycBookmakerData.parceiro_nome ?? null;
      metadata['kyc_projeto_nome'] = kycBookmakerData.projeto_nome ?? null;
    }

    // Transferência: armazena blocos de origem/destino
    if (data.tipo === 'transferencia') {
      metadata['transferencia'] = {
        origem: { dono: data.origem_dono, plataforma: data.origem_plataforma, conta: data.origem_conta },
        destino: { dono: data.destino_dono, plataforma: data.destino_plataforma, conta: data.destino_conta },
        valor: data.transferencia_valor,
        moeda: data.transferencia_moeda,
        resumo: `Transferir ${data.transferencia_valor} ${data.transferencia_moeda} de ${data.origem_conta} (${data.origem_dono}) para ${data.destino_conta} (${data.destino_dono})`,
      };
    }

    // Armazena múltiplos executores no metadata
    const executorNomes = data.executor_ids.map(
      (id) => members.find((m) => m.user_id === id)?.full_name || id,
    );
    metadata['executor_ids'] = data.executor_ids;
    metadata['executor_nomes'] = executorNomes;

    // Usar o label do tipo como título
    const tituloGerado = SOLICITACAO_TIPO_LABELS[data.tipo];

    // executor_id principal = primeiro da lista (compatibilidade)
    await criar({
      titulo: tituloGerado,
      descricao: data.descricao,
      tipo: data.tipo,
      prazo: data.prazo,
      executor_id: data.executor_ids[0],
      bookmaker_ids: data.tipo === 'abertura_conta' ? (data.bookmaker_ids ?? []) : [],
      bookmaker_id: data.tipo === 'verificacao_kyc'
        ? (data.kyc_bookmaker_id || contextoInicial?.bookmaker_id)
        : contextoInicial?.bookmaker_id,
      projeto_id: kycBookmakerData?.projeto_id ?? contextoInicial?.projeto_id,
      parceiro_id: kycBookmakerData?.parceiro_id ?? contextoInicial?.parceiro_id,
      contexto_metadata: metadata,
    });
    onOpenChange(false);
    form.reset();
    setKycBookmakerData(null);
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
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" style={{ fontFamily: "'Syne', sans-serif" }}>
            {/* Tipo + Prazo — grid alinhado */}
            <div className="grid grid-cols-2 gap-4 items-start">
              <FormField
                control={form.control}
                name="tipo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="block text-center">Tipo *</FormLabel>
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
                    <FormLabel className="block text-center">Prazo Limite *</FormLabel>
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

            {/* Bookmakers + Responsáveis na mesma linha quando tipo = abertura_conta */}
            {tipoSelecionado === 'abertura_conta' ? (
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="bookmaker_ids"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="block text-center">Bookmakers *</FormLabel>
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
                <FormField
                  control={form.control}
                  name="executor_ids"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="block text-center">Responsáveis pela Execução *</FormLabel>
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
              </div>
            ) : tipoSelecionado === 'verificacao_kyc' ? (
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="kyc_bookmaker_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="block text-center">Conta exigindo KYC *</FormLabel>
                      <KycBookmakerSelect
                        value={field.value ?? ''}
                        onValueChange={(id, data) => {
                          field.onChange(id);
                          setKycBookmakerData(data);
                        }}
                        error={!!form.formState.errors.kyc_bookmaker_id}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="executor_ids"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="block text-center">Responsáveis pela Execução *</FormLabel>
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
              </div>
            ) : tipoSelecionado === 'transferencia' ? (
              <>
                {/* ─── Bloco Transferência: Origem | → | Destino ─── */}
                <div className="space-y-3">
                  <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-start">
                    {/* Origem */}
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">Origem</p>
                      <FormField
                        control={form.control}
                        name="origem_dono"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Dono da conta *</FormLabel>
                            <FormControl>
                              <Input placeholder="Ex: Daniel" className="h-8 text-sm" {...field} />
                            </FormControl>
                            <FormMessage className="text-[10px]" />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="origem_plataforma"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Plataforma *</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value ?? ''}>
                              <FormControl>
                                <SelectTrigger className="h-8 text-sm">
                                  <SelectValue placeholder="Selecionar..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {Object.entries(PLATAFORMA_LABELS).map(([v, l]) => (
                                  <SelectItem key={v} value={v}>{l}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage className="text-[10px]" />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="origem_conta"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Conta / Wallet *</FormLabel>
                            <FormControl>
                              <Input placeholder="Ex: Bet365 – Conta X" className="h-8 text-sm" {...field} />
                            </FormControl>
                            <FormMessage className="text-[10px]" />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Seta central */}
                    <div className="flex items-center justify-center pt-10">
                      <div className="flex flex-col items-center gap-1">
                        <MoveRight className="h-6 w-6 text-primary" />
                      </div>
                    </div>

                    {/* Destino */}
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">Destino</p>
                      <FormField
                        control={form.control}
                        name="destino_dono"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Dono da conta *</FormLabel>
                            <FormControl>
                              <Input placeholder="Ex: Marcio" className="h-8 text-sm" {...field} />
                            </FormControl>
                            <FormMessage className="text-[10px]" />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="destino_plataforma"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Plataforma *</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value ?? ''}>
                              <FormControl>
                                <SelectTrigger className="h-8 text-sm">
                                  <SelectValue placeholder="Selecionar..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {Object.entries(PLATAFORMA_LABELS).map(([v, l]) => (
                                  <SelectItem key={v} value={v}>{l}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage className="text-[10px]" />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="destino_conta"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Conta / Wallet *</FormLabel>
                            <FormControl>
                              <Input placeholder="Ex: Wallet USDT – Y" className="h-8 text-sm" {...field} />
                            </FormControl>
                            <FormMessage className="text-[10px]" />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* Transferência: Valor + Moeda */}
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="transferencia_valor"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Valor *</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Ex: 1000"
                              type="text"
                              inputMode="decimal"
                              className="h-8 text-sm"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="transferencia_moeda"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Moeda *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ?? ''}>
                            <FormControl>
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="Selecionar..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {MOEDAS_TRANSFERENCIA.map((m) => (
                                <SelectItem key={m} value={m}>{m}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Preview automático */}
                  {transferenciaResumo && (
                    <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 flex items-center gap-2">
                      <MoveRight className="h-4 w-4 text-primary shrink-0" />
                      <p className="text-sm text-foreground font-medium">{transferenciaResumo}</p>
                    </div>
                  )}
                </div>

                {/* Responsáveis para transferência */}
                <FormField
                  control={form.control}
                  name="executor_ids"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="block text-center">Responsáveis pela Execução *</FormLabel>
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
              </>
            ) : (
              <>
                {/* Responsáveis — multi-select (outros tipos) */}
                <FormField
                  control={form.control}
                  name="executor_ids"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="block text-center">Responsáveis pela Execução *</FormLabel>
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
              </>
            )}

            {/* Descrição */}
            <FormField
              control={form.control}
              name="descricao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="block text-center">Descrição *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Detalhe o que precisa ser feito, incluindo todas as informações necessárias para execução..."
                      className="w-full resize-none"
                      style={{ minHeight: '180px' }}
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
                <pre className="text-xs text-foreground whitespace-pre-wrap break-all">
                  {JSON.stringify(contextoInicial.contexto_metadata, null, 2)}
                </pre>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Criando...
                  </>
                ) : (
                  'Criar Solicitação'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
