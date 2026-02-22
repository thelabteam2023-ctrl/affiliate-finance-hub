import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  registrarPerdaOperacionalViaLedger, 
  reverterPerdaOperacionalViaLedger 
} from "@/lib/ledgerService";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiSummaryBar } from "@/components/ui/kpi-summary-bar";
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
import { Plus, AlertTriangle, Trash2, Clock, CheckCircle, RotateCcw, Ban } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ProjetoPerdasTabProps {
  projetoId: string;
  onDataChange?: () => void;
  formatCurrency?: (value: number) => string;
}

// Fallback para formatação de moeda
const defaultFormatCurrency = (value: number): string => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

interface Perda {
  id: string;
  valor: number;
  categoria: string;
  descricao: string | null;
  data_registro: string;
  status: string;
  data_confirmacao: string | null;
  data_reversao: string | null;
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

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  PENDENTE: { 
    label: "Pendente", 
    color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    icon: Clock
  },
  CONFIRMADA: { 
    label: "Confirmada", 
    color: "bg-red-500/20 text-red-400 border-red-500/30",
    icon: CheckCircle
  },
  REVERSA: { 
    label: "Revertida", 
    color: "bg-green-500/20 text-green-400 border-green-500/30",
    icon: RotateCcw
  },
};

export function ProjetoPerdasTab({ projetoId, onDataChange, formatCurrency: formatCurrencyProp }: ProjetoPerdasTabProps) {
  const formatCurrency = formatCurrencyProp || defaultFormatCurrency;
  const { user } = useAuth();
  const { workspaceId } = useWorkspace();
  const [perdas, setPerdas] = useState<Perda[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

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
          status,
          data_confirmacao,
          data_reversao,
          bookmaker_id,
          bookmaker:bookmakers(nome, moeda, workspace_id)
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

  // Helper to get bookmaker info for ledger operations
  const getBookmakerInfo = async (bookmakerId: string) => {
    const { data } = await supabase
      .from("bookmakers")
      .select("moeda, workspace_id")
      .eq("id", bookmakerId)
      .single();
    return data;
  };

  const handleStatusChange = async (perdaId: string, newStatus: string, perda: Perda) => {
    if (perda.status === newStatus) return;
    if (!user) return;
    
    try {
      setUpdatingStatus(perdaId);
      
      const updates: Record<string, any> = { status: newStatus };
      
      if (newStatus === 'CONFIRMADA') {
        updates.data_confirmacao = new Date().toISOString();
        updates.data_reversao = null;
        
        // When confirming, register loss via ledger (trigger debits balance)
        if (perda.bookmaker_id) {
          const bookmakerInfo = await getBookmakerInfo(perda.bookmaker_id);
          await registrarPerdaOperacionalViaLedger({
            bookmakerId: perda.bookmaker_id,
            valor: perda.valor,
            moeda: bookmakerInfo?.moeda || 'BRL',
            workspaceId: bookmakerInfo?.workspace_id || workspaceId || '',
            userId: user.id,
            descricao: `Perda operacional confirmada: ${perda.categoria}`,
            perdaId: perda.id,
            categoria: perda.categoria,
          });
        }
      } else if (newStatus === 'REVERSA') {
        updates.data_reversao = new Date().toISOString();
        
        // When reversing a confirmed loss, credit back via ledger
        if (perda.status === 'CONFIRMADA' && perda.bookmaker_id) {
          const bookmakerInfo = await getBookmakerInfo(perda.bookmaker_id);
          await reverterPerdaOperacionalViaLedger({
            bookmakerId: perda.bookmaker_id,
            valor: perda.valor,
            moeda: bookmakerInfo?.moeda || 'BRL',
            workspaceId: bookmakerInfo?.workspace_id || workspaceId || '',
            userId: user.id,
            descricao: `Reversão de perda operacional: ${perda.categoria}`,
            perdaId: perda.id,
          });
        }
      } else if (newStatus === 'PENDENTE') {
        updates.data_confirmacao = null;
        updates.data_reversao = null;
        
        // If going back to pending from confirmed, credit back via ledger
        if (perda.status === 'CONFIRMADA' && perda.bookmaker_id) {
          const bookmakerInfo = await getBookmakerInfo(perda.bookmaker_id);
          await reverterPerdaOperacionalViaLedger({
            bookmakerId: perda.bookmaker_id,
            valor: perda.valor,
            moeda: bookmakerInfo?.moeda || 'BRL',
            workspaceId: bookmakerInfo?.workspace_id || workspaceId || '',
            userId: user.id,
            descricao: `Perda voltou para pendente: ${perda.categoria}`,
            perdaId: perda.id,
          });
        }
      }

      const { error } = await supabase
        .from("projeto_perdas")
        .update(updates)
        .eq("id", perdaId);

      if (error) throw error;
      
      const statusLabels: Record<string, string> = {
        PENDENTE: "pendente",
        CONFIRMADA: "confirmada",
        REVERSA: "revertida"
      };
      
      toast.success(`Perda marcada como ${statusLabels[newStatus]}`);
      fetchPerdas();
      onDataChange?.();
    } catch (error: any) {
      toast.error("Erro ao atualizar status: " + error.message);
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteId || !user) return;
    
    const perda = perdas.find(p => p.id === deleteId);
    
    try {
      setDeleting(true);
      
      // If deleting a confirmed loss, credit back via ledger
      if (perda && perda.status === 'CONFIRMADA' && perda.bookmaker_id) {
        const bookmakerInfo = await getBookmakerInfo(perda.bookmaker_id);
        await reverterPerdaOperacionalViaLedger({
          bookmakerId: perda.bookmaker_id,
          valor: perda.valor,
          moeda: bookmakerInfo?.moeda || 'BRL',
          workspaceId: bookmakerInfo?.workspace_id || workspaceId || '',
          userId: user.id,
          descricao: `Perda deletada: ${perda.categoria}`,
          perdaId: perda.id,
        });
      }
      
      const { error } = await supabase
        .from("projeto_perdas")
        .delete()
        .eq("id", deleteId);

      if (error) throw error;
      
      toast.success("Perda removida com sucesso");
      fetchPerdas();
      onDataChange?.();
    } catch (error: any) {
      toast.error("Erro ao remover perda: " + error.message);
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

// formatCurrency agora vem como prop

  // Calculate totals by status
  const perdasPendentes = perdas.filter(p => p.status === 'PENDENTE');
  const perdasConfirmadas = perdas.filter(p => p.status === 'CONFIRMADA');
  const perdasReversas = perdas.filter(p => p.status === 'REVERSA');
  
  const totalPendente = perdasPendentes.reduce((acc, p) => acc + Number(p.valor), 0);
  const totalConfirmada = perdasConfirmadas.reduce((acc, p) => acc + Number(p.valor), 0);
  const totalReversa = perdasReversas.reduce((acc, p) => acc + Number(p.valor), 0);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPIs - Faixa compacta */}
      <div className="flex items-center gap-3 flex-wrap">
        <KpiSummaryBar
          className="flex-1"
          items={[
            {
              label: "Perdas Pendentes",
              value: formatCurrency(totalPendente),
              tooltip: (
                <div className="space-y-1">
                  <p className="font-semibold text-foreground">Perdas Pendentes</p>
                  <p className="text-muted-foreground">Aguardando confirmação ou resolução.</p>
                  <div className="flex justify-between gap-4 border-t border-border/50 pt-1">
                    <span>Registros</span>
                    <span className="font-semibold text-foreground">{perdasPendentes.length}</span>
                  </div>
                </div>
              ),
              valueClassName: "text-amber-500",
              subtitle: <span className="text-muted-foreground">{perdasPendentes.length} registro(s)</span>,
            },
            {
              label: "Perdas Confirmadas",
              value: formatCurrency(totalConfirmada),
              tooltip: (
                <div className="space-y-1">
                  <p className="font-semibold text-foreground">Perdas Confirmadas</p>
                  <p className="text-muted-foreground">Impactam o resultado do projeto.</p>
                  <div className="flex justify-between gap-4 border-t border-border/50 pt-1">
                    <span>Registros</span>
                    <span className="font-semibold text-foreground">{perdasConfirmadas.length}</span>
                  </div>
                </div>
              ),
              valueClassName: "text-red-500",
              subtitle: <span className="text-muted-foreground">{perdasConfirmadas.length} registro(s)</span>,
            },
            {
              label: "Perdas Revertidas",
              value: formatCurrency(totalReversa),
              tooltip: (
                <div className="space-y-1">
                  <p className="font-semibold text-foreground">Perdas Revertidas</p>
                  <p className="text-muted-foreground">Não impactam o resultado final.</p>
                  <div className="flex justify-between gap-4 border-t border-border/50 pt-1">
                    <span>Registros</span>
                    <span className="font-semibold text-foreground">{perdasReversas.length}</span>
                  </div>
                </div>
              ),
              valueClassName: "text-emerald-500",
              subtitle: <span className="text-muted-foreground">{perdasReversas.length} registro(s)</span>,
            },
          ]}
        />
        <Button onClick={() => setDialogOpen(true)} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" />
          Registrar Perda
        </Button>
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
                  <TableHead>Status</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perdas.map((perda) => {
                  const StatusIcon = STATUS_CONFIG[perda.status]?.icon || Clock;
                  return (
                    <TableRow key={perda.id} className={perda.status === 'REVERSA' ? 'opacity-60' : ''}>
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
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild disabled={updatingStatus === perda.id}>
                            <Button variant="ghost" size="sm" className="h-auto p-0">
                              <Badge className={`${STATUS_CONFIG[perda.status]?.color || ''} cursor-pointer`}>
                                <StatusIcon className="h-3 w-3 mr-1" />
                                {STATUS_CONFIG[perda.status]?.label || perda.status}
                              </Badge>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem 
                              onClick={() => handleStatusChange(perda.id, 'PENDENTE', perda)}
                              disabled={perda.status === 'PENDENTE'}
                            >
                              <Clock className="h-4 w-4 mr-2 text-yellow-500" />
                              Marcar como Pendente
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleStatusChange(perda.id, 'CONFIRMADA', perda)}
                              disabled={perda.status === 'CONFIRMADA'}
                            >
                              <CheckCircle className="h-4 w-4 mr-2 text-red-500" />
                              Confirmar Perda
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleStatusChange(perda.id, 'REVERSA', perda)}
                              disabled={perda.status === 'REVERSA'}
                            >
                              <RotateCcw className="h-4 w-4 mr-2 text-green-500" />
                              Reverter Perda
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {perda.descricao || "-"}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${
                        perda.status === 'REVERSA' ? 'text-green-500 line-through' :
                        perda.status === 'CONFIRMADA' ? 'text-red-500' : 'text-yellow-500'
                      }`}>
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
                  );
                })}
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
        onSuccess={() => { fetchPerdas(); onDataChange?.(); }}
      />

      {/* Dialog de Confirmação de Exclusão */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover este registro de perda? Esta ação não pode ser desfeita.
              {perdas.find(p => p.id === deleteId)?.status === 'CONFIRMADA' && (
                <span className="block mt-2 text-yellow-500">
                  ⚠️ Esta perda está confirmada. O valor será devolvido ao saldo da bookmaker.
                </span>
              )}
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
