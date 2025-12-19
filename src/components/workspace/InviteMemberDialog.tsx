import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { usePlanEntitlements } from "@/hooks/usePlanEntitlements";
import { Database } from "@/integrations/supabase/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, UserPlus, Shield, DollarSign, Gamepad2, Eye, AlertTriangle, Zap } from "lucide-react";

type AppRole = Database["public"]["Enums"]["app_role"];

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  onMemberInvited: () => void;
}

const roleOptions: { value: AppRole; label: string; icon: any; description: string }[] = [
  { 
    value: 'admin', 
    label: 'Administrador', 
    icon: Shield,
    description: 'Acesso total, pode gerenciar membros e configurações'
  },
  { 
    value: 'finance', 
    label: 'Financeiro', 
    icon: DollarSign,
    description: 'Acesso a relatórios financeiros, caixa e investidores'
  },
  { 
    value: 'operator', 
    label: 'Operador', 
    icon: Gamepad2,
    description: 'Acesso a projetos vinculados e operações de apostas'
  },
  { 
    value: 'viewer', 
    label: 'Visualizador', 
    icon: Eye,
    description: 'Apenas visualização, sem permissão de edição'
  },
];

export function InviteMemberDialog({ 
  open, 
  onOpenChange, 
  workspaceId,
  onMemberInvited 
}: InviteMemberDialogProps) {
  const { toast } = useToast();
  const { checkUserLimit, getPlanLabel } = usePlanEntitlements();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("viewer");
  const [loading, setLoading] = useState(false);
  const [limitCheck, setLimitCheck] = useState<{ allowed: boolean; current: number; limit: number; plan: string } | null>(null);
  const [checkingLimit, setCheckingLimit] = useState(false);

  // Check limit when dialog opens
  useEffect(() => {
    if (open && workspaceId) {
      setCheckingLimit(true);
      checkUserLimit().then(result => {
        setLimitCheck(result);
        setCheckingLimit(false);
      });
    }
  }, [open, workspaceId, checkUserLimit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check limit again before submitting
    const currentLimit = await checkUserLimit();
    if (!currentLimit.allowed) {
      toast({
        title: "Limite atingido",
        description: `Seu plano ${getPlanLabel()} permite até ${currentLimit.limit} usuário(s). Faça upgrade para adicionar mais membros.`,
        variant: "destructive",
      });
      return;
    }

    if (!email.trim() || !workspaceId) return;

    try {
      setLoading(true);

      // Usar a nova função RPC para criar convite
      const { data, error } = await supabase.rpc('create_workspace_invite', {
        _email: email.trim().toLowerCase(),
        _workspace_id: workspaceId,
        _role: role
      });

      if (error) throw error;
      
      const result = data as unknown as { 
        success: boolean; 
        error?: string; 
        already_member?: boolean;
        renewed?: boolean;
        token?: string;
      };

      if (!result.success) {
        if (result.already_member) {
          toast({
            title: "Usuário já é membro",
            description: "Este usuário já faz parte do workspace.",
            variant: "destructive",
          });
        } else {
          throw new Error(result.error || 'Erro ao criar convite');
        }
        return;
      }

      // Sucesso - convite criado ou renovado
      toast({
        title: result.renewed ? "Convite reenviado" : "Convite enviado",
        description: `Um convite foi enviado para ${email}. O acesso será liberado após o aceite.`,
      });

      setEmail("");
      setRole("viewer");
      onMemberInvited();
    } catch (error: any) {
      console.error("Error inviting member:", error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível enviar o convite. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Convidar Membro
          </DialogTitle>
          <DialogDescription>
            Envie um convite por email. O usuário receberá um link para aceitar e entrar no workspace.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Limit Warning */}
          {limitCheck && !limitCheck.allowed && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>
                  Limite atingido: {limitCheck.current}/{limitCheck.limit} usuários no plano {getPlanLabel()}.
                </span>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={() => onOpenChange(false)}
                  className="ml-2"
                >
                  <Zap className="h-3 w-3 mr-1" />
                  Ver planos
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email do usuário</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@exemplo.com"
              required
              disabled={loading || (limitCheck && !limitCheck.allowed)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Função</Label>
            <Select 
              value={role} 
              onValueChange={(v) => setRole(v as AppRole)} 
              disabled={loading || (limitCheck && !limitCheck.allowed)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma função" />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        <div className="flex flex-col">
                          <span>{option.label}</span>
                        </div>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {roleOptions.find(r => r.value === role)?.description}
            </p>
          </div>

          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={loading || !email.trim() || checkingLimit || (limitCheck && !limitCheck.allowed)}
            >
              {(loading || checkingLimit) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Convidar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
