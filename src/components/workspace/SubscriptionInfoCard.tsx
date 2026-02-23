import { useState, useEffect } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useWorkspaceSubscription, SubscriptionDetails, PERIOD_LABELS, STATUS_LABELS } from "@/hooks/useWorkspaceSubscription";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Calendar, Clock, AlertTriangle, CreditCard, Infinity, Info } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { parseLocalDateTime } from "@/utils/dateUtils";
import { ptBR } from "date-fns/locale";

const PLAN_COLORS: Record<string, string> = {
  free: 'bg-muted text-muted-foreground',
  starter: 'bg-blue-500/20 text-blue-400',
  pro: 'bg-purple-500/20 text-purple-400',
  advanced: 'bg-amber-500/20 text-amber-400',
};

export function SubscriptionInfoCard() {
  const { workspaceId } = useWorkspace();
  const { getSubscriptionDetails, formatRemainingTime, loading } = useWorkspaceSubscription();
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    const loadSubscription = async () => {
      if (!workspaceId) {
        setFetching(false);
        return;
      }
      
      setFetching(true);
      const details = await getSubscriptionDetails(workspaceId);
      setSubscription(details);
      setFetching(false);
    };

    loadSubscription();
  }, [workspaceId, getSubscriptionDetails]);

  if (fetching) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Sem assinatura formal - mostrar info básica
  if (!subscription) {
    return (
      <Card className="border-muted">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Assinatura
              </CardTitle>
              <CardDescription>
                Informações da sua assinatura
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-muted/50 p-4 flex items-start gap-3">
            <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground">
              <p>Seu workspace ainda não possui uma assinatura formal registrada.</p>
              <p className="mt-1">O plano está sendo gerenciado diretamente pelo administrador do sistema.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const statusConfig = STATUS_LABELS[subscription.computed_status] || STATUS_LABELS.active;
  const isLifetime = subscription.current_period === 'lifetime';
  const planColor = PLAN_COLORS[subscription.plan_code] || PLAN_COLORS.free;
  
  // Calculate progress
  const totalDays = subscription.current_period === 'monthly' ? 30 
    : subscription.current_period === 'semiannual' ? 180 
    : subscription.current_period === 'annual' ? 365 
    : null;
  
  const progressPercent = totalDays && subscription.remaining_days !== null
    ? Math.max(0, Math.min(100, (subscription.remaining_days / totalDays) * 100))
    : null;

  const isWarning = subscription.is_expiring || subscription.computed_status === 'grace_period';
  const isCritical = subscription.is_expired || subscription.remaining_days !== null && subscription.remaining_days < 0;

  return (
    <Card className={isWarning ? 'border-amber-500/50' : isCritical ? 'border-destructive/50' : ''}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Assinatura
            </CardTitle>
            <CardDescription>
              Informações da sua assinatura atual
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={planColor}>
              {subscription.plan_name}
            </Badge>
            <Badge className={statusConfig.class}>
              {statusConfig.label}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Period and Time Remaining */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Calendar className="h-4 w-4" />
              Período
            </div>
            <div className="font-medium">
              {PERIOD_LABELS[subscription.current_period]}
            </div>
          </div>
          
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Clock className="h-4 w-4" />
              Tempo Restante
            </div>
            <div className={`font-medium ${isWarning ? 'text-amber-500' : isCritical ? 'text-destructive' : ''}`}>
              {isLifetime ? (
                <span className="flex items-center gap-1">
                  <Infinity className="h-4 w-4" />
                  Vitalício
                </span>
              ) : (
                formatRemainingTime(subscription.remaining_days)
              )}
            </div>
          </div>
        </div>

        {/* Progress bar for subscription period */}
        {progressPercent !== null && !isLifetime && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Período atual</span>
              <span>{subscription.remaining_days} dias restantes</span>
            </div>
            <Progress 
              value={progressPercent} 
              className={`h-2 ${isWarning ? '[&>div]:bg-amber-500' : isCritical ? '[&>div]:bg-destructive' : ''}`}
            />
          </div>
        )}

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Início:</span>
            <span className="ml-2 font-medium">
              {format(parseLocalDateTime(subscription.started_at), 'dd/MM/yyyy', { locale: ptBR })}
            </span>
          </div>
          {subscription.expires_at && (
            <div>
              <span className="text-muted-foreground">Expira em:</span>
              <span className={`ml-2 font-medium ${isWarning ? 'text-amber-500' : isCritical ? 'text-destructive' : ''}`}>
                {format(parseLocalDateTime(subscription.expires_at), 'dd/MM/yyyy', { locale: ptBR })}
              </span>
            </div>
          )}
        </div>

        {/* Warnings */}
        {isWarning && !isCritical && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
              <div className="text-sm">
                <strong className="text-amber-500">Atenção!</strong>
                <p className="text-muted-foreground mt-1">
                  Sua assinatura está próxima do vencimento. Entre em contato para renovação.
                </p>
              </div>
            </div>
          </div>
        )}

        {isCritical && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
              <div className="text-sm">
                <strong className="text-destructive">Assinatura expirada!</strong>
                <p className="text-muted-foreground mt-1">
                  Sua assinatura expirou. Alguns recursos podem estar limitados. Entre em contato para renovação.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Scheduled downgrade */}
        {subscription.cancel_at_period_end && subscription.scheduled_downgrade && (
          <div className="rounded-lg bg-orange-500/10 border border-orange-500/30 p-3">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-orange-500 mt-0.5" />
              <div className="text-sm">
                <strong className="text-orange-500">Alteração agendada</strong>
                <p className="text-muted-foreground mt-1">
                  Seu plano será alterado ao final do período atual.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Price info */}
        {subscription.price_amount !== null && subscription.price_amount > 0 && (
          <div className="pt-2 border-t text-sm text-muted-foreground">
            Valor: <span className="font-medium text-foreground">
              {new Intl.NumberFormat('pt-BR', { 
                style: 'currency', 
                currency: subscription.price_currency || 'BRL' 
              }).format(subscription.price_amount)}
            </span>
            <span className="text-xs ml-1">/{PERIOD_LABELS[subscription.current_period].toLowerCase()}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
