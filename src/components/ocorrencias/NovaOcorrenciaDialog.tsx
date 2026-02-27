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
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useCriarOcorrencia } from '@/hooks/useOcorrencias';
import { useWorkspaceMembers } from '@/hooks/useWorkspaceMembers';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useParceiroContas, type ContaOuWallet } from '@/hooks/useParceiroContas';
import { TIPO_LABELS, PRIORIDADE_LABELS, SUB_MOTIVOS } from '@/types/ocorrencias';
import type { OcorrenciaTipo, OcorrenciaPrioridade } from '@/types/ocorrencias';
import { AlertTriangle, Loader2, X, ChevronsUpDown, Check, Users, Filter, CalendarIcon, Wallet, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getFirstLastName } from '@/lib/utils';
import { getRoleLabel } from '@/lib/roleLabels';

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
  valor_risco: z.coerce.number().min(0).optional(),
  data_ocorrencia: z.date().optional(),
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
  const [filtroRole, setFiltroRole] = useState<string | null>(null);
  const [bookmakerPopoverOpen, setBookmakerPopoverOpen] = useState(false);
  const [casaPopoverOpen, setCasaPopoverOpen] = useState(false);
  const [bancoPopoverOpen, setBancoPopoverOpen] = useState(false);
  const [parceiroPopoverOpen, setParceiroPopoverOpen] = useState(false);
  const [selectedCasa, setSelectedCasa] = useState<string>('');
  const [selectedParceiroId, setSelectedParceiroId] = useState<string | null>(null);

  // Carregar bookmakers do workspace com logo do catálogo
  const { data: bookmakers = [] } = useQuery({
    queryKey: ['ocorrencia-bookmakers', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookmakers')
        .select('id, nome, instance_identifier, parceiro_id, bookmaker_catalogo_id, saldo_atual, moeda, parceiros!bookmakers_parceiro_id_fkey (nome), bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url)')
        .eq('workspace_id', workspaceId!)
        .order('nome');
      if (error) throw error;
      return data || [];
    },
    enabled: !!workspaceId && open,
  });

  // Carregar parceiros do workspace
  const { data: parceiros = [] } = useQuery({
    queryKey: ['ocorrencia-parceiros', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('parceiros')
        .select('id, nome')
        .eq('workspace_id', workspaceId!)
        .order('nome');
      if (error) throw error;
      return data || [];
    },
    enabled: !!workspaceId && open,
  });

  // Carregar contas e wallets do parceiro selecionado
  const { data: contasEWallets = [] } = useParceiroContas(selectedParceiroId);

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
      valor_risco: 0,
      data_ocorrencia: new Date(),
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

  // Label do bookmaker selecionado
  const selectedBookmaker = (bookmakers as any[]).find((bk) => bk.id === form.watch('entidade_id'));

  // Parceiro selecionado (para exibição)
  const selectedParceiro = parceiros.find((p: any) => p.id === selectedParceiroId);

  // Conta ou wallet selecionada
  const selectedContaOuWallet = contasEWallets.find((c) => c.id === form.watch('entidade_id'));

  // Separar contas bancárias e wallets
  const contasBancariasLista = contasEWallets.filter((c) => c.tipo === 'banco');
  const walletsLista = contasEWallets.filter((c) => c.tipo === 'wallet');

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
        conta_bancaria_id: isBanco && selectedContaOuWallet?.tipo === 'banco' ? data.entidade_id : undefined,
        wallet_id: isBanco && selectedContaOuWallet?.tipo === 'wallet' ? data.entidade_id : undefined,
        projeto_id: contextoInicial?.projeto_id,
        parceiro_id: isBanco ? selectedParceiroId || undefined : contextoInicial?.parceiro_id,
        contexto_metadata: contextoInicial?.contexto_metadata,
        valor_risco: data.valor_risco || 0,
        data_ocorrencia: data.data_ocorrencia ? format(data.data_ocorrencia, 'yyyy-MM-dd') : undefined,
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
                        setSelectedParceiroId(null);
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

            {/* Seletor Banco/Wallet: Parceiro → Conta/Wallet */}
            {contextoEntidade === 'banco' && (
              <div className="grid grid-cols-2 gap-4">
                {/* Seletor de Parceiro */}
                <FormItem className="flex flex-col">
                  <FormLabel>Parceiro *</FormLabel>
                  <Popover open={parceiroPopoverOpen} onOpenChange={setParceiroPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className={cn(
                          'w-full justify-between font-normal h-10',
                          !selectedParceiroId && 'text-muted-foreground'
                        )}
                      >
                        {selectedParceiro ? (
                          <span className="truncate">{getFirstLastName(selectedParceiro.nome)}</span>
                        ) : (
                          'Selecione o parceiro...'
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar parceiro..." />
                        <CommandList>
                          <CommandEmpty>Nenhum parceiro encontrado.</CommandEmpty>
                          <CommandGroup>
                            {parceiros.map((p: any) => (
                              <CommandItem
                                key={p.id}
                                value={p.nome}
                                onSelect={() => {
                                  setSelectedParceiroId(p.id);
                                  form.setValue('entidade_id', '');
                                  setParceiroPopoverOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    selectedParceiroId === p.id ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                                <span>{getFirstLastName(p.nome)}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </FormItem>

                {/* Seletor de Conta Bancária / Wallet */}
                <FormField
                  control={form.control}
                  name="entidade_id"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Conta / Wallet *</FormLabel>
                      <Popover open={bancoPopoverOpen} onOpenChange={setBancoPopoverOpen}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              disabled={!selectedParceiroId}
                              className={cn(
                                'w-full justify-between font-normal h-10',
                                !field.value && 'text-muted-foreground'
                              )}
                            >
                              {selectedContaOuWallet ? (
                                <span className="flex items-center gap-2 truncate">
                                  {selectedContaOuWallet.tipo === 'banco' ? (
                                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                                  ) : (
                                    <Wallet className="h-4 w-4 shrink-0 text-muted-foreground" />
                                  )}
                                  {selectedContaOuWallet.label}
                                </span>
                              ) : (
                                selectedParceiroId ? 'Selecione a conta ou wallet...' : 'Selecione o parceiro primeiro'
                              )}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Buscar conta ou wallet..." />
                            <CommandList>
                              <CommandEmpty>Nenhuma conta ou wallet encontrada.</CommandEmpty>
                              {contasBancariasLista.length > 0 && (
                                <CommandGroup heading="Contas Bancárias">
                                  {contasBancariasLista.map((c) => (
                                    <CommandItem
                                      key={c.id}
                                      value={c.label}
                                      onSelect={() => {
                                        field.onChange(c.id);
                                        setBancoPopoverOpen(false);
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          'mr-2 h-4 w-4',
                                          field.value === c.id ? 'opacity-100' : 'opacity-0'
                                        )}
                                      />
                                      <Building2 className="h-4 w-4 mr-2 text-muted-foreground shrink-0" />
                                      <span>{c.label}</span>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              )}
                              {walletsLista.length > 0 && (
                                <CommandGroup heading="Wallets Crypto">
                                  {walletsLista.map((w) => (
                                    <CommandItem
                                      key={w.id}
                                      value={w.label}
                                      onSelect={() => {
                                        field.onChange(w.id);
                                        setBancoPopoverOpen(false);
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          'mr-2 h-4 w-4',
                                          field.value === w.id ? 'opacity-100' : 'opacity-0'
                                        )}
                                      />
                                      <Wallet className="h-4 w-4 mr-2 text-muted-foreground shrink-0" />
                                      <span>{w.label}</span>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              )}
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

            {/* Executor Responsável - Multi-select com filtro por papel */}
            <div className="space-y-2.5">
              <FormLabel className="text-sm font-medium">
                Executor Responsável *
              </FormLabel>

              {/* Filtro por papel (role) */}
              {(() => {
                const rolesPresentes = [...new Set(members.map((m) => m.role))].sort();
                if (rolesPresentes.length <= 1) return null;
                return (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Filter className="h-3.5 w-3.5 text-muted-foreground mr-0.5" />
                    <Badge
                      variant={filtroRole === null ? 'default' : 'outline'}
                      className={cn(
                        'cursor-pointer px-2.5 py-1 text-[10px] font-medium transition-all',
                        filtroRole === null
                          ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                          : 'hover:bg-accent hover:text-accent-foreground'
                      )}
                      onClick={() => setFiltroRole(null)}
                    >
                      Todos os papéis
                    </Badge>
                    {rolesPresentes.map((r) => (
                      <Badge
                        key={r}
                        variant={filtroRole === r ? 'default' : 'outline'}
                        className={cn(
                          'cursor-pointer px-2.5 py-1 text-[10px] font-medium transition-all',
                          filtroRole === r
                            ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                            : 'hover:bg-accent hover:text-accent-foreground'
                        )}
                        onClick={() => setFiltroRole(filtroRole === r ? null : r)}
                      >
                        {getRoleLabel(r)}
                      </Badge>
                    ))}
                  </div>
                );
              })()}

              {/* Membros filtrados */}
              {(() => {
                const membrosFiltrados = filtroRole
                  ? members.filter((m) => m.role === filtroRole)
                  : members;
                const allFilteredSelected = membrosFiltrados.length > 0 && membrosFiltrados.every((m) => executoresSelecionados.includes(m.user_id));
                return (
                  <div className="flex flex-wrap gap-1.5">
                    <Badge
                      variant={allFilteredSelected ? 'default' : 'outline'}
                      className={cn(
                        'cursor-pointer gap-1.5 px-3 py-1.5 text-xs font-medium transition-all',
                        allFilteredSelected
                          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                          : 'hover:bg-accent hover:text-accent-foreground'
                      )}
                      onClick={() => {
                        if (allFilteredSelected) {
                          const filteredIds = new Set(membrosFiltrados.map((m) => m.user_id));
                          setExecutoresSelecionados((prev) => prev.filter((id) => !filteredIds.has(id)));
                        } else {
                          const newIds = new Set([...executoresSelecionados, ...membrosFiltrados.map((m) => m.user_id)]);
                          setExecutoresSelecionados([...newIds]);
                        }
                      }}
                    >
                      <Users className="h-3 w-3" />
                      {filtroRole ? `Todos ${getRoleLabel(filtroRole)}s` : 'Todos'}
                    </Badge>

                    {membrosFiltrados.map((m) => {
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
                );
              })()}

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
                  <p className="text-xs text-muted-foreground">
                    Quando a ocorrência de fato aconteceu. Usado para calcular a duração.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Valor em risco */}
            <FormField
              control={form.control}
              name="valor_risco"
              render={({ field }) => {
                const saldoRef = selectedBookmaker ? Number(selectedBookmaker.saldo_atual || 0) : null;
                const moedaRef = selectedBookmaker?.moeda || 'BRL';
                return (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Valor em risco (opcional)</FormLabel>
                      {saldoRef !== null && saldoRef > 0 && (
                        <button
                          type="button"
                          onClick={() => form.setValue('valor_risco', saldoRef)}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                        >
                          Saldo na casa:
                          <span className="font-mono font-medium text-foreground">
                            {moedaRef === 'BRL' ? 'R$' : '$'} {saldoRef.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                          <span className="text-primary ml-0.5">← usar</span>
                        </button>
                      )}
                    </div>
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
                    <p className="text-xs text-muted-foreground">
                      Valor financeiro potencialmente afetado por esta ocorrência.
                    </p>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

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
