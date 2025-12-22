import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Gift, Target } from "lucide-react";
import { ApostaOperacionalFreebet } from "./types";
import { ResultadoPill } from "../ResultadoPill";

interface FreebetApostasListProps {
  apostas: ApostaOperacionalFreebet[];
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

export function FreebetApostasList({ 
  apostas, 
  formatCurrency,
  onResultadoUpdated,
  onEditClick
}: FreebetApostasListProps) {
  if (apostas.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg bg-muted/5">
        <Target className="mx-auto h-10 w-10 text-muted-foreground/30" />
        <p className="mt-3 text-sm text-muted-foreground">Nenhuma aposta encontrada</p>
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Tipo</th>
                <th className="text-left p-3 font-medium">Evento</th>
                <th className="text-left p-3 font-medium">Seleção</th>
                <th className="text-right p-3 font-medium">Odd</th>
                <th className="text-right p-3 font-medium">Stake</th>
                <th className="text-right p-3 font-medium">P/L</th>
                <th className="text-left p-3 font-medium">Casa</th>
                <th className="text-center p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {apostas.map((aposta) => (
                <tr 
                  key={aposta.id} 
                  className="border-b hover:bg-muted/30 transition-colors"
                >
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      {aposta.tipo === "multipla" && (
                        <Badge className="bg-indigo-500/20 text-indigo-400 border-indigo-500/30 text-[10px] px-1.5 py-0">
                          MULT
                        </Badge>
                      )}
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
                    </div>
                  </td>
                  <td className="p-3 max-w-[200px] truncate" title={aposta.evento}>
                    {aposta.evento}
                  </td>
                  <td className="p-3 max-w-[150px] truncate" title={aposta.selecao}>
                    {aposta.selecao}
                  </td>
                  <td className="p-3 text-right font-medium">
                    @{aposta.odd.toFixed(2)}
                  </td>
                  <td className="p-3 text-right text-amber-400 font-medium">
                    {formatCurrency(aposta.stake)}
                  </td>
                  <td className="p-3 text-right">
                    {aposta.status === "LIQUIDADA" && aposta.lucro_prejuizo !== null ? (
                      <span className={`font-medium ${aposta.lucro_prejuizo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatCurrency(aposta.lucro_prejuizo)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="p-3 max-w-[120px] truncate" title={aposta.bookmaker_nome}>
                    {aposta.bookmaker_nome}
                  </td>
                  <td className="p-3 text-center">
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
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">
                    {format(parseLocalDateTime(aposta.data_aposta), "dd/MM HH:mm", { locale: ptBR })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
