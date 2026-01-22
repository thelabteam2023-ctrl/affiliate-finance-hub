/**
 * Preview de Conversão Multi-Moeda
 * 
 * Mostra ao usuário:
 * - O que ele enviou (origem)
 * - O que será creditado na casa (destino) - EDITÁVEL
 * - O valor de referência em USD (para KPIs)
 */

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Info, ArrowRight, Calculator, DollarSign } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CURRENCY_SYMBOLS, type SupportedCurrency } from "@/types/currency";

interface CurrencyConversionPreviewProps {
  // Origem
  moedaOrigem: string;
  valorOrigem: number;
  cotacaoOrigemUsd: number;
  
  // Destino (casa)
  moedaDestino: string;
  valorDestinoEstimado: number;
  cotacaoDestinoUsd: number;
  
  // Callbacks
  onValorDestinoChange?: (valor: number) => void;
  
  // UI
  editavel?: boolean;
  compacto?: boolean;
}

export function CurrencyConversionPreview({
  moedaOrigem,
  valorOrigem,
  cotacaoOrigemUsd,
  moedaDestino,
  valorDestinoEstimado,
  cotacaoDestinoUsd,
  onValorDestinoChange,
  editavel = false,
  compacto = false,
}: CurrencyConversionPreviewProps) {
  const [valorDestinoLocal, setValorDestinoLocal] = useState(valorDestinoEstimado);
  
  useEffect(() => {
    setValorDestinoLocal(valorDestinoEstimado);
  }, [valorDestinoEstimado]);

  const handleValorDestinoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = parseFloat(e.target.value) || 0;
    setValorDestinoLocal(valor);
    onValorDestinoChange?.(valor);
  };

  // Valor de referência em USD
  const valorUsdReferencia = valorOrigem * cotacaoOrigemUsd;
  
  // Taxa implícita
  const taxaImplicita = valorOrigem > 0 ? valorDestinoLocal / valorOrigem : 0;

  const getSymbol = (moeda: string) => CURRENCY_SYMBOLS[moeda as SupportedCurrency] || moeda;
  
  const formatValue = (valor: number, moeda: string) => {
    const symbol = getSymbol(moeda);
    return `${symbol} ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const precisaConversao = moedaOrigem.toUpperCase() !== moedaDestino.toUpperCase();

  if (!precisaConversao) {
    return null;
  }

  if (compacto) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Calculator className="h-3.5 w-3.5" />
        <span>≈ {formatValue(valorDestinoEstimado, moedaDestino)}</span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Info className="h-3.5 w-3.5" />
            </TooltipTrigger>
            <TooltipContent>
              <p>Valor estimado na moeda da casa</p>
              <p className="text-xs text-muted-foreground">
                1 {moedaOrigem} ≈ {taxaImplicita.toFixed(4)} {moedaDestino}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  return (
    <Card className="border-dashed bg-muted/30">
      <CardContent className="pt-4 pb-3 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2 text-sm font-medium">
          <Calculator className="h-4 w-4 text-primary" />
          <span>Conversão de Moeda</span>
        </div>

        {/* Fluxo: Origem → Destino */}
        <div className="flex items-center justify-between gap-4">
          {/* Origem */}
          <div className="flex-1">
            <Label className="text-xs text-muted-foreground">Enviado</Label>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="font-mono">
                {moedaOrigem}
              </Badge>
              <span className="font-medium">{formatValue(valorOrigem, moedaOrigem)}</span>
            </div>
          </div>

          <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />

          {/* Destino */}
          <div className="flex-1">
            <Label className="text-xs text-muted-foreground">Creditado na Casa</Label>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="default" className="font-mono">
                {moedaDestino}
              </Badge>
              {editavel ? (
                <Input
                  type="number"
                  value={valorDestinoLocal}
                  onChange={handleValorDestinoChange}
                  className="h-8 w-32 font-medium"
                  step="0.01"
                />
              ) : (
                <span className="font-medium">{formatValue(valorDestinoLocal, moedaDestino)}</span>
              )}
            </div>
          </div>
        </div>

        {/* Referência USD */}
        <div className="flex items-center justify-between pt-2 border-t border-dashed">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <DollarSign className="h-3.5 w-3.5" />
            <span>Referência USD (para KPIs)</span>
          </div>
          <span className="text-sm font-mono text-muted-foreground">
            ≈ $ {valorUsdReferencia.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {/* Taxa */}
        <div className="text-xs text-muted-foreground text-center">
          Taxa: 1 {moedaOrigem} = {taxaImplicita.toFixed(4)} {moedaDestino}
        </div>
      </CardContent>
    </Card>
  );
}
