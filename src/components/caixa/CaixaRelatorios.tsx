import { Card } from "@/components/ui/card";
import { HistoricoMovimentacoes } from "./HistoricoMovimentacoes";

interface CaixaRelatoriosProps {
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
}

export function CaixaRelatorios(props: CaixaRelatoriosProps) {
  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <HistoricoMovimentacoes {...props} />
    </Card>
  );
}
