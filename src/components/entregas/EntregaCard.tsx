import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, CheckCircle2, Clock, Target, AlertTriangle } from "lucide-react";

interface Entrega {
  id: string;
  numero_entrega: number;
  descricao: string | null;
  data_inicio: string;
  data_fim_prevista: string | null;
  data_fim_real: string | null;
  tipo_gatilho: string;
  meta_valor: number | null;
  meta_percentual: number | null;
  saldo_inicial: number;
  resultado_nominal: number;
  resultado_real: number | null;
  conciliado: boolean;
  status: string;
  valor_pagamento_operador: number;
  excedente_proximo: number;
}

interface EntregaCardProps {
  entrega: Entrega;
  onConciliar?: () => void;
  compact?: boolean;
}

export function EntregaCard({ entrega, onConciliar, compact = false }: EntregaCardProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getStatusBadge = () => {
    switch (entrega.status) {
      case "EM_ANDAMENTO":
        return (
          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
            <Clock className="h-3 w-3 mr-1" />
            Em Andamento
          </Badge>
        );
      case "AGUARDANDO_CONCILIACAO":
        return (
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Aguardando
          </Badge>
        );
      case "CONCLUIDA":
        return (
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Concluída
          </Badge>
        );
      default:
        return (
          <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">
            {entrega.status}
          </Badge>
        );
    }
  };

  const progress = entrega.meta_valor 
    ? Math.min(100, (entrega.resultado_nominal / entrega.meta_valor) * 100)
    : 0;

  const isMetaAtingida = entrega.meta_valor 
    ? entrega.resultado_nominal >= entrega.meta_valor
    : false;

  const isPeriodoEncerrado = entrega.data_fim_prevista 
    ? new Date(entrega.data_fim_prevista) <= new Date()
    : false;

  const needsConciliacao = 
    entrega.status === "EM_ANDAMENTO" && 
    !entrega.conciliado && 
    (isMetaAtingida || isPeriodoEncerrado);

  if (compact) {
    return (
      <div className={`p-3 rounded-lg border ${needsConciliacao ? 'border-yellow-500/30 bg-yellow-500/5' : 'bg-card'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">#{entrega.numero_entrega}</span>
            {getStatusBadge()}
          </div>
          {needsConciliacao && onConciliar && (
            <Button size="sm" variant="outline" onClick={onConciliar}>
              Conciliar
            </Button>
          )}
        </div>
        {entrega.meta_valor && entrega.status === "EM_ANDAMENTO" && (
          <div className="mt-2">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {formatCurrency(entrega.resultado_nominal)} / {formatCurrency(entrega.meta_valor)} ({progress.toFixed(0)}%)
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`p-4 rounded-lg border ${needsConciliacao ? 'border-yellow-500/30 bg-yellow-500/5' : 'bg-card'}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">Entrega #{entrega.numero_entrega}</span>
            {getStatusBadge()}
          </div>
          {entrega.descricao && (
            <p className="text-sm text-muted-foreground mt-1">{entrega.descricao}</p>
          )}
        </div>
        {needsConciliacao && onConciliar && (
          <Button size="sm" onClick={onConciliar}>
            Conciliar
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {/* Período */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <span>
            {format(new Date(entrega.data_inicio), "dd/MM/yyyy", { locale: ptBR })}
            {entrega.data_fim_prevista && (
              <> até {format(new Date(entrega.data_fim_prevista), "dd/MM/yyyy", { locale: ptBR })}</>
            )}
          </span>
        </div>

        {/* Meta e Progresso */}
        {entrega.meta_valor && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <Target className="h-4 w-4 text-muted-foreground" />
              <span>Meta: {formatCurrency(entrega.meta_valor)}</span>
              {entrega.saldo_inicial > 0 && (
                <span className="text-xs text-muted-foreground">
                  (Inicial: {formatCurrency(entrega.saldo_inicial)})
                </span>
              )}
            </div>
            {entrega.status === "EM_ANDAMENTO" && (
              <>
                <Progress value={progress} className="h-2" />
                <div className="flex justify-between text-xs">
                  <span className={isMetaAtingida ? "text-emerald-400" : "text-muted-foreground"}>
                    {formatCurrency(entrega.resultado_nominal)}
                  </span>
                  <span className="text-muted-foreground">{progress.toFixed(0)}%</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Resultado Final (se concluída) */}
        {entrega.status === "CONCLUIDA" && (
          <div className="pt-2 border-t space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Resultado:</span>
              <span className="font-medium text-emerald-400">
                {formatCurrency(entrega.resultado_real || entrega.resultado_nominal)}
              </span>
            </div>
            {entrega.valor_pagamento_operador > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Pagamento:</span>
                <span>{formatCurrency(entrega.valor_pagamento_operador)}</span>
              </div>
            )}
            {entrega.excedente_proximo > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Excedente:</span>
                <span className="text-blue-400">+{formatCurrency(entrega.excedente_proximo)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
