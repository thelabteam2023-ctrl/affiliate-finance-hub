import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, AlertTriangle, Trash2, DollarSign, Hash } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PerdaOperacionalDialog } from "./PerdaOperacionalDialog";
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

interface ProjetoPerdasTabProps {
  projetoId: string;
}

interface Perda {
  id: string;
  valor: number;
  categoria: string;
  descricao: string | null;
  data_registro: string;
  bookmaker_id: string | null;
  bookmaker?: {
    nome: string;
  } | null;
}

const CATEGORIAS: Record<string, { label: string; color: string }> = {
  CONTA_LIMITADA: { label: "Conta Limitada", color: "bg-red-500/20 text-red-400 border-red-500/30" },
  BONUS_TRAVADO: { label: "Bônus Travado", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  TAXA_CONVERSAO: { label: "Taxa de Conversão", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  FRAUDE_DETECTADA: { label: "Fraude Detectada", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  SALDO_BLOQUEADO: { label: "Saldo Bloqueado", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  SALDO_RESIDUAL: { label: "Saldo Residual", color: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
  OUTRO: { label: "Outro", color: "bg-slate-500/20 text-slate-400 border-slate-500/30" },
};

export function ProjetoPerdasTab({ projetoId }: ProjetoPerdasTabProps) {
  const [perdas, setPerdas] = useState<Perda[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchPerdas();
  }, [projetoId]);

  const fetchPerdas = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("projeto_perdas")
        .select(`
          id,
          valor,
          categoria,
          descricao,
          data_registro,
          bookmaker_id,
          bookmaker:bookmakers(nome)
        `)
        .eq("projeto_id", projetoId)
        .order("data_registro", { ascending: false });

      if (error) throw error;
      setPerdas(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar perdas: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    
    try {
      setDeleting(true);
      const { error } = await supabase
        .from("projeto_perdas")
        .delete()
        .eq("id", deleteId);

      if (error) throw error;
      
      toast.success("Perda removida com sucesso");
      fetchPerdas();
    } catch (error: any) {
      toast.error("Erro ao remover perda: " + error.message);
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const totalPerdas = perdas.reduce((acc, p) => acc + Number(p.valor), 0);
  const qtdRegistros = perdas.length;

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Perdas</CardTitle>
            <DollarSign className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">
              {formatCurrency(totalPerdas)}
            </div>
            <p className="text-xs text-muted-foreground">
              Impacta diretamente o resultado do projeto
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Registros</CardTitle>
            <Hash className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{qtdRegistros}</div>
            <p className="text-xs text-muted-foreground">
              Perdas registradas neste projeto
            </p>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 lg:col-span-1">
          <CardContent className="pt-6">
            <Button onClick={() => setDialogOpen(true)} className="w-full">
              <Plus className="mr-2 h-4 w-4" />
              Registrar Perda
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Histórico */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Histórico de Perdas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {perdas.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma perda registrada neste projeto.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Bookmaker</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perdas.map((perda) => (
                  <TableRow key={perda.id}>
                    <TableCell>
                      {format(new Date(perda.data_registro), "dd/MM/yyyy", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      {perda.bookmaker?.nome || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge className={CATEGORIAS[perda.categoria]?.color || CATEGORIAS.OUTRO.color}>
                        {CATEGORIAS[perda.categoria]?.label || perda.categoria}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {perda.descricao || "-"}
                    </TableCell>
                    <TableCell className="text-right font-medium text-red-500">
                      {formatCurrency(perda.valor)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteId(perda.id)}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog de Registro */}
      <PerdaOperacionalDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projetoId={projetoId}
        onSuccess={fetchPerdas}
      />

      {/* Dialog de Confirmação de Exclusão */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover este registro de perda? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
