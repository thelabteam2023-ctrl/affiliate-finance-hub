import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useChatBroadcast } from '@/hooks/useChatBroadcast';
import { useToast } from '@/hooks/use-toast';
import { CommunityChatFull } from './CommunityChatFull';
import { ExternalLink, X } from 'lucide-react';

interface CommunityChatDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const POPOUT_WINDOW_FEATURES = 'width=480,height=800,scrollbars=yes,resizable=yes';

export function CommunityChatDrawer({ open, onOpenChange }: CommunityChatDrawerProps) {
  const { isPopoutOpen } = useChatBroadcast();
  const { toast } = useToast();

  const openPopout = () => {
    const popoutUrl = `/comunidade/chat?mode=popout`;
    const popupWindow = window.open(popoutUrl, 'community-chat', POPOUT_WINDOW_FEATURES);
    
    if (!popupWindow || popupWindow.closed || typeof popupWindow.closed === 'undefined') {
      toast({
        title: 'Pop-up bloqueado',
        description: 'Seu navegador bloqueou o pop-up. Permita pop-ups para este site.',
        variant: 'destructive',
      });
    } else {
      // Close drawer when popout opens successfully
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" showClose={false} className="w-full sm:w-[480px] p-0 flex flex-col">
        <SheetHeader className="p-4 border-b border-border flex-row items-center justify-between space-y-0">
          <SheetTitle className="text-base">Chat Geral</SheetTitle>
          <div className="flex items-center gap-2">
            {!isPopoutOpen && (
              <Button variant="ghost" size="sm" onClick={openPopout}>
                <ExternalLink className="h-4 w-4 mr-1" />
                Janela
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>
        
        <div className="flex-1 overflow-hidden">
          <CommunityChatFull isPopout={false} isEmbedded={true} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
