
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrencyValue, getCurrencySymbol } from "@/types/currency";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CurrencyBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: string;
  currency: string;
  workspaceId: string | null;
}

export function CurrencyBreakdownModal({ isOpen, onClose, category, currency, workspaceId }: CurrencyBreakdownModalProps) {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['currency-breakdown', category, currency, workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];

      let result: any[] = [];

      if (category === "Bookmakers" || category === "Broker") {
        const isBroker = category === "Broker";
        const { data } = await supabase
          .from("bookmakers")
          .select("nome, saldo_atual, moeda, parceiro:parceiros(nome)")
          .eq("workspace_id", workspaceId)
          .eq("moeda", currency)
          .eq("is_broker_account", isBroker)
          .in("status", ["ativo", "limitada", "AGUARDANDO_SAQUE"]);
        
        result = data?.map(d => ({
          nome: d.nome,
          parceiro: (d.parceiro as any)?.nome || 'N/A',
          valor: d.saldo_atual || 0
        })) || [];
      } else if (category === "Contas Parceiros" || category === "Caixa Operacional") {
        const isCaixa = category === "Caixa Operacional";
        
        if (currency === "CRYPTO") {
          // Para Caixa Operacional Crypto (USD)
          const { data } = await supabase
            .from("v_saldo_parceiro_wallets")
            .select("exchange, saldo_usd, parceiro_nome, parceiro_id")
            .eq("workspace_id", workspaceId);
          
          // Precisamos verificar is_caixa_operacional dos parceiros
          const { data: partners } = await supabase
            .from("parceiros")
            .select("id, is_caixa_operacional")
            .eq("workspace_id", workspaceId);
          
          result = data
            ?.filter(d => {
              const p = partners?.find(p => p.id === d.parceiro_id);
              return isCaixa ? p?.is_caixa_operacional === true : p?.is_caixa_operacional === false;
            })
            .map(d => ({
              nome: d.exchange || 'Wallet',
              parceiro: d.parceiro_nome || 'N/A',
              valor: d.saldo_usd || 0
            })) || [];
        } else {
          // FIAT
          const { data } = await supabase
            .from("v_saldo_parceiro_contas")
            .select("banco, saldo, parceiro_nome, parceiro_id, moeda")
            .eq("workspace_id", workspaceId)
            .eq("moeda", currency);
          
          const { data: partners } = await supabase
            .from("parceiros")
            .select("id, is_caixa_operacional")
            .eq("workspace_id", workspaceId);

          result = data
            ?.filter(d => {
              const p = partners?.find(p => p.id === d.parceiro_id);
              return isCaixa ? p?.is_caixa_operacional === true : p?.is_caixa_operacional === false;
            })
            .map(d => ({
              nome: d.banco || 'Conta',
              parceiro: d.parceiro_nome || 'N/A',
              valor: d.saldo || 0
            })) || [];
        }
      } else if (category === "Wallets Parceiros") {
        // Wallets Parceiros (USD)
        const { data } = await supabase
          .from("v_saldo_parceiro_wallets")
          .select("exchange, saldo_usd, parceiro_nome, parceiro_id")
          .eq("workspace_id", workspaceId);
        
        const { data: partners } = await supabase
          .from("parceiros")
          .select("id, is_caixa_operacional")
          .eq("workspace_id", workspaceId);
        
        result = data
          ?.filter(d => {
            const p = partners?.find(p => p.id === d.parceiro_id);
            return p?.is_caixa_operacional === false;
          })
          .map(d => ({
            nome: d.exchange || 'Wallet',
            parceiro: d.parceiro_nome || 'N/A',
            valor: d.saldo_usd || 0
          })) || [];
      }

      return result.sort((a, b) => b.valor - a.valor);
    },
    enabled: isOpen && !!workspaceId,
  });

  const totalConsolidado = items.reduce((sum, item) => sum + item.valor, 0);
  const symbol = currency === "CRYPTO" ? "$" : getCurrencySymbol(currency);
  const displayCurrency = currency === "CRYPTO" ? "USD" : currency;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-card border-border/50 text-card-foreground">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            {displayCurrency} — {symbol} {totalConsolidado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          <ScrollArea className="h-[400px] pr-4">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableHead className="text-muted-foreground">Nome</TableHead>
                  <TableHead className="text-muted-foreground">Parceiro</TableHead>
                  <TableHead className="text-right text-muted-foreground">Valor</TableHead>
                  <TableHead className="text-right text-muted-foreground">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : items.length > 0 ? (
                  items.map((item, index) => {
                    const percentual = totalConsolidado > 0 ? (item.valor / totalConsolidado) * 100 : 0;
                    return (
                      <TableRow key={index} className="hover:bg-muted/30 border-border/50">
                        <TableCell className="font-medium">{item.nome}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{item.parceiro}</TableCell>
                        <TableCell className="text-right font-mono">
                          {symbol} {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {percentual.toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      Nenhum registro encontrado para esta moeda.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>

        <DialogFooter className="flex items-center justify-between border-t border-border/50 pt-4 mt-2">
          <div className="text-sm text-muted-foreground">
            Total Consolidado
          </div>
          <div className="text-lg font-bold font-mono">
            {symbol} {totalConsolidado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}