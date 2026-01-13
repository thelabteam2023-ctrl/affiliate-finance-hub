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
import { Loader2, DollarSign, CalendarIcon } from "lucide-react";
import BookmakerSelect from "@/components/bookmakers/BookmakerSelect";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { CashbackManualFormData } from "@/types/cashback-manual";

const formSchema = z.object({
  bookmaker_id: z.string().min(1, "Selecione uma casa"),
  valor: z.number().min(0.01, "Valor deve ser maior que zero"),
  data_credito: z.date().optional(),
  observacoes: z.string().nullable().optional(),
});

interface CashbackManualDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projetoId: string;
  onSave: (data: CashbackManualFormData) => Promise<boolean>;
}

export function CashbackManualDialog({
  open,
  onOpenChange,
  projetoId,
  onSave,
}: CashbackManualDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      bookmaker_id: "",
      valor: 0,
      data_credito: new Date(),
      observacoes: "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        bookmaker_id: "",
        valor: 0,
        data_credito: new Date(),
        observacoes: "",
      });
    }
  }, [open, form]);

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
      };
      
      const success = await onSave(formData);
      if (success) {
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-500" />
            Lançar Cashback
          </DialogTitle>
          <DialogDescription>
            Registre um cashback já recebido. O saldo será atualizado imediatamente.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">
            {/* Casa / Bookmaker */}
            <FormField
              control={form.control}
              name="bookmaker_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Casa / Bookmaker *</FormLabel>
                  <FormControl>
                    <BookmakerSelect
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Valor */}
            <FormField
              control={form.control}
              name="valor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor do Cashback *</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                        R$
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="0,00"
                        className="pl-10"
                        value={field.value || ""}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </FormControl>
                  <FormDescription>
                    Valor já creditado na sua conta da casa
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
                    Data em que o cashback foi creditado (padrão: hoje)
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
                    Lançar Cashback
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
