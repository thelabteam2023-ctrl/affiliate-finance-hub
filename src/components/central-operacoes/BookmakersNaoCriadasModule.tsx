/**
 * Módulo "Bookmakers Não Criadas"
 *
 * Dado uma bookmaker do catálogo, lista todos os parceiros que NÃO possuem
 * conta (instância) nessa casa. Permite abrir o diálogo de criação com
 * parceiro + bookmaker pré-selecionados.
 */

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceBookmakers } from "@/hooks/useWorkspaceBookmakers";
import { getFirstLastName, cn } from "@/lib/utils";
import { Search, UserPlus, Building2, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import BookmakerDialog from "@/components/bookmakers/BookmakerDialog";
import type { VinculoCriadoContext } from "@/components/bookmakers/BookmakerDialog";

interface ParceiroSemConta {
  id: string;
  nome: string;
  cpf: string;
  status: string;
}

export default function BookmakersNaoCriadasModule() {
  const { workspaceId } = useAuth();
  const [selectedCatalogoId, setSelectedCatalogoId] = useState<string>("");
  const [search, setSearch] = useState("");

  // Dialog state for creating a new bookmaker account
  const [criarDialog, setCriarDialog] = useState<{
    open: boolean;
    parceiroId: string;
    catalogoId: string;
  }>({ open: false, parceiroId: "", catalogoId: "" });

  // Fetch catalog bookmakers for the dropdown
  const { data: catalogoBookmakers, isLoading: loadingCatalogo } = useWorkspaceBookmakers();

  // Fetch parceiros that do NOT have an account for the selected bookmaker
  const { data: parceirosResult, isLoading: loadingParceiros, refetch } = useQuery({
    queryKey: ["parceiros-sem-bookmaker", workspaceId, selectedCatalogoId],
    queryFn: async (): Promise<ParceiroSemConta[]> => {
      if (!workspaceId || !selectedCatalogoId) return [];

      // Get all parceiros of this workspace
      const { data: allParceiros, error: pErr } = await supabase
        .from("parceiros")
        .select("id, nome, cpf, status")
        .eq("workspace_id", workspaceId)
        .eq("status", "ativo")
        .order("nome");

      if (pErr) throw pErr;

      // Get parceiro_ids that DO have this bookmaker
      const { data: existingAccounts, error: aErr } = await supabase
        .from("bookmakers")
        .select("parceiro_id")
        .eq("workspace_id", workspaceId)
        .eq("bookmaker_catalogo_id", selectedCatalogoId)
        .not("parceiro_id", "is", null);

      if (aErr) throw aErr;

      const withAccount = new Set(
        (existingAccounts ?? []).map((a: any) => a.parceiro_id)
      );

      return (allParceiros ?? []).filter(
        (p: any) => !withAccount.has(p.id)
      );
    },
    enabled: !!workspaceId && !!selectedCatalogoId,
    staleTime: 60_000,
  });

  const parceiros = parceirosResult ?? [];

  // Filter by search
  const filtered = useMemo(() => {
    if (!search.trim()) return parceiros;
    const q = search.toLowerCase();
    return parceiros.filter(
      (p) =>
        p.nome.toLowerCase().includes(q) ||
        p.cpf?.includes(q)
    );
  }, [parceiros, search]);

  const selectedBookmaker = catalogoBookmakers?.find(
    (b) => b.id === selectedCatalogoId
  );

  const handleCriarConta = (parceiroId: string) => {
    setCriarDialog({
      open: true,
      parceiroId,
      catalogoId: selectedCatalogoId,
    });
  };

  const handleDialogClose = () => {
    setCriarDialog({ open: false, parceiroId: "", catalogoId: "" });
  };

  const handleCreated = (_ctx: VinculoCriadoContext) => {
    handleDialogClose();
    refetch();
  };

  return (
    <div className="space-y-4">
      {/* Header: Bookmaker selector */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium uppercase tracking-wide">
          <Building2 className="h-4 w-4" />
          Bookmaker
        </div>
        <Select value={selectedCatalogoId} onValueChange={setSelectedCatalogoId}>
          <SelectTrigger className="w-[280px]">
            <SelectValue placeholder="Selecione uma bookmaker..." />
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            {loadingCatalogo ? (
              <div className="p-2">
                <Skeleton className="h-6 w-full" />
              </div>
            ) : (
              (catalogoBookmakers ?? []).map((bk) => (
                <SelectItem key={bk.id} value={bk.id}>
                  <div className="flex items-center gap-2">
                    {bk.logo_url && (
                      <img
                        src={bk.logo_url}
                        alt=""
                        className="h-5 w-5 rounded object-contain"
                      />
                    )}
                    {bk.nome}
                  </div>
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>

        {selectedCatalogoId && !loadingParceiros && (
          <Badge variant="outline" className="text-xs font-mono gap-1">
            <Users className="h-3 w-3" />
            {filtered.length} / {parceiros.length}
          </Badge>
        )}
      </div>

      {/* No bookmaker selected */}
      {!selectedCatalogoId && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Building2 className="h-10 w-10 opacity-30" />
          <p className="text-sm">Selecione uma bookmaker para ver parceiros sem conta</p>
        </div>
      )}

      {/* Loading */}
      {selectedCatalogoId && loadingParceiros && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {/* Results */}
      {selectedCatalogoId && !loadingParceiros && (
        <>
          {parceiros.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <Users className="h-10 w-10 opacity-30" />
              <p className="text-sm">
                Todos os parceiros já possuem conta na{" "}
                <span className="font-semibold text-foreground">
                  {selectedBookmaker?.nome}
                </span>
              </p>
            </div>
          ) : (
            <>
              {/* Search */}
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar parceiro..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Table */}
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground uppercase text-xs tracking-wide">
                        Parceiro
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground uppercase text-xs tracking-wide">
                        CPF
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground uppercase text-xs tracking-wide w-[140px]">
                        Ação
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <tr
                        key={p.id}
                        className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                      >
                        <td className="px-4 py-3 font-medium">
                          {getFirstLastName(p.nome)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                          {p.cpf}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-xs"
                            onClick={() => handleCriarConta(p.id)}
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                            Criar conta
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-4 py-8 text-center text-muted-foreground"
                        >
                          Nenhum parceiro encontrado para a busca
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* BookmakerDialog for creating account */}
      <BookmakerDialog
        open={criarDialog.open}
        onClose={handleDialogClose}
        onCreated={handleCreated}
        bookmaker={null}
        defaultParceiroId={criarDialog.parceiroId}
        defaultBookmakerId={criarDialog.catalogoId}
        lockParceiro
        lockBookmaker
      />
    </div>
  );
}
