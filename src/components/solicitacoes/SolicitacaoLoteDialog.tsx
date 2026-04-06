import { useState } from 'react';
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
import { useCriarSolicitacao } from '@/hooks/useSolicitacoes';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspaceMembers } from '@/hooks/useWorkspaceMembers';
import { SOLICITACAO_TIPO_LABELS } from '@/types/solicitacoes';
import type { SolicitacaoTipo, SolicitacaoPrioridade } from '@/types/solicitacoes';
import { Loader2, Trash2, AlertCircle, ClipboardPaste, User, Gamepad2 } from 'lucide-react';
import { cn, getFirstLastName } from '@/lib/utils';
import { toast } from 'sonner';
import { parseBatchText, type ParsedItem } from '@/lib/solicitacoes-parser';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SolicitacaoLoteDialog({ open, onOpenChange }: Props) {
  const [step, setStep] = useState<'input' | 'review'>('input');
  const [rawText, setRawText] = useState('');
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [prioridade, setPrioridade] = useState<SolicitacaoPrioridade>('media');
  const [executorId, setExecutorId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { mutateAsync: criar } = useCriarSolicitacao();
  const { user } = useAuth();
  const { data: members = [] } = useWorkspaceMembers();

  const handleParse = () => {
    const parsed = parseBatchText(rawText);
    if (parsed.length === 0) {
      toast.error('Nenhuma linha válida encontrada');
      return;
    }
    setItems(parsed);
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

  const updateItem = (id: string, updates: Partial<ParsedItem>) => {
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
        const titulo = `${SOLICITACAO_TIPO_LABELS[item.tipo]}${item.bookmaker ? ` - ${item.bookmaker}` : ''}${item.titular ? ` - ${item.titular}` : ''}${item.valor ? ` - R$ ${item.valor.toLocaleString('pt-BR')}` : ''}`;

        await criar({
          titulo,
          descricao: item.descricao,
          tipo: item.tipo,
          executor_id: executorId,
          destinatario_nome: item.titular || null,
          contexto_metadata: {
            lote_id: loteId,
            executor_ids: [executorId],
            executor_nomes: executor?.full_name ? [executor.full_name] : [],
            ...(item.bookmaker ? { bookmaker: item.bookmaker } : {}),
            ...(item.valor != null ? { valor: item.valor } : {}),
          },
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
              placeholder={`Exemplos:\n\nFacial\nBetano Glayza\nSuperbet Glayza\n\nDep Betano Mariana 900\nSaque 900 bolsa Luiz\nSMS 365 Lolisa`}
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
                  )}
                >
                  <Checkbox
                    checked={item.selecionado}
                    onCheckedChange={() => toggleItem(item.id)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
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
                      {item.bookmaker && (
                        <Badge variant="secondary" className="text-[9px] gap-0.5 px-1.5">
                          <Gamepad2 className="h-2.5 w-2.5" />
                          {item.bookmaker}
                        </Badge>
                      )}
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
