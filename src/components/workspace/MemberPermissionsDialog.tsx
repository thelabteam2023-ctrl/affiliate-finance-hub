import { useState } from "react";
import { usePermissionOverrides } from "@/hooks/usePermissionOverrides";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Loader2, Info, Shield, Trash2, Users, DollarSign, Building, FolderOpen, TrendingUp, Lock, AlertCircle } from "lucide-react";

interface MemberPermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: {
    id: string;
    user_id: string;
    email?: string;
    full_name?: string;
    role: string;
  };
  onPermissionsChanged?: () => void;
}

const moduleConfig: Record<string, { label: string; icon: any; description: string }> = {
  parceiros: { 
    label: "Parceiros", 
    icon: Users,
    description: "Gerenciamento de parceiros e contas bancárias"
  },
  projetos: { 
    label: "Projetos", 
    icon: FolderOpen,
    description: "Projetos, apostas e ciclos operacionais"
  },
  caixa: { 
    label: "Caixa", 
    icon: DollarSign,
    description: "Transações financeiras e saldos"
  },
  bookmakers: { 
    label: "Casas (Bookmakers)", 
    icon: Building,
    description: "Catálogo e contas em bookmakers"
  },
  captacao: { 
    label: "Captação", 
    icon: TrendingUp,
    description: "Indicadores, parcerias e fornecedores"
  },
  financeiro: { 
    label: "Financeiro", 
    icon: DollarSign,
    description: "KPIs financeiros, despesas e participações"
  },
  investidores: {
    label: "Investidores",
    icon: Users,
    description: "Gestão de investidores e aportes"
  },
  operadores: {
    label: "Operadores",
    icon: Users,
    description: "Gestão de operadores e pagamentos"
  },
};

const actionLabels: Record<string, string> = {
  create: "Criar",
  read: "Ver",
  edit: "Editar",
  delete: "Deletar",
  execute: "Executar",
};

const planLabels: Record<string, string> = {
  free: "Gratuito",
  starter: "Starter",
  pro: "Pro",
  advanced: "Advanced",
  enterprise: "Enterprise",
};

