import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  MoreHorizontal, 
  Pencil, 
  Trash2, 
  Clock, 
  Gift, 
  Calendar,
  Hash,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Play
} from "lucide-react";
import { GiroDisponivelComBookmaker, GiroDisponivelStatus } from "@/types/girosGratisDisponiveis";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface GirosDisponiveisListProps {
  giros: GiroDisponivelComBookmaker[];
  formatCurrency: (value: number) => string;
  onEdit: (giro: GiroDisponivelComBookmaker) => void;
  onUsar: (giro: GiroDisponivelComBookmaker) => void;
  onMarcarExpirado: (id: string) => Promise<boolean>;
  onCancelar: (id: string) => Promise<boolean>;
  showAll?: boolean;
}

const statusConfig: Record<GiroDisponivelStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
  DISPONIVEL: { label: "Disponível", variant: "default", icon: <Gift className="h-3 w-3" /> },
  UTILIZADO: { label: "Utilizado", variant: "secondary", icon: <CheckCircle className="h-3 w-3" /> },
  EXPIRADO: { label: "Expirado", variant: "outline", icon: <Clock className="h-3 w-3" /> },
  CANCELADO: { label: "Cancelado", variant: "destructive", icon: <XCircle className="h-3 w-3" /> },
};

export function GirosDisponiveisList({ 
  giros, 
  formatCurrency, 
  onEdit, 
  onUsar,
  onMarcarExpirado,
  onCancelar,
  showAll = false,
}: GirosDisponiveisListProps) {
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"expirar" | "cancelar" | null>(null);
  const [processing, setProcessing] = useState(false);

  // Filtrar baseado em showAll
  const filteredGiros = showAll 
    ? giros 
    : giros.filter(g => g.status === "DISPONIVEL");

  const handleAction = async () => {
    if (!actionId || !actionType) return;
    setProcessing(true);
    
    if (actionType === "expirar") {
      await onMarcarExpirado(actionId);
    } else if (actionType === "cancelar") {
      await onCancelar(actionId);
    }
    
    setProcessing(false);
    setActionId(null);
    setActionType(null);
  };

  if (filteredGiros.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="text-muted-foreground">
            <Gift className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">
              {showAll 
                ? "Nenhuma promoção registrada" 
                : "Nenhuma promoção disponível"}
            </p>
            <p className="text-xs mt-1">
              Registre promoções de giros grátis para acompanhar
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {filteredGiros.map((giro) => {
          const config = statusConfig[giro.status as GiroDisponivelStatus];
          const isDisponivel = giro.status === "DISPONIVEL";
          
          return (
            <Card 
              key={giro.id} 
              className={`group hover:bg-muted/30 transition-colors ${
                giro.prestes_a_expirar && isDisponivel 
                  ? "border-warning/50 bg-warning/5" 
                  : ""
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  {/* Bookmaker Avatar */}
                  <Avatar className="h-10 w-10">
                    {giro.bookmaker_logo_url ? (
                      <AvatarImage src={giro.bookmaker_logo_url} alt={giro.bookmaker_nome} />
                    ) : (
                      <AvatarFallback className="text-xs">
                        {giro.bookmaker_nome.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    )}
                  </Avatar>

                  {/* Main Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{giro.bookmaker_nome}</span>
                      <Badge variant={config.variant} className="shrink-0 text-xs">
                        {config.icon}
                        <span className="ml-1">{config.label}</span>
                      </Badge>
                      {giro.prestes_a_expirar && isDisponivel && (
                        <Badge variant="outline" className="shrink-0 text-xs border-warning text-warning">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          {giro.dias_restantes === 0 
                            ? "Expira hoje!" 
                            : `${giro.dias_restantes}d restantes`}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Hash className="h-3 w-3" />
                        {giro.quantidade_giros} giros × {formatCurrency(giro.valor_por_giro)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(parseISO(giro.data_recebido), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                      {giro.data_validade && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Até {format(parseISO(giro.data_validade), "dd/MM", { locale: ptBR })}
                        </span>
                      )}
                      <span className="text-muted-foreground/70">{giro.motivo}</span>
                    </div>
                  </div>

                  {/* Value */}
                  <div className="text-right">
                    <Badge 
                      variant="secondary"
                      className="text-sm font-mono"
                    >
                      {formatCurrency(giro.valor_total)}
                    </Badge>
                  </div>

                  {/* Actions */}
                  {isDisponivel ? (
                    <div className="flex items-center gap-1">
                      <Button 
                        size="sm" 
                        onClick={() => onUsar(giro)}
                        className="h-8"
                      >
                        <Play className="h-3 w-3 mr-1" />
                        Usar
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEdit(giro)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => { setActionId(giro.id); setActionType("expirar"); }}
                          >
                            <Clock className="h-4 w-4 mr-2" />
                            Marcar como expirado
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => { setActionId(giro.id); setActionType("cancelar"); }}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Cancelar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ) : (
                    <div className="w-20" /> // Placeholder for alignment
                  )}
                </div>

                {giro.observacoes && (
                  <p className="mt-2 text-xs text-muted-foreground pl-14 italic">
                    {giro.observacoes}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AlertDialog open={!!actionId} onOpenChange={() => { setActionId(null); setActionType(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionType === "expirar" 
                ? "Marcar como expirado?" 
                : "Cancelar promoção?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionType === "expirar"
                ? "Esta promoção será marcada como expirada e não estará mais disponível para uso."
                : "Esta promoção será cancelada permanentemente."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleAction} disabled={processing}>
              {processing 
                ? "Processando..." 
                : actionType === "expirar" 
                  ? "Marcar expirado" 
                  : "Cancelar promoção"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
