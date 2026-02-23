import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCommunityAccess } from '@/hooks/useCommunityAccess';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare, User, Flag, Plus, Send, ChevronDown, ChevronUp, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { parseLocalDateTime } from '@/utils/dateUtils';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { CommunityEditDialog } from './CommunityEditDialog';
import { ModerationMenu } from './ModerationMenu';

interface Topic {
  id: string;
  user_id: string;
  titulo: string;
  conteudo: string;
  is_anonymous: boolean;
  status: string;
  created_at: string;
  edited_at: string | null;
  profiles?: { full_name: string; email: string } | null;
  comments?: Comment[];
}

interface Comment {
  id: string;
  user_id: string;
  conteudo: string;
  is_anonymous: boolean;
  status: string;
  created_at: string;
  edited_at: string | null;
  profiles?: { full_name: string; email: string } | null;
}

interface CommunityTopicsListProps {
  bookmakerId: string;
  onCreateTopic?: () => void;
  refreshKey?: number;
}

export function CommunityTopicsList({ bookmakerId, onCreateTopic, refreshKey = 0 }: CommunityTopicsListProps) {
  const { user } = useAuth();
  const { hasFullAccess, canWrite, canEditAny } = useCommunityAccess();
  const { toast } = useToast();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [newComment, setNewComment] = useState<Record<string, string>>({});
  const [submittingComment, setSubmittingComment] = useState<string | null>(null);
  
  // Report state
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportType, setReportType] = useState<'topic' | 'comment'>('topic');
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');

  // Edit state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editType, setEditType] = useState<'topic' | 'comment'>('topic');
  const [editId, setEditId] = useState<string>('');
  const [editTitle, setEditTitle] = useState<string>('');
  const [editContent, setEditContent] = useState<string>('');

  useEffect(() => {
    fetchTopics();
  }, [bookmakerId, refreshKey]);

  const fetchTopics = async () => {
    try {
      // Fetch topics
      const { data: topicsData, error: topicsError } = await supabase
        .from('community_topics')
        .select('*')
        .eq('bookmaker_catalogo_id', bookmakerId)
        .eq('status', 'ATIVO')
        .order('created_at', { ascending: false });

      if (topicsError) throw topicsError;

      // Fetch comments for all topics
      const topicIds = (topicsData || []).map(t => t.id);
      
      if (topicIds.length > 0) {
        const { data: commentsData, error: commentsError } = await supabase
          .from('community_comments')
          .select('*')
          .in('topic_id', topicIds)
          .eq('status', 'ATIVO')
          .order('created_at', { ascending: true });

        if (commentsError) throw commentsError;

        // Group comments by topic
        const commentsByTopic = (commentsData || []).reduce((acc, comment) => {
          if (!acc[comment.topic_id]) acc[comment.topic_id] = [];
          acc[comment.topic_id].push({ ...comment, profiles: null });
          return acc;
        }, {} as Record<string, Comment[]>);

        // Attach comments to topics
        const topicsWithComments = (topicsData || []).map(topic => ({
          ...topic,
          profiles: null,
          comments: commentsByTopic[topic.id] || [],
        }));

        setTopics(topicsWithComments);
      } else {
        setTopics([]);
      }
    } catch (error) {
      console.error('Error fetching topics:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleTopic = (topicId: string) => {
    setExpandedTopics(prev => {
      const newSet = new Set(prev);
      if (newSet.has(topicId)) {
        newSet.delete(topicId);
      } else {
        newSet.add(topicId);
      }
      return newSet;
    });
  };

  const handleSubmitComment = async (topicId: string) => {
    if (!user?.id || !newComment[topicId]?.trim()) return;

    setSubmittingComment(topicId);
    try {
      const { error } = await supabase.from('community_comments').insert({
        user_id: user.id,
        topic_id: topicId,
        conteudo: newComment[topicId].trim(),
        is_anonymous: false,
      });

      if (error) throw error;

      toast({ title: 'Comentário adicionado!' });
      setNewComment(prev => ({ ...prev, [topicId]: '' }));
      fetchTopics();
    } catch (error: any) {
      console.error('Error adding comment:', error);
      toast({ title: 'Erro ao adicionar comentário', variant: 'destructive' });
    } finally {
      setSubmittingComment(null);
    }
  };

  const handleReport = async () => {
    if (!user?.id || !reportingId || !reportReason.trim()) return;

    try {
      const reportData: any = {
        reporter_user_id: user.id,
        reason: reportReason.trim(),
      };

      if (reportType === 'topic') {
        reportData.topic_id = reportingId;
      } else {
        reportData.comment_id = reportingId;
      }

      const { error } = await supabase.from('community_reports').insert(reportData);
      if (error) throw error;

      toast({ title: 'Denúncia enviada', description: 'Obrigado por reportar este conteúdo.' });
      setReportDialogOpen(false);
      setReportingId(null);
      setReportReason('');
    } catch (error) {
      console.error('Error reporting:', error);
      toast({ title: 'Erro ao enviar denúncia', variant: 'destructive' });
    }
  };

  const handleOpenEdit = (type: 'topic' | 'comment', id: string, title: string, content: string) => {
    setEditType(type);
    setEditId(id);
    setEditTitle(title);
    setEditContent(content);
    setEditDialogOpen(true);
  };

  const canEdit = (authorId: string) => {
    // User can edit if they are the author OR if they are admin
    return user?.id === authorId || canEditAny;
  };

  const getAuthorName = (item: { is_anonymous: boolean; profiles?: { full_name: string; email: string } | null }) => {
    if (item.is_anonymous) return 'Usuário Anônimo';
    if (item.profiles?.full_name) return item.profiles.full_name;
    if (item.profiles?.email) return item.profiles.email.split('@')[0];
    return 'Usuário PRO';
  };

  const renderEditedBadge = (editedAt: string | null) => {
    if (!editedAt) return null;
    return (
      <Badge variant="outline" className="text-[10px] border-muted-foreground/30 text-muted-foreground">
        Editado {format(new Date(editedAt), "d MMM, HH:mm", { locale: ptBR })}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  if (topics.length === 0) {
    return (
      <div className="text-center py-12">
        <MessageSquare className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
        <p className="text-muted-foreground">Nenhum tópico de discussão ainda</p>
        {canWrite && onCreateTopic && (
          <Button variant="outline" size="sm" className="mt-3" onClick={onCreateTopic}>
            <Plus className="h-4 w-4 mr-2" />
            Criar primeiro tópico
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Create Topic Button - Only for users who can write */}
      {canWrite && onCreateTopic && (
        <div className="mb-4">
          <Button onClick={onCreateTopic}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Tópico
          </Button>
        </div>
      )}

      <div className="space-y-4">
        {topics.map((topic) => {
          const isExpanded = expandedTopics.has(topic.id);
          const isOwnTopic = topic.user_id === user?.id;
          const commentCount = topic.comments?.length || 0;

          return (
            <Card key={topic.id}>
              <Collapsible open={isExpanded} onOpenChange={() => toggleTopic(topic.id)}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CollapsibleTrigger className="flex items-start gap-2 text-left w-full group">
                        <div className="flex-1">
                          <CardTitle className="text-base group-hover:text-primary transition-colors">
                            {topic.titulo}
                          </CardTitle>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                            <User className="h-3 w-3" />
                            <span>{getAuthorName(topic)}</span>
                            <span>•</span>
                            <span>{format(parseLocalDateTime(topic.created_at), "d MMM yyyy", { locale: ptBR })}</span>
                            {commentCount > 0 && (
                              <>
                                <span>•</span>
                                <span>{commentCount} comentário(s)</span>
                              </>
                            )}
                            {renderEditedBadge(topic.edited_at)}
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-5 w-5 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
                        )}
                      </CollapsibleTrigger>
                    </div>
                    
                    <div className="flex items-center gap-1 ml-2">
                      {isOwnTopic && (
                        <Badge variant="outline" className="text-[10px]">Você</Badge>
                      )}
                      {canEdit(topic.user_id) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEdit('topic', topic.id, topic.titulo, topic.conteudo);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {!isOwnTopic && canWrite && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setReportType('topic');
                            setReportingId(topic.id);
                            setReportDialogOpen(true);
                          }}
                        >
                          <Flag className="h-4 w-4" />
                        </Button>
                      )}
                      {/* Moderation Menu */}
                      <ModerationMenu
                        type="topic"
                        itemId={topic.id}
                        itemTitle={topic.titulo}
                        onDeleted={fetchTopics}
                      />
                    </div>
                  </div>
                </CardHeader>

                <CollapsibleContent>
                  <CardContent className="pt-2">
                    {/* Topic Content */}
                    <div className="bg-muted/50 rounded-lg p-3 mb-4">
                      <p className="text-sm whitespace-pre-wrap">{topic.conteudo}</p>
                    </div>

                    {/* Comments */}
                    {topic.comments && topic.comments.length > 0 && (
                      <div className="space-y-3 mb-4">
                        <p className="text-sm font-medium">Comentários ({topic.comments.length})</p>
                        {topic.comments.map((comment) => {
                          const isOwnComment = comment.user_id === user?.id;
                          return (
                            <div key={comment.id} className="flex gap-3 pl-4 border-l-2 border-border">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 text-xs flex-wrap">
                                  <span className="font-medium">{getAuthorName(comment)}</span>
                                  {isOwnComment && (
                                    <Badge variant="outline" className="text-[10px]">Você</Badge>
                                  )}
                                  <span className="text-muted-foreground">
                                    {format(parseLocalDateTime(comment.created_at), "d MMM yyyy, HH:mm", { locale: ptBR })}
                                  </span>
                                  {renderEditedBadge(comment.edited_at)}
                                </div>
                                <p className="text-sm mt-1">{comment.conteudo}</p>
                              </div>
                              <div className="flex items-start gap-1 shrink-0">
                                {canEdit(comment.user_id) && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground hover:text-primary"
                                    onClick={() => handleOpenEdit('comment', comment.id, '', comment.conteudo)}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                )}
                                {!isOwnComment && canWrite && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                    onClick={() => {
                                      setReportType('comment');
                                      setReportingId(comment.id);
                                      setReportDialogOpen(true);
                                    }}
                                  >
                                    <Flag className="h-3 w-3" />
                                  </Button>
                                )}
                                {/* Moderation Menu for Comments */}
                                <ModerationMenu
                                  type="comment"
                                  itemId={comment.id}
                                  onDeleted={fetchTopics}
                                  size="sm"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Add Comment - Only for users who can write */}
                    {canWrite && (
                      <div className="flex gap-2">
                        <Input
                          placeholder="Adicionar comentário..."
                          value={newComment[topic.id] || ''}
                          onChange={(e) => setNewComment(prev => ({ ...prev, [topic.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSubmitComment(topic.id);
                            }
                          }}
                        />
                        <Button
                          size="icon"
                          onClick={() => handleSubmitComment(topic.id)}
                          disabled={!newComment[topic.id]?.trim() || submittingComment === topic.id}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}
      </div>

      {/* Report Dialog */}
      <AlertDialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Denunciar {reportType === 'topic' ? 'Tópico' : 'Comentário'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Por que você está denunciando este conteúdo?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            placeholder="Descreva o motivo da denúncia..."
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setReportReason('')}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleReport} disabled={!reportReason.trim()}>
              Enviar Denúncia
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Dialog */}
      <CommunityEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        type={editType}
        id={editId}
        initialTitle={editTitle}
        initialContent={editContent}
        onSuccess={fetchTopics}
      />
    </>
  );
}
