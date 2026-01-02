import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, Archive, Trash2, Building2 } from "lucide-react";

interface BookmakerVinculada {
  id: string;
  nome: string;
  moeda: string;
  saldo: number;
}

interface ProjetoDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projeto: {
    id: string;
    nome: string;
  } | null;
  onSuccess: () => void;
}

export function ProjetoDeleteDialog({
  open,
  onOpenChange,
  projeto,
  onSuccess,
}: ProjetoDeleteDialogProps) {
  const [loading, setLoading] = useState(false);
  const [checkingBookmakers, setCheckingBookmakers] = useState(false);
  const [bookmakers, setBookmakers] = useState<BookmakerVinculada[]>([]);
  const [action, setAction] = useState<"delete" | "archive" | null>(null);

  useEffect(() => {
    if (open && projeto) {
      checkBookmakers();
    } else {
      setBookmakers([]);
      setAction(null);
    }
  }, [open, projeto]);

  const checkBookmakers = async () => {
    if (!projeto) return;
    
    setCheckingBookmakers(true);
    try {
      const { data, error } = await supabase
        .from("bookmakers")
        .select("id, nome, moeda, saldo_atual, saldo_usd")
        .eq("projeto_id", projeto.id)
        .eq("status", "ativo");

      if (error) throw error;

      const formatted: BookmakerVinculada[] = (data || []).map((b) => ({
        id: b.id,
        nome: b.nome,
        moeda: b.moeda,
        saldo: b.moeda === "USD" ? b.saldo_usd : b.saldo_atual,
      }));

      setBookmakers(formatted);
    } catch (error: any) {
      console.error("Erro ao verificar bookmakers:", error);
      toast.error("Erro ao verificar bookmakers vinculadas");
    } finally {
      setCheckingBookmakers(false);
    }
  };

  const handleDesvincularBookmakers = async () => {
    if (!projeto) return false;

    try {
      const { error } = await supabase
        .from("bookmakers")
        .update({ projeto_id: null, updated_at: new Date().toISOString() })
        .eq("projeto_id", projeto.id);

      if (error) throw error;
      return true;
    } catch (error: any) {
      console.error("Erro ao desvincular bookmakers:", error);
      toast.error("Erro ao desvincular bookmakers: " + error.message);
      return false;
    }
  };

  const handleDelete = async () => {
    if (!projeto) return;
    
    setLoading(true);
    setAction("delete");

    try {
      // 1. Desvincular bookmakers
      if (bookmakers.length > 0) {
        const success = await handleDesvincularBookmakers();
        if (!success) {
          setLoading(false);
          setAction(null);
          return;
        }
      }

      // 2. Deletar dados relacionados em ordem
      // Apostas
      await supabase.from("apostas_unificada").delete().eq("projeto_id", projeto.id);
      
      // Bônus
      await supabase.from("project_bookmaker_link_bonuses").delete().eq("project_id", projeto.id);
      
      // Ciclos
      await supabase.from("projeto_ciclos").delete().eq("projeto_id", projeto.id);
      
      // Perdas
      await supabase.from("projeto_perdas").delete().eq("projeto_id", projeto.id);
      
      // Conciliações
      await supabase.from("projeto_conciliacoes").delete().eq("projeto_id", projeto.id);

      // Operadores vinculados - primeiro deletar entregas e pagamentos
      const { data: opProjetos } = await supabase
        .from("operador_projetos")
        .select("id")
        .eq("projeto_id", projeto.id);

      if (opProjetos && opProjetos.length > 0) {
        const opProjetoIds = opProjetos.map(op => op.id);
        await supabase.from("entregas").delete().in("operador_projeto_id", opProjetoIds);
        await supabase.from("pagamentos_propostos").delete().in("operador_projeto_id", opProjetoIds);
      }

      // Operador projetos
      await supabase.from("operador_projetos").delete().eq("projeto_id", projeto.id);

      // 3. Deletar o projeto
      const { error } = await supabase
        .from("projetos")
        .delete()
        .eq("id", projeto.id);

      if (error) throw error;

      toast.success(`Projeto "${projeto.nome}" excluído com sucesso`);
      if (bookmakers.length > 0) {
        toast.info(`${bookmakers.length} bookmaker(s) desvinculada(s) e disponível(eis) para outros projetos`);
      }
      
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao excluir projeto:", error);
      toast.error("Erro ao excluir projeto: " + error.message);
    } finally {
      setLoading(false);
      setAction(null);
    }
  };

  const handleArchive = async () => {
    if (!projeto) return;
    
    setLoading(true);
    setAction("archive");

    try {
      // 1. Desvincular bookmakers
      if (bookmakers.length > 0) {
        const success = await handleDesvincularBookmakers();
        if (!success) {
          setLoading(false);
          setAction(null);
          return;
        }
      }

      // 2. Arquivar o projeto (mudar status)
      const { error } = await supabase
        .from("projetos")
        .update({ 
          status: "ARQUIVADO", 
          updated_at: new Date().toISOString() 
        })
        .eq("id", projeto.id);

      if (error) throw error;

      toast.success(`Projeto "${projeto.nome}" arquivado com sucesso`);
      if (bookmakers.length > 0) {
        toast.info(`${bookmakers.length} bookmaker(s) desvinculada(s) e disponível(eis) para outros projetos`);
      }
      
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao arquivar projeto:", error);
      toast.error("Erro ao arquivar projeto: " + error.message);
    } finally {
      setLoading(false);
      setAction(null);
    }
  };

  const formatCurrency = (value: number, moeda: string) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: moeda === "USD" ? "USD" : "BRL",
    }).format(value);
  };

  const totalSaldoBRL = bookmakers
    .filter(b => b.moeda === "BRL")
    .reduce((acc, b) => acc + b.saldo, 0);
  
  const totalSaldoUSD = bookmakers
    .filter(b => b.moeda === "USD")
    .reduce((acc, b) => acc + b.saldo, 0);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Gerenciar Projeto
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p>
                O que deseja fazer com o projeto <strong>"{projeto?.nome}"</strong>?
              </p>

              {checkingBookmakers ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verificando bookmakers vinculadas...
                </div>
              ) : bookmakers.length > 0 ? (
                <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 space-y-3">
                  <div className="flex items-center gap-2 font-medium text-yellow-600 dark:text-yellow-400">
                    <Building2 className="h-4 w-4" />
                    {bookmakers.length} Bookmaker(s) Vinculada(s)
                  </div>
                  
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {bookmakers.map((b) => (
                      <div key={b.id} className="flex items-center justify-between text-sm">
                        <span className="text-foreground">{b.nome}</span>
                        <Badge variant="outline" className="font-mono">
                          {formatCurrency(b.saldo, b.moeda)}
                        </Badge>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-yellow-500/30 pt-2 text-sm">
                    <p className="font-medium text-foreground">Saldo Total:</p>
                    <div className="flex gap-4">
                      {totalSaldoBRL > 0 && (
                        <span className="text-muted-foreground">
                          BRL: {formatCurrency(totalSaldoBRL, "BRL")}
                        </span>
                      )}
                      {totalSaldoUSD > 0 && (
                        <span className="text-muted-foreground">
                          USD: {formatCurrency(totalSaldoUSD, "USD")}
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Todas as bookmakers serão <strong>desvinculadas</strong> e ficarão disponíveis para uso em outros projetos.
                    Os saldos serão mantidos.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhuma bookmaker vinculada a este projeto.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          
          <Button
            variant="secondary"
            onClick={handleArchive}
            disabled={loading || checkingBookmakers}
            className="gap-2"
          >
            {loading && action === "archive" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
            Arquivar Projeto
          </Button>
          
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={loading || checkingBookmakers}
            className="gap-2"
          >
            {loading && action === "delete" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Excluir Projeto
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
