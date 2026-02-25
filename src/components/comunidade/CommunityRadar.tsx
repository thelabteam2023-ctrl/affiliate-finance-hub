import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, MessageSquare, Clock, Star, ChevronRight } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CommunityRadarDrawer } from './CommunityRadarDrawer';

interface RadarItem {
  bookmaker_catalogo_id: string;
  nome: string;
  logo_url: string | null;
  total_topicos: number;
  total_comentarios: number;
  topicos_recentes: number;
  comentarios_recentes: number;
  ultima_atividade: string | null;
  engagement_score: number;
}

const RADAR_LIMIT = 10;

export function CommunityRadar() {
  const navigate = useNavigate();
  const [allItems, setAllItems] = useState<RadarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    fetchRadarData();
  }, []);

  const fetchRadarData = async () => {
    try {
      const thirtyDaysAgo = subDays(new Date(), 30).toISOString();

      // Fetch topics with counts (only GLOBAL_REGULATED)
      const { data: topicsData, error: topicsError } = await supabase
        .from('community_topics')
        .select(`
          bookmaker_catalogo_id,
          created_at,
          bookmakers_catalogo!inner(nome, logo_url, visibility)
        `)
        .eq('status', 'ATIVO')
        .eq('bookmakers_catalogo.visibility', 'GLOBAL_REGULATED');

      if (topicsError) throw topicsError;

      // Fetch comments with counts
      const { data: commentsData, error: commentsError } = await supabase
        .from('community_comments')
        .select(`
          topic_id,
          created_at,
          community_topics!inner(bookmaker_catalogo_id)
        `)
        .eq('status', 'ATIVO');

      if (commentsError) throw commentsError;

      // Aggregate data by bookmaker
      const bookmakerMap = new Map<string, RadarItem>();

      // Process topics
      (topicsData || []).forEach((topic: any) => {
        const id = topic.bookmaker_catalogo_id;
        const isRecent = new Date(topic.created_at) >= new Date(thirtyDaysAgo);
        
        if (!bookmakerMap.has(id)) {
          bookmakerMap.set(id, {
            bookmaker_catalogo_id: id,
            nome: topic.bookmakers_catalogo?.nome || 'Desconhecido',
            logo_url: topic.bookmakers_catalogo?.logo_url || null,
            total_topicos: 0,
            total_comentarios: 0,
            topicos_recentes: 0,
            comentarios_recentes: 0,
            ultima_atividade: null,
            engagement_score: 0,
          });
        }
        
        const item = bookmakerMap.get(id)!;
        item.total_topicos++;
        if (isRecent) item.topicos_recentes++;
        
        if (!item.ultima_atividade || new Date(topic.created_at) > new Date(item.ultima_atividade)) {
          item.ultima_atividade = topic.created_at;
        }
      });

      // Process comments
      (commentsData || []).forEach((comment: any) => {
        const id = comment.community_topics?.bookmaker_catalogo_id;
        if (!id) return;
        
        const isRecent = new Date(comment.created_at) >= new Date(thirtyDaysAgo);
        
        const item = bookmakerMap.get(id);
        if (item) {
          item.total_comentarios++;
          if (isRecent) item.comentarios_recentes++;
          
          if (!item.ultima_atividade || new Date(comment.created_at) > new Date(item.ultima_atividade)) {
            item.ultima_atividade = comment.created_at;
          }
        }
      });

      // Calculate engagement score
      // Priority 1: topicos_recentes, Priority 2: comentarios_recentes, Tiebreaker: ultima_atividade
      bookmakerMap.forEach((item) => {
        item.engagement_score = 
          (item.topicos_recentes * 1000) + // Topics have highest priority
          (item.comentarios_recentes * 10) + // Comments secondary
          (item.ultima_atividade ? 1 : 0); // Tiebreaker
      });

      // Convert to array, filter out zero engagement, sort by score then by ultima_atividade
      const radarItems = Array.from(bookmakerMap.values())
        .filter(item => item.engagement_score > 0)
        .sort((a, b) => {
          // First by engagement score
          if (b.engagement_score !== a.engagement_score) {
            return b.engagement_score - a.engagement_score;
          }
          // Tiebreaker: most recent activity
          if (a.ultima_atividade && b.ultima_atividade) {
            return new Date(b.ultima_atividade).getTime() - new Date(a.ultima_atividade).getTime();
          }
          return 0;
        });

      setAllItems(radarItems);
    } catch (error) {
      console.error('Error fetching radar data:', error);
    } finally {
      setLoading(false);
    }
  };

  const displayedItems = allItems.slice(0, RADAR_LIMIT);
  const hasMore = allItems.length > RADAR_LIMIT;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" />
            Radar da Comunidade
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (allItems.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" />
            Radar da Comunidade
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhuma atividade registrada ainda
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" />
            Radar da Comunidade
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Top {RADAR_LIMIT} casas mais discutidas (30 dias)
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {displayedItems.map((item, index) => (
              <div
                key={item.bookmaker_catalogo_id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => navigate(`/comunidade?casa=${item.bookmaker_catalogo_id}`)}
              >
                {/* Rank */}
                <div className="w-6 text-center">
                  {index < 3 ? (
                    <Badge 
                      variant="outline" 
                      className={`text-[10px] ${
                        index === 0 ? 'border-yellow-500 text-yellow-500' :
                        index === 1 ? 'border-gray-400 text-gray-400' :
                        'border-amber-600 text-amber-600'
                      }`}
                    >
                      {index + 1}º
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">{index + 1}º</span>
                  )}
                </div>

                {/* Logo */}
                <div className="h-8 w-8 rounded bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                  {item.logo_url ? (
                    <img src={item.logo_url} alt={item.nome} className="h-6 w-6 object-contain" />
                  ) : (
                    <span className="text-xs font-bold text-muted-foreground">
                      {item.nome.charAt(0)}
                    </span>
                  )}
                </div>

                {/* Name & Stats */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.nome}</p>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Star className="h-3 w-3" />
                      {item.total_topicos}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {item.total_comentarios}
                    </span>
                    {item.ultima_atividade && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(new Date(item.ultima_atividade), "d MMM", { locale: ptBR })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Recent Badge */}
                {item.topicos_recentes + item.comentarios_recentes > 0 && (
                  <Badge variant="secondary" className="text-[10px]">
                    +{item.topicos_recentes + item.comentarios_recentes}
                  </Badge>
                )}
              </div>
            ))}
          </div>

          {/* Ver mais button */}
          {hasMore && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-3 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setDrawerOpen(true)}
            >
              Ver mais ({allItems.length - RADAR_LIMIT} casas)
              <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Drawer for full list */}
      <CommunityRadarDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        items={allItems}
        loading={loading}
      />
    </>
  );
}
