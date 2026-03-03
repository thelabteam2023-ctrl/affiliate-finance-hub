import { useState, useEffect, useMemo, useRef } from 'react';
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
import { Building2, X, Check, ChevronsUpDown, Sparkles, Loader2, Mic, MicOff, ImagePlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const MAX_IMAGES = 4;
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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
  const [listening, setListening] = useState(false);
  const [activeField, setActiveField] = useState<'titulo' | 'conteudo' | null>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [categoria, setCategoria] = useState<CommunityCategory>(defaultCategory || 'casas_de_aposta');
  const [titulo, setTitulo] = useState('');
  const [conteudo, setConteudo] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);

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
      setSelectedImages([]);
      setImagePreviews([]);
    }
  }, [open, defaultCategory, defaultBookmakerId]);

  // Clean up previews on unmount
  useEffect(() => {
    return () => {
      imagePreviews.forEach(url => URL.revokeObjectURL(url));
    };
  }, [imagePreviews]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remaining = MAX_IMAGES - selectedImages.length;
    if (remaining <= 0) {
      toast({ title: `Máximo de ${MAX_IMAGES} imagens`, variant: 'destructive' });
      return;
    }

    const validFiles: File[] = [];
    for (const file of files.slice(0, remaining)) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        toast({ title: 'Formato inválido', description: `${file.name}: use JPG, PNG ou WebP.`, variant: 'destructive' });
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast({ title: 'Arquivo muito grande', description: `${file.name}: máximo 2MB.`, variant: 'destructive' });
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length > 0) {
      const newPreviews = validFiles.map(f => URL.createObjectURL(f));
      setSelectedImages(prev => [...prev, ...validFiles]);
      setImagePreviews(prev => [...prev, ...newPreviews]);
    }

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (index: number) => {
    URL.revokeObjectURL(imagePreviews[index]);
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const uploadImages = async (userId: string): Promise<string[]> => {
    const urls: string[] = [];
    for (const file of selectedImages) {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage
        .from('community-images')
        .upload(path, file, { contentType: file.type });
      if (error) throw error;
      const { data: urlData } = supabase.storage
        .from('community-images')
        .getPublicUrl(path);
      urls.push(urlData.publicUrl);
    }
    return urls;
  };

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
      // Upload images first
      let imageUrls: string[] = [];
      if (selectedImages.length > 0) {
        imageUrls = await uploadImages(user.id);
      }

      const { error } = await supabase.from('community_topics').insert({
        user_id: user.id,
        categoria,
        titulo: titulo.trim(),
        conteudo: conteudo.trim(),
        is_anonymous: isAnonymous,
        bookmaker_catalogo_id: selectedBookmaker?.id || null,
        image_urls: imageUrls.length > 0 ? imageUrls : undefined,
      } as any);

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

  const stopVoice = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setListening(false);
    setActiveField(null);
  };

  const toggleVoice = (field: 'titulo' | 'conteudo') => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ title: 'Não suportado', description: 'Seu navegador não suporta reconhecimento de voz.', variant: 'destructive' });
      return;
    }

    if (listening) {
      stopVoice();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognitionRef.current = recognition;

    let finalTranscript = '';

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript + ' ';
        } else {
          interim += result[0].transcript;
        }
      }
      const combined = (finalTranscript + interim).trim();
      if (field === 'conteudo') {
        setConteudo((prev) => {
          const base = prev && !listening ? prev + ' ' : '';
          return base + combined;
        });
      }
    };

    recognition.onend = () => {
      setListening(false);
      setActiveField(null);
      recognitionRef.current = null;
    };

    recognition.onerror = (e: any) => {
      if (e.error === 'no-speech') return;
      stopVoice();
      toast({ title: 'Erro no microfone', description: 'Não foi possível capturar áudio. Verifique as permissões.', variant: 'destructive' });
    };

    const currentConteudo = conteudo;
    recognition.onresult = (event: any) => {
      let final = '';
      let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript + ' ';
        } else {
          interim += result[0].transcript;
        }
      }
      const combined = (final + interim).trim();
      if (field === 'conteudo') {
        setConteudo(currentConteudo ? currentConteudo + ' ' + combined : combined);
      }
    };

    setListening(true);
    setActiveField(field);
    recognition.start();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
            <div className="flex items-center justify-between">
              <Label htmlFor="conteudo">Conteúdo *</Label>
              <Button
                type="button"
                variant={listening && activeField === 'conteudo' ? 'destructive' : 'ghost'}
                size="sm"
                className="gap-1 h-7 text-xs"
                onClick={() => toggleVoice('conteudo')}
                title="Ditar conteúdo por voz"
              >
                {listening && activeField === 'conteudo' ? (
                  <><MicOff className="h-3.5 w-3.5" /> Parar</>
                ) : (
                  <><Mic className="h-3.5 w-3.5" /> Falar</>
                )}
              </Button>
            </div>
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
                Aprimorando...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Aprimorar com IA
              </>
            )}
          </Button>

          {/* Image Upload */}
          <div className="space-y-2">
            <Label className="text-sm">Imagens (opcional — máx. {MAX_IMAGES})</Label>
            
            {/* Preview grid */}
            {imagePreviews.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {imagePreviews.map((preview, i) => (
                  <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-border">
                    <img src={preview} alt={`Preview ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute top-1 right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {selectedImages.length < MAX_IMAGES && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={handleImageSelect}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 border-dashed"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus className="h-4 w-4" />
                  Adicionar imagem ({selectedImages.length}/{MAX_IMAGES})
                </Button>
              </>
            )}
          </div>

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
