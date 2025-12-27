import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface InactivityWarningBannerProps {
  minutesRemaining: number;
  onDismiss: () => void;
}

export function InactivityWarningBanner({ minutesRemaining, onDismiss }: InactivityWarningBannerProps) {
  if (minutesRemaining > 5) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] p-2">
      <Alert variant="destructive" className="mx-auto max-w-2xl bg-destructive text-destructive-foreground border-destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between gap-4">
          <span>
            Sua sessão expirará em <strong>{minutesRemaining} minuto{minutesRemaining !== 1 ? 's' : ''}</strong> por inatividade. 
            Será necessário fazer login novamente.
          </span>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onDismiss}
            className="shrink-0 border-destructive-foreground/30 hover:bg-destructive-foreground/10"
          >
            Continuar
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}
