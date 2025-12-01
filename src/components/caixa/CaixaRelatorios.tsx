import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { ChartBar, User, List } from "lucide-react";
import { RelatorioROI } from "./RelatorioROI";
import { HistoricoInvestidor } from "./HistoricoInvestidor";
import { HistoricoMovimentacoes } from "./HistoricoMovimentacoes";

interface CaixaRelatoriosProps {
  transacoes: any[];
  parceiros: { [key: string]: string };
  contas: { [key: string]: string };
  contasBancarias: Array<{ id: string; banco: string; titular: string }>;
  wallets: { [key: string]: string };
  bookmakers: { [key: string]: string };
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
}

export function CaixaRelatorios(props: CaixaRelatoriosProps) {
  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <Tabs defaultValue="movimentacoes" className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
          <TabsTrigger
            value="movimentacoes"
            className="flex items-center gap-2 data-[state=active]:bg-transparent"
          >
            <List className="h-4 w-4" />
            Movimentações
          </TabsTrigger>
          <TabsTrigger
            value="roi"
            className="flex items-center gap-2 data-[state=active]:bg-transparent"
          >
            <ChartBar className="h-4 w-4" />
            ROI Investidores
          </TabsTrigger>
          <TabsTrigger
            value="historico-investidor"
            className="flex items-center gap-2 data-[state=active]:bg-transparent"
          >
            <User className="h-4 w-4" />
            Histórico Investidor
          </TabsTrigger>
        </TabsList>

        <TabsContent value="movimentacoes" className="mt-0">
          <HistoricoMovimentacoes {...props} />
        </TabsContent>

        <TabsContent value="roi" className="mt-0">
          <RelatorioROI />
        </TabsContent>

        <TabsContent value="historico-investidor" className="mt-0">
          <HistoricoInvestidor />
        </TabsContent>
      </Tabs>
    </Card>
  );
}
