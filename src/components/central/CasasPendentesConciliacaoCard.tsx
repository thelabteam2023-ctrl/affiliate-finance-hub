/**
 * Card para exibir casas com conciliação pendente na Central de Operações
 * Permite ação direta de conciliação e vinculação de projeto
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, ArrowRight, FileWarning, Coins, FolderKanban, Wallet } from "lucide-react";
import { CardInfoTooltip } from "@/components/ui/card-info-tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { toast } from "sonner";

interface CasaPendenteConciliacao {
  bookmaker_id: string;
  bookmaker_nome: string;
  bookmaker_logo_url: string | null;
  moeda: string;
  saldo_atual: number;
  projeto_id: string | null;
  projeto_nome: string | null;
  parceiro_nome: string | null;
  parceiro_id?: string | null;
  qtd_transacoes_pendentes: number;
  valor_total_pendente: number;
}

interface CasasPendentesConciliacaoCardProps {
  casas: CasaPendenteConciliacao[];
  projetos?: { id: string; nome: string }[];
  onNavigate?: (projetoId: string, bookmakerId: string) => void;
}

const formatCurrency = (value: number, moeda: string = "BRL") => {
  const symbols: Record<string, string> = {
    BRL: "R$",
    USD: "$",
    EUR: "€",
    USDT: "USDT",
  };
  return `${symbols[moeda] || moeda} ${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export function CasasPendentesConciliacaoCard({
  casas,
  projetos,
  onNavigate,
}: CasasPendentesConciliacaoCardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { workspaceId } = useWorkspace();
  const queryClient = useQueryClient();

  const [vincularOpen, setVincularOpen] = useState(false);
  const [selectedCasa, setSelectedCasa] = useState<CasaPendenteConciliacao | null>(null);
  const [selectedProjetoId, setSelectedProjetoId] = useState("");
  const [vincularLoading, setVincularLoading] = useState(false);

  const handleConciliar = (casa: CasaPendenteConciliacao) => {
    navigate(`/caixa?tab=conciliacao&bookmaker=${casa.bookmaker_id}`);
    onNavigate?.(casa.projeto_id || "", casa.bookmaker_id);
  };

  const handleVincularClick = (casa: CasaPendenteConciliacao) => {
    setSelectedCasa(casa);
    setSelectedProjetoId("");
    setVincularOpen(true);
  };

  const handleConfirmVincular = async () => {
    if (!selectedCasa || !selectedProjetoId || !user || !workspaceId) return;
    setVincularLoading(true);
    try {
      const { error: updateError } = await supabase
        .from("bookmakers")
        .update({ projeto_id: selectedProjetoId })
        .eq("id", selectedCasa.bookmaker_id);
      if (updateError) throw updateError;

      await supabase
        .from("projeto_bookmaker_historico")
        .insert({
          projeto_id: selectedProjetoId,
          bookmaker_id: selectedCasa.bookmaker_id,
          bookmaker_nome: selectedCasa.bookmaker_nome,
          parceiro_id: selectedCasa.parceiro_id || null,
          parceiro_nome: selectedCasa.parceiro_nome || null,
          user_id: user.id,
          workspace_id: workspaceId,
        });

      const { executeLink } = await import("@/lib/projetoTransitionService");
      await executeLink({
        bookmakerId: selectedCasa.bookmaker_id,
        projetoId: selectedProjetoId,
        workspaceId,
        userId: user.id,
        saldoAtual: selectedCasa.saldo_atual,
        moeda: selectedCasa.moeda,
      });

      toast.success(`"${selectedCasa.bookmaker_nome}" vinculada ao projeto!`);
      setVincularOpen(false);
      queryClient.invalidateQueries({ queryKey: ["central-operacoes"] });
      queryClient.invalidateQueries({ queryKey: ["contas-disponiveis"] });
      queryClient.invalidateQueries({ queryKey: ["projeto-vinculos"] });
    } catch (err) {
      console.error("Erro ao vincular:", err);
      toast.error("Erro ao vincular bookmaker ao projeto");
    } finally {
      setVincularLoading(false);
    }
  };

  if (casas.length === 0) {
    return null;
  }

  return (
    <>
      <Card className="border-amber-500/50 bg-amber-500/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileWarning className="h-5 w-5 text-amber-500" />
              <CardTitle className="text-base font-semibold">
                Conciliação Pendente
              </CardTitle>
              <Badge variant="secondary" className="bg-amber-500/20 text-amber-600 border-amber-500/30">
                {casas.length} {casas.length === 1 ? "casa" : "casas"}
              </Badge>
            </div>
            <CardInfoTooltip
              title="Conciliação Obrigatória"
              description="Casas com transações pendentes não podem ser usadas para apostas ou bônus até a conciliação ser realizada."
            />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <ScrollArea className={casas.length > 3 ? "h-[240px]" : undefined}>
            <div className="space-y-2">
              {casas.map((casa) => (
                <div
                  key={casa.bookmaker_id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-background/50 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Logo ou ícone */}
                    <div className="shrink-0">
                      {casa.bookmaker_logo_url ? (
                        <img
                          src={casa.bookmaker_logo_url}
                          alt={casa.bookmaker_nome}
                          className="h-8 w-8 rounded object-contain bg-muted"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                          <Coins className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">
                          {casa.bookmaker_nome}
                          {casa.parceiro_nome && <span className="text-muted-foreground font-normal text-sm"> de {casa.parceiro_nome}</span>}
                        </span>
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 animate-pulse" />
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {casa.projeto_nome ? (
                          <span className="text-primary/80">{casa.projeto_nome}</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleVincularClick(casa)}
                            className="text-amber-600 italic hover:text-amber-400 hover:underline cursor-pointer transition-colors inline-flex items-center gap-1"
                            title="Clique para vincular a um projeto"
                          >
                            <FolderKanban className="h-3 w-3" />
                            Nenhum projeto vinculado
                          </button>
                        )}
                        <span className="mx-1.5">•</span>
                        <span>
                          {casa.qtd_transacoes_pendentes}{" "}
                          {casa.qtd_transacoes_pendentes === 1
                            ? "transação"
                            : "transações"}
                        </span>
                      </div>
                    </div>

                    {/* Valor pendente */}
                    <div className="text-right shrink-0 mr-2">
                      <div className="text-sm font-medium">
                        {formatCurrency(casa.valor_total_pendente, casa.moeda)}
                      </div>
                      <div className="text-xs text-muted-foreground">pendente</div>
                    </div>
                  </div>

                  {/* Ação */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 border-amber-500/50 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700"
                    onClick={() => handleConciliar(casa)}
                    disabled={!casa.projeto_id}
                  >
                    Conciliar
                    <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Dialog: Vincular a Projeto */}
      <Dialog open={vincularOpen} onOpenChange={setVincularOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Vincular a Projeto</DialogTitle>
            <DialogDescription>
              Vincular <strong>{selectedCasa?.bookmaker_nome}</strong>
              {selectedCasa?.parceiro_nome && ` de ${selectedCasa.parceiro_nome}`} a um projeto ativo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <Wallet className="h-4 w-4 text-primary" />
              <span className="text-sm">Saldo: <strong>{selectedCasa && formatCurrency(selectedCasa.saldo_atual, selectedCasa.moeda)}</strong></span>
            </div>
            <Select value={selectedProjetoId} onValueChange={setSelectedProjetoId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar projeto..." />
              </SelectTrigger>
              <SelectContent>
                {(projetos || []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVincularOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmVincular}
              disabled={!selectedProjetoId || vincularLoading}
            >
              {vincularLoading ? "Vinculando..." : "Vincular"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
