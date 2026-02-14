/**
 * Card para exibir casas com conciliação pendente na Central de Operações
 * Permite ação direta de conciliação
 */

import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, ArrowRight, FileWarning, Coins } from "lucide-react";
import { CardInfoTooltip } from "@/components/ui/card-info-tooltip";

interface CasaPendenteConciliacao {
  bookmaker_id: string;
  bookmaker_nome: string;
  bookmaker_logo_url: string | null;
  moeda: string;
  saldo_atual: number;
  projeto_id: string | null;
  projeto_nome: string | null;
  parceiro_nome: string | null;
  qtd_transacoes_pendentes: number;
  valor_total_pendente: number;
}

interface CasasPendentesConciliacaoCardProps {
  casas: CasaPendenteConciliacao[];
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
  onNavigate,
}: CasasPendentesConciliacaoCardProps) {
  const navigate = useNavigate();

  const handleConciliar = (casa: CasaPendenteConciliacao) => {
    // Navegar para a aba de conciliação do Caixa Operacional com a casa selecionada
    navigate(`/caixa?tab=conciliacao&bookmaker=${casa.bookmaker_id}`);
    onNavigate?.(casa.projeto_id || "", casa.bookmaker_id);
  };

  if (casas.length === 0) {
    return null;
  }

  return (
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
                        <span className="text-amber-600 italic">Nenhum projeto vinculado</span>
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
  );
}
