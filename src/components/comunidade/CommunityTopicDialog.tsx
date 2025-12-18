import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';

interface CommunityTopicDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookmakerId: string;
  bookmakerName: string;
  onSuccess: () => void;
}

export function CommunityTopicDialog({
  open,
  onOpenChange,
  bookmakerId,
  bookmakerName,
  onSuccess,
}: CommunityTopicDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  
  const [titulo, setTitulo] = useState('');
  const [conteudo, setConteudo] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);

  const handleSubmit = async () => {
    if (!user?.id) {
      toast({
        title: 'Erro',
        description: 'Você precisa estar logado para criar um tópico.',
        variant: 'destructive',
      });
      return;
    }

    if (!titulo.trim() || !conteudo.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha o título e o conteúdo do tópico.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('community_topics').insert({
        user_id: user.id,
        bookmaker_catalogo_id: bookmakerId,
        titulo: titulo.trim(),
        conteudo: conteudo.trim(),
        is_anonymous: isAnonymous,
      });

      if (error) throw error;

      toast({ title: 'Tópico criado com sucesso!' });
      setTitulo('');
      setConteudo('');
      setIsAnonymous(false);
      onSuccess();
    } catch (error: any) {
      console.error('Error creating topic:', error);
      toast({
        title: 'Erro ao criar tópico',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo Tópico - {bookmakerName}</DialogTitle>
          <DialogDescription>
            Compartilhe uma discussão, experiência ou informação relevante sobre esta casa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="titulo">Título *</Label>
            <Input
              id="titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Nova exigência de verificação"
              maxLength={200}
            />
          </div>

          {/* Content */}
          <div className="space-y-2">
            <Label htmlFor="conteudo">Conteúdo *</Label>
            <Textarea
              id="conteudo"
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
              placeholder="Descreva sua experiência ou informação de forma detalhada..."
              rows={5}
            />
            <p className="text-xs text-muted-foreground">
              Dica: Seja objetivo e compartilhe informações úteis para outros operadores.
            </p>
          </div>

          {/* Anonymous Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="anonymous">Publicar Anonimamente</Label>
              <p className="text-xs text-muted-foreground">
                Seu nome não será exibido no tópico
              </p>
            </div>
            <Switch
              id="anonymous"
              checked={isAnonymous}
              onCheckedChange={setIsAnonymous}
            />
          </div>

          {/* Legal Notice */}
          <div className="bg-muted/50 border border-border rounded-lg p-3 text-xs text-muted-foreground">
            <strong>Lembrete:</strong> Mantenha o conteúdo profissional e focado em informações operacionais. 
            Evite linguagem ofensiva ou informações não verificadas.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Publicando...' : 'Publicar Tópico'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
