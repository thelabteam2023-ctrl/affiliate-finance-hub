import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCommunityAccess } from '@/hooks/useCommunityAccess';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Star, AlertTriangle, MessageSquare, Users, Clock, Shield, Zap, HeartHandshake, Building2 } from 'lucide-react';
import { CommunityEvaluationDialog } from '@/components/comunidade/CommunityEvaluationDialog';
import { CommunityTopicDialog } from '@/components/comunidade/CommunityTopicDialog';
import { CommunityEvaluationsList } from '@/components/comunidade/CommunityEvaluationsList';
import { CommunityTopicsList } from '@/components/comunidade/CommunityTopicsList';

interface BookmakerDetails {
  id: string;
  nome: string;
  logo_url: string | null;
  status: string;
  visibility: string;
}

interface BookmakerStats {
  total_avaliacoes: number;
  nota_media_geral: number | null;
  media_velocidade_pagamento: number | null;
  media_facilidade_verificacao: number | null;
  media_estabilidade_conta: number | null;
  media_qualidade_suporte: number | null;
  media_confiabilidade_geral: number | null;
  bloqueios_apos_ganhos: number;
  bloqueios_recorrentes: number;
  total_topicos: number;
}

const STATUS_BLOQUEIO_LABELS: Record<string, { label: string; color: string }> = {
  'NUNCA_BLOQUEOU': { label: 'Nunca bloqueou', color: 'text-green-500' },
  'BLOQUEOU_APOS_GANHOS': { label: 'Bloqueou após ganhos', color: 'text-amber-500' },
  'BLOQUEIO_RECORRENTE': { label: 'Bloqueio recorrente', color: 'text-red-500' },
};

