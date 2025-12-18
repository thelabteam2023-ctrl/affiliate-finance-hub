import { usePlanEntitlements } from "@/hooks/usePlanEntitlements";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Loader2, Users, UserCheck, Shield, Zap, Crown, Infinity, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";

const PLAN_COLORS: Record<string, string> = {
  free: 'bg-muted text-muted-foreground',
  starter: 'bg-blue-500/10 text-blue-600',
  pro: 'bg-primary/10 text-primary',
  advanced: 'bg-amber-500/10 text-amber-600',
};

const PLAN_ICONS: Record<string, React.ElementType> = {
  free: Users,
  starter: Zap,
  pro: Crown,
  advanced: Crown,
};

export function PlanUsageCard() {
  const navigate = useNavigate();
  const {
    plan,
    entitlements,
    usage,
    loading,
    error,
    isOwner,
    getPlanLabel,
    getPartnerUsagePercent,
    getUserUsagePercent,
    getPermissionUsagePercent,
    isUnlimited,
  } = usePlanEntitlements();

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error || !entitlements || !usage) {
    return null;
  }

  // OWNER tem acesso total - exibir visão especial
  if (isOwner) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Acesso Total
              </CardTitle>
              <CardDescription>
                Proprietário do workspace
              </CardDescription>
            </div>
            <Badge className="bg-primary/20 text-primary border-primary/30">
              <Crown className="h-3 w-3 mr-1" />
              OWNER
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-background/80 rounded-lg p-4 border border-border/50">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Como <span className="font-semibold text-foreground">proprietário do workspace</span>, você possui 
              <span className="font-semibold text-primary"> acesso total </span> 
              e não está sujeito a limites de plano.
            </p>
          </div>

          {/* Visão informativa dos recursos (sem limites) */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-muted-foreground" />
                <span>Parceiros Ativos</span>
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <span className="font-medium text-foreground">{usage.active_partners}</span>
                <Infinity className="h-3 w-3 ml-1" />
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span>Usuários</span>
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <span className="font-medium text-foreground">{usage.active_users}</span>
                <Infinity className="h-3 w-3 ml-1" />
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span>Permissões Customizadas</span>
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <span className="font-medium text-foreground">{usage.custom_permissions}</span>
                <Infinity className="h-3 w-3 ml-1" />
              </div>
            </div>
          </div>

          {/* Info sobre plano da equipe */}
          <div className="pt-3 border-t text-xs text-muted-foreground">
            <p>
              Plano do workspace: <span className="font-medium">{getPlanLabel()}</span>
              <span className="ml-1">(aplica-se apenas aos membros convidados)</span>
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Visão padrão para não-owners
  const PlanIcon = PLAN_ICONS[plan || 'free'] || Users;
  const planColor = PLAN_COLORS[plan || 'free'] || PLAN_COLORS.free;

  const partnerPercent = getPartnerUsagePercent();
  const userPercent = getUserUsagePercent();
  const permissionPercent = getPermissionUsagePercent();

  const isPartnerNearLimit = partnerPercent >= 80;
  const isUserNearLimit = userPercent >= 80;
  const isPermissionNearLimit = permissionPercent >= 80;

  const formatLimit = (value: number) => {
    return isUnlimited(value) ? '∞' : value.toString();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <PlanIcon className="h-5 w-5" />
              Plano e Uso
            </CardTitle>
            <CardDescription>
              Acompanhe os limites do seu plano
            </CardDescription>
          </div>
          <Badge className={planColor}>
            {getPlanLabel()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Partners Usage */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-muted-foreground" />
              <span>Parceiros Ativos</span>
            </div>
            <span className={isPartnerNearLimit && !isUnlimited(entitlements.max_active_partners) ? 'text-amber-600 font-medium' : ''}>
              {usage.active_partners} / {formatLimit(entitlements.max_active_partners)}
            </span>
          </div>
          {!isUnlimited(entitlements.max_active_partners) && (
            <Progress 
              value={partnerPercent} 
              className={`h-2 ${isPartnerNearLimit ? '[&>div]:bg-amber-500' : ''}`}
            />
          )}
          {isUnlimited(entitlements.max_active_partners) && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Infinity className="h-3 w-3" />
              <span>Ilimitado</span>
            </div>
          )}
        </div>

        {/* Users Usage */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span>Usuários</span>
            </div>
            <span className={isUserNearLimit && !isUnlimited(entitlements.max_users) ? 'text-amber-600 font-medium' : ''}>
              {usage.active_users} / {formatLimit(entitlements.max_users)}
            </span>
          </div>
          {!isUnlimited(entitlements.max_users) && (
            <Progress 
              value={userPercent} 
              className={`h-2 ${isUserNearLimit ? '[&>div]:bg-amber-500' : ''}`}
            />
          )}
          {isUnlimited(entitlements.max_users) && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Infinity className="h-3 w-3" />
              <span>Ilimitado</span>
            </div>
          )}
        </div>

        {/* Custom Permissions Usage */}
        {entitlements.custom_permissions_enabled && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span>Permissões Customizadas</span>
              </div>
              <span className={isPermissionNearLimit && !isUnlimited(entitlements.max_custom_permissions) ? 'text-amber-600 font-medium' : ''}>
                {usage.custom_permissions} / {formatLimit(entitlements.max_custom_permissions)}
              </span>
            </div>
            {!isUnlimited(entitlements.max_custom_permissions) && (
              <Progress 
                value={permissionPercent} 
                className={`h-2 ${isPermissionNearLimit ? '[&>div]:bg-amber-500' : ''}`}
              />
            )}
            {isUnlimited(entitlements.max_custom_permissions) && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Infinity className="h-3 w-3" />
                <span>Ilimitado</span>
              </div>
            )}
          </div>
        )}

        {!entitlements.custom_permissions_enabled && (
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Shield className="h-4 w-4" />
              <span>Permissões customizadas disponíveis no plano Pro</span>
            </div>
          </div>
        )}

        {/* Upgrade CTA */}
        {plan !== 'advanced' && (
          <div className="pt-2 border-t">
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => navigate('/')}
            >
              <Zap className="h-4 w-4 mr-2" />
              Ver planos e fazer upgrade
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
