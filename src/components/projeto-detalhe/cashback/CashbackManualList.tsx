import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Trash2, 
  DollarSign, 
  CalendarDays,
  Building2,
  MessageSquare,
  AlertCircle,
  User
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CashbackManualComBookmaker } from "@/types/cashback-manual";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useState } from "react";

interface CashbackManualListProps {
  registros: CashbackManualComBookmaker[];
  formatCurrency: (value: number) => string;
  onDelete: (id: string) => Promise<boolean>;
  loading?: boolean;
}

export function CashbackManualList({
  registros,
  formatCurrency,
  onDelete,
  loading,
}: CashbackManualListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    await onDelete(id);
    setDeletingId(null);
  };

  if (registros.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-10 text-center">
          <DollarSign className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground font-medium">
            Nenhum cashback lançado ainda
          </p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Clique em "Lançar Cashback" para adicionar
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {registros.map((registro) => (
        <Card key={registro.id} className="overflow-hidden">
          <div className="flex items-stretch">
            {/* Indicador visual de valor */}
            <div className="w-1.5 bg-emerald-500" />
            
            <div className="flex-1 p-4">
              <div className="flex items-start justify-between gap-4">
                {/* Info Principal */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="font-medium">
                      <Building2 className="h-3 w-3 mr-1" />
                      {registro.bookmaker?.nome || "Casa"}
                    </Badge>
                    {registro.bookmaker?.parceiro?.nome && (
                      <Badge variant="outline" className="text-xs">
                        <User className="h-3 w-3 mr-1" />
                        {registro.bookmaker.parceiro.nome}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs">
                      {registro.moeda_operacao}
                    </Badge>
                  </div>
                  
                  <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {format(parseISO(registro.data_credito), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                  </div>

                  {registro.observacoes && (
                    <div className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                      <MessageSquare className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                      <span className="line-clamp-2">{registro.observacoes}</span>
                    </div>
                  )}
                </div>

                {/* Valor e Ações */}
                <div className="flex flex-col items-end gap-2">
                  <span className="text-lg font-bold text-emerald-500">
                    +{formatCurrency(Number(registro.valor))}
                  </span>
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 text-xs text-muted-foreground hover:text-destructive"
                        disabled={deletingId === registro.id}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Remover
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                          <AlertCircle className="h-5 w-5 text-destructive" />
                          Remover Cashback?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta ação irá remover o lançamento de cashback e <strong>reverter o saldo da casa</strong> em {formatCurrency(Number(registro.valor))}.
                          <br /><br />
                          Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(registro.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Remover e Reverter Saldo
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
