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
  ArrowLeftRight,
  ArrowUp,
  ArrowDown,
  Shield,
  Coins,
  Gift,
  Layers,
  ChevronDown,
  Building2
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ApostaDialog } from "@/components/projeto-detalhe/ApostaDialog";
import { ApostaMultiplaDialog } from "@/components/projeto-detalhe/ApostaMultiplaDialog";
import { ResultadoPill } from "@/components/projeto-detalhe/ResultadoPill";
import { useProjectBonuses } from "@/hooks/useProjectBonuses";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface BonusApostasTabProps {
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
  lay_comissao?: number | null;
  back_comissao?: number | null;
  back_em_exchange?: boolean;
  gerou_freebet?: boolean;
  valor_freebet_gerada?: number | null;
  tipo_freebet?: string | null;
  is_bonus_bet?: boolean;
  bookmaker?: {
    nome: string;
    parceiro_id: string;
    bookmaker_catalogo_id?: string | null;
    parceiro?: {
      nome: string;
    };
    bookmakers_catalogo?: {
      logo_url: string | null;
    } | null;
  };
}

interface ApostaMultipla {
  id: string;
  tipo_multipla: string;
  stake: number;
  odd_final: number;
  retorno_potencial: number | null;
  lucro_prejuizo: number | null;
  valor_retorno: number | null;
  selecoes: { descricao: string; odd: string; resultado?: string }[];
  status: string;
  resultado: string | null;
  bookmaker_id: string;
  tipo_freebet: string | null;
  gerou_freebet: boolean;
  valor_freebet_gerada: number | null;
  data_aposta: string;
  observacoes: string | null;
  is_bonus_bet?: boolean;
  bookmaker?: {
    nome: string;
    parceiro_id: string;
    bookmaker_catalogo_id?: string | null;
    parceiro?: {
      nome: string;
    };
    bookmakers_catalogo?: {
      logo_url: string | null;
    } | null;
  };
}

type ApostaUnificada = {
  tipo: "simples" | "multipla";
  data: Aposta | ApostaMultipla;
  data_aposta: string;
};

