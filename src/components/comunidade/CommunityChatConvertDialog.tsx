import { useState, useEffect } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface BookmakerOption {
  id: string;
  nome: string;
  logo_url: string | null;
}

interface CommunityChatConvertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: {
    id: string;
    content: string;
    message_type?: 'text' | 'image' | 'audio';
    user_id: string;
  } | null;
  onSuccess: () => void;
}

export function CommunityChatConvertDialog({
  open,
  onOpenChange,
  message,
  onSuccess,
}: CommunityChatConvertDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [bookmakers, setBookmakers] = useState<BookmakerOption[]>([]);
  const [loadingBookmakers, setLoadingBookmakers] = useState(true);

  const [titulo, setTitulo] = useState('');
  const [conteudo, setConteudo] = useState('');
  const [selectedBookmaker, setSelectedBookmaker] = useState<string>('');
  const isMediaMessage = message?.message_type && message.message_type !== 'text';

  useEffect(() => {
    const fetchBookmakers = async () => {
      try {
        const { data, error } = await supabase
          .from('bookmakers_catalogo')
          .select('id, nome, logo_url')
          .eq('status', 'ATIVA')
          .eq('visibility', 'GLOBAL_REGULATED')
          .order('nome');

        if (error) throw error;
        setBookmakers(data || []);
      } catch (error) {
        console.error('Error fetching bookmakers:', error);
      } finally {
        setLoadingBookmakers(false);
      }
    };

    if (open && message) {
      fetchBookmakers();
      // For media messages, set placeholder content
      if (message.message_type === 'image') {
        setConteudo(`[Imagem]\n${message.content}`);
      } else if (message.message_type === 'audio') {
        setConteudo(`[Áudio]\n${message.content}`);
      } else {
        setConteudo(message.content);
      }
      setTitulo('');
      setSelectedBookmaker('');
    }
  }, [open, message]);

  const handleSubmit = async () => {
    if (!user?.id) {
      toast({
        title: 'Erro',
        description: 'Você precisa estar logado.',
        variant: 'destructive',
      });
      return;
    }

    if (!titulo.trim() || !conteudo.trim() || !selectedBookmaker) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha o título, conteúdo e selecione uma casa.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('community_topics').insert({
        user_id: user.id,
        bookmaker_catalogo_id: selectedBookmaker,
        titulo: titulo.trim(),
        conteudo: conteudo.trim(),
        is_anonymous: false,
      });

      if (error) throw error;

      onSuccess();
      onOpenChange(false);
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
          <DialogTitle>Converter em Tópico</DialogTitle>
          <DialogDescription>
            Transforme esta mensagem do chat em um tópico estruturado na comunidade.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Bookmaker Selection */}
          <div className="space-y-2">
            <Label htmlFor="bookmaker">Casa de Apostas *</Label>
            <Select value={selectedBookmaker} onValueChange={setSelectedBookmaker}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma casa" />
              </SelectTrigger>
              <SelectContent>
                {loadingBookmakers ? (
                  <SelectItem value="loading" disabled>
                    Carregando...
                  </SelectItem>
                ) : (
                  bookmakers.map((bm) => (
                    <SelectItem key={bm.id} value={bm.id}>
                      <div className="flex items-center gap-2">
                        {bm.logo_url && (
                          <img
                            src={bm.logo_url}
                            alt={bm.nome}
                            className="h-4 w-4 object-contain"
                          />
                        )}
                        <span>{bm.nome}</span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="titulo">Título *</Label>
            <Input
              id="titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Título do tópico"
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
              placeholder="Conteúdo do tópico"
              rows={5}
            />
            <p className="text-xs text-muted-foreground">
              A mensagem original foi copiada. Você pode editá-la antes de publicar.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Criando...' : 'Criar Tópico'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
