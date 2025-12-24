import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { 
  Plus, 
  Search, 
  Gift, 
  Target,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calculator,
  Eye,
  Edit,
  Trash2,
  CheckCircle,
  Clock,
  XCircle,
  LayoutGrid,
  List
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MatchedBettingRoundDialog } from "./MatchedBettingRoundDialog";
import { MatchedBettingCalculator } from "./MatchedBettingCalculator";
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

interface PernaFromJson {
  bookmaker_id: string;
  bookmaker_nome?: string;
  tipo_aposta: string;
  selecao: string;
  odd: number;
  stake: number;
  is_free_bet?: boolean;
  resultado?: string | null;
  lucro_prejuizo?: number | null;
}

interface Round {
  id: string;
  tipo_round: string;
  evento: string;
  esporte: string;
  mercado: string;
  data_evento: string;
  status: string;
  lucro_esperado: number | null;
  lucro_real: number | null;
  promocao_id: string | null;
  created_at: string;
  pernas: PernaFromJson[];
}

interface Resumo {
  total_rounds: number;
  rounds_concluidos: number;
  qualifying_bets: number;
  free_bets: number;
  lucro_total: number;
  lucro_medio: number;
  taxa_sucesso: number;
}

interface ProjetoMatchedBettingTabProps {
  projetoId: string;
}

