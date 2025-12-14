import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, User, FileText } from "lucide-react";

interface VisualizarAcordoOperadorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operador: {
    id: string;
    operador_nome: string;
    funcao: string | null;
    data_entrada: string;
    data_saida: string | null;
    status: string;
    modelo_pagamento: string | null;
    valor_fixo: number | null;
    percentual: number | null;
    base_calculo: string | null;
    frequencia_conciliacao: string | null;
    resumo_acordo: string | null;
  } | null;
}

const getModeloLabel = (modelo: string | null) => {
  switch (modelo) {
    case "FIXO_MENSAL": return "Fixo Mensal";
    case "PORCENTAGEM": return "Porcentagem";
    case "HIBRIDO": return "Híbrido (Fixo + %)";
    case "POR_ENTREGA": return "Por Entrega";
    case "COMISSAO_ESCALONADA": return "Comissão Escalonada";
    default: return modelo || "Não definido";
  }
};


const getBaseCalculoLabel = (base: string | null) => {
  switch (base) {
    case "LUCRO_PROJETO": return "Lucro do Projeto";
    case "FATURAMENTO_PROJETO": return "Faturamento";
    case "RESULTADO_OPERACIONAL": return "Resultado Operacional";
    case "VOLUME_APOSTAS": return "Volume de Apostas";
    case "LUCRO_LIQUIDO": return "Lucro Líquido";
    default: return base || "Não definido";
  }
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

export function VisualizarAcordoOperadorDialog({
  open,
  onOpenChange,
  operador,
}: VisualizarAcordoOperadorDialogProps) {
  if (!operador) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Acordo - {operador.operador_nome}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Status */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge
              className={
                operador.status === "ATIVO"
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-gray-500/20 text-gray-400"
              }
            >
              {operador.status}
            </Badge>
          </div>

          {/* Informações básicas */}
          <div className="p-3 rounded-lg bg-muted/50 space-y-3">
            {operador.funcao && (
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Função:</span>
                <span>{operador.funcao}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Entrada:</span>
              <span>{format(new Date(operador.data_entrada), "dd/MM/yyyy", { locale: ptBR })}</span>
            </div>
            {operador.data_saida && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Saída:</span>
                <span>{format(new Date(operador.data_saida), "dd/MM/yyyy", { locale: ptBR })}</span>
              </div>
            )}
          </div>

          {/* Referência do Acordo */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Referência do Acordo</span>
            </div>

            <div className="p-3 rounded-lg bg-muted/30 border border-border/50 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Modelo de Pagamento</p>
                  <Badge variant="outline">{getModeloLabel(operador.modelo_pagamento)}</Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Base de Cálculo</p>
                  <Badge variant="outline" className="text-blue-400 border-blue-400/30">
                    {getBaseCalculoLabel(operador.base_calculo)}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {operador.valor_fixo !== null && operador.valor_fixo > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Valor Fixo</p>
                    <Badge variant="outline" className="text-emerald-400 border-emerald-400/30">
                      {formatCurrency(operador.valor_fixo)}
                    </Badge>
                  </div>
                )}
                {operador.percentual !== null && operador.percentual > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Percentual</p>
                    <Badge variant="outline" className="text-emerald-400 border-emerald-400/30">
                      {operador.percentual}%
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Resumo do Acordo */}
          {operador.resumo_acordo && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Resumo do Acordo</p>
              <div className="p-3 rounded-lg bg-muted/50 text-sm">
                {operador.resumo_acordo}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
