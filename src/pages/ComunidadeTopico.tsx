import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCommunityAccess } from '@/hooks/useCommunityAccess';
import { useChatPresence } from '@/hooks/useChatPresence';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { ArrowLeft, MessageSquare, User, Clock, Send, Building2, Pencil, Trash2, Radio } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { parseLocalDateTime } from '@/utils/dateUtils';
import { useToast } from '@/hooks/use-toast';
import { getCategoryByValue } from '@/lib/communityCategories';
import { ModerationMenu } from '@/components/comunidade/ModerationMenu';
import { CommunityEditDialog } from '@/components/comunidade/CommunityEditDialog';
import { ReportButton } from '@/components/comunidade/ReportDialog';
import { useCommunityModeration } from '@/hooks/useCommunityModeration';
import { CommunityChatFull } from '@/components/comunidade/CommunityChatFull';
import { OnlineIndicator } from '@/components/comunidade/OnlineIndicator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface TopicDetail {
  id: string;
  user_id: string;
  titulo: string;
  conteudo: string;
  categoria: string;
  is_anonymous: boolean;
  created_at: string;
  edited_at: string | null;
  bookmaker_catalogo_id: string | null;
  bookmaker_nome?: string | null;
  bookmaker_logo?: string | null;
  author_name?: string;
}

interface Comment {
  id: string;
  user_id: string;
  conteudo: string;
  is_anonymous: boolean;
  created_at: string;
  edited_at: string | null;
  author_name?: string;
}

