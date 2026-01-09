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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import BookmakerSelect from "@/components/bookmakers/BookmakerSelect";
import { 
  CashbackRegraComBookmaker, 
  CashbackRegraFormData,
  CashbackCategoria,
  CashbackTipo,
  CashbackPeriodo,
  CashbackTipoCredito,
  CashbackPrazoCredito,
  CashbackAplicacao,
  CashbackStatus
} from "@/types/cashback";

const formSchema = z.object({
  bookmaker_id: z.string().min(1, "Selecione uma casa"),
  nome: z.string().min(1, "Nome é obrigatório").max(100),
  categoria: z.enum(["promocional", "permanente", "estrategia"]),
  tipo: z.enum(["sobre_perda", "sobre_volume"]),
  percentual: z.number().min(0.01).max(100),
  limite_maximo: z.number().nullable(),
  periodo_apuracao: z.enum(["diario", "semanal", "mensal", "personalizado"]),
  periodo_dias_custom: z.number().nullable().optional(),
  odds_minimas: z.number().nullable(),
  valor_minimo_aposta: z.number().nullable(),
  esportes_validos: z.array(z.string()).nullable(),
  mercados_validos: z.array(z.string()).nullable(),
  tipo_credito: z.enum(["saldo_real", "freebet", "bonus_rollover"]),
  prazo_credito: z.enum(["imediato", "d1", "dx"]),
  prazo_dias_custom: z.number().nullable().optional(),
  aplicacao: z.enum(["automatica", "manual"]),
  status: z.enum(["ativo", "pausado", "encerrado"]),
  observacoes: z.string().nullable(),
});

interface CashbackRegraDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projetoId: string;
  regra?: CashbackRegraComBookmaker | null;
  onSave: (data: CashbackRegraFormData) => Promise<boolean>;
}

export function CashbackRegraDialog({
  open,
  onOpenChange,
  projetoId,
  regra,
  onSave,
}: CashbackRegraDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = !!regra;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      bookmaker_id: "",
      nome: "",
      categoria: "promocional",
      tipo: "sobre_perda",
      percentual: 5,
      limite_maximo: null,
      periodo_apuracao: "semanal",
      periodo_dias_custom: null,
      odds_minimas: null,
      valor_minimo_aposta: null,
      esportes_validos: null,
      mercados_validos: null,
      tipo_credito: "saldo_real",
      prazo_credito: "imediato",
      prazo_dias_custom: null,
      aplicacao: "manual",
      status: "ativo",
      observacoes: null,
    },
  });

  useEffect(() => {
    if (open) {
      if (regra) {
        form.reset({
          bookmaker_id: regra.bookmaker_id,
          nome: regra.nome,
          categoria: regra.categoria,
          tipo: regra.tipo,
          percentual: regra.percentual,
          limite_maximo: regra.limite_maximo,
          periodo_apuracao: regra.periodo_apuracao,
          periodo_dias_custom: regra.periodo_dias_custom,
          odds_minimas: regra.odds_minimas,
          valor_minimo_aposta: regra.valor_minimo_aposta,
          esportes_validos: regra.esportes_validos,
          mercados_validos: regra.mercados_validos,
          tipo_credito: regra.tipo_credito,
          prazo_credito: regra.prazo_credito,
          prazo_dias_custom: regra.prazo_dias_custom,
          aplicacao: regra.aplicacao,
          status: regra.status,
          observacoes: regra.observacoes,
        });
      } else {
        form.reset();
      }
    }
  }, [open, regra, form]);

  const periodoApuracao = form.watch("periodo_apuracao");
  const prazoCredito = form.watch("prazo_credito");

  const handleSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    try {
      const success = await onSave(values as CashbackRegraFormData);
      if (success) {
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Regra de Cashback" : "Nova Regra de Cashback"}
          </DialogTitle>
          <DialogDescription>
            Configure os parâmetros de cálculo e crédito do cashback
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {/* Seção A: Informações Básicas */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground">Informações Básicas</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome do Cashback</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Cashback Semanal 5%" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="bookmaker_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Casa</FormLabel>
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

                <FormField
                  control={form.control}
                  name="categoria"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Categoria</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="promocional">Promocional</SelectItem>
                          <SelectItem value="permanente">Permanente</SelectItem>
                          <SelectItem value="estrategia">Estratégia (ex: surebet)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Separator />

            {/* Seção B: Regra de Cálculo */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground">Regra de Cálculo</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="tipo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de Cashback</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="sobre_perda">Sobre perda</SelectItem>
                          <SelectItem value="sobre_volume">Sobre volume apostado</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="percentual"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Percentual (%)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01"
                          min="0.01"
                          max="100"
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="limite_maximo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Limite Máximo por Período (R$)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01"
                          placeholder="Sem limite"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormDescription>Deixe vazio para sem limite</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="periodo_apuracao"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Período de Apuração</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="diario">Diário</SelectItem>
                          <SelectItem value="semanal">Semanal</SelectItem>
                          <SelectItem value="mensal">Mensal</SelectItem>
                          <SelectItem value="personalizado">Personalizado</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {periodoApuracao === "personalizado" && (
                  <FormField
                    control={form.control}
                    name="periodo_dias_custom"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Dias do Período</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            min="1"
                            placeholder="Ex: 7"
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            </div>

            <Separator />

            {/* Seção C: Condições (opcionais) */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground">Condições (Opcionais)</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="odds_minimas"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Odds Mínimas</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01"
                          placeholder="Ex: 1.50"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="valor_minimo_aposta"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor Mínimo de Aposta (R$)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01"
                          placeholder="Ex: 10.00"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Separator />

            {/* Seção D: Forma de Crédito */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground">Forma de Crédito</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="tipo_credito"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de Crédito</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="saldo_real">Saldo Real</SelectItem>
                          <SelectItem value="freebet">Freebet</SelectItem>
                          <SelectItem value="bonus_rollover">Bônus com Rollover</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="prazo_credito"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Prazo de Crédito</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="imediato">Imediato</SelectItem>
                          <SelectItem value="d1">D+1</SelectItem>
                          <SelectItem value="dx">D+X dias</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {prazoCredito === "dx" && (
                  <FormField
                    control={form.control}
                    name="prazo_dias_custom"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Dias para Crédito</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            min="1"
                            placeholder="Ex: 3"
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            </div>

            <Separator />

            {/* Seção E: Controle */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground">Controle</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="aplicacao"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Aplicação</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="automatica">Automática</SelectItem>
                          <SelectItem value="manual">Manual</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        {field.value === "automatica" 
                          ? "Cashback será calculado automaticamente" 
                          : "Você registra manualmente os valores"
                        }
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="ativo">Ativo</SelectItem>
                          <SelectItem value="pausado">Pausado</SelectItem>
                          <SelectItem value="encerrado">Encerrado</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="observacoes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observações</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Anotações sobre esta regra de cashback..."
                        className="resize-none"
                        rows={3}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? "Salvar Alterações" : "Criar Regra"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
