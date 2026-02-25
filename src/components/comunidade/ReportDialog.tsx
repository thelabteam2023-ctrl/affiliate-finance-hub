import { useState } from 'react';
import { Flag, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const REPORT_REASONS = [
  { value: 'spam', label: 'Spam ou propaganda' },
  { value: 'ofensivo', label: 'Conteúdo ofensivo' },
  { value: 'sexual', label: 'Conteúdo sexual' },
  { value: 'assedio', label: 'Assédio ou bullying' },
  { value: 'desinformacao', label: 'Desinformação' },
  { value: 'outro', label: 'Outro' },
] as const;

interface ReportButtonProps {
  contentType: 'topic' | 'comment' | 'chat_message';
  contentId: string;
  size?: 'sm' | 'default';
}

export function ReportButton({ contentType, contentId, size = 'default' }: ReportButtonProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
  const buttonSize = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className={`${buttonSize} text-muted-foreground hover:text-destructive`}
        title="Denunciar"
        onClick={() => setOpen(true)}
      >
        <Flag className={iconSize} />
      </Button>
      <ReportDialog
        open={open}
        onOpenChange={setOpen}
        contentType={contentType}
        contentId={contentId}
      />
    </>
  );
}

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentType: 'topic' | 'comment' | 'chat_message';
  contentId: string;
}

function ReportDialog({ open, onOpenChange, contentType, contentId }: ReportDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [reason, setReason] = useState<string>('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user?.id || !reason) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.from('community_content_reports').insert({
        reporter_id: user.id,
        content_type: contentType,
        content_id: contentId,
        reason,
        description: description.trim() || null,
      });

      if (error) {
        if (error.code === '23505') {
          toast({ title: 'Você já denunciou este conteúdo' });
        } else {
          throw error;
        }
      } else {
        toast({ title: 'Denúncia enviada', description: 'Nossa equipe irá analisar o conteúdo.' });
      }

      onOpenChange(false);
      setReason('');
      setDescription('');
    } catch (error: any) {
      toast({ title: 'Erro ao enviar denúncia', description: error.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const typeLabel = contentType === 'topic' ? 'tópico' : contentType === 'comment' ? 'comentário' : 'mensagem';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-destructive" />
            Denunciar {typeLabel}
          </DialogTitle>
          <DialogDescription>
            Selecione o motivo da denúncia. Nossa equipe irá analisar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Motivo *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um motivo" />
              </SelectTrigger>
              <SelectContent>
                {REPORT_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Detalhes (opcional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva o problema..."
              rows={3}
              maxLength={500}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={submitting || !reason} variant="destructive">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Flag className="h-4 w-4 mr-2" />}
            Enviar Denúncia
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