export function MemberPermissionsDialog({
  open,
  onOpenChange,
  member,
  onPermissionsChanged,
}: MemberPermissionsDialogProps) {
  const { toast } = useToast();
  const {
    permissionsByModule,
    loading,
    hasOverride,
    toggleOverride,
    clearAllOverrides,
    overrideCount,
    canUseCustomPermissions,
    hasLimitedPermissions,
    maxOverrides,
    workspacePlan,
  } = usePermissionOverrides(member.user_id, member.role);

  const [saving, setSaving] = useState<string | null>(null);

  const handleToggle = async (permissionCode: string, currentState: boolean) => {
    setSaving(permissionCode);
    try {
      await toggleOverride(permissionCode, !currentState);
      onPermissionsChanged?.();
    } catch (error: any) {
      if (error.message === 'PLAN_NOT_ALLOWED') {
        toast({
          title: "Plano não permite",
          description: "Seu plano atual não permite permissões customizadas. Faça upgrade para Pro ou superior.",
          variant: "destructive",
        });
      } else if (error.message === 'LIMIT_REACHED') {
        toast({
          title: "Limite atingido",
          description: `Seu plano permite no máximo ${maxOverrides} permissões customizadas.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Erro",
          description: "Não foi possível alterar a permissão.",
          variant: "destructive",
        });
      }
    } finally {
      setSaving(null);
    }
  };

  const handleClearAll = async () => {
    try {
      await clearAllOverrides();
      onPermissionsChanged?.();
      toast({
        title: "Permissões removidas",
        description: "Todas as permissões adicionais foram removidas.",
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível remover as permissões.",
        variant: "destructive",
      });
    }
  };

  // Viewer can never have extra permissions
  if (member.role === 'viewer') {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Permissões Adicionais
            </DialogTitle>
          </DialogHeader>
          <div className="text-center py-8 text-muted-foreground">
            <Info className="h-10 w-10 mx-auto mb-4 opacity-50" />
            <p>Visualizadores não podem receber permissões adicionais.</p>
            <p className="text-sm mt-2">Altere a função base para conceder mais acesso.</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Plan doesn't allow custom permissions
  if (!canUseCustomPermissions) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Permissões Adicionais
            </DialogTitle>
          </DialogHeader>
          <div className="py-6">
            <Alert variant="default" className="border-amber-500/50 bg-amber-500/10">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-700 dark:text-amber-400">
                <p className="font-medium mb-2">
                  Plano {planLabels[workspacePlan] || workspacePlan} não suporta permissões customizadas
                </p>
                <p className="text-sm">
                  Para habilitar permissões adicionais por membro, faça upgrade para o plano Pro ou superior.
                </p>
              </AlertDescription>
            </Alert>
            <div className="mt-4 text-center text-sm text-muted-foreground">
              <p>Permissões customizadas permitem que operadores executem tarefas administrativas ou financeiras sem alterar a função base.</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Permissões Adicionais
          </DialogTitle>
          <DialogDescription>
            Configure permissões extras para{" "}
            <span className="font-medium text-foreground">
              {member.full_name || member.email}
            </span>
            . Essas permissões são adicionais à função base ({member.role}).
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Header with count, limit info, and clear button */}
            <div className="flex items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                {overrideCount > 0 && (
                  <Badge variant="secondary" className="bg-primary/10 text-primary">
                    {overrideCount} permissão(ões) ativa(s)
                  </Badge>
                )}
                {hasLimitedPermissions && (
                  <Badge variant="outline" className="text-muted-foreground">
                    Limite: {overrideCount}/{maxOverrides}
                  </Badge>
                )}
              </div>
              {overrideCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearAll}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Limpar todas
                </Button>
              )}
            </div>

            {/* Limit warning */}
            {hasLimitedPermissions && overrideCount >= maxOverrides && (
              <Alert variant="default" className="border-amber-500/50 bg-amber-500/10 mb-4">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-700 dark:text-amber-400 text-sm">
                  Limite de {maxOverrides} permissões atingido. Remova uma permissão para adicionar outra, ou faça upgrade para o plano Advanced.
                </AlertDescription>
              </Alert>
            )}

            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-6">
                {Object.entries(permissionsByModule).map(([module, perms]) => {
                  const config = moduleConfig[module] || { 
                    label: module.charAt(0).toUpperCase() + module.slice(1), 
                    icon: Shield,
                    description: ""
                  };
                  const ModuleIcon = config.icon;

                  return (
                    <div key={module} className="space-y-3">
                      <div className="flex items-center gap-2">
                        <ModuleIcon className="h-4 w-4 text-muted-foreground" />
                        <h3 className="font-medium text-sm">{config.label}</h3>
                        {config.description && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <Info className="h-3 w-3 text-muted-foreground" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">{config.description}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>

                      <div className="grid gap-2 pl-6">
                        {perms.map((perm) => {
                          const isEnabled = hasOverride(perm.code);
                          const isSaving = saving === perm.code;
                          const actionLabel = actionLabels[perm.action] || perm.action;
                          const isAtLimit = hasLimitedPermissions && overrideCount >= maxOverrides && !isEnabled;

                          return (
                            <div
                              key={perm.code}
                              className={`flex items-center justify-between py-2 px-3 rounded-md hover:bg-accent/50 transition-colors ${isAtLimit ? 'opacity-50' : ''}`}
                            >
                              <div className="flex flex-col">
                                <span className="text-sm font-medium">
                                  {actionLabel}: {perm.description}
                                </span>
                                <span className="text-xs text-muted-foreground font-mono">
                                  {perm.code}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                {isSaving && (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                )}
                                <Switch
                                  checked={isEnabled}
                                  onCheckedChange={() => handleToggle(perm.code, isEnabled)}
                                  disabled={isSaving || isAtLimit}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <Separator className="mt-4" />
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            <div className="text-xs text-muted-foreground pt-2 border-t">
              <Info className="h-3 w-3 inline mr-1" />
              Permissões adicionais expandem os poderes da função base, mas não concedem acesso fora do workspace.
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
