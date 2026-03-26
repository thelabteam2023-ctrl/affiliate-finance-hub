import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Building2, Loader2 } from "lucide-react";
import { MoneyInput } from "@/components/ui/money-input";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierWorkspaceId: string;
  supplierNome: string;
  parentWorkspaceId: string;
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
}

export function SupplierBookmakerConfigDialog({ open, onOpenChange, supplierWorkspaceId, supplierNome, parentWorkspaceId }: Props) {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  // Fetch ALL bookmakers accessible to the parent workspace
  // This includes GLOBAL_REGULATED (visible to all) + GLOBAL_RESTRICTED (via bookmaker_workspace_access)
  const { data: allBookmakers = [], isLoading: loadingBookmakers } = useQuery({
    queryKey: ["bookmakers-catalogo-for-supplier-config", parentWorkspaceId],
    queryFn: async () => {
      // The authenticated user's RLS will correctly filter bookmakers_catalogo
      // based on their workspace access (GLOBAL_REGULATED + workspace-specific GLOBAL_RESTRICTED)
      const { data, error } = await supabase
        .from("bookmakers_catalogo")
        .select("id, nome, logo_url, status")
        .in("status", ["REGULAMENTADA", "NAO_REGULAMENTADA"])
        .order("nome");
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  // Fetch currently allowed bookmakers for this supplier (with valor_alocado)
  const { data: allowedData = [], isLoading } = useQuery({
    queryKey: ["supplier-allowed-bookmakers-full", supplierWorkspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_allowed_bookmakers")
        .select("bookmaker_catalogo_id, valor_alocado")
        .eq("supplier_workspace_id", supplierWorkspaceId);
      if (error) throw error;
      return (data || []) as { bookmaker_catalogo_id: string; valor_alocado: number | null }[];
    },
    enabled: open,
  });

  const allowedMap = new Map(allowedData.map(d => [d.bookmaker_catalogo_id, d.valor_alocado ?? 0]));
  const allowedIds = Array.from(allowedMap.keys());

  const totalAlocado = Array.from(allowedMap.values()).reduce((s, v) => s + Number(v || 0), 0);

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
      queryClient.invalidateQueries({ queryKey: ["supplier-allowed-bookmakers-full", supplierWorkspaceId] });
      queryClient.invalidateQueries({ queryKey: ["supplier-allowed-bookmakers", supplierWorkspaceId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateAlocacaoMutation = useMutation({
    mutationFn: async ({ bookmakerCatalogoId, valor }: { bookmakerCatalogoId: string; valor: number }) => {
      const { error } = await supabase
        .from("supplier_allowed_bookmakers")
        .update({ valor_alocado: valor })
        .eq("supplier_workspace_id", supplierWorkspaceId)
        .eq("bookmaker_catalogo_id", bookmakerCatalogoId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-allowed-bookmakers-full", supplierWorkspaceId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = allBookmakers.filter((b: any) => {
    if (!search) return true;
    return b.nome.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Casas Permitidas & Alocação
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Selecione quais casas <strong>{supplierNome}</strong> poderá usar e defina valores de alocação.
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

        {isLoading || loadingBookmakers ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-0.5">
              {filtered.map((bm: any) => {
                const isChecked = allowedIds.includes(bm.id);
                const currentValor = allowedMap.get(bm.id) ?? 0;
                return (
                  <div
                    key={bm.id}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors
                      ${isChecked ? "bg-primary/10" : "hover:bg-muted/50"}`}
                  >
                    <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => toggleMutation.mutate(bm.id)}
                        disabled={toggleMutation.isPending}
                      />
                      {bm.logo_url ? (
                        <img src={bm.logo_url} alt="" className="h-5 w-5 rounded object-contain shrink-0" />
                      ) : (
                        <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-sm font-medium truncate">{bm.nome}</span>
                    </label>
                    {isChecked && (
                      <MoneyInput
                        value={String(currentValor || "")}
                        onChange={(val) => {
                          const num = parseFloat(val) || 0;
                          updateAlocacaoMutation.mutate({ bookmakerCatalogoId: bm.id, valor: num });
                        }}
                        placeholder="R$ 0"
                        className="h-8 w-28 text-xs"
                        minDigits={3}
                      />
                    )}
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhuma casa encontrada</p>
              )}
            </div>
          </ScrollArea>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-3">
          <span>
            {allowedIds.length} casa{allowedIds.length !== 1 ? "s" : ""} selecionada{allowedIds.length !== 1 ? "s" : ""}
          </span>
          {totalAlocado > 0 && (
            <span className="font-semibold text-foreground">
              Total: {formatCurrency(totalAlocado)}
            </span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
