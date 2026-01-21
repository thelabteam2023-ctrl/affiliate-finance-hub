/**
 * Etapa 2 - Moeda e Consolidação Financeira (OBRIGATÓRIA)
 */

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign,
  Banknote,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Calculator,
  Building2,
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

  // Derived: precisa conversão apenas se moeda ≠ BRL
  const needsConversion = formData.moeda_consolidacao !== "BRL";

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
      {/* Header com microcopy */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-xl font-semibold">Moeda de Consolidação</h2>
          <Badge variant="destructive" className="text-xs">Obrigatório</Badge>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Essa escolha define a base contábil do projeto (ciclos, metas, lucro e ROI).
          <br />
          <span className="text-muted-foreground/70">
            Valores originais das casas não são alterados — a conversão é apenas analítica.
          </span>
        </p>
      </div>

      {/* Seleção de Moeda - Grid 2 colunas */}
      <div className="grid grid-cols-2 gap-4">
        {/* BRL - Primeiro (pré-selecionado) */}
        <button
          type="button"
          onClick={() => onChange({ moeda_consolidacao: "BRL" })}
          className={cn(
            "flex items-center gap-3 p-4 rounded-lg border-2 text-left transition-all",
            formData.moeda_consolidacao === "BRL"
              ? "border-emerald-500 bg-emerald-500/10"
              : "border-border hover:border-emerald-500/50"
          )}
        >
          <Banknote
            className={cn(
              "h-8 w-8 flex-shrink-0",
              formData.moeda_consolidacao === "BRL"
                ? "text-emerald-400"
                : "text-muted-foreground"
            )}
          />
          <div className="min-w-0">
            <div className="font-medium">BRL (Real)</div>
            <div className="text-xs text-muted-foreground">
              Operações nacionais
            </div>
          </div>
        </button>

        {/* USD */}
        <button
          type="button"
          onClick={() => onChange({ moeda_consolidacao: "USD" })}
          className={cn(
            "flex items-center gap-3 p-4 rounded-lg border-2 text-left transition-all",
            formData.moeda_consolidacao === "USD"
              ? "border-blue-500 bg-blue-500/10"
              : "border-border hover:border-blue-500/50"
          )}
        >
          <DollarSign
            className={cn(
              "h-8 w-8 flex-shrink-0",
              formData.moeda_consolidacao === "USD"
                ? "text-blue-400"
                : "text-muted-foreground"
            )}
          />
          <div className="min-w-0">
            <div className="font-medium">USD (Dólar)</div>
            <div className="text-xs text-muted-foreground">
              Operações internacionais
            </div>
          </div>
        </button>
      </div>

      {/* Seção de Conversão - APENAS quando moeda ≠ BRL */}
      {needsConversion ? (
        <>
          {/* Fonte de Cotação - Cards lado a lado */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Fonte de cotação para conversões</Label>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Card - Cotação de Trabalho */}
              <div
                className={cn(
                  "rounded-lg border-2 transition-all",
                  formData.fonte_cotacao === "TRABALHO"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
              >
                <button
                  type="button"
                  onClick={() => onChange({ fonte_cotacao: "TRABALHO" })}
                  className="flex items-start gap-3 p-4 w-full text-left"
                >
                  <Calculator
                    className={cn(
                      "h-5 w-5 mt-0.5 flex-shrink-0",
                      formData.fonte_cotacao === "TRABALHO"
                        ? "text-primary"
                        : "text-muted-foreground"
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Cotação de Trabalho</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        Recomendado
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Cotação editável manualmente
                    </div>
                  </div>
                </button>

                {/* Campo expandido - apenas quando selecionado */}
                {formData.fonte_cotacao === "TRABALHO" && (
                  <div className="px-4 pb-4 pt-0 space-y-3 border-t border-border/50">
                    <div className="flex gap-2 pt-3">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                          R$
                        </span>
                        <Input
                          type="number"
                          step="0.0001"
                          value={localCotacao}
                          onChange={(e) => handleCotacaoChange(e.target.value)}
                          placeholder={cotacaoUSD.toFixed(4)}
                          className="pl-9 font-mono h-9"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleUsePtax}
                        disabled={loadingCotacao}
                        className="gap-1.5 text-xs h-9"
                      >
                        <RefreshCw className={cn("h-3.5 w-3.5", loadingCotacao && "animate-spin")} />
                        PTAX
                      </Button>
                    </div>

                    {/* Comparação com PTAX */}
                    <div className="flex items-center gap-3 text-xs flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">PTAX:</span>
                        <span className="font-mono">{cotacaoUSD.toFixed(4)}</span>
                      </div>
                      {localCotacao && (
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">Δ</span>
                          <span
                            className={cn(
                              "flex items-center gap-0.5 font-mono",
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
              </div>

              {/* Card - PTAX */}
              <button
                type="button"
                onClick={() => onChange({ fonte_cotacao: "PTAX" })}
                className={cn(
                  "flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-all h-fit",
                  formData.fonte_cotacao === "PTAX"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
              >
                <Building2
                  className={cn(
                    "h-5 w-5 mt-0.5 flex-shrink-0",
                    formData.fonte_cotacao === "PTAX"
                      ? "text-primary"
                      : "text-muted-foreground"
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">Cotação Oficial (Automática)</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    FastForex/PTAX BCB atualizada automaticamente
                  </div>
                  {formData.fonte_cotacao === "PTAX" && (
                    <div className="text-xs text-primary mt-2 font-mono">
                      Atual: R$ {cotacaoUSD.toFixed(4)}
                    </div>
                  )}
                </div>
              </button>
            </div>
          </div>

          {/* Resumo da Configuração - Discreto */}
          <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground/80">Configuração:</span>{" "}
              Consolidação em{" "}
              <span className="text-blue-400 font-medium">
                {formData.moeda_consolidacao}
              </span>{" "}
              usando{" "}
              <span className="font-medium text-foreground/80">
                {formData.fonte_cotacao === "TRABALHO"
                  ? `cotação de trabalho (${localCotacao || "—"})`
                  : "PTAX automática"}
              </span>
            </p>
          </div>
        </>
      ) : (
        /* Mensagem simples para BRL - sem conversão necessária */
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
            <p className="text-sm text-muted-foreground">
              Moeda <span className="text-emerald-400 font-medium">BRL</span> selecionada — sem conversão cambial.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
