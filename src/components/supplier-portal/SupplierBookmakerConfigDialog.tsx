import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierWorkspaceId: string;
  supplierNome: string;
}

export function SupplierBookmakerConfigDialog({ open, onOpenChange, supplierWorkspaceId, supplierNome }: Props) {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  // Fetch all active bookmakers from catalog
  const { data: allBookmakers = [] } = useQuery({
    queryKey: ["bookmakers-catalogo-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookmakers_catalogo")
        .select("id, nome, logo_url")
        .in("status", ["REGULAMENTADA", "NAO_REGULAMENTADA"])
        .order("nome");
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  // Fetch currently allowed bookmakers for this supplier
  const { data: allowedIds = [], isLoading } = useQuery({
    queryKey: ["supplier-allowed-bookmakers", supplierWorkspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_allowed_bookmakers")
        .select("bookmaker_catalogo_id")
        .eq("supplier_workspace_id", supplierWorkspaceId);
      if (error) throw error;
      return (data || []).map((d: any) => d.bookmaker_catalogo_id);
    },
    enabled: open,
  });

  const toggleMutation = useMutation({
    mutationFn: async (bookmakerCatalogoId: string) => {
      const isCurrentlyAllowed = allowedIds.includes(bookmakerCatalogoId);

      if (isCurrentlyAllowed) {
        const { error } = await supabase
          .from("supplier_allowed_bookmakers")
          .delete()
          .eq("supplier_workspace_id", supplierWorkspaceId)
          .eq("bookmaker_catalogo_id", bookmakerCatalogoId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("supplier_allowed_bookmakers")
          .insert({
            supplier_workspace_id: supplierWorkspaceId,
            bookmaker_catalogo_id: bookmakerCatalogoId,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-allowed-bookmakers", supplierWorkspaceId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = allBookmakers.filter((b: any) => {
    if (!search) return true;
    return b.nome.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Casas Permitidas
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Selecione quais casas <strong>{supplierNome}</strong> poderá usar para criar contas.
          </p>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar casa..."
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-0.5">
              {filtered.map((bm: any) => {
                const isChecked = allowedIds.includes(bm.id);
                return (
                  <label
                    key={bm.id}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition-colors
                      ${isChecked ? "bg-primary/10" : "hover:bg-muted/50"}`}
                  >
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => toggleMutation.mutate(bm.id)}
                      disabled={toggleMutation.isPending}
                    />
                    {bm.logo_url ? (
                      <img src={bm.logo_url} alt="" className="h-5 w-5 rounded object-contain" />
                    ) : (
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="text-sm font-medium">{bm.nome}</span>
                  </label>
                );
              })}
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhuma casa encontrada</p>
              )}
            </div>
          </ScrollArea>
        )}

        <p className="text-xs text-muted-foreground text-center">
          {allowedIds.length} casa{allowedIds.length !== 1 ? "s" : ""} selecionada{allowedIds.length !== 1 ? "s" : ""}
        </p>
      </DialogContent>
    </Dialog>
  );
}
