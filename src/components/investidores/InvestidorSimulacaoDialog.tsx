import { useState, useEffect } from "react";
import { Calculator, TrendingUp, DollarSign, Bitcoin, Percent } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

interface InvestidorDeal {
  id: string;
  tipo_deal: "FIXO" | "PROGRESSIVO";
  percentual_fixo: number;
  faixas_progressivas: Array<{ limite: number; percentual: number }>;
  ativo: boolean;
}

interface InvestidorSimulacaoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  investidor: {
    id: string;
    nome: string;
  };
  deal?: InvestidorDeal;
  currentROI?: {
    saldo_fiat_brl: number;
    saldo_crypto_usd: number;
    roi_percentual: number;
  };
}

const formatCurrency = (value: number, currency: "BRL" | "USD" = "BRL") => {
  return new Intl.NumberFormat(currency === "BRL" ? "pt-BR" : "en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
  }).format(value);
};

export function InvestidorSimulacaoDialog({
  open,
  onOpenChange,
  investidor,
  deal,
  currentROI,
}: InvestidorSimulacaoDialogProps) {
  const [tipoSimulacao, setTipoSimulacao] = useState<"FIAT" | "CRYPTO">("FIAT");
  const [valorAporte, setValorAporte] = useState<string>("");
  const [periodoMeses, setPeriodoMeses] = useState<string>("12");
  const [taxaRetornoAnual, setTaxaRetornoAnual] = useState<string>("30");

  // Reset on open
  useEffect(() => {
    if (open) {
      setValorAporte("");
      setPeriodoMeses("12");
      setTaxaRetornoAnual("30");
    }
  }, [open]);

  const valorNum = parseFloat(valorAporte.replace(/\D/g, "")) / 100 || 0;
  const periodoNum = parseInt(periodoMeses) || 12;
  const taxaNum = parseFloat(taxaRetornoAnual) || 30;

  // Calculate projected returns
  const taxaMensal = taxaNum / 12 / 100;
  const retornoBruto = valorNum * Math.pow(1 + taxaMensal, periodoNum) - valorNum;
  
  // Calculate investor share based on deal
  const calcularParticipacao = (lucro: number): number => {
    if (!deal) return lucro * 0.4; // Default 40%
    
    if (deal.tipo_deal === "FIXO") {
      return lucro * (deal.percentual_fixo / 100);
    }
    
    // Progressive
    let participacao = 0;
    let lucroRestante = lucro;
    const faixas = [...deal.faixas_progressivas].sort((a, b) => a.limite - b.limite);
    
    let limiteAnterior = 0;
    for (const faixa of faixas) {
      const valorNaFaixa = Math.min(lucroRestante, faixa.limite - limiteAnterior);
      if (valorNaFaixa > 0) {
        participacao += valorNaFaixa * (faixa.percentual / 100);
        lucroRestante -= valorNaFaixa;
        limiteAnterior = faixa.limite;
      }
    }
    
    // Remaining at last percentage
    if (lucroRestante > 0 && faixas.length > 0) {
      participacao += lucroRestante * (faixas[faixas.length - 1].percentual / 100);
    }
    
    return participacao;
  };

  const participacaoInvestidor = calcularParticipacao(retornoBruto);
  const retornoOperador = retornoBruto - participacaoInvestidor;
  const roiProjetado = valorNum > 0 ? (participacaoInvestidor / valorNum) * 100 : 0;
  const paybackMeses = participacaoInvestidor > 0 
    ? Math.ceil(valorNum / (participacaoInvestidor / periodoNum))
    : null;

  const formatInput = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    const num = parseInt(numbers) || 0;
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: tipoSimulacao === "FIAT" ? "BRL" : "USD",
      minimumFractionDigits: 2,
    }).format(num / 100);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            Simulação de Retorno
            <Badge variant="outline">{investidor?.nome}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Deal Info */}
          {deal && (
            <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Acordo Vigente</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{deal.tipo_deal}</Badge>
                  {deal.tipo_deal === "FIXO" && (
                    <span className="font-bold text-primary">{deal.percentual_fixo}%</span>
                  )}
                </div>
              </div>
              {deal.tipo_deal === "PROGRESSIVO" && (
                <div className="mt-2 space-y-1">
                  {deal.faixas_progressivas.map((f, i) => (
                    <div key={i} className="flex justify-between text-xs text-muted-foreground">
                      <span>{i === 0 ? "Até" : "Acima de"} {formatCurrency(f.limite, "BRL")}</span>
                      <span className="text-primary font-semibold">{f.percentual}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Simulation Inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={tipoSimulacao} onValueChange={(v) => setTipoSimulacao(v as "FIAT" | "CRYPTO")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIAT">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-amber-500" />
                      FIAT (BRL)
                    </div>
                  </SelectItem>
                  <SelectItem value="CRYPTO">
                    <div className="flex items-center gap-2">
                      <Bitcoin className="h-4 w-4 text-violet-500" />
                      CRYPTO (USD)
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Valor do Aporte</Label>
              <Input
                value={valorAporte ? formatInput(valorAporte) : ""}
                onChange={(e) => setValorAporte(e.target.value.replace(/\D/g, ""))}
                placeholder={tipoSimulacao === "FIAT" ? "R$ 0,00" : "$ 0.00"}
              />
            </div>

            <div className="space-y-2">
              <Label>Período (meses)</Label>
              <Select value={periodoMeses} onValueChange={setPeriodoMeses}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 meses</SelectItem>
                  <SelectItem value="6">6 meses</SelectItem>
                  <SelectItem value="12">12 meses</SelectItem>
                  <SelectItem value="24">24 meses</SelectItem>
                  <SelectItem value="36">36 meses</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Taxa Retorno Anual (%)</Label>
              <Input
                type="number"
                value={taxaRetornoAnual}
                onChange={(e) => setTaxaRetornoAnual(e.target.value)}
                placeholder="30"
                min={0}
                max={200}
              />
            </div>
          </div>

          <Separator />

          {/* Results */}
          {valorNum > 0 && (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Projeção de Retorno
              </h4>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                  <p className="text-[10px] text-muted-foreground uppercase">Aporte Inicial</p>
                  <p className="text-lg font-bold font-mono">
                    {formatCurrency(valorNum, tipoSimulacao === "FIAT" ? "BRL" : "USD")}
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                  <p className="text-[10px] text-muted-foreground uppercase">Retorno Bruto</p>
                  <p className="text-lg font-bold font-mono text-emerald-500">
                    {formatCurrency(retornoBruto, tipoSimulacao === "FIAT" ? "BRL" : "USD")}
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
                  <p className="text-[10px] text-muted-foreground uppercase">Participação Investidor</p>
                  <p className="text-lg font-bold font-mono text-primary">
                    {formatCurrency(participacaoInvestidor, tipoSimulacao === "FIAT" ? "BRL" : "USD")}
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                  <p className="text-[10px] text-muted-foreground uppercase">Retorno Operador</p>
                  <p className="text-lg font-bold font-mono">
                    {formatCurrency(retornoOperador, tipoSimulacao === "FIAT" ? "BRL" : "USD")}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20">
                <div>
                  <p className="text-xs text-muted-foreground">ROI Investidor</p>
                  <p className="text-2xl font-bold text-primary">
                    +{roiProjetado.toFixed(1)}%
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Payback Estimado</p>
                  <p className="text-2xl font-bold">
                    {paybackMeses ? `${paybackMeses}m` : "—"}
                  </p>
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground text-center">
                * Projeção baseada na taxa de retorno informada. Resultados reais podem variar.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}