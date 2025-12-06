import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { 
  Plus, 
  Search, 
  Target,
  Calendar,
  TrendingUp,
  TrendingDown,
  LayoutGrid,
  List,
  ArrowLeftRight
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ApostaDialog } from "@/components/projeto-detalhe/ApostaDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ProjetoApostasTabProps {
  projetoId: string;
}

interface Aposta {
  id: string;
  data_aposta: string;
  esporte: string;
  evento: string;
  mercado: string | null;
  selecao: string;
  odd: number;
  stake: number;
  estrategia: string | null;
  status: string;
  resultado: string | null;
  valor_retorno: number | null;
  lucro_prejuizo: number | null;
  observacoes: string | null;
  bookmaker_id: string;
  modo_entrada?: string;
  lay_exchange?: string | null;
  lay_odd?: number | null;
  lay_stake?: number | null;
  lay_liability?: number | null;
  bookmaker?: {
    nome: string;
    parceiro_id: string;
    parceiro?: {
      nome: string;
    };
  };
}

export function ProjetoApostasTab({ projetoId }: ProjetoApostasTabProps) {
  const [apostas, setApostas] = useState<Aposta[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [resultadoFilter, setResultadoFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedAposta, setSelectedAposta] = useState<Aposta | null>(null);

  useEffect(() => {
    fetchApostas();
  }, [projetoId]);

  const fetchApostas = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("apostas")
        .select(`
          *,
          bookmaker:bookmakers (
            nome,
            parceiro_id,
            parceiro:parceiros (nome)
          )
        `)
        .eq("projeto_id", projetoId)
        .order("data_aposta", { ascending: false });

      if (error) throw error;
      setApostas(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar apostas: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredApostas = apostas.filter((aposta) => {
    const matchesSearch = 
      aposta.evento.toLowerCase().includes(searchTerm.toLowerCase()) ||
      aposta.esporte.toLowerCase().includes(searchTerm.toLowerCase()) ||
      aposta.selecao.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || aposta.status === statusFilter;
    const matchesResultado = resultadoFilter === "all" || aposta.resultado === resultadoFilter;
    return matchesSearch && matchesStatus && matchesResultado;
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getResultadoColor = (resultado: string | null) => {
    switch (resultado) {
      case "GREEN": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "RED": return "bg-red-500/20 text-red-400 border-red-500/30";
      case "VOID": return "bg-gray-500/20 text-gray-400 border-gray-500/30";
      case "HALF": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      default: return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "PENDENTE": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "REALIZADA": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "CONCLUIDA": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      default: return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  const handleOpenDialog = (aposta: Aposta | null) => {
    setSelectedAposta(aposta);
    setDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filtros e Ações */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por evento, esporte, seleção..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Status</SelectItem>
                <SelectItem value="PENDENTE">Pendente</SelectItem>
                <SelectItem value="REALIZADA">Realizada</SelectItem>
                <SelectItem value="CONCLUIDA">Concluída</SelectItem>
              </SelectContent>
            </Select>
            <Select value={resultadoFilter} onValueChange={setResultadoFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Resultado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="GREEN">Green</SelectItem>
                <SelectItem value="RED">Red</SelectItem>
                <SelectItem value="VOID">Void</SelectItem>
                <SelectItem value="HALF">Half</SelectItem>
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
            <Button onClick={() => handleOpenDialog(null)}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Aposta
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Apostas */}
      {filteredApostas.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-10">
              <Target className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">Nenhuma aposta encontrada</h3>
              <p className="text-muted-foreground">
                {searchTerm || statusFilter !== "all" || resultadoFilter !== "all"
                  ? "Tente ajustar os filtros"
                  : "Registre sua primeira aposta"}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : viewMode === "cards" ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredApostas.map((aposta) => (
            <Card 
              key={aposta.id} 
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => handleOpenDialog(aposta)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{aposta.evento}</CardTitle>
                    <p className="text-sm text-muted-foreground">{aposta.esporte}</p>
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    {aposta.modo_entrada === "LAYBACK" && (
                      <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                        <ArrowLeftRight className="h-3 w-3 mr-1" />
                        LayBack
                      </Badge>
                    )}
                    <Badge className={getStatusColor(aposta.status)}>
                      {aposta.status}
                    </Badge>
                    {aposta.resultado && (
                      <Badge className={getResultadoColor(aposta.resultado)}>
                        {aposta.resultado}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Seleção:</span>
                    <span className="font-medium">{aposta.selecao}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Odd:</span>
                    <span className="font-medium">{aposta.odd.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Stake:</span>
                    <span className="font-medium">{formatCurrency(aposta.stake)}</span>
                  </div>
                  {aposta.lucro_prejuizo !== null && (
                    <div className="flex items-center justify-between text-sm pt-2 border-t">
                      <span className="text-muted-foreground">Lucro/Prejuízo:</span>
                      <span className={`font-medium flex items-center gap-1 ${aposta.lucro_prejuizo >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {aposta.lucro_prejuizo >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {formatCurrency(aposta.lucro_prejuizo)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(aposta.data_aposta), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </div>
                  {aposta.bookmaker && (
                    <div className="text-xs text-muted-foreground">
                      {aposta.bookmaker.nome} • {aposta.bookmaker.parceiro?.nome}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <ScrollArea className="h-[600px]">
            <div className="divide-y">
              {filteredApostas.map((aposta) => (
                <div
                  key={aposta.id}
                  className="flex items-center justify-between p-4 hover:bg-muted/50 cursor-pointer"
                  onClick={() => handleOpenDialog(aposta)}
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Target className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{aposta.evento}</p>
                      <p className="text-sm text-muted-foreground">
                        {aposta.esporte} • {aposta.selecao} @ {aposta.odd.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-medium">{formatCurrency(aposta.stake)}</p>
                      {aposta.lucro_prejuizo !== null && (
                        <p className={`text-sm ${aposta.lucro_prejuizo >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                          {formatCurrency(aposta.lucro_prejuizo)}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Badge className={getStatusColor(aposta.status)}>
                        {aposta.status}
                      </Badge>
                      {aposta.resultado && (
                        <Badge className={getResultadoColor(aposta.resultado)}>
                          {aposta.resultado}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>
      )}

      {/* Dialog */}
      <ApostaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        aposta={selectedAposta}
        projetoId={projetoId}
        onSuccess={fetchApostas}
      />
    </div>
  );
}