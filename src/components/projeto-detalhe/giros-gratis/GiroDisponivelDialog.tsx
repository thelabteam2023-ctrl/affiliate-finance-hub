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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calculator, Loader2, Clock, Gift } from "lucide-react";
import { GiroDisponivelComBookmaker, GiroDisponivelFormData } from "@/types/girosGratisDisponiveis";
import { format } from "date-fns";
import { useBookmakerSaldosQuery } from "@/hooks/useBookmakerSaldosQuery";
import { BookmakerSelectOption } from "@/components/bookmakers/BookmakerSelectOption";

interface GiroDisponivelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projetoId: string;
  giro?: GiroDisponivelComBookmaker | null;
  onSave: (data: GiroDisponivelFormData) => Promise<boolean>;
}

export function GiroDisponivelDialog({
  open,
  onOpenChange,
  projetoId,
  giro,
  onSave,
}: GiroDisponivelDialogProps) {
  const [loading, setLoading] = useState(false);
  const [bookmakerId, setBookmakerId] = useState("");
  const [quantidadeGiros, setQuantidadeGiros] = useState(1);
  const [valorPorGiro, setValorPorGiro] = useState(0);
  const [motivo, setMotivo] = useState("Promoção");
  const [dataRecebido, setDataRecebido] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [dataValidade, setDataValidade] = useState<string>("");
  const [observacoes, setObservacoes] = useState("");

  const { 
    data: bookmakerSaldos = [], 
    isLoading: loadingBookmakers 
  } = useBookmakerSaldosQuery({
    projetoId,
    enabled: open,
    includeZeroBalance: true,
    currentBookmakerId: giro?.bookmaker_id || null
  });

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

  const selectedBookmaker = useMemo(() => {
    return bookmakers.find(b => b.id === bookmakerId);
  }, [bookmakers, bookmakerId]);

  const valorTotal = quantidadeGiros * valorPorGiro;

  useEffect(() => {
    if (open) {
      if (giro) {
        setBookmakerId(giro.bookmaker_id);
        setQuantidadeGiros(giro.quantidade_giros);
        setValorPorGiro(giro.valor_por_giro);
        setMotivo(giro.motivo);
        setDataRecebido(format(new Date(giro.data_recebido), "yyyy-MM-dd"));
        setDataValidade(giro.data_validade ? format(new Date(giro.data_validade), "yyyy-MM-dd") : "");
        setObservacoes(giro.observacoes || "");
      } else {
        setBookmakerId("");
        setQuantidadeGiros(1);
        setValorPorGiro(0);
        setMotivo("Promoção");
        setDataRecebido(format(new Date(), "yyyy-MM-dd"));
        setDataValidade("");
        setObservacoes("");
      }
    }
  }, [open, giro]);

  const handleSubmit = async () => {
    if (!bookmakerId || quantidadeGiros <= 0 || valorPorGiro <= 0) {
      return;
    }

    setLoading(true);
    try {
      const [year, month, day] = dataRecebido.split('-').map(Number);
      const parsedDataRecebido = new Date(year, month - 1, day);
      
      let parsedDataValidade: Date | null = null;
      if (dataValidade) {
        const [vYear, vMonth, vDay] = dataValidade.split('-').map(Number);
        parsedDataValidade = new Date(vYear, vMonth - 1, vDay);
      }

      const formData: GiroDisponivelFormData = {
        bookmaker_id: bookmakerId,
        quantidade_giros: quantidadeGiros,
        valor_por_giro: valorPorGiro,
        motivo,
        data_recebido: parsedDataRecebido,
        data_validade: parsedDataValidade,
        observacoes: observacoes || undefined,
      };

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
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            {isEditing ? "Editar Promoção" : "Nova Promoção de Giros"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Bookmaker */}
          <div className="space-y-2">
            <Label>Casa de Apostas *</Label>
            <Select value={bookmakerId} onValueChange={setBookmakerId}>
              <SelectTrigger disabled={loadingBookmakers} className="h-auto min-h-10">
                {loadingBookmakers ? (
                  <span className="text-muted-foreground">Carregando...</span>
                ) : selectedBookmaker ? (
                  <BookmakerSelectOption bookmaker={selectedBookmaker} />
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

          {/* Quantidade e Valor */}
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
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Calculator className="h-4 w-4 text-primary" />
                <span>Valor Total da Promoção</span>
              </div>
              <Badge variant="default" className="text-base font-mono">
                R$ {valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </Badge>
            </div>
          </div>

          {/* Motivo */}
          <div className="space-y-2">
            <Label>Motivo / Origem</Label>
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex: Bônus de aniversário, Promoção semanal..."
            />
          </div>

          {/* Datas */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data Recebido</Label>
              <DatePicker
                value={dataRecebido}
                onChange={setDataRecebido}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Data de Validade
              </Label>
              <DatePicker
                value={dataValidade}
                onChange={setDataValidade}
                placeholder="Opcional"
              />
            </div>
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={loading || !bookmakerId || quantidadeGiros <= 0 || valorPorGiro <= 0}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : isEditing ? "Salvar" : "Registrar Promoção"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
