import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Share2,
  Copy,
  Trash2,
  ExternalLink,
  Eye,
  Clock,
  Plus,
} from "lucide-react";

interface ShareLinkDialogProps {
  projetoId: string;
  projetoNome: string;
}

function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(36).padStart(2, "0"))
    .join("")
    .substring(0, 48);
}

function getPublicOrigin(): string {
  const origin = window.location.origin;
  // Preview domains (preview--xxx.lovable.app) must use the published domain
  if (origin.includes("preview--")) {
    return origin.replace(/preview--/, "");
  }
  return origin;
}

export function ShareLinkDialog({ projetoId, projetoNome }: ShareLinkDialogProps) {
  const { user } = useAuth();
  const { workspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [expiry, setExpiry] = useState("never");

  const { data: links = [], isLoading } = useQuery({
    queryKey: ["shared-links", projetoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projeto_shared_links")
        .select("*")
        .eq("projeto_id", projetoId)
        .is("revoked_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const createLink = useMutation({
    mutationFn: async () => {
      const token = generateToken();
      let expiresAt: string | null = null;

      if (expiry !== "never") {
        const days = parseInt(expiry);
        const d = new Date();
        d.setDate(d.getDate() + days);
        expiresAt = d.toISOString();
      }

      const { error } = await supabase.from("projeto_shared_links").insert({
        projeto_id: projetoId,
        token,
        label: label || null,
        created_by: user!.id,
        expires_at: expiresAt,
        workspace_id: workspaceId!,
      });
      if (error) throw error;
      return token;
    },
    onSuccess: (token) => {
      const url = `${getPublicOrigin()}/shared/${token}`;
      navigator.clipboard.writeText(url);
      toast.success("Link criado e copiado!");
      setLabel("");
      setExpiry("never");
      queryClient.invalidateQueries({ queryKey: ["shared-links", projetoId] });
    },
    onError: () => toast.error("Erro ao criar link"),
  });

  const revokeLink = useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase
        .from("projeto_shared_links")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", linkId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Link revogado");
      queryClient.invalidateQueries({ queryKey: ["shared-links", projetoId] });
    },
  });

  const copyLink = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/shared/${token}`);
    toast.success("Link copiado!");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="h-7 w-7">
          <Share2 className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4" />
            Compartilhar {projetoNome}
          </DialogTitle>
        </DialogHeader>

        {/* Create new link */}
        <div className="space-y-3 border rounded-lg p-4">
          <h4 className="text-sm font-medium flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Novo link
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Rótulo (opcional)</Label>
              <Input
                placeholder="Ex: Link do investidor"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Expiração</Label>
              <Select value={expiry} onValueChange={setExpiry}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Sem expiração</SelectItem>
                  <SelectItem value="1">1 dia</SelectItem>
                  <SelectItem value="7">7 dias</SelectItem>
                  <SelectItem value="30">30 dias</SelectItem>
                  <SelectItem value="90">90 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => createLink.mutate()}
            disabled={createLink.isPending}
            className="w-full"
          >
            {createLink.isPending ? "Gerando..." : "Gerar link"}
          </Button>
        </div>

        {/* Existing links */}
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          <h4 className="text-sm font-medium text-muted-foreground">
            Links ativos ({links.length})
          </h4>
          {links.map((link: any) => {
            const isExpired = link.expires_at && new Date(link.expires_at) < new Date();
            return (
              <div
                key={link.id}
                className="flex items-center justify-between border rounded-lg p-3 text-sm"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">
                      {link.label || "Link sem rótulo"}
                    </span>
                    {isExpired && (
                      <Badge variant="destructive" className="text-[10px] h-4">
                        Expirado
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      {link.view_count} views
                    </span>
                    {link.expires_at && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(link.expires_at).toLocaleDateString("pt-BR")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => copyLink(link.token)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() =>
                      window.open(`/shared/${link.token}`, "_blank")
                    }
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => revokeLink.mutate(link.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
          {links.length === 0 && !isLoading && (
            <p className="text-xs text-muted-foreground text-center py-4">
              Nenhum link ativo
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
