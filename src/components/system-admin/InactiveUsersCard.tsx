import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, UserX, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface InactiveUser {
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  last_login: string;
}

interface InactiveUsersCardProps {
  users: InactiveUser[];
  loading?: boolean;
}

export function InactiveUsersCard({ users, loading }: InactiveUsersCardProps) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
            <UserX className="h-4 w-4 text-amber-500" />
          </div>
          <div>
            <CardTitle className="text-base">Usuários Inativos</CardTitle>
            <CardDescription className="text-xs">Sem login há mais de 5 dias</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="h-[280px] pr-4">
          {loading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Carregando...
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 mb-3">
                <Clock className="h-6 w-6 text-emerald-500" />
              </div>
              <p className="text-sm font-medium text-foreground">Todos os usuários ativos!</p>
              <p className="text-xs text-muted-foreground mt-1">
                Nenhum usuário inativo há mais de 5 dias
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {users.map((user) => {
                const daysSinceLogin = Math.floor(
                  (new Date().getTime() - new Date(user.last_login).getTime()) / (1000 * 60 * 60 * 24)
                );
                const isVeryInactive = daysSinceLogin > 14;

                return (
                  <div
                    key={user.user_id}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-lg border transition-colors",
                      isVeryInactive 
                        ? "border-amber-500/30 bg-amber-500/5" 
                        : "border-border/50 bg-muted/30"
                    )}
                  >
                    <div className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full shrink-0",
                      isVeryInactive ? "bg-amber-500/20" : "bg-muted"
                    )}>
                      <AlertTriangle className={cn(
                        "h-4 w-4",
                        isVeryInactive ? "text-amber-500" : "text-muted-foreground"
                      )} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {user.user_name || 'Sem nome'}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {user.user_email}
                      </p>
                      <p className={cn(
                        "text-xs mt-1",
                        isVeryInactive ? "text-amber-500 font-medium" : "text-muted-foreground"
                      )}>
                        Último login: {formatDistanceToNow(new Date(user.last_login), { 
                          locale: ptBR, 
                          addSuffix: true 
                        })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
        {users.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs text-muted-foreground text-center">
              {users.length} usuário{users.length !== 1 ? 's' : ''} inativo{users.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
