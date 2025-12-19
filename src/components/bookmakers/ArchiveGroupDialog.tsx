import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Archive, 
  AlertTriangle, 
  Building2, 
  FolderOpen,
  CheckCircle2,
  XCircle,
  Loader2,
  Shield
} from "lucide-react";
import { AccessGroup } from "@/hooks/useAccessGroups";

interface ArchiveImpact {
  group_id: string;
  total_workspaces: number;
  total_bookmakers: number;
  workspaces_using: Array<{
    workspace_id: string;
    workspace_name: string;
    owner_email: string | null;
    owner_public_id: string | null;
    bookmakers_in_use: number;
  }>;
  workspaces_not_using: Array<{
    workspace_id: string;
    workspace_name: string;
    owner_email: string | null;
    owner_public_id: string | null;
    bookmakers_in_use: number;
  }>;
  workspaces_using_count: number;
  workspaces_not_using_count: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: AccessGroup;
  onArchived: () => void;
}

export default function ArchiveGroupDialog({ open, onOpenChange, group, onArchived }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [impact, setImpact] = useState<ArchiveImpact | null>(null);
  const [convertToDirectAccess, setConvertToDirectAccess] = useState(true);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open && group) {
      loadImpact();
    } else {
      setImpact(null);
      setReason("");
      setConvertToDirectAccess(true);
    }
  }, [open, group]);

  const loadImpact = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc("admin_calculate_group_archive_impact", {
        p_group_id: group.id,
      });

      if (error) throw error;
      setImpact(data as unknown as ArchiveImpact);
    } catch (error: any) {
      toast({
        title: "Erro ao calcular impacto",
        description: error.message,
        variant: "destructive",
      });
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const handleArchive = async () => {
    try {
      setArchiving(true);
      const { data, error } = await supabase.rpc("admin_archive_group", {
        p_group_id: group.id,
        p_convert_to_direct_access: convertToDirectAccess,
        p_reason: reason.trim() || null,
      });

      if (error) throw error;

      const result = data as {
        success: boolean;
        workspaces_affected: number;
        direct_access_created: number;
      };

      toast({
        title: "Grupo arquivado",
        description: convertToDirectAccess && result.direct_access_created > 0
          ? `${result.direct_access_created} acessos diretos criados para proteger workspaces ativos.`
          : `${result.workspaces_affected} workspaces afetados.`,
      });

      onArchived();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Erro ao arquivar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setArchiving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5" />
            Arquivar Grupo: {group.name}
          </DialogTitle>
          <DialogDescription>
            Revise o impacto antes de arquivar este grupo de liberação.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : impact ? (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-muted/50 border">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Building2 className="h-4 w-4" />
                  Workspaces vinculados
                </div>
                <div className="text-2xl font-semibold">{impact.total_workspaces}</div>
              </div>
              <div className="p-4 rounded-lg bg-muted/50 border">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <FolderOpen className="h-4 w-4" />
                  Bookmakers liberadas
                </div>
                <div className="text-2xl font-semibold">{impact.total_bookmakers}</div>
              </div>
            </div>

            {/* Impact Details */}
            {impact.workspaces_using_count > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="font-medium">
                    {impact.workspaces_using_count} workspace(s) já usam bookmakers deste grupo
                  </span>
                </div>
                <ScrollArea className="h-32 rounded-md border p-3">
                  <div className="space-y-2">
                    {impact.workspaces_using.map((ws) => (
                      <div key={ws.workspace_id} className="flex items-center justify-between text-sm">
                        <div>
                          <span className="font-medium">{ws.workspace_name}</span>
                          <span className="text-muted-foreground ml-2">
                            ({ws.owner_email || ws.owner_public_id || "Sem owner"})
                          </span>
                        </div>
                        <Badge variant="secondary">{ws.bookmakers_in_use} em uso</Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                <p className="text-sm text-muted-foreground">
                  Estes workspaces receberão acesso direto às bookmakers que já utilizam.
                </p>
              </div>
            )}

            {impact.workspaces_not_using_count > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-amber-500" />
                  <span className="font-medium">
                    {impact.workspaces_not_using_count} workspace(s) perderão acesso
                  </span>
                </div>
                <ScrollArea className="h-32 rounded-md border p-3">
                  <div className="space-y-2">
                    {impact.workspaces_not_using.map((ws) => (
                      <div key={ws.workspace_id} className="text-sm">
                        <span className="font-medium">{ws.workspace_name}</span>
                        <span className="text-muted-foreground ml-2">
                          ({ws.owner_email || ws.owner_public_id || "Sem owner"})
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                <p className="text-sm text-muted-foreground">
                  Estes workspaces não criaram bookmakers com as casas deste grupo, então perderão acesso.
                </p>
              </div>
            )}

            <Separator />

            {/* Protection Option */}
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-lg border bg-green-500/5 border-green-500/20">
                <Shield className="h-5 w-5 text-green-500 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="convert-access"
                      checked={convertToDirectAccess}
                      onCheckedChange={(checked) => setConvertToDirectAccess(checked === true)}
                    />
                    <label htmlFor="convert-access" className="font-medium cursor-pointer">
                      Converter para acesso direto (recomendado)
                    </label>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 ml-6">
                    Workspaces que já usam bookmakers deste grupo receberão acesso direto automático,
                    evitando que fiquem sem acesso às casas que já estão utilizando.
                  </p>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Motivo do arquivamento (opcional)</label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex: Grupo substituído por outro, reorganização de acessos..."
                  rows={2}
                  className="mt-1"
                />
              </div>
            </div>

            {/* Warning */}
            {!convertToDirectAccess && impact.workspaces_using_count > 0 && (
              <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-500/50 bg-amber-500/10">
                <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-500">Atenção</p>
                  <p className="text-sm text-muted-foreground">
                    Sem a conversão para acesso direto, {impact.workspaces_using_count} workspace(s) 
                    que já usam bookmakers deste grupo perderão acesso às novas operações com essas casas.
                    Os dados históricos serão mantidos.
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={archiving}>
            Cancelar
          </Button>
          <Button 
            onClick={handleArchive} 
            disabled={loading || archiving}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {archiving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Arquivando...
              </>
            ) : (
              <>
                <Archive className="mr-2 h-4 w-4" />
                Arquivar Grupo
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}