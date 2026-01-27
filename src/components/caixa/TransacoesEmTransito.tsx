/**
 * Componente para exibir transações crypto em trânsito (PENDING)
 * e permitir confirmação ou reversão
 */

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useWalletTransitBalance } from "@/hooks/useWalletTransitBalance";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Loader2, 
  ArrowRightLeft, 
  Check, 
  X, 
  Clock,
  Wallet,
  Building2,
  RefreshCw
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface TransacaoEmTransito {
  id: string;
  data_transacao: string;
  valor_usd: number;
  descricao: string | null;
  origem_wallet_id: string | null;
  destino_bookmaker_id: string | null;
  coin: string | null;
  qtd_coin: number | null;
  // Dados adicionais do join
  wallet_exchange?: string;
  wallet_endereco?: string;
  bookmaker_nome?: string;
}

export function TransacoesEmTransito() {
  const { workspaceId } = useWorkspace();
  const { confirmTransit, revertTransit } = useWalletTransitBalance();
  
  const [transacoes, setTransacoes] = useState<TransacaoEmTransito[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);
  const [selectedTransacao, setSelectedTransacao] = useState<TransacaoEmTransito | null>(null);
  const [processing, setProcessing] = useState(false);

  const fetchTransacoes = async () => {
    if (!workspaceId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("cash_ledger")
        .select(`
          id,
          data_transacao,
          valor_usd,
          descricao,
          origem_wallet_id,
          destino_bookmaker_id,
          coin,
          qtd_coin
        `)
        .eq("workspace_id", workspaceId)
        .eq("transit_status", "PENDING")
        .eq("tipo_moeda", "CRYPTO")
        .order("data_transacao", { ascending: false });

      if (error) {
        console.error("[TransacoesEmTransito] Error:", error);
        return;
      }

      // Enriquecer com dados de wallet e bookmaker
      const enriched: TransacaoEmTransito[] = [];
      for (const t of data || []) {
        let walletData = null;
        let bookmakerData = null;

        if (t.origem_wallet_id) {
          const { data: w } = await supabase
            .from("wallets_crypto")
            .select("exchange, endereco")
            .eq("id", t.origem_wallet_id)
            .single();
          walletData = w;
        }

        if (t.destino_bookmaker_id) {
          const { data: b } = await supabase
            .from("bookmakers")
            .select("nome")
            .eq("id", t.destino_bookmaker_id)
            .single();
          bookmakerData = b;
        }

        enriched.push({
          ...t,
          wallet_exchange: walletData?.exchange || undefined,
          wallet_endereco: walletData?.endereco || undefined,
          bookmaker_nome: bookmakerData?.nome || undefined,
        });
      }

      setTransacoes(enriched);
    } catch (err) {
      console.error("[TransacoesEmTransito] Exception:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransacoes();
  }, [workspaceId]);

  const handleConfirm = async () => {
    if (!selectedTransacao) return;
    
    setProcessing(true);
    const result = await confirmTransit(selectedTransacao.id);
    setProcessing(false);
    
    if (result.success) {
      setConfirmDialogOpen(false);
      setSelectedTransacao(null);
      fetchTransacoes();
    }
  };

  const handleRevert = async () => {
    if (!selectedTransacao) return;
    
    setProcessing(true);
    const result = await revertTransit(selectedTransacao.id, "FAILED", "Cancelado manualmente");
    setProcessing(false);
    
    if (result.success) {
      setRevertDialogOpen(false);
      setSelectedTransacao(null);
      fetchTransacoes();
    }
  };

  const formatValue = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (transacoes.length === 0) {
    return null; // Não mostrar card se não houver transações pendentes
  }

  return (
    <>
      <Card className="border-warning/50 bg-warning/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-warning" />
              <CardTitle className="text-lg">Transações em Trânsito</CardTitle>
              <Badge variant="outline" className="bg-warning/20 text-warning border-warning/50">
                {transacoes.length}
              </Badge>
            </div>
            <Button variant="ghost" size="sm" onClick={fetchTransacoes}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>
            Valores enviados aguardando confirmação no destino
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {transacoes.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between p-3 rounded-lg bg-card border border-border/50"
            >
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-warning" />
                  <span className="text-muted-foreground">
                    {format(new Date(t.data_transacao), "dd/MM HH:mm", { locale: ptBR })}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 text-sm">
                    <Wallet className="h-3 w-3" />
                    <span className="font-mono">
                      {t.wallet_exchange?.toUpperCase() || "Wallet"}
                    </span>
                  </div>
                  <span className="text-muted-foreground">→</span>
                  <div className="flex items-center gap-1 text-sm">
                    <Building2 className="h-3 w-3" />
                    <span>{t.bookmaker_nome || "Destino"}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="font-mono">
                    {t.coin} {t.qtd_coin?.toFixed(4)}
                  </Badge>
                  <span className="font-mono font-semibold text-warning">
                    {formatValue(t.valor_usd || 0)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    setSelectedTransacao(t);
                    setRevertDialogOpen(true);
                  }}
                >
                  <X className="h-4 w-4 mr-1" />
                  Falhou
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    setSelectedTransacao(t);
                    setConfirmDialogOpen(true);
                  }}
                >
                  <Check className="h-4 w-4 mr-1" />
                  Confirmar
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Dialog de Confirmação */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Recebimento</AlertDialogTitle>
            <AlertDialogDescription>
              Confirma que o valor de{" "}
              <span className="font-semibold text-foreground">
                {formatValue(selectedTransacao?.valor_usd || 0)}
              </span>{" "}
              foi creditado no destino?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={processing}>
              {processing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de Reversão */}
      <AlertDialog open={revertDialogOpen} onOpenChange={setRevertDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar como Falha</AlertDialogTitle>
            <AlertDialogDescription>
              Confirma que a transação de{" "}
              <span className="font-semibold text-foreground">
                {formatValue(selectedTransacao?.valor_usd || 0)}
              </span>{" "}
              falhou? Os fundos serão liberados de volta para a wallet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleRevert} 
              disabled={processing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {processing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Marcar como Falha
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
