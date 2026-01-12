/**
 * Etapa 2 - Moeda e Consolidação Financeira (OBRIGATÓRIA)
 */

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertCircle,
  DollarSign,
  Banknote,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
} from "lucide-react";
import { useCotacoes } from "@/hooks/useCotacoes";
import { cn } from "@/lib/utils";
import { ProjectFormData } from "../ProjectCreationWizardTypes";

interface StepMoedaConsolidacaoProps {
  formData: ProjectFormData;
  onChange: (data: Partial<ProjectFormData>) => void;
}

export function StepMoedaConsolidacao({ formData, onChange }: StepMoedaConsolidacaoProps) {
  const { cotacaoUSD, loading: loadingCotacao } = useCotacoes();
  const [localCotacao, setLocalCotacao] = useState<string>(
    formData.cotacao_trabalho?.toString() || ""
  );

  // Sincronizar localCotacao com formData
  useEffect(() => {
    if (formData.cotacao_trabalho !== null) {
      setLocalCotacao(formData.cotacao_trabalho.toString());
    }
  }, [formData.cotacao_trabalho]);

  const handleCotacaoChange = (value: string) => {
    setLocalCotacao(value);
    onChange({ cotacao_trabalho: value ? parseFloat(value) : null });
  };

  const handleUsePtax = () => {
    const ptaxValue = cotacaoUSD.toFixed(4);
    setLocalCotacao(ptaxValue);
    onChange({ cotacao_trabalho: parseFloat(ptaxValue) });
  };

  const delta = localCotacao
    ? ((parseFloat(localCotacao) - cotacaoUSD) / cotacaoUSD) * 100
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-xl font-semibold">Moeda de Consolidação</h2>
          <Badge variant="destructive" className="text-xs">Obrigatório</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Esta moeda será usada para ciclos, metas, lucro, ROI e todos os comparativos do projeto.
        </p>
      </div>

      {/* Alerta de Importância */}
      <div className="flex gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
        <ShieldAlert className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-medium text-amber-500">Decisão Estrutural</div>
          <p className="text-sm text-muted-foreground">
            Esta escolha define a base contábil de <strong>todo o projeto</strong>. 
            Valores originais nas casas nunca são alterados — a conversão é apenas analítica.
          </p>
        </div>
      </div>

      {/* Moeda de Consolidação */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Moeda oficial de consolidação</Label>
        <RadioGroup
          value={formData.moeda_consolidacao}
          onValueChange={(v) => onChange({ moeda_consolidacao: v as "BRL" | "USD" })}
          className="grid grid-cols-2 gap-4"
        >
          <Label
            htmlFor="usd"
            className={cn(
              "flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all",
              formData.moeda_consolidacao === "USD"
                ? "border-blue-500 bg-blue-500/10"
                : "border-border hover:border-blue-500/50"
            )}
          >
            <RadioGroupItem value="USD" id="usd" className="sr-only" />
            <DollarSign
              className={cn(
                "h-8 w-8",
                formData.moeda_consolidacao === "USD"
                  ? "text-blue-400"
                  : "text-muted-foreground"
              )}
            />
            <div>
              <div className="font-medium">USD (Dólar)</div>
              <div className="text-xs text-muted-foreground">
                Recomendado para operações internacionais
              </div>
            </div>
          </Label>

          <Label
            htmlFor="brl"
            className={cn(
              "flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all",
              formData.moeda_consolidacao === "BRL"
                ? "border-emerald-500 bg-emerald-500/10"
                : "border-border hover:border-emerald-500/50"
            )}
          >
            <RadioGroupItem value="BRL" id="brl" className="sr-only" />
            <Banknote
              className={cn(
                "h-8 w-8",
                formData.moeda_consolidacao === "BRL"
                  ? "text-emerald-400"
                  : "text-muted-foreground"
              )}
            />
            <div>
              <div className="font-medium">BRL (Real)</div>
              <div className="text-xs text-muted-foreground">
                Para operações predominantemente nacionais
              </div>
            </div>
          </Label>
        </RadioGroup>
      </div>

      <Separator />

      {/* Fonte de Cotação */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Fonte de cotação para conversões</Label>
        <RadioGroup
          value={formData.fonte_cotacao}
          onValueChange={(v) => onChange({ fonte_cotacao: v as "TRABALHO" | "PTAX" })}
          className="space-y-2"
        >
          <Label
            htmlFor="trabalho"
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
              formData.fonte_cotacao === "TRABALHO"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50"
            )}
          >
            <RadioGroupItem value="TRABALHO" id="trabalho" />
            <div className="flex-1">
              <div className="font-medium">Cotação de Trabalho</div>
              <div className="text-xs text-muted-foreground">
                Cotação editável manualmente. Flexível para ajustes operacionais.
              </div>
            </div>
            <Badge variant="secondary" className="text-xs">Recomendado</Badge>
          </Label>

          <Label
            htmlFor="ptax"
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
              formData.fonte_cotacao === "PTAX"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50"
            )}
          >
            <RadioGroupItem value="PTAX" id="ptax" />
            <div className="flex-1">
              <div className="font-medium">PTAX (Banco Central)</div>
              <div className="text-xs text-muted-foreground">
                Cotação oficial automática. Atualizada diariamente.
              </div>
            </div>
          </Label>
        </RadioGroup>
      </div>

      {/* Cotação de Trabalho (se selecionada) */}
      {formData.fonte_cotacao === "TRABALHO" && (
        <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border/50">
          <Label className="text-sm font-medium">Cotação de trabalho (USD/BRL)</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                R$
              </span>
              <Input
                type="number"
                step="0.0001"
                value={localCotacao}
                onChange={(e) => handleCotacaoChange(e.target.value)}
                placeholder={cotacaoUSD.toFixed(4)}
                className="pl-9 font-mono"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleUsePtax}
              disabled={loadingCotacao}
              className="gap-2"
            >
              <RefreshCw className={cn("h-4 w-4", loadingCotacao && "animate-spin")} />
              Usar PTAX
            </Button>
          </div>

          {/* Comparação com PTAX */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">PTAX atual:</span>
              <span className="font-mono">{cotacaoUSD.toFixed(4)}</span>
            </div>
            {localCotacao && (
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Delta:</span>
                <span
                  className={cn(
                    "flex items-center gap-1 font-mono",
                    delta > 0 ? "text-amber-400" : "text-emerald-400"
                  )}
                >
                  {delta > 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {delta > 0 ? "+" : ""}
                  {delta.toFixed(2)}%
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Resumo da Configuração */}
      <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-medium text-primary">Configuração Atual</div>
            <p className="text-sm text-muted-foreground">
              Consolidação em{" "}
              <strong className={formData.moeda_consolidacao === "USD" ? "text-blue-400" : "text-emerald-400"}>
                {formData.moeda_consolidacao}
              </strong>{" "}
              usando{" "}
              <strong>
                {formData.fonte_cotacao === "TRABALHO"
                  ? `cotação de trabalho (${localCotacao || "pendente"})`
                  : "PTAX automática"}
              </strong>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
