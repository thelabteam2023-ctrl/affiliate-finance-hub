import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Database } from "@/integrations/supabase/types";
import { getRoleLabel } from "@/lib/roleLabels";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Loader2, 
  RefreshCw, 
  XCircle, 
  Mail, 
  Clock, 
  CheckCircle2,
  AlertCircle
} from "lucide-react";
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

type AppRole = Database["public"]["Enums"]["app_role"];

interface Invite {
  id: string;
  email: string;
  role: AppRole;
  status: string;
  expires_at: string;
  created_at: string;
  created_by_email: string | null;
  created_by_name: string | null;
}

interface PendingInvitesListProps {
  workspaceId: string;
}

export function PendingInvitesList({ workspaceId }: PendingInvitesListProps) {
  const { toast } = useToast();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [inviteToCancel, setInviteToCancel] = useState<string | null>(null);

  const fetchInvites = async () => {
    if (!workspaceId) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_workspace_invites', {
        _workspace_id: workspaceId
      });

      if (error) throw error;
      setInvites((data as Invite[]) || []);
    } catch (error) {
      console.error("Error fetching invites:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os convites.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvites();
  }, [workspaceId]);

  const handleResend = async (inviteId: string) => {
    try {
      setActionLoading(inviteId);
      
      const { data, error } = await supabase.rpc('resend_workspace_invite', {
        _invite_id: inviteId
      });

      if (error) throw error;
      
      const result = data as { success: boolean; error?: string };
      
      if (!result.success) {
        throw new Error(result.error || 'Erro ao reenviar convite');
      }

      toast({
        title: "Convite reenviado",
        description: "O convite foi renovado com sucesso.",
      });

      fetchInvites();
    } catch (error: any) {
      console.error("Error resending invite:", error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível reenviar o convite.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelConfirm = async () => {
    if (!inviteToCancel) return;

    try {
      setActionLoading(inviteToCancel);
      
      const { data, error } = await supabase.rpc('cancel_workspace_invite', {
        _invite_id: inviteToCancel
      });

      if (error) throw error;
      
      const result = data as { success: boolean; error?: string };
      
      if (!result.success) {
        throw new Error(result.error || 'Erro ao cancelar convite');
      }

      toast({
        title: "Convite cancelado",
        description: "O convite foi cancelado com sucesso.",
      });

      fetchInvites();
    } catch (error: any) {
      console.error("Error canceling invite:", error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível cancelar o convite.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
      setCancelDialogOpen(false);
      setInviteToCancel(null);
    }
  };

  const getStatusBadge = (status: string, expiresAt: string) => {
    const isExpired = status === 'expired' || new Date(expiresAt) < new Date();
    
    if (isExpired || status === 'expired') {
      return (
        <Badge variant="secondary" className="bg-amber-500/10 text-amber-600">
          <AlertCircle className="h-3 w-3 mr-1" />
          Expirado
        </Badge>
      );
    }
    
    switch (status) {
      case 'pending':
        return (
          <Badge variant="secondary" className="bg-blue-500/10 text-blue-600">
            <Clock className="h-3 w-3 mr-1" />
            Pendente
          </Badge>
        );
      case 'accepted':
        return (
          <Badge variant="secondary" className="bg-green-500/10 text-green-600">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Aceito
          </Badge>
        );
      case 'canceled':
        return (
          <Badge variant="secondary" className="bg-gray-500/10 text-gray-600">
            <XCircle className="h-3 w-3 mr-1" />
            Cancelado
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const pendingInvites = invites.filter(
    i => i.status === 'pending' && new Date(i.expires_at) > new Date()
  );
  const otherInvites = invites.filter(
    i => i.status !== 'pending' || new Date(i.expires_at) <= new Date()
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (invites.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>Nenhum convite enviado ainda.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Convites Pendentes */}
      {pendingInvites.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-500" />
            Convites Pendentes ({pendingInvites.length})
          </h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Função</TableHead>
                <TableHead>Expira em</TableHead>
                <TableHead>Convidado por</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingInvites.map((invite) => (
                <TableRow key={invite.id}>
                  <TableCell className="font-medium">{invite.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{getRoleLabel(invite.role)}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDistanceToNow(new Date(invite.expires_at), {
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {invite.created_by_name || invite.created_by_email || "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleResend(invite.id)}
                        disabled={actionLoading === invite.id}
                      >
                        {actionLoading === invite.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        <span className="ml-1 hidden sm:inline">Reenviar</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          setInviteToCancel(invite.id);
                          setCancelDialogOpen(true);
                        }}
                        disabled={actionLoading === invite.id}
                      >
                        <XCircle className="h-4 w-4" />
                        <span className="ml-1 hidden sm:inline">Cancelar</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Histórico de Convites */}
      {otherInvites.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-3 text-muted-foreground">
            Histórico de Convites ({otherInvites.length})
          </h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Função</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {otherInvites.slice(0, 10).map((invite) => (
                <TableRow key={invite.id} className="opacity-70">
                  <TableCell className="font-medium">{invite.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{getRoleLabel(invite.role)}</Badge>
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(invite.status, invite.expires_at)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDistanceToNow(new Date(invite.created_at), {
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Cancel Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar convite?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O usuário não poderá mais usar este link de convite.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancelar Convite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
