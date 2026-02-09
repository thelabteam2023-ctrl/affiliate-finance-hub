import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useProjectBonuses, ProjectBonus, FinalizeReason } from "@/hooks/useProjectBonuses";
import { Building2, Search, History, CheckCircle2, XCircle, AlertTriangle, RotateCcw, ArrowDownUp } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface BonusHistoricoTabProps {
  projetoId: string;
}

const REASON_LABELS: Record<FinalizeReason, { label: string; icon: React.ElementType; color: string }> = {
  rollover_completed: { label: "Rollover Concluído (Saque)", icon: CheckCircle2, color: "text-emerald-400 bg-emerald-500/20 border-emerald-500/30" },
  cycle_completed: { label: "Ciclo Encerrado", icon: CheckCircle2, color: "text-blue-400 bg-blue-500/20 border-blue-500/30" },
  expired: { label: "Expirou", icon: XCircle, color: "text-red-400 bg-red-500/20 border-red-500/30" },
  cancelled_reversed: { label: "Cancelado/Revertido", icon: RotateCcw, color: "text-gray-400 bg-gray-500/20 border-gray-500/30" },
};

interface AjustePostLimitacaoEntry {
  id: string;
  valor: number;
  moeda: string;
  bookmaker_nome: string;
  bookmaker_logo_url: string | null;
  data_ajuste: string;
  saldo_limitacao: number;
  saldo_final: number;
  created_at: string;
}

type HistoricoEntry =
  | { type: "bonus"; data: ProjectBonus; sortDate: string }
  | { type: "ajuste"; data: AjustePostLimitacaoEntry; sortDate: string };

