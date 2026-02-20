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
import { useParceiroContas } from '@/hooks/useParceiroContas';
import type { ContaOuWallet } from '@/hooks/useParceiroContas';
import { supabase } from '@/integrations/supabase/client';
import { ClipboardList, Loader2, Search, X, MoveRight, Landmark, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---- Schema do formulário ----
const schema = z.object({
  descricao: z.string().min(10, 'Descreva a solicitação com pelo menos 10 caracteres'),
  tipo: z.enum(['abertura_conta', 'verificacao_kyc', 'transferencia', 'outros'] as const),
  prazo: z.string().min(1, 'Selecione o prazo limite'),
  executor_ids: z.array(z.string()).min(1, 'Selecione ao menos um responsável'),
  bookmaker_ids: z.array(z.string()).optional(),
  kyc_bookmaker_id: z.string().optional(),
  // Transferência — dois modos: 'necessidade' (só destino) | 'transferencia' (origem+destino)
  subtipo_transferencia: z.enum(['necessidade', 'transferencia'] as const).optional(),
  origem_parceiro_id: z.string().optional(),
  origem_conta_id: z.string().optional(),
  destino_parceiro_id: z.string().optional(),
  destino_conta_id: z.string().optional(),
  transferencia_valor: z.string().optional(),
  transferencia_moeda: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.tipo === 'transferencia') {
    const subtipo = data.subtipo_transferencia ?? 'necessidade';

    // Destino sempre obrigatório
    if (!data.destino_parceiro_id) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Selecione o parceiro', path: ['destino_parceiro_id'] });
    if (!data.destino_conta_id) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Selecione a conta/wallet', path: ['destino_conta_id'] });

    // Origem só obrigatória em transferência
    if (subtipo === 'transferencia') {
      if (!data.origem_parceiro_id) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Selecione o parceiro de origem', path: ['origem_parceiro_id'] });
      if (!data.origem_conta_id) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Selecione a conta/wallet', path: ['origem_conta_id'] });
      if (data.origem_conta_id && data.destino_conta_id && data.origem_conta_id === data.destino_conta_id) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Origem e destino não podem ser iguais', path: ['destino_conta_id'] });
      }
    }

    if (!data.transferencia_valor?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Informe o valor', path: ['transferencia_valor'] });
    if (!data.transferencia_moeda?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Selecione a moeda', path: ['transferencia_moeda'] });
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

type RegFilter = 'todas' | 'REGULAMENTADA' | 'NAO_REGULAMENTADA';

/** Multi-select de bookmakers com checkboxes e filtro de regulamentação */
function BookmakerMultiSelect({
  items,
  value,
  onChange,
  loading,
}: {
  items: { id: string; label: string; logo_url?: string; status?: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
  loading: boolean;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [regFilter, setRegFilter] = useState<RegFilter>('todas');

  const filtered = useMemo(() => {
    let list = items;
    if (regFilter === 'REGULAMENTADA') {
      list = list.filter((i) => i.status === 'REGULAMENTADA');
    } else if (regFilter === 'NAO_REGULAMENTADA') {
      list = list.filter((i) => i.status === 'NAO_REGULAMENTADA');
    }
    if (!search.trim()) return list;
    const term = search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return list.filter((item) =>
      item.label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(term),
    );
  }, [items, search, regFilter]);

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

  const regOptions: { value: RegFilter; label: string }[] = [
    { value: 'todas', label: 'Todas' },
    { value: 'REGULAMENTADA', label: 'Regulamentadas' },
    { value: 'NAO_REGULAMENTADA', label: 'Não Regulamentadas' },
  ];

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
        {/* Busca */}
        <div className="px-2 pt-2 pb-2 border-b border-border space-y-2">
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
          {/* Filtro de regulamentação */}
          <div className="flex gap-1">
            {regOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRegFilter(opt.value)}
                className={cn(
                  'flex-1 text-xs px-2 py-1 rounded-md border transition-colors',
                  regFilter === opt.value
                    ? 'bg-primary text-primary-foreground border-primary font-medium'
                    : 'bg-transparent text-muted-foreground border-border hover:bg-accent',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-60 overflow-y-auto p-1" onWheel={(e) => e.stopPropagation()}>
          {filtered.length === 0 ? (
            <p className="p-3 text-center text-sm text-muted-foreground">
              {search.trim() || regFilter !== 'todas' ? 'Nenhum resultado' : 'Nenhuma bookmaker ativa'}
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
                <span className="truncate flex-1">{item.label}</span>
                {item.status === 'REGULAMENTADA' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-medium shrink-0">
                    REG
                  </span>
                )}
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

  const MOEDAS_TRANSFERENCIA = ['BRL', 'USD', 'EUR', 'USDT', 'BTC', 'ETH', 'PIX', 'Outro'];

  const tipoSelecionado = form.watch('tipo');
  const subtipoTransferencia = form.watch('subtipo_transferencia') ?? 'necessidade';

  // Watch campos de transferência
  const origemParceiroId = form.watch('origem_parceiro_id');
  const origemContaId = form.watch('origem_conta_id');
  const destinoParceiroId = form.watch('destino_parceiro_id');
  const destinoContaId = form.watch('destino_conta_id');
  const transferenciaValor = form.watch('transferencia_valor');
  const transferenciaMoeda = form.watch('transferencia_moeda');

  // Estado dos parceiros para select (carregados do DB)
  const [parceiros, setParceiros] = useState<{ id: string; nome: string }[]>([]);
  useEffect(() => {
    if (tipoSelecionado !== 'transferencia') return;
    supabase.from('parceiros').select('id, nome').eq('status', 'ativo').order('nome')
      .then(({ data }) => setParceiros(data ?? []));
  }, [tipoSelecionado]);

  // Inicializar subtipo padrão ao entrar em transferência
  useEffect(() => {
    if (tipoSelecionado === 'transferencia' && !form.getValues('subtipo_transferencia')) {
      form.setValue('subtipo_transferencia', 'necessidade');
    }
  }, [tipoSelecionado]);

  // Em 'transferencia', origem também é necessária
  const needsOrigem = subtipoTransferencia === 'transferencia';
  // Destino sempre necessário
  const needsDestino = true;

  // Contas/wallets por parceiro
  const { data: origemContas = [], isLoading: origemContasLoading } = useParceiroContas(
    tipoSelecionado === 'transferencia' && needsOrigem ? (origemParceiroId ?? null) : null
  );
  const { data: destinoContas = [], isLoading: destinoContasLoading } = useParceiroContas(
    tipoSelecionado === 'transferencia' ? (destinoParceiroId ?? null) : null
  );

  // Moeda derivada sempre da conta de destino; lista vazia até conta ser selecionada
  const moedaOptions = useMemo(() => {
    const conta = destinoContas.find(c => c.id === destinoContaId);
    if (!conta) return [];  // nenhuma opção até selecionar a conta
    if (conta.tipo === 'banco') return [(conta as import('@/hooks/useParceiroContas').ContaBancaria).moeda];
    if (conta.tipo === 'wallet') return (conta as import('@/hooks/useParceiroContas').WalletCrypto).moedas;
    return MOEDAS_TRANSFERENCIA;
  }, [destinoContaId, destinoContas]);

  // Auto-seleciona moeda quando há só uma opção
  useEffect(() => {
    if (moedaOptions.length === 1) {
      form.setValue('transferencia_moeda', moedaOptions[0]);
    } else if (moedaOptions.length > 1 && transferenciaMoeda && !moedaOptions.includes(transferenciaMoeda)) {
      form.setValue('transferencia_moeda', '');
    }
  }, [moedaOptions]);

  // Labels para o preview
  const origemParceiroNome = parceiros.find(p => p.id === origemParceiroId)?.nome ?? '';
  const destinoParceiroNome = parceiros.find(p => p.id === destinoParceiroId)?.nome ?? '';
  const origemContaLabel = origemContas.find(c => c.id === origemContaId)?.label ?? '';
  const destinoContaLabel = destinoContas.find(c => c.id === destinoContaId)?.label ?? '';

  const transferenciaResumo = useMemo(() => {
    if (tipoSelecionado !== 'transferencia') return null;
    if (!transferenciaValor || !transferenciaMoeda) return null;
    const valor = `${transferenciaValor} ${transferenciaMoeda}`;
    if (subtipoTransferencia === 'necessidade') {
      if (!destinoContaLabel || !destinoParceiroNome) return null;
      return `Necessidade de ${valor} na conta ${destinoContaLabel} (${getFirstLastName(destinoParceiroNome)})`;
    }
    // transferencia
    if (!origemContaLabel || !origemParceiroNome || !destinoContaLabel || !destinoParceiroNome) return null;
    return `Transferir ${valor} de ${origemContaLabel} (${getFirstLastName(origemParceiroNome)}) para ${destinoContaLabel} (${getFirstLastName(destinoParceiroNome)})`;
  }, [tipoSelecionado, subtipoTransferencia, transferenciaValor, transferenciaMoeda, origemContaLabel, origemParceiroNome, destinoContaLabel, destinoParceiroNome]);

  const bookmakerItems = useMemo(
    () =>
      workspaceBookmakers.map((bm) => ({
        id: bm.id,
        label: bm.nome,
        logo_url: bm.logo_url ?? undefined,
        status: bm.status ?? undefined,
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

    // Transferência: armazena blocos de origem/destino com dados reais
    if (data.tipo === 'transferencia') {
      const sub = data.subtipo_transferencia ?? 'necessidade';
      const origemContaDados = origemContas.find(c => c.id === data.origem_conta_id);
      const destinoContaDados = destinoContas.find(c => c.id === data.destino_conta_id);
      const origemParcNome = parceiros.find(p => p.id === data.origem_parceiro_id)?.nome ?? '';
      const destinoParcNome = parceiros.find(p => p.id === data.destino_parceiro_id)?.nome ?? '';
      const valor = `${data.transferencia_valor} ${data.transferencia_moeda}`;
      let resumo = '';
      if (sub === 'necessidade') {
        resumo = `Necessidade de ${valor} na conta ${destinoContaDados?.label ?? ''} (${getFirstLastName(destinoParcNome)})`;
      } else {
        resumo = `Transferir ${valor} de ${origemContaDados?.label ?? ''} (${getFirstLastName(origemParcNome)}) para ${destinoContaDados?.label ?? ''} (${getFirstLastName(destinoParcNome)})`;
      }
      metadata['transferencia'] = {
        subtipo: sub,
        origem: sub === 'transferencia' ? { parceiro_id: data.origem_parceiro_id, parceiro_nome: origemParcNome, conta_id: data.origem_conta_id, conta_label: origemContaDados?.label ?? '', tipo: origemContaDados?.tipo ?? '' } : null,
        destino: { parceiro_id: data.destino_parceiro_id, parceiro_nome: destinoParcNome, conta_id: data.destino_conta_id, conta_label: destinoContaDados?.label ?? '', tipo: destinoContaDados?.tipo ?? '' },
        valor: data.transferencia_valor,
        moeda: data.transferencia_moeda,
        resumo,
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
                {/* ── Seletor de modo ── */}
                <div className="flex items-center justify-center gap-1 p-1 rounded-lg bg-muted/40 border border-border/40">
                  {([
                    { key: 'necessidade',   icon: '📋', label: 'Necessidade' },
                    { key: 'transferencia', icon: '🔄', label: 'Transferência' },
                  ] as const).map(({ key, icon, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        form.setValue('subtipo_transferencia', key);
                        form.setValue('origem_parceiro_id', '');
                        form.setValue('origem_conta_id', '');
                        form.setValue('destino_parceiro_id', '');
                        form.setValue('destino_conta_id', '');
                        form.setValue('transferencia_moeda', '');
                      }}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                        subtipoTransferencia === key
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                      )}
                    >
                      <span>{icon}</span>
                      {label}
                    </button>
                  ))}
                </div>

                {/* ── Blocos de conta ── */}
                <div className="space-y-3">
                  <div className={cn(
                    'grid gap-3 items-start',
                    subtipoTransferencia === 'transferencia'
                      ? 'grid-cols-[1fr_auto_1fr]'
                      : 'grid-cols-1'
                  )}>
                    {/* Bloco Origem (só em transferência) */}
                    {needsOrigem && (
                      <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">
                          Origem
                        </p>
                        <FormField
                          control={form.control}
                          name="origem_parceiro_id"
                          render={({ field }) => {
                            const [searchOrigem, setSearchOrigem] = useState('');
                            const filteredOrigem = parceiros.filter(p =>
                              getFirstLastName(p.nome).toLowerCase().includes(searchOrigem.toLowerCase())
                            );
                            return (
                              <FormItem>
                                <FormLabel className="text-xs">Parceiro *</FormLabel>
                                <Select
                                  onValueChange={(v) => { field.onChange(v); form.setValue('origem_conta_id', ''); form.setValue('transferencia_moeda', ''); }}
                                  value={field.value ?? ''}
                                >
                                  <FormControl>
                                    <SelectTrigger className="h-8 text-sm">
                                      <SelectValue placeholder="Selecionar parceiro...">
                                        {field.value ? getFirstLastName(parceiros.find(p => p.id === field.value)?.nome ?? '') : null}
                                      </SelectValue>
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent className="z-[9999]">
                                    <div className="px-2 pt-2 pb-1 border-b border-border sticky top-0 bg-popover z-10">
                                      <div className="relative">
                                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                                        <input type="text" value={searchOrigem} onChange={e => setSearchOrigem(e.target.value)} placeholder="Buscar parceiro..."
                                          className="w-full h-7 pl-7 pr-2 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                                          onKeyDown={e => e.stopPropagation()} />
                                      </div>
                                    </div>
                                    <div className="max-h-48 overflow-y-auto">
                                      {filteredOrigem.length === 0
                                        ? <p className="px-3 py-2 text-xs text-muted-foreground">Nenhum parceiro encontrado</p>
                                        : filteredOrigem.map(p => <SelectItem key={p.id} value={p.id}>{getFirstLastName(p.nome)}</SelectItem>)
                                      }
                                    </div>
                                  </SelectContent>
                                </Select>
                                <FormMessage className="text-[10px]" />
                              </FormItem>
                            );
                          }}
                        />
                        <FormField
                          control={form.control}
                          name="origem_conta_id"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Conta / Wallet *</FormLabel>
                              <Select onValueChange={(v) => { field.onChange(v); }} value={field.value ?? ''} disabled={!origemParceiroId}>
                                <FormControl>
                                  <SelectTrigger className="h-8 text-sm">
                                    {origemContasLoading ? <span className="text-muted-foreground text-xs">Carregando...</span>
                                      : <SelectValue placeholder={origemParceiroId ? 'Selecionar conta...' : 'Selecione o parceiro'} />}
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent className="z-[9999]">
                                  {origemContas.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">Nenhuma conta cadastrada</p>}
                                  {origemContas.filter(c => c.tipo === 'banco').length > 0 && (<>
                                    <div className="px-2 py-1 flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide font-semibold"><Landmark className="h-3 w-3" /> Contas Bancárias</div>
                                    {origemContas.filter(c => c.tipo === 'banco').map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                                  </>)}
                                  {origemContas.filter(c => c.tipo === 'wallet').length > 0 && (<>
                                    <div className="px-2 py-1 flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mt-1"><Wallet className="h-3 w-3" /> Wallets Crypto</div>
                                    {origemContas.filter(c => c.tipo === 'wallet').map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                                  </>)}
                                </SelectContent>
                              </Select>
                              <FormMessage className="text-[10px]" />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}

                    {/* Seta central (só em transferência) */}
                    {subtipoTransferencia === 'transferencia' && (
                      <div className="flex items-center justify-center pt-10">
                        <MoveRight className="h-6 w-6 text-primary" />
                      </div>
                    )}

                    {/* Bloco Destino (sempre visível) */}
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">
                        {subtipoTransferencia === 'necessidade' ? '📋 Conta de Destino' : 'Destino'}
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={form.control}
                        name="destino_parceiro_id"
                        render={({ field }) => {
                          const [searchDestino, setSearchDestino] = useState('');
                          const filteredDestino = parceiros.filter(p =>
                            getFirstLastName(p.nome).toLowerCase().includes(searchDestino.toLowerCase())
                          );
                          return (
                            <FormItem>
                              <FormLabel className="text-xs">Parceiro *</FormLabel>
                              <Select
                                onValueChange={(v) => { field.onChange(v); form.setValue('destino_conta_id', ''); form.setValue('transferencia_moeda', ''); }}
                                value={field.value ?? ''}
                              >
                                <FormControl>
                                  <SelectTrigger className="h-8 text-sm">
                                    <SelectValue placeholder="Selecionar parceiro...">
                                      {field.value ? getFirstLastName(parceiros.find(p => p.id === field.value)?.nome ?? '') : null}
                                    </SelectValue>
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent className="z-[9999]">
                                  <div className="px-2 pt-2 pb-1 border-b border-border sticky top-0 bg-popover z-10">
                                    <div className="relative">
                                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                                      <input type="text" value={searchDestino} onChange={e => setSearchDestino(e.target.value)} placeholder="Buscar parceiro..."
                                        className="w-full h-7 pl-7 pr-2 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                                        onKeyDown={e => e.stopPropagation()} />
                                    </div>
                                  </div>
                                  <div className="max-h-48 overflow-y-auto">
                                    {filteredDestino.length === 0
                                      ? <p className="px-3 py-2 text-xs text-muted-foreground">Nenhum parceiro encontrado</p>
                                      : filteredDestino.map(p => <SelectItem key={p.id} value={p.id}>{getFirstLastName(p.nome)}</SelectItem>)
                                    }
                                  </div>
                                </SelectContent>
                              </Select>
                              <FormMessage className="text-[10px]" />
                            </FormItem>
                          );
                        }}
                      />
                      <FormField
                        control={form.control}
                        name="destino_conta_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Conta / Wallet *</FormLabel>
                            <Select onValueChange={(v) => { field.onChange(v); form.setValue('transferencia_moeda', ''); }} value={field.value ?? ''} disabled={!destinoParceiroId}>
                              <FormControl>
                                <SelectTrigger className="h-8 text-sm">
                                  {destinoContasLoading ? <span className="text-muted-foreground text-xs">Carregando...</span>
                                    : <SelectValue placeholder={destinoParceiroId ? 'Selecionar conta...' : 'Selecione o parceiro'} />}
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="z-[9999]">
                                {destinoContas.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">Nenhuma conta cadastrada</p>}
                                {destinoContas.filter(c => c.tipo === 'banco').length > 0 && (<>
                                  <div className="px-2 py-1 flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide font-semibold"><Landmark className="h-3 w-3" /> Contas Bancárias</div>
                                  {destinoContas.filter(c => c.tipo === 'banco').map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                                </>)}
                                {destinoContas.filter(c => c.tipo === 'wallet').length > 0 && (<>
                                  <div className="px-2 py-1 flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mt-1"><Wallet className="h-3 w-3" /> Wallets Crypto</div>
                                  {destinoContas.filter(c => c.tipo === 'wallet').map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                                </>)}
                              </SelectContent>
                            </Select>
                            <FormMessage className="text-[10px]" />
                          </FormItem>
                        )}
                      />
                      </div>
                    </div>
                  </div>

                  {/* Valor + Moeda */}
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="transferencia_valor"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Valor *</FormLabel>
                          <FormControl>
                            <Input placeholder="Ex: 1000" type="text" inputMode="decimal" className="h-8 text-sm" {...field} />
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
                          <FormLabel className="text-xs">
                            Moeda *
                            {moedaOptions.length === 1 && (
                              <span className="ml-1 text-[10px] text-primary font-normal">(automático)</span>
                            )}
                          </FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={!destinoContaId || moedaOptions.length === 1}>
                            <FormControl>
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder={destinoContaId ? 'Selecionar...' : 'Selecione a conta primeiro'} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="z-[9999]">
                              {moedaOptions.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
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
