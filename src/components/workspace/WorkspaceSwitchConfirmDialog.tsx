/**
 * Modal de confirmação para troca de workspace
 * 
 * OBJETIVO: Controle operacional - garantir que o usuário está ciente
 * de que TODO o contexto financeiro será trocado.
 * 
 * Isso NÃO é UX cosmético. É segurança operacional.
 */

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
import { Building2, AlertTriangle, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface WorkspaceSwitchConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentWorkspaceName: string;
  targetWorkspaceName: string;
  targetWorkspaceRole: string;
  onConfirm: () => void;
  isLoading?: boolean;
}

export function WorkspaceSwitchConfirmDialog({
  open,
  onOpenChange,
  currentWorkspaceName,
  targetWorkspaceName,
  targetWorkspaceRole,
  onConfirm,
  isLoading = false,
}: WorkspaceSwitchConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            </div>
            <AlertDialogTitle className="text-lg">
              Trocar de Workspace
            </AlertDialogTitle>
          </div>
          
          <AlertDialogDescription className="space-y-4 text-left">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Workspace atual</p>
                <p className="font-medium text-foreground">{currentWorkspaceName}</p>
              </div>
            </div>
            
            <div className="flex items-center justify-center">
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
            </div>
            
            <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                <Building2 className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Novo workspace</p>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-foreground">{targetWorkspaceName}</p>
                  <Badge variant="secondary" className="text-[10px]">
                    {targetWorkspaceRole}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-sm text-amber-700 dark:text-amber-400 font-medium mb-1">
                ⚠️ Aviso Operacional
              </p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Todos os dados financeiros serão do novo workspace</li>
                <li>• Saldos, caixas e conciliações serão recarregados</li>
                <li>• Operações pendentes do workspace anterior não serão visíveis</li>
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <AlertDialogFooter className="mt-4">
          <AlertDialogCancel disabled={isLoading}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction 
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-primary hover:bg-primary/90"
          >
            {isLoading ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Trocando...
              </>
            ) : (
              "Confirmar Troca"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
