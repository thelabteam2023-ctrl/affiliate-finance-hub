import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { BarChart3, History, RefreshCcw } from "lucide-react";
import { FluxoFinanceiroOperacional } from "./FluxoFinanceiroOperacional";
import { HistoricoMovimentacoes } from "./HistoricoMovimentacoes";
import { ConciliacaoSaldos } from "./ConciliacaoSaldos";

interface CaixaTabsContainerProps {
  transacoes: any[];
  parceiros: { [key: string]: string };
  contas: { [key: string]: string };
  contasBancarias: Array<{ id: string; banco: string; titular: string }>;
  wallets: { [key: string]: string };
  walletsDetalhes: Array<{ id: string; exchange: string; endereco: string; network: string; parceiro_id: string }>;
  bookmakers: { [key: string]: { nome: string; status: string } };
  loading: boolean;
  filtroTipo: string;
  setFiltroTipo: (tipo: string) => void;
  dataInicio: Date | undefined;
  setDataInicio: (date: Date | undefined) => void;
  dataFim: Date | undefined;
  setDataFim: (date: Date | undefined) => void;
  getTransacoesFiltradas: () => any[];
  getTipoLabel: (tipo: string, transacao?: any) => string;
  getTipoColor: (tipo: string, transacao?: any) => string;
  getOrigemLabel: (transacao: any) => string;
  getDestinoLabel: (transacao: any) => string;
  formatCurrency: (value: number, currency: string) => string;
  onConfirmarSaque?: (transacao: any) => void;
  saldoBookmakers: number;
  onRefresh: () => void;
}

export function CaixaTabsContainer({
  transacoes,
  parceiros,
  contas,
  contasBancarias,
  wallets,
  walletsDetalhes,
  bookmakers,
  loading,
  filtroTipo,
  setFiltroTipo,
  dataInicio,
  setDataInicio,
  dataFim,
  setDataFim,
  getTransacoesFiltradas,
  getTipoLabel,
  getTipoColor,
  getOrigemLabel,
  getDestinoLabel,
  formatCurrency,
  onConfirmarSaque,
  saldoBookmakers,
  onRefresh,
}: CaixaTabsContainerProps) {
  // Conta transações pendentes de conciliação
  // Suporta tanto "pendente" (minúsculo) quanto "PENDENTE" (maiúsculo)
  const pendingCount = transacoes.filter(
    (t) => 
      (t.status === "pendente" || t.status === "PENDENTE") && 
      t.tipo_moeda === "CRYPTO" &&
      (t.tipo_transacao === "DEPOSITO" || t.tipo_transacao === "SAQUE")
  ).length;

  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <Tabs defaultValue="analise" className="w-full">
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
            dataInicio={dataInicio}
            setDataInicio={setDataInicio}
            dataFim={dataFim}
            setDataFim={setDataFim}
            getTransacoesFiltradas={getTransacoesFiltradas}
            getTipoLabel={getTipoLabel}
            getTipoColor={getTipoColor}
            getOrigemLabel={getOrigemLabel}
            getDestinoLabel={getDestinoLabel}
            formatCurrency={formatCurrency}
            onConfirmarSaque={onConfirmarSaque}
          />
        </TabsContent>

        <TabsContent value="conciliacao" className="mt-0 p-4">
          <ConciliacaoSaldos
            transacoes={transacoes}
            bookmakers={bookmakers}
            wallets={wallets}
            walletsDetalhes={walletsDetalhes}
            parceiros={parceiros}
            onRefresh={onRefresh}
          />
        </TabsContent>
      </Tabs>
    </Card>
  );
}
