import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Clock, CheckCircle2, ArrowLeftRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface SurebetPerna {
  id: string;
  selecao: string;
  odd: number;
  stake: number;
  resultado: string | null;
  bookmaker_nome: string;
}

export interface SurebetData {
  id: string;
  data_operacao: string;
  evento: string;
  esporte: string;
  modelo: string;
  stake_total: number;
  spread_calculado: number | null;
  roi_esperado: number | null;
  lucro_esperado: number | null;
  lucro_real: number | null;
  roi_real: number | null;
  status: string;
  resultado: string | null;
  observacoes: string | null;
  pernas?: SurebetPerna[];
}

interface SurebetCardProps {
  surebet: SurebetData;
  onEdit?: (surebet: SurebetData) => void;
  defaultExpanded?: boolean;
}

export function SurebetCard({ surebet, onEdit, defaultExpanded = false }: SurebetCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatPercent = (value: number | null) => {
    if (value === null) return "-";
    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  };

  const getSelecaoLabel = (selecao: string) => {
    const labels: Record<string, string> = {
      "Casa": "1", "1": "1",
      "Empate": "X", "X": "X",
      "Fora": "2", "2": "2"
    };
    return labels[selecao] || selecao;
  };

  const parseLocalDateTime = (dateString: string): Date => {
    if (!dateString) return new Date();
    const cleanDate = dateString.replace(/\+00:00$/, '').replace(/Z$/, '').replace(/\+\d{2}:\d{2}$/, '');
    const [datePart, timePart] = cleanDate.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hours, minutes] = (timePart || '00:00').split(':').map(Number);
    return new Date(year, month - 1, day, hours || 0, minutes || 0);
  };

  const isLiquidada = surebet.status === "LIQUIDADA";
  const lucroExibir = isLiquidada ? surebet.lucro_real : surebet.lucro_esperado;
  const roiExibir = isLiquidada ? surebet.roi_real : surebet.roi_esperado;

  return (
    <Card className="cursor-pointer hover:border-primary/50 transition-colors relative overflow-hidden">
      {/* Barra lateral amarela indicando Surebet */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500" />
      
      {/* Header compacto - sempre visível */}
      <CardHeader className="pb-2 pt-3 px-3 pl-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <Badge variant="outline" className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] px-1.5 py-0 gap-1">
                <ArrowLeftRight className="h-2.5 w-2.5" />
                SUREBET
              </Badge>
              <Badge 
                variant="outline" 
                className={`text-[10px] px-1.5 py-0 gap-0.5 ${
                  isLiquidada 
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" 
                    : "bg-blue-500/20 text-blue-400 border-blue-500/30"
                }`}
              >
                {isLiquidada ? (
                  <CheckCircle2 className="h-2.5 w-2.5" />
                ) : (
                  <Clock className="h-2.5 w-2.5" />
                )}
                {surebet.status}
              </Badge>
            </div>
            <CardTitle 
              className="text-sm uppercase truncate cursor-pointer hover:text-primary"
              onClick={() => onEdit?.(surebet)}
            >
              {surebet.evento}
            </CardTitle>
            <p className="text-[10px] text-muted-foreground">{surebet.esporte}</p>
          </div>
          {/* Botão expandir */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="px-3 pl-4 pb-3 pt-0 space-y-2">
        {/* Resumo compacto - sempre visível */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground text-[10px]">Stake</span>
            <p className="font-medium">{formatCurrency(surebet.stake_total)}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-[10px]">
              {isLiquidada ? "ROI Real" : "ROI Esp."}
            </span>
            <p className={`font-medium ${(roiExibir || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {formatPercent(roiExibir)}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground text-[10px]">
              {isLiquidada ? "Lucro" : "Lucro Esp."}
            </span>
            <p className={`font-medium ${(lucroExibir || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {formatCurrency(lucroExibir || 0)}
            </p>
          </div>
        </div>

        {/* Posições/Pernas expandíveis */}
        <Collapsible open={isExpanded}>
          <CollapsibleContent className="space-y-1.5 pt-2">
            <Separator className="mb-2" />
            {surebet.pernas && surebet.pernas.length > 0 ? (
              surebet.pernas.map((perna) => (
                <div 
                  key={perna.id} 
                  className="flex items-center justify-between gap-2 text-xs bg-muted/30 rounded-md px-2 py-1.5"
                >
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span className="font-bold text-primary w-3 flex-shrink-0 text-center">
                      {getSelecaoLabel(perna.selecao)}
                    </span>
                    <span className="text-muted-foreground">–</span>
                    <span className="font-medium truncate uppercase text-[11px]">
                      {perna.bookmaker_nome}
                    </span>
                    <span className="text-muted-foreground text-[10px]">•</span>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">
                      {perna.odd.toFixed(2)}
                    </span>
                    <span className="text-muted-foreground text-[10px]">•</span>
                    <span className="text-[10px] font-medium flex-shrink-0">
                      {formatCurrency(perna.stake)}
                    </span>
                  </div>
                  {/* Badge de Resultado */}
                  {perna.resultado && (
                    <Badge 
                      variant="outline" 
                      className={`text-[9px] px-1 py-0 flex-shrink-0 ${
                        perna.resultado === "GREEN" 
                          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" 
                          : perna.resultado === "RED"
                          ? "bg-red-500/20 text-red-400 border-red-500/30"
                          : "bg-gray-500/20 text-gray-400 border-gray-500/30"
                      }`}
                    >
                      {perna.resultado}
                    </Badge>
                  )}
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground text-center py-2">
                Nenhuma posição registrada
              </p>
            )}
            
            {/* Data */}
            <div className="flex justify-end pt-1">
              <span className="text-[10px] text-muted-foreground">
                {format(parseLocalDateTime(surebet.data_operacao), "dd/MM HH:mm", { locale: ptBR })}
              </span>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
