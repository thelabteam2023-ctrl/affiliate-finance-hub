import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
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
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  Calculator, 
  ArrowRight, 
  TrendingDown, 
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Coins
} from "lucide-react";

interface ProjetoConciliacaoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projeto: {
    id: string;
    nome: string;
    tem_investimento_crypto?: boolean;
    modelo_absorcao_taxas?: string;
  };
  onSuccess: () => void;
}

const MODELOS_ABSORCAO_LABELS: Record<string, string> = {
  EMPRESA_100: "Empresa absorve 100%",
  OPERADOR_100: "Operador absorve 100%",
  PROPORCIONAL: "Divisão proporcional (50/50)",
};

interface SaldosNominais {
  fiat: number;
  crypto_usd: number;
}

export function ProjetoConciliacaoDialog({
  open,
  onOpenChange,
  projeto,
  onSuccess,
}: ProjetoConciliacaoDialogProps) {
  const { workspaceId } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [loadingNominal, setLoadingNominal] = useState(true);
  const [saldosNominais, setSaldosNominais] = useState<SaldosNominais>({ fiat: 0, crypto_usd: 0 });
  const [formData, setFormData] = useState({
    saldo_real_fiat: "",
    saldo_real_crypto_usd: "",
    perdas_confirmadas: "",
    motivo_perda: "",
    observacoes: "",
  });

  useEffect(() => {
    if (open && projeto.id) {
      fetchSaldosNominais();
      setFormData({
        saldo_real_fiat: "",
        saldo_real_crypto_usd: "",
        perdas_confirmadas: "",
        motivo_perda: "",
        observacoes: "",
      });
    }
  }, [open, projeto.id]);

  const fetchSaldosNominais = async () => {
    setLoadingNominal(true);
    try {
      // Buscar saldos dos bookmakers vinculados ao projeto
      const { data: bookmakers, error } = await supabase
        .from("bookmakers")
        .select("saldo_atual, moeda")
        .eq("projeto_id", projeto.id);

      if (error) throw error;

      let totalFiat = 0;
      let totalCryptoUSD = 0;

      bookmakers?.forEach((bk) => {
        if (bk.moeda === "BRL") {
          totalFiat += bk.saldo_atual || 0;
        } else if (bk.moeda === "USD" || bk.moeda === "EUR") {
          totalCryptoUSD += bk.saldo_atual || 0;
        } else {
          // Crypto - assumir como USD
          totalCryptoUSD += bk.saldo_atual || 0;
        }
      });

      setSaldosNominais({ fiat: totalFiat, crypto_usd: totalCryptoUSD });
      setFormData(prev => ({
        ...prev,
        saldo_real_fiat: totalFiat.toFixed(2),
        saldo_real_crypto_usd: totalCryptoUSD.toFixed(2),
      }));
    } catch (error: any) {
      console.error("Erro ao buscar saldos nominais:", error);
      toast.error("Erro ao carregar saldos do projeto");
    } finally {
      setLoadingNominal(false);
    }
  };

  const calcularAjustes = () => {
    const realFiat = parseFloat(formData.saldo_real_fiat) || 0;
    const realCrypto = parseFloat(formData.saldo_real_crypto_usd) || 0;
    
    const ajusteFiat = saldosNominais.fiat - realFiat;
    const ajusteCrypto = saldosNominais.crypto_usd - realCrypto;
    
    return { ajusteFiat, ajusteCrypto };
  };

  const { ajusteFiat, ajusteCrypto } = calcularAjustes();
  const totalAjuste = ajusteFiat + ajusteCrypto;
  const tipoAjuste = totalAjuste > 0 ? "PERDA_FRICCIONAL" : totalAjuste < 0 ? "GANHO_OPERACIONAL" : "NEUTRO";

  const handleSave = async () => {
    const realFiat = parseFloat(formData.saldo_real_fiat);
    const realCrypto = parseFloat(formData.saldo_real_crypto_usd);

    if (isNaN(realFiat) || isNaN(realCrypto)) {
      toast.error("Informe os saldos reais corretamente");
      return;
    }

    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        toast.error("Usuário não autenticado");
        return;
      }

      const perdasConfirmadas = parseFloat(formData.perdas_confirmadas) || 0;

      // Inserir conciliação
      const { error: conciliacaoError } = await supabase
        .from("projeto_conciliacoes")
        .insert({
          projeto_id: projeto.id,
          user_id: session.session.user.id,
          workspace_id: workspaceId!,
          saldo_nominal_fiat: saldosNominais.fiat,
          saldo_nominal_crypto_usd: saldosNominais.crypto_usd,
          saldo_real_fiat: realFiat,
          saldo_real_crypto_usd: realCrypto,
          ajuste_fiat: ajusteFiat,
          ajuste_crypto_usd: ajusteCrypto,
          perdas_confirmadas: perdasConfirmadas,
          motivo_perda: formData.motivo_perda || null,
          tipo_ajuste: tipoAjuste === "NEUTRO" ? "PERDA_FRICCIONAL" : tipoAjuste,
          observacoes: formData.observacoes || null,
        });

      if (conciliacaoError) throw conciliacaoError;

      // Marcar projeto como conciliado
      const { error: projetoError } = await supabase
        .from("projetos")
        .update({ conciliado: true })
        .eq("id", projeto.id);

      if (projetoError) throw projetoError;

      toast.success("Conciliação registrada com sucesso");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao salvar conciliação: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number, currency: string = "BRL") => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
    }).format(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            Conciliação Patrimonial - {projeto.nome}
          </DialogTitle>
          <DialogDescription>
            Compare o saldo nominal (calculado pelo sistema) com o saldo real (disponível em carteira)
          </DialogDescription>
        </DialogHeader>

        {loadingNominal ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Comparação FIAT */}
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-4">
                  <DollarSign className="h-5 w-5 text-emerald-500" />
                  <h4 className="font-medium">FIAT (BRL)</h4>
                </div>
                
                <div className="grid grid-cols-3 gap-4 items-end">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-xs">Saldo Nominal</Label>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="font-mono text-lg">{formatCurrency(saldosNominais.fiat)}</p>
                    </div>
                  </div>
                  
                  <div className="flex justify-center pb-3">
                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-xs">Saldo Real *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.saldo_real_fiat}
                      onChange={(e) => setFormData({ ...formData, saldo_real_fiat: e.target.value })}
                      placeholder="0,00"
                      className="font-mono"
                    />
                  </div>
                </div>

                {ajusteFiat !== 0 && (
                  <div className={`mt-4 p-3 rounded-lg flex items-center justify-between ${
                    ajusteFiat > 0 ? "bg-red-500/10 border border-red-500/20" : "bg-emerald-500/10 border border-emerald-500/20"
                  }`}>
                    <div className="flex items-center gap-2">
                      {ajusteFiat > 0 ? (
                        <TrendingDown className="h-4 w-4 text-red-500" />
                      ) : (
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                      )}
                      <span className="text-sm">
                        {ajusteFiat > 0 ? "Perda Friccional" : "Ganho Operacional"}
                      </span>
                    </div>
                    <span className={`font-mono font-medium ${ajusteFiat > 0 ? "text-red-400" : "text-emerald-400"}`}>
                      {formatCurrency(Math.abs(ajusteFiat))}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Comparação CRYPTO */}
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-4">
                  <Coins className="h-5 w-5 text-orange-500" />
                  <h4 className="font-medium">CRYPTO (USD)</h4>
                </div>
                
                <div className="grid grid-cols-3 gap-4 items-end">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-xs">Saldo Nominal</Label>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="font-mono text-lg">{formatCurrency(saldosNominais.crypto_usd, "USD")}</p>
                    </div>
                  </div>
                  
                  <div className="flex justify-center pb-3">
                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-xs">Saldo Real *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.saldo_real_crypto_usd}
                      onChange={(e) => setFormData({ ...formData, saldo_real_crypto_usd: e.target.value })}
                      placeholder="0,00"
                      className="font-mono"
                    />
                  </div>
                </div>

                {ajusteCrypto !== 0 && (
                  <div className={`mt-4 p-3 rounded-lg flex items-center justify-between ${
                    ajusteCrypto > 0 ? "bg-red-500/10 border border-red-500/20" : "bg-emerald-500/10 border border-emerald-500/20"
                  }`}>
                    <div className="flex items-center gap-2">
                      {ajusteCrypto > 0 ? (
                        <TrendingDown className="h-4 w-4 text-red-500" />
                      ) : (
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                      )}
                      <span className="text-sm">
                        {ajusteCrypto > 0 ? "Perda Friccional" : "Ganho Operacional"}
                      </span>
                    </div>
                    <span className={`font-mono font-medium ${ajusteCrypto > 0 ? "text-red-400" : "text-emerald-400"}`}>
                      {formatCurrency(Math.abs(ajusteCrypto), "USD")}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Modelo de Absorção */}
            {projeto.modelo_absorcao_taxas && (
              <Card className="border-primary/30">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Modelo de Absorção Acordado</p>
                      <p className="font-medium">{MODELOS_ABSORCAO_LABELS[projeto.modelo_absorcao_taxas] || projeto.modelo_absorcao_taxas}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Resumo */}
            <Card className={totalAjuste !== 0 ? (
              totalAjuste > 0 ? "border-red-500/30" : "border-emerald-500/30"
            ) : "border-muted"}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {tipoAjuste === "PERDA_FRICCIONAL" ? (
                      <div className="h-10 w-10 rounded-full bg-red-500/20 flex items-center justify-center">
                        <AlertTriangle className="h-5 w-5 text-red-500" />
                      </div>
                    ) : tipoAjuste === "GANHO_OPERACIONAL" ? (
                      <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      </div>
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                        <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <p className="font-medium">Resultado da Conciliação</p>
                      <p className="text-sm text-muted-foreground">
                        {tipoAjuste === "PERDA_FRICCIONAL" 
                          ? "Perda friccional identificada (slippage, taxas, conversões)"
                          : tipoAjuste === "GANHO_OPERACIONAL"
                            ? "Ganho operacional não previsto identificado"
                            : "Saldos conferidos - sem ajustes necessários"
                        }
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge className={
                      tipoAjuste === "PERDA_FRICCIONAL" 
                        ? "bg-red-500/20 text-red-400"
                        : tipoAjuste === "GANHO_OPERACIONAL"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-muted text-muted-foreground"
                    }>
                      {tipoAjuste === "PERDA_FRICCIONAL" ? "Perda" : tipoAjuste === "GANHO_OPERACIONAL" ? "Ganho" : "Neutro"}
                    </Badge>
                    {totalAjuste !== 0 && (
                      <p className={`font-mono text-lg mt-1 ${
                        totalAjuste > 0 ? "text-red-400" : "text-emerald-400"
                      }`}>
                        {totalAjuste > 0 ? "-" : "+"}{formatCurrency(Math.abs(totalAjuste), "USD")}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>


            {/* Perdas Confirmadas */}
            <Card className="border-red-500/30">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingDown className="h-5 w-5 text-red-500" />
                  <h4 className="font-medium">Perdas Confirmadas</h4>
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Valor das Perdas Confirmadas (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.perdas_confirmadas}
                      onChange={(e) => setFormData({ ...formData, perdas_confirmadas: e.target.value })}
                      placeholder="0,00"
                      className="font-mono"
                    />
                    <p className="text-xs text-muted-foreground">
                      Perdas definitivas como contas banidas, saldos bloqueados permanentemente, etc.
                    </p>
                  </div>

                  {parseFloat(formData.perdas_confirmadas) > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs">Motivo das Perdas</Label>
                      <Textarea
                        value={formData.motivo_perda}
                        onChange={(e) => setFormData({ ...formData, motivo_perda: e.target.value })}
                        placeholder="Ex: Conta na BET365 banida com R$ 5.000 de saldo..."
                        rows={2}
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Observações */}
            <div className="space-y-2">
              <Label>Observações Gerais</Label>
              <Textarea
                value={formData.observacoes}
                onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                placeholder="Detalhes adicionais sobre a conciliação..."
                rows={3}
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading || loadingNominal}>
            {loading ? "Salvando..." : "Registrar Conciliação"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}