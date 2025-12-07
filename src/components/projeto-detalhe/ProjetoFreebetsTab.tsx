import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Gift, Search, Building2, User, Calendar, Target, CheckCircle2, Clock, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ProjetoFreebetsTabProps {
  projetoId: string;
}

interface FreebetRecebida {
  id: string;
  bookmaker_id: string;
  bookmaker_nome: string;
  parceiro_nome: string | null;
  logo_url: string | null;
  valor: number;
  motivo: string;
  data_recebida: string;
  utilizada: boolean;
  data_utilizacao: string | null;
  aposta_id: string | null;
}

interface BookmakerComFreebet {
  id: string;
  nome: string;
  parceiro_nome: string | null;
  logo_url: string | null;
  saldo_freebet: number;
}

export function ProjetoFreebetsTab({ projetoId }: ProjetoFreebetsTabProps) {
  const [loading, setLoading] = useState(true);
  const [migrando, setMigrando] = useState(false);
  const [freebets, setFreebets] = useState<FreebetRecebida[]>([]);
  const [bookmakersComFreebet, setBookmakersComFreebet] = useState<BookmakerComFreebet[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todas" | "disponiveis" | "utilizadas">("todas");
  const [casaFilter, setCasaFilter] = useState<string>("todas");

  useEffect(() => {
    fetchData();
  }, [projetoId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      await Promise.all([fetchFreebets(), fetchBookmakersComFreebet()]);
    } finally {
      setLoading(false);
    }
  };

  const fetchFreebets = async () => {
    try {
      const { data, error } = await supabase
        .from("freebets_recebidas")
        .select(`
          id,
          bookmaker_id,
          valor,
          motivo,
          data_recebida,
          utilizada,
          data_utilizacao,
          aposta_id,
          bookmakers!freebets_recebidas_bookmaker_id_fkey (
            nome,
            parceiro_id,
            parceiros!bookmakers_parceiro_id_fkey (nome),
            bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url)
          )
        `)
        .eq("projeto_id", projetoId)
        .order("data_recebida", { ascending: false });

      if (error) throw error;

      const formatted: FreebetRecebida[] = (data || []).map((fb: any) => ({
        id: fb.id,
        bookmaker_id: fb.bookmaker_id,
        bookmaker_nome: fb.bookmakers?.nome || "Desconhecida",
        parceiro_nome: fb.bookmakers?.parceiros?.nome || null,
        logo_url: fb.bookmakers?.bookmakers_catalogo?.logo_url || null,
        valor: fb.valor,
        motivo: fb.motivo,
        data_recebida: fb.data_recebida,
        utilizada: fb.utilizada || false,
        data_utilizacao: fb.data_utilizacao,
        aposta_id: fb.aposta_id,
      }));

      setFreebets(formatted);
    } catch (error: any) {
      console.error("Erro ao buscar freebets:", error);
    }
  };

  const fetchBookmakersComFreebet = async () => {
    try {
      const { data, error } = await supabase
        .from("bookmakers")
        .select(`
          id,
          nome,
          saldo_freebet,
          parceiros!bookmakers_parceiro_id_fkey (nome),
          bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url)
        `)
        .eq("projeto_id", projetoId)
        .gt("saldo_freebet", 0);

      if (error) throw error;

      const formatted: BookmakerComFreebet[] = (data || []).map((bk: any) => ({
        id: bk.id,
        nome: bk.nome,
        parceiro_nome: bk.parceiros?.nome || null,
        logo_url: bk.bookmakers_catalogo?.logo_url || null,
        saldo_freebet: bk.saldo_freebet || 0,
      }));

      setBookmakersComFreebet(formatted);
    } catch (error: any) {
      console.error("Erro ao buscar bookmakers com freebet:", error);
    }
  };

  // Migrar dados existentes: apostas com gerou_freebet=true que não têm registro em freebets_recebidas
  const migrarFreebetsExistentes = async () => {
    try {
      setMigrando(true);

      // Buscar apostas com gerou_freebet=true deste projeto
      const { data: apostas, error: apostasError } = await supabase
        .from("apostas")
        .select("id, bookmaker_id, valor_freebet_gerada, data_aposta, user_id")
        .eq("projeto_id", projetoId)
        .eq("gerou_freebet", true)
        .gt("valor_freebet_gerada", 0);

      if (apostasError) throw apostasError;

      if (!apostas || apostas.length === 0) {
        toast.info("Nenhuma aposta com freebet encontrada para migrar");
        return;
      }

      // Buscar freebets já registradas
      const { data: existentes } = await supabase
        .from("freebets_recebidas")
        .select("aposta_id")
        .eq("projeto_id", projetoId);

      const apostaIdsExistentes = new Set((existentes || []).map(e => e.aposta_id));

      // Filtrar apostas que ainda não têm registro
      const apostasParaMigrar = apostas.filter(a => !apostaIdsExistentes.has(a.id));

      if (apostasParaMigrar.length === 0) {
        toast.info("Todas as freebets já estão registradas");
        await fetchData();
        return;
      }

      // Criar registros em freebets_recebidas
      const registros = apostasParaMigrar.map(aposta => ({
        user_id: aposta.user_id,
        projeto_id: projetoId,
        bookmaker_id: aposta.bookmaker_id,
        valor: aposta.valor_freebet_gerada,
        motivo: "Aposta qualificadora (migrado)",
        data_recebida: aposta.data_aposta,
        utilizada: false,
        aposta_id: aposta.id,
      }));

      const { error: insertError } = await supabase
        .from("freebets_recebidas")
        .insert(registros);

      if (insertError) throw insertError;

      // Atualizar saldo_freebet dos bookmakers
      const saldoPorBookmaker: Record<string, number> = {};
      for (const aposta of apostasParaMigrar) {
        saldoPorBookmaker[aposta.bookmaker_id] = 
          (saldoPorBookmaker[aposta.bookmaker_id] || 0) + (aposta.valor_freebet_gerada || 0);
      }

      for (const [bookmakerId, valorAdicional] of Object.entries(saldoPorBookmaker)) {
        const { data: bk } = await supabase
          .from("bookmakers")
          .select("saldo_freebet")
          .eq("id", bookmakerId)
          .maybeSingle();

        if (bk) {
          await supabase
            .from("bookmakers")
            .update({ saldo_freebet: (bk.saldo_freebet || 0) + valorAdicional })
            .eq("id", bookmakerId);
        }
      }

      toast.success(`${apostasParaMigrar.length} freebet(s) migrada(s) com sucesso!`);
      await fetchData();
    } catch (error: any) {
      toast.error("Erro ao migrar freebets: " + error.message);
    } finally {
      setMigrando(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  // Filtros
  const casasDisponiveis = [...new Set(freebets.map(f => f.bookmaker_nome))];
  
  const freebetsFiltradas = freebets.filter(fb => {
    // Filtro de status
    if (statusFilter === "disponiveis" && fb.utilizada) return false;
    if (statusFilter === "utilizadas" && !fb.utilizada) return false;
    
    // Filtro de casa
    if (casaFilter !== "todas" && fb.bookmaker_nome !== casaFilter) return false;
    
    // Filtro de busca
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return (
        fb.bookmaker_nome.toLowerCase().includes(search) ||
        fb.parceiro_nome?.toLowerCase().includes(search) ||
        fb.motivo.toLowerCase().includes(search)
      );
    }
    
    return true;
  });

  // KPIs
  const totalFreebetDisponivel = bookmakersComFreebet.reduce((acc, bk) => acc + bk.saldo_freebet, 0);
  const casasComFreebet = bookmakersComFreebet.length;
  const freebetsUtilizadas = freebets.filter(f => f.utilizada).length;
  const freebetsDisponiveis = freebets.filter(f => !f.utilizada).length;

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Freebet Disponível</CardTitle>
            <Gift className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">{formatCurrency(totalFreebetDisponivel)}</div>
            <p className="text-xs text-muted-foreground">
              Total disponível para uso
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Casas com Freebet</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{casasComFreebet}</div>
            <p className="text-xs text-muted-foreground">
              Bookmakers com saldo
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Freebets Recebidas</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{freebets.length}</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-emerald-400">{freebetsDisponiveis} disponíveis</span>
              {" · "}
              <span className="text-muted-foreground">{freebetsUtilizadas} utilizadas</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ações</CardTitle>
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              size="sm"
              onClick={migrarFreebetsExistentes}
              disabled={migrando}
              className="w-full"
            >
              {migrando ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Migrando...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Sincronizar Freebets
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Migra freebets de apostas antigas
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Casas com Saldo de Freebet */}
      {bookmakersComFreebet.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Gift className="h-4 w-4 text-amber-400" />
              Saldo de Freebet por Casa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {bookmakersComFreebet.map(bk => (
                <div
                  key={bk.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                >
                  {bk.logo_url ? (
                    <img
                      src={bk.logo_url}
                      alt={bk.nome}
                      className="h-10 w-10 rounded-lg object-contain bg-white p-1"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{bk.nome}</p>
                    {bk.parceiro_nome && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {bk.parceiro_nome}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-amber-400">
                      {formatCurrency(bk.saldo_freebet)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por casa, parceiro, motivo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas</SelectItem>
            <SelectItem value="disponiveis">Disponíveis</SelectItem>
            <SelectItem value="utilizadas">Utilizadas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={casaFilter} onValueChange={setCasaFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Casa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as Casas</SelectItem>
            {casasDisponiveis.map(casa => (
              <SelectItem key={casa} value={casa}>{casa}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabela de Freebets */}
      <Card>
        <CardContent className="p-0">
          {freebetsFiltradas.length === 0 ? (
            <div className="text-center py-12">
              <Gift className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">Nenhuma freebet encontrada</h3>
              <p className="text-muted-foreground">
                {freebets.length === 0 
                  ? "Freebets geradas por apostas aparecerão aqui"
                  : "Nenhuma freebet corresponde aos filtros"
                }
              </p>
              {freebets.length === 0 && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={migrarFreebetsExistentes}
                  disabled={migrando}
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${migrando ? "animate-spin" : ""}`} />
                  Sincronizar Freebets Existentes
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Casa</TableHead>
                  <TableHead>Parceiro</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Data Recebida</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {freebetsFiltradas.map(fb => (
                  <TableRow key={fb.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {fb.logo_url ? (
                          <img
                            src={fb.logo_url}
                            alt={fb.bookmaker_nome}
                            className="h-8 w-8 rounded object-contain bg-white p-0.5"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                            <Building2 className="h-4 w-4" />
                          </div>
                        )}
                        <span className="font-medium">{fb.bookmaker_nome}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">
                        {fb.parceiro_nome || "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold text-amber-400">
                        {formatCurrency(fb.valor)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{fb.motivo}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(fb.data_recebida), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </div>
                    </TableCell>
                    <TableCell>
                      {fb.utilizada ? (
                        <Badge variant="secondary" className="bg-muted text-muted-foreground">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Utilizada
                          {fb.data_utilizacao && (
                            <span className="ml-1 text-[10px]">
                              ({format(new Date(fb.data_utilizacao), "dd/MM", { locale: ptBR })})
                            </span>
                          )}
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                          <Clock className="h-3 w-3 mr-1" />
                          Disponível
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
