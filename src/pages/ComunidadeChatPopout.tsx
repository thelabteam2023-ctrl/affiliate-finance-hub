import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useCommunityAccess } from '@/hooks/useCommunityAccess';
import { useChatBroadcast } from '@/hooks/useChatBroadcast';
import { CommunityChatFull } from '@/components/comunidade/CommunityChatFull';
import { Button } from '@/components/ui/button';
import { Lock, ExternalLink } from 'lucide-react';

export default function ComunidadeChatPopout() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { hasFullAccess, loading: accessLoading, plan } = useCommunityAccess();
  const { notifyWindowOpened, notifyWindowClosed } = useChatBroadcast();
  
  const isPopoutMode = searchParams.get('mode') === 'popout';
  const contextType = (searchParams.get('context') as 'general' | 'topic') || 'general';
  const contextId = searchParams.get('contextId') || null;
  const topicTitle = searchParams.get('name') || undefined;

  // Notify other tabs that this window is open
  useEffect(() => {
    if (isPopoutMode && user) {
      notifyWindowOpened();
      
      const handleBeforeUnload = () => {
        notifyWindowClosed();
      };
      
      window.addEventListener('beforeunload', handleBeforeUnload);
      
      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
        notifyWindowClosed();
      };
    }
  }, [isPopoutMode, user, notifyWindowOpened, notifyWindowClosed]);

  // Set window title
  useEffect(() => {
    document.title = topicTitle ? `Chat - ${topicTitle}` : 'Chat Geral';
  }, [topicTitle]);

  const handleGoToERP = () => {
    window.open('/comunidade', '_blank');
  };

  if (authLoading || accessLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background p-6">
        <Lock className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold mb-2">Sessão expirada</h2>
        <p className="text-sm text-muted-foreground text-center mb-4">
          Faça login novamente para acessar o chat.
        </p>
        <Button onClick={() => navigate('/auth')}>
          Fazer Login
        </Button>
      </div>
    );
  }

  if (!hasFullAccess) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background p-6">
        <Lock className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold mb-2">Acesso Restrito</h2>
        <p className="text-sm text-muted-foreground text-center mb-4">
          Chat exclusivo para usuários PRO+
        </p>
        <p className="text-xs text-muted-foreground mb-4">
          Plano atual: {plan?.toUpperCase() || 'FREE'}
        </p>
        <Button onClick={handleGoToERP} variant="outline">
          <ExternalLink className="h-4 w-4 mr-2" />
          Voltar para o ERP
        </Button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <CommunityChatFull 
        isPopout={isPopoutMode}
        onGoToERP={handleGoToERP}
        initialContextType={contextType}
        initialContextId={contextId}
        topicTitle={topicTitle}
      />
    </div>
  );
}