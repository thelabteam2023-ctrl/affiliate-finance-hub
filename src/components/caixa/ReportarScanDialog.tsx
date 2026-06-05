import { useState, useEffect, useMemo } from "react";
import { getTodayCivilDate } from "@/utils/dateUtils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { dispatchCaixaDataChanged } from "@/hooks/useInvalidateCaixaData";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useExchangeRates } from "@/contexts/ExchangeRatesContext";
import { FIAT_CURRENCIES, CRYPTO_CURRENCIES, getCurrencySymbol } from "@/types/currency";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertTriangle, ShieldAlert, Info } from "lucide-react";
import { BookmakerSearchSelect } from "./BookmakerSearchSelect";
import { ContaBancariaSearchSelect } from "./ContaBancariaSearchSelect";

interface ReportarScanDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type TipoOrigemScan = "CASA_APOSTA" | "PARCEIRO_CONTA";

interface Bookmaker {
  id: string;
  nome: string;
  saldo_atual: number;
  moeda: string;
  parceiro_id: string | null;
  parceiro_nome?: string;
}

interface ContaBancaria {
  id: string;
  banco: string;
  titular: string;
  parceiro_id: string;
  parceiro_nome: string;
  moeda: string;
  saldo: number | null;
}

export function ReportarScanDialog({
  open,
  onClose,
  onSuccess,
}: ReportarScanDialogProps) {
  const { toast } = useToast();
  const { isOwnerOrAdmin, isSystemOwner } = usePermissions();
  const { workspaceId } = useWorkspace();
  const { getRate } = useExchangeRates();

  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(false);

  const [tipoOrigem, setTipoOrigem] = useState<TipoOrigemScan>("CASA_APOSTA");
  const [bookmakerId, setBookmakerId] = useState<string>("");
  const [contaId, setContaId] = useState<string>("");
  const [moeda, setMoeda] = useState<string>("BRL");
  const [valor, setValor] = useState<string>("");
  const [valorDisplay, setValorDisplay] = useState<string>("");
  const [motivo, setMotivo] = useState<string>("");

  const [bookmakers, setBookmakers] = useState<Bookmaker[]>([]);
  const [contas, setContas] = useState<ContaBancaria[]>([]);
  const [saldosContas, setSaldosContas] = useState<Record<string, number>>({});

  useEffect(() => {
    if (open) fetchData();
  }, [open]);

  useEffect(() => {
    setBookmakerId("");
    setContaId("");
    setValor("");
    setValorDisplay("");
  }, [tipoOrigem]);

  // Atualizar moeda automaticamente baseado na entidade selecionada
  useEffect(() => {
    if (tipoOrigem === "CASA_APOSTA" && bookmakerId) {
      const bk = bookmakers.find(b => b.id === bookmakerId);
      if (bk?.moeda) setMoeda(bk.moeda);
    } else if (tipoOrigem === "PARCEIRO_CONTA" && contaId) {
      const conta = contas.find(c => c.id === contaId);
      if (conta?.moeda) setMoeda(conta.moeda);
    }
  }, [bookmakerId, contaId, tipoOrigem, bookmakers, contas]);

  const fetchData = async () => {
    setFetchingData(true);
    try {
      const [bookmakersRes, contasRes, saldosContasRes] = await Promise.all([
        supabase
          .from("bookmakers")
          .select("id, nome, saldo_atual, moeda, parceiro_id, parceiros!inner(nome, status)")
          .in("status", ["ativo", "limitada"])
          .eq("parceiros.status", "ativo")
          .order("nome"),
        supabase
          .from("contas_bancarias")
          .select("id, banco, titular, parceiro_id, moeda, parceiros!inner(nome, status)")
          .eq("parceiros.status", "ativo")
          .order("banco"),
        supabase
          .from("v_saldo_parceiro_contas")
          .select("conta_id, saldo"),
      ]);

      const saldoMap: Record<string, number> = {};
      (saldosContasRes.data || []).forEach((s: any) => {
        if (s.conta_id) saldoMap[s.conta_id] = s.saldo ?? 0;
      });
      setSaldosContas(saldoMap);

      setBookmakers((bookmakersRes.data || []).map((bk: any) => ({
        id: bk.id,
        nome: bk.nome,
        saldo_atual: bk.saldo_atual || 0,
        moeda: bk.moeda || "BRL",
        parceiro_id: bk.parceiro_id,
        parceiro_nome: bk.parceiros?.nome,
      })));

      setContas((contasRes.data || []).map((c: any) => ({
        id: c.id,
        banco: c.banco,
        titular: c.titular,
        parceiro_id: c.parceiro_id,
        parceiro_nome: c.parceiros?.nome || "",
        moeda: c.moeda || "BRL",
        saldo: saldoMap[c.id] ?? null,
      })));
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setFetchingData(false);
    }
  };

  const formatCurrencyInput = (value: string): string => {
    const numericValue = value.replace(/[^\d]/g, "");
    if (!numericValue) return "";
    const numberValue = parseInt(numericValue, 10) / 100;
    return numberValue.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCurrencyInput(e.target.value);
    setValorDisplay(formatted);
    const numericValue = formatted.replace(/\./g, "").replace(",", ".");
    setValor(numericValue);
  };

  const saldoAtual = useMemo(() => {
    if (tipoOrigem === "CASA_APOSTA" && bookmakerId) {
      return bookmakers.find(b => b.id === bookmakerId)?.saldo_atual ?? 0;
    }
    if (tipoOrigem === "PARCEIRO_CONTA" && contaId) {
      return saldosContas[contaId] ?? 0;
    }
    return 0;
  }, [tipoOrigem, bookmakerId, contaId, bookmakers, saldosContas]);

  const canSubmit = () => {
    if (!motivo.trim() || !valor || parseFloat(valor) <= 0) return false;
    if (tipoOrigem === "CASA_APOSTA" && !bookmakerId) return false;
    if (tipoOrigem === "PARCEIRO_CONTA" && !contaId) return false;
    return true;
  };

  const handleSubmit = async () => {
    if (!canSubmit()) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !workspaceId) throw new Error("Acesso negado");

      const valorNum = parseFloat(valor);
      const isCrypto = CRYPTO_CURRENCIES.some(c => c.value === moeda);
      const cotacao = moeda !== "BRL" ? getRate(moeda) : 1;
      
      if (tipoOrigem === "CASA_APOSTA") {
        const { error } = await supabase.from("cash_ledger").insert({
          workspace_id: workspaceId,
          user_id: user.id,
          tipo_transacao: "AJUSTE_MANUAL", // Usar um tipo conhecido que acione o ledger corretamente
          tipo_moeda: isCrypto ? "CRYPTO" : "FIAT",
          moeda,
          valor: valorNum,
          descricao: `[SCAN CASA] ${motivo} | Saldo anterior: ${saldoAtual.toFixed(2)}`,
          status: "CONFIRMADO",
          transit_status: "CONFIRMED",
          data_transacao: getTodayCivilDate(),
          origem_tipo: "BOOKMAKER",
          origem_bookmaker_id: bookmakerId,
          destino_tipo: "PERDA",
          impacta_caixa_operacional: false,
          ajuste_motivo: `SCAN: ${motivo}`,
          ajuste_direcao: "SAIDA",
          ajuste_natureza: "RECONCILIACAO_OPERACIONAL",
          cotacao: cotacao,
          auditoria_metadata: {
            tipo_registro: "REPORTAR_SCAN",
            origem_scan: tipoOrigem,
            entidade_id: bookmakerId
          }
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("cash_ledger").insert({
          workspace_id: workspaceId,
          user_id: user.id,
          tipo_transacao: "AJUSTE_MANUAL",
          tipo_moeda: isCrypto ? "CRYPTO" : "FIAT",
          moeda,
          valor: valorNum,
          descricao: `[SCAN PARCEIRO] ${motivo} | Saldo anterior: ${saldoAtual.toFixed(2)}`,
          status: "CONFIRMADO",
          transit_status: "CONFIRMED",
          data_transacao: getTodayCivilDate(),
          origem_tipo: "PARCEIRO_CONTA",
          origem_conta_bancaria_id: contaId,
          destino_tipo: "PERDA",
          impacta_caixa_operacional: true,
          ajuste_motivo: `SCAN: ${motivo}`,
          ajuste_direcao: "SAIDA",
          ajuste_natureza: "RECONCILIACAO_OPERACIONAL",
          cotacao: cotacao,
          auditoria_metadata: {
            tipo_registro: "REPORTAR_SCAN",
            origem_scan: tipoOrigem,
            entidade_id: contaId
          }
        });
        if (error) throw error;
      }

      toast({
        title: "Scan reportado",
        description: "A perda foi registrada com sucesso.",
      });
      
      dispatchCaixaDataChanged();
      onSuccess();
      onClose();
    } catch (error: any) {
      toast({
        title: "Erro ao reportar scan",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="h-5 w-5" />
            Reportar Scan / Perda
          </DialogTitle>
          <DialogDescription>
            Registre uma perda extraordinária por fraude ou retenção indevida.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Origem do Scan</Label>
            <Select 
              value={tipoOrigem} 
              onValueChange={(v: TipoOrigemScan) => setTipoOrigem(v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a origem" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CASA_APOSTA">Casa de Aposta (Scan de Casa)</SelectItem>
                <SelectItem value="PARCEIRO_CONTA">Parceiro (Scan de Conta Bancária)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {tipoOrigem === "CASA_APOSTA" ? (
            <div className="space-y-2">
              <Label>Casa de Aposta</Label>
              <BookmakerSearchSelect 
                bookmakers={bookmakers}
                value={bookmakerId}
                onValueChange={setBookmakerId}
                placeholder="Selecione a casa..."
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Conta Bancária do Parceiro</Label>
              <ContaBancariaSearchSelect 
                contas={contas}
                value={contaId}
                onValueChange={setContaId}
                placeholder="Selecione a conta..."
              />
            </div>
          )}

          {saldoAtual > 0 && (
            <Alert className="bg-muted/50 border-none py-2">
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Saldo atual no sistema: <span className="font-mono font-medium">{getCurrencySymbol(moeda)} {saldoAtual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Valor do Prejuízo</Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs text-muted-foreground font-mono">
                  {getCurrencySymbol(moeda)}
                </span>
                <Input 
                  value={valorDisplay}
                  onChange={handleValorChange}
                  placeholder="0,00"
                  className="font-mono pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Moeda</Label>
              <div className="h-10 flex items-center px-3 rounded-md border border-input bg-muted/50 text-sm font-medium font-mono">
                {moeda}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Motivo / Descrição do Ocorrido</Label>
            <Textarea 
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex: Conta bloqueada sem justificativa..."
              className="resize-none"
              rows={3}
            />
          </div>

          <div className="pt-2">
            <Button 
              className="w-full bg-destructive hover:bg-destructive/90 text-white"
              onClick={handleSubmit}
              disabled={loading || !canSubmit()}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldAlert className="h-4 w-4 mr-2" />}
              Confirmar Registro de Perda
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
