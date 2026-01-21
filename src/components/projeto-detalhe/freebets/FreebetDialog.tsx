import { useState, useEffect } from "react";
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
import { CalendarIcon, Gift, Loader2, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const formSchema = z.object({
  bookmaker_id: z.string().min(1, "Selecione uma casa"),
  valor: z.number().min(0.01, "Valor deve ser maior que 0"),
  status: z.enum(["LIBERADA", "PENDENTE"]),
  data_validade: z.date().optional().nullable(),
});

type FormData = z.infer<typeof formSchema>;

interface Bookmaker {
  id: string;
  nome: string;
  logo_url: string | null;
  parceiro_nome: string | null;
  moeda: string;
}

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
  const [bookmakers, setBookmakers] = useState<Bookmaker[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const isEditing = !!freebet;

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      bookmaker_id: preselectedBookmakerId || "",
      valor: 0,
      status: "LIBERADA",
      data_validade: null,
    },
  });

  // Load bookmakers
  useEffect(() => {
    if (!open || !projetoId) return;

    const fetchBookmakers = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("bookmakers")
          .select(`
            id,
            nome,
            moeda,
            parceiros (nome),
            bookmakers_catalogo (logo_url)
          `)
          .eq("projeto_id", projetoId)
          .in("status", ["ativo", "ATIVO", "LIMITADA", "limitada"]);

        if (error) throw error;

        const formatted: Bookmaker[] = (data || []).map((bk: any) => ({
          id: bk.id,
          nome: bk.nome,
          moeda: bk.moeda || "BRL",
          logo_url: bk.bookmakers_catalogo?.logo_url || null,
          parceiro_nome: bk.parceiros?.nome || null,
        }));

        setBookmakers(formatted);
      } catch (err) {
        console.error("Erro ao carregar bookmakers:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchBookmakers();
  }, [open, projetoId]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (freebet) {
        form.reset({
          bookmaker_id: freebet.bookmaker_id,
          valor: freebet.valor,
          status: freebet.status === "NAO_LIBERADA" ? "PENDENTE" : freebet.status,
          data_validade: freebet.data_validade ? new Date(freebet.data_validade) : null,
        });
      } else {
        form.reset({
          bookmaker_id: preselectedBookmakerId || "",
          valor: 0,
          status: "LIBERADA",
          data_validade: null,
        });
      }
    }
  }, [open, freebet, preselectedBookmakerId, form]);

  const onSubmit = async (data: FormData) => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Get workspace_id from bookmaker
      const { data: bookmaker, error: bkError } = await supabase
        .from("bookmakers")
        .select("workspace_id")
        .eq("id", data.bookmaker_id)
        .single();

      if (bkError) throw bkError;

      if (isEditing && freebet) {
        // Update existing
        const { error } = await supabase
          .from("freebets_recebidas")
          .update({
            bookmaker_id: data.bookmaker_id,
            valor: data.valor,
            status: data.status,
            data_validade: data.data_validade?.toISOString() || null,
          })
          .eq("id", freebet.id);

        if (error) throw error;
      } else {
        // Create new
        const { error } = await supabase
          .from("freebets_recebidas")
          .insert({
            projeto_id: projetoId,
            bookmaker_id: data.bookmaker_id,
            valor: data.valor,
            status: data.status,
            motivo: "Adicionada manualmente",
            data_recebida: new Date().toISOString(),
            data_validade: data.data_validade?.toISOString() || null,
            origem: "MANUAL",
            user_id: user.id,
            workspace_id: bookmaker.workspace_id,
            utilizada: false,
          });

        if (error) throw error;
      }

      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Erro ao salvar freebet:", err);
    } finally {
      setSaving(false);
    }
  };

  const selectedBookmaker = bookmakers.find(b => b.id === form.watch("bookmaker_id"));

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
            {/* Bookmaker */}
            <FormField
              control={form.control}
              name="bookmaker_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Casa</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={loading || !!preselectedBookmakerId}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma casa">
                          {selectedBookmaker && (
                            <div className="flex items-center gap-2">
                              {selectedBookmaker.logo_url ? (
                                <img
                                  src={selectedBookmaker.logo_url}
                                  alt={selectedBookmaker.nome}
                                  className="h-5 w-5 rounded object-contain bg-white p-0.5"
                                />
                              ) : (
                                <Building2 className="h-4 w-4" />
                              )}
                              <span>{selectedBookmaker.nome}</span>
                            </div>
                          )}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {bookmakers.map((bk) => (
                        <SelectItem key={bk.id} value={bk.id}>
                          <div className="flex items-center gap-2">
                            {bk.logo_url ? (
                              <img
                                src={bk.logo_url}
                                alt={bk.nome}
                                className="h-5 w-5 rounded object-contain bg-white p-0.5"
                              />
                            ) : (
                              <Building2 className="h-4 w-4" />
                            )}
                            <span>{bk.nome}</span>
                            {bk.parceiro_nome && (
                              <span className="text-xs text-muted-foreground">
                                ({bk.parceiro_nome})
                              </span>
                            )}
                          </div>
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

            {/* Status */}
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="LIBERADA">Liberada</SelectItem>
                      <SelectItem value="PENDENTE">Pendente</SelectItem>
                    </SelectContent>
                  </Select>
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
