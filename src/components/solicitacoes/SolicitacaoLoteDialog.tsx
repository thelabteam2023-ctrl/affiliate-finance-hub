import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useCriarSolicitacao } from '@/hooks/useSolicitacoes';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspaceMembers } from '@/hooks/useWorkspaceMembers';
import { useWorkspaceBookmakers } from '@/hooks/useWorkspaceBookmakers';
import { SOLICITACAO_TIPO_LABELS } from '@/types/solicitacoes';
import type { SolicitacaoTipo, SolicitacaoPrioridade } from '@/types/solicitacoes';
import { Loader2, Trash2, AlertCircle, ClipboardPaste, User, Building2, Search, Check, X } from 'lucide-react';
import { cn, getFirstLastName } from '@/lib/utils';
import { toast } from 'sonner';
import { parseBatchText, type ParsedItem } from '@/lib/solicitacoes-parser';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Extended parsed item with resolved bookmaker ID */
interface BatchItem extends ParsedItem {
  bookmaker_id?: string;
  bookmaker_nome?: string;
  bookmaker_logo_url?: string;
}

/** Inline bookmaker selector for each batch item */
function ItemBookmakerSelect({
  value,
  onSelect,
  bookmakers,
}: {
  value?: string;
  onSelect: (id: string | undefined, nome: string | undefined, logo: string | undefined) => void;
  bookmakers: { id: string; nome: string; logo_url: string | null }[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return bookmakers;
    const term = search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return bookmakers.filter((b) =>
      b.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(term),
    );
  }, [bookmakers, search]);

  const selected = bookmakers.find((b) => b.id === value);

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(''); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer hover:opacity-80 max-w-[160px]',
            selected
              ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10 font-semibold'
              : 'border-dashed border-muted-foreground/40 text-muted-foreground hover:border-primary/50',
          )}
        >
          {selected?.logo_url && (
            <img src={selected.logo_url} alt="" className="h-3 w-3 rounded object-contain" />
          )}
          {!selected && <Building2 className="h-2.5 w-2.5" />}
          <span className="truncate">{selected?.nome ?? 'Casa'}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0 z-[10000]" align="start" sideOffset={4}>
        <div className="p-1.5 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar casa..."
              autoFocus
              className="w-full h-7 pl-6 pr-2 text-xs rounded border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
        <div className="max-h-48 overflow-y-auto p-1">
          {/* Option to clear */}
          {value && (
            <button
              type="button"
              onClick={() => { onSelect(undefined, undefined, undefined); setOpen(false); }}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-accent text-muted-foreground"
            >
              <X className="h-3 w-3" />
              Remover casa
            </button>
          )}
          {filtered.length === 0 ? (
            <p className="p-3 text-center text-xs text-muted-foreground">Nenhuma casa encontrada</p>
          ) : (
            filtered.map((bk) => (
              <button
                key={bk.id}
                type="button"
                onClick={() => {
                  onSelect(bk.id, bk.nome, bk.logo_url ?? undefined);
                  setOpen(false);
                }}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-accent',
                  bk.id === value && 'bg-accent font-medium',
                )}
              >
                {bk.id === value ? (
                  <Check className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                ) : (
                  <span className="w-3" />
                )}
                {bk.logo_url ? (
                  <img src={bk.logo_url} alt="" className="h-4 w-4 rounded object-contain flex-shrink-0" />
                ) : (
                  <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
                <span className="truncate uppercase font-medium tracking-wide">{bk.nome}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function SolicitacaoLoteDialog({ open, onOpenChange }: Props) {
  const [step, setStep] = useState<'input' | 'review'>('input');
  const [rawText, setRawText] = useState('');
  const [items, setItems] = useState<BatchItem[]>([]);
  const [prioridade, setPrioridade] = useState<SolicitacaoPrioridade>('media');
  const [executorId, setExecutorId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { mutateAsync: criar } = useCriarSolicitacao();
  const { user } = useAuth();
  const { data: members = [] } = useWorkspaceMembers();
  const { data: workspaceBookmakers = [], isLoading: bookmakersLoading } = useWorkspaceBookmakers();

  /** Try to auto-match a parsed bookmaker name to a workspace bookmaker */
  const autoMatchBookmaker = (parsedName?: string) => {
    if (!parsedName) return { id: undefined, nome: undefined, logo: undefined };
    const normalized = parsedName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const match = workspaceBookmakers.find((bk) => {
      const bkNorm = bk.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return bkNorm === normalized || bkNorm.includes(normalized) || normalized.includes(bkNorm);
    });
    return match
      ? { id: match.id, nome: match.nome, logo: match.logo_url ?? undefined }
      : { id: undefined, nome: parsedName, logo: undefined };
  };

  const handleParse = () => {
    const parsed = parseBatchText(rawText);
    if (parsed.length === 0) {
      toast.error('Nenhuma linha válida encontrada');
      return;
    }
    // Enrich parsed items with auto-matched bookmaker IDs
    const enriched: BatchItem[] = parsed.map((item) => {
      const match = autoMatchBookmaker(item.bookmaker);
      return {
        ...item,
        bookmaker_id: match.id,
        bookmaker_nome: match.nome ?? item.bookmaker,
        bookmaker_logo_url: match.logo,
      };
    });
    setItems(enriched);
    setStep('review');
  };

  const toggleItem = (id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, selecionado: !item.selecionado } : item,
      ),
    );
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateItem = (id: string, updates: Partial<BatchItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    );
  };

  const selectedCount = items.filter((i) => i.selecionado).length;

  const handleSubmit = async () => {
    const selected = items.filter((i) => i.selecionado);
    if (selected.length === 0) return;
    if (!executorId) {
      toast.error('Selecione um responsável');
      return;
    }

    setSubmitting(true);
    const loteId = crypto.randomUUID();
    let successCount = 0;

    const executor = members.find((m) => m.user_id === executorId);

    for (const item of selected) {
      try {
        const titulo = `${SOLICITACAO_TIPO_LABELS[item.tipo]}${item.bookmaker_nome ? ` - ${item.bookmaker_nome}` : ''}${item.titular ? ` - ${item.titular}` : ''}${item.valor ? ` - R$ ${item.valor.toLocaleString('pt-BR')}` : ''}`;

        // Build metadata with bookmaker info for Kanban card display
        const metadata: Record<string, unknown> = {
          lote_id: loteId,
          executor_ids: [executorId],
          executor_nomes: executor?.full_name ? [executor.full_name] : [],
        };

        // Bookmaker data for card display
        if (item.bookmaker_nome) {
          metadata['bookmaker_nomes'] = item.bookmaker_nome;
          if (item.bookmaker_id) {
            metadata['bookmaker_ids'] = [item.bookmaker_id];
          }
          if (item.bookmaker_logo_url) {
            metadata['bookmaker_logos'] = { [item.bookmaker_nome]: item.bookmaker_logo_url };
          }
        }

        if (item.valor != null) metadata['valor'] = item.valor;

        await criar({
          titulo,
          descricao: item.descricao,
          tipo: item.tipo,
          prioridade,
          executor_id: executorId,
          destinatario_nome: item.titular || undefined,
          bookmaker_id: item.bookmaker_id || undefined,
          contexto_metadata: metadata,
        });
        successCount++;
      } catch {
        // continue with others
      }
    }

    setSubmitting(false);
    toast.success(`${successCount} solicitações criadas em lote!`);
    onOpenChange(false);
    setStep('input');
    setRawText('');
    setItems([]);
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      setStep('input');
      setRawText('');
      setItems([]);
    }
    onOpenChange(v);
  };

  // Count unmatched bookmakers for feedback
  const unmatchedCount = items.filter((i) => i.selecionado && i.bookmaker_nome && !i.bookmaker_id).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardPaste className="h-5 w-5 text-primary" />
            {step === 'input' ? 'Criação em Lote' : 'Revisar Solicitações'}
          </DialogTitle>
        </DialogHeader>

        {step === 'input' ? (
          <div className="space-y-4 flex-1">
            <p className="text-sm text-muted-foreground">
              Cole múltiplas solicitações (texto livre). O sistema interpreta automaticamente tipo, plataforma, destinatário e valor — inclusive agrupando por contexto.
            </p>
            <Textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={`Exemplos:\n\nFacial\nBetano Glayza\nSuperbet Glayza\n\nDepósito:\nSportingbet Mariana 900\nBetano Juliana 500\n\nSaque 900 bolsa Luiz`}
              className="min-h-[200px] font-mono text-sm"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancelar
              </Button>
              <Button onClick={handleParse} disabled={!rawText.trim()}>
                Processar ({rawText.split('\n').filter((l) => l.trim()).length} linhas)
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            {/* Config: responsável + prioridade */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Responsável *</label>
                <Select value={executorId} onValueChange={setExecutorId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Selecionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.full_name ? getFirstLastName(m.full_name) : m.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Prioridade</label>
                <Select value={prioridade} onValueChange={(v) => setPrioridade(v as SolicitacaoPrioridade)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">🟢 Baixa</SelectItem>
                    <SelectItem value="media">🟡 Média</SelectItem>
                    <SelectItem value="alta">🔴 Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Feedback: unmatched bookmakers */}
            {unmatchedCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/30 text-xs text-orange-400">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {unmatchedCount} item{unmatchedCount > 1 ? 'ns' : ''} com casa não reconhecida — clique na badge para selecionar manualmente.
                </span>
              </div>
            )}

            {/* Items list */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {items.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    'flex items-start gap-2 p-2.5 rounded-lg border transition-colors',
                    item.selecionado
                      ? 'border-border bg-card'
                      : 'border-border/30 bg-muted/20 opacity-50',
                    item.incompleto && item.selecionado && 'border-orange-500/40',
                    item.selecionado && item.bookmaker_nome && !item.bookmaker_id && 'border-orange-500/30',
                  )}
                >
                  <Checkbox
                    checked={item.selecionado}
                    onCheckedChange={() => toggleItem(item.id)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Tipo selector */}
                      <Select
                        value={item.tipo}
                        onValueChange={(v) => updateItem(item.id, { tipo: v as SolicitacaoTipo, incompleto: false })}
                      >
                        <SelectTrigger className="h-6 w-auto min-w-[120px] text-[10px] px-2 border-none bg-secondary">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.entries(SOLICITACAO_TIPO_LABELS) as [SolicitacaoTipo, string][]).map(
                            ([value, label]) => (
                              <SelectItem key={value} value={value} className="text-xs">
                                {label}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>

                      {/* Bookmaker selector (always editable) */}
                      <ItemBookmakerSelect
                        value={item.bookmaker_id}
                        onSelect={(id, nome, logo) =>
                          updateItem(item.id, {
                            bookmaker_id: id,
                            bookmaker_nome: nome,
                            bookmaker_logo_url: logo,
                            bookmaker: nome,
                          })
                        }
                        bookmakers={workspaceBookmakers.map((bk) => ({
                          id: bk.id,
                          nome: bk.nome,
                          logo_url: bk.logo_url,
                        }))}
                      />

                      {/* Unmatched indicator */}
                      {item.bookmaker_nome && !item.bookmaker_id && (
                        <Badge variant="outline" className="text-[9px] text-orange-400 border-orange-400/50 gap-0.5">
                          <AlertCircle className="h-2.5 w-2.5" />
                          "{item.bookmaker_nome}" não reconhecida
                        </Badge>
                      )}

                      {/* Destinatário */}
                      {item.titular && (
                        <Badge variant="outline" className="text-[9px] gap-0.5 px-1.5 text-blue-400 border-blue-400/50">
                          <User className="h-2.5 w-2.5" />
                          {item.titular}
                        </Badge>
                      )}

                      {item.incompleto && (
                        <Badge variant="outline" className="text-[9px] text-orange-400 border-orange-400/50 gap-0.5">
                          <AlertCircle className="h-2.5 w-2.5" />
                          Incompleto
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{item.descricao}</p>
                    {item.valor != null && (
                      <span className="text-[10px] text-primary font-medium">
                        R$ {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeItem(item.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setStep('input')}>
                Voltar
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting || selectedCount === 0 || !executorId}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Criando...
                  </>
                ) : (
                  `Criar ${selectedCount} solicitações`
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
