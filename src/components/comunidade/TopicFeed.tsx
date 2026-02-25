import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { MessageSquare, User, Clock, TrendingUp, Building2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getCategoryByValue, type CommunityCategory } from '@/lib/communityCategories';

interface FeedTopic {
  id: string;
  titulo: string;
  conteudo: string;
  categoria: string;
  is_anonymous: boolean;
  created_at: string;
  user_id: string;
  bookmaker_catalogo_id: string | null;
  bookmaker_nome?: string | null;
  bookmaker_logo?: string | null;
  comment_count: number;
  last_activity: string;
  author_name?: string | null;
}

interface TopicFeedProps {
  categoryFilter: CommunityCategory | null;
  bookmakerFilter?: string | null;
  searchTerm?: string;
  sortBy: 'recent' | 'trending';
  refreshKey?: number;
}

export function TopicFeed({ categoryFilter, bookmakerFilter, searchTerm, sortBy, refreshKey = 0 }: TopicFeedProps) {
  const navigate = useNavigate();
  const [topics, setTopics] = useState<FeedTopic[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTopics = useCallback(async () => {
    try {
      // Build query
      let query = supabase
        .from('community_topics')
        .select(`
          id, titulo, conteudo, categoria, is_anonymous, created_at, user_id,
          bookmaker_catalogo_id,
          bookmakers_catalogo(nome, logo_url, visibility)
        `)
        .eq('status', 'ATIVO');

      // Category filter
      if (categoryFilter) {
        query = query.eq('categoria', categoryFilter);
      }

      // Bookmaker filter
      if (bookmakerFilter) {
        query = query.eq('bookmaker_catalogo_id', bookmakerFilter);
      }

      // Search
      if (searchTerm?.trim()) {
        query = query.ilike('titulo', `%${searchTerm.trim()}%`);
      }

      query = query.order('created_at', { ascending: false }).limit(50);

      const { data: topicsData, error: topicsError } = await query;
      if (topicsError) throw topicsError;

      // Filter out topics linked to restricted bookmakers
      const filtered = (topicsData || []).filter((t: any) => {
        if (!t.bookmaker_catalogo_id) return true; // No bookmaker = always show
        return t.bookmakers_catalogo?.visibility === 'GLOBAL_REGULATED';
      });

      // Get comment counts
      const topicIds = filtered.map((t: any) => t.id);
      let commentCounts: Record<string, number> = {};
      let lastComments: Record<string, string> = {};

      if (topicIds.length > 0) {
        const { data: comments } = await supabase
          .from('community_comments')
          .select('topic_id, created_at')
          .in('topic_id', topicIds)
          .eq('status', 'ATIVO');

        (comments || []).forEach((c: any) => {
          commentCounts[c.topic_id] = (commentCounts[c.topic_id] || 0) + 1;
          if (!lastComments[c.topic_id] || c.created_at > lastComments[c.topic_id]) {
            lastComments[c.topic_id] = c.created_at;
          }
        });
      }

      // Get author profiles for non-anonymous
      const authorIds = [...new Set(filtered.filter((t: any) => !t.is_anonymous).map((t: any) => t.user_id))];
      let profileMap: Record<string, string> = {};
      if (authorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', authorIds);
        (profiles || []).forEach((p: any) => {
          profileMap[p.id] = p.full_name || p.email?.split('@')[0] || 'Usuário';
        });
      }

      const feedTopics: FeedTopic[] = filtered.map((t: any) => ({
        id: t.id,
        titulo: t.titulo,
        conteudo: t.conteudo,
        categoria: t.categoria || 'casas_de_aposta',
        is_anonymous: t.is_anonymous,
        created_at: t.created_at,
        user_id: t.user_id,
        bookmaker_catalogo_id: t.bookmaker_catalogo_id,
        bookmaker_nome: t.bookmakers_catalogo?.nome || null,
        bookmaker_logo: t.bookmakers_catalogo?.logo_url || null,
        comment_count: commentCounts[t.id] || 0,
        last_activity: lastComments[t.id] || t.created_at,
        author_name: t.is_anonymous ? 'Anônimo' : (profileMap[t.user_id] || 'Usuário PRO'),
      }));

      // Sort
      if (sortBy === 'trending') {
        feedTopics.sort((a, b) => {
          // More comments + recent activity = trending
          const scoreA = a.comment_count * 10 + (new Date(a.last_activity).getTime() / 1e10);
          const scoreB = b.comment_count * 10 + (new Date(b.last_activity).getTime() / 1e10);
          return scoreB - scoreA;
        });
      } else {
        feedTopics.sort((a, b) => new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime());
      }

      setTopics(feedTopics);
    } catch (error) {
      console.error('Error fetching topics feed:', error);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, bookmakerFilter, searchTerm, sortBy]);

  useEffect(() => {
    setLoading(true);
    fetchTopics();
  }, [fetchTopics, refreshKey]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  if (topics.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p>Nenhum tópico encontrado</p>
        <p className="text-sm mt-1">Seja o primeiro a iniciar uma discussão!</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {topics.map((topic) => {
        const cat = getCategoryByValue(topic.categoria);
        const CatIcon = cat.icon;

        return (
          <Card
            key={topic.id}
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => navigate(`/comunidade/topico/${topic.id}`)}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                {/* Category icon */}
                <div className="mt-0.5">
                  <CatIcon className={`h-5 w-5 ${cat.color}`} />
                </div>

                <div className="flex-1 min-w-0">
                  {/* Title */}
                  <h3 className="font-semibold text-sm leading-tight mb-1 line-clamp-2">
                    {topic.titulo}
                  </h3>

                  {/* Preview */}
                  <p className="text-xs text-muted-foreground line-clamp-1 mb-2">
                    {topic.conteudo}
                  </p>

                  {/* Meta row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">
                      {cat.label}
                    </Badge>

                    {topic.bookmaker_nome && (
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        <Building2 className="h-3 w-3" />
                        {topic.bookmaker_nome}
                      </Badge>
                    )}

                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {topic.author_name}
                    </span>

                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(topic.last_activity), { addSuffix: true, locale: ptBR })}
                    </span>
                  </div>
                </div>

                {/* Comment count */}
                <div className="flex flex-col items-center shrink-0 text-muted-foreground">
                  <MessageSquare className="h-4 w-4" />
                  <span className="text-xs font-medium">{topic.comment_count}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
