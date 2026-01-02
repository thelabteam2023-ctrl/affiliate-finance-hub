import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, Check, X, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ReceivedInvite {
  id: string;
  workspace_id: string;
  workspace_name: string;
  workspace_slug: string;
  role: string;
  token: string;
  expires_at: string;
}

interface ReceivedInvitesListProps {
  invites: ReceivedInvite[];
  onAccept: (token: string) => Promise<void>;
  onDecline: (inviteId: string) => Promise<void>;
  loading?: boolean;
}

const roleLabels: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  finance: "Financeiro",
  operator: "Operador",
  viewer: "Visualizador",
};

export function ReceivedInvitesList({ 
  invites, 
  onAccept, 
  onDecline, 
  loading = false 
}: ReceivedInvitesListProps) {
  const { toast } = useToast();
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleAccept = async (invite: ReceivedInvite) => {
    setProcessingId(invite.id);
    try {
      await onAccept(invite.token);
      toast({
        title: "Convite aceito!",
        description: `Você agora faz parte do workspace "${invite.workspace_name}".`,
      });
    } catch (error) {
      console.error("Error accepting invite:", error);
      toast({
        title: "Erro",
        description: "Não foi possível aceitar o convite.",
        variant: "destructive",
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleDecline = async (invite: ReceivedInvite) => {
    setProcessingId(invite.id);
    try {
      await onDecline(invite.id);
      toast({
        title: "Convite recusado",
        description: "O convite foi recusado.",
      });
    } catch (error) {
      console.error("Error declining invite:", error);
      toast({
        title: "Erro",
        description: "Não foi possível recusar o convite.",
        variant: "destructive",
      });
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (invites.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Mail className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="text-muted-foreground">Nenhum convite recebido.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {invites.map((invite) => {
        const isExpired = new Date(invite.expires_at) < new Date();
        const isProcessing = processingId === invite.id;

        return (
          <div
            key={invite.id}
            className="flex items-center justify-between p-4 rounded-lg border bg-card"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">{invite.workspace_name}</p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="outline" className="text-xs">
                    {roleLabels[invite.role] || invite.role}
                  </Badge>
                  <span>•</span>
                  <span>
                    Expira em {format(new Date(invite.expires_at), "dd/MM/yyyy", { locale: ptBR })}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isExpired ? (
                <Badge variant="destructive">Expirado</Badge>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDecline(invite)}
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <X className="h-4 w-4 mr-1" />
                        Recusar
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleAccept(invite)}
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-1" />
                        Aceitar
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