export default function ComunidadeDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hasFullAccess } = useCommunityAccess();
  
  const [bookmaker, setBookmaker] = useState<BookmakerDetails | null>(null);
  const [stats, setStats] = useState<BookmakerStats | null>(null);
  const [userEvaluation, setUserEvaluation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [evaluationDialogOpen, setEvaluationDialogOpen] = useState(false);
  const [topicDialogOpen, setTopicDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('visao-geral');

  useEffect(() => {
    if (id) {
      fetchData();
    }
  }, [id, user?.id]);

  const fetchData = async () => {
    if (!id) return;
    
    try {
      // Fetch bookmaker details
      const { data: bmData, error: bmError } = await supabase
        .from('bookmakers_catalogo')
        .select('id, nome, logo_url, status, visibility')
        .eq('id', id)
        .single();

      if (bmError) throw bmError;
      setBookmaker(bmData);

      // Fetch stats from view
      const { data: statsData, error: statsError } = await supabase
        .from('v_community_bookmaker_stats')
        .select('*')
        .eq('bookmaker_catalogo_id', id)
        .single();

      if (!statsError && statsData) {
        setStats({
          total_avaliacoes: statsData.total_avaliacoes || 0,
          nota_media_geral: statsData.nota_media_geral,
          media_velocidade_pagamento: statsData.media_velocidade_pagamento,
          media_facilidade_verificacao: statsData.media_facilidade_verificacao,
          media_estabilidade_conta: statsData.media_estabilidade_conta,
          media_qualidade_suporte: statsData.media_qualidade_suporte,
          media_confiabilidade_geral: statsData.media_confiabilidade_geral,
          bloqueios_apos_ganhos: statsData.bloqueios_apos_ganhos || 0,
          bloqueios_recorrentes: statsData.bloqueios_recorrentes || 0,
          total_topicos: statsData.total_topicos || 0,
        });
      }

      // Check if user already has an evaluation
      if (user?.id) {
        const { data: evalData } = await supabase
          .from('community_evaluations')
          .select('*')
          .eq('user_id', user.id)
          .eq('bookmaker_catalogo_id', id)
          .single();

        setUserEvaluation(evalData);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderStars = (rating: number | null) => {
    if (!rating) return null;
    
    return (
      <div className="flex items-center gap-1">
        {[...Array(5)].map((_, i) => (
          <Star
            key={i}
            className={`h-5 w-5 ${
              i < Math.floor(rating)
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-muted-foreground/30'
            }`}
          />
        ))}
        <span className="text-lg font-semibold ml-2">{rating.toFixed(1)}</span>
      </div>
    );
  };

  const renderCriterionBar = (label: string, value: number | null, icon: React.ReactNode) => {
    if (value === null) return null;
    
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            {icon}
            <span>{label}</span>
          </div>
          <span className="font-medium">{value.toFixed(1)}</span>
        </div>
        <Progress value={(value / 5) * 100} className="h-2" />
      </div>
    );
  };

  const getTotalBloqueios = () => {
    if (!stats) return 0;
    return stats.bloqueios_apos_ganhos + stats.bloqueios_recorrentes;
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 max-w-6xl">
        <Skeleton className="h-10 w-64 mb-6" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  if (!bookmaker) {
    return (
      <div className="container mx-auto p-6 max-w-6xl">
        <Button variant="ghost" onClick={() => navigate('/comunidade')} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Casa não encontrada</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      {/* Back button */}
      <Button variant="ghost" onClick={() => navigate('/comunidade')} className="mb-4">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Voltar para Comunidade
      </Button>

      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <div className="h-16 w-16 rounded-xl bg-muted flex items-center justify-center shrink-0 overflow-hidden">
          {bookmaker.logo_url ? (
            <img src={bookmaker.logo_url} alt={bookmaker.nome} className="h-14 w-14 object-contain" />
          ) : (
            <Building2 className="h-8 w-8 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold">{bookmaker.nome}</h1>
            <Badge 
              variant="outline" 
              className={
                bookmaker.status === 'REGULAMENTADA'
                  ? 'border-green-500/30 text-green-500'
                  : 'border-amber-500/30 text-amber-500'
              }
            >
              {bookmaker.status === 'REGULAMENTADA' ? 'Regulamentada' : 'Não Regulamentada'}
            </Badge>
          </div>
          {stats && renderStars(stats.nota_media_geral)}
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span>{stats?.total_avaliacoes || 0} avaliações</span>
            <span>{stats?.total_topicos || 0} tópicos</span>
          </div>
        </div>
        
        {/* Action Buttons */}
        {hasFullAccess && (
          <div className="flex gap-2">
            <Button 
              variant="outline"
              onClick={() => setEvaluationDialogOpen(true)}
            >
              <Star className="h-4 w-4 mr-2" />
              {userEvaluation ? 'Editar Avaliação' : 'Avaliar'}
            </Button>
            <Button onClick={() => setTopicDialogOpen(true)}>
              <MessageSquare className="h-4 w-4 mr-2" />
              Novo Tópico
            </Button>
          </div>
        )}
      </div>

      {/* Alert for blocks */}
      {getTotalBloqueios() > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-6 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
              Atenção: Relatos de bloqueio
            </p>
            <p className="text-xs text-muted-foreground">
              {stats?.bloqueios_apos_ganhos || 0} usuário(s) reportaram bloqueio após ganhos • 
              {stats?.bloqueios_recorrentes || 0} reportaram bloqueio recorrente
            </p>
          </div>
        </div>
      )}

      {/* Legal Disclaimer */}
      <div className="bg-muted/50 border border-border rounded-lg p-3 mb-6 text-xs text-muted-foreground">
        <strong>Aviso:</strong> As informações compartilhadas refletem experiências individuais dos usuários e não representam uma posição oficial da plataforma.
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="visao-geral">Visão Geral</TabsTrigger>
          <TabsTrigger value="avaliacoes">Avaliações</TabsTrigger>
          <TabsTrigger value="topicos">Tópicos</TabsTrigger>
        </TabsList>

        {/* Visão Geral Tab */}
        <TabsContent value="visao-geral">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Rating Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Star className="h-5 w-5" />
                  Avaliação Geral
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stats && stats.nota_media_geral ? (
                  <div className="space-y-4">
                    <div className="text-center py-4">
                      <div className="text-5xl font-bold">{stats.nota_media_geral.toFixed(1)}</div>
                      <div className="flex justify-center mt-2">
                        {renderStars(stats.nota_media_geral)}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Baseado em {stats.total_avaliacoes} avaliação(ões)
                      </p>
                    </div>
                    
                    <div className="space-y-3 pt-4 border-t">
                      {renderCriterionBar('Velocidade de Pagamento', stats.media_velocidade_pagamento, <Zap className="h-4 w-4 text-yellow-500" />)}
                      {renderCriterionBar('Facilidade de Verificação', stats.media_facilidade_verificacao, <Shield className="h-4 w-4 text-blue-500" />)}
                      {renderCriterionBar('Estabilidade da Conta', stats.media_estabilidade_conta, <Clock className="h-4 w-4 text-green-500" />)}
                      {renderCriterionBar('Qualidade do Suporte', stats.media_qualidade_suporte, <HeartHandshake className="h-4 w-4 text-purple-500" />)}
                      {renderCriterionBar('Confiabilidade Geral', stats.media_confiabilidade_geral, <Building2 className="h-4 w-4 text-primary" />)}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Star className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>Nenhuma avaliação ainda</p>
                    {hasFullAccess && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-3"
                        onClick={() => setEvaluationDialogOpen(true)}
                      >
                        Seja o primeiro a avaliar
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Block Status Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Status de Bloqueio
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stats && stats.total_avaliacoes > 0 ? (
                  <div className="space-y-4">
                    {/* Visual Summary */}
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                        <p className="text-2xl font-bold text-green-600">
                          {stats.total_avaliacoes - stats.bloqueios_apos_ganhos - stats.bloqueios_recorrentes}
                        </p>
                        <p className="text-xs text-green-600">Sem bloqueio</p>
                      </div>
                      <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                        <p className="text-2xl font-bold text-amber-600">{stats.bloqueios_apos_ganhos}</p>
                        <p className="text-xs text-amber-600">Após ganhos</p>
                      </div>
                      <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                        <p className="text-2xl font-bold text-red-600">{stats.bloqueios_recorrentes}</p>
                        <p className="text-xs text-red-600">Recorrente</p>
                      </div>
                    </div>

                    {/* Legend */}
                    <div className="space-y-2 pt-4 border-t text-sm">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-green-500"></div>
                        <span className="text-muted-foreground">Nunca bloqueou - Conta estável</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-amber-500"></div>
                        <span className="text-muted-foreground">Bloqueou após ganhos - Atenção ao operar</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-red-500"></div>
                        <span className="text-muted-foreground">Bloqueio recorrente - Alto risco</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>Sem dados de bloqueio disponíveis</p>
                    <p className="text-xs mt-1">Avalie esta casa para contribuir com a comunidade</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Atividade Recente
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stats && stats.total_topicos > 0 ? (
                  <p className="text-muted-foreground">
                    {stats.total_topicos} tópico(s) de discussão • Veja a aba "Tópicos" para detalhes
                  </p>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>Nenhum tópico de discussão ainda</p>
                    {hasFullAccess && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-3"
                        onClick={() => setTopicDialogOpen(true)}
                      >
                        Criar primeiro tópico
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Avaliações Tab */}
        <TabsContent value="avaliacoes">
          <CommunityEvaluationsList 
            bookmakerId={id!} 
            onRefresh={fetchData}
          />
        </TabsContent>

        {/* Tópicos Tab */}
        <TabsContent value="topicos">
          <CommunityTopicsList 
            bookmakerId={id!}
            onCreateTopic={() => setTopicDialogOpen(true)}
          />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <CommunityEvaluationDialog
        open={evaluationDialogOpen}
        onOpenChange={setEvaluationDialogOpen}
        bookmakerId={id!}
        bookmakerName={bookmaker.nome}
        existingEvaluation={userEvaluation}
        onSuccess={() => {
          fetchData();
          setEvaluationDialogOpen(false);
        }}
      />

      <CommunityTopicDialog
        open={topicDialogOpen}
        onOpenChange={setTopicDialogOpen}
        bookmakerId={id!}
        bookmakerName={bookmaker.nome}
        onSuccess={() => {
          fetchData();
          setTopicDialogOpen(false);
          setActiveTab('topicos');
        }}
      />
    </div>
  );
}
