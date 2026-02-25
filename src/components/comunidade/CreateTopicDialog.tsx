import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { COMMUNITY_CATEGORIES, type CommunityCategory } from '@/lib/communityCategories';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface CreateTopicDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCategory?: CommunityCategory;
  defaultBookmakerId?: string;
  defaultBookmakerName?: string;
  onSuccess: () => void;
}

interface BookmakerOption {
  id: string;
  nome: string;
  logo_url: string | null;
}

export function CreateTopicDialog({
  open,
  onOpenChange,
  defaultCategory,
  defaultBookmakerId,
  defaultBookmakerName,
  onSuccess,
}: CreateTopicDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [categoria, setCategoria] = useState<CommunityCategory>(defaultCategory || 'casas_de_aposta');
  const [titulo, setTitulo] = useState('');
  const [conteudo, setConteudo] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);

  // Bookmaker tag (optional)
  const [bookmakerSearch, setBookmakerSearch] = useState('');
  const [bookmakerOptions, setBookmakerOptions] = useState<BookmakerOption[]>([]);
  const [selectedBookmaker, setSelectedBookmaker] = useState<BookmakerOption | null>(
    defaultBookmakerId && defaultBookmakerName
      ? { id: defaultBookmakerId, nome: defaultBookmakerName, logo_url: null }
      : null
  );
  const [showBookmakerSearch, setShowBookmakerSearch] = useState(!!defaultBookmakerId);

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setCategoria(defaultCategory || 'casas_de_aposta');
      setTitulo('');
      setConteudo('');
      setIsAnonymous(false);
      if (defaultBookmakerId && defaultBookmakerName) {
        setSelectedBookmaker({ id: defaultBookmakerId, nome: defaultBookmakerName, logo_url: null });
        setShowBookmakerSearch(true);
      } else {
        setSelectedBookmaker(null);
        setShowBookmakerSearch(false);
      }
      setBookmakerSearch('');
    }
  }, [open, defaultCategory, defaultBookmakerId, defaultBookmakerName]);

  // Search bookmakers
  useEffect(() => {
    if (!bookmakerSearch.trim() || bookmakerSearch.length < 2) {
      setBookmakerOptions([]);
      return;
    }

    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('bookmakers_catalogo')
        .select('id, nome, logo_url')
        .eq('status', 'ATIVA')
        .eq('visibility', 'GLOBAL_REGULATED')
        .ilike('nome', `%${bookmakerSearch.trim()}%`)
        .order('nome')
        .limit(8);
      setBookmakerOptions(data || []);
    }, 300);

    return () => clearTimeout(timer);
  }, [bookmakerSearch]);

  const handleSubmit = async () => {
    if (!user?.id) {
      toast({ title: 'Erro', description: 'Você precisa estar logado.', variant: 'destructive' });
      return;
    }
    if (!titulo.trim() || !conteudo.trim()) {
      toast({ title: 'Campos obrigatórios', description: 'Preencha título e conteúdo.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('community_topics').insert({
        user_id: user.id,
        categoria,
        titulo: titulo.trim(),
        conteudo: conteudo.trim(),
        is_anonymous: isAnonymous,
        bookmaker_catalogo_id: selectedBookmaker?.id || null,
      });

      if (error) {
        if (error.code === 'P0001' || error.message?.includes('termos não permitidos')) {
          toast({ title: 'Conteúdo bloqueado', description: 'Seu texto contém termos não permitidos. Por favor, revise.', variant: 'destructive' });
        } else {
          throw error;
        }
        return;
      }
      toast({ title: 'Tópico criado com sucesso!' });
      onSuccess();
    } catch (error: any) {
      console.error('Error creating topic:', error);
      toast({ title: 'Erro ao criar tópico', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo Tópico</DialogTitle>
          <DialogDescription>
            Escolha uma categoria e compartilhe sua discussão com a comunidade.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Category */}
          <div className="space-y-2">
            <Label>Categoria *</Label>
            <Select value={categoria} onValueChange={(v) => setCategoria(v as CommunityCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMMUNITY_CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  return (
                    <SelectItem key={cat.value} value={cat.value}>
                      <span className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${cat.color}`} />
                        {cat.label}
                      </span>
                    </SelectItem>
                  );
                })}
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
              placeholder="Descreva sua experiência ou informação..."
              rows={4}
            />
          </div>

          {/* Bookmaker tag (optional) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Casa relacionada (opcional)</Label>
              {!showBookmakerSearch && (
                <Button variant="ghost" size="sm" onClick={() => setShowBookmakerSearch(true)}>
                  <Building2 className="h-3.5 w-3.5 mr-1" />
                  Adicionar
                </Button>
              )}
            </div>

            {showBookmakerSearch && (
              <div className="space-y-2">
                {selectedBookmaker ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="gap-1">
                      <Building2 className="h-3 w-3" />
                      {selectedBookmaker.nome}
                      <button
                        onClick={() => { setSelectedBookmaker(null); setBookmakerSearch(''); }}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  </div>
                ) : (
                  <div className="relative">
                    <Input
                      placeholder="Buscar casa..."
                      value={bookmakerSearch}
                      onChange={(e) => setBookmakerSearch(e.target.value)}
                    />
                    {bookmakerOptions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-md z-50 max-h-48 overflow-auto">
                        {bookmakerOptions.map((bm) => (
                          <button
                            key={bm.id}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left"
                            onClick={() => {
                              setSelectedBookmaker(bm);
                              setBookmakerSearch('');
                              setBookmakerOptions([]);
                            }}
                          >
                            {bm.logo_url ? (
                              <img src={bm.logo_url} alt="" className="h-5 w-5 object-contain" />
                            ) : (
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                            )}
                            {bm.nome}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Anonymous */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="anonymous">Publicar Anonimamente</Label>
              <p className="text-xs text-muted-foreground">Seu nome não será exibido</p>
            </div>
            <Switch id="anonymous" checked={isAnonymous} onCheckedChange={setIsAnonymous} />
          </div>

          <div className="bg-muted/50 border border-border rounded-lg p-3 text-xs text-muted-foreground">
            <strong>Lembrete:</strong> Mantenha o conteúdo profissional e focado em informações operacionais.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Publicando...' : 'Publicar Tópico'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
