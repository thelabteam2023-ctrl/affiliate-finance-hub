import { useState } from 'react';
import { format } from 'date-fns';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useEditarComentario } from '@/hooks/useOcorrencias';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import {
  AlertCircle,
  ArrowRight,
  Check,
  FilePlus2,
  Link2,
  MessageSquare,
  Paperclip,
  Pencil,
  TrendingUp,
  UserPlus,
  UserMinus,
  Users,
  X,
} from 'lucide-react';
import type { OcorrenciaEvento, OcorrenciaStatus, OcorrenciaPrioridade } from '@/types/ocorrencias';
import {
  AGUARDANDO_DE_LABELS,
  CAMPO_LABELS,
  EVENTO_TIPO_LABELS,
  PRIORIDADE_LABELS,
  STATUS_LABELS,
  SUB_MOTIVO_LABELS,
  TIPO_LABELS,
  getStatusLabel,
} from '@/types/ocorrencias';

interface Props {
  evento: OcorrenciaEvento;
  autorNome: string;
  resolveNome?: (id: string) => string;
}

const ICONS: Record<string, React.ReactNode> = {
  criacao: <FilePlus2 className="h-3 w-3" />,
  comentario: <MessageSquare className="h-3 w-3" />,
  anexo: <Paperclip className="h-3 w-3" />,
  status_alterado: <ArrowRight className="h-3 w-3" />,
  executor_alterado: <Users className="h-3 w-3" />,
  observador_adicionado: <UserPlus className="h-3 w-3" />,
  observador_removido: <UserMinus className="h-3 w-3" />,
  prioridade_alterada: <TrendingUp className="h-3 w-3" />,
  vinculo_adicionado: <Link2 className="h-3 w-3" />,
  campo_alterado: <Pencil className="h-3 w-3" />,
};

const ICON_COLORS: Record<string, string> = {
  criacao: 'text-primary bg-primary/10 border-primary/30',
  comentario: 'text-muted-foreground bg-muted border-border',
  anexo: 'text-muted-foreground bg-muted border-border',
  status_alterado: 'text-blue-500 bg-blue-500/10 border-blue-500/30',
  executor_alterado: 'text-purple-500 bg-purple-500/10 border-purple-500/30',
  observador_adicionado: 'text-purple-500 bg-purple-500/10 border-purple-500/30',
  observador_removido: 'text-purple-500 bg-purple-500/10 border-purple-500/30',
  prioridade_alterada: 'text-orange-500 bg-orange-500/10 border-orange-500/30',
  vinculo_adicionado: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30',
  campo_alterado: 'text-amber-500 bg-amber-500/10 border-amber-500/30',
};

function Chip({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'from' | 'to' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
        tone === 'from' && 'border-border/60 bg-muted/40 text-muted-foreground',
        tone === 'to' && 'border-primary/30 bg-primary/10 text-primary',
        tone === 'neutral' && 'border-border/60 bg-muted/40 text-foreground/80'
      )}
    >
      {children}
    </span>
  );
}

/** Traduz o valor bruto do evento conforme o campo alterado */
function traduzirValor(campo: string | null | undefined, valor: string | null | undefined): string {
  if (!valor) return '—';
  switch (campo) {
    case 'prioridade':
      return PRIORIDADE_LABELS[valor as OcorrenciaPrioridade] || valor;
    case 'tipo':
      return TIPO_LABELS[valor as keyof typeof TIPO_LABELS] || valor;
    case 'sub_motivo':
      return SUB_MOTIVO_LABELS[valor] || valor;
    case 'valor_risco':
      return Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    case 'aguardando_de':
      return AGUARDANDO_DE_LABELS[valor as keyof typeof AGUARDANDO_DE_LABELS] || valor;
    case 'titulo':
    case 'descricao':
      return valor.length > 60 ? `${valor.slice(0, 60)}…` : valor;
    default:
      return valor;
  }
}

/**
 * Renderiza um evento da linha do tempo como frase auditável:
 * "alterou o status de Em Andamento → Aguardando Casa".
 * Eventos legados sem valor_anterior/valor_novo caem no rótulo genérico.
 */
