import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  AlertTriangle, MessageSquare, Star, MessagesSquare, Flag, Trash2, 
  RefreshCw, CheckCircle2, Shield, Clock, User 
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { parseLocalDateTime } from '@/utils/dateUtils';
import { ptBR } from 'date-fns/locale';

interface ResetCounts {
  community_chat_messages: number;
  community_reports: number;
  community_comments: number;
  community_topics: number;
  community_evaluations: number;
}

interface ResetResult {
  success: boolean;
  dry_run: boolean;
  message: string;
  record_counts?: ResetCounts;
  deleted_counts?: ResetCounts;
  total_records?: number;
  total_deleted?: number;
}

interface ModerationLog {
  id: string;
  action_type: string;
  target_type: string;
  target_content: string | null;
  created_at: string;
  metadata: any;
}

export function CommunityResetTab() {
  const [loading, setLoading] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<ResetResult | null>(null);
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [resetComplete, setResetComplete] = useState(false);
  const [moderationLogs, setModerationLogs] = useState<ModerationLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  useEffect(() => {
    fetchModerationLogs();
  }, []);

  const fetchModerationLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('moderation_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setModerationLogs(data || []);
    } catch (error) {
      console.error('Error fetching moderation logs:', error);
    } finally {
      setLoadingLogs(false);
    }
  };

  const runDryRun = async () => {
    setLoading(true);
    setDryRunResult(null);
    setResetComplete(false);
    
    try {
      const { data, error } = await supabase.rpc('admin_reset_community', {
        _dry_run: true,
        _confirmation_phrase: null
      });

      if (error) throw error;
      setDryRunResult(data as unknown as ResetResult);
    } catch (error: any) {
      console.error('Error running dry-run:', error);
      toast.error(error.message || 'Erro ao executar simulação');
    } finally {
      setLoading(false);
    }
  };

  const executeReset = async () => {
    if (confirmPhrase !== 'RESETAR COMUNIDADE') {
      toast.error('Frase de confirmação incorreta');
      return;
    }

    setLoading(true);
    
    try {
      const { data, error } = await supabase.rpc('admin_reset_community', {
        _dry_run: false,
        _confirmation_phrase: confirmPhrase
      });

      if (error) throw error;
      
      const result = data as unknown as ResetResult;
      setDryRunResult(result);
      setResetComplete(true);
      setConfirmPhrase('');
      toast.success(`Reset concluído! ${result.total_deleted} registros removidos.`);
      fetchModerationLogs(); // Refresh logs
    } catch (error: any) {
      console.error('Error executing reset:', error);
      toast.error(error.message || 'Erro ao executar reset');
    } finally {
      setLoading(false);
    }
  };

  const getCountBadge = (count: number | undefined) => {
    if (!count || count === 0) {
      return <Badge variant="secondary" className="bg-muted text-muted-foreground">0</Badge>;
    }
    return <Badge variant="destructive">{count}</Badge>;
  };

  const getActionLabel = (actionType: string) => {
    switch (actionType) {
      case 'DELETE_TOPIC': return 'Tópico removido';
      case 'DELETE_COMMENT': return 'Comentário removido';
      case 'DELETE_CHAT_MESSAGE': return 'Mensagem removida';
      case 'CLEAR_CHAT': return 'Chat limpo';
      default: return actionType;
    }
  };

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'DELETE_TOPIC': return MessageSquare;
      case 'DELETE_COMMENT': return MessageSquare;
      case 'DELETE_CHAT_MESSAGE': return MessagesSquare;
      case 'CLEAR_CHAT': return Trash2;
      default: return Flag;
    }
  };

  const tableConfig = [
    { key: 'community_chat_messages', label: 'Mensagens do Chat', icon: MessagesSquare },
    { key: 'community_topics', label: 'Tópicos de Discussão', icon: MessageSquare },
    { key: 'community_comments', label: 'Comentários', icon: MessageSquare },
    { key: 'community_evaluations', label: 'Avaliações', icon: Star },
    { key: 'community_reports', label: 'Denúncias', icon: Flag },
  ];

  return (
    <div className="space-y-6">
      <Tabs defaultValue="logs">
        <TabsList>
          <TabsTrigger value="logs" className="gap-2">
            <Shield className="h-4 w-4" />
            Logs de Moderação
          </TabsTrigger>
          <TabsTrigger value="reset" className="gap-2">
            <Trash2 className="h-4 w-4" />
            Reset Global
          </TabsTrigger>
        </TabsList>

        {/* Moderation Logs Tab */}
        <TabsContent value="logs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Histórico de Moderação
              </CardTitle>
              <CardDescription>
                Ações de moderação executadas na comunidade
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingLogs ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-16" />
                  ))}
                </div>
              ) : moderationLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Shield className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>Nenhuma ação de moderação registrada</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {moderationLogs.map((log) => {
                    const Icon = getActionIcon(log.action_type);
                    return (
                      <div 
                        key={log.id} 
                        className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border"
                      >
                        <div className="h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                          <Icon className="h-4 w-4 text-destructive" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{getActionLabel(log.action_type)}</span>
                            {log.metadata?.count && (
                              <Badge variant="secondary">{log.metadata.count} itens</Badge>
                            )}
                          </div>
                          {log.target_content && (
                            <p className="text-sm text-muted-foreground mt-1 truncate">
                              "{log.target_content}"
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {format(parseLocalDateTime(log.created_at), "d MMM yyyy, HH:mm", { locale: ptBR })}
                            </span>
                            {log.metadata?.reason && (
                              <span>Motivo: {log.metadata.reason}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              
              <Button 
                variant="outline" 
                size="sm" 
                onClick={fetchModerationLogs} 
                className="mt-4"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Atualizar
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reset Tab */}
        <TabsContent value="reset" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <Trash2 className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <CardTitle>Reset Global da Comunidade</CardTitle>
                  <CardDescription>
                    Remove TODOS os dados de testes: tópicos, avaliações, comentários e chat
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Warning */}
              <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-destructive">⚠️ Ação irreversível e extremamente perigosa</p>
                  <p className="text-muted-foreground mt-1">
                    Esta operação irá <strong>apagar permanentemente</strong> TODOS os dados do módulo Comunidade de TODOS os workspaces.
                    Use as ferramentas de moderação para exclusões pontuais. Este reset é apenas para ambientes de teste.
                  </p>
                </div>
              </div>

              {/* Dry-run Button */}
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  onClick={runDryRun} 
                  disabled={loading}
                  className="gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Simular Reset (Dry-run)
                </Button>
              </div>

              {/* Results */}
              {dryRunResult && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    {resetComplete ? (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                        <span className="font-medium text-green-500">Reset concluído com sucesso!</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-5 w-5 text-amber-500" />
                        <span className="font-medium">Simulação - Registros que serão removidos:</span>
                      </>
                    )}
                  </div>

                  {/* Table with counts */}
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="text-left p-3 font-medium">Tabela</th>
                          <th className="text-right p-3 font-medium">
                            {resetComplete ? 'Removidos' : 'Registros'}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {tableConfig.map(({ key, label, icon: Icon }) => {
                          const counts = resetComplete ? dryRunResult.deleted_counts : dryRunResult.record_counts;
                          const count = counts?.[key as keyof ResetCounts];
                          return (
                            <tr key={key} className="border-t">
                              <td className="p-3">
                                <div className="flex items-center gap-2">
                                  <Icon className="h-4 w-4 text-muted-foreground" />
                                  {label}
                                </div>
                              </td>
                              <td className="p-3 text-right">
                                {getCountBadge(count)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t bg-muted/30">
                          <td className="p-3 font-medium">Total</td>
                          <td className="p-3 text-right">
                            <Badge variant={resetComplete ? 'secondary' : 'destructive'} className="text-base">
                              {resetComplete ? dryRunResult.total_deleted : dryRunResult.total_records}
                            </Badge>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Confirmation Section - Only show if not yet reset and there are records to delete */}
                  {!resetComplete && dryRunResult.total_records && dryRunResult.total_records > 0 && (
                    <div className="space-y-4 pt-4 border-t">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          Para confirmar, digite: <code className="bg-muted px-2 py-0.5 rounded">RESETAR COMUNIDADE</code>
                        </label>
                        <Input
                          value={confirmPhrase}
                          onChange={(e) => setConfirmPhrase(e.target.value)}
                          placeholder="Digite a frase de confirmação..."
                          className="max-w-md"
                        />
                      </div>

                      <Button 
                        variant="destructive" 
                        onClick={executeReset}
                        disabled={loading || confirmPhrase !== 'RESETAR COMUNIDADE'}
                        className="gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        Executar Reset Definitivo
                      </Button>
                    </div>
                  )}

                  {/* No records message */}
                  {!resetComplete && dryRunResult.total_records === 0 && (
                    <div className="text-center py-4 text-muted-foreground">
                      Nenhum registro para remover. O módulo Comunidade já está vazio.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