export function BonusHistoricoTab({ projetoId }: BonusHistoricoTabProps) {
  const { bonuses } = useProjectBonuses({ projectId: projetoId });
  const [searchTerm, setSearchTerm] = useState("");
  const [reasonFilter, setReasonFilter] = useState<string>("all");

  // Fetch ajustes pós-limitação
  const { data: ajustesData = [] } = useQuery({
    queryKey: ["bonus-historico-ajustes", projetoId],
    queryFn: async () => {
      const { data: bookmakers } = await supabase
        .from("bookmakers")
        .select("id, nome, moeda, bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url)")
        .eq("projeto_id", projetoId);

      if (!bookmakers || bookmakers.length === 0) return [];

      const bookmakerIds = bookmakers.map(b => b.id);
      const bkMap = new Map(bookmakers.map((b: any) => [b.id, {
        nome: b.nome,
        moeda: b.moeda || "BRL",
        logo_url: b.bookmakers_catalogo?.logo_url || null,
      }]));

      const { data, error } = await supabase
        .from("financial_events")
        .select("id, valor, bookmaker_id, moeda, metadata, created_at")
        .in("bookmaker_id", bookmakerIds)
        .eq("tipo_evento", "AJUSTE")
        .not("metadata", "is", null);

      if (error) throw error;

      const ajustes: AjustePostLimitacaoEntry[] = [];
      (data || []).forEach(evt => {
        try {
          const meta = typeof evt.metadata === "string" ? JSON.parse(evt.metadata) : evt.metadata;
          if (meta?.tipo_ajuste !== "AJUSTE_POS_LIMITACAO") return;
          const bk = bkMap.get(evt.bookmaker_id);
          ajustes.push({
            id: evt.id,
            valor: Number(evt.valor) || 0,
            moeda: evt.moeda || bk?.moeda || "BRL",
            bookmaker_nome: meta.bookmaker_nome || bk?.nome || "Casa Desconhecida",
            bookmaker_logo_url: bk?.logo_url || null,
            data_ajuste: meta.data_encerramento || evt.created_at,
            saldo_limitacao: Number(meta.saldo_no_momento_limitacao) || 0,
            saldo_final: Number(meta.saldo_final) || 0,
            created_at: evt.created_at,
          });
        } catch { /* ignore */ }
      });

      return ajustes;
    },
    enabled: !!projetoId,
    staleTime: 30000,
  });

  const formatCurrencyValue = (value: number, moeda: string = 'BRL') => {
    const symbols: Record<string, string> = { BRL: 'R$', USD: '$', EUR: '€', GBP: '£', USDT: '$', USDC: '$' };
    return `${symbols[moeda] || moeda} ${value.toFixed(2)}`;
  };

  // Merge bonus finalizados + ajustes into unified timeline
  const entries = useMemo((): HistoricoEntry[] => {
    const finalizedBonuses = bonuses.filter(b => b.status === 'finalized');
    const bonusEntries: HistoricoEntry[] = finalizedBonuses.map(b => ({
      type: "bonus" as const,
      data: b,
      sortDate: b.finalized_at || b.created_at,
    }));

    const ajusteEntries: HistoricoEntry[] = ajustesData.map(a => ({
      type: "ajuste" as const,
      data: a,
      sortDate: a.created_at,
    }));

    return [...bonusEntries, ...ajusteEntries];
  }, [bonuses, ajustesData]);

  const filteredEntries = useMemo(() => {
    return entries.filter(entry => {
      if (entry.type === "bonus") {
        const bonus = entry.data;
        const matchesSearch =
          bonus.bookmaker_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          bonus.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          bonus.parceiro_nome?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesReason = reasonFilter === "all" || reasonFilter === "ajuste_pos_limitacao"
          ? reasonFilter === "all"
            ? matchesSearch
            : false
          : bonus.finalize_reason === reasonFilter && matchesSearch;
        // Simplified: if reasonFilter is a bonus reason or "all"
        if (reasonFilter === "ajuste_pos_limitacao") return false;
        if (reasonFilter !== "all" && bonus.finalize_reason !== reasonFilter) return false;
        return matchesSearch;
      } else {
        const ajuste = entry.data;
        const matchesSearch = ajuste.bookmaker_nome?.toLowerCase().includes(searchTerm.toLowerCase());
        if (reasonFilter !== "all" && reasonFilter !== "ajuste_pos_limitacao") return false;
        return matchesSearch;
      }
    }).sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime());
  }, [entries, searchTerm, reasonFilter]);

  const getReasonBadge = (reason: FinalizeReason | null) => {
    if (!reason) return null;
    const config = REASON_LABELS[reason];
    if (!config) return null;
    const Icon = config.icon;
    return (
      <Badge className={config.color}>
        <Icon className="h-3 w-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por casa, título ou parceiro..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={reasonFilter} onValueChange={setReasonFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Motivo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os eventos</SelectItem>
            <SelectItem value="rollover_completed">Rollover Concluído (Saque)</SelectItem>
            <SelectItem value="cycle_completed">Ciclo Encerrado</SelectItem>
            <SelectItem value="expired">Expirou</SelectItem>
            <SelectItem value="cancelled_reversed">Cancelado/Revertido</SelectItem>
            <SelectItem value="ajuste_pos_limitacao">Ajuste Pós-Limitação</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {filteredEntries.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-10">
              <History className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">Nenhum evento encontrado</h3>
              <p className="text-muted-foreground">
                Bônus finalizados e ajustes pós-limitação aparecerão aqui
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <History className="h-4 w-4" />
              Histórico ({filteredEntries.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]">
              <div className="space-y-3">
                {filteredEntries.map(entry => {
                  if (entry.type === "bonus") {
                    const bonus = entry.data;
                    return (
                      <div key={bonus.id} className="flex items-center gap-4 p-4 rounded-lg bg-card border">
                        {bonus.bookmaker_logo_url ? (
                          <img
                            src={bonus.bookmaker_logo_url}
                            alt={bonus.bookmaker_nome}
                            className="h-10 w-10 rounded-lg object-contain bg-white p-1 flex-shrink-0"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Building2 className="h-5 w-5 text-primary" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{bonus.bookmaker_nome}</span>
                            <span className="text-muted-foreground">•</span>
                            <span className="text-sm text-muted-foreground">{bonus.title || 'Bônus'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                            {bonus.parceiro_nome && (
                              <>
                                <span>{bonus.parceiro_nome}</span>
                                <span>•</span>
                              </>
                            )}
                            {bonus.finalized_at && (
                              <span>
                                Finalizado em {format(parseISO(bonus.finalized_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-bold">{formatCurrencyValue(bonus.bonus_amount, bonus.currency)}</p>
                          {getReasonBadge(bonus.finalize_reason)}
                        </div>
                      </div>
                    );
                  }

                  // Ajuste Pós-Limitação
                  const ajuste = entry.data;
                  const isPositive = ajuste.valor >= 0;
                  return (
                    <div key={ajuste.id} className="flex items-center gap-4 p-4 rounded-lg bg-card border border-amber-500/20">
                      {ajuste.bookmaker_logo_url ? (
                        <img
                          src={ajuste.bookmaker_logo_url}
                          alt={ajuste.bookmaker_nome}
                          className="h-10 w-10 rounded-lg object-contain bg-white p-1 flex-shrink-0"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                          <ArrowDownUp className="h-5 w-5 text-amber-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{ajuste.bookmaker_nome}</span>
                          <span className="text-muted-foreground">•</span>
                          <span className="text-sm text-muted-foreground">Ajuste Pós-Limitação</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                          <span>
                            {formatCurrencyValue(ajuste.saldo_limitacao, ajuste.moeda)} → {formatCurrencyValue(ajuste.saldo_final, ajuste.moeda)}
                          </span>
                          <span>•</span>
                          <span>
                            {format(parseISO(ajuste.data_ajuste), "dd/MM/yyyy", { locale: ptBR })}
                          </span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`font-bold ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                          {isPositive ? "+" : ""}{formatCurrencyValue(ajuste.valor, ajuste.moeda)}
                        </p>
                        <Badge className="text-amber-400 bg-amber-500/20 border-amber-500/30">
                          <ArrowDownUp className="h-3 w-3 mr-1" />
                          Pós-Limitação
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}