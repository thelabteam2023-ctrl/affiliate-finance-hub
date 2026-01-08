import { useState } from "react";
import { useProjectModules, ModuleWithStatus } from "@/hooks/useProjectModules";
import { useActionAccess } from "@/hooks/useModuleAccess";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  ArrowLeftRight, 
  Sparkles, 
  Zap, 
  Gift, 
  Coins, 
  Puzzle,
  Check,
  Archive,
  RotateCcw,
  Info
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, React.ElementType> = {
  ArrowLeftRight,
  Sparkles,
  Zap,
  Gift,
  Coins,
  Puzzle,
};

interface ProjectModulesManagerProps {
  projetoId: string;
}

export function ProjectModulesManager({ projetoId }: ProjectModulesManagerProps) {
  const { modulesWithStatus, loading, activateModule, deactivateModule } = useProjectModules(projetoId);
  const { canEdit } = useActionAccess();
  const canManage = canEdit('projetos', 'projetos.edit');
  
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    moduleId: string;
    moduleName: string;
    action: "activate" | "deactivate";
  }>({ open: false, moduleId: "", moduleName: "", action: "activate" });
  
  const [processing, setProcessing] = useState<string | null>(null);

  const activeModules = modulesWithStatus.filter((m) => m.status === "active");
  const availableModules = modulesWithStatus.filter((m) => m.status === "available");
  const archivedModules = modulesWithStatus.filter((m) => m.status === "archived");

  const handleToggle = async (module: ModuleWithStatus) => {
    if (!canManage) return;
    
    if (module.status === "active") {
      // Confirm deactivation
      setConfirmDialog({
        open: true,
        moduleId: module.id,
        moduleName: module.name,
        action: "deactivate",
      });
    } else {
      // Direct activation
      setProcessing(module.id);
      await activateModule(module.id);
      setProcessing(null);
    }
  };

  const handleConfirmDeactivate = async () => {
    setProcessing(confirmDialog.moduleId);
    await deactivateModule(confirmDialog.moduleId);
    setProcessing(null);
    setConfirmDialog({ ...confirmDialog, open: false });
  };

  const handleReactivate = async (module: ModuleWithStatus) => {
    setProcessing(module.id);
    await activateModule(module.id);
    setProcessing(null);
  };

  const renderModuleCard = (module: ModuleWithStatus, showToggle: boolean) => {
    const IconComponent = ICON_MAP[module.icon] || Puzzle;
    const isProcessing = processing === module.id;
    
    return (
      <div
        key={module.id}
        className={cn(
          "flex items-center gap-4 p-4 rounded-lg border transition-all",
          module.status === "active" 
            ? "bg-primary/5 border-primary/20" 
            : module.status === "archived"
              ? "bg-muted/30 border-border/50 opacity-70"
              : "bg-background border-border hover:border-primary/30"
        )}
      >
        <div className={cn(
          "h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0",
          module.status === "active" ? "bg-primary/10" : "bg-muted"
        )}>
          <IconComponent className={cn(
            "h-5 w-5",
            module.status === "active" ? "text-primary" : "text-muted-foreground"
          )} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium">{module.name}</h4>
            {module.status === "active" && (
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-xs">
                <Check className="h-3 w-3 mr-1" />
                Ativo
              </Badge>
            )}
            {module.status === "archived" && (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30 text-xs">
                <Archive className="h-3 w-3 mr-1" />
                Arquivado
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground line-clamp-1">{module.description}</p>
        </div>

        {showToggle && canManage && (
          <div className="flex-shrink-0">
            {module.status === "archived" ? (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleReactivate(module)}
                disabled={isProcessing}
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Restaurar
              </Button>
            ) : (
              <Switch
                checked={module.status === "active"}
                onCheckedChange={() => handleToggle(module)}
                disabled={isProcessing}
              />
            )}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold">Módulos do Projeto</h3>
        <p className="text-sm text-muted-foreground">
          Ative ou desative módulos de estratégia conforme sua operação evolui.
        </p>
      </div>

      {/* Info Banner */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-blue-500">Como funcionam os módulos?</p>
          <p className="text-muted-foreground mt-1">
            Módulos ativados aparecem no menu do projeto. Ao desativar um módulo com dados, 
            ele será arquivado (dados preservados). Módulos sem dados são removidos completamente.
          </p>
        </div>
      </div>

      {/* Active Modules */}
      {activeModules.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Módulos Ativos ({activeModules.length})
          </h4>
          <div className="space-y-2">
            {activeModules.map((module) => renderModuleCard(module, true))}
          </div>
        </div>
      )}

      {/* Available Modules */}
      {availableModules.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Disponíveis ({availableModules.length})
          </h4>
          <div className="space-y-2">
            {availableModules.map((module) => renderModuleCard(module, true))}
          </div>
        </div>
      )}

      {/* Archived Modules */}
      {archivedModules.length > 0 && (
        <div className="space-y-3">
          <Separator />
          <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Arquivados ({archivedModules.length})
          </h4>
          <div className="space-y-2">
            {archivedModules.map((module) => renderModuleCard(module, true))}
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar módulo "{confirmDialog.moduleName}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Se houver dados associados a este módulo, ele será arquivado e os dados serão preservados. 
              Você poderá restaurá-lo a qualquer momento. Se não houver dados, o módulo será removido completamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeactivate}>
              Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
