import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/ui/money-input";
import { DatePicker } from "@/components/ui/date-picker";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Gift, Check } from "lucide-react";
import { GiroDisponivelComBookmaker } from "@/types/girosGratisDisponiveis";
import { format } from "date-fns";

interface UsarPromocaoSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  promocao: GiroDisponivelComBookmaker | null;
  onConfirm: (valorRetorno: number, dataRegistro: Date, observacoes?: string) => Promise<boolean>;
}

export function UsarPromocaoSheet({
  open,
  onOpenChange,
  promocao,
  onConfirm,
}: UsarPromocaoSheetProps) {
  const [loading, setLoading] = useState(false);
  const [valorRetorno, setValorRetorno] = useState(0);
  const [dataRegistro, setDataRegistro] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [observacoes, setObservacoes] = useState("");

  const handleSubmit = async () => {
    if (!promocao || valorRetorno <= 0) return;

    setLoading(true);
    try {
      const [year, month, day] = dataRegistro.split('-').map(Number);
      const parsedDate = new Date(year, month - 1, day);

      const success = await onConfirm(valorRetorno, parsedDate, observacoes || undefined);
      if (success) {
        // Reset form
        setValorRetorno(0);
        setDataRegistro(format(new Date(), "yyyy-MM-dd"));
        setObservacoes("");
        onOpenChange(false);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!promocao) return null;

  const moeda = "BRL"; // Default, poderia vir do bookmaker

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            Registrar Utilização
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5 py-6">
          {/* Info da Promoção */}
          <div className="p-4 rounded-lg bg-muted/50 border">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={promocao.bookmaker_logo_url || undefined} />
                <AvatarFallback className="text-xs font-medium bg-muted">
                  {(promocao.bookmaker_nome || "?").substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {promocao.bookmaker_nome}
                </p>
                <p className="text-xs text-muted-foreground">
                  {promocao.motivo}
                </p>
              </div>
            </div>
          </div>

          {/* Valor do Retorno */}
          <div className="space-y-2">
            <Label>Quanto você ganhou? *</Label>
            <MoneyInput
              value={valorRetorno.toString()}
              onChange={(v) => setValorRetorno(Number(v) || 0)}
              currency="R$"
              placeholder="0,00"
            />
            <p className="text-xs text-muted-foreground">
              Informe o valor total que você ganhou utilizando esta promoção
            </p>
          </div>

          {/* Data */}
          <div className="space-y-2">
            <Label>Data da utilização</Label>
            <DatePicker
              value={dataRegistro}
              onChange={setDataRegistro}
            />
          </div>

          {/* Observações */}
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Notas opcionais..."
              rows={2}
            />
          </div>

          {/* Resumo */}
          {valorRetorno > 0 && (
            <div className="p-3 rounded-lg bg-success/10 border border-success/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-success" />
                  <span>Lucro a registrar</span>
                </div>
                <Badge variant="default" className="text-base font-mono bg-success">
                  R$ {valorRetorno.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </Badge>
              </div>
            </div>
          )}
        </div>

        <SheetFooter className="flex gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 sm:flex-none">
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={loading || valorRetorno <= 0}
            className="flex-1 sm:flex-none"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              "Confirmar Utilização"
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
