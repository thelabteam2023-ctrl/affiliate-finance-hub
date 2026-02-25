import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useWorkspaceBookmakers } from '@/hooks/useWorkspaceBookmakers';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Building2, X, Check, ChevronsUpDown, Sparkles, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface CreateTopicDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCategory?: CommunityCategory;
  defaultBookmakerId?: string;
  defaultBookmakerName?: string;
  onSuccess: () => void;
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
  const { data: workspaceBookmakers = [] } = useWorkspaceBookmakers();
  const [saving, setSaving] = useState(false);
  const [polishing, setPolishing] = useState(false);

  const [categoria, setCategoria] = useState<CommunityCategory>(defaultCategory || 'casas_de_aposta');
  const [titulo, setTitulo] = useState('');
  const [conteudo, setConteudo] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);

  // Bookmaker tag (optional)
  const [bookmakerSearch, setBookmakerSearch] = useState('');
  const [selectedBookmakerId, setSelectedBookmakerId] = useState<string | null>(defaultBookmakerId || null);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const selectedBookmaker = useMemo(
    () => workspaceBookmakers.find((b) => b.id === selectedBookmakerId) || null,
    [workspaceBookmakers, selectedBookmakerId]
  );

  const filteredBookmakers = useMemo(() => {
    if (!bookmakerSearch.trim()) return workspaceBookmakers;
    const q = bookmakerSearch.toLowerCase();
    return workspaceBookmakers.filter((b) => b.nome.toLowerCase().includes(q));
  }, [workspaceBookmakers, bookmakerSearch]);

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setCategoria(defaultCategory || 'casas_de_aposta');
      setTitulo('');
      setConteudo('');
      setIsAnonymous(false);
      setSelectedBookmakerId(defaultBookmakerId || null);
      setBookmakerSearch('');
      setPopoverOpen(false);
    }
  }, [open, defaultCategory, defaultBookmakerId]);

  const handlePolish = async () => {
    if (!titulo.trim() && !conteudo.trim()) {
      toast({ title: 'Nada para polir', description: 'Escreva algo no título ou conteúdo primeiro.', variant: 'destructive' });
      return;
    }

    setPolishing(true);
    try {
      const { data, error } = await supabase.functions.invoke('polish-topic', {
        body: { titulo: titulo.trim(), conteudo: conteudo.trim(), categoria },
      });

      if (error) throw error;

      if (data?.titulo) setTitulo(data.titulo);
      if (data?.conteudo) setConteudo(data.conteudo);

      toast({ title: '✨ Texto polido com sucesso!', description: 'Revise as sugestões antes de publicar.' });
    } catch (error: any) {
      console.error('Polish error:', error);
      const msg = error?.message || 'Erro ao polir o texto';
      toast({ title: 'Erro na IA', description: msg, variant: 'destructive' });
    } finally {
      setPolishing(false);
    }
  };
  

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

  const canPolish = (titulo.trim().length > 0 || conteudo.trim().length > 0) && !polishing && !saving;

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

          {/* AI Polish Button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full gap-2 border-dashed"
            onClick={handlePolish}
            disabled={!canPolish}
          >
            {polishing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Polindo com IA...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Polir texto com IA
              </>
            )}
          </Button>

          {/* Bookmaker tag (optional) */}
          <div className="space-y-2">
            <Label className="text-sm">Casa relacionada (opcional)</Label>
            {selectedBookmaker ? (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1">
                  {selectedBookmaker.logo_url ? (
                    <img src={selectedBookmaker.logo_url} alt="" className="h-3 w-3 object-contain" />
                  ) : (
                    <Building2 className="h-3 w-3" />
                  )}
                  {selectedBookmaker.nome}
                  <button
                    onClick={() => setSelectedBookmakerId(null)}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              </div>
            ) : (
              <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={popoverOpen}
                    className="w-full justify-between font-normal text-muted-foreground"
                  >
                    Selecionar casa...
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start" side="bottom">
                  <div className="p-2 border-b border-border">
                    <Input
                      placeholder="Buscar casa..."
                      value={bookmakerSearch}
                      onChange={(e) => setBookmakerSearch(e.target.value)}
                      className="h-8"
                    />
                  </div>
                  <div className="max-h-48 overflow-auto">
                    {filteredBookmakers.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-3 text-center">Nenhuma casa encontrada.</p>
                    ) : (
                      filteredBookmakers.map((bm) => (
                        <button
                          key={bm.id}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left"
                          onClick={() => {
                            setSelectedBookmakerId(bm.id);
                            setBookmakerSearch('');
                            setPopoverOpen(false);
                          }}
                        >
                          {bm.logo_url ? (
                            <img src={bm.logo_url} alt="" className="h-5 w-5 object-contain" />
                          ) : (
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="flex-1">{bm.nome}</span>
                          {bm.id === selectedBookmakerId && (
                            <Check className="h-4 w-4 text-primary" />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>
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