export function ProjetoMatchedBettingTab({ projetoId }: ProjetoMatchedBettingTabProps) {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTipo, setFilterTipo] = useState("TODOS");
  const [filterStatus, setFilterStatus] = useState("TODOS");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [selectedRound, setSelectedRound] = useState<Round | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [roundToDelete, setRoundToDelete] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [projetoId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch rounds from apostas_unificada where forma_registro = 'MATCHED_BETTING'
      const { data: roundsData, error: roundsError } = await supabase
        .from("apostas_unificada")
        .select("*")
        .eq("projeto_id", projetoId)
        .eq("forma_registro", "MATCHED_BETTING")
        .order("created_at", { ascending: false });

      if (roundsError) throw roundsError;

      // Transform data to Round interface
      const transformedRounds: Round[] = (roundsData || []).map((row) => {
        const pernas = Array.isArray(row.pernas) ? (row.pernas as unknown as PernaFromJson[]) : [];
        return {
          id: row.id,
          tipo_round: row.modelo || "QUALIFYING_BET",
          evento: row.evento || "",
          esporte: row.esporte || "",
          mercado: row.mercado || "",
          data_evento: row.data_aposta,
          status: row.status,
          lucro_esperado: row.lucro_esperado,
          lucro_real: row.lucro_prejuizo,
          promocao_id: null,
          created_at: row.created_at,
          pernas,
        };
      });

      setRounds(transformedRounds);

      // Calculate resumo from the fetched data
      const totalRounds = transformedRounds.length;
      const roundsConcluidos = transformedRounds.filter(r => r.status === "LIQUIDADA").length;
      const qualifyingBets = transformedRounds.filter(r => r.tipo_round === "QUALIFYING_BET").length;
      const freeBets = transformedRounds.filter(r => r.tipo_round === "FREE_BET").length;
      const lucroTotal = transformedRounds.reduce((acc, r) => acc + (r.lucro_real || 0), 0);
      const lucroMedio = roundsConcluidos > 0 ? lucroTotal / roundsConcluidos : 0;
      const taxaSucesso = totalRounds > 0 ? (roundsConcluidos / totalRounds) * 100 : 0;

      setResumo({
        total_rounds: totalRounds,
        rounds_concluidos: roundsConcluidos,
        qualifying_bets: qualifyingBets,
        free_bets: freeBets,
        lucro_total: lucroTotal,
        lucro_medio: lucroMedio,
        taxa_sucesso: taxaSucesso,
      });

    } catch (error: any) {
      toast.error("Erro ao carregar dados: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!roundToDelete) return;
    
    try {
      const { error } = await supabase
        .from("apostas_unificada")
        .delete()
        .eq("id", roundToDelete);

      if (error) throw error;
      toast.success("Round excluído com sucesso");
      fetchData();
    } catch (error: any) {
      toast.error("Erro ao excluir: " + error.message);
    } finally {
      setDeleteDialogOpen(false);
      setRoundToDelete(null);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getTipoLabel = (tipo: string) => {
    switch (tipo) {
      case "QUALIFYING_BET": return "Qualifying Bet";
      case "FREE_BET": return "Free Bet";
      case "CASHBACK_EXTRACTION": return "Cashback";
      default: return tipo;
    }
  };

  const getTipoColor = (tipo: string) => {
    switch (tipo) {
      case "QUALIFYING_BET": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "FREE_BET": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "CASHBACK_EXTRACTION": return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      default: return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "CONCLUIDO": return <CheckCircle className="h-4 w-4 text-emerald-500" />;
      case "PENDENTE": return <Clock className="h-4 w-4 text-yellow-500" />;
      case "EM_ANDAMENTO": return <Target className="h-4 w-4 text-blue-500" />;
      case "CANCELADO": return <XCircle className="h-4 w-4 text-red-500" />;
      default: return null;
    }
  };

  const filteredRounds = rounds.filter((round) => {
    const matchesSearch = round.evento.toLowerCase().includes(searchTerm.toLowerCase()) ||
      round.esporte.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTipo = filterTipo === "TODOS" || round.tipo_round === filterTipo;
    const matchesStatus = filterStatus === "TODOS" || round.status === filterStatus;
    return matchesSearch && matchesTipo && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Rounds</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resumo?.total_rounds || 0}</div>
            <div className="flex gap-2 text-xs text-muted-foreground">
              <span>{resumo?.qualifying_bets || 0} QB</span>
              <span>|</span>
              <span>{resumo?.free_bets || 0} FB</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lucro Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(resumo?.lucro_total || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {formatCurrency(resumo?.lucro_total || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Média: {formatCurrency(resumo?.lucro_medio || 0)}/round
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Sucesso</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">
              {(resumo?.taxa_sucesso || 0).toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              {resumo?.rounds_concluidos || 0} rounds concluídos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Calculadora</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => setCalculatorOpen(true)}
            >
              <Calculator className="mr-2 h-4 w-4" />
              Abrir Calculadora
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-1 gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar evento..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select value={filterTipo} onValueChange={setFilterTipo}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todos os Tipos</SelectItem>
              <SelectItem value="QUALIFYING_BET">Qualifying Bet</SelectItem>
              <SelectItem value="FREE_BET">Free Bet</SelectItem>
              <SelectItem value="CASHBACK_EXTRACTION">Cashback</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todos os Status</SelectItem>
              <SelectItem value="PENDENTE">Pendente</SelectItem>
              <SelectItem value="EM_ANDAMENTO">Em Andamento</SelectItem>
              <SelectItem value="CONCLUIDO">Concluído</SelectItem>
              <SelectItem value="CANCELADO">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setViewMode(viewMode === "cards" ? "list" : "cards")}
          >
            {viewMode === "cards" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
          </Button>
          <Button onClick={() => { setSelectedRound(null); setDialogOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Round
          </Button>
        </div>
      </div>

      {/* Rounds List */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : filteredRounds.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Gift className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nenhum round encontrado</h3>
            <p className="text-sm text-muted-foreground">
              Comece criando seu primeiro round de Matched Betting
            </p>
            <Button className="mt-4" onClick={() => { setSelectedRound(null); setDialogOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />
              Criar Primeiro Round
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === "cards" ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredRounds.map((round) => (
            <Card key={round.id} className="hover:border-primary/50 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <Badge className={getTipoColor(round.tipo_round)}>
                      {getTipoLabel(round.tipo_round)}
                    </Badge>
                    <CardTitle className="text-base mt-2">{round.evento}</CardTitle>
                    <CardDescription>{round.esporte} • {round.mercado}</CardDescription>
                  </div>
                  {getStatusIcon(round.status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  {format(new Date(round.data_evento), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </div>
                
                {/* Pernas */}
                {round.pernas && round.pernas.length > 0 && (
                  <div className="space-y-2">
                    {round.pernas.map((perna, idx) => (
                      <div key={idx} className="flex justify-between items-center text-sm bg-muted/50 rounded px-2 py-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {perna.tipo_aposta}
                          </Badge>
                          <span className="truncate max-w-[100px]">{perna.bookmaker_nome || "—"}</span>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">@{perna.odd}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatCurrency(perna.stake)}
                            {perna.is_free_bet && <Gift className="inline ml-1 h-3 w-3 text-emerald-500" />}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-between items-center pt-2 border-t">
                  <div>
                    <div className="text-xs text-muted-foreground">Lucro Esperado</div>
                    <div className={`font-medium ${(round.lucro_esperado || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {formatCurrency(round.lucro_esperado || 0)}
                    </div>
                  </div>
                  {round.status === "CONCLUIDO" && (
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Lucro Real</div>
                      <div className={`font-medium ${(round.lucro_real || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {formatCurrency(round.lucro_real || 0)}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setSelectedRound(round); setDialogOpen(true); }}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setRoundToDelete(round.id); setDeleteDialogOpen(true); }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {filteredRounds.map((round) => (
                <div key={round.id} className="flex items-center justify-between p-4 hover:bg-muted/50">
                  <div className="flex items-center gap-4">
                    {getStatusIcon(round.status)}
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge className={getTipoColor(round.tipo_round)}>
                          {getTipoLabel(round.tipo_round)}
                        </Badge>
                        <span className="font-medium">{round.evento}</span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {round.esporte} • {round.mercado} • {format(new Date(round.data_evento), "dd/MM HH:mm")}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className={`font-medium ${(round.lucro_esperado || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {formatCurrency(round.lucro_esperado || 0)}
                      </div>
                      <div className="text-xs text-muted-foreground">esperado</div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { setSelectedRound(round); setDialogOpen(true); }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { setRoundToDelete(round.id); setDeleteDialogOpen(true); }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Round Dialog */}
      <MatchedBettingRoundDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projetoId={projetoId}
        round={selectedRound}
        onSuccess={fetchData}
      />

      {/* Calculator Dialog */}
      <MatchedBettingCalculator
        open={calculatorOpen}
        onOpenChange={setCalculatorOpen}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Round</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este round? Esta ação não pode ser desfeita.
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
