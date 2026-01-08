import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/ui/money-input";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Info, Zap, ListChecks, Calculator, Loader2 } from "lucide-react";
import { GiroGratisComBookmaker, GiroGratisFormData, GiroGratisModo } from "@/types/girosGratis";
import { format } from "date-fns";
import { useBookmakerSaldosQuery } from "@/hooks/useBookmakerSaldosQuery";
import { BookmakerSelectOption } from "@/components/bookmakers/BookmakerSelectOption";

interface GiroGratisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projetoId: string;
  giro?: GiroGratisComBookmaker | null;
  onSave: (data: GiroGratisFormData) => Promise<boolean>;
}

export function GiroGratisDialog({
  open,
  onOpenChange,
  projetoId,
  giro,
  onSave,
}: GiroGratisDialogProps) {
  const [loading, setLoading] = useState(false);
  const [modo, setModo] = useState<GiroGratisModo>("simples");
  const [bookmakerId, setBookmakerId] = useState("");
  const [dataRegistro, setDataRegistro] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [valorRetorno, setValorRetorno] = useState(0);
  const [quantidadeGiros, setQuantidadeGiros] = useState<number>(0);
  const [valorPorGiro, setValorPorGiro] = useState<number>(0);
  const [observacoes, setObservacoes] = useState("");

  // Hook canônico para bookmakers
  const { 
    data: bookmakerSaldos = [], 
    isLoading: loadingBookmakers 
  } = useBookmakerSaldosQuery({
    projetoId,
    enabled: open,
    includeZeroBalance: true,
    currentBookmakerId: giro?.bookmaker_id || null
  });

  // Mapear para formato usado pelo BookmakerSelectOption
  const bookmakers = useMemo(() => {
    return bookmakerSaldos.map(bk => ({
      id: bk.id,
      nome: bk.nome,
      parceiro_nome: bk.parceiro_nome,
      moeda: bk.moeda,
      saldo_operavel: bk.saldo_operavel,
      saldo_disponivel: bk.saldo_disponivel,
      saldo_freebet: bk.saldo_freebet,
      saldo_bonus: bk.saldo_bonus,
      logo_url: bk.logo_url,
      bonus_rollover_started: bk.bonus_rollover_started
    }));
  }, [bookmakerSaldos]);

  // Bookmaker selecionado para exibição
  const selectedBookmaker = useMemo(() => {
    return bookmakers.find(b => b.id === bookmakerId);
  }, [bookmakers, bookmakerId]);

  // Valor total calculado automaticamente no modo detalhado
  const valorTotalGiros = quantidadeGiros * valorPorGiro;

  useEffect(() => {
    if (open) {
      if (giro) {
        setModo(giro.modo);
        setBookmakerId(giro.bookmaker_id);
        setDataRegistro(format(new Date(giro.data_registro), "yyyy-MM-dd"));
        setValorRetorno(giro.valor_retorno);
        setQuantidadeGiros(giro.quantidade_giros || 0);
        setValorPorGiro(giro.valor_por_giro || 0);
        setObservacoes(giro.observacoes || "");
      } else {
        // Reset para novo registro
        setModo("simples");
        setBookmakerId("");
        setDataRegistro(format(new Date(), "yyyy-MM-dd"));
        setValorRetorno(0);
        setQuantidadeGiros(0);
        setValorPorGiro(0);
        setObservacoes("");
      }
    }
  }, [open, giro]);

  const handleSubmit = async () => {
    if (!bookmakerId) {
      return;
    }

    if (modo === "detalhado" && (quantidadeGiros <= 0 || valorPorGiro <= 0)) {
      return;
    }

    setLoading(true);
    try {
      const [year, month, day] = dataRegistro.split('-').map(Number);
      const parsedDate = new Date(year, month - 1, day);

      const formData: GiroGratisFormData = {
        bookmaker_id: bookmakerId,
        modo,
        data_registro: parsedDate,
        valor_retorno: valorRetorno,
        observacoes: observacoes || undefined,
      };

      if (modo === "detalhado") {
        formData.quantidade_giros = quantidadeGiros;
        formData.valor_por_giro = valorPorGiro;
      }

      const success = await onSave(formData);
      if (success) {
        onOpenChange(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const isEditing = !!giro;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Giro Grátis" : "Novo Giro Grátis"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Seletor de Modo */}
          <div className="space-y-2">
            <Label>Modo de Registro</Label>
            <Tabs value={modo} onValueChange={(v) => setModo(v as GiroGratisModo)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="simples" className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Simples
                </TabsTrigger>
                <TabsTrigger value="detalhado" className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4" />
                  Detalhado
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/50 text-xs text-muted-foreground">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              {modo === "simples" ? (
                <span>Registre apenas o valor final retornado. Ideal para registro rápido.</span>
              ) : (
                <span>Registre quantidade de giros e valor por giro. O sistema calcula automaticamente.</span>
              )}
            </div>
          </div>

          {/* Bookmaker */}
          <div className="space-y-2">
            <Label>Casa de Apostas *</Label>
            <Select value={bookmakerId} onValueChange={setBookmakerId}>
              <SelectTrigger disabled={loadingBookmakers} className="h-auto min-h-10">
                {loadingBookmakers ? (
                  <span className="text-muted-foreground">Carregando...</span>
                ) : selectedBookmaker ? (
                  <BookmakerSelectOption
                    bookmaker={selectedBookmaker}
                  />
                ) : (
                  <span className="text-muted-foreground">Selecione a casa</span>
                )}
              </SelectTrigger>
              <SelectContent>
                {bookmakers.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    <BookmakerSelectOption bookmaker={b} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Data */}
          <div className="space-y-2">
            <Label>Data do Registro</Label>
            <DatePicker
              value={dataRegistro}
              onChange={setDataRegistro}
            />
          </div>

          {/* Campos baseados no modo */}
          {modo === "simples" ? (
            <div className="space-y-2">
              <Label>Valor Retornado *</Label>
              <MoneyInput
                value={valorRetorno.toString()}
                onChange={(v) => setValorRetorno(Number(v) || 0)}
                currency="R$"
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Quantidade de Giros *</Label>
                  <Input
                    type="number"
                    min={1}
                    value={quantidadeGiros || ""}
                    onChange={(e) => setQuantidadeGiros(Number(e.target.value) || 0)}
                    placeholder="Ex: 50"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Valor por Giro *</Label>
                  <MoneyInput
                    value={valorPorGiro.toString()}
                    onChange={(v) => setValorPorGiro(Number(v) || 0)}
                    currency="R$"
                  />
                </div>
              </div>

              {/* Valor total calculado */}
              <div className="p-3 rounded-lg bg-muted/50 border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calculator className="h-4 w-4" />
                    <span>Valor Total dos Giros</span>
                  </div>
                  <Badge variant="secondary" className="text-base font-mono">
                    R$ {valorTotalGiros.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </Badge>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Valor Retornado *</Label>
                <MoneyInput
                  value={valorRetorno.toString()}
                  onChange={(v) => setValorRetorno(Number(v) || 0)}
                  currency="R$"
                />
                {valorTotalGiros > 0 && valorRetorno > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Taxa de conversão: {((valorRetorno / valorTotalGiros) * 100).toFixed(1)}%
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Observações */}
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Notas opcionais sobre este registro..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !bookmakerId}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : isEditing ? "Salvar" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
