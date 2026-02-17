import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Gift, Loader2, Lock } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useBookmakerSaldosQuery } from "@/hooks/useBookmakerSaldosQuery";
import { BookmakerSelectOption } from "@/components/bookmakers/BookmakerSelectOption";
import { useWorkspace } from "@/hooks/useWorkspace";

const formSchema = z.object({
  bookmaker_id: z.string().min(1, "Selecione uma casa"),
  valor: z.number().min(0.01, "Valor deve ser maior que 0"),
  data_validade: z.date().optional().nullable(),
  tem_rollover: z.boolean().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface FreebetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projetoId: string;
  onSuccess: () => void;
  preselectedBookmakerId?: string;
  freebet?: {
    id: string;
    bookmaker_id: string;
    valor: number;
    status: "LIBERADA" | "PENDENTE" | "NAO_LIBERADA";
    data_validade: string | null;
    tem_rollover?: boolean;
  };
}

export function FreebetDialog({
  open,
  onOpenChange,
  projetoId,
  onSuccess,
  preselectedBookmakerId,
  freebet,
}: FreebetDialogProps) {
  const [bookmakerId, setBookmakerId] = useState(preselectedBookmakerId || "");
  const [saving, setSaving] = useState(false);
  const { workspaceId } = useWorkspace();

  const isEditing = !!freebet;

  // Use the same hook as Giros Grátis
  const { 
    data: bookmakersData,
    isLoading: loadingBookmakers 
  } = useBookmakerSaldosQuery({
    projetoId,
    enabled: open,
    includeZeroBalance: true,
    currentBookmakerId: freebet?.bookmaker_id || preselectedBookmakerId || null
  });

  // Map to format used by BookmakerSelectOption
  const bookmakers = useMemo(() => {
    return (bookmakersData || []).map((bk) => ({
      id: bk.id,
      nome: bk.nome,
      moeda: bk.moeda || "BRL",
      logo_url: bk.logo_url || null,
      parceiro_nome: bk.parceiro_nome || null,
      saldo_operavel: bk.saldo_operavel || 0,
      saldo_freebet: bk.saldo_freebet || 0,
    }));
  }, [bookmakersData]);

  const selectedBookmaker = useMemo(() => 
    bookmakers.find(b => b.id === bookmakerId),
    [bookmakers, bookmakerId]
  );

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      bookmaker_id: preselectedBookmakerId || "",
      valor: 0,
      data_validade: null,
      tem_rollover: false,
    },
  });

  // Reset form and state when dialog opens
  useEffect(() => {
    if (open) {
      if (freebet) {
        setBookmakerId(freebet.bookmaker_id);
        form.reset({
          bookmaker_id: freebet.bookmaker_id,
          valor: freebet.valor,
          data_validade: freebet.data_validade ? new Date(freebet.data_validade) : null,
          tem_rollover: freebet.tem_rollover || false,
        });
      } else {
        setBookmakerId(preselectedBookmakerId || "");
        form.reset({
          bookmaker_id: preselectedBookmakerId || "",
          valor: 0,
          data_validade: null,
          tem_rollover: false,
        });
      }
    }
  }, [open, freebet, preselectedBookmakerId, form]);

  // Sync bookmaker selection with form
  useEffect(() => {
    form.setValue("bookmaker_id", bookmakerId);
  }, [bookmakerId, form]);

  const onSubmit = async (data: FormData) => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      if (!workspaceId) throw new Error("Workspace não definido nesta aba");

      // Import do serviço de ledger de freebet
      const { creditarFreebetViaLedger, consumirFreebetViaLedger, estornarFreebetViaLedger } = await import("@/lib/freebetLedgerService");

      if (isEditing && freebet) {
        // Calculate delta for saldo_freebet update
        const oldValue = freebet.valor;
        const oldStatus = freebet.status;
        const newValue = data.valor;
        // Status is always LIBERADA for manual freebets now
        const newStatus = "LIBERADA";
        const oldBookmakerId = freebet.bookmaker_id;
        const newBookmakerId = data.bookmaker_id;

        // Update the freebet record
        const { error } = await supabase
          .from("freebets_recebidas")
          .update({
            bookmaker_id: newBookmakerId,
            valor: newValue,
            status: newStatus,
            data_validade: data.data_validade?.toISOString() || null,
            tem_rollover: data.tem_rollover || false,
          })
          .eq("id", freebet.id);

        if (error) throw error;

        // MIGRADO PARA LEDGER: Update saldo_freebet via RPCs atômicas
        const oldContribution = oldStatus === "LIBERADA" ? oldValue : 0;
        const newContribution = newValue; // Always LIBERADA now

        if (oldBookmakerId === newBookmakerId) {
          // Same bookmaker - calcular delta e aplicar
          const delta = newContribution - oldContribution;
          if (delta > 0) {
            // Crédito adicional
            await creditarFreebetViaLedger(newBookmakerId, delta, 'EDICAO_MANUAL', { descricao: `Ajuste de valor de freebet (edição): +${delta}` });
          } else if (delta < 0) {
            // Débito (estorno parcial)
            await estornarFreebetViaLedger(newBookmakerId, Math.abs(delta), 'Redução de valor (edição)');
          }
        } else {
          // Different bookmaker - estornar da antiga, creditar na nova
          if (oldContribution > 0) {
            await estornarFreebetViaLedger(oldBookmakerId, oldContribution, 'Transferência para outra casa (edição)');
          }
          
          if (newContribution > 0) {
            await creditarFreebetViaLedger(newBookmakerId, newContribution, 'EDICAO_MANUAL', { descricao: `Freebet transferida de outra casa (edição)` });
          }
        }
      } else {
        // Create new freebet - always with status LIBERADA
        // CRÍTICO: Persistir moeda_operacao da bookmaker selecionada
        const moedaOperacao = selectedBookmaker?.moeda || "BRL";
        const { error } = await supabase
          .from("freebets_recebidas")
          .insert({
            projeto_id: projetoId,
            bookmaker_id: data.bookmaker_id,
            valor: data.valor,
            status: "LIBERADA",
            motivo: "Adicionada manualmente",
            data_recebida: new Date().toISOString(),
            data_validade: data.data_validade?.toISOString() || null,
            origem: "MANUAL",
            user_id: user.id,
            workspace_id: workspaceId,
            utilizada: false,
            tem_rollover: data.tem_rollover || false,
            moeda_operacao: moedaOperacao,
          });

        if (error) throw error;

        // MIGRADO PARA LEDGER: Creditar saldo_freebet via RPC atômica
        await creditarFreebetViaLedger(data.bookmaker_id, data.valor, 'MANUAL', { descricao: 'Freebet adicionada manualmente' });
      }

      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Erro ao salvar freebet:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-amber-400" />
            {isEditing ? "Editar Freebet" : "Nova Freebet"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Bookmaker - Same pattern as Giros Grátis */}
            <FormField
              control={form.control}
              name="bookmaker_id"
              render={() => (
                <FormItem>
                  <FormLabel>Casa</FormLabel>
                  <Select 
                    value={bookmakerId} 
                    onValueChange={setBookmakerId}
                    disabled={!!preselectedBookmakerId}
                  >
                    <SelectTrigger disabled={loadingBookmakers} className="h-auto min-h-10">
                      {loadingBookmakers ? (
                        <span className="text-muted-foreground">Carregando...</span>
                      ) : selectedBookmaker ? (
                        <BookmakerSelectOption bookmaker={selectedBookmaker} />
                      ) : (
                        <span className="text-muted-foreground">Selecione uma casa</span>
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
                  <FormLabel>Valor {selectedBookmaker && `(${selectedBookmaker.moeda})`}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />


            {/* Data Validade (opcional) */}
            <FormField
              control={form.control}
              name="data_validade"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Data de Validade (opcional)</FormLabel>
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
                            format(field.value, "dd/MM/yyyy", { locale: ptBR })
                          ) : (
                            <span>Sem validade</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value || undefined}
                        onSelect={field.onChange}
                        disabled={(date) => date < new Date()}
                        initialFocus
                        locale={ptBR}
                      />
                      {field.value && (
                        <div className="p-2 border-t">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="w-full text-xs"
                            onClick={() => field.onChange(null)}
                          >
                            Remover validade
                          </Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
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
                      Após uso, o lucro terá restrição de saque
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? "Salvar" : "Adicionar"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
