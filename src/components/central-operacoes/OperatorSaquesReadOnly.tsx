/**
 * Módulo read-only para operadores na Central de Operações.
 * Mostra apenas bookmakers dos projetos do operador que estão em processo de saque.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Clock, Banknote } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface SaqueBookmaker {
  id: string;
  nome: string;
  saldo_atual: number;
  moeda: string;
  aguardando_saque_at: string | null;
  projeto_nome: string | null;
  parceiro_nome: string | null;
  logo_url: string | null;
}

export function OperatorSaquesReadOnly() {
  const { user, workspaceId } = useAuth();

  const { data: bookmakers, isLoading } = useQuery({
    queryKey: ["operator-saques-readonly", workspaceId, user?.id],
    queryFn: async (): Promise<SaqueBookmaker[]> => {
      if (!user?.id || !workspaceId) return [];

      // 1. Get operador_id
      const { data: opData } = await supabase
        .from("operadores")
        .select("id")
        .eq("user_id", user.id)
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (!opData) return [];

      // 2. Get operator's active projects
      const { data: vinculos } = await supabase
        .from("operador_projetos")
        .select("projeto_id")
        .eq("operador_id", opData.id)
        .eq("status", "ATIVO");

      const projetoIds = (vinculos || []).map((v: any) => v.projeto_id);
      if (projetoIds.length === 0) return [];

      // 3. Get bookmakers in saque status from those projects
      const { data, error } = await supabase
        .from("bookmakers")
        .select(`
          id, nome, saldo_atual, moeda, aguardando_saque_at,
          bookmakers_catalogo:bookmaker_catalogo_id (logo_url),
          projetos:projeto_id (nome),
          parceiro:parceiros!bookmakers_parceiro_id_fkey (nome)
        `)
        .eq("workspace_id", workspaceId)
        .in("projeto_id", projetoIds)
        .eq("status", "aguardando_saque")
        .order("aguardando_saque_at", { ascending: true });

      if (error) throw error;

      return (data ?? []).map((b: any) => ({
        id: b.id,
        nome: b.nome,
        saldo_atual: b.saldo_atual ?? 0,
        moeda: b.moeda ?? "BRL",
        aguardando_saque_at: b.aguardando_saque_at,
        projeto_nome: b.projetos?.nome ?? null,
        parceiro_nome: b.parceiro?.nome ?? null,
        logo_url: b.bookmakers_catalogo?.logo_url ?? null,
      }));
    },
    enabled: !!user?.id && !!workspaceId,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const items = bookmakers ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Contas aguardando saque
        </h3>
        {items.length > 0 && (
          <Badge variant="secondary" className="text-xs">{items.length}</Badge>
        )}
      </div>

      {items.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <Banknote className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhuma conta aguardando saque nos seus projetos</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((bk) => {
            const diasAguardando = bk.aguardando_saque_at
              ? Math.floor((Date.now() - new Date(bk.aguardando_saque_at).getTime()) / 86400000)
              : null;

            return (
              <Card key={bk.id} className="border-border/50">
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-center gap-2">
                    {bk.logo_url && (
                      <img src={bk.logo_url} alt="" className="h-6 w-6 rounded object-contain flex-shrink-0" />
                    )}
                    <CardTitle className="text-sm font-semibold uppercase tracking-wide truncate">
                      {bk.nome}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2">
                  {bk.parceiro_nome && (
                    <p className="text-xs text-muted-foreground truncate">{bk.parceiro_nome}</p>
                  )}
                  {bk.projeto_nome && (
                    <p className="text-[11px] text-muted-foreground/70 truncate">Projeto: {bk.projeto_nome}</p>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-sm font-mono font-semibold">
                      {formatCurrency(bk.saldo_atual, bk.moeda)}
                    </span>
                    {diasAguardando !== null && (
                      <Badge
                        variant="outline"
                        className={
                          diasAguardando >= 7
                            ? "text-destructive border-destructive/30 text-[10px]"
                            : diasAguardando >= 3
                            ? "text-amber-500 border-amber-500/30 text-[10px]"
                            : "text-muted-foreground text-[10px]"
                        }
                      >
                        <Clock className="h-3 w-3 mr-1" />
                        {diasAguardando}d
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