export function TimelineEvento({ evento, autorNome, resolveNome }: Props) {
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(evento.conteudo || '');
  const { mutate: editarComentario, isPending: editing } = useEditarComentario();

  const isOwner = user?.id === evento.autor_id;
  const canEdit = evento.tipo === 'comentario' && isOwner;

  const handleSave = () => {
    if (!editValue.trim() || editValue === evento.conteudo) {
      setIsEditing(false);
      return;
    }
    editarComentario({
      eventoId: evento.id,
      ocorrenciaId: evento.ocorrencia_id,
      novoConteudo: editValue,
    }, {
      onSuccess: () => setIsEditing(false)
    });
  };

  const icon = ICONS[evento.tipo] || <AlertCircle className="h-3 w-3" />;
  const iconColor = ICON_COLORS[evento.tipo] || 'text-muted-foreground bg-muted border-border';

  const renderCorpo = () => {
    const anterior = evento.valor_anterior;
    const novo = evento.valor_novo;

    // Exclusão lógica / restauração (auditoria)
    if (evento.tipo === 'campo_alterado' && novo === 'ARQUIVADA') {
      return (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          arquivou esta ocorrência (exclusão lógica)
          {evento.conteudo ? <Chip tone="from">{evento.conteudo}</Chip> : null}
        </span>
      );
    }
    if (evento.tipo === 'campo_alterado' && anterior === 'ARQUIVADA' && novo === 'ATIVA') {
      return <span>restaurou esta ocorrência do arquivo</span>;
    }

    if (evento.tipo === 'status_alterado' && (anterior || novo)) {
      const de = anterior ? STATUS_LABELS[anterior as OcorrenciaStatus] || anterior : '—';
      const para = novo
        ? getStatusLabel(novo as OcorrenciaStatus, evento.conteudo)
        : '—';
      return (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          alterou o status de <Chip tone="from">{de}</Chip>
          <ArrowRight className="h-3 w-3 text-muted-foreground/60" />
          <Chip tone="to">{para}</Chip>
        </span>
      );
    }

    if (evento.tipo === 'executor_alterado' && (anterior || novo)) {
      return (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          transferiu de <Chip tone="from">{anterior || '—'}</Chip>
          <ArrowRight className="h-3 w-3 text-muted-foreground/60" />
          <Chip tone="to">{novo ? (resolveNome?.(novo) ?? novo) : '—'}</Chip>
        </span>
      );
    }

    if ((evento.tipo === 'prioridade_alterada' || evento.tipo === 'campo_alterado') && (anterior || novo)) {
      const campo = evento.conteudo || (evento.tipo === 'prioridade_alterada' ? 'prioridade' : null);
      const campoLabel = campo ? CAMPO_LABELS[campo] || campo : 'campo';
      return (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          alterou <span className="font-semibold text-foreground/80">{campoLabel}</span> de{' '}
          <Chip tone="from">{traduzirValor(campo, anterior)}</Chip>
          <ArrowRight className="h-3 w-3 text-muted-foreground/60" />
          <Chip tone="to">{traduzirValor(campo, novo)}</Chip>
        </span>
      );
    }

    return <span>{EVENTO_TIPO_LABELS[evento.tipo] || 'registrou um evento'}</span>;
  };

  return (
    <div className="relative pl-10">
      <div
        className={cn(
          'absolute left-0 top-1 h-7 w-7 rounded-full border flex items-center justify-center z-10',
          iconColor
        )}
      >
        {icon}
      </div>
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="text-xs font-semibold text-foreground">{autorNome}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-[10px] text-muted-foreground shrink-0 cursor-default">
              {formatDistanceToNow(new Date(evento.created_at), { addSuffix: true, locale: ptBR })}
            </span>
          </TooltipTrigger>
          <TooltipContent side="left">
            {format(new Date(evento.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="text-xs text-muted-foreground leading-relaxed">
        {renderCorpo()}
        {evento.tipo === 'comentario' && evento.conteudo && (
          <div className="group relative mt-1">
            {isEditing ? (
              <div className="space-y-2 mt-2">
                <Textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="min-h-[80px] text-xs bg-background focus-visible:ring-primary/30"
                  autoFocus
                />
                <div className="flex items-center gap-2 justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[10px] font-bold uppercase tracking-tight gap-1.5"
                    onClick={() => {
                      setIsEditing(false);
                      setEditValue(evento.conteudo || '');
                    }}
                    disabled={editing}
                  >
                    <X className="h-3 w-3" />
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 px-2 text-[10px] font-bold uppercase tracking-tight gap-1.5"
                    onClick={handleSave}
                    disabled={editing || !editValue.trim()}
                  >
                    {editing ? (
                      <span className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Check className="h-3 w-3" />
                    )}
                    Salvar
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-foreground bg-muted/30 p-2 rounded-md border border-border/20 whitespace-pre-wrap">
                  {evento.conteudo}
                </p>
                {canEdit && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 p-1 rounded-md bg-background/80 border border-border/40 text-muted-foreground hover:text-primary transition-all shadow-sm"
                    title="Editar comentário"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
