import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface MoedaMultiSelectProps {
  moedas: string[];
  onChange: (moedas: string[]) => void;
  disabled?: boolean;
}

const MOEDAS_DISPONIVEIS = [
  { value: "USDT", label: "Tether (USDT)" },
  { value: "USDC", label: "USD Coin (USDC)" },
  { value: "BTC", label: "Bitcoin (BTC)" },
  { value: "ETH", label: "Ethereum (ETH)" },
  { value: "BNB", label: "Binance Coin (BNB)" },
  { value: "TRX", label: "Tron (TRX)" },
  { value: "SOL", label: "Solana (SOL)" },
  { value: "MATIC", label: "Polygon (MATIC)" },
  { value: "ADA", label: "Cardano (ADA)" },
  { value: "DOT", label: "Polkadot (DOT)" },
  { value: "AVAX", label: "Avalanche (AVAX)" },
  { value: "LINK", label: "Chainlink (LINK)" },
  { value: "UNI", label: "Uniswap (UNI)" },
  { value: "LTC", label: "Litecoin (LTC)" },
  { value: "XRP", label: "Ripple (XRP)" },
];

export function MoedaMultiSelect({ moedas = [], onChange, disabled = false }: MoedaMultiSelectProps) {
  const [selectedMoeda, setSelectedMoeda] = useState("");

  const addMoeda = () => {
    if (selectedMoeda && !moedas.includes(selectedMoeda)) {
      onChange([...moedas, selectedMoeda]);
      setSelectedMoeda("");
    }
  };

  const removeMoeda = (moeda: string) => {
    onChange(moedas.filter(m => m !== moeda));
  };

  const moedasDisponiveis = MOEDAS_DISPONIVEIS.filter(
    m => !moedas.includes(m.value)
  );

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Moeda(s) *</Label>
      
      {/* Moedas selecionadas */}
      {moedas.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {moedas.map((moeda) => {
            const moedaInfo = MOEDAS_DISPONIVEIS.find(m => m.value === moeda);
            return (
              <Badge
                key={moeda}
                variant="secondary"
                className="flex items-center gap-1 px-3 py-1.5"
              >
                {moedaInfo?.label || moeda}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removeMoeda(moeda)}
                    className="ml-1 hover:text-destructive transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            );
          })}
        </div>
      )}

      {/* Adicionar nova moeda */}
      {!disabled && moedasDisponiveis.length > 0 && (
        <div className="flex gap-2">
          <div className="flex-1">
            <Select value={selectedMoeda} onValueChange={setSelectedMoeda}>
              <SelectTrigger className="h-11 bg-background/50 border-border/50">
                <SelectValue placeholder="Selecione uma moeda" />
              </SelectTrigger>
              <SelectContent>
                {moedasDisponiveis.map((moeda) => (
                  <SelectItem key={moeda.value} value={moeda.value}>
                    {moeda.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={addMoeda}
            disabled={!selectedMoeda}
            className="h-11 w-11 rounded-lg bg-background/50 border border-border/50 hover:bg-primary/10 hover:text-primary hover:border-primary/50 transition-colors"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}

      {moedas.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Selecione pelo menos uma moeda para este wallet
        </p>
      )}
    </div>
  );
}