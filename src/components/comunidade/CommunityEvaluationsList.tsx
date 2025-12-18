import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCommunityAccess } from '@/hooks/useCommunityAccess';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Star, User, Flag } from 'lucide-react';
import { format } from 'date-fns';
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
import { Textarea } from '@/components/ui/textarea';

interface Evaluation {
  id: string;
  user_id: string;
  velocidade_pagamento: number;
  facilidade_verificacao: number;
  estabilidade_conta: number;
  qualidade_suporte: number;
  confiabilidade_geral: number;
  nota_media: number;
  comentario: string | null;
  is_anonymous: boolean;
  created_at: string;
  profiles?: { full_name: string; email: string } | null;
}

interface CommunityEvaluationsListProps {
  bookmakerId: string;
  onRefresh?: () => void;
}


export function CommunityEvaluationsList({ bookmakerId, onRefresh }: CommunityEvaluationsListProps) {
  const { user } = useAuth();
  const { hasFullAccess } = useCommunityAccess();
  const { toast } = useToast();
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportingEvaluationId, setReportingEvaluationId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');

  useEffect(() => {
    fetchEvaluations();
  }, [bookmakerId]);

  const fetchEvaluations = async () => {
    try {
      const { data, error } = await supabase
        .from('community_evaluations')
        .select('*')
        .eq('bookmaker_catalogo_id', bookmakerId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEvaluations((data || []).map(e => ({ ...e, profiles: null })));
    } catch (error) {
      console.error('Error fetching evaluations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReport = async () => {
    if (!user?.id || !reportingEvaluationId || !reportReason.trim()) return;

    try {
      const { error } = await supabase.from('community_reports').insert({
        reporter_user_id: user.id,
        evaluation_id: reportingEvaluationId,
        reason: reportReason.trim(),
      });

      if (error) throw error;

      toast({ title: 'Denúncia enviada', description: 'Obrigado por reportar este conteúdo.' });
      setReportDialogOpen(false);
      setReportingEvaluationId(null);
      setReportReason('');
    } catch (error) {
      console.error('Error reporting:', error);
      toast({ title: 'Erro ao enviar denúncia', variant: 'destructive' });
    }
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-3.5 w-3.5 ${
              star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/30'
            }`}
          />
        ))}
      </div>
    );
  };

  const getAuthorName = (evaluation: Evaluation) => {
    if (evaluation.is_anonymous) return 'Usuário Anônimo';
    if (evaluation.profiles?.full_name) return evaluation.profiles.full_name;
    if (evaluation.profiles?.email) return evaluation.profiles.email.split('@')[0];
    return 'Usuário PRO';
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    );
  }

  if (evaluations.length === 0) {
    return (
      <div className="text-center py-12">
        <Star className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
        <p className="text-muted-foreground">Nenhuma avaliação ainda</p>
        <p className="text-sm text-muted-foreground">Seja o primeiro a avaliar esta casa!</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {evaluations.map((evaluation) => {
          const isOwnEvaluation = evaluation.user_id === user?.id;

          return (
            <Card key={evaluation.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      <User className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{getAuthorName(evaluation)}</span>
                        {isOwnEvaluation && (
                          <Badge variant="outline" className="text-[10px]">Você</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(evaluation.created_at), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <div className="flex items-center gap-1">
                        {renderStars(evaluation.nota_media)}
                        <span className="text-sm font-medium ml-1">{evaluation.nota_media.toFixed(1)}</span>
                      </div>
                    </div>
                    {!isOwnEvaluation && hasFullAccess && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          setReportingEvaluationId(evaluation.id);
                          setReportDialogOpen(true);
                        }}
                      >
                        <Flag className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Ratings Grid */}
                <div className="grid grid-cols-5 gap-2 mt-4 text-xs">
                  <div className="text-center">
                    <p className="text-muted-foreground">Pagamento</p>
                    <p className="font-medium">{evaluation.velocidade_pagamento}/5</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground">Verificação</p>
                    <p className="font-medium">{evaluation.facilidade_verificacao}/5</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground">Estabilidade</p>
                    <p className="font-medium">{evaluation.estabilidade_conta}/5</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground">Suporte</p>
                    <p className="font-medium">{evaluation.qualidade_suporte}/5</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground">Confiança</p>
                    <p className="font-medium">{evaluation.confiabilidade_geral}/5</p>
                  </div>
                </div>


                {/* Comment */}
                {evaluation.comentario && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-sm text-muted-foreground">{evaluation.comentario}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Report Dialog */}
      <AlertDialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Denunciar Avaliação</AlertDialogTitle>
            <AlertDialogDescription>
              Por que você está denunciando esta avaliação?
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
    </>
  );
}
