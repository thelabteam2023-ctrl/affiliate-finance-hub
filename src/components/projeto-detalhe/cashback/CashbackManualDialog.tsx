import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, DollarSign, CalendarIcon, Info, ArrowRight, Lock } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import BookmakerVinculoProjetoSelect, { BookmakerVinculoData } from "@/components/bookmakers/BookmakerVinculoProjetoSelect";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { CashbackManualFormData } from "@/types/cashback-manual";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Mapa de símbolos de moeda
const CURRENCY_SYMBOLS: Record<string, string> = {
  BRL: "R$",
  USD: "$",
  EUR: "€",
  GBP: "£",
  ARS: "$",
  MXN: "$",
  CLP: "$",
  COP: "$",
  PEN: "S/",
  UYU: "$U",
};

const getCurrencySymbol = (currency: string): string => {
  return CURRENCY_SYMBOLS[currency?.toUpperCase()] || currency || "R$";
};

const formSchema = z.object({
  bookmaker_id: z.string().min(1, "Selecione uma casa vinculada ao projeto"),
  valor: z.number().min(0.01, "Valor deve ser maior que zero"),
  data_credito: z.date().optional(),
  observacoes: z.string().nullable().optional(),
  tem_rollover: z.boolean().optional(),
});

interface CashbackManualDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projetoId: string;
  onSave: (data: CashbackManualFormData) => Promise<boolean>;
  editingCashback?: {
    id: string;
    bookmaker_id: string;
    valor: number;
    data_credito: string;
    observacoes: string | null;
    tem_rollover: boolean;
  } | null;
}

export function CashbackManualDialog({
  open,
  onOpenChange,
  projetoId,
  onSave,
  editingCashback,
}: CashbackManualDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedBookmaker, setSelectedBookmaker] = useState<BookmakerVinculoData | null>(null);

  const isEditing = !!editingCashback;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      bookmaker_id: "",
      valor: 0,
      data_credito: new Date(),
      observacoes: "",
      tem_rollover: false,
    },
  });

  useEffect(() => {
    if (open) {
      if (editingCashback) {
        form.reset({
          bookmaker_id: editingCashback.bookmaker_id,
          valor: editingCashback.valor,
          data_credito: editingCashback.data_credito ? new Date(editingCashback.data_credito + "T12:00:00") : new Date(),
          observacoes: editingCashback.observacoes || "",
          tem_rollover: editingCashback.tem_rollover || false,
        });
      } else {
        form.reset({
          bookmaker_id: "",
          valor: 0,
          data_credito: new Date(),
          observacoes: "",
          tem_rollover: false,
        });
        setSelectedBookmaker(null);
      }
    }
  }, [open, form, editingCashback]);

  const handleSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    try {
      const formData: CashbackManualFormData = {
        bookmaker_id: values.bookmaker_id,
        valor: values.valor,
        data_credito: values.data_credito 
          ? format(values.data_credito, "yyyy-MM-dd")
          : undefined,
        observacoes: values.observacoes || null,
        tem_rollover: values.tem_rollover || false,
      };
      
      const success = await onSave(formData);
      if (success) {
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Moeda da casa selecionada
  const moedaSelecionada = selectedBookmaker?.moeda || "BRL";
  const simboloMoeda = getCurrencySymbol(moedaSelecionada);

  // Verificar se é moeda USD
  const isUSDMoeda = moedaSelecionada === "USD" || moedaSelecionada === "USDT";

  // Saldo atual e novo saldo após cashback - usar saldo_usd para moedas USD/USDT
  const valorCashback = form.watch("valor") || 0;
  const saldoAtual = selectedBookmaker 
    ? (isUSDMoeda ? (selectedBookmaker.saldo_usd ?? 0) : (selectedBookmaker.saldo_atual ?? 0))
    : 0;
  const novoSaldo = saldoAtual + valorCashback;

  // Formatar moeda
  const formatCurrency = (value: number) => {
    return `${simboloMoeda} ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-500" />
            {isEditing ? "Editar Cashback" : "Lançar Cashback"}
          </DialogTitle>
          <DialogDescription>
            {isEditing 
              ? "Altere os dados do cashback. O saldo será ajustado automaticamente."
              : "Registre um cashback já recebido. O saldo será atualizado imediatamente."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">
            {/* Alerta informativo */}
            <Alert className="bg-muted/50 border-muted-foreground/20">
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Selecione o vínculo correto (Casa + Parceiro). O saldo será creditado diretamente no vínculo.
              </AlertDescription>
            </Alert>

            {/* Casa / Bookmaker + Parceiro - Filtrado por Projeto */}
            <FormField
              control={form.control}
              name="bookmaker_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Casa + Parceiro *</FormLabel>
                  <FormControl>
                    <BookmakerVinculoProjetoSelect
                      projetoId={projetoId}
                      value={field.value}
                      onValueChange={field.onChange}
                      onBookmakerData={setSelectedBookmaker}
                    />
                  </FormControl>
                  <FormDescription>
                    Selecione o vínculo
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Preview de Saldo - Compacto */}
            {selectedBookmaker && valorCashback > 0 && (
              <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 bg-muted/20">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{formatCurrency(saldoAtual)}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium text-emerald-500">{formatCurrency(novoSaldo)}</span>
                </div>
                <span className="text-xs text-emerald-500">+{formatCurrency(valorCashback)}</span>
              </div>
            )}

            {/* Valor - Com moeda dinâmica */}
            <FormField
              control={form.control}
              name="valor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    Valor do Cashback *
                    {selectedBookmaker && (
                      <span className="text-xs font-normal text-muted-foreground">
                        ({moedaSelecionada})
                      </span>
                    )}
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">
                        {simboloMoeda}
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="0,00"
                        className="pl-12"
                        value={field.value || ""}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </FormControl>
                  <FormDescription>
                    Valor já creditado na sua conta da casa
                    {selectedBookmaker && moedaSelecionada !== "BRL" && (
                      <span className="text-amber-500 ml-1">
                        (em {moedaSelecionada})
                      </span>
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Data do Crédito */}
            <FormField
              control={form.control}
              name="data_credito"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Data do Crédito</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(field.value, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                          ) : (
                            <span>Selecione uma data</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) => date > new Date()}
                        initialFocus
                        locale={ptBR}
                      />
                    </PopoverContent>
                  </Popover>
                  <FormDescription>
                    Data em que o cashback foi creditado
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Observações */}
            <FormField
              control={form.control}
              name="observacoes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Anotações opcionais sobre este cashback..."
                      className="resize-none"
                      rows={2}
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Checkbox de Rollover */}
            <FormField
              control={form.control}
              name="tem_rollover"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3 bg-muted/30">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="flex items-center gap-1.5 text-sm font-normal cursor-pointer">
                      <Lock className="h-3.5 w-3.5 text-amber-500" />
                      Exige cumprimento de rollover
                    </FormLabel>
                    <FormDescription className="text-xs">
                      O cashback possui restrição de saque até cumprir rollover
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />

            {/* Botões */}
            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Lançando...
                  </>
                ) : (
                  <>
                    <DollarSign className="h-4 w-4 mr-2" />
                    {isEditing ? "Salvar Alterações" : "Lançar Cashback"}
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
