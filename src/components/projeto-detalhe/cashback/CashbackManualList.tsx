import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Trash2, 
  DollarSign, 
  CalendarDays,
  MessageSquare,
  AlertCircle,
  User,
  Lock,
  Pencil
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Mapa de símbolos de moeda
const CURRENCY_SYMBOLS: Record<string, string> = {
  BRL: "R$",
  USD: "$",
  EUR: "€",
  GBP: "£",
  ARS: "$",
  MXN: "$",
  CLP: "$",
  COP: "$",
  PEN: "S/",
  UYU: "$U",
  USDT: "$",
};

const formatWithCurrency = (value: number, moeda: string): string => {
  const symbol = CURRENCY_SYMBOLS[moeda?.toUpperCase()] || moeda || "R$";
  return `${symbol} ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

interface CashbackManualListProps {
  registros: CashbackManualComBookmaker[];
  formatCurrency: (value: number) => string;
  onDelete: (id: string) => Promise<boolean>;
  onEdit?: (registro: CashbackManualComBookmaker) => void;
  loading?: boolean;
}

export function CashbackManualList({
  registros,
  formatCurrency,
  onDelete,
  onEdit,
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
      <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-lg bg-muted/20">
        <DollarSign className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground font-medium">
          Nenhum cashback lançado ainda
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Clique em "Lançar Cashback" para adicionar
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {registros.map((registro) => {
        const logoUrl = registro.bookmaker?.bookmakers_catalogo?.logo_url;
        const casaNome = registro.bookmaker?.nome || "Casa";
        const parceiroNome = registro.bookmaker?.parceiro?.nome;

        return (
          <div 
            key={registro.id} 
            className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
          >
            {/* Logo da casa */}
            <Avatar className="h-8 w-8 flex-shrink-0">
              {logoUrl ? (
                <AvatarImage src={logoUrl} alt={casaNome} className="object-contain" />
              ) : null}
              <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">
                {casaNome.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            {/* Info: Casa + Parceiro + Data */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-xs font-medium px-2 py-0.5">
                  {casaNome}
                </Badge>
                {parceiroNome && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {parceiroNome}
                  </span>
                )}
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {registro.moeda_operacao}
                </Badge>
                {(registro as any).tem_rollover && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/50 text-amber-600 dark:text-amber-400" title="Este cashback exige cumprimento de rollover">
                    <Lock className="h-2.5 w-2.5 mr-0.5" />
                    Rollover
                  </Badge>
                )}
              </div>
              
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" />
                  {format(parseISO(registro.data_credito), "dd/MM/yyyy", { locale: ptBR })}
                </span>
                {registro.observacoes && (
                  <span className="flex items-center gap-1 truncate max-w-[200px]" title={registro.observacoes}>
                    <MessageSquare className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{registro.observacoes}</span>
                  </span>
                )}
              </div>
            </div>

            {/* Valor */}
            <span className="text-sm font-semibold text-emerald-500 whitespace-nowrap">
              +{formatWithCurrency(Number(registro.valor), registro.moeda_operacao)}
            </span>

            {/* Ação de editar */}
            {onEdit && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-muted-foreground hover:text-primary"
                onClick={() => onEdit(registro)}
              >
                <Pencil className="h-3.5 w-3.5" />
                <span className="sr-only md:not-sr-only md:ml-1 text-xs">Editar</span>
              </Button>
            )}

            {/* Ação de remover */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-7 px-2 text-muted-foreground hover:text-destructive"
                  disabled={deletingId === registro.id}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="sr-only md:not-sr-only md:ml-1 text-xs">Remover</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                    Remover Cashback?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação irá remover o lançamento de cashback e <strong>reverter o saldo da casa</strong> em {formatWithCurrency(Number(registro.valor), registro.moeda_operacao)}.
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
        );
      })}
    </div>
  );
}
