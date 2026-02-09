import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { getFirstLastName } from "@/lib/utils";
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
  parceiro_nome: string;
  tipo_projeto: string;
  status: string;
  moeda: string;
  total_bets: number;
  total_pl: number;
  total_volume: number;
  ajuste_pos_limitacao: number;
  limitation_date: string | null;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  BRL: 'R$', USD: '$', EUR: '€', GBP: '£', MYR: 'RM', USDT: '$', USDC: '$',
};

function formatWithCurrency(value: number, moeda: string = 'BRL'): string {
  const symbol = CURRENCY_SYMBOLS[moeda] || moeda;
  const formatted = Math.abs(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${value < 0 ? '-' : ''}${symbol} ${formatted}`;
}

const TIPO_PROJETO_LABELS: Record<string, { label: string; color: string }> = {
  surebet: { label: "Surebet", color: "bg-blue-500/10 text-blue-400" },
  bonus: { label: "Bônus", color: "bg-amber-500/10 text-amber-400" },
  valuebet: { label: "Valuebet", color: "bg-purple-500/10 text-purple-400" },
  trading: { label: "Trading", color: "bg-emerald-500/10 text-emerald-400" },
  matched_betting: { label: "Matched Betting", color: "bg-cyan-500/10 text-cyan-400" },
  outros: { label: "Outros", color: "bg-muted/50 text-muted-foreground" },
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

      // Get only LIMITED bookmakers with parceiro info
      const { data: bookmakers, error: bErr } = await supabase
        .from("bookmakers")
        .select("id, nome, moeda, projeto_id, status, parceiro_id, parceiros(nome)")
        .eq("bookmaker_catalogo_id", bookmakerCatalogoId)
        .eq("workspace_id", workspaceId)
        .eq("status", "limitada");

      if (bErr) throw bErr;
      if (!bookmakers || bookmakers.length === 0) return [];

      const bookmakerIds = bookmakers.map((b: any) => b.id);

      // Fetch bets, limitation events, and post-limitation adjustments in parallel
      const [betsResult, limitationsResult, adjustmentsResult] = await Promise.all([
        supabase
          .from("apostas_unificada")
          .select("bookmaker_id, stake, lucro_prejuizo")
          .in("bookmaker_id", bookmakerIds)
          .eq("workspace_id", workspaceId)
          .not("resultado", "is", null),
        supabase
          .from("limitation_events")
          .select("bookmaker_id, evento_timestamp:event_timestamp, projeto_id")
          .in("bookmaker_id", bookmakerIds)
          .eq("workspace_id", workspaceId)
          .order("event_timestamp", { ascending: false }),
        supabase
          .from("financial_events")
          .select("bookmaker_id, valor")
          .in("bookmaker_id", bookmakerIds)
          .eq("workspace_id", workspaceId)
          .eq("tipo_evento", "AJUSTE")
          .eq("origem", "AJUSTE"),
      ]);

      // Latest limitation per bookmaker (with historical projeto_id)
      const limitMap = new Map<string, { date: string; projeto_id: string | null }>();
      if (!limitationsResult.error && limitationsResult.data) {
        for (const le of limitationsResult.data as any[]) {
          if (!limitMap.has(le.bookmaker_id)) {
            limitMap.set(le.bookmaker_id, {
              date: le.evento_timestamp,
              projeto_id: le.projeto_id,
            });
          }
        }
      }

      // Aggregate post-limitation adjustments per bookmaker
      const adjustmentMap = new Map<string, number>();
      if (!adjustmentsResult.error && adjustmentsResult.data) {
        for (const adj of adjustmentsResult.data as any[]) {
          const current = adjustmentMap.get(adj.bookmaker_id) || 0;
          adjustmentMap.set(adj.bookmaker_id, current + (Number(adj.valor) || 0));
        }
      }

      // Collect all project IDs (from bookmaker current + limitation events historical)
      const allProjetoIds = new Set<string>();
      for (const b of bookmakers as any[]) {
        if (b.projeto_id) allProjetoIds.add(b.projeto_id);
      }
      for (const [, lim] of limitMap) {
        if (lim.projeto_id) allProjetoIds.add(lim.projeto_id);
      }

      // Fetch project info
      let projectMap = new Map<string, { nome: string; tipo_projeto: string }>();
      if (allProjetoIds.size > 0) {
        const { data: projetos } = await supabase
          .from("projetos")
          .select("id, nome, tipo_projeto")
          .in("id", [...allProjetoIds]);
        if (projetos) {
          for (const p of projetos as any[]) {
            projectMap.set(p.id, { nome: p.nome, tipo_projeto: p.tipo_projeto || "" });
          }
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

      return bookmakers.map((b: any): VinculoDetail => {
        const stats = betsMap.get(b.id) || { count: 0, pl: 0, volume: 0 };
        const lim = limitMap.get(b.id);
        const ajuste = adjustmentMap.get(b.id) || 0;
        // Resolve project: prefer limitation event's projeto_id (historical), fallback to current
        const resolvedProjetoId = lim?.projeto_id || b.projeto_id;
        const proj = resolvedProjetoId ? projectMap.get(resolvedProjetoId) : null;
        return {
          bookmaker_id: b.id,
          bookmaker_nome: b.nome,
          parceiro_nome: (b.parceiros as any)?.nome || "—",
          tipo_projeto: proj?.tipo_projeto || "—",
          status: b.status,
          moeda: b.moeda || 'BRL',
          total_bets: stats.count,
          total_pl: stats.pl + ajuste,
          total_volume: stats.volume,
          ajuste_pos_limitacao: ajuste,
          limitation_date: lim?.date || null,
        };
      });
    },
    enabled: open && !!workspaceId && !!bookmakerCatalogoId,
  });

  // Determine predominant currency for summary (use first vinculo's moeda)
  const predominantMoeda = vinculos?.[0]?.moeda || 'BRL';

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
                        <div className="space-y-0.5">
                          <div className="font-medium text-sm">{v.bookmaker_nome}</div>
                          <div className="text-xs text-muted-foreground">{getFirstLastName(v.parceiro_nome)}</div>
                        </div>
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
                        {formatWithCurrency(v.total_volume, v.moeda)}
                      </TableCell>
                      <TableCell className={`text-right text-sm font-medium ${plColor}`}>
                        <div className="flex items-center justify-end gap-1">
                          <PlIcon className="h-3 w-3" />
                          {formatWithCurrency(v.total_pl, v.moeda)}
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
                    {formatWithCurrency(vinculos.reduce((a, v) => a + v.total_volume, 0), predominantMoeda)}
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
                    {formatWithCurrency(vinculos.reduce((a, v) => a + v.total_pl, 0), predominantMoeda)}
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
