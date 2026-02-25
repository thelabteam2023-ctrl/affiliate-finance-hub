import { useState, useEffect } from 'react';
import { Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useCommunityModeration } from '@/hooks/useCommunityModeration';

interface ClearChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  contextType: 'general' | 'topic';
  contextId: string | null;
  contextName?: string;
  onCleared?: () => void;
}

const CONFIRMATION_PHRASE = 'LIMPAR CHAT';

export function ClearChatDialog({
  open,
  onOpenChange,
  workspaceId,
  contextType,
  contextId,
  contextName,
  onCleared,
}: ClearChatDialogProps) {
  const { loading, clearChat, getChatMessageCount } = useCommunityModeration();
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [messageCount, setMessageCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);

  useEffect(() => {
    if (open) {
      setConfirmPhrase('');
      setLoadingCount(true);
      getChatMessageCount(workspaceId, contextType, contextId)
        .then(count => setMessageCount(count))
        .finally(() => setLoadingCount(false));
    }
  }, [open, workspaceId, contextType, contextId, getChatMessageCount]);

  const handleClear = async () => {
    if (confirmPhrase !== CONFIRMATION_PHRASE) return;

    const result = await clearChat(workspaceId, contextType, contextId);
    if (result.success) {
      onOpenChange(false);
      onCleared?.();
    }
  };

  const isConfirmValid = confirmPhrase === CONFIRMATION_PHRASE;
  const chatLabel = contextType === 'topic' && contextName 
    ? `chat de "${contextName}"` 
    : 'Chat Geral';

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Limpar {chatLabel}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Esta ação irá <strong>remover permanentemente</strong> todas as mensagens do {chatLabel}.
              </p>
              
              {loadingCount ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Contando mensagens...
                </div>
              ) : (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="font-medium text-destructive">
                    {messageCount} mensagens serão removidas
                  </p>
                </div>
              )}
              
              <p className="text-sm">
                Para confirmar, digite <strong>{CONFIRMATION_PHRASE}</strong> abaixo:
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <Input
          placeholder={CONFIRMATION_PHRASE}
          value={confirmPhrase}
          onChange={(e) => setConfirmPhrase(e.target.value.toUpperCase())}
          className={isConfirmValid ? 'border-destructive' : ''}
        />
        
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleClear}
            disabled={!isConfirmValid || loading || messageCount === 0}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            Limpar Chat
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
