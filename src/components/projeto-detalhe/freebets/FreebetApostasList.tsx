import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Building2, Gift, Target, Trophy, 
  CheckCircle2, XCircle, AlertTriangle, CircleDot, Clock 
} from "lucide-react";
import { ApostaOperacionalFreebet } from "./types";

interface FreebetApostasListProps {
  apostas: ApostaOperacionalFreebet[];
  formatCurrency: (value: number) => string;
}

export function FreebetApostasList({ apostas, formatCurrency }: FreebetApostasListProps) {
  const getResultadoBadge = (resultado: string | null, status: string) => {
    if (status === "PENDENTE" || !resultado || resultado === "PENDENTE") {
      return (
        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px]">
          <Clock className="h-3 w-3 mr-1" />
          Pendente
        </Badge>
      );
    }
    
    switch (resultado) {
      case "GREEN":
        return (
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
            <Trophy className="h-3 w-3 mr-1" />
            Green
          </Badge>
        );
      case "MEIO_GREEN":
        return (
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Meio Green
          </Badge>
        );
      case "RED":
        return (
          <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">
            <XCircle className="h-3 w-3 mr-1" />
            Red
          </Badge>
        );
      case "MEIO_RED":
        return (
          <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Meio Red
          </Badge>
        );
      case "VOID":
        return (
          <Badge variant="secondary" className="text-[10px]">
            <CircleDot className="h-3 w-3 mr-1" />
            Void
          </Badge>
        );
      default:
        return <Badge variant="secondary" className="text-[10px]">{resultado}</Badge>;
    }
  };

  if (apostas.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg bg-muted/5">
        <Target className="mx-auto h-10 w-10 text-muted-foreground/30" />
        <p className="mt-3 text-sm text-muted-foreground">Nenhuma aposta encontrada</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px]">Casa</TableHead>
            <TableHead>Evento / Seleção</TableHead>
            <TableHead className="text-right w-[70px]">Odd</TableHead>
            <TableHead className="text-right w-[100px]">Stake</TableHead>
            <TableHead className="text-right w-[100px]">P/L</TableHead>
            <TableHead className="w-[130px]">Data</TableHead>
            <TableHead className="w-[80px]">Tipo</TableHead>
            <TableHead className="w-[100px]">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {apostas.map(aposta => (
            <TableRow key={aposta.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  {aposta.logo_url ? (
                    <img src={aposta.logo_url} alt={aposta.bookmaker_nome} className="h-6 w-6 rounded object-contain bg-white p-0.5" />
                  ) : (
                    <div className="h-6 w-6 rounded bg-muted flex items-center justify-center">
                      <Building2 className="h-3 w-3" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{aposta.bookmaker_nome}</p>
                    {aposta.parceiro_nome && (
                      <p className="text-[10px] text-muted-foreground truncate">{aposta.parceiro_nome}</p>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" title={aposta.evento}>{aposta.evento}</p>
                  <p className="text-xs text-primary truncate" title={aposta.selecao}>{aposta.selecao}</p>
                </div>
              </TableCell>
              <TableCell className="text-right font-semibold">
                {aposta.odd.toFixed(2)}
              </TableCell>
              <TableCell className="text-right font-semibold text-amber-400">
                {formatCurrency(aposta.stake)}
              </TableCell>
              <TableCell className="text-right">
                {aposta.status === "LIQUIDADA" && aposta.lucro_prejuizo !== null ? (
                  <span className={`font-semibold ${aposta.lucro_prejuizo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatCurrency(aposta.lucro_prejuizo)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {format(new Date(aposta.data_aposta), "dd/MM/yy HH:mm", { locale: ptBR })}
              </TableCell>
              <TableCell>
                {aposta.gerou_freebet ? (
                  <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-[10px]">
                    <Target className="h-3 w-3 mr-0.5" />
                    Qual.
                  </Badge>
                ) : (
                  <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">
                    <Gift className="h-3 w-3 mr-0.5" />
                    FB
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                {getResultadoBadge(aposta.resultado, aposta.status)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