export function BonusApostasTab({ projetoId }: BonusApostasTabProps) {
  const { getBookmakersWithActiveBonus } = useProjectBonuses({ projectId: projetoId });
  const bookmakersInBonusMode = getBookmakersWithActiveBonus();
  
  const [apostas, setApostas] = useState<Aposta[]>([]);
  const [apostasMultiplas, setApostasMultiplas] = useState<ApostaMultipla[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [resultadoFilter, setResultadoFilter] = useState<string>("all");
  const [tipoFilter, setTipoFilter] = useState<"todas" | "simples" | "multiplas">("todas");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMultiplaOpen, setDialogMultiplaOpen] = useState(false);
  const [selectedAposta, setSelectedAposta] = useState<Aposta | null>(null);
  const [selectedApostaMultipla, setSelectedApostaMultipla] = useState<ApostaMultipla | null>(null);
  const [bookmakers, setBookmakers] = useState<any[]>([]);

  useEffect(() => {
    fetchAllApostas();
  }, [projetoId, bookmakersInBonusMode]);

  const fetchAllApostas = async () => {
    try {
      setLoading(true);
      await Promise.all([fetchApostas(), fetchApostasMultiplas(), fetchBookmakers()]);
    } finally {
      setLoading(false);
    }
  };

  const fetchBookmakers = async () => {
    try {
      // Only fetch bookmakers in bonus mode
      if (bookmakersInBonusMode.length === 0) {
        setBookmakers([]);
        return;
      }

      const { data, error } = await supabase
        .from("bookmakers")
        .select(`
          id,
          nome,
          saldo_atual,
          saldo_freebet,
          parceiro:parceiros (nome),
          bookmakers_catalogo (logo_url)
        `)
        .eq("projeto_id", projetoId)
        .in("id", bookmakersInBonusMode)
        .in("status", ["ativo", "ATIVO", "LIMITADA", "limitada"]);

      if (error) throw error;
      setBookmakers(data || []);
    } catch (error: any) {
      console.error("Erro ao carregar bookmakers:", error.message);
    }
  };

  const fetchApostas = async () => {
    try {
      // If no bookmakers in bonus mode, no apostas to show
      if (bookmakersInBonusMode.length === 0) {
        setApostas([]);
        return;
      }

      const { data, error } = await supabase
        .from("apostas")
        .select(`
          *,
          bookmaker:bookmakers (
            nome,
            parceiro_id,
            bookmaker_catalogo_id,
            parceiro:parceiros (nome),
            bookmakers_catalogo (logo_url)
          )
        `)
        .eq("projeto_id", projetoId)
        .is("surebet_id", null)
        .or(`bookmaker_id.in.(${bookmakersInBonusMode.join(',')}),is_bonus_bet.eq.true`)
        .order("data_aposta", { ascending: false });

      if (error) throw error;
      setApostas(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar apostas: " + error.message);
    }
  };

  const fetchApostasMultiplas = async () => {
    try {
      // If no bookmakers in bonus mode, no apostas to show
      if (bookmakersInBonusMode.length === 0) {
        setApostasMultiplas([]);
        return;
      }

      const { data, error } = await supabase
        .from("apostas_multiplas")
        .select(`
          *,
          bookmaker:bookmakers (
            nome,
            parceiro_id,
            bookmaker_catalogo_id,
            parceiro:parceiros (nome),
            bookmakers_catalogo (logo_url)
          )
        `)
        .eq("projeto_id", projetoId)
        .or(`bookmaker_id.in.(${bookmakersInBonusMode.join(',')}),is_bonus_bet.eq.true`)
        .order("data_aposta", { ascending: false });

      if (error) throw error;
      
      setApostasMultiplas((data || []).map((am: any) => ({
        ...am,
        selecoes: Array.isArray(am.selecoes) ? am.selecoes : []
      })));
    } catch (error: any) {
      console.error("Erro ao carregar apostas múltiplas:", error.message);
    }
  };

  const handleApostaUpdated = () => {
    fetchAllApostas();
  };

  // Filter apostas
  const filteredApostas = apostas.filter((aposta) => {
    const matchesSearch = 
      aposta.evento.toLowerCase().includes(searchTerm.toLowerCase()) ||
      aposta.esporte.toLowerCase().includes(searchTerm.toLowerCase()) ||
      aposta.selecao.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || aposta.status === statusFilter;
    const matchesResultado = resultadoFilter === "all" || aposta.resultado === resultadoFilter;
    const matchesTipo = tipoFilter === "todas" || tipoFilter === "simples";
    return matchesSearch && matchesStatus && matchesResultado && matchesTipo;
  });

  // Filter multiplas
  const filteredMultiplas = apostasMultiplas.filter((am) => {
    const matchesSearch = am.selecoes.some(s => 
      s.descricao.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const matchesStatus = statusFilter === "all" || am.status === statusFilter;
    const matchesResultado = resultadoFilter === "all" || am.resultado === resultadoFilter;
    const matchesTipo = tipoFilter === "todas" || tipoFilter === "multiplas";
    return (searchTerm === "" || matchesSearch) && matchesStatus && matchesResultado && matchesTipo;
  });

  // Unify and sort
  const apostasUnificadas: ApostaUnificada[] = [
    ...filteredApostas.map(a => ({ tipo: "simples" as const, data: a, data_aposta: a.data_aposta })),
    ...filteredMultiplas.map(am => ({ tipo: "multipla" as const, data: am, data_aposta: am.data_aposta })),
  ].sort((a, b) => new Date(b.data_aposta).getTime() - new Date(a.data_aposta).getTime());

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const parseLocalDateTime = (dateString: string): Date => {
    if (!dateString) return new Date();
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

  const handleOpenMultiplaDialog = (aposta: ApostaMultipla | null) => {
    setSelectedApostaMultipla(aposta);
    setDialogMultiplaOpen(true);
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
      {/* Info Banner */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="py-3">
          <div className="flex items-center gap-2 text-sm">
            <Coins className="h-4 w-4 text-amber-400" />
            <span className="text-amber-400 font-medium">Modo Bônus:</span>
            <span className="text-muted-foreground">
              Mostrando apostas de {bookmakersInBonusMode.length} casa(s) com bônus ativo
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Filters & Actions */}
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="h-9 bg-amber-600 hover:bg-amber-700">
                  <Plus className="mr-1 h-4 w-4" />
                  Nova Aposta Bônus
                  <ChevronDown className="ml-1 h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleOpenDialog(null)}>
                  <Target className="mr-2 h-4 w-4" />
                  Aposta Simples
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleOpenMultiplaDialog(null)}>
                  <Layers className="mr-2 h-4 w-4" />
                  Aposta Múltipla
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
                <SelectItem value="LIQUIDADA">Liquidada</SelectItem>
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

      {/* Empty State */}
      {bookmakersInBonusMode.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-10">
              <Coins className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">Nenhuma casa em modo bônus</h3>
              <p className="text-muted-foreground">
                Adicione bônus a uma casa para ver apostas aqui
              </p>
            </div>
          </CardContent>
        </Card>
      ) : apostasUnificadas.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-10">
              <Target className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">Nenhuma aposta encontrada</h3>
              <p className="text-muted-foreground">
                {searchTerm || statusFilter !== "all" || resultadoFilter !== "all"
                  ? "Tente ajustar os filtros"
                  : "Registre sua primeira aposta bônus"}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {apostasUnificadas.map((item) => {
            if (item.tipo === "simples") {
              const aposta = item.data as Aposta;
              const parceiroNome = aposta.bookmaker?.parceiro?.nome ? getFirstLastName(aposta.bookmaker.parceiro.nome) : null;
              
              return (
                <Card 
                  key={aposta.id} 
                  className="hover:border-amber-500/50 transition-colors cursor-default border-amber-500/20"
                >
                  <CardHeader className="pb-1 pt-3 px-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-sm truncate">{aposta.evento}</CardTitle>
                        <p className="text-xs text-muted-foreground truncate">{aposta.esporte}</p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0 items-center">
                        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] px-1.5 py-0">
                          <Coins className="h-2.5 w-2.5 mr-0.5" />
                          Bônus
                        </Badge>
                        <ResultadoPill
                          apostaId={aposta.id}
                          bookmarkerId={aposta.bookmaker_id}
                          resultado={aposta.resultado}
                          status={aposta.status}
                          stake={aposta.stake}
                          odd={aposta.odd}
                          operationType="bookmaker"
                          gerouFreebet={aposta.gerou_freebet || false}
                          onResultadoUpdated={handleApostaUpdated}
                          onEditClick={() => handleOpenDialog(aposta)}
                        />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-1 pb-3 px-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground truncate flex-1">{aposta.selecao}</span>
                        <span className="font-medium ml-2">@{aposta.odd.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Stake:</span>
                        <span className="font-medium">{formatCurrency(aposta.stake)}</span>
                      </div>
                      
                      {aposta.lucro_prejuizo !== null && (
                        <div className="flex items-center justify-between text-xs pt-1 border-t">
                          <span className="text-muted-foreground">P/L:</span>
                          <span className={`font-medium ${aposta.lucro_prejuizo >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {aposta.lucro_prejuizo >= 0 ? <TrendingUp className="inline h-3 w-3 mr-0.5" /> : <TrendingDown className="inline h-3 w-3 mr-0.5" />}
                            {formatCurrency(aposta.lucro_prejuizo)}
                          </span>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-2 pt-1 border-t text-xs">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {format(parseLocalDateTime(aposta.data_aposta), "dd/MM HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                      
                      {/* Bookmaker info */}
                      <div className="flex items-center gap-2 pt-1 text-xs">
                        {aposta.bookmaker?.bookmakers_catalogo?.logo_url ? (
                          <img 
                            src={aposta.bookmaker.bookmakers_catalogo.logo_url} 
                            alt="" 
                            className="h-4 w-4 rounded object-contain bg-white"
                          />
                        ) : (
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="text-muted-foreground truncate">
                          {aposta.bookmaker?.nome}
                          {parceiroNome && ` · ${parceiroNome}`}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            }
            
            // Múltipla card
            const multipla = item.data as ApostaMultipla;
            return (
              <Card 
                key={multipla.id} 
                className="hover:border-amber-500/50 transition-colors cursor-default border-amber-500/20"
              >
                <CardHeader className="pb-1 pt-3 px-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-sm truncate flex items-center gap-1">
                        <Layers className="h-3 w-3" />
                        {multipla.tipo_multipla || 'Múltipla'}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">{multipla.selecoes.length} seleções</p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0 items-center">
                      <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] px-1.5 py-0">
                        <Coins className="h-2.5 w-2.5 mr-0.5" />
                        Bônus
                      </Badge>
                      <Badge 
                        className={`text-[10px] px-1.5 py-0 cursor-pointer ${
                          multipla.resultado === 'GREEN' ? 'bg-emerald-500/20 text-emerald-400' :
                          multipla.resultado === 'RED' ? 'bg-red-500/20 text-red-400' :
                          'bg-blue-500/20 text-blue-400'
                        }`}
                        onClick={() => handleOpenMultiplaDialog(multipla)}
                      >
                        {multipla.resultado || multipla.status}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-1 pb-3 px-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Odd:</span>
                      <span className="font-medium">@{multipla.odd_final.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Stake:</span>
                      <span className="font-medium">{formatCurrency(multipla.stake)}</span>
                    </div>
                    
                    {multipla.lucro_prejuizo !== null && (
                      <div className="flex items-center justify-between text-xs pt-1 border-t">
                        <span className="text-muted-foreground">P/L:</span>
                        <span className={`font-medium ${multipla.lucro_prejuizo >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                          {multipla.lucro_prejuizo >= 0 ? <TrendingUp className="inline h-3 w-3 mr-0.5" /> : <TrendingDown className="inline h-3 w-3 mr-0.5" />}
                          {formatCurrency(multipla.lucro_prejuizo)}
                        </span>
                      </div>
                    )}
                    
                    <div className="flex items-center gap-2 pt-1 border-t text-xs">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {format(parseLocalDateTime(multipla.data_aposta), "dd/MM HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialogs */}
      <ApostaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projetoId={projetoId}
        aposta={selectedAposta}
        onApostaCreated={handleApostaUpdated}
        onApostaUpdated={handleApostaUpdated}
      />

      <ApostaMultiplaDialog
        open={dialogMultiplaOpen}
        onOpenChange={setDialogMultiplaOpen}
        projetoId={projetoId}
        aposta={selectedApostaMultipla}
        onCreated={handleApostaUpdated}
        onUpdated={handleApostaUpdated}
      />
    </div>
  );
}
