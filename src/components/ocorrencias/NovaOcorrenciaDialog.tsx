import { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { useParceiroContas } from '@/hooks/useParceiroContas';
import { TIPO_LABELS, PRIORIDADE_LABELS, SUB_MOTIVOS, SUB_MOTIVOS_MOVIMENTACAO } from '@/types/ocorrencias';
import type { OcorrenciaTipo, OcorrenciaPrioridade } from '@/types/ocorrencias';
import { 
  AlertTriangle, 
  Loader2, 
  Check, 
  ChevronsUpDown, 
  Building2, 
  User, 
  ArrowRight,
  ChevronRight,
  ChevronLeft,
  DollarSign,
  Briefcase,
  Layers,
  Circle,
  Hash,
  FileText,
  Clock,
  Layout,
  Info,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

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
  const [step, setStep] = useState(1);
  const { mutateAsync: criar, isPending } = useCriarOcorrencia();
  const { data: members = [] } = useWorkspaceMembers();
  const { workspaceId } = useAuth();
  const [executorId, setExecutorId] = useState<string>('');
  const [selectedCasa, setSelectedCasa] = useState<string>('');
  const [selectedParceiroId, setSelectedParceiroId] = useState<string | null>(null);
  const [casaPopoverOpen, setCasaPopoverOpen] = useState(false);
  const [bancoPopoverOpen, setBancoPopoverOpen] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      titulo: contextoInicial?.titulo || '',
      descricao: '',
      tipo: contextoInicial?.tipo || 'movimentacao_financeira',
      sub_motivo: '',
      contexto_entidade: undefined as any,
      entidade_id: '',
      prioridade: 'media',
      valor_risco: 0,
    },
  });

  const { data: bookmakers = [] } = useQuery({
    queryKey: ['ocorrencia-bookmakers', workspaceId, contextoInicial?.projeto_id],
    queryFn: async () => {
      let query = supabase
        .from('bookmakers')
        .select('id, nome, parceiro_id, moeda, saldo_atual, parceiros!bookmakers_parceiro_id_fkey (nome), bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url)')
        .eq('workspace_id', workspaceId!)
        .order('nome');
      if (contextoInicial?.projeto_id) query = query.eq('projeto_id', contextoInicial.projeto_id);
      const { data } = await query;
      return data || [];
    },
    enabled: !!workspaceId && open,
  });

  const selectedEntidadeId = form.watch('entidade_id');
  const valorRisco = form.watch('valor_risco');
  const tipoSelecionado = form.watch('tipo');
  const contextoEntidade = form.watch('contexto_entidade');

  const selectedBookmaker = useMemo(() => {
    if (contextoEntidade !== 'bookmaker') return null;
    return bookmakers.find(bk => bk.id === selectedEntidadeId);
  }, [contextoEntidade, selectedEntidadeId, bookmakers]);

  const exposurePercentage = useMemo(() => {
    if (!selectedBookmaker?.saldo_atual || !valorRisco) return 0;
    return (valorRisco / Number(selectedBookmaker.saldo_atual)) * 100;
  }, [selectedBookmaker, valorRisco]);

  const isValueExceedingBalance = useMemo(() => {
    if (!selectedBookmaker) return false;
    return valorRisco > Number(selectedBookmaker.saldo_atual || 0);
  }, [selectedBookmaker, valorRisco]);



  // Reset form and state when dialog opens or closes
  useEffect(() => {
    if (open) {
      setStep(1);
      form.reset({
        titulo: contextoInicial?.titulo || '',
        descricao: '',
        tipo: contextoInicial?.tipo || 'movimentacao_financeira',
        sub_motivo: '',
        contexto_entidade: undefined as any,
        entidade_id: '',
        prioridade: 'media',
        valor_risco: 0,
      });
      setSelectedCasa('');
      setSelectedParceiroId(null);
      setExecutorId('');
    }
  }, [open, contextoInicial, form]);


  const { data: parceiros = [] } = useQuery({
    queryKey: ['ocorrencia-parceiros', workspaceId],
    queryFn: async () => {
      const { data } = await supabase
        .from('parceiros')
        .select('id, nome')
        .eq('workspace_id', workspaceId!)
        .neq('is_caixa_operacional', true)
        .order('nome');
      return data || [];
    },
    enabled: !!workspaceId && open,
  });

  const { data: contasEWallets = [] } = useParceiroContas(selectedParceiroId);

  const subMotivos = tipoSelecionado === 'movimentacao_financeira'
    ? (SUB_MOTIVOS_MOVIMENTACAO[contextoEntidade] || [])
    : (SUB_MOTIVOS[tipoSelecionado] || []);

  const casasUnicasMap = (bookmakers as any[]).reduce<Record<string, string | null>>((acc, bk) => {
    if (bk.nome && !acc.hasOwnProperty(bk.nome)) acc[bk.nome] = bk.bookmakers_catalogo?.logo_url ?? null;
    return acc;
  }, {});
  const casasUnicas = Object.keys(casasUnicasMap).sort();
  const vinculosDaCasa = selectedCasa ? (bookmakers as any[]).filter((bk) => bk.nome === selectedCasa) : [];

  const onSubmit = async (data: FormData) => {
    if (!executorId || isPending) return;
    try {
      const isBookmaker = data.contexto_entidade === 'bookmaker';
      const isBanco = data.contexto_entidade === 'banco';
      const bkSelecionado = isBookmaker ? bookmakers.find(bk => bk.id === data.entidade_id) : null;

      await criar({
        titulo: data.titulo,
        descricao: data.descricao,
        tipo: data.tipo,
        sub_motivo: data.sub_motivo || null,
        prioridade: data.prioridade,
        executor_id: executorId,
        bookmaker_id: isBookmaker ? data.entidade_id : contextoInicial?.bookmaker_id,
        conta_bancaria_id: isBanco && (contasEWallets.find(c => c.id === data.entidade_id)?.tipo === 'banco') ? data.entidade_id : undefined,
        wallet_id: isBanco && (contasEWallets.find(c => c.id === data.entidade_id)?.tipo === 'wallet') ? data.entidade_id : undefined,
        projeto_id: contextoInicial?.projeto_id,
        parceiro_id: isBanco ? selectedParceiroId || undefined : contextoInicial?.parceiro_id,
        valor_risco: data.valor_risco || 0,
        moeda: bkSelecionado?.moeda || 'BRL',
        data_ocorrencia: format(new Date(), 'yyyy-MM-dd'),
      });
      onOpenChange(false);
      setStep(1);
      form.reset();
    } catch (e) {}
  };

  const nextStep = async () => {
    const fieldsByStep: Record<number, (keyof FormData)[]> = {
      1: ['tipo', 'contexto_entidade', 'entidade_id'],
      2: ['titulo', 'descricao', 'prioridade', 'valor_risco'],
    };
    const isValid = await form.trigger(fieldsByStep[step]);
    if (isValid) setStep(prev => prev + 1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 overflow-hidden border-border/40 shadow-2xl">
        <DialogHeader className="p-6 pb-2">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="text-[10px] font-bold tracking-widest uppercase py-0.5 px-2 bg-muted/50">Passo {step} de 3</Badge>
          </div>
          <DialogTitle className="text-2xl font-bold tracking-tight">Nova Ocorrência</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 px-6 py-4">
            {step === 1 && (
              <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                <div className="space-y-4 p-4 rounded-xl border border-border/50 bg-muted/20">
                  <h4 className="flex items-center gap-2 text-sm font-bold text-foreground mb-4">
                    <Layout className="h-4 w-4 text-primary" />
                    Classificação Inicial
                  </h4>
                  <div className="grid grid-cols-1 gap-4">
                    <FormField
                      control={form.control}
                      name="tipo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[11px] font-bold uppercase text-muted-foreground">Tipo de Ocorrência</FormLabel>
                          <Select onValueChange={(v) => {
                            field.onChange(v);
                            form.setValue('entidade_id', '');
                            if (v === 'bloqueio_bancario') form.setValue('contexto_entidade', 'banco');
                            else if (v === 'bloqueio_contas') form.setValue('contexto_entidade', 'bookmaker');
                          }} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-11 bg-background">
                                <SelectValue placeholder="Selecione o tipo..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="max-h-[300px]">
                              {Object.entries(TIPO_LABELS).map(([v, l]) => (
                                <SelectItem key={v} value={v} className="py-3">
                                  <div className="flex flex-col gap-0.5">
                                    <span className="font-semibold text-sm">{l}</span>
                                    {v === 'movimentacao_financeira' && <span className="text-[10px] text-muted-foreground">Saques, depósitos, estornos e atrasos</span>}
                                    {v === 'kyc' && <span className="text-[10px] text-muted-foreground">Verificação de identidade e documentos</span>}
                                    {v === 'bloqueio_bancario' && <span className="text-[10px] text-muted-foreground">Bloqueios em contas e PIX</span>}
                                    {v === 'bloqueio_contas' && <span className="text-[10px] text-muted-foreground">Suspensão e encerramento de contas</span>}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="contexto_entidade"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[11px] font-bold uppercase text-muted-foreground">Contexto</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value} disabled={['bloqueio_bancario', 'bloqueio_contas'].includes(tipoSelecionado)}>
                            <FormControl><SelectTrigger className="h-10 bg-background"><SelectValue placeholder="Selecione..." /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="bookmaker">Bookmaker</SelectItem>
                              <SelectItem value="banco">Banco</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {contextoEntidade && (
                  <div className="space-y-4 p-4 rounded-xl border border-border/50 bg-muted/20 animate-in fade-in duration-300">
                    <h4 className="flex items-center gap-2 text-sm font-bold text-foreground mb-4">
                      <Building2 className="h-4 w-4 text-primary" />
                      Entidade Relacionada
                    </h4>
                    {contextoEntidade === 'bookmaker' ? (
                      <>
                        <FormItem>
                          <FormLabel className="text-[11px] font-bold uppercase text-muted-foreground">Casa / Plataforma</FormLabel>
                          <Popover open={casaPopoverOpen} onOpenChange={setCasaPopoverOpen}>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className="w-full h-11 justify-between bg-background border-input font-normal hover:bg-background">
                                <div className="flex items-center gap-2 truncate">
                                  {selectedCasa ? (
                                    <>
                                      <Avatar className="h-5 w-5 rounded-sm shrink-0">
                                        <AvatarImage src={casasUnicasMap[selectedCasa] || undefined} />
                                        <AvatarFallback className="rounded-sm bg-primary/10 text-[8px] font-bold">
                                          {selectedCasa.substring(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                      </Avatar>
                                      <span className="truncate">{selectedCasa}</span>
                                    </>
                                  ) : (
                                    <span className="text-muted-foreground">Selecione a casa...</span>
                                  )}
                                </div>
                                <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="p-0 w-[440px]" align="start">
                              <Command>
                                <CommandInput placeholder="Buscar casa..." />
                                <CommandList>
                                  <CommandEmpty>Nenhuma casa encontrada.</CommandEmpty>
                                  <CommandGroup>
                                    {casasUnicas.map(casa => (
                                      <CommandItem 
                                        key={casa} 
                                        className="flex items-center gap-2 py-3"
                                        onSelect={() => { 
                                          setSelectedCasa(casa); 
                                          setCasaPopoverOpen(false); 
                                          form.setValue('entidade_id', ''); 
                                        }}
                                      >
                                        <div className="flex items-center flex-1 gap-2">
                                          <Avatar className="h-6 w-6 rounded-sm shrink-0 border border-border/50">
                                            <AvatarImage src={casasUnicasMap[casa] || undefined} />
                                            <AvatarFallback className="rounded-sm bg-primary/10 text-[9px] font-bold">
                                              {casa.substring(0, 2).toUpperCase()}
                                            </AvatarFallback>
                                          </Avatar>
                                          <span className="font-medium">{casa}</span>
                                        </div>
                                        <Check className={cn("h-4 w-4", selectedCasa === casa ? "opacity-100" : "opacity-0")} />
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </FormItem>
                        <FormField
                          control={form.control}
                          name="entidade_id"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-[11px] font-bold uppercase text-muted-foreground">Vínculo / Titular</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value} disabled={!selectedCasa}>
                                <FormControl><SelectTrigger className="h-10 bg-background"><SelectValue placeholder="Selecione o vínculo..." /></SelectTrigger></FormControl>
                                <SelectContent>
                                  {vinculosDaCasa.map(v => (
                                    <SelectItem key={v.id} value={v.id}>
                                      {v.parceiros?.nome} {v.instance_identifier ? `(${v.instance_identifier})` : ''}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )}
                        />
                      </>
                    ) : (
                      <>
                        <FormItem>
                          <FormLabel className="text-[11px] font-bold uppercase text-muted-foreground">Parceiro</FormLabel>
                          <Popover open={bancoPopoverOpen} onOpenChange={setBancoPopoverOpen}>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className="w-full h-11 justify-between bg-background border-input font-normal hover:bg-background">
                                <div className="flex items-center gap-2 truncate">
                                  {selectedParceiroId ? (
                                    <>
                                      <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                        <User className="h-3 w-3 text-primary" />
                                      </div>
                                      <span className="truncate">{parceiros.find(p => p.id === selectedParceiroId)?.nome || "Selecione o parceiro"}</span>
                                    </>
                                  ) : (
                                    <span className="text-muted-foreground">Selecione o parceiro...</span>
                                  )}
                                </div>
                                <ChevronsUpDown className="h-4 w-4 opacity-50 ml-2 shrink-0" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="p-0 w-[440px]" align="start">
                              <Command>
                                <CommandInput placeholder="Buscar parceiro..." />
                                <CommandList>
                                  <CommandEmpty>Nenhum parceiro encontrado.</CommandEmpty>
                                  <CommandGroup>
                                    {parceiros.map(p => (
                                      <CommandItem 
                                        key={p.id} 
                                        className="flex items-center gap-2 py-3"
                                        onSelect={() => { 
                                          setSelectedParceiroId(p.id); 
                                          setBancoPopoverOpen(false); 
                                          form.setValue('entidade_id', ''); 
                                        }}
                                      >
                                        <div className="flex items-center flex-1 gap-2">
                                          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                            <User className="h-3.5 w-3.5 text-primary" />
                                          </div>
                                          <span className="font-medium">{p.nome}</span>
                                        </div>
                                        <Check className={cn("h-4 w-4", selectedParceiroId === p.id ? "opacity-100" : "opacity-0")} />
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </FormItem>
                        <FormField
                          control={form.control}
                          name="entidade_id"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-[11px] font-bold uppercase text-muted-foreground">Conta ou Wallet</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value} disabled={!selectedParceiroId}>
                                <FormControl><SelectTrigger className="h-10 bg-background"><SelectValue placeholder="Selecione..." /></SelectTrigger></FormControl>
                                <SelectContent>
                                  {contasEWallets.map(c => (
                                    <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )}
                        />
                      </>
                    )}
                  </div>
                )}
              </div>
            )}



            {step === 2 && (
              <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                <div className="space-y-4 p-4 rounded-xl border border-border/50 bg-muted/20">
                  <h4 className="flex items-center gap-2 text-sm font-bold text-foreground mb-4">
                    <FileText className="h-4 w-4 text-primary" />
                    Detalhamento do Incidente
                  </h4>
                  <FormField
                    control={form.control}
                    name="titulo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[11px] font-bold uppercase text-muted-foreground">Título</FormLabel>
                        <FormControl><Input placeholder="Ex: Saque bloqueado na Betano" className="h-10 bg-background" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="descricao"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[11px] font-bold uppercase text-muted-foreground">Descrição detalhada</FormLabel>
                        <FormControl><Textarea placeholder="Descreva o que aconteceu..." className="min-h-[80px] bg-background resize-none" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-4 p-4 rounded-xl border border-border/50 bg-muted/20">
                  <h4 className="flex items-center gap-2 text-sm font-bold text-foreground mb-4">
                    <DollarSign className="h-4 w-4 text-primary" />
                    Financeiro e Urgência
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="prioridade"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[11px] font-bold uppercase text-muted-foreground">Prioridade</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger className="h-10 bg-background"><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="baixa">Baixa</SelectItem>
                              <SelectItem value="media">Média</SelectItem>
                              <SelectItem value="alta">Alta</SelectItem>
                              <SelectItem value="urgente">Urgente</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="valor_risco"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between mb-2">
                            <FormLabel className="text-[11px] font-bold uppercase text-muted-foreground mb-0">Disputa</FormLabel>
                            {selectedBookmaker && (
                              <div className="text-[10px] font-bold opacity-60">
                                Saldo: {selectedBookmaker.moeda} {Number(selectedBookmaker.saldo_atual).toLocaleString('pt-BR')}
                              </div>
                            )}
                          </div>
                          <FormControl>
                            <div className="relative">
                              <DollarSign className={cn(
                                "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4",
                                isValueExceedingBalance ? "text-destructive" : "text-muted-foreground"
                              )} />
                              <Input type="number" step="0.01" className={cn("pl-9 h-10 bg-background", isValueExceedingBalance && "border-destructive text-destructive")} {...field} />
                            </div>
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  {selectedBookmaker && valorRisco > 0 && (
                    <div className="pt-2">
                       <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider mb-1.5">
                          <span className="text-muted-foreground">Exposição do Saldo</span>
                          <span className={cn(isValueExceedingBalance ? "text-destructive" : "text-primary")}>{exposurePercentage.toFixed(1)}%</span>
                       </div>
                       <div className="h-1.5 w-full bg-background rounded-full overflow-hidden border border-border/20">
                          <div className={cn("h-full transition-all duration-500", isValueExceedingBalance ? "bg-destructive" : "bg-primary")} style={{ width: `${Math.min(exposurePercentage, 100)}%` }} />
                       </div>
                    </div>
                  )}
                </div>
              </div>
            )}


            {step === 3 && (
              <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                <div className="p-5 bg-primary/5 rounded-xl border border-primary/10 space-y-4">
                   <div className="flex items-start gap-4">
                      <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
                         <Briefcase className="h-6 w-6 text-primary" />
                      </div>
                      <div className="min-w-0">
                         <p className="text-base font-bold text-foreground truncate">{form.getValues('titulo')}</p>
                         <p className="text-sm text-muted-foreground leading-relaxed mt-1">Defina o responsável operacional para iniciar o atendimento desta ocorrência.</p>
                      </div>
                   </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <FormLabel className="text-[11px] font-bold uppercase text-muted-foreground">Selecionar Responsável</FormLabel>
                    <Badge variant="outline" className="text-[10px] font-bold">{members.length} membros disponíveis</Badge>
                  </div>
                  <div className="grid grid-cols-1 gap-2 max-h-[280px] overflow-y-auto pr-2 custom-scrollbar">
                    {members.map(m => (
                      <button
                        key={m.user_id}
                        type="button"
                        onClick={() => setExecutorId(m.user_id)}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-xl border transition-all text-left group",
                          executorId === m.user_id 
                            ? "bg-primary/10 border-primary shadow-[0_0_0_1px_inset_rgba(var(--primary),0.1)]" 
                            : "bg-background border-border hover:border-primary/30 hover:bg-primary/5"
                        )}
                      >
                        <div className="flex items-center gap-3">
                           <div className={cn(
                             "h-9 w-9 rounded-lg flex items-center justify-center text-xs font-bold border transition-colors",
                             executorId === m.user_id ? "bg-primary text-primary-foreground border-primary" : "bg-muted border-border group-hover:border-primary/20"
                           )}>
                              {m.full_name?.charAt(0) || m.email?.charAt(0)}
                           </div>
                           <div>
                              <p className="text-sm font-bold text-foreground">{m.full_name || m.email}</p>
                              <p className="text-[10px] text-muted-foreground uppercase font-medium tracking-tight">{m.role}</p>
                           </div>
                        </div>
                        {executorId === m.user_id && (
                          <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                            <Check className="h-3.5 w-3.5 text-primary-foreground" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </form>
        </Form>

        <DialogFooter className="p-6 border-t border-border/40 bg-muted/5">
           <div className="flex w-full items-center justify-between">
             {step > 1 ? (
               <Button type="button" variant="outline" onClick={() => setStep(prev => prev - 1)} className="gap-2 px-5 font-bold text-xs uppercase tracking-wider">
                  <ChevronLeft className="h-4 w-4" /> Voltar
               </Button>
             ) : (
               <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="font-bold text-xs uppercase tracking-wider">Cancelar</Button>
             )}
             
             <div className="flex items-center gap-3">
                {step < 3 ? (
                  <Button 
                    type="button" 
                    onClick={nextStep} 
                    className="gap-2 px-8 font-bold text-xs uppercase tracking-wider shadow-lg shadow-primary/20"
                    disabled={step === 2 && isValueExceedingBalance}
                  >
                    Próximo <ChevronRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button 
                    type="button" 
                    onClick={form.handleSubmit(onSubmit)} 
                    disabled={!executorId || isPending} 
                    className="gap-2 px-8 font-bold text-xs uppercase tracking-wider shadow-lg shadow-primary/20"
                  >
                     {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                     Criar Ocorrência
                  </Button>
                )}
             </div>
           </div>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
