import { usePresence } from '@/contexts/PresenceContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export function OnlineUsersCard() {
  const { onlineCount, isConnected } = usePresence();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Online Agora</CardTitle>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <Wifi className="h-4 w-4 text-emerald-500" />
          ) : (
            <WifiOff className="h-4 w-4 text-muted-foreground" />
          )}
          <Users className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <div className={cn(
            "h-3 w-3 rounded-full animate-pulse",
            isConnected ? "bg-emerald-500" : "bg-muted"
          )} />
          <span className="text-2xl font-bold">{onlineCount}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {isConnected ? 'Conectado em tempo real' : 'Conectando...'}
        </p>
      </CardContent>
    </Card>
  );
}
