import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { BarChart3, History, RefreshCcw } from "lucide-react";
import { FluxoFinanceiroOperacional } from "./FluxoFinanceiroOperacional";
import { HistoricoMovimentacoes } from "./HistoricoMovimentacoes";
import { ConciliacaoSaldos } from "./ConciliacaoSaldos";
import type { PendingTransaction } from "@/hooks/usePendingTransactions";

interface LabelInfo {
  primary: string;
  secondary?: string;
  badgeLabel?: string;
  badgeColor?: string;
  BadgeIcon?: any;
}

interface CaixaTabsContainerProps {
  transacoes: any[];
  pendingTransactions?: PendingTransaction[];
  parceiros: { [key: string]: string };
  contas: { [key: string]: string };
  contasBancarias: Array<{ id: string; banco: string; titular: string }>;
  wallets: { [key: string]: string };
  walletsDetalhes: Array<{ id: string; exchange: string; endereco: string; network: string; parceiro_id: string }>;
  bookmakers: { [key: string]: { nome: string; status: string; projeto_id?: string } };
  loading: boolean;
  filtroTipo: string;
  setFiltroTipo: (tipo: string) => void;
  filtroProjeto: string;
  setFiltroProjeto: (projeto: string) => void;
  filtroParceiro: string;
  setFiltroParceiro: (parceiro: string) => void;
  projetos: Array<{ id: string; nome: string }>;
  parceirosLista: Array<{ id: string; nome: string }>;
  dataInicio: Date | undefined;
  setDataInicio: (date: Date | undefined) => void;
  dataFim: Date | undefined;
  setDataFim: (date: Date | undefined) => void;
  getTransacoesFiltradas: () => any[];
  getTipoLabel: (tipo: string, transacao?: any) => string;
  getTipoColor: (tipo: string, transacao?: any) => string;
  getOrigemLabel: (transacao: any) => string;
  getDestinoLabel: (transacao: any) => string;
  getOrigemInfo?: (transacao: any) => LabelInfo;
  getDestinoInfo?: (transacao: any) => LabelInfo;
  formatCurrency: (value: number, currency: string) => string;
  onConfirmarSaque?: (transacao: any) => void;
  saldoBookmakers: number;
  onRefresh: () => void;
  initialTab?: string;
}

export function CaixaTabsContainer({
  transacoes,
  pendingTransactions = [],
  parceiros,
  contas,
  contasBancarias,
  wallets,
  walletsDetalhes,
  bookmakers,
  loading,
  filtroTipo,
  setFiltroTipo,
  filtroProjeto,
  setFiltroProjeto,
  filtroParceiro,
  setFiltroParceiro,
  projetos,
  parceirosLista,
  dataInicio,
  setDataInicio,
  dataFim,
  setDataFim,
  getTransacoesFiltradas,
  getTipoLabel,
  getTipoColor,
  getOrigemLabel,
  getDestinoLabel,
  getOrigemInfo,
  getDestinoInfo,
  formatCurrency,
  onConfirmarSaque,
  saldoBookmakers,
  onRefresh,
  initialTab = "analise",
}: CaixaTabsContainerProps) {
  // Conta transações pendentes de conciliação
  // Usa pendingTransactions do hook (busca global sem filtro de data)
  // Filtra apenas DEPOSITO (SAQUE tem fluxo separado de confirmação)
  const pendingCount = pendingTransactions.filter(
    (t) => t.tipo_transacao === "DEPOSITO"
  ).length;

  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <Tabs defaultValue={initialTab} className="w-full">
        <div className="px-4 pt-4 border-b border-border/50">
          <TabsList className="bg-muted/30">
            <TabsTrigger value="analise" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Análise Financeira
            </TabsTrigger>
            <TabsTrigger value="historico" className="gap-2">
              <History className="h-4 w-4" />
              Histórico
            </TabsTrigger>
            <TabsTrigger value="conciliacao" className="gap-2 relative">
              <RefreshCcw className="h-4 w-4" />
              Conciliação
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                  {pendingCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="analise" className="mt-0 p-4">
          <FluxoFinanceiroOperacional
            transacoes={transacoes}
            dataInicio={dataInicio}
            dataFim={dataFim}
            setDataInicio={setDataInicio}
            setDataFim={setDataFim}
            saldoBookmakers={saldoBookmakers}
          />
        </TabsContent>

        <TabsContent value="historico" className="mt-0">
          <HistoricoMovimentacoes
            transacoes={transacoes}
            parceiros={parceiros}
            contas={contas}
            contasBancarias={contasBancarias}
            wallets={wallets}
            walletsDetalhes={walletsDetalhes}
            bookmakers={bookmakers}
            loading={loading}
            filtroTipo={filtroTipo}
            setFiltroTipo={setFiltroTipo}
            filtroProjeto={filtroProjeto}
            setFiltroProjeto={setFiltroProjeto}
            filtroParceiro={filtroParceiro}
            setFiltroParceiro={setFiltroParceiro}
            projetos={projetos}
            parceirosLista={parceirosLista}
            dataInicio={dataInicio}
            setDataInicio={setDataInicio}
            dataFim={dataFim}
            setDataFim={setDataFim}
            getTransacoesFiltradas={getTransacoesFiltradas}
            getTipoLabel={getTipoLabel}
            getTipoColor={getTipoColor}
            getOrigemLabel={getOrigemLabel}
            getDestinoLabel={getDestinoLabel}
            getOrigemInfo={getOrigemInfo}
            getDestinoInfo={getDestinoInfo}
            formatCurrency={formatCurrency}
            onConfirmarSaque={onConfirmarSaque}
          />
        </TabsContent>

        <TabsContent value="conciliacao" className="mt-0 p-4">
          <ConciliacaoSaldos
            transacoes={pendingTransactions}
            bookmakers={bookmakers}
            wallets={wallets}
            walletsDetalhes={walletsDetalhes}
            parceiros={parceiros}
            contasBancarias={contasBancarias}
            onRefresh={onRefresh}
          />
        </TabsContent>
      </Tabs>
    </Card>
  );
}
