import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { subDays } from 'date-fns';

export interface RankedBookmaker {
  bookmaker_catalogo_id: string;
  nome: string;
  logo_url: string | null;
  regulamentacao_status: string;
  total_topicos: number;
  total_comentarios: number;
  topicos_recentes: number;
  comentarios_recentes: number;
  ultima_atividade: string | null;
  engagement_score: number;
  nota_media_geral: number | null;
  total_avaliacoes: number;
}

interface UseCommunityRankingOptions {
  limit?: number;
  periodDays?: number;
  recentActivityLimit?: number; // Items with recent activity outside top N
}

export function useCommunityRanking(options: UseCommunityRankingOptions = {}) {
  const { limit, periodDays = 30, recentActivityLimit = 6 } = options;
  const [rankedItems, setRankedItems] = useState<RankedBookmaker[]>([]);
  const [recentActivityItems, setRecentActivityItems] = useState<RankedBookmaker[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRankingData = useCallback(async () => {
    try {
      const periodAgo = subDays(new Date(), periodDays).toISOString();

      // Fetch topics with counts and bookmaker info (only GLOBAL_REGULATED)
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

      // Fetch bookmaker stats for ratings
      const { data: statsData, error: statsError } = await supabase
        .from('v_community_bookmaker_stats')
        .select('bookmaker_catalogo_id, nota_media_geral, total_avaliacoes, regulamentacao_status');

      if (statsError) throw statsError;

      // Create a map for stats lookup
      const statsMap = new Map<string, { nota_media_geral: number | null; total_avaliacoes: number; regulamentacao_status: string }>();
      (statsData || []).forEach((stat: any) => {
        statsMap.set(stat.bookmaker_catalogo_id, {
          nota_media_geral: stat.nota_media_geral,
          total_avaliacoes: stat.total_avaliacoes || 0,
          regulamentacao_status: stat.regulamentacao_status || 'NAO_REGULAMENTADA'
        });
      });

      // Aggregate data by bookmaker
      const bookmakerMap = new Map<string, RankedBookmaker>();

      // Process topics
      (topicsData || []).forEach((topic: any) => {
        const id = topic.bookmaker_catalogo_id;
        const isRecent = new Date(topic.created_at) >= new Date(periodAgo);
        const stats = statsMap.get(id);
        
        if (!bookmakerMap.has(id)) {
          bookmakerMap.set(id, {
            bookmaker_catalogo_id: id,
            nome: topic.bookmakers_catalogo?.nome || 'Desconhecido',
            logo_url: topic.bookmakers_catalogo?.logo_url || null,
            regulamentacao_status: stats?.regulamentacao_status || 'NAO_REGULAMENTADA',
            total_topicos: 0,
            total_comentarios: 0,
            topicos_recentes: 0,
            comentarios_recentes: 0,
            ultima_atividade: null,
            engagement_score: 0,
            nota_media_geral: stats?.nota_media_geral || null,
            total_avaliacoes: stats?.total_avaliacoes || 0,
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
        
        const isRecent = new Date(comment.created_at) >= new Date(periodAgo);
        
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
      let rankedItems = Array.from(bookmakerMap.values())
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

      // Apply limit if specified and separate recent activity items
      if (limit) {
        const topItems = rankedItems.slice(0, limit);
        const topIds = new Set(topItems.map(item => item.bookmaker_catalogo_id));
        
        // Get items with recent activity that are NOT in top N
        // Sort by ultima_atividade (most recent first)
        const recentOutsideTop = rankedItems
          .filter(item => !topIds.has(item.bookmaker_catalogo_id) && item.ultima_atividade)
          .sort((a, b) => {
            if (a.ultima_atividade && b.ultima_atividade) {
              return new Date(b.ultima_atividade).getTime() - new Date(a.ultima_atividade).getTime();
            }
            return 0;
          })
          .slice(0, recentActivityLimit);
        
        setRankedItems(topItems);
        setRecentActivityItems(recentOutsideTop);
      } else {
        setRankedItems(rankedItems);
        setRecentActivityItems([]);
      }
    } catch (error) {
      console.error('Error fetching community ranking:', error);
    } finally {
      setLoading(false);
    }
  }, [limit, periodDays, recentActivityLimit]);

  useEffect(() => {
    fetchRankingData();
  }, [fetchRankingData]);

  const refetch = useCallback(() => {
    setLoading(true);
    fetchRankingData();
  }, [fetchRankingData]);

  return { rankedItems, recentActivityItems, loading, refetch };
}