export default function ComunidadeTopico() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canWrite, canEditAny } = useCommunityAccess();
  const { toast } = useToast();
  const [showLiveChat, setShowLiveChat] = useState(false);
  const { onlineCount, isConnected } = useChatPresence('topic', id);

  const [topic, setTopic] = useState<TopicDetail | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { authorDeleteTopic, authorDeleteComment, loading: moderationLoading } = useCommunityModeration();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editType, setEditType] = useState<'topic' | 'comment'>('topic');
  const [editId, setEditId] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'topic' | 'comment'; id: string } | null>(null);

  useEffect(() => {
    if (id) fetchTopic();
  }, [id]);

  const fetchTopic = async () => {
    if (!id) return;
    try {
      const { data: t, error } = await supabase
        .from('community_topics')
        .select(`
          id, user_id, titulo, conteudo, categoria, is_anonymous, created_at, edited_at,
          bookmaker_catalogo_id,
          bookmakers_catalogo(nome, logo_url, visibility)
        `)
        .eq('id', id)
        .eq('status', 'ATIVO')
        .single();

      if (error || !t) {
        setTopic(null);
        setLoading(false);
        return;
      }

      // Block restricted bookmakers
      if (t.bookmaker_catalogo_id && (t as any).bookmakers_catalogo?.visibility !== 'GLOBAL_REGULATED') {
        setTopic(null);
        setLoading(false);
        return;
      }

      // Get author name
      let authorName = 'Anônimo';
      if (!t.is_anonymous) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', t.user_id)
          .single();
        authorName = profile?.full_name || profile?.email?.split('@')[0] || 'Usuário PRO';
      }

      setTopic({
        ...t,
        categoria: t.categoria || 'casas_de_aposta',
        bookmaker_nome: (t as any).bookmakers_catalogo?.nome || null,
        bookmaker_logo: (t as any).bookmakers_catalogo?.logo_url || null,
        author_name: authorName,
      });

      // Fetch comments
      const { data: commentsData } = await supabase
        .from('community_comments')
        .select('id, user_id, conteudo, is_anonymous, created_at, edited_at')
        .eq('topic_id', id)
        .eq('status', 'ATIVO')
        .order('created_at', { ascending: true });

      const commentUserIds = [...new Set((commentsData || []).filter(c => !c.is_anonymous).map(c => c.user_id))];
      let profileMap: Record<string, string> = {};
      if (commentUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', commentUserIds);
        (profiles || []).forEach((p: any) => {
          profileMap[p.id] = p.full_name || p.email?.split('@')[0] || 'Usuário';
        });
      }

      setComments((commentsData || []).map(c => ({
        ...c,
        author_name: c.is_anonymous ? 'Anônimo' : (profileMap[c.user_id] || 'Usuário PRO'),
      })));
    } catch (error) {
      console.error('Error fetching topic:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitComment = async () => {
    if (!user?.id || !newComment.trim() || !id) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('community_comments').insert({
        user_id: user.id,
        topic_id: id,
        conteudo: newComment.trim(),
        is_anonymous: false,
      });
      if (error) {
        if (error.code === 'P0001' || error.message?.includes('termos não permitidos')) {
          toast({ title: 'Conteúdo bloqueado', description: 'Seu texto contém termos não permitidos.', variant: 'destructive' });
        } else {
          throw error;
        }
        return;
      }
      toast({ title: 'Comentário adicionado!' });
      setNewComment('');
      fetchTopic();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const EDIT_WINDOW_MS = 30 * 60 * 1000; // 30 minutos
  const canEdit = (authorId: string, createdAt?: string) => {
    if (canEditAny) return true;
    if (user?.id !== authorId) return false;
    if (!createdAt) return true;
    return Date.now() - new Date(createdAt).getTime() < EDIT_WINDOW_MS;
  };
  const isAuthor = (authorId: string) => user?.id === authorId;

  const handleAuthorDelete = async () => {
    if (!deleteTarget) return;
    const result = deleteTarget.type === 'topic'
      ? await authorDeleteTopic(deleteTarget.id)
      : await authorDeleteComment(deleteTarget.id);
    if (result.success) {
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
      if (deleteTarget.type === 'topic') {
        navigate('/comunidade');
      } else {
        fetchTopic();
      }
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 max-w-3xl">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="container mx-auto p-6 max-w-3xl">
        <Button variant="ghost" onClick={() => navigate('/comunidade')} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
        <div className="text-center py-12 text-muted-foreground">Tópico não encontrado</div>
      </div>
    );
  }

  const cat = getCategoryByValue(topic.categoria);
  const CatIcon = cat.icon;

  return (
    <div className="container mx-auto p-6 max-w-3xl">
      <Button variant="ghost" onClick={() => navigate('/comunidade')} className="mb-4">
        <ArrowLeft className="h-4 w-4 mr-2" /> Voltar para Comunidade
      </Button>

      {/* Topic Header */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Badge variant="outline" className="gap-1 text-xs">
              <CatIcon className={`h-3.5 w-3.5 ${cat.color}`} />
              {cat.label}
            </Badge>
            {topic.bookmaker_nome && (
              <Badge variant="secondary" className="gap-1 text-xs">
                <Building2 className="h-3 w-3" />
                {topic.bookmaker_nome}
              </Badge>
            )}
          </div>

          <h1 className="text-xl font-bold mb-2">{topic.titulo}</h1>

          <div className="flex items-center gap-3 text-sm text-muted-foreground mb-4 flex-wrap">
            <span className="flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              {topic.author_name}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {format(parseLocalDateTime(topic.created_at), "d MMM yyyy, HH:mm", { locale: ptBR })}
            </span>
            {topic.edited_at && (
              <Badge variant="outline" className="text-[10px]">
                Editado
              </Badge>
            )}
            <div className="ml-auto flex items-center gap-1">
              {canEdit(topic.user_id, topic.created_at) && (
                <Button
                  variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => {
                    setEditType('topic');
                    setEditId(topic.id);
                    setEditTitle(topic.titulo);
                    setEditContent(topic.conteudo);
                    setEditDialogOpen(true);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
              {isAuthor(topic.user_id) && (
                <Button
                  variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    setDeleteTarget({ type: 'topic', id: topic.id });
                    setDeleteConfirmOpen(true);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <ReportButton contentType="topic" contentId={topic.id} />
              <ModerationMenu type="topic" itemId={topic.id} itemTitle={topic.titulo} onDeleted={() => navigate('/comunidade')} />
            </div>
          </div>

          <div className="bg-muted/50 rounded-lg p-4">
            <p className="text-sm whitespace-pre-wrap">{topic.conteudo}</p>
          </div>
        </CardContent>
      </Card>

      {/* Comments */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          {comments.length} Comentário{comments.length !== 1 ? 's' : ''}
        </h2>

        {comments.map((comment) => (
          <Card key={comment.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  <span className="font-medium text-foreground">{comment.author_name}</span>
                  {comment.user_id === user?.id && <Badge variant="outline" className="text-[10px]">Você</Badge>}
                  <span>{formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: ptBR })}</span>
                  {comment.edited_at && <Badge variant="outline" className="text-[10px]">Editado</Badge>}
                </div>
                <div className="flex items-center gap-1">
                  {canEdit(comment.user_id, comment.created_at) && (
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => {
                        setEditType('comment');
                        setEditId(comment.id);
                        setEditTitle('');
                        setEditContent(comment.conteudo);
                        setEditDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {isAuthor(comment.user_id) && (
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        setDeleteTarget({ type: 'comment', id: comment.id });
                        setDeleteConfirmOpen(true);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <ReportButton contentType="comment" contentId={comment.id} size="sm" />
                  <ModerationMenu type="comment" itemId={comment.id} onDeleted={fetchTopic} size="sm" />
                </div>
              </div>
              <p className="text-sm">{comment.conteudo}</p>
            </CardContent>
          </Card>
        ))}

        {/* Add Comment */}
        {canWrite && (
          <div className="flex gap-2">
            <Input
              placeholder="Adicionar comentário..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmitComment();
                }
              }}
            />
            <Button size="icon" onClick={handleSubmitComment} disabled={!newComment.trim() || submitting}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Live Chat Section */}
      <div className="mt-6">
        {!showLiveChat ? (
          <Card className="border-dashed">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Radio className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Conversa ao vivo</p>
                  <OnlineIndicator count={onlineCount} isConnected={isConnected} />
                </div>
              </div>
              <Button onClick={() => setShowLiveChat(true)} size="sm">
                <MessageSquare className="h-4 w-4 mr-1" />
                Entrar na conversa
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border">
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-primary animate-pulse" />
                <span className="text-sm font-medium">Conversa ao vivo</span>
              </div>
              <div className="flex items-center gap-2">
                <OnlineIndicator count={onlineCount} isConnected={isConnected} />
                <Button variant="ghost" size="sm" onClick={() => setShowLiveChat(false)}>
                  Minimizar
                </Button>
              </div>
            </div>
            <div className="h-[400px]">
              <CommunityChatFull
                isEmbedded
                initialContextType="topic"
                initialContextId={id}
                topicTitle={topic.titulo}
              />
            </div>
          </Card>
        )}
      </div>


      <CommunityEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        type={editType}
        id={editId}
        initialTitle={editTitle}
        initialContent={editContent}
        onSuccess={fetchTopic}
      />

      {/* Author Delete Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir {deleteTarget?.type === 'topic' ? 'tópico' : 'comentário'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === 'topic'
                ? 'Seu tópico e todos os comentários serão removidos permanentemente.'
                : 'Seu comentário será removido permanentemente.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={moderationLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAuthorDelete}
              disabled={moderationLoading}
              className="bg-destructive hover:bg-destructive/90"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
