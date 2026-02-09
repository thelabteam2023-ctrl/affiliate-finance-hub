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
  tipo_projeto: string;
  status: string;
  total_bets: number;
  total_pl: number;
  total_volume: number;
  limitation_date: string | null;
}

const TIPO_PROJETO_LABELS: Record<string, { label: string; color: string }> = {
  surebet: { label: "Surebet", color: "bg-blue-500/10 text-blue-400" },
  bonus: { label: "Bônus", color: "bg-amber-500/10 text-amber-400" },
  valuebet: { label: "Valuebet", color: "bg-purple-500/10 text-purple-400" },
  trading: { label: "Trading", color: "bg-emerald-500/10 text-emerald-400" },
  matched_betting: { label: "Matched Betting", color: "bg-cyan-500/10 text-cyan-400" },
};

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

      // Get only LIMITED bookmakers (vínculos) for this catalogo in the workspace
      const { data: bookmakers, error: bErr } = await supabase
        .from("bookmakers")
        .select("id, nome, projeto_id, status")
        .eq("bookmaker_catalogo_id", bookmakerCatalogoId)
        .eq("workspace_id", workspaceId)
        .eq("status", "limitada");

      if (bErr) throw bErr;
      if (!bookmakers || bookmakers.length === 0) return [];

      const bookmakerIds = bookmakers.map((b: any) => b.id);
      const projetoIds = [...new Set(bookmakers.map((b: any) => b.projeto_id).filter(Boolean))] as string[];

      // Fetch project info (nome + tipo), bets stats and limitation events in parallel
      const [projectsResult, betsResult, limitationsResult] = await Promise.all([
        projetoIds.length > 0
          ? supabase.from("projetos").select("id, nome, tipo").in("id", projetoIds)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("apostas_unificada")
          .select("bookmaker_id, stake, lucro_prejuizo")
          .in("bookmaker_id", bookmakerIds)
          .eq("workspace_id", workspaceId)
          .not("resultado", "is", null),
        supabase
          .from("limitation_events")
          .select("bookmaker_id, event_timestamp")
          .in("bookmaker_id", bookmakerIds)
          .eq("workspace_id", workspaceId)
          .order("event_timestamp", { ascending: false }),
      ]);

      // Build project map (id -> { nome, tipo })
      const projectMap = new Map<string, { nome: string; tipo: string }>();
      if (projectsResult.data) {
        for (const p of projectsResult.data as any[]) {
          projectMap.set(p.id, { nome: p.nome, tipo: p.tipo || "" });
        }
      }

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

      // Latest limitation date per bookmaker
      const limitDateMap = new Map<string, string>();
      if (!limitationsResult.error && limitationsResult.data) {
        for (const le of limitationsResult.data) {
          if (!limitDateMap.has(le.bookmaker_id)) {
            limitDateMap.set(le.bookmaker_id, le.event_timestamp);
          }
        }
      }

      return bookmakers.map((b: any): VinculoDetail => {
        const stats = betsMap.get(b.id) || { count: 0, pl: 0, volume: 0 };
        const proj = b.projeto_id ? projectMap.get(b.projeto_id) : null;
        return {
          bookmaker_id: b.id,
          bookmaker_nome: b.nome,
          tipo_projeto: proj?.tipo || "—",
          status: b.status,
          total_bets: stats.count,
          total_pl: stats.pl,
          total_volume: stats.volume,
          limitation_date: limitDateMap.get(b.id) || null,
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
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              {logoUrl ? <AvatarImage src={logoUrl} /> : null}
              <AvatarFallback>
                <Building2 className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
            <span>{bookmakerNome} — Vínculos Limitados</span>
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !vinculos || vinculos.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            Nenhum vínculo limitado encontrado para esta bookmaker.
          </div>
        ) : (
          <div className="rounded-md border border-border/50 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vínculo</TableHead>
                  <TableHead className="text-center">Tipo Projeto</TableHead>
                  <TableHead className="text-center">Apostas</TableHead>
                  <TableHead className="text-right">Volume</TableHead>
                  <TableHead className="text-right">Lucro/Prejuízo</TableHead>
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

                  const tipoConfig = TIPO_PROJETO_LABELS[v.tipo_projeto?.toLowerCase()] || null;

                  return (
                    <TableRow key={v.bookmaker_id}>
                      <TableCell>
                        <div className="font-medium text-sm">{v.bookmaker_nome}</div>
                      </TableCell>
                      <TableCell className="text-center">
                        {tipoConfig ? (
                          <Badge
                            variant="outline"
                            className={`text-xs border-transparent ${tipoConfig.color}`}
                          >
                            {tipoConfig.label}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">{v.tipo_projeto}</span>
                        )}
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
                {vinculos.length} vínculo(s) limitado(s)
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
