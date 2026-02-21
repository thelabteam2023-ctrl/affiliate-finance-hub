import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Globe, Lock, Building2, Users, AlertCircle } from "lucide-react";

interface BookmakerAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookmaker: {
    id: string;
    nome: string;
    visibility: string | null;
    logo_url: string | null;
  } | null;
  onSaved: () => void;
}

interface Workspace {
  id: string;
  name: string;
  owner_name: string;
  has_access: boolean;
}

type VisibilityType = "GLOBAL_REGULATED" | "GLOBAL_RESTRICTED" | "WORKSPACE_PRIVATE";

export default function BookmakerAccessDialog({ 
  open, 
  onOpenChange, 
  bookmaker,
  onSaved 
}: BookmakerAccessDialogProps) {
  const [visibility, setVisibility] = useState<VisibilityType>("GLOBAL_REGULATED");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaces, setSelectedWorkspaces] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open && bookmaker) {
      setVisibility((bookmaker.visibility as VisibilityType) || "GLOBAL_REGULATED");
      fetchWorkspaces();
    }
  }, [open, bookmaker]);

  const fetchWorkspaces = async () => {
    if (!bookmaker) return;
    
    setLoading(true);
    try {
      // Buscar todos os workspaces - query separada para evitar erro de relacionamento
      const { data: workspacesData, error: workspacesError } = await supabase
        .from("workspaces")
        .select("id, name")
        .order("name");

      if (workspacesError) throw workspacesError;

      // Buscar membros owners separadamente para evitar erro de FK
      const { data: membersData, error: membersError } = await supabase
        .from("workspace_members")
        .select("workspace_id, role, user_id")
        .eq("role", "owner");

      if (membersError) throw membersError;

      // Buscar profiles dos owners
      const ownerUserIds = membersData?.map(m => m.user_id).filter(Boolean) || [];
      let profilesMap: Record<string, string> = {};
      
      if (ownerUserIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", ownerUserIds);
        
        profilesData?.forEach(p => {
          profilesMap[p.id] = p.full_name || "Proprietário";
        });
      }

      // Buscar acessos existentes para este bookmaker
      const { data: accessData, error: accessError } = await supabase
        .from("bookmaker_workspace_access")
        .select("workspace_id")
        .eq("bookmaker_catalogo_id", bookmaker.id);

      if (accessError) throw accessError;

      const accessSet = new Set(accessData?.map(a => a.workspace_id) || []);

      // Mapear owners para workspaces
      const workspaceOwnerMap: Record<string, string> = {};
      membersData?.forEach(m => {
        if (m.workspace_id && m.user_id) {
          workspaceOwnerMap[m.workspace_id] = profilesMap[m.user_id] || "Proprietário";
        }
      });

      const formattedWorkspaces: Workspace[] = (workspacesData || []).map((ws: any) => ({
        id: ws.id,
        name: ws.name,
        owner_name: workspaceOwnerMap[ws.id] || "Proprietário",
        has_access: accessSet.has(ws.id),
      }));

      setWorkspaces(formattedWorkspaces);
      setSelectedWorkspaces(accessSet);
    } catch (error: any) {
      console.error("Erro ao carregar workspaces:", error);
      toast({
        title: "Erro ao carregar workspaces",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleWorkspaceToggle = (workspaceId: string) => {
    setSelectedWorkspaces(prev => {
      const newSet = new Set(prev);
      if (newSet.has(workspaceId)) {
        newSet.delete(workspaceId);
      } else {
        newSet.add(workspaceId);
      }
      return newSet;
    });
  };

  const handleSave = async () => {
    if (!bookmaker) return;

    setSaving(true);
    try {
      // Atualizar visibility do bookmaker
      const { error: updateError } = await supabase
        .from("bookmakers_catalogo")
        .update({ visibility })
        .eq("id", bookmaker.id);

      if (updateError) throw updateError;

      // Se for GLOBAL_RESTRICTED, gerenciar acessos
      if (visibility === "GLOBAL_RESTRICTED") {
        // Remover acessos antigos
        const { error: deleteError } = await supabase
          .from("bookmaker_workspace_access")
          .delete()
          .eq("bookmaker_catalogo_id", bookmaker.id);

        if (deleteError) throw deleteError;

        // Adicionar novos acessos
        if (selectedWorkspaces.size > 0) {
          const { data: { user } } = await supabase.auth.getUser();
          
          const accessRecords = Array.from(selectedWorkspaces).map(workspaceId => ({
            bookmaker_catalogo_id: bookmaker.id,
            workspace_id: workspaceId,
            granted_by: user?.id,
          }));

          const { error: insertError } = await supabase
            .from("bookmaker_workspace_access")
            .insert(accessRecords);

          if (insertError) throw insertError;
        }
      } else {
        // Se não for GLOBAL_RESTRICTED, remover todos os acessos (não são necessários)
        await supabase
          .from("bookmaker_workspace_access")
          .delete()
          .eq("bookmaker_catalogo_id", bookmaker.id);
      }

      toast({
        title: "Configuração salva",
        description: `Visibilidade de ${bookmaker.nome} atualizada com sucesso.`,
      });

      onSaved();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao salvar:", error);
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const getVisibilityIcon = (type: VisibilityType) => {
    switch (type) {
      case "GLOBAL_REGULATED":
        return <Globe className="h-4 w-4 text-emerald-500" />;
      case "GLOBAL_RESTRICTED":
        return <Users className="h-4 w-4 text-amber-500" />;
      case "WORKSPACE_PRIVATE":
        return <Lock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {bookmaker?.logo_url && (
              <img 
                src={bookmaker.logo_url} 
                alt="" 
                className="h-6 w-6 rounded object-contain logo-blend p-0.5"
              />
            )}
            Gerenciar Acesso
          </DialogTitle>
          <DialogDescription>
            Configure quem pode ver e usar {bookmaker?.nome}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Tipo de Visibilidade */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Visibilidade</Label>
            <RadioGroup
              value={visibility}
              onValueChange={(v) => setVisibility(v as VisibilityType)}
              className="space-y-2"
            >
              <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                <RadioGroupItem value="GLOBAL_REGULATED" id="global" />
                <Label htmlFor="global" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-emerald-500" />
                    <span className="font-medium">Global (Regulamentada)</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Visível para todos os usuários do sistema
                  </p>
                </Label>
              </div>

              <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                <RadioGroupItem value="GLOBAL_RESTRICTED" id="restricted" />
                <Label htmlFor="restricted" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-amber-500" />
                    <span className="font-medium">Restrita</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Visível apenas para workspaces selecionados
                  </p>
                </Label>
              </div>

              <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                <RadioGroupItem value="WORKSPACE_PRIVATE" id="private" />
                <Label htmlFor="private" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Privada</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Visível apenas para o workspace que criou
                  </p>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Lista de Workspaces (apenas para GLOBAL_RESTRICTED) */}
          {visibility === "GLOBAL_RESTRICTED" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Workspaces com Acesso</Label>
                <Badge variant="secondary" className="text-xs">
                  {selectedWorkspaces.size} selecionado(s)
                </Badge>
              </div>

              {loading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : workspaces.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <AlertCircle className="h-8 w-8 text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Nenhum workspace disponível
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[200px] border rounded-lg p-2">
                  <div className="space-y-1">
                    {workspaces.map((ws) => (
                      <div
                        key={ws.id}
                        className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors"
                      >
                        <Checkbox
                          id={ws.id}
                          checked={selectedWorkspaces.has(ws.id)}
                          onCheckedChange={() => handleWorkspaceToggle(ws.id)}
                        />
                        <label
                          htmlFor={ws.id}
                          className="flex-1 cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{ws.name}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {ws.owner_name}
                          </p>
                        </label>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}