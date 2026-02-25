import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCommunityAccess } from '@/hooks/useCommunityAccess';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

interface ModerationResult {
  success: boolean;
  error?: string;
  deletedCount?: number;
}

export function useCommunityModeration() {
  const { user, isSystemOwner } = useAuth();
  const { isOwner, isAdmin } = useCommunityAccess();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  const canModerate = isSystemOwner || isOwner || isAdmin;

  const deleteTopic = useCallback(async (
    topicId: string,
    reason: string = 'Removido pelo moderador'
  ): Promise<ModerationResult> => {
    if (!canModerate) {
      return { success: false, error: 'Sem permissão para moderar' };
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('moderate_delete_topic', {
        p_topic_id: topicId,
        p_reason: reason,
      });
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['community-topics'] });
      queryClient.invalidateQueries({ queryKey: ['community-bookmaker-stats'] });

      toast({ title: 'Tópico removido com sucesso' });
      return { success: true };
    } catch (error: any) {
      console.error('Error deleting topic:', error);
      toast({ title: 'Erro ao remover tópico', description: error.message, variant: 'destructive' });
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  }, [canModerate, toast, queryClient]);

  const deleteComment = useCallback(async (
    commentId: string,
    reason: string = 'Removido pelo moderador'
  ): Promise<ModerationResult> => {
    if (!canModerate) {
      return { success: false, error: 'Sem permissão para moderar' };
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('moderate_delete_comment', {
        p_comment_id: commentId,
        p_reason: reason,
      });
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['community-comments'] });
      toast({ title: 'Comentário removido com sucesso' });
      return { success: true };
    } catch (error: any) {
      console.error('Error deleting comment:', error);
      toast({ title: 'Erro ao remover comentário', description: error.message, variant: 'destructive' });
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  }, [canModerate, toast, queryClient]);

  // Author delete (own content)
  const authorDeleteTopic = useCallback(async (topicId: string): Promise<ModerationResult> => {
    if (!user?.id) return { success: false, error: 'Não autenticado' };

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('author_delete_topic', {
        p_topic_id: topicId,
      });
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['community-topics'] });
      toast({ title: 'Seu tópico foi removido' });
      return { success: true };
    } catch (error: any) {
      console.error('Error author-deleting topic:', error);
      toast({ title: 'Erro ao remover tópico', description: error.message, variant: 'destructive' });
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  }, [user?.id, toast, queryClient]);

  const authorDeleteComment = useCallback(async (commentId: string): Promise<ModerationResult> => {
    if (!user?.id) return { success: false, error: 'Não autenticado' };

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('author_delete_comment', {
        p_comment_id: commentId,
      });
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['community-comments'] });
      toast({ title: 'Seu comentário foi removido' });
      return { success: true };
    } catch (error: any) {
      console.error('Error author-deleting comment:', error);
      toast({ title: 'Erro ao remover comentário', description: error.message, variant: 'destructive' });
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  }, [user?.id, toast, queryClient]);

  const deleteChatMessage = useCallback(async (
    messageId: string,
    reason: string = 'Removida pelo moderador'
  ): Promise<ModerationResult> => {
    if (!canModerate) {
      return { success: false, error: 'Sem permissão para moderar' };
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('moderate_delete_chat_message', {
        _message_id: messageId,
        _reason: reason,
      });
      if (error) throw error;

      toast({ title: 'Mensagem removida' });
      return { success: true };
    } catch (error: any) {
      console.error('Error deleting chat message:', error);
      toast({ title: 'Erro ao remover mensagem', description: error.message, variant: 'destructive' });
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  }, [canModerate, toast]);

  const clearChat = useCallback(async (
    workspaceId: string,
    contextType: 'general' | 'topic' = 'general',
    contextId: string | null = null
  ): Promise<ModerationResult> => {
    if (!canModerate) {
      return { success: false, error: 'Sem permissão para moderar' };
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('moderate_clear_chat', {
        _workspace_id: workspaceId,
        _context_type: contextType,
        _context_id: contextId,
      });
      if (error) throw error;

      const result = data as { success: boolean; deleted_count: number };
      toast({ 
        title: 'Chat limpo com sucesso',
        description: `${result.deleted_count} mensagens removidas`,
      });
      return { success: true, deletedCount: result.deleted_count };
    } catch (error: any) {
      console.error('Error clearing chat:', error);
      toast({ title: 'Erro ao limpar chat', description: error.message, variant: 'destructive' });
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  }, [canModerate, toast]);

  const getChatMessageCount = useCallback(async (
    workspaceId: string,
    contextType: 'general' | 'topic' = 'general',
    contextId: string | null = null
  ): Promise<number> => {
    try {
      let query = supabase
        .from('community_chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('context_type', contextType)
        .is('deleted_at', null);

      if (contextType === 'general') {
        query = query.is('context_id', null);
      } else if (contextId) {
        query = query.eq('context_id', contextId);
      }

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.error('Error getting chat message count:', error);
      return 0;
    }
  }, []);

  return {
    canModerate,
    loading,
    deleteTopic,
    deleteComment,
    authorDeleteTopic,
    authorDeleteComment,
    deleteChatMessage,
    clearChat,
    getChatMessageCount,
  };
}
