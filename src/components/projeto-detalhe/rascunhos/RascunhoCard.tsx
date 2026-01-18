import { memo, useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Play, 
  Trash2, 
  AlertCircle, 
  CheckCircle2,
  Layers,
  ArrowLeftRight,
  CircleDot,
  Shield
} from "lucide-react";
import type { ApostaRascunho } from "@/hooks/useApostaRascunho";

// Helper simples para formatar currency
const formatCurrency = (value: number, moeda: string = "BRL"): string => {
  const symbols: Record<string, string> = { BRL: "R$", USD: "$", EUR: "€", GBP: "£", USDT: "USDT" };
  const symbol = symbols[moeda] || moeda;
  return `${symbol} ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

interface RascunhoCardProps {
  rascunho: ApostaRascunho;
  onContinuar: (rascunho: ApostaRascunho) => void;
  onDeletar: (id: string) => void;
}

const tipoIcons: Record<string, React.ReactNode> = {
  SUREBET: <ArrowLeftRight className="h-4 w-4" />,
  MULTIPLA: <Layers className="h-4 w-4" />,
  SIMPLES: <CircleDot className="h-4 w-4" />,
  HEDGE: <Shield className="h-4 w-4" />,
};

const tipoLabels: Record<string, string> = {
  SUREBET: "Surebet",
  MULTIPLA: "Múltipla",
  SIMPLES: "Simples",
  HEDGE: "Hedge",
};

export const RascunhoCard = memo(function RascunhoCard({
  rascunho,
  onContinuar,
  onDeletar,
}: RascunhoCardProps) {
  const isProntoParaSalvar = rascunho.estado === "PRONTO_PARA_SALVAR";
  
  // Resumo dos dados
  const resumo = useMemo(() => {
    const partes: string[] = [];
    
    // Bookmaker(s)
    if (rascunho.tipo === "SUREBET" && rascunho.pernas?.length) {
      const bookmakers = rascunho.pernas
        .filter(p => p.bookmaker_nome)
        .map(p => p.bookmaker_nome)
        .slice(0, 2);
      if (bookmakers.length) {
        partes.push(bookmakers.join(" × "));
      }
    } else if (rascunho.bookmaker_nome) {
      partes.push(rascunho.bookmaker_nome);
    }
    
    // Stake
    if (rascunho.stake) {
      partes.push(formatCurrency(rascunho.stake, rascunho.moeda || "BRL"));
    }
    
    // Seleções (múltipla)
    if (rascunho.selecoes?.length) {
      const validas = rascunho.selecoes.filter(s => s.descricao || s.odd);
      if (validas.length) {
        partes.push(`${validas.length} seleções`);
      }
    }
    
    // Pernas (surebet)
    if (rascunho.pernas?.length) {
      const validas = rascunho.pernas.filter(p => p.bookmaker_id || p.stake);
      if (validas.length) {
        partes.push(`${validas.length} pernas`);
      }
    }
    
    return partes.length > 0 ? partes.join(" • ") : "Sem dados";
  }, [rascunho]);
  
  // Data formatada
  const dataFormatada = useMemo(() => {
    const data = new Date(rascunho.updated_at);
    return format(data, "dd/MM HH:mm", { locale: ptBR });
  }, [rascunho.updated_at]);

  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          {/* Lado esquerdo: Info do rascunho */}
          <div className="flex-1 min-w-0">
            {/* Header com tipo e status */}
            <div className="flex items-center gap-2 mb-2">
              <Badge 
                variant={isProntoParaSalvar ? "default" : "secondary"}
                className="flex items-center gap-1"
              >
                {tipoIcons[rascunho.tipo]}
                {tipoLabels[rascunho.tipo]}
              </Badge>
              
              {isProntoParaSalvar ? (
                <Badge variant="outline" className="text-green-600 border-green-300">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Pronto
                </Badge>
              ) : (
                <Badge variant="outline" className="text-amber-600 border-amber-300">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Incompleto
                </Badge>
              )}
            </div>
            
            {/* Resumo dos dados */}
            <p className="text-sm text-muted-foreground truncate mb-1">
              {resumo}
            </p>
            
            {/* Motivo de estar incompleto */}
            {rascunho.motivo_incompleto && (
              <p className="text-xs text-amber-600 truncate">
                {rascunho.motivo_incompleto}
              </p>
            )}
            
            {/* Data */}
            <p className="text-xs text-muted-foreground mt-2">
              {dataFormatada}
            </p>
          </div>
          
          {/* Lado direito: Ações */}
          <div className="flex flex-col gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
            <Button
              size="sm"
              variant="default"
              onClick={() => onContinuar(rascunho)}
              className="h-8"
            >
              <Play className="h-3 w-3 mr-1" />
              Continuar
            </Button>
            
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDeletar(rascunho.id)}
              className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Excluir
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
