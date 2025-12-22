import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { 
  Building2, Calendar, Gift, Target, Trophy, 
  CheckCircle2, XCircle, AlertTriangle, CircleDot, Clock 
} from "lucide-react";
import { ApostaOperacionalFreebet } from "./types";

interface FreebetApostaCardProps {
  aposta: ApostaOperacionalFreebet;
  compact?: boolean;
  formatCurrency: (value: number) => string;
}

export function FreebetApostaCard({ aposta, compact = false, formatCurrency }: FreebetApostaCardProps) {
  const getResultadoBadge = (resultado: string | null, status: string) => {
    if (status === "PENDENTE" || !resultado || resultado === "PENDENTE") {
      return (
        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
          <Clock className="h-3 w-3 mr-1" />
          Pendente
        </Badge>
      );
    }
    
    switch (resultado) {
      case "GREEN":
        return (
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
            <Trophy className="h-3 w-3 mr-1" />
            Green
          </Badge>
        );
      case "MEIO_GREEN":
        return (
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Meio Green
          </Badge>
        );
      case "RED":
        return (
          <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
            <XCircle className="h-3 w-3 mr-1" />
            Red
          </Badge>
        );
      case "MEIO_RED":
        return (
          <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Meio Red
          </Badge>
        );
      case "VOID":
        return (
          <Badge variant="secondary">
            <CircleDot className="h-3 w-3 mr-1" />
            Void
          </Badge>
        );
      default:
        return <Badge variant="secondary">{resultado}</Badge>;
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-3 p-2 rounded-lg border bg-card hover:bg-accent/5 transition-colors">
        {/* Logo */}
        {aposta.logo_url ? (
          <img src={aposta.logo_url} alt={aposta.bookmaker_nome} className="h-6 w-6 rounded object-contain bg-white p-0.5" />
        ) : (
          <div className="h-6 w-6 rounded bg-muted flex items-center justify-center">
            <Building2 className="h-3 w-3" />
          </div>
        )}
        
        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{aposta.evento}</p>
          <p className="text-xs text-muted-foreground truncate">{aposta.selecao}</p>
        </div>
        
        {/* Valores */}
        <div className="text-right">
          <p className="text-sm font-semibold">{aposta.odd.toFixed(2)}</p>
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
        
        {/* Badge */}
        <div className="flex items-center gap-1">
          {aposta.gerou_freebet ? (
            <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-[10px] px-1.5">Q</Badge>
          ) : (
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] px-1.5">FB</Badge>
          )}
          {getResultadoBadge(aposta.resultado, aposta.status)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {aposta.logo_url ? (
            <img src={aposta.logo_url} alt={aposta.bookmaker_nome} className="h-8 w-8 rounded object-contain bg-white p-0.5" />
          ) : (
            <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
              <Building2 className="h-4 w-4" />
            </div>
          )}
          <div>
            <p className="font-medium text-sm">{aposta.bookmaker_nome}</p>
            {aposta.parceiro_nome && (
              <p className="text-xs text-muted-foreground">{aposta.parceiro_nome}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {aposta.tipo === "multipla" && (
            <Badge variant="outline" className="text-xs">Múltipla</Badge>
          )}
          {aposta.gerou_freebet ? (
            <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-xs">
              <Target className="h-3 w-3 mr-1" />
              Qualificadora
            </Badge>
          ) : (
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">
              <Gift className="h-3 w-3 mr-1" />
              Freebet
            </Badge>
          )}
        </div>
      </div>

      {/* Evento e Seleção */}
      <div className="mb-3">
        <p className="font-medium text-sm truncate" title={aposta.evento}>{aposta.evento}</p>
        <p className="text-sm text-primary truncate" title={aposta.selecao}>{aposta.selecao}</p>
        {aposta.mercado && (
          <p className="text-xs text-muted-foreground">{aposta.mercado}</p>
        )}
      </div>

      {/* Valores */}
      <div className="grid grid-cols-3 gap-2 mb-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Odd</p>
          <p className="font-semibold">{aposta.odd.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Stake</p>
          <p className="font-semibold text-amber-400">{formatCurrency(aposta.stake)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">
            {aposta.status === "LIQUIDADA" ? "P/L" : "Retorno Pot."}
          </p>
          <p className={`font-semibold ${
            aposta.lucro_prejuizo !== null 
              ? aposta.lucro_prejuizo >= 0 ? "text-emerald-400" : "text-red-400"
              : ""
          }`}>
            {aposta.status === "LIQUIDADA" && aposta.lucro_prejuizo !== null
              ? formatCurrency(aposta.lucro_prejuizo)
              : formatCurrency(aposta.stake * (aposta.odd - 1))
            }
          </p>
        </div>
      </div>

      {/* Gerou Freebet Info */}
      {aposta.gerou_freebet && aposta.valor_freebet_gerada && (
        <div className="flex items-center justify-between p-2 rounded bg-purple-500/10 border border-purple-500/20 mb-3">
          <span className="text-xs text-purple-400 flex items-center gap-1">
            <Gift className="h-3 w-3" />
            Gerou Freebet
          </span>
          <span className="text-sm font-bold text-purple-400">
            {formatCurrency(aposta.valor_freebet_gerada)}
          </span>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          {format(new Date(aposta.data_aposta), "dd/MM/yyyy HH:mm", { locale: ptBR })}
        </div>
        {getResultadoBadge(aposta.resultado, aposta.status)}
      </div>
    </div>
  );
}
