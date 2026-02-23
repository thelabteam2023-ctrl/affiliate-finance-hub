import { useState, useEffect } from "react";
import { parseLocalDateTime } from "@/utils/dateUtils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/ui/search-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PromocaoDialog } from "@/components/promocoes/PromocaoDialog";
import { PromocaoCard } from "@/components/promocoes/PromocaoCard";
import { Gift, Megaphone, CheckCircle, XCircle, LayoutGrid, List } from "lucide-react";

interface Promocao {
  id: string;
  user_id: string;
  nome: string;
  descricao: string | null;
  data_inicio: string;
  data_fim: string;
  meta_parceiros: number;
  valor_bonus: number;
  status: string;
  created_at: string;
}

interface PromocaoParticipante {
  id: string;
  promocao_id: string;
  indicador_id: string;
  parceiros_indicados: number;
  meta_atingida: boolean;
  bonus_pago: boolean;
  indicador_nome?: string;
}

export function PromocoesTab() {
  const { toast } = useToast();
  const [promocoes, setPromocoes] = useState<Promocao[]>([]);
  const [participantes, setParticipantes] = useState<Record<string, PromocaoParticipante[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPromocao, setSelectedPromocao] = useState<Promocao | null>(null);
  const [isViewMode, setIsViewMode] = useState(false);
  
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [promocaoToDelete, setPromocaoToDelete] = useState<Promocao | null>(null);

  useEffect(() => {
    fetchPromocoes();
  }, []);

  const fetchPromocoes = async () => {
    try {
      setLoading(true);
      const { data: promocoesData, error: promocoesError } = await supabase
        .from("promocoes_indicacao")
        .select("*")
        .order("created_at", { ascending: false });

      if (promocoesError) throw promocoesError;
      setPromocoes(promocoesData || []);

      // Fetch participants for each promotion
      if (promocoesData && promocoesData.length > 0) {
        const { data: participantesData, error: participantesError } = await supabase
          .from("promocao_participantes")
          .select(`
            *,
            indicadores_referral (nome)
          `);

        if (participantesError) throw participantesError;

        const participantesByPromocao: Record<string, PromocaoParticipante[]> = {};
        participantesData?.forEach((p: any) => {
          if (!participantesByPromocao[p.promocao_id]) {
            participantesByPromocao[p.promocao_id] = [];
          }
          participantesByPromocao[p.promocao_id].push({
            ...p,
            indicador_nome: p.indicadores_referral?.nome,
          });
        });
        setParticipantes(participantesByPromocao);
      }
    } catch (error: any) {
      toast({
        title: "Erro ao carregar promoções",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (promocao: Promocao) => {
    setSelectedPromocao(promocao);
    setIsViewMode(false);
    setDialogOpen(true);
  };

  const handleView = (promocao: Promocao) => {
    setSelectedPromocao(promocao);
    setIsViewMode(true);
    setDialogOpen(true);
  };

  const handleDeleteClick = (promocao: Promocao) => {
    setPromocaoToDelete(promocao);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!promocaoToDelete) return;

    try {
      const { error } = await supabase
        .from("promocoes_indicacao")
        .delete()
        .eq("id", promocaoToDelete.id);

      if (error) throw error;

      toast({
        title: "Promoção excluída",
        description: "A promoção foi removida com sucesso.",
      });
      fetchPromocoes();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setPromocaoToDelete(null);
    }
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedPromocao(null);
    setIsViewMode(false);
    fetchPromocoes();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatDate = (date: string) => {
    return parseLocalDateTime(date).toLocaleDateString("pt-BR");
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      ATIVA: { label: "Ativa", variant: "default" },
      ENCERRADA: { label: "Encerrada", variant: "secondary" },
      CANCELADA: { label: "Cancelada", variant: "destructive" },
    };
    const config = statusConfig[status] || { label: status, variant: "outline" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const isPromocaoActive = (promocao: Promocao) => {
    const today = new Date();
    const inicio = parseLocalDateTime(promocao.data_inicio);
    const fim = parseLocalDateTime(promocao.data_fim);
    return promocao.status === "ATIVA" && today >= inicio && today <= fim;
  };

  const filteredPromocoes = promocoes.filter((p) => {
    const matchesSearch = p.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.descricao?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
    const matchesStatus = statusFilter === "todos" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: promocoes.length,
    ativas: promocoes.filter((p) => isPromocaoActive(p)).length,
    encerradas: promocoes.filter((p) => p.status === "ENCERRADA").length,
    totalBonus: promocoes.reduce((acc, p) => {
      const parts = participantes[p.id] || [];
      const bonusPago = parts.filter((part) => part.bonus_pago).length * p.valor_bonus;
      return acc + bonusPago;
    }, 0),
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Megaphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ativas</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">{stats.ativas}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Encerradas</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.encerradas}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bônus Pagos</CardTitle>
            <Gift className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{formatCurrency(stats.totalBonus)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <div className="flex-1 w-full md:max-w-sm">
          <SearchInput
            placeholder="Buscar por nome..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onAdd={() => {
              setSelectedPromocao(null);
              setIsViewMode(false);
              setDialogOpen(true);
            }}
            addButtonLabel="Nova Promoção"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="ATIVA">Ativa</SelectItem>
            <SelectItem value="ENCERRADA">Encerrada</SelectItem>
            <SelectItem value="CANCELADA">Cancelada</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex gap-1">
          <Button
            variant={viewMode === "cards" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewMode("cards")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewMode("list")}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {filteredPromocoes.length === 0 ? (
        <Card className="p-12 text-center">
          <Megaphone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Nenhuma promoção encontrada</h3>
          <p className="text-muted-foreground mb-4">
            {searchTerm || statusFilter !== "todos"
              ? "Tente ajustar os filtros de busca"
              : "Comece criando sua primeira promoção de indicação"}
          </p>
          <Button onClick={() => {
            setSelectedPromocao(null);
            setIsViewMode(false);
            setDialogOpen(true);
          }}>
            <Megaphone className="h-4 w-4 mr-2" />
            Nova Promoção
          </Button>
        </Card>
      ) : viewMode === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPromocoes.map((promocao) => (
            <PromocaoCard
              key={promocao.id}
              promocao={promocao}
              participantes={participantes[promocao.id] || []}
              onView={() => handleView(promocao)}
              onEdit={() => handleEdit(promocao)}
              onDelete={() => handleDeleteClick(promocao)}
              formatCurrency={formatCurrency}
              formatDate={formatDate}
              getStatusBadge={getStatusBadge}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredPromocoes.map((promocao) => (
            <Card key={promocao.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Megaphone className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-semibold">{promocao.nome}</div>
                    <div className="text-sm text-muted-foreground">
                      {formatDate(promocao.data_inicio)} - {formatDate(promocao.data_fim)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-semibold text-primary">
                      {formatCurrency(promocao.valor_bonus)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Meta: {promocao.meta_parceiros} parceiros
                    </div>
                  </div>
                  {getStatusBadge(promocao.status)}
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleView(promocao)}>
                      Ver
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(promocao)}>
                      Editar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteClick(promocao)}>
                      Excluir
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Dialogs */}
      <PromocaoDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        promocao={selectedPromocao}
        isViewMode={isViewMode}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a promoção "{promocaoToDelete?.nome}"?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
