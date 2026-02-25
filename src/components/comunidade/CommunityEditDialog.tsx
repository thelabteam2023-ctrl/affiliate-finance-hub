import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

interface CommunityEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'topic' | 'comment';
  id: string;
  initialTitle?: string;
  initialContent: string;
  onSuccess: () => void;
}

export function CommunityEditDialog({
  open,
  onOpenChange,
  type,
  id,
  initialTitle,
  initialContent,
  onSuccess,
}: CommunityEditDialogProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState(initialTitle || '');
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);

  // Sync state when dialog opens or props change
  useEffect(() => {
    if (open) {
      setTitle(initialTitle || '');
      setContent(initialContent || '');
    }
  }, [open, initialTitle, initialContent]);

  const handleSave = async () => {
    if (!content.trim()) {
      toast({ title: 'Conteúdo é obrigatório', variant: 'destructive' });
      return;
    }

    if (type === 'topic' && !title.trim()) {
      toast({ title: 'Título é obrigatório', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      if (type === 'topic') {
        const { error } = await supabase
          .from('community_topics')
          .update({
            titulo: title.trim(),
            conteudo: content.trim(),
            edited_at: new Date().toISOString(),
          })
          .eq('id', id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('community_comments')
          .update({
            conteudo: content.trim(),
            edited_at: new Date().toISOString(),
          })
          .eq('id', id);

        if (error) throw error;
      }

      toast({ title: 'Editado com sucesso!' });
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error editing:', error);
      toast({ 
        title: 'Erro ao editar', 
        description: error.message || 'Tente novamente',
        variant: 'destructive' 
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Editar {type === 'topic' ? 'Tópico' : 'Comentário'}</DialogTitle>
          <DialogDescription>
            Faça as alterações desejadas abaixo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {type === 'topic' && (
            <div className="space-y-2">
              <Label htmlFor="title">Título</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título do tópico"
              />
            </div>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="content">Conteúdo</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={type === 'topic' ? 'Conteúdo do tópico...' : 'Conteúdo do comentário...'}
              rows={type === 'topic' ? 6 : 3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
