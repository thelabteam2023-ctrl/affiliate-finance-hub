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
import { History, TrendingUp, ArrowRight, Building2, ShieldCheck, ShieldAlert, Search, Plus, Edit2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { parseLocalDateTime } from "@/utils/dateUtils";

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
  onCreateVinculo?: (parceiroId: string, bookmakerId: string) => void;
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
  origem_tipo: string | null;
  destino_tipo: string | null;
  origem_parceiro_id: string | null;
  destino_parceiro_id: string | null;
  origem_conta_bancaria_id: string | null;
  destino_conta_bancaria_id: string | null;
  origem_wallet_id: string | null;
  destino_wallet_id: string | null;
  nome_investidor: string | null;
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
  onCreateVinculo,
}: ParceiroFinanceiroDialogProps) {
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [bookmakerNames, setBookmakerNames] = useState<Map<string, string>>(new Map());
  const [parceiroNames, setParceiroNames] = useState<Map<string, string>>(new Map());
  const [contasBancarias, setContasBancarias] = useState<Array<{ id: string; banco: string; titular: string; parceiro_id: string }>>([]);
  const [walletsCrypto, setWalletsCrypto] = useState<Array<{ id: string; exchange: string; endereco: string; parceiro_id: string }>>([]);
  const [bookmakersVinculados, setBookmakersVinculados] = useState<BookmakerVinculado[]>([]);
  const [bookmakersDisponiveis, setBookmakersDisponiveis] = useState<BookmakerCatalogo[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingBookmakers, setLoadingBookmakers] = useState(false);
  const [searchVinculados, setSearchVinculados] = useState("");
  const [searchDisponiveis, setSearchDisponiveis] = useState("");
  const [editingStatus, setEditingStatus] = useState<string | null>(null);
  const [showAllVinculados, setShowAllVinculados] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchTransacoes();
      fetchBookmakers();
    }
  }, [open, parceiroId]);

  const fetchTransacoes = async () => {
    setLoading(true);
    try {
      // Primeiro, buscar contas bancárias e wallets do parceiro
      const { data: contasDoParceiroData } = await supabase
        .from("contas_bancarias")
        .select("id")
        .eq("parceiro_id", parceiroId);

      const { data: walletsDoParceiroData } = await supabase
        .from("wallets_crypto")
        .select("id")
        .eq("parceiro_id", parceiroId);

      const contasIds = contasDoParceiroData?.map(c => c.id) || [];
      const walletsIds = walletsDoParceiroData?.map(w => w.id) || [];

      // Construir query para buscar transações relacionadas ao parceiro
      // Inclui: parceiro_id direto, contas bancárias do parceiro, wallets do parceiro
      let orConditions = [
        `origem_parceiro_id.eq.${parceiroId}`,
        `destino_parceiro_id.eq.${parceiroId}`
      ];

      // Adicionar condições para contas bancárias
      if (contasIds.length > 0) {
        orConditions.push(`origem_conta_bancaria_id.in.(${contasIds.join(',')})`);
        orConditions.push(`destino_conta_bancaria_id.in.(${contasIds.join(',')})`);
      }

      // Adicionar condições para wallets
      if (walletsIds.length > 0) {
        orConditions.push(`origem_wallet_id.in.(${walletsIds.join(',')})`);
        orConditions.push(`destino_wallet_id.in.(${walletsIds.join(',')})`);
      }

      const { data: transacoesData, error: transacoesError } = await supabase
        .from("cash_ledger")
        .select("*")
        .or(orConditions.join(','))
        .order("data_transacao", { ascending: false });

      if (transacoesError) throw transacoesError;

      setTransacoes(transacoesData || []);

      // Fetch bookmaker names
      const bookmakerIds = new Set<string>();
      const parceiroIds = new Set<string>();
      const contaIds = new Set<string>();
      const walletIds = new Set<string>();
      
      transacoesData?.forEach((t) => {
        if (t.origem_bookmaker_id) bookmakerIds.add(t.origem_bookmaker_id);
        if (t.destino_bookmaker_id) bookmakerIds.add(t.destino_bookmaker_id);
        if (t.origem_parceiro_id) parceiroIds.add(t.origem_parceiro_id);
        if (t.destino_parceiro_id) parceiroIds.add(t.destino_parceiro_id);
        if (t.origem_conta_bancaria_id) contaIds.add(t.origem_conta_bancaria_id);
        if (t.destino_conta_bancaria_id) contaIds.add(t.destino_conta_bancaria_id);
        if (t.origem_wallet_id) walletIds.add(t.origem_wallet_id);
        if (t.destino_wallet_id) walletIds.add(t.destino_wallet_id);
      });

      // Fetch bookmakers
      if (bookmakerIds.size > 0) {
        const { data: bookmakersData } = await supabase
          .from("bookmakers")
          .select("id, nome")
          .in("id", Array.from(bookmakerIds));

        const namesMap = new Map<string, string>();
        bookmakersData?.forEach((b) => namesMap.set(b.id, b.nome));
        setBookmakerNames(namesMap);
      }

      // Fetch parceiros
      if (parceiroIds.size > 0) {
        const { data: parceirosData } = await supabase
          .from("parceiros")
          .select("id, nome")
          .in("id", Array.from(parceiroIds));

        const namesMap = new Map<string, string>();
        parceirosData?.forEach((p) => namesMap.set(p.id, p.nome));
        setParceiroNames(namesMap);
      }

      // Fetch contas bancarias
      if (contaIds.size > 0) {
        const { data: contasData } = await supabase
          .from("contas_bancarias")
          .select("id, banco, titular, parceiro_id")
          .in("id", Array.from(contaIds));

        setContasBancarias(contasData || []);
      }

      // Fetch wallets crypto
      if (walletIds.size > 0) {
        const { data: walletsData } = await supabase
          .from("wallets_crypto")
          .select("id, exchange, endereco, parceiro_id")
          .in("id", Array.from(walletIds));

        setWalletsCrypto(walletsData || []);
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
    return parseLocalDateTime(date).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getTipoLabel = (tipo: string, transacao?: Transacao) => {
    if (tipo === "TRANSFERENCIA" && transacao) {
      // Verifica se o parceiro atual é origem ou destino
      const isOrigem = transacao.origem_parceiro_id === parceiroId;
      return isOrigem ? "Transferência Enviada" : "Transferência Recebida";
    }
    
    // Verificar se a transação foi recusada
    if (transacao?.status === "RECUSADO") {
      const labels: Record<string, string> = {
        DEPOSITO: "Depósito Recusado",
        SAQUE: "Saque Recusado",
        TRANSFERENCIA: "Transferência Recusada",
        APORTE_FINANCEIRO: "Aporte Recusado",
      };
      return labels[tipo] || `${tipo} Recusado`;
    }
    
    const labels: Record<string, string> = {
      DEPOSITO: "Depósito",
      SAQUE: "Saque",
      TRANSFERENCIA: "Transferência",
      APORTE_FINANCEIRO: "Aporte",
    };
    return labels[tipo] || tipo;
  };

  const getTipoBadgeColor = (tipo: string, status?: string) => {
    // Se recusado, mostrar em cinza/neutro
    if (status === "RECUSADO") {
      return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
    
    if (tipo === "DEPOSITO") return "bg-red-500/20 text-red-500 border-red-500/30";
    if (tipo === "SAQUE") return "bg-green-500/20 text-green-500 border-green-500/30";
    if (tipo === "TRANSFERENCIA") return "bg-blue-500/20 text-blue-500 border-blue-500/30";
    if (tipo === "APORTE_FINANCEIRO") return "bg-emerald-500/20 text-emerald-500 border-emerald-500/30";
    return "bg-gray-500/20 text-gray-500 border-gray-500/30";
  };

  // Filtrar e ordenar bookmakers vinculados por saldo (maior para menor)
  const filteredVinculados = bookmakersVinculados
    .filter((b) => b.nome.toLowerCase().includes(searchVinculados.toLowerCase()))
    .sort((a, b) => b.saldo_atual - a.saldo_atual);

  // Limitar a 8 casas se não estiver expandido
  const displayedVinculados = showAllVinculados ? filteredVinculados : filteredVinculados.slice(0, 8);
  const hasMoreVinculados = filteredVinculados.length > 8;

  // Filtrar bookmakers disponíveis
  const filteredDisponiveis = bookmakersDisponiveis.filter((b) =>
    b.nome.toLowerCase().includes(searchDisponiveis.toLowerCase())
  );

  const handleCreateVinculo = (bookmakerId: string) => {
    if (onCreateVinculo) {
      onCreateVinculo(parceiroId, bookmakerId);
      onOpenChange(false);
    }
  };

  const handleToggleStatus = async (bookmakerId: string, currentStatus: string) => {
    setEditingStatus(bookmakerId);
    const newStatus = currentStatus === "ativo" ? "limitada" : "ativo";
    
    try {
      const { error } = await supabase
        .from("bookmakers")
        .update({ status: newStatus })
        .eq("id", bookmakerId);

      if (error) throw error;

      toast({
        title: "Status atualizado",
        description: `Status alterado para ${newStatus.toUpperCase()}`,
      });

      // Refresh bookmakers list
      fetchBookmakers();
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar status",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setEditingStatus(null);
    }
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
                {/* KPIs Principais em linha: Depositado → Sacado → Saldo → Resultado */}
                <div className="grid grid-cols-4 gap-3">
                  {/* Depositado */}
                  <Card className="border-red-500/20">
                    <CardContent className="pt-4 pb-3">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-1">
                          Depositado
                        </p>
                        <p className="text-lg font-bold text-red-500">
                          {formatCurrency(roiData.total_depositado)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Sacado */}
                  <Card className="border-green-500/20">
                    <CardContent className="pt-4 pb-3">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-1">
                          Sacado
                        </p>
                        <p className="text-lg font-bold text-green-500">
                          {formatCurrency(roiData.total_sacado)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* SALDO ATUAL - Destaque principal */}
                  <Card className="border-primary/40 bg-primary/5 ring-1 ring-primary/20">
                    <CardContent className="pt-4 pb-3">
                      <div className="text-center">
                        <p className="text-xs text-primary/80 font-medium mb-1">
                          💰 Saldo Atual
                        </p>
                        <p className="text-xl font-bold text-primary">
                          {formatCurrency(roiData.saldo_bookmakers)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Resultado */}
                  <Card>
                    <CardContent className="pt-4 pb-3">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-1">
                          Resultado
                        </p>
                        <p
                          className={`text-lg font-bold ${
                            roiData.lucro_prejuizo >= 0
                              ? "text-emerald-500"
                              : "text-red-500"
                          }`}
                        >
                          {formatCurrency(roiData.lucro_prejuizo)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* ROI e estatísticas de bookmakers */}
                <div className="grid grid-cols-4 gap-3">
                  <Card>
                    <CardContent className="pt-4 pb-3">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-1">ROI</p>
                        <p
                          className={`text-lg font-bold ${
                            roiData.roi_percentual >= 0
                              ? "text-emerald-500"
                              : "text-red-500"
                          }`}
                        >
                          {roiData.roi_percentual.toFixed(2)}%
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-4 pb-3">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-1">
                          Casas Ativas
                        </p>
                        <p className="text-lg font-bold text-green-600">
                          {roiData.num_bookmakers}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-4 pb-3">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-1">
                          Casas Limitadas
                        </p>
                        <p className="text-lg font-bold text-yellow-600">
                          {roiData.num_bookmakers_limitadas}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-4 pb-3">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-1">
                          Total Casas
                        </p>
                        <p className="text-lg font-bold">
                          {roiData.num_bookmakers + roiData.num_bookmakers_limitadas}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
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
                              <Badge className={getTipoBadgeColor(transacao.tipo_transacao, transacao.status)}>
                                {getTipoLabel(transacao.tipo_transacao, transacao)}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {transacao.moeda}
                              </Badge>
                            </div>

                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              {/* Origem */}
                              <div className="flex items-center gap-2">
                                {transacao.tipo_transacao === "APORTE_FINANCEIRO" && transacao.destino_tipo === "CAIXA_OPERACIONAL" ? (
                                  <div className="flex flex-col">
                                    <span className="text-sm text-muted-foreground">Investidor</span>
                                    <span className="text-xs text-muted-foreground/70">
                                      {transacao.nome_investidor?.split(' ').slice(0, 2).join(' ') || 'Não informado'}
                                    </span>
                                  </div>
                                ) : transacao.origem_tipo === "PARCEIRO_CONTA" && transacao.origem_conta_bancaria_id ? (
                                  <div className="flex flex-col">
                                    <span className="text-sm font-medium">
                                      {contasBancarias.find(c => c.id === transacao.origem_conta_bancaria_id)?.banco || 'Conta Bancária'}
                                    </span>
                                    <span className="text-xs text-muted-foreground/70">
                                      {contasBancarias.find(c => c.id === transacao.origem_conta_bancaria_id)?.titular || ''}
                                    </span>
                                  </div>
                                ) : transacao.origem_tipo === "PARCEIRO_WALLET" && transacao.origem_wallet_id ? (
                                  <div className="flex flex-col">
                                    <span className="text-sm font-medium">
                                      {walletsCrypto.find(w => w.id === transacao.origem_wallet_id)?.exchange?.replace(/-/g, ' ').toUpperCase() || 'Wallet'}
                                    </span>
                                    <span className="text-xs text-muted-foreground/70">
                                      {parceiroNames.get(transacao.origem_parceiro_id || '') || ''}
                                    </span>
                                  </div>
                                ) : transacao.origem_tipo === "BOOKMAKER" && transacao.origem_bookmaker_id ? (
                                  <span className="font-medium">
                                    {bookmakerNames.get(transacao.origem_bookmaker_id) || "Bookmaker"}
                                  </span>
                                ) : transacao.origem_tipo === "CAIXA_OPERACIONAL" ? (
                                  <span>Caixa Operacional</span>
                                ) : null}
                              </div>
                              
                              {/* Seta direcional colorida */}
                              {(() => {
                                // Se recusado, seta cinza
                                if (transacao.status === "RECUSADO") {
                                  return <ArrowRight className="h-4 w-4 text-muted-foreground" />;
                                }
                                
                                // Determina se o parceiro RECEBE (entrada) ou ENVIA (saída)
                                const parceiroRecebe = 
                                  transacao.destino_parceiro_id === parceiroId ||
                                  (transacao.destino_conta_bancaria_id && 
                                    contasBancarias.some(c => c.id === transacao.destino_conta_bancaria_id && c.parceiro_id === parceiroId)) ||
                                  (transacao.destino_wallet_id && 
                                    walletsCrypto.some(w => w.id === transacao.destino_wallet_id && w.parceiro_id === parceiroId));
                                
                                const arrowColor = parceiroRecebe ? "text-green-500" : "text-red-500";
                                return <ArrowRight className={`h-4 w-4 ${arrowColor}`} />;
                              })()}
                              
                              {/* Destino */}
                              <div className="flex items-center gap-2">
                                {transacao.tipo_transacao === "APORTE_FINANCEIRO" && transacao.origem_tipo === "CAIXA_OPERACIONAL" ? (
                                  <div className="flex flex-col">
                                    <span className="text-sm text-muted-foreground">Investidor</span>
                                    <span className="text-xs text-muted-foreground/70">
                                      {transacao.nome_investidor?.split(' ').slice(0, 2).join(' ') || 'Não informado'}
                                    </span>
                                  </div>
                                ) : transacao.destino_tipo === "PARCEIRO_CONTA" && transacao.destino_conta_bancaria_id ? (
                                  <div className="flex flex-col">
                                    <span className="text-sm font-medium">
                                      {contasBancarias.find(c => c.id === transacao.destino_conta_bancaria_id)?.banco || 'Conta Bancária'}
                                    </span>
                                    <span className="text-xs text-muted-foreground/70">
                                      {contasBancarias.find(c => c.id === transacao.destino_conta_bancaria_id)?.titular || ''}
                                    </span>
                                  </div>
                                ) : transacao.destino_tipo === "PARCEIRO_WALLET" && transacao.destino_wallet_id ? (
                                  <div className="flex flex-col">
                                    <span className="text-sm font-medium">
                                      {walletsCrypto.find(w => w.id === transacao.destino_wallet_id)?.exchange?.replace(/-/g, ' ').toUpperCase() || 'Wallet'}
                                    </span>
                                    <span className="text-xs text-muted-foreground/70">
                                      {parceiroNames.get(transacao.destino_parceiro_id || '') || ''}
                                    </span>
                                  </div>
                                ) : transacao.destino_tipo === "BOOKMAKER" && transacao.destino_bookmaker_id ? (
                                  <span className="font-medium">
                                    {bookmakerNames.get(transacao.destino_bookmaker_id) || "Bookmaker"}
                                  </span>
                                ) : transacao.destino_tipo === "CAIXA_OPERACIONAL" ? (
                                  <span>Caixa Operacional</span>
                                ) : null}
                              </div>
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
                            {(() => {
                              // Se recusado, mostrar neutro (branco, sem sinal)
                              if (transacao.status === "RECUSADO") {
                                return (
                                  <p className="text-lg font-bold text-muted-foreground">
                                    {formatCurrency(transacao.valor)}
                                  </p>
                                );
                              }
                              
                              // Determina se o parceiro RECEBE (entrada) ou ENVIA (saída)
                              const parceiroRecebe = 
                                transacao.destino_parceiro_id === parceiroId ||
                                (transacao.destino_conta_bancaria_id && 
                                  contasBancarias.some(c => c.id === transacao.destino_conta_bancaria_id && c.parceiro_id === parceiroId)) ||
                                (transacao.destino_wallet_id && 
                                  walletsCrypto.some(w => w.id === transacao.destino_wallet_id && w.parceiro_id === parceiroId));
                              
                              const isEntrada = parceiroRecebe;
                              const colorClass = isEntrada ? "text-green-600" : "text-red-600";
                              const sinal = isEntrada ? "+" : "-";
                              
                              return (
                                <p className={`text-lg font-bold ${colorClass}`}>
                                  {sinal}{formatCurrency(transacao.valor)}
                                </p>
                              );
                            })()}
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
            {loadingBookmakers ? (
              <div className="text-center py-12 text-muted-foreground">
                Carregando...
              </div>
            ) : (
              <div className="grid grid-cols-[1fr_1px_1fr] gap-4">
                {/* Coluna 1: Bookmakers Vinculados */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-500" />
                      Casas Vinculadas ({filteredVinculados.length})
                    </h3>
                    {hasMoreVinculados && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowAllVinculados(!showAllVinculados)}
                        className="h-7 text-xs"
                      >
                        {showAllVinculados ? "Mostrar menos" : `+${filteredVinculados.length - 8} mais`}
                      </Button>
                    )}
                  </div>
                  
                  {/* Filtro de busca */}
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar casas vinculadas..."
                      value={searchVinculados}
                      onChange={(e) => setSearchVinculados(e.target.value)}
                      className="pl-9 h-9"
                    />
                  </div>

                  <ScrollArea className="h-[350px] pr-3">
                    {filteredVinculados.length === 0 ? (
                      <Card>
                        <CardContent className="py-8 text-center">
                          <p className="text-sm text-muted-foreground">
                            {searchVinculados ? "Nenhuma casa encontrada" : "Nenhuma casa vinculada"}
                          </p>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="space-y-1">
                        {displayedVinculados.map((bookmaker) => (
                          <div
                            key={bookmaker.id}
                            className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors border border-border/50 group"
                          >
                            {bookmaker.logo_url ? (
                              <img
                                src={bookmaker.logo_url}
                                alt={bookmaker.nome}
                                className="h-8 w-8 rounded object-contain flex-shrink-0"
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                }}
                              />
                            ) : (
                              <div className="h-8 w-8 rounded bg-accent flex items-center justify-center flex-shrink-0">
                                <Building2 className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="font-medium text-sm truncate">{bookmaker.nome}</p>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button
                                      className={`inline-flex items-center rounded-sm px-1 py-0 text-[9px] font-medium transition-all hover:opacity-70 cursor-pointer border ${
                                        bookmaker.status === "ativo"
                                          ? "bg-emerald-500/20 text-emerald-500 border-emerald-500/30"
                                          : "bg-yellow-500/20 text-yellow-500 border-yellow-500/30"
                                      }`}
                                      type="button"
                                    >
                                      {bookmaker.status === "ativo" ? "ATIVO" : "LIMITADA"}
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-64 p-4" align="end">
                                    <div className="space-y-3">
                                      <p className="text-sm font-medium">Alterar Status</p>
                                      <p className="text-xs text-muted-foreground">
                                        Deseja alterar o status de <strong>{bookmaker.nome}</strong> para{" "}
                                        <strong>{bookmaker.status === "ativo" ? "LIMITADA" : "ATIVO"}</strong>?
                                      </p>
                                      <Button
                                        size="sm"
                                        className="w-full"
                                        onClick={() => handleToggleStatus(bookmaker.id, bookmaker.status)}
                                        disabled={editingStatus === bookmaker.id}
                                      >
                                        {editingStatus === bookmaker.id ? "Alterando..." : "Confirmar"}
                                      </Button>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              </div>
                              <p className="text-xs text-muted-foreground truncate">
                                {bookmaker.login_username}
                              </p>
                            </div>
                            
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-bold">
                                {formatCurrency(bookmaker.saldo_atual)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </div>

                {/* Separador vertical */}
                <Separator orientation="vertical" className="h-full" />

                {/* Coluna 2: Bookmakers Disponíveis */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                      Casas Disponíveis ({filteredDisponiveis.length})
                    </h3>
                  </div>
                  
                  {/* Filtro de busca */}
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar casas disponíveis..."
                      value={searchDisponiveis}
                      onChange={(e) => setSearchDisponiveis(e.target.value)}
                      className="pl-9 h-9"
                    />
                  </div>

                  <ScrollArea className="h-[350px] pr-3">
                    {filteredDisponiveis.length === 0 ? (
                      <Card>
                        <CardContent className="py-8 text-center">
                          <p className="text-sm text-muted-foreground">
                            {searchDisponiveis ? "Nenhuma casa encontrada" : "Todas as casas já foram vinculadas"}
                          </p>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="space-y-1">
                        {filteredDisponiveis.map((bookmaker) => (
                          <div
                            key={bookmaker.id}
                            className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors border border-border/50 group"
                          >
                            {bookmaker.logo_url ? (
                              <img
                                src={bookmaker.logo_url}
                                alt={bookmaker.nome}
                                className="h-8 w-8 rounded object-contain flex-shrink-0"
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                }}
                              />
                            ) : (
                              <div className="h-8 w-8 rounded bg-accent flex items-center justify-center flex-shrink-0">
                                <Building2 className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            
                            <p className="text-sm font-medium flex-1 truncate">{bookmaker.nome}</p>
                            
                            {onCreateVinculo && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                onClick={() => handleCreateVinculo(bookmaker.id)}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
