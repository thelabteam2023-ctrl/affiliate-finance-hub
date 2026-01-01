import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format as formatDate } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeftRight, Zap, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SurebetPerna {
  id: string;
  selecao: string;
  odd: number;
  stake: number;
  resultado: string | null;
  bookmaker_nome: string;
  bookmaker_id?: string;
}

export interface SurebetData {
  id: string;
  data_operacao: string;
  evento: string;
  esporte: string;
  modelo: string;
  mercado?: string | null;
  estrategia?: string | null;
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
  className?: string;
  formatCurrency?: (value: number) => string;
}

// Fallback para formatação de moeda quando não é passada via props
const defaultFormatCurrency = (value: number): string => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

function ResultadoBadge({ resultado }: { resultado: string | null | undefined }) {
  const getConfig = (r: string | null | undefined) => {
    switch (r) {
      case "GREEN": return { label: "Green", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 };
      case "MEIO_GREEN": return { label: "½ Green", color: "bg-teal-500/20 text-teal-400 border-teal-500/30", icon: CheckCircle2 };
      case "RED": return { label: "Red", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: CheckCircle2 };
      case "MEIO_RED": return { label: "½ Red", color: "bg-orange-500/20 text-orange-400 border-orange-500/30", icon: CheckCircle2 };
      case "VOID": return { label: "Void", color: "bg-gray-500/20 text-gray-400 border-gray-500/30", icon: CheckCircle2 };
      default: return { label: "Pendente", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: Clock };
    }
  };
  
  const config = getConfig(resultado);
  const Icon = config.icon;
  
  return (
    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 flex items-center gap-0.5", config.color)}>
      <Icon className="h-2.5 w-2.5" />
      {config.label}
    </Badge>
  );
}

export function SurebetCard({ surebet, onEdit, className, formatCurrency }: SurebetCardProps) {
  // Usa formatCurrency do projeto ou fallback para BRL
  const formatValue = formatCurrency || defaultFormatCurrency;
  const isDuploGreen = surebet.estrategia === "DUPLO_GREEN";
  const isLiquidada = surebet.status === "LIQUIDADA";
  
  const lucroExibir = isLiquidada ? surebet.lucro_real : surebet.lucro_esperado;
  const roiExibir = isLiquidada ? surebet.roi_real : surebet.roi_esperado;
  
  const estrategiaConfig = isDuploGreen 
    ? { label: "DG", icon: Zap, color: "text-teal-400", bgColor: "bg-teal-500/20", borderColor: "border-teal-500/30" }
    : { label: "SUREBET", icon: ArrowLeftRight, color: "text-amber-400", bgColor: "bg-amber-500/20", borderColor: "border-amber-500/30" };
  
  const Icon = estrategiaConfig.icon;

  const parseLocalDateTime = (dateString: string): Date => {
    if (!dateString) return new Date();
    const cleanDate = dateString.replace(/\+00:00$/, '').replace(/Z$/, '').replace(/\+\d{2}:\d{2}$/, '');
    const [datePart, timePart] = cleanDate.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hours, minutes] = (timePart || '00:00').split(':').map(Number);
    return new Date(year, month - 1, day, hours || 0, minutes || 0);
  };

  return (
    <Card 
      className={cn("cursor-pointer transition-colors hover:border-primary/30", className)}
      onClick={() => onEdit?.(surebet)}
    >
      <CardContent className="p-4">
        {/* Header: Badges */}
        <div className="flex items-center gap-1 mb-2 flex-wrap">
          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 flex items-center gap-0.5", estrategiaConfig.bgColor, estrategiaConfig.color, estrategiaConfig.borderColor)}>
            <Icon className="h-2.5 w-2.5" />
            {estrategiaConfig.label}
          </Badge>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-400 bg-amber-500/20">
            {surebet.modelo}
          </Badge>
          <ResultadoBadge resultado={isLiquidada ? surebet.resultado : null} />
        </div>
        
        {/* Identificação: Evento e Esporte */}
        <div className="mb-2">
          <p className="font-medium text-sm truncate uppercase">{surebet.evento || 'Operação'}</p>
          <p className="text-xs text-muted-foreground">
            {surebet.esporte}{surebet.mercado ? ` • ${surebet.mercado}` : ''}
          </p>
        </div>
        
        {/* Detalhamento: Pernas */}
        {surebet.pernas && surebet.pernas.length > 0 && (
          <div className="space-y-1.5 mb-2">
            {surebet.pernas.map((perna) => (
              <div key={perna.id} className="flex items-center gap-2 text-xs">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 border-primary/30 text-primary bg-primary/10">
                  {perna.selecao}
                </Badge>
                <span className="text-muted-foreground truncate flex-1 uppercase">
                  {perna.bookmaker_nome}
                </span>
                <span className="font-medium shrink-0">@{perna.odd.toFixed(2)}</span>
                <span className="text-muted-foreground shrink-0">• {formatValue(perna.stake)}</span>
              </div>
            ))}
          </div>
        )}
        
        {/* Rodapé: Data, Stake, Lucro, ROI */}
        <div className="flex justify-between items-center pt-2 border-t">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">
              {formatDate(parseLocalDateTime(surebet.data_operacao), "dd/MM/yy", { locale: ptBR })}
            </span>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Stake: {formatValue(surebet.stake_total)}</p>
            {lucroExibir !== null && lucroExibir !== undefined && (
              <div className="flex items-center gap-2 justify-end">
                <span className={cn("text-sm font-medium", lucroExibir >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {formatValue(lucroExibir)}
                </span>
                {roiExibir !== null && roiExibir !== undefined && (
                  <span className={cn("text-xs", roiExibir >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                    ({roiExibir >= 0 ? '+' : ''}{roiExibir.toFixed(1)}%)
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
