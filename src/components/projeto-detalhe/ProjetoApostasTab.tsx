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
import { ResultadoPill } from "@/components/projeto-detalhe/ResultadoPill";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ProjetoApostasTabProps {
  projetoId: string;
  onDataChange?: () => void;
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

export function ProjetoApostasTab({ projetoId, onDataChange }: ProjetoApostasTabProps) {
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
      case "MEIO_GREEN": return "bg-teal-500/20 text-teal-400 border-teal-500/30";
      case "MEIO_RED": return "bg-orange-500/20 text-orange-400 border-orange-500/30";
      case "VOID": return "bg-gray-500/20 text-gray-400 border-gray-500/30";
      case "HALF": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      default: return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    }
  };

  const getResultadoLabel = (resultado: string | null) => {
    switch (resultado) {
      case "MEIO_GREEN": return "Meio Green";
      case "MEIO_RED": return "Meio Red";
      default: return resultado;
    }
  };

  const parseLocalDateTime = (dateString: string): Date => {
    if (!dateString) return new Date();
    // Remove timezone info e trata como horário local
    const cleanDate = dateString.replace(/\+00:00$/, '').replace(/Z$/, '').replace(/\+\d{2}:\d{2}$/, '');
    const [datePart, timePart] = cleanDate.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hours, minutes] = (timePart || '00:00').split(':').map(Number);
    return new Date(year, month - 1, day, hours || 0, minutes || 0);
  };

  const getFirstLastName = (fullName: string): string => {
    if (!fullName) return "";
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${parts[parts.length - 1]}`;
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
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => setViewMode(viewMode === "cards" ? "list" : "cards")}
            >
              {viewMode === "cards" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
            </Button>
            <Button onClick={() => handleOpenDialog(null)} size="sm" className="h-9">
              <Plus className="mr-1 h-4 w-4" />
              Nova Aposta
            </Button>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px] h-9">
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
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue placeholder="Resultado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="GREEN">Green</SelectItem>
                <SelectItem value="RED">Red</SelectItem>
                <SelectItem value="MEIO_GREEN">Meio Green</SelectItem>
                <SelectItem value="MEIO_RED">Meio Red</SelectItem>
                <SelectItem value="VOID">Void</SelectItem>
              </SelectContent>
            </Select>
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredApostas.map((aposta) => (
            <Card 
              key={aposta.id} 
              className="hover:border-primary/50 transition-colors"
            >
              <CardHeader className="pb-1 pt-3 px-3">
                <div className="flex items-start justify-between gap-2">
                  <div 
                    className="min-w-0 flex-1 cursor-pointer"
                    onClick={() => handleOpenDialog(aposta)}
                  >
                    <CardTitle className="text-sm truncate">{aposta.evento}</CardTitle>
                    <p className="text-xs text-muted-foreground truncate">{aposta.esporte}</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0 items-center">
                    {aposta.modo_entrada === "LAYBACK" && (
                      <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-[10px] px-1.5 py-0">
                        <ArrowLeftRight className="h-2.5 w-2.5 mr-0.5" />
                        LB
                      </Badge>
                    )}
                    <ResultadoPill
                      apostaId={aposta.id}
                      bookmarkerId={aposta.bookmaker_id}
                      resultado={aposta.resultado}
                      status={aposta.status}
                      stake={aposta.stake}
                      odd={aposta.odd}
                      onResultadoUpdated={fetchApostas}
                      onEditClick={() => handleOpenDialog(aposta)}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-1 pb-3 px-3" onClick={() => handleOpenDialog(aposta)}>
                <div className="space-y-1 cursor-pointer">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground truncate flex-1">{aposta.selecao}</span>
                    <span className="font-medium ml-2">@{aposta.odd.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Stake:</span>
                    <span className="font-medium">{formatCurrency(aposta.stake)}</span>
                  </div>
                  {aposta.lucro_prejuizo !== null && (
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
                      <span className="text-muted-foreground">P/L:</span>
                      <div className="flex items-center gap-2">
                        <span className={`font-medium flex items-center gap-0.5 ${aposta.lucro_prejuizo >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                          {aposta.lucro_prejuizo >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {formatCurrency(aposta.lucro_prejuizo)}
                        </span>
                        <span className={`text-[10px] px-1 py-0.5 rounded ${aposta.lucro_prejuizo >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                          {((aposta.lucro_prejuizo / aposta.stake) * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-2.5 w-2.5" />
                      {format(parseLocalDateTime(aposta.data_aposta), "dd/MM HH:mm", { locale: ptBR })}
                    </span>
                    {aposta.bookmaker && (
                      <span className="truncate ml-2">
                        {aposta.bookmaker.nome}
                        {aposta.bookmaker.parceiro?.nome && (
                          <> - {getFirstLastName(aposta.bookmaker.parceiro.nome)}</>
                        )}
                      </span>
                    )}
                  </div>
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
                  className="flex items-center justify-between p-4 hover:bg-muted/50"
                >
                  <div 
                    className="flex items-center gap-4 flex-1 cursor-pointer"
                    onClick={() => handleOpenDialog(aposta)}
                  >
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Target className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">
                        {aposta.evento}
                        {aposta.bookmaker && (
                          <span className="text-muted-foreground font-normal text-sm ml-2">
                            • {aposta.bookmaker.nome}
                            {aposta.bookmaker.parceiro?.nome && (
                              <> - {getFirstLastName(aposta.bookmaker.parceiro.nome)}</>
                            )}
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {aposta.esporte} • {aposta.selecao} @ {aposta.odd.toFixed(2)} • {format(parseLocalDateTime(aposta.data_aposta), "dd/MM HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-medium">{formatCurrency(aposta.stake)}</p>
                      {aposta.lucro_prejuizo !== null && (
                        <div className="flex items-center justify-end gap-2">
                          <p className={`text-sm ${aposta.lucro_prejuizo >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {formatCurrency(aposta.lucro_prejuizo)}
                          </p>
                          <span className={`text-[10px] px-1 py-0.5 rounded ${aposta.lucro_prejuizo >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                            {((aposta.lucro_prejuizo / aposta.stake) * 100).toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </div>
                    <ResultadoPill
                      apostaId={aposta.id}
                      bookmarkerId={aposta.bookmaker_id}
                      resultado={aposta.resultado}
                      status={aposta.status}
                      stake={aposta.stake}
                      odd={aposta.odd}
                      onResultadoUpdated={fetchApostas}
                      onEditClick={() => handleOpenDialog(aposta)}
                    />
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
        onSuccess={() => {
          fetchApostas();
          onDataChange?.();
        }}
      />
    </div>
  );
}