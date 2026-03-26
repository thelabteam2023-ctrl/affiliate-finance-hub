import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Wallet, Building2, Users, ScrollText,
  Clock, ClipboardList
} from "lucide-react";
import labestLogo from "@/assets/labest-logo.png";
import { SupplierContasTab } from "./SupplierContasTab";
import { SupplierTitularesTab } from "./SupplierTitularesTab";
import { SupplierExtratoTab } from "./SupplierExtratoTab";
import { SupplierTransacaoDialog } from "./SupplierTransacaoDialog";
import { SupplierBancosModal } from "./SupplierBancosModal";
import { SupplierOperacoesTab } from "./SupplierOperacoesTab";

interface SupplierSession {
  supplier_workspace_id: string;
  supplier_profile_id: string;
  supplier_nome: string;
  token_id: string;
  expires_at: string;
}

interface Props {
  session: SupplierSession;
}

function formatCurrency(val: number, moeda = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: moeda,
    minimumFractionDigits: 2,
  }).format(val);
}

export function SupplierDashboard({ session }: Props) {
  const [activeTab, setActiveTab] = useState("visao-geral");
  const [transacaoOpen, setTransacaoOpen] = useState(false);
  const [transacaoTipo, setTransacaoTipo] = useState<"DEPOSITO" | "SAQUE" | "TRANSFERENCIA_BANCO">("DEPOSITO");
  const [bancosModalOpen, setBancosModalOpen] = useState(false);

  // Get token from URL for edge function calls
  const supplierToken = useMemo(() => new URLSearchParams(window.location.search).get("token") || "", []);

  // Fetch ledger summary
  const { data: ledgerData, refetch: refetchLedger } = useQuery({
    queryKey: ["supplier-ledger-summary-v2", session.supplier_workspace_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_ledger")
        .select("tipo, direcao, valor, created_at, bookmaker_account_id, metadata")
        .eq("supplier_workspace_id", session.supplier_workspace_id)
        .order("sequencia", { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  // Fetch accounts
  const { data: accounts, refetch: refetchAccounts } = useQuery({
    queryKey: ["supplier-accounts", session.supplier_workspace_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_bookmaker_accounts")
        .select("*, supplier_titulares(nome), bookmakers_catalogo(nome, logo_url)")
        .eq("supplier_workspace_id", session.supplier_workspace_id)
        .eq("status", "ATIVA");

      if (error) throw error;
      return data || [];
    },
  });

  // Fetch bank balances
  const { data: bancos } = useQuery({
    queryKey: ["supplier-bancos-saldo", session.supplier_workspace_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_titular_bancos")
        .select("id, banco_nome, saldo, pix_key, titular_id, supplier_titulares(nome)")
        .eq("supplier_workspace_id", session.supplier_workspace_id);
      if (error) throw error;
      return (data || []).map((b: any) => ({
        id: b.id,
        banco_nome: b.banco_nome,
        saldo: b.saldo,
        pix_key: b.pix_key,
        titular_nome: b.supplier_titulares?.nome || "Sem titular",
      }));
    },
  });

  const saldoBancos = (bancos || []).reduce((s, b) => s + Number(b.saldo), 0);

  // Fetch alocação
  const { data: alocacao } = useQuery({
    queryKey: ["supplier-alocacao", session.supplier_workspace_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_alocacoes")
        .select("*")
        .eq("supplier_workspace_id", session.supplier_workspace_id)
        .eq("status", "ATIVO")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  // Calculate metrics from ledger
  const metrics = (() => {
    if (!ledgerData) return { totalAlocado: 0, totalDevolvido: 0, totalSacado: 0, saldoCentral: 0 };

    const totalAlocado = ledgerData
      .filter(e => e.tipo === "ALOCACAO" && e.direcao === "CREDIT")
      .reduce((s, e) => s + Number(e.valor), 0);

    const totalDevolvido = ledgerData
      .filter(e => e.tipo === "DEVOLUCAO" && e.direcao === "DEBIT")
      .reduce((s, e) => s + Number(e.valor), 0);

    const totalSacado = ledgerData
      .filter(e => e.tipo === "SAQUE" && e.direcao === "DEBIT")
      .reduce((s, e) => s + Number(e.valor), 0);

    // Saldo central = only entries without bookmaker_account_id (central-level movements)
    // ALOCACAO CREDIT → +central (money enters workspace)
    // TRANSFERENCIA_BANCO DEBIT → -central (money sent to bank)
    // DEVOLUCAO DEBIT → -central (money returned to admin)
    // PAGAMENTO_TITULAR DEBIT (fonte=CENTRAL) → -central
    // PAGAMENTO_TITULAR DEBIT (fonte=BANCO) → NOT central (debits bank directly)
    const centralEntries = ledgerData.filter(e => {
      if (e.bookmaker_account_id) return false;
      // Exclude PAGAMENTO_TITULAR from banco (doesn't affect central saldo)
      if (e.tipo === "PAGAMENTO_TITULAR" && (e.metadata as any)?.fonte === "BANCO") return false;
      return true;
    });
    const centralCredits = centralEntries
      .filter(e => e.direcao === "CREDIT")
      .reduce((s, e) => s + Number(e.valor), 0);
    const centralDebits = centralEntries
      .filter(e => e.direcao === "DEBIT")
      .reduce((s, e) => s + Number(e.valor), 0);

    return { totalAlocado, totalDevolvido, totalSacado, saldoCentral: centralCredits - centralDebits };
  })();

  const saldoContas = (accounts || []).reduce((s, a) => s + Number(a.saldo_atual), 0);
  const saldoDisponivel = metrics.saldoCentral;
  

  const expiresAt = new Date(session.expires_at);
  const hoursRemaining = Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60)));

  function handleRefresh() {
    refetchLedger();
    refetchAccounts();
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <img src={labestLogo} alt="Labest" className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg shrink-0 object-cover" />
            <div className="min-w-0">
              <h1 className="text-sm sm:text-lg font-semibold text-foreground truncate">{session.supplier_nome}</h1>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Portal do Fornecedor</p>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] sm:text-xs gap-1 shrink-0">
            <Clock className="h-3 w-3" />
            {hoursRemaining}h
          </Badge>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <Card className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => { if (saldoDisponivel > 0) { setTransacaoTipo("TRANSFERENCIA_BANCO"); setTransacaoOpen(true); } }}>
            <CardContent className="pt-3 sm:pt-4 pb-2 sm:pb-3 px-3 sm:px-4">
              <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] sm:text-xs mb-0.5 sm:mb-1">
                <Wallet className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                Saldo Disponível
              </div>
              <p className="text-base sm:text-xl font-bold text-foreground tabular-nums">{formatCurrency(saldoDisponivel)}</p>
              {saldoDisponivel > 0 && (
                <p className="text-[10px] text-primary mt-0.5">Toque para enviar ao banco →</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-3 sm:pt-4 pb-2 sm:pb-3 px-3 sm:px-4">
              <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] sm:text-xs mb-0.5 sm:mb-1">
                <Building2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                Em Contas
              </div>
              <p className="text-base sm:text-xl font-bold text-foreground tabular-nums">{formatCurrency(saldoContas)}</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => setBancosModalOpen(true)}>
            <CardContent className="pt-3 sm:pt-4 pb-2 sm:pb-3 px-3 sm:px-4">
              <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] sm:text-xs mb-0.5 sm:mb-1">
                <Wallet className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                Em Bancos
              </div>
              <p className="text-base sm:text-xl font-bold text-foreground tabular-nums">{formatCurrency(saldoBancos)}</p>
              <p className="text-[10px] text-primary mt-0.5">Toque para ver detalhes →</p>
            </CardContent>
          </Card>
        </div>

        {/* Suggested deposit */}
        {alocacao?.valor_sugerido_deposito && saldoDisponivel > 0 && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="py-3 flex items-center justify-between">
              <div className="text-sm">
                <span className="text-muted-foreground">Valor sugerido para depósito: </span>
                <span className="font-semibold text-foreground">
                  {formatCurrency(Number(alocacao.valor_sugerido_deposito))}
                </span>
              </div>
              <button
                onClick={() => { setTransacaoTipo("DEPOSITO"); setTransacaoOpen(true); }}
                className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md font-medium hover:bg-primary/90 transition-colors"
              >
                Depositar
              </button>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-3 w-full max-w-md">
            <TabsTrigger value="visao-geral" className="gap-1 sm:gap-1.5 text-[11px] sm:text-xs">
              <Building2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> Contas
            </TabsTrigger>
            <TabsTrigger value="titulares" className="gap-1 sm:gap-1.5 text-[11px] sm:text-xs">
              <Users className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> Titulares
            </TabsTrigger>
            <TabsTrigger value="extrato" className="gap-1 sm:gap-1.5 text-[11px] sm:text-xs">
              <ScrollText className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> Extrato
            </TabsTrigger>
          </TabsList>

          <TabsContent value="visao-geral" className="mt-4">
            <SupplierContasTab
              supplierWorkspaceId={session.supplier_workspace_id}
              accounts={accounts || []}
              saldoDisponivel={saldoDisponivel}
              onRefresh={handleRefresh}
              onDepositar={() => { setTransacaoTipo("DEPOSITO"); setTransacaoOpen(true); }}
              onSacar={() => { setTransacaoTipo("SAQUE"); setTransacaoOpen(true); }}
            />
          </TabsContent>

          <TabsContent value="titulares" className="mt-4">
            <SupplierTitularesTab
              supplierWorkspaceId={session.supplier_workspace_id}
            />
          </TabsContent>

          <TabsContent value="extrato" className="mt-4">
            <SupplierExtratoTab
              supplierWorkspaceId={session.supplier_workspace_id}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Transaction dialog */}
      <SupplierTransacaoDialog
        open={transacaoOpen}
        onOpenChange={setTransacaoOpen}
        tipo={transacaoTipo}
        supplierWorkspaceId={session.supplier_workspace_id}
        accounts={accounts || []}
        saldoDisponivel={saldoDisponivel}
        valorSugerido={alocacao?.valor_sugerido_deposito ? Number(alocacao.valor_sugerido_deposito) : undefined}
        onSuccess={handleRefresh}
      />

      <SupplierBancosModal
        open={bancosModalOpen}
        onOpenChange={setBancosModalOpen}
        bancos={bancos || []}
        total={saldoBancos}
      />
    </div>
  );
}
