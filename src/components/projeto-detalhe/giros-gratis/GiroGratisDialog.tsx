import { useState, useEffect } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface GiroGratisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projetoId: string;
  giro?: GiroGratisComBookmaker | null;
  onSave: (data: GiroGratisFormData) => Promise<boolean>;
}

interface BookmakerOption {
  id: string;
  nome: string;
  logo_url: string | null;
}

export function GiroGratisDialog({
  open,
  onOpenChange,
  projetoId,
  giro,
  onSave,
}: GiroGratisDialogProps) {
  const [loading, setLoading] = useState(false);
  const [bookmakers, setBookmakers] = useState<BookmakerOption[]>([]);
  const [loadingBookmakers, setLoadingBookmakers] = useState(false);
  const [modo, setModo] = useState<GiroGratisModo>("simples");
  const [bookmakerId, setBookmakerId] = useState("");
  const [dataRegistro, setDataRegistro] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [valorRetorno, setValorRetorno] = useState(0);
  const [quantidadeGiros, setQuantidadeGiros] = useState<number>(0);
  const [valorPorGiro, setValorPorGiro] = useState<number>(0);
  const [observacoes, setObservacoes] = useState("");

  // Valor total calculado automaticamente no modo detalhado
  const valorTotalGiros = quantidadeGiros * valorPorGiro;

  // Buscar bookmakers do projeto
  useEffect(() => {
    if (!open || !projetoId) return;

    const fetchBookmakers = async () => {
      setLoadingBookmakers(true);
      try {
        const { data } = await supabase
          .from("bookmakers")
          .select(`
            id,
            nome,
            bookmakers_catalogo:bookmaker_catalogo_id (logo_url)
          `)
          .eq("projeto_id", projetoId)
          .order("nome");

        setBookmakers((data || []).map((b: any) => ({
          id: b.id,
          nome: b.nome,
          logo_url: b.bookmakers_catalogo?.logo_url || null,
        })));
      } catch (err) {
        console.error("Erro ao buscar bookmakers:", err);
      } finally {
        setLoadingBookmakers(false);
      }
    };

    fetchBookmakers();
  }, [open, projetoId]);

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
              <SelectTrigger disabled={loadingBookmakers}>
                <SelectValue placeholder={loadingBookmakers ? "Carregando..." : "Selecione a casa"} />
              </SelectTrigger>
              <SelectContent>
                {bookmakers.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    <div className="flex items-center gap-2">
                      {b.logo_url && (
                        <img src={b.logo_url} alt="" className="h-5 w-5 rounded object-contain" />
                      )}
                      <span>{b.nome}</span>
                    </div>
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
