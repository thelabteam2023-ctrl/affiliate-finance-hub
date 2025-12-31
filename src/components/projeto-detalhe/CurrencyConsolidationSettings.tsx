/**
 * Componente de configuração de moeda de consolidação do projeto
 * 
 * Permite ao usuário definir:
 * - Moeda de consolidação (BRL ou USD)
 * - Cotação de trabalho personalizada
 * - Fonte preferida de cotação
 */

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  Save,
  TrendingUp,
  TrendingDown,
  Info
} from "lucide-react";
import { useProjetoConsolidacao } from "@/hooks/useProjetoConsolidacao";
import { 
  getMoedaBadgeColor, 
  getMoedaTextColor,
  type MoedaConsolidacao,
  type FonteCotacao 
} from "@/types/projeto";
import { cn } from "@/lib/utils";

interface CurrencyConsolidationSettingsProps {
  projetoId: string;
}

export function CurrencyConsolidationSettings({ projetoId }: CurrencyConsolidationSettingsProps) {
  const {
    config,
    isLoading,
    moedaConsolidacao,
    fonteCotacao,
    cotacaoTrabalho,
    cotacaoAtual,
    ptaxAtual,
    deltaCambial,
    updateConfig,
    isUpdating,
  } = useProjetoConsolidacao({ projetoId });

  // Estado local para edição
  const [localMoeda, setLocalMoeda] = useState<MoedaConsolidacao>("USD");
  const [localFonte, setLocalFonte] = useState<FonteCotacao>("TRABALHO");
  const [localCotacao, setLocalCotacao] = useState<string>("");
  const [hasChanges, setHasChanges] = useState(false);

  // Sincronizar com dados do servidor
  useEffect(() => {
    if (config) {
      setLocalMoeda(config.moeda_consolidacao);
      setLocalFonte(config.fonte_cotacao);
      setLocalCotacao(config.cotacao_trabalho?.toString() || "");
    }
  }, [config]);

  // Detectar mudanças
  useEffect(() => {
    if (!config) return;
    
    const moedaChanged = localMoeda !== config.moeda_consolidacao;
    const fonteChanged = localFonte !== config.fonte_cotacao;
    const cotacaoChanged = localCotacao !== (config.cotacao_trabalho?.toString() || "");
    
    setHasChanges(moedaChanged || fonteChanged || cotacaoChanged);
  }, [localMoeda, localFonte, localCotacao, config]);

  const handleSave = () => {
    updateConfig({
      moeda_consolidacao: localMoeda,
      fonte_cotacao: localFonte,
      cotacao_trabalho: localCotacao ? parseFloat(localCotacao) : null,
    });
  };

  const handleUsePtax = () => {
    setLocalCotacao(ptaxAtual.toFixed(4));
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-10 bg-muted rounded" />
            <div className="h-10 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Moeda de Consolidação
        </CardTitle>
        <CardDescription>
          Configure a moeda única usada para consolidar todos os KPIs do projeto.
          Esta escolha afeta dashboards, ROI, P/L e todas as análises.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Moeda de Consolidação */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Moeda oficial de consolidação</Label>
          <RadioGroup
            value={localMoeda}
            onValueChange={(v) => setLocalMoeda(v as MoedaConsolidacao)}
            className="grid grid-cols-2 gap-4"
          >
            <Label
              htmlFor="usd"
              className={cn(
                "flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all",
                localMoeda === "USD" 
                  ? "border-blue-500 bg-blue-500/10" 
                  : "border-border hover:border-blue-500/50"
              )}
            >
              <RadioGroupItem value="USD" id="usd" className="sr-only" />
              <DollarSign className={cn(
                "h-8 w-8",
                localMoeda === "USD" ? "text-blue-400" : "text-muted-foreground"
              )} />
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
                localMoeda === "BRL" 
                  ? "border-emerald-500 bg-emerald-500/10" 
                  : "border-border hover:border-emerald-500/50"
              )}
            >
              <RadioGroupItem value="BRL" id="brl" className="sr-only" />
              <Banknote className={cn(
                "h-8 w-8",
                localMoeda === "BRL" ? "text-emerald-400" : "text-muted-foreground"
              )} />
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
            value={localFonte}
            onValueChange={(v) => setLocalFonte(v as FonteCotacao)}
            className="space-y-2"
          >
            <Label
              htmlFor="trabalho"
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                localFonte === "TRABALHO" 
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
                localFonte === "PTAX" 
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
        {localFonte === "TRABALHO" && (
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
                  onChange={(e) => setLocalCotacao(e.target.value)}
                  placeholder={ptaxAtual.toFixed(4)}
                  className="pl-9 font-mono"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleUsePtax}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Usar PTAX
              </Button>
            </div>
            
            {/* Comparação com PTAX */}
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">PTAX atual:</span>
                <span className="font-mono">{ptaxAtual.toFixed(4)}</span>
              </div>
              {localCotacao && (
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Delta:</span>
                  {(() => {
                    const delta = ((parseFloat(localCotacao) - ptaxAtual) / ptaxAtual) * 100;
                    return (
                      <span className={cn(
                        "flex items-center gap-1 font-mono",
                        delta > 0 ? "text-amber-400" : "text-emerald-400"
                      )}>
                        {delta > 0 ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {delta > 0 ? "+" : ""}{delta.toFixed(2)}%
                      </span>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Aviso Importante */}
        <div className="flex gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm">
            <div className="font-medium text-amber-500">Importante</div>
            <p className="text-muted-foreground">
              A moeda de consolidação afeta <strong>todos os KPIs e análises</strong> do projeto.
              Valores originais nas casas de apostas <strong>nunca são alterados</strong> — 
              a conversão é usada apenas para fins analíticos.
            </p>
          </div>
        </div>

        {/* Botão Salvar */}
        {hasChanges && (
          <Button 
            onClick={handleSave} 
            disabled={isUpdating}
            className="w-full gap-2"
          >
            {isUpdating ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Salvar Configurações
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
