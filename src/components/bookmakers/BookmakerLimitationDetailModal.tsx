import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Building2, TrendingUp, TrendingDown, Minus, Loader2 } from "lucide-react";
import { format } from "date-fns";
import {
  LIMITATION_TYPE_LABELS,
  BUCKET_LABELS,
  type LimitationType,
  type LimitationBucket,
} from "@/hooks/useLimitationEvents";

interface BookmakerLimitationDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookmakerCatalogoId: string;
  bookmakerNome: string;
  logoUrl: string | null;
}

interface VinculoDetail {
  bookmaker_id: string;
  bookmaker_nome: string;
  projeto_nome: string;
  projeto_id: string;
  status: string;
  total_bets: number;
  total_pl: number;
  total_volume: number;
  limitation_type: LimitationType | null;
  limitation_bucket: LimitationBucket | null;
  limitation_date: string | null;
}

export function BookmakerLimitationDetailModal({
  open,
  onOpenChange,
  bookmakerCatalogoId,
  bookmakerNome,
  logoUrl,
}: BookmakerLimitationDetailModalProps) {
  const { workspaceId } = useWorkspace();

  const { data: vinculos, isLoading } = useQuery({
    queryKey: ["bookmaker-limitation-detail", bookmakerCatalogoId, workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];

      // Get all bookmakers (vínculos) for this catalogo in the workspace
      const { data: bookmakers, error: bErr } = await supabase
        .from("bookmakers")
        .select("id, nome, projeto_id, status, projetos(nome)")
        .eq("bookmaker_catalogo_id", bookmakerCatalogoId)
        .eq("workspace_id", workspaceId);

      if (bErr) throw bErr;
      if (!bookmakers || bookmakers.length === 0) return [];

      const bookmakerIds = bookmakers.map((b: any) => b.id);

      // Fetch bets stats and limitation events in parallel
      const [betsResult, limitationsResult] = await Promise.all([
        supabase
          .from("apostas_unificada")
          .select("bookmaker_id, stake, lucro_prejuizo")
          .in("bookmaker_id", bookmakerIds)
          .eq("workspace_id", workspaceId)
          .not("resultado", "is", null),
        supabase
          .from("limitation_events")
          .select("bookmaker_id, limitation_type, limitation_bucket, event_timestamp")
          .in("bookmaker_id", bookmakerIds)
          .eq("workspace_id", workspaceId)
          .order("event_timestamp", { ascending: false }),
      ]);

      // Aggregate bets per bookmaker
      const betsMap = new Map<string, { count: number; pl: number; volume: number }>();
      if (!betsResult.error && betsResult.data) {
        for (const bet of betsResult.data) {
          const key = bet.bookmaker_id!;
          const existing = betsMap.get(key) || { count: 0, pl: 0, volume: 0 };
          existing.count++;
          existing.pl += (bet.lucro_prejuizo as number) || 0;
          existing.volume += Math.abs((bet.stake as number) || 0);
          betsMap.set(key, existing);
        }
      }

      // Latest limitation per bookmaker
      const limitMap = new Map<string, { type: LimitationType; bucket: LimitationBucket; date: string }>();
      if (!limitationsResult.error && limitationsResult.data) {
        for (const le of limitationsResult.data) {
          if (!limitMap.has(le.bookmaker_id)) {
            limitMap.set(le.bookmaker_id, {
              type: le.limitation_type as LimitationType,
              bucket: le.limitation_bucket as LimitationBucket,
              date: le.event_timestamp,
            });
          }
        }
      }

      return bookmakers.map((b: any): VinculoDetail => {
        const stats = betsMap.get(b.id) || { count: 0, pl: 0, volume: 0 };
        const lim = limitMap.get(b.id);
        return {
          bookmaker_id: b.id,
          bookmaker_nome: b.nome,
          projeto_nome: (b.projetos as any)?.nome || "—",
          projeto_id: b.projeto_id,
          status: b.status,
          total_bets: stats.count,
          total_pl: stats.pl,
          total_volume: stats.volume,
          limitation_type: lim?.type || null,
          limitation_bucket: lim?.bucket || null,
          limitation_date: lim?.date || null,
        };
      });
    },
    enabled: open && !!workspaceId && !!bookmakerCatalogoId,
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
    }).format(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              {logoUrl ? <AvatarImage src={logoUrl} /> : null}
              <AvatarFallback>
                <Building2 className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
            <span>{bookmakerNome} — Histórico de Vínculos</span>
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !vinculos || vinculos.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            Nenhum vínculo encontrado para esta bookmaker.
          </div>
        ) : (
          <div className="rounded-md border border-border/50 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vínculo / Projeto</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Apostas</TableHead>
                  <TableHead className="text-right">Volume</TableHead>
                  <TableHead className="text-right">Lucro/Prejuízo</TableHead>
                  <TableHead className="text-center">Limitação</TableHead>
                  <TableHead className="text-right">Data Lim.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vinculos.map((v) => {
                  const PlIcon =
                    v.total_pl > 0 ? TrendingUp : v.total_pl < 0 ? TrendingDown : Minus;
                  const plColor =
                    v.total_pl > 0
                      ? "text-emerald-500"
                      : v.total_pl < 0
                      ? "text-red-500"
                      : "text-muted-foreground";

                  return (
                    <TableRow key={v.bookmaker_id}>
                      <TableCell>
                        <div className="space-y-0.5">
                          <div className="font-medium text-sm">{v.bookmaker_nome}</div>
                          <div className="text-xs text-muted-foreground">{v.projeto_nome}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="outline"
                          className={`text-xs border-transparent ${
                            v.status === "limitada"
                              ? "bg-destructive/10 text-destructive"
                              : v.status === "ativa"
                              ? "bg-emerald-500/10 text-emerald-500"
                              : "bg-muted/50 text-muted-foreground"
                          }`}
                        >
                          {v.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center font-medium text-sm">
                        {v.total_bets}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {formatCurrency(v.total_volume)}
                      </TableCell>
                      <TableCell className={`text-right text-sm font-medium ${plColor}`}>
                        <div className="flex items-center justify-end gap-1">
                          <PlIcon className="h-3 w-3" />
                          {formatCurrency(v.total_pl)}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {v.limitation_type ? (
                          <Badge
                            variant="outline"
                            className="text-xs border-transparent bg-muted/50"
                          >
                            {LIMITATION_TYPE_LABELS[v.limitation_type]}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {v.limitation_date
                          ? format(new Date(v.limitation_date), "dd/MM/yy")
                          : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Summary row */}
            <div className="border-t border-border/50 px-4 py-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {vinculos.length} vínculo(s)
              </span>
              <div className="flex items-center gap-6">
                <span className="text-muted-foreground">
                  Total apostas:{" "}
                  <span className="font-medium text-foreground">
                    {vinculos.reduce((a, v) => a + v.total_bets, 0)}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  Volume:{" "}
                  <span className="font-medium text-foreground">
                    {formatCurrency(vinculos.reduce((a, v) => a + v.total_volume, 0))}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  P&L:{" "}
                  <span
                    className={`font-medium ${
                      vinculos.reduce((a, v) => a + v.total_pl, 0) >= 0
                        ? "text-emerald-500"
                        : "text-red-500"
                    }`}
                  >
                    {formatCurrency(vinculos.reduce((a, v) => a + v.total_pl, 0))}
                  </span>
                </span>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
