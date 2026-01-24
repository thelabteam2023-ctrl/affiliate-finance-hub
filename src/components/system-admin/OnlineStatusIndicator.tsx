import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useUserLoginHistory } from '@/hooks/useUserLoginHistory';
import { cn } from '@/lib/utils';
import { parseLocalDateTime } from '@/utils/dateUtils';

interface OnlineStatusIndicatorProps {
  userId: string;
  isOnline: boolean;
  userName?: string;
}

export function OnlineStatusIndicator({ userId, isOnline, userName }: OnlineStatusIndicatorProps) {
  const { fetchUserHistory, getUserHistory, loading } = useUserLoginHistory();
  const [hasFetched, setHasFetched] = useState(false);

  const handleMouseEnter = async () => {
    if (!hasFetched) {
      await fetchUserHistory(userId);
      setHasFetched(true);
    }
  };

  const history = getUserHistory(userId);

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild onMouseEnter={handleMouseEnter}>
          <span className="inline-flex items-center gap-2">
            <span
              className={cn(
                "h-2.5 w-2.5 rounded-full flex-shrink-0",
                isOnline 
                  ? "bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" 
                  : "bg-muted-foreground/30"
              )}
            />
            {userName && <span>{userName}</span>}
          </span>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          <div className="space-y-2">
            <p className="font-medium text-sm">
              {isOnline ? '🟢 Online agora' : '⚪ Offline'}
            </p>
            {loading && !history && (
              <p className="text-xs text-muted-foreground">Carregando histórico...</p>
            )}
            {history && history.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Últimos logins:</p>
                {history.map((record) => (
                  <div key={record.id} className="text-xs text-muted-foreground flex justify-between gap-4">
                    <span>
                      {format(parseLocalDateTime(record.login_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </span>
                    {record.ip_address && (
                      <span className="font-mono text-[10px]">{record.ip_address}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {history && history.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhum login registrado</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
