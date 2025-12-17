import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
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
import { Loader2, UserPlus, Shield, DollarSign, Gamepad2, Eye } from "lucide-react";

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
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("viewer");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim() || !workspaceId) return;

    try {
      setLoading(true);

      // First, check if user exists by email
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email.trim().toLowerCase())
        .single();

      if (profileError || !profile) {
        toast({
          title: "Usuário não encontrado",
          description: "O email informado não está cadastrado no sistema. O usuário precisa criar uma conta primeiro.",
          variant: "destructive",
        });
        return;
      }

      // Check if user is already a member
      const { data: existingMember } = await supabase
        .from('workspace_members')
        .select('id, is_active')
        .eq('workspace_id', workspaceId)
        .eq('user_id', profile.id)
        .single();

      if (existingMember) {
        if (existingMember.is_active) {
          toast({
            title: "Usuário já é membro",
            description: "Este usuário já faz parte do workspace.",
            variant: "destructive",
          });
          return;
        }

        // Reactivate inactive member
        const { error: updateError } = await supabase
          .from('workspace_members')
          .update({ is_active: true, role })
          .eq('id', existingMember.id);

        if (updateError) throw updateError;
      } else {
        // Add new member
        const { error: insertError } = await supabase
          .from('workspace_members')
          .insert({
            workspace_id: workspaceId,
            user_id: profile.id,
            role,
            is_active: true,
          });

        if (insertError) throw insertError;
      }

      toast({
        title: "Sucesso",
        description: `${email} foi adicionado ao workspace como ${roleOptions.find(r => r.value === role)?.label}.`,
      });

      setEmail("");
      setRole("viewer");
      onMemberInvited();
    } catch (error) {
      console.error("Error inviting member:", error);
      toast({
        title: "Erro",
        description: "Não foi possível adicionar o membro. Tente novamente.",
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
            Adicione um novo membro ao seu workspace. O usuário precisa ter uma conta no sistema.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email do usuário</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@exemplo.com"
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Função</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)} disabled={loading}>
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
            <Button type="submit" disabled={loading || !email.trim()}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Convidar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
