import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  History, 
  Calendar, 
  ArrowRight, 
  CheckCircle2, 
  Clock,
  Building2,
  AlertCircle
} from "lucide-react";
import { format } from "date-fns";
import { parseLocalDateTime } from "@/utils/dateUtils";
import { ptBR } from "date-fns/locale";
import { getTipoProjetoLabel, getTipoProjetoColor } from "@/types/projeto";

interface HistoricoItem {
  id: string;
  projeto_id: string;
  projeto_nome: string;
  tipo_projeto: string | null;
  data_vinculacao: string;
  data_desvinculacao: string | null;
  status_final: string | null;
}

interface BookmakerHistoricoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookmakerId: string;
  bookmakerNome: string;
  logoUrl?: string;
  bookmakerStatus?: string;
}

export function BookmakerHistoricoDialog({
  open,
  onOpenChange,
  bookmakerId,
  bookmakerNome,
  logoUrl,
  bookmakerStatus = "ativo",
}: BookmakerHistoricoDialogProps) {
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasOrphanOperations, setHasOrphanOperations] = useState(false);

  useEffect(() => {
    if (open && bookmakerId) {
      fetchHistorico();
    }
  }, [open, bookmakerId]);

  const fetchHistorico = async () => {
    setLoading(true);
    setError(null);

    try {
      // Buscar histórico formal
      const { data, error: fetchError } = await supabase
        .from("projeto_bookmaker_historico")
        .select(`
          id,
          projeto_id,
          data_vinculacao,
          data_desvinculacao,
          status_final,
          tipo_projeto_snapshot,
          projeto:projetos!projeto_bookmaker_historico_projeto_id_fkey(nome, tipo_projeto)
        `)
        .eq("bookmaker_id", bookmakerId)
        .order("data_vinculacao", { ascending: false });

      if (fetchError) throw fetchError;

      const formattedData: HistoricoItem[] = (data || []).map((item: any) => ({
        id: item.id,
        projeto_id: item.projeto_id,
        projeto_nome: item.projeto?.nome || "Projeto não encontrado",
        tipo_projeto: item.tipo_projeto_snapshot || item.projeto?.tipo_projeto || null,
        data_vinculacao: item.data_vinculacao,
        data_desvinculacao: item.data_desvinculacao,
        status_final: item.status_final,
      }));

      // Se não há registro ativo no histórico, verificar vínculo direto na tabela bookmakers
      const hasActiveInHistory = formattedData.some(h => !h.data_desvinculacao);
      if (!hasActiveInHistory) {
        const { data: bmData } = await supabase
          .from("bookmakers")
          .select("projeto_id, created_at, projetos:projetos!bookmakers_projeto_id_fkey(nome, tipo_projeto)")
          .eq("id", bookmakerId)
          .not("projeto_id", "is", null)
          .single();

        if (bmData?.projeto_id) {
          formattedData.unshift({
            id: `active-${bookmakerId}`,
            projeto_id: bmData.projeto_id,
            projeto_nome: (bmData as any).projetos?.nome || "Projeto ativo",
            tipo_projeto: (bmData as any).projetos?.tipo_projeto || null,
            data_vinculacao: bmData.created_at,
            data_desvinculacao: null,
            status_final: null,
          });
        }
      }

      // If no historico found at all, check if there are orphan operations
      if (formattedData.length === 0) {
        const [{ count: apostasCount }, { count: ledgerCount }] = await Promise.all([
          supabase.from("apostas_unificada").select("id", { count: "exact", head: true }).eq("bookmaker_id", bookmakerId),
          supabase.from("cash_ledger").select("id", { count: "exact", head: true }).or(`origem_bookmaker_id.eq.${bookmakerId},destino_bookmaker_id.eq.${bookmakerId}`),
        ]);
        setHasOrphanOperations((apostasCount || 0) + (ledgerCount || 0) > 0);
      } else {
        setHasOrphanOperations(false);
      }

      setHistorico(formattedData);
    } catch (err: any) {
      console.error("Erro ao buscar histórico:", err);
      setError(err.message || "Erro ao carregar histórico");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(parseLocalDateTime(dateStr), "dd MMM yyyy", { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  const getDuration = (start: string, end: string | null) => {
    try {
      const startDate = new Date(start);
      const endDate = end ? new Date(end) : new Date();
      const diffMs = endDate.getTime() - startDate.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) return "< 1 dia";
      if (diffDays === 1) return "1 dia";
      if (diffDays < 30) return `${diffDays} dias`;
      if (diffDays < 60) return "1 mês";
      return `${Math.floor(diffDays / 30)} meses`;
    } catch {
      return "-";
    }
  };

  const isAtivo = (item: HistoricoItem) => !item.data_desvinculacao;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={bookmakerNome}
                  className="h-8 w-8 rounded object-contain logo-blend p-0.5"
                />
              ) : (
                <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <span className="text-base font-semibold truncate">{bookmakerNome}</span>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] px-1.5 py-0 h-5 shrink-0",
                  bookmakerStatus === "ativo"
                    ? "border-success/50 text-success"
                    : bookmakerStatus === "limitada"
                      ? "border-warning/50 text-warning"
                      : "border-destructive/50 text-destructive"
                )}
              >
                {bookmakerStatus === "ativo" ? "Ativo" : bookmakerStatus === "limitada" ? "Limitada" : "Encerrada"}
              </Badge>
            </div>
            <Badge variant="outline" className="ml-auto gap-1 text-xs shrink-0">
              <History className="h-3 w-3" />
              Histórico
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="mt-2">
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-8 text-destructive gap-2">
              <AlertCircle className="h-8 w-8 opacity-50" />
              <p className="text-sm">{error}</p>
            </div>
          ) : historico.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
              <History className="h-10 w-10 opacity-30" />
              {hasOrphanOperations ? (
                <>
                  <p className="text-sm font-medium text-amber-400/80">Operações detectadas</p>
                  <p className="text-xs text-center px-4">
                    Esta casa possui transações/apostas registradas, mas não foi formalmente vinculada a um projeto com rastreamento de histórico ativo.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm">Nenhum histórico encontrado</p>
                  <p className="text-xs">Esta casa ainda não foi vinculada a nenhum projeto</p>
                </>
              )}
            </div>
          ) : (
            <ScrollArea className="max-h-[400px] pr-3">
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[11px] top-4 bottom-4 w-0.5 bg-border" />

                <div className="space-y-4">
                  {historico.map((item, index) => (
                    <div key={item.id} className="relative flex gap-3">
                      {/* Timeline dot */}
                      <div
                        className={`relative z-10 mt-1 h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${
                          isAtivo(item)
                            ? "bg-success text-success-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {isAtivo(item) ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <Clock className="h-3.5 w-3.5" />
                        )}
                      </div>

                      {/* Content card */}
                      <div
                        className={`flex-1 p-3 rounded-lg border ${
                          isAtivo(item)
                            ? "border-success/30 bg-success/5"
                            : "border-border bg-muted/30"
                        }`}
                      >
                        {/* Project name and tipo */}
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <h4 className="font-medium text-sm truncate">
                              {item.projeto_nome}
                            </h4>
                            {item.tipo_projeto && (
                              <Badge className={`${getTipoProjetoColor(item.tipo_projeto)} text-[10px] shrink-0`}>
                                {getTipoProjetoLabel(item.tipo_projeto)}
                              </Badge>
                            )}
                          </div>
                          {isAtivo(item) ? (
                            <Badge className="bg-success/20 text-success border-success/30 text-[10px]">
                              Em uso
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className={`text-[10px] ${
                                item.status_final?.toUpperCase() === "LIMITADA"
                                  ? "bg-warning/20 text-warning border-warning/30"
                                  : ""
                              }`}
                            >
                              {item.status_final || "Encerrada"}
                            </Badge>
                          )}
                        </div>

                        {/* Dates */}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          <span>{formatDate(item.data_vinculacao)}</span>
                          <ArrowRight className="h-3 w-3" />
                          <span>
                            {item.data_desvinculacao
                              ? formatDate(item.data_desvinculacao)
                              : "Atual"}
                          </span>
                          <span className="text-[10px] text-muted-foreground/70 ml-auto">
                            ({getDuration(item.data_vinculacao, item.data_desvinculacao)})
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </ScrollArea>
          )}

          {/* Summary */}
          {!loading && !error && historico.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Total de vínculos: {historico.length}</span>
                <span>
                  {historico.some(isAtivo)
                    ? "Atualmente vinculada"
                    : "Disponível para vínculo"}
                </span>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
