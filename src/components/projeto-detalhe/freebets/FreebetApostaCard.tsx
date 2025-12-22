import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Gift, Target } from "lucide-react";
import { ApostaOperacionalFreebet } from "./types";
import { ResultadoPill } from "../ResultadoPill";

interface FreebetApostaCardProps {
  aposta: ApostaOperacionalFreebet;
  compact?: boolean;
  formatCurrency: (value: number) => string;
  onResultadoUpdated: () => void;
  onEditClick: (aposta: ApostaOperacionalFreebet) => void;
}

// Parse local datetime without timezone conversion
function parseLocalDateTime(dateString: string): Date {
  if (!dateString) return new Date();
  const date = new Date(dateString);
  return date;
}

export function FreebetApostaCard({ 
  aposta, 
  compact = false, 
  formatCurrency,
  onResultadoUpdated,
  onEditClick
}: FreebetApostaCardProps) {
  
  // Compact mode - row style
  if (compact) {
    return (
      <div className="flex items-center gap-3 p-2 rounded-lg border bg-card hover:bg-accent/5 transition-colors">
        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{aposta.evento}</p>
          <p className="text-xs text-muted-foreground truncate">{aposta.selecao}</p>
        </div>
        
        {/* Valores */}
        <div className="text-right">
          <p className="text-sm font-semibold">@{aposta.odd.toFixed(2)}</p>
          <p className="text-xs text-amber-400">{formatCurrency(aposta.stake)}</p>
        </div>
        
        {/* P/L */}
        <div className="text-right min-w-[70px]">
          {aposta.status === "LIQUIDADA" && aposta.lucro_prejuizo !== null ? (
            <p className={`text-sm font-semibold ${aposta.lucro_prejuizo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatCurrency(aposta.lucro_prejuizo)}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">-</p>
          )}
        </div>
        
        {/* Badge + ResultadoPill */}
        <div className="flex items-center gap-1">
          {aposta.gerou_freebet ? (
            <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-[10px] px-1.5 py-0">Q</Badge>
          ) : (
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] px-1.5 py-0">FB</Badge>
          )}
          <ResultadoPill
            apostaId={aposta.id}
            bookmarkerId={aposta.bookmaker_id}
            resultado={aposta.resultado}
            status={aposta.status}
            stake={aposta.stake}
            odd={aposta.odd}
            onResultadoUpdated={onResultadoUpdated}
            onEditClick={() => onEditClick(aposta)}
          />
        </div>
      </div>
    );
  }

  // Card mode - identical to Apostas Livres
  return (
    <Card className="hover:border-primary/50 transition-colors cursor-default">
      <CardHeader className="pb-1 pt-3 px-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-sm truncate">{aposta.evento}</CardTitle>
            <p className="text-xs text-muted-foreground truncate">
              {aposta.mercado || (aposta.tipo === "multipla" ? `${aposta.selecao.split(" + ").length} seleções` : "Aposta")}
            </p>
          </div>
          <div className="flex gap-1 flex-shrink-0 items-center">
            {/* Badge de tipo múltipla */}
            {aposta.tipo === "multipla" && (
              <Badge className="bg-indigo-500/20 text-indigo-400 border-indigo-500/30 text-[10px] px-1.5 py-0">
                MULT
              </Badge>
            )}
            {/* Badge de contexto Freebet */}
            {aposta.gerou_freebet ? (
              <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-[10px] px-1.5 py-0">
                <Target className="h-2.5 w-2.5 mr-0.5" />
                Q
              </Badge>
            ) : (
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] px-1.5 py-0">
                <Gift className="h-2.5 w-2.5 mr-0.5" />
                FB
              </Badge>
            )}
            <ResultadoPill
              apostaId={aposta.id}
              bookmarkerId={aposta.bookmaker_id}
              resultado={aposta.resultado}
              status={aposta.status}
              stake={aposta.stake}
              odd={aposta.odd}
              onResultadoUpdated={onResultadoUpdated}
              onEditClick={() => onEditClick(aposta)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-1 pb-3 px-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground truncate flex-1">{aposta.selecao}</span>
            <span className="font-medium ml-2">@{aposta.odd.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Stake</span>
            <span className="font-medium text-amber-400">{formatCurrency(aposta.stake)}</span>
          </div>
          {aposta.lucro_prejuizo !== null && aposta.status === "LIQUIDADA" && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">P/L</span>
              <span className={`font-medium ${aposta.lucro_prejuizo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatCurrency(aposta.lucro_prejuizo)}
              </span>
            </div>
          )}
          {/* Gerou Freebet Info */}
          {aposta.gerou_freebet && aposta.valor_freebet_gerada && (
            <div className="flex items-center justify-between text-xs p-1.5 rounded bg-purple-500/10 border border-purple-500/20">
              <span className="text-purple-400 flex items-center gap-1">
                <Gift className="h-3 w-3" />
                Gerou Freebet
              </span>
              <span className="font-bold text-purple-400">
                {formatCurrency(aposta.valor_freebet_gerada)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
            <span className="text-muted-foreground">
              {format(parseLocalDateTime(aposta.data_aposta), "dd/MM HH:mm", { locale: ptBR })}
            </span>
            <span className="text-muted-foreground truncate ml-2 max-w-[100px]">
              {aposta.bookmaker_nome}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
