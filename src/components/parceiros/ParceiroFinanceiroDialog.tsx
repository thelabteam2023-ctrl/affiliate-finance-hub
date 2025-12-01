import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { History, TrendingUp, ArrowRightLeft, Building2, ShieldCheck, ShieldAlert } from "lucide-react";

interface ParceiroFinanceiroDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parceiroId: string;
  parceiroNome: string;
  roiData: {
    total_depositado: number;
    total_sacado: number;
    lucro_prejuizo: number;
    roi_percentual: number;
    num_bookmakers: number;
    num_bookmakers_limitadas: number;
    saldo_bookmakers: number;
  } | null;
}

interface Transacao {
  id: string;
  tipo_transacao: string;
  valor: number;
  moeda: string;
  data_transacao: string;
  status: string;
  descricao: string | null;
  origem_bookmaker_id: string | null;
  destino_bookmaker_id: string | null;
}

interface BookmakerVinculado {
  id: string;
  nome: string;
  saldo_atual: number;
  status: string;
  moeda: string;
  login_username: string;
  bookmaker_catalogo_id: string | null;
  logo_url?: string;
}

interface BookmakerCatalogo {
  id: string;
  nome: string;
  logo_url: string | null;
  status: string;
}

export default function ParceiroFinanceiroDialog({
  open,
  onOpenChange,
  parceiroId,
  parceiroNome,
  roiData,
}: ParceiroFinanceiroDialogProps) {
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [bookmakerNames, setBookmakerNames] = useState<Map<string, string>>(new Map());
  const [bookmakersVinculados, setBookmakersVinculados] = useState<BookmakerVinculado[]>([]);
  const [bookmakersDisponiveis, setBookmakersDisponiveis] = useState<BookmakerCatalogo[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingBookmakers, setLoadingBookmakers] = useState(false);

  useEffect(() => {
    if (open) {
      fetchTransacoes();
      fetchBookmakers();
    }
  }, [open, parceiroId]);

  const fetchTransacoes = async () => {
    setLoading(true);
    try {
      // Fetch transactions
      const { data: transacoesData, error: transacoesError } = await supabase
        .from("cash_ledger")
        .select("*")
        .or(`origem_parceiro_id.eq.${parceiroId},destino_parceiro_id.eq.${parceiroId}`)
        .in("tipo_transacao", ["DEPOSITO", "SAQUE"])
        .eq("status", "CONFIRMADO")
        .order("data_transacao", { ascending: false });

      if (transacoesError) throw transacoesError;

      setTransacoes(transacoesData || []);

      // Fetch bookmaker names
      const bookmakerIds = new Set<string>();
      transacoesData?.forEach((t) => {
        if (t.origem_bookmaker_id) bookmakerIds.add(t.origem_bookmaker_id);
        if (t.destino_bookmaker_id) bookmakerIds.add(t.destino_bookmaker_id);
      });

      if (bookmakerIds.size > 0) {
        const { data: bookmakersData } = await supabase
          .from("bookmakers")
          .select("id, nome")
          .in("id", Array.from(bookmakerIds));

        const namesMap = new Map<string, string>();
        bookmakersData?.forEach((b) => namesMap.set(b.id, b.nome));
        setBookmakerNames(namesMap);
      }
    } catch (error) {
      console.error("Erro ao carregar transações:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getTipoLabel = (tipo: string) => {
    const labels: Record<string, string> = {
      DEPOSITO: "Depósito",
      SAQUE: "Saque",
    };
    return labels[tipo] || tipo;
  };

  const getTipoBadgeColor = (tipo: string) => {
    if (tipo === "DEPOSITO") return "bg-red-500/20 text-red-500 border-red-500/30";
    if (tipo === "SAQUE") return "bg-green-500/20 text-green-500 border-green-500/30";
    return "bg-gray-500/20 text-gray-500 border-gray-500/30";
  };

  const fetchBookmakers = async () => {
    setLoadingBookmakers(true);
    try {
      // Buscar bookmakers vinculados ao parceiro
      const { data: vinculadosData, error: vinculadosError } = await supabase
        .from("bookmakers")
        .select("id, nome, saldo_atual, status, moeda, login_username, bookmaker_catalogo_id")
        .eq("parceiro_id", parceiroId);

      if (vinculadosError) throw vinculadosError;

      // Buscar logos dos bookmakers vinculados
      const catalogoIds = vinculadosData
        ?.filter(b => b.bookmaker_catalogo_id)
        .map(b => b.bookmaker_catalogo_id as string) || [];

      let logosMap = new Map<string, string>();
      if (catalogoIds.length > 0) {
        const { data: catalogoData } = await supabase
          .from("bookmakers_catalogo")
          .select("id, logo_url")
          .in("id", catalogoIds);

        catalogoData?.forEach((c) => {
          if (c.logo_url) logosMap.set(c.id, c.logo_url);
        });
      }

      const vinculadosComLogo = vinculadosData?.map(b => ({
        ...b,
        logo_url: b.bookmaker_catalogo_id ? logosMap.get(b.bookmaker_catalogo_id) : undefined,
      })) || [];

      setBookmakersVinculados(vinculadosComLogo);

      // Buscar todos os bookmakers do catálogo
      const { data: catalogoData, error: catalogoError } = await supabase
        .from("bookmakers_catalogo")
        .select("id, nome, logo_url, status")
        .eq("status", "REGULAMENTADA");

      if (catalogoError) throw catalogoError;

      // Filtrar apenas os não vinculados
      const vinculadosCatalogoIds = new Set(
        vinculadosData?.map(b => b.bookmaker_catalogo_id).filter(Boolean) || []
      );

      const disponiveis = catalogoData?.filter(
        c => !vinculadosCatalogoIds.has(c.id)
      ) || [];

      setBookmakersDisponiveis(disponiveis);
    } catch (error) {
      console.error("Erro ao carregar bookmakers:", error);
    } finally {
      setLoadingBookmakers(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="text-xl">
            Informações Financeiras - {parceiroNome}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="financeiro" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="financeiro" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              Informações Financeiras
            </TabsTrigger>
            <TabsTrigger value="historico" className="gap-2">
              <History className="h-4 w-4" />
              Histórico de Movimentações
            </TabsTrigger>
            <TabsTrigger value="bookmakers" className="gap-2">
              <Building2 className="h-4 w-4" />
              Bookmakers
            </TabsTrigger>
          </TabsList>

          <TabsContent value="financeiro" className="mt-4">
            {roiData ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground mb-2">
                          Total Depositado
                        </p>
                        <p className="text-2xl font-bold">
                          {formatCurrency(roiData.total_depositado)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground mb-2">
                          Total Sacado
                        </p>
                        <p className="text-2xl font-bold">
                          {formatCurrency(roiData.total_sacado)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground mb-2">
                          Lucro/Prejuízo
                        </p>
                        <p
                          className={`text-2xl font-bold ${
                            roiData.lucro_prejuizo >= 0
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {formatCurrency(roiData.lucro_prejuizo)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground mb-2">ROI</p>
                        <p
                          className={`text-2xl font-bold ${
                            roiData.roi_percentual >= 0
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {roiData.roi_percentual.toFixed(2)}%
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground mb-2">
                          Bookmakers Ativos
                        </p>
                        <p className="text-xl font-bold text-green-600">
                          {roiData.num_bookmakers}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground mb-2">
                          Bookmakers Limitadas
                        </p>
                        <p className="text-xl font-bold text-yellow-600">
                          {roiData.num_bookmakers_limitadas}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground mb-2">
                          Total de Bookmakers
                        </p>
                        <p className="text-xl font-bold">
                          {roiData.num_bookmakers + roiData.num_bookmakers_limitadas}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t text-center">
                      <p className="text-sm text-muted-foreground mb-2">
                        Saldo Total em Bookmakers
                      </p>
                      <p className="text-2xl font-bold">
                        {formatCurrency(roiData.saldo_bookmakers)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">
                    Sem informações financeiras disponíveis
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="historico" className="mt-4">
            <ScrollArea className="h-[400px] pr-4">
              {loading ? (
                <div className="text-center py-12 text-muted-foreground">
                  Carregando...
                </div>
              ) : transacoes.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <p className="text-muted-foreground">
                      Nenhuma movimentação encontrada
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {transacoes.map((transacao) => (
                    <Card key={transacao.id} className="hover:bg-accent/50 transition-colors">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              <Badge className={getTipoBadgeColor(transacao.tipo_transacao)}>
                                {getTipoLabel(transacao.tipo_transacao)}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {transacao.moeda}
                              </Badge>
                            </div>

                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              {transacao.tipo_transacao === "DEPOSITO" && transacao.destino_bookmaker_id && (
                                <>
                                  <span>Caixa</span>
                                  <ArrowRightLeft className="h-3 w-3" />
                                  <span className="font-medium">
                                    {bookmakerNames.get(transacao.destino_bookmaker_id) || "Bookmaker"}
                                  </span>
                                </>
                              )}
                              {transacao.tipo_transacao === "SAQUE" && transacao.origem_bookmaker_id && (
                                <>
                                  <span className="font-medium">
                                    {bookmakerNames.get(transacao.origem_bookmaker_id) || "Bookmaker"}
                                  </span>
                                  <ArrowRightLeft className="h-3 w-3" />
                                  <span>Caixa</span>
                                </>
                              )}
                            </div>

                            {transacao.descricao && (
                              <p className="text-xs text-muted-foreground">
                                {transacao.descricao}
                              </p>
                            )}

                            <p className="text-xs text-muted-foreground">
                              {formatDate(transacao.data_transacao)}
                            </p>
                          </div>

                          <div className="text-right">
                            <p
                              className={`text-lg font-bold ${
                                transacao.tipo_transacao === "SAQUE"
                                  ? "text-green-600"
                                  : "text-red-600"
                              }`}
                            >
                              {transacao.tipo_transacao === "SAQUE" ? "+" : "-"}
                              {formatCurrency(transacao.valor)}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="bookmakers" className="mt-4">
            <ScrollArea className="h-[400px] pr-4">
              {loadingBookmakers ? (
                <div className="text-center py-12 text-muted-foreground">
                  Carregando...
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Bookmakers Vinculados */}
                  <div>
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-500" />
                      Casas Vinculadas ({bookmakersVinculados.length})
                    </h3>
                    {bookmakersVinculados.length === 0 ? (
                      <Card>
                        <CardContent className="py-8 text-center">
                          <p className="text-sm text-muted-foreground">
                            Nenhuma casa vinculada
                          </p>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="space-y-2">
                        {bookmakersVinculados.map((bookmaker) => (
                          <Card key={bookmaker.id} className="hover:bg-accent/50 transition-colors">
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-3 flex-1">
                                  {bookmaker.logo_url ? (
                                    <img
                                      src={bookmaker.logo_url}
                                      alt={bookmaker.nome}
                                      className="h-10 w-10 rounded object-contain"
                                      onError={(e) => {
                                        e.currentTarget.style.display = "none";
                                      }}
                                    />
                                  ) : (
                                    <div className="h-10 w-10 rounded bg-accent flex items-center justify-center">
                                      <Building2 className="h-5 w-5 text-muted-foreground" />
                                    </div>
                                  )}
                                  
                                  <div className="flex-1 space-y-2">
                                    <div>
                                      <p className="font-semibold">{bookmaker.nome}</p>
                                      <p className="text-xs text-muted-foreground">
                                        Login: {bookmaker.login_username}
                                      </p>
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                      <Badge 
                                        variant="outline"
                                        className={
                                          bookmaker.status === "ativo"
                                            ? "bg-emerald-500/20 text-emerald-500 border-emerald-500/30"
                                            : "bg-yellow-500/20 text-yellow-500 border-yellow-500/30"
                                        }
                                      >
                                        {bookmaker.status === "ativo" ? "ATIVO" : "LIMITADA"}
                                      </Badge>
                                      <Badge variant="outline" className="text-xs">
                                        {bookmaker.moeda}
                                      </Badge>
                                    </div>
                                  </div>
                                </div>

                                <div className="text-right">
                                  <p className="text-xs text-muted-foreground mb-1">Saldo</p>
                                  <p className="text-lg font-bold">
                                    {formatCurrency(bookmaker.saldo_atual)}
                                  </p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Bookmakers Disponíveis */}
                  <div>
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                      Casas Disponíveis para Vínculo ({bookmakersDisponiveis.length})
                    </h3>
                    {bookmakersDisponiveis.length === 0 ? (
                      <Card>
                        <CardContent className="py-8 text-center">
                          <p className="text-sm text-muted-foreground">
                            Todas as casas disponíveis já foram vinculadas
                          </p>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {bookmakersDisponiveis.map((bookmaker) => (
                          <Card key={bookmaker.id} className="hover:bg-accent/50 transition-colors">
                            <CardContent className="p-3">
                              <div className="flex items-center gap-2">
                                {bookmaker.logo_url ? (
                                  <img
                                    src={bookmaker.logo_url}
                                    alt={bookmaker.nome}
                                    className="h-8 w-8 rounded object-contain"
                                    onError={(e) => {
                                      e.currentTarget.style.display = "none";
                                    }}
                                  />
                                ) : (
                                  <div className="h-8 w-8 rounded bg-accent flex items-center justify-center">
                                    <Building2 className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                )}
                                <p className="text-sm font-medium">{bookmaker.nome}</p>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
