import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
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
import { Play, MoreHorizontal, Pencil, Clock, XCircle, Gift, History } from "lucide-react";
import { GiroDisponivelComBookmaker, GiroDisponivelStatus } from "@/types/girosGratisDisponiveis";
import { useState } from "react";

interface PromocoesAtivasListProps {
  giros: GiroDisponivelComBookmaker[];
  formatCurrency: (value: number) => string;
  onUsar: (giro: GiroDisponivelComBookmaker) => void;
  onEdit: (giro: GiroDisponivelComBookmaker) => void;
  onMarcarExpirado: (id: string) => Promise<boolean>;
  onCancelar: (id: string) => Promise<boolean>;
}

const statusConfig: Record<GiroDisponivelStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; }> = {
  DISPONIVEL: { label: "Ativa", variant: "default" },
  UTILIZADO: { label: "Utilizada", variant: "secondary" },
  EXPIRADO: { label: "Expirada", variant: "outline" },
  CANCELADO: { label: "Cancelada", variant: "destructive" },
};

export function PromocoesAtivasList({
  giros,
  formatCurrency,
  onUsar,
  onEdit,
  onMarcarExpirado,
  onCancelar,
}: PromocoesAtivasListProps) {
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"expirar" | "cancelar" | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleAction = async () => {
    if (!actionId || !actionType) return;
    
    setProcessing(true);
    try {
      if (actionType === "expirar") {
        await onMarcarExpirado(actionId);
      } else {
        await onCancelar(actionId);
      }
    } finally {
      setProcessing(false);
      setActionId(null);
      setActionType(null);
    }
  };

  if (giros.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12">
          <div className="text-center">
            <Gift className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma promoção encontrada</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {giros.map((giro) => {
          const isActive = giro.status === "DISPONIVEL";
          const config = statusConfig[giro.status];
          const diasRestantes = giro.dias_restantes;

          return (
            <Card key={giro.id} className="overflow-hidden">
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  {/* Avatar da Casa */}
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={giro.bookmaker_logo_url || undefined} />
                    <AvatarFallback className="text-xs font-medium bg-muted">
                      {(giro.bookmaker_nome || "?").substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  {/* Info Principal */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {giro.bookmaker_nome || "Casa desconhecida"}
                      </span>
                      <Badge variant={config.variant} className="text-[10px] h-5">
                        {config.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      {giro.motivo && <span>{giro.motivo}</span>}
                      {isActive && diasRestantes !== null && diasRestantes <= 3 && (
                        <>
                          {giro.motivo && <span>•</span>}
                          <span className="text-warning flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {diasRestantes <= 0 ? "Expira hoje" : `${diasRestantes}d restantes`}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Ação Contextual */}
                  {isActive ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" onClick={() => onUsar(giro)}>
                        <Play className="h-3.5 w-3.5 mr-1" />
                        Usar
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
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
                            onClick={() => {
                              setActionId(giro.id);
                              setActionType("expirar");
                            }}
                          >
                            <Clock className="h-4 w-4 mr-2" />
                            Marcar como expirada
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={() => {
                              setActionId(giro.id);
                              setActionType("cancelar");
                            }}
                          >
                            <XCircle className="h-4 w-4 mr-2" />
                            Cancelar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ) : (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="text-muted-foreground shrink-0"
                      onClick={() => onEdit(giro)}
                    >
                      <History className="h-3.5 w-3.5 mr-1" />
                      Ver histórico
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Dialog de Confirmação */}
      <AlertDialog open={!!actionId} onOpenChange={() => setActionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionType === "expirar" ? "Marcar como expirada?" : "Cancelar promoção?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionType === "expirar" 
                ? "Esta promoção será marcada como expirada e não poderá mais ser utilizada."
                : "Esta ação não pode ser desfeita. A promoção será permanentemente cancelada."
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Voltar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleAction}
              disabled={processing}
              className={actionType === "cancelar" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {processing ? "Processando..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
