import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Building2, Bell, Clock, AlertTriangle, Skull, Timer } from "lucide-react";
import { differenceInDays, parseISO, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AnalyticsTabProps, AlertItem, formatCurrency } from "./types";

const PROBLEM_REASONS = [
  'cancelled_reversed',
  'bonus_consumed', 
  'account_blocked',
  'limit_reached',
  'confiscated'
];

function getAlertIcon(type: AlertItem['type']) {
  switch (type) {
    case 'expiring_soon': return <Clock className="h-4 w-4" />;
    case 'rollover_deadline': return <Timer className="h-4 w-4" />;
    case 'multiple_problems': return <AlertTriangle className="h-4 w-4" />;
    case 'toxic_bookmaker': return <Skull className="h-4 w-4" />;
    default: return <Bell className="h-4 w-4" />;
  }
}

function getSeverityColor(severity: AlertItem['severity']) {
  switch (severity) {
    case 'critical': return 'bg-destructive/10 border-destructive/30 text-destructive';
    case 'warning': return 'bg-warning/10 border-warning/30 text-warning';
    case 'info': return 'bg-blue-500/10 border-blue-500/30 text-blue-500';
    default: return 'bg-muted border';
  }
}

export function AlertasTab({ bonuses, dateRange }: AnalyticsTabProps) {
  const alerts = useMemo((): AlertItem[] => {
    const now = new Date();
    const alertList: AlertItem[] = [];

    // 1. Bonuses expiring in 3 days or less
    bonuses.filter(b => {
      if (b.status !== 'credited' || !b.expires_at) return false;
      const expiresAt = parseISO(b.expires_at);
      const daysUntilExpiry = differenceInDays(expiresAt, now);
      return daysUntilExpiry >= 0 && daysUntilExpiry <= 3;
    }).forEach(b => {
      const expiresAt = parseISO(b.expires_at!);
      const daysLeft = differenceInDays(expiresAt, now);
      alertList.push({
        id: `expiring-${b.id}`,
        type: 'expiring_soon',
        severity: daysLeft <= 1 ? 'critical' : 'warning',
        title: `Bônus expirando${daysLeft === 0 ? ' HOJE' : daysLeft === 1 ? ' amanhã' : ` em ${daysLeft} dias`}`,
        description: `${formatCurrency(b.bonus_amount, b.currency)} em ${b.bookmaker_nome}`,
        bookmaker_nome: b.bookmaker_nome || 'Casa',
        logo_url: b.bookmaker_logo_url || null,
        created_at: now,
      });
    });

    // 2. Bonuses with rollover close to deadline (>80%)
    bonuses.filter(b => {
      if (b.status !== 'credited' || !b.deadline_days || !b.credited_at) return false;
      const creditedAt = parseISO(b.credited_at);
      const daysSinceCredit = differenceInDays(now, creditedAt);
      const percentUsed = (daysSinceCredit / b.deadline_days) * 100;
      return percentUsed >= 80 && percentUsed < 100;
    }).forEach(b => {
      const creditedAt = parseISO(b.credited_at!);
      const daysSinceCredit = differenceInDays(now, creditedAt);
      const daysRemaining = b.deadline_days! - daysSinceCredit;
      alertList.push({
        id: `deadline-${b.id}`,
        type: 'rollover_deadline',
        severity: daysRemaining <= 2 ? 'critical' : 'warning',
        title: `Prazo de rollover próximo`,
        description: `${daysRemaining} dias restantes para ${formatCurrency(b.bonus_amount, b.currency)} - Progresso: ${((b.rollover_progress || 0) / (b.rollover_target_amount || 1) * 100).toFixed(0)}%`,
        bookmaker_nome: b.bookmaker_nome || 'Casa',
        logo_url: b.bookmaker_logo_url || null,
        created_at: now,
      });
    });

    // 3. Bookmakers with 3+ recent problems
    const problemsByBookmaker: Record<string, { count: number; bonus: typeof bonuses[0] }> = {};
    bonuses.forEach(b => {
      const isProblem = b.status === 'failed' || b.status === 'expired' || b.status === 'reversed' ||
                       (b.status === 'finalized' && PROBLEM_REASONS.includes(b.finalize_reason || ''));
      if (!isProblem) return;
      
      // Check if recent (last 30 days)
      const relevantDate = b.finalized_at ? parseISO(b.finalized_at) : b.credited_at ? parseISO(b.credited_at) : null;
      if (!relevantDate || differenceInDays(now, relevantDate) > 30) return;
      
      if (!problemsByBookmaker[b.bookmaker_id]) {
        problemsByBookmaker[b.bookmaker_id] = { count: 0, bonus: b };
      }
      problemsByBookmaker[b.bookmaker_id].count++;
    });

    Object.entries(problemsByBookmaker)
      .filter(([_, data]) => data.count >= 3)
      .forEach(([id, data]) => {
        alertList.push({
          id: `problems-${id}`,
          type: 'multiple_problems',
          severity: data.count >= 5 ? 'critical' : 'warning',
          title: `Casa com múltiplos problemas`,
          description: `${data.count} problemas nos últimos 30 dias`,
          bookmaker_nome: data.bonus.bookmaker_nome || 'Casa',
          logo_url: data.bonus.bookmaker_logo_url || null,
          created_at: now,
        });
      });

    // 4. Toxic bookmakers (ICC < 40% based on recent data)
    const statsByBookmaker: Record<string, { received: number; converted: number; problems: number; bonus: typeof bonuses[0] }> = {};
    bonuses.forEach(b => {
      const relevantDate = b.credited_at ? parseISO(b.credited_at) : b.finalized_at ? parseISO(b.finalized_at) : null;
      if (!relevantDate || differenceInDays(now, relevantDate) > 60) return;
      
      if (!statsByBookmaker[b.bookmaker_id]) {
        statsByBookmaker[b.bookmaker_id] = { received: 0, converted: 0, problems: 0, bonus: b };
      }
      
      const data = statsByBookmaker[b.bookmaker_id];
      if (b.status === 'credited' || b.status === 'finalized') data.received++;
      if (b.status === 'finalized' && b.finalize_reason === 'rollover_completed') data.converted++;
      
      const isProblem = b.status === 'failed' || b.status === 'expired' || b.status === 'reversed' ||
                       (b.status === 'finalized' && PROBLEM_REASONS.includes(b.finalize_reason || ''));
      if (isProblem) data.problems++;
    });

    Object.entries(statsByBookmaker)
      .filter(([_, data]) => {
        if (data.received < 3) return false; // Need minimum data
        const icc = ((data.converted - data.problems) / data.received) * 100;
        return icc < 40;
      })
      .forEach(([id, data]) => {
        const icc = ((data.converted - data.problems) / data.received) * 100;
        alertList.push({
          id: `toxic-${id}`,
          type: 'toxic_bookmaker',
          severity: icc < 0 ? 'critical' : 'warning',
          title: `Casa classificada como tóxica`,
          description: `ICC: ${icc.toFixed(0)}% (${data.problems} problemas / ${data.received} bônus)`,
          bookmaker_nome: data.bonus.bookmaker_nome || 'Casa',
          logo_url: data.bonus.bookmaker_logo_url || null,
          created_at: now,
        });
      });

    // Sort by severity (critical first), then by type
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    alertList.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return alertList;
  }, [bonuses]);

  if (alerts.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Bell className="mx-auto h-12 w-12 mb-4 opacity-30" />
        <p>Nenhum alerta ativo</p>
        <p className="text-xs mt-1">Tudo sob controle! ✅</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[320px]">
      <div className="space-y-2">
        {alerts.map((alert) => (
          <div key={alert.id} className={`flex items-start gap-3 p-3 rounded-lg border ${getSeverityColor(alert.severity)}`}>
            <div className="flex-shrink-0 mt-0.5">
              {getAlertIcon(alert.type)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm">{alert.title}</p>
                <Badge variant={alert.severity === 'critical' ? 'destructive' : 'secondary'} className="text-[10px] px-1 py-0 h-4">
                  {alert.severity === 'critical' ? 'Crítico' : 'Atenção'}
                </Badge>
              </div>
              <p className="text-xs opacity-80 mt-0.5">{alert.description}</p>
              <div className="flex items-center gap-2 mt-2">
                {alert.logo_url ? (
                  <img src={alert.logo_url} alt={alert.bookmaker_nome} className="h-4 w-4 rounded object-contain logo-blend" />
                ) : (
                  <Building2 className="h-4 w-4 opacity-50" />
                )}
                <span className="text-xs opacity-70">{alert.bookmaker_nome}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
