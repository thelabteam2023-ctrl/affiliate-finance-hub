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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Loader2, Clock, Gift, Zap, ClipboardList, Info, Check } from "lucide-react";
import { GiroDisponivelComBookmaker, GiroDisponivelFormData } from "@/types/girosGratisDisponiveis";
import { format } from "date-fns";
import { useBookmakerSaldosQuery } from "@/hooks/useBookmakerSaldosQuery";
import { BookmakerSelectOption } from "@/components/bookmakers/BookmakerSelectOption";
import { BookmakerSearchableSelectContent } from "@/components/bookmakers/BookmakerSearchableSelectContent";

type FormMode = "rapido" | "completo";

interface GiroDisponivelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projetoId: string;
  giro?: GiroDisponivelComBookmaker | null;
  onSave: (data: GiroDisponivelFormData) => Promise<boolean>;
  /** Callback adicional para quando um lançamento rápido já utilizado é salvo */
  onSaveRapido?: (data: { bookmaker_id: string; valor_retorno: number; data_registro: Date; observacoes?: string }) => Promise<boolean>;
}

export function GiroDisponivelDialog({
  open,
  onOpenChange,
  projetoId,
  giro,
  onSave,
  onSaveRapido,
}: GiroDisponivelDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("rapido");
  
  // Campos comuns
  const [bookmakerId, setBookmakerId] = useState("");
  const [observacoes, setObservacoes] = useState("");
  
  // Campos modo rápido (giro já utilizado)
  const [valorRetorno, setValorRetorno] = useState(0);
  const [dataRegistro, setDataRegistro] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  
  // Campos modo completo (promoção pendente) - simplificado
  const [motivo, setMotivo] = useState("Promoção");
  const [dataRecebido, setDataRecebido] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [dataValidade, setDataValidade] = useState<string>("");

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

  useEffect(() => {
    if (open) {
      if (giro) {
        // Editando promoção existente -> modo completo
        setFormMode("completo");
        setBookmakerId(giro.bookmaker_id);
        setMotivo(giro.motivo);
        setDataRecebido(format(new Date(giro.data_recebido), "yyyy-MM-dd"));
        setDataValidade(giro.data_validade ? format(new Date(giro.data_validade), "yyyy-MM-dd") : "");
        setObservacoes(giro.observacoes || "");
      } else {
        // Novo registro -> resetar para modo rápido
        setFormMode("rapido");
        setBookmakerId("");
        setValorRetorno(0);
        setDataRegistro(format(new Date(), "yyyy-MM-dd"));
        setMotivo("Promoção");
        setDataRecebido(format(new Date(), "yyyy-MM-dd"));
        setDataValidade("");
        setObservacoes("");
      }
    }
  }, [open, giro]);

  const handleSubmitRapido = async () => {
    if (!bookmakerId || valorRetorno <= 0) return;

    setLoading(true);
    try {
      const [year, month, day] = dataRegistro.split('-').map(Number);
      const parsedDate = new Date(year, month - 1, day);

      if (onSaveRapido) {
        const success = await onSaveRapido({
          bookmaker_id: bookmakerId,
          valor_retorno: valorRetorno,
          data_registro: parsedDate,
          observacoes: observacoes || undefined,
        });
        if (success) {
          onOpenChange(false);
        }
      } else {
        // Fallback: criar como promoção já utilizada
        const formData: GiroDisponivelFormData = {
          bookmaker_id: bookmakerId,
          quantidade_giros: 1,
          valor_por_giro: valorRetorno,
          motivo: "Lançamento Rápido",
          data_recebido: parsedDate,
          data_validade: null,
          observacoes: observacoes || undefined,
        };
        const success = await onSave(formData);
        if (success) {
          onOpenChange(false);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitCompleto = async () => {
    if (!bookmakerId) {
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

      // Simplificado: quantidade e valor fixos (não relevantes para o usuário)
      const formData: GiroDisponivelFormData = {
        bookmaker_id: bookmakerId,
        quantidade_giros: 1, // Valor padrão
        valor_por_giro: 0, // Valor padrão - não relevante
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

  const handleSubmit = () => {
    if (formMode === "rapido") {
      handleSubmitRapido();
    } else {
      handleSubmitCompleto();
    }
  };

  const isEditing = !!giro;
  const canSubmitRapido = bookmakerId && valorRetorno > 0;
  const canSubmitCompleto = !!bookmakerId;
  const canSubmit = formMode === "rapido" ? canSubmitRapido : canSubmitCompleto;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            {isEditing ? "Editar Promoção" : "Novo Giro Grátis"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Seletor de Modo - apenas para novos registros */}
          {!isEditing && (
            <div className="space-y-2">
              <Tabs value={formMode} onValueChange={(v) => setFormMode(v as FormMode)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="rapido" className="flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Lançamento Rápido
                  </TabsTrigger>
                  <TabsTrigger value="completo" className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" />
                    Promoção Pendente
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                <Info className="h-4 w-4 mt-0.5 shrink-0" />
                {formMode === "rapido" ? (
                  <span>Registro direto de giros <strong>já utilizados</strong>. Informe apenas a casa e quanto ganhou.</span>
                ) : (
                  <span>Registre promoções <strong>pendentes</strong> para usar depois.</span>
                )}
              </div>
            </div>
          )}

          {/* Bookmaker - comum a ambos */}
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
                <BookmakerSearchableSelectContent bookmakers={bookmakers} />
            </Select>
          </div>

          {/* MODO RÁPIDO */}
          {formMode === "rapido" && !isEditing && (
            <>
              <div className="space-y-2">
                <Label>Quanto você ganhou? *</Label>
                <MoneyInput
                  value={valorRetorno.toString()}
                  onChange={(v) => setValorRetorno(Number(v) || 0)}
                  currency={selectedBookmaker?.moeda === "USD" || selectedBookmaker?.moeda === "USDT" ? "$" : "R$"}
                  placeholder="0,00"
                />
              </div>

              <div className="space-y-2">
                <Label>Data</Label>
                <DatePicker
                  value={dataRegistro}
                  onChange={setDataRegistro}
                />
              </div>

              {/* Resumo */}
              {valorRetorno > 0 && (
                <div className="p-3 rounded-lg bg-success/10 border border-success/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-success" />
                      <span>Lucro dos Giros</span>
                    </div>
                    <Badge variant="default" className="text-base font-mono bg-success">
                      {selectedBookmaker?.moeda === "USD" || selectedBookmaker?.moeda === "USDT" ? "$" : "R$"} {valorRetorno.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </Badge>
                  </div>
                </div>
              )}
            </>
          )}

          {/* MODO COMPLETO - Simplificado */}
          {(formMode === "completo" || isEditing) && (
            <>
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
            </>
          )}

          {/* Observações - comum a ambos */}
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
            disabled={loading || !canSubmit}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : isEditing ? (
              "Salvar"
            ) : formMode === "rapido" ? (
              "Registrar Ganho"
            ) : (
              "Registrar Promoção"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
