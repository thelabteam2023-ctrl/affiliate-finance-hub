import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { MoreHorizontal, Pencil, Trash2, Zap, ListChecks, Calendar, Hash } from "lucide-react";
import { GiroGratisComBookmaker } from "@/types/girosGratis";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface GirosGratisListProps {
  giros: GiroGratisComBookmaker[];
  formatCurrency: (value: number) => string;
  onEdit: (giro: GiroGratisComBookmaker) => void;
  onDelete: (id: string) => Promise<boolean>;
}

export function GirosGratisList({ giros, formatCurrency, onEdit, onDelete }: GirosGratisListProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    await onDelete(deleteId);
    setDeleting(false);
    setDeleteId(null);
  };

  if (giros.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="text-muted-foreground">
            <Zap className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhum giro grátis registrado</p>
            <p className="text-xs mt-1">Clique em "Novo Registro" para começar</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {giros.map((giro) => (
          <Card key={giro.id} className="group hover:bg-muted/30 transition-colors">
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
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{giro.bookmaker_nome}</span>
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {giro.modo === "simples" ? (
                        <><Zap className="h-3 w-3 mr-1" />Simples</>
                      ) : (
                        <><ListChecks className="h-3 w-3 mr-1" />Detalhado</>
                      )}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(parseISO(giro.data_registro), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                    {giro.modo === "detalhado" && giro.quantidade_giros && (
                      <span className="flex items-center gap-1">
                        <Hash className="h-3 w-3" />
                        {giro.quantidade_giros} giros × {formatCurrency(giro.valor_por_giro || 0)}
                      </span>
                    )}
                    {giro.parceiro_nome && (
                      <span className="text-muted-foreground/70">{giro.parceiro_nome}</span>
                    )}
                  </div>
                </div>

                {/* Value */}
                <div className="text-right">
                  <Badge 
                    variant={giro.valor_retorno >= 0 ? "default" : "destructive"}
                    className="text-sm font-mono"
                  >
                    {formatCurrency(giro.valor_retorno)}
                  </Badge>
                  {giro.modo === "detalhado" && giro.valor_total_giros && giro.valor_total_giros > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {((giro.valor_retorno / giro.valor_total_giros) * 100).toFixed(1)}% conversão
                    </p>
                  )}
                </div>

                {/* Actions */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(giro)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setDeleteId(giro.id)}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Remover
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {giro.observacoes && (
                <p className="mt-2 text-xs text-muted-foreground pl-14 italic">
                  {giro.observacoes}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover registro?</AlertDialogTitle>
            <AlertDialogDescription>
              Este registro será marcado como cancelado e não aparecerá mais nos relatórios.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
