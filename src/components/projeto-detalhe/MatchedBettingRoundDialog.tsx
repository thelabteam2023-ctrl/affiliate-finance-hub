import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Gift, Calculator } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";

interface Perna {
  id?: string;
  bookmaker_id: string;
  tipo_aposta: string;
  selecao: string;
  odd: number;
  stake: number;
  comissao_exchange: number;
  is_free_bet: boolean;
  liability?: number;
  resultado?: string;
  retorno?: number;
  lucro_prejuizo?: number;
  status: string;
}

interface Round {
  id: string;
  tipo_round: string;
  evento: string;
  esporte: string;
  mercado: string;
  data_evento: string;
  status: string;
  lucro_esperado: number | null;
  lucro_real: number | null;
  promocao_id: string | null;
  observacoes?: string;
  pernas?: any[];
}

interface Bookmaker {
  id: string;
  nome: string;
}

interface MatchedBettingRoundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projetoId: string;
  round: Round | null;
  onSuccess: () => void;
}

interface FormData {
  tipo_round: string;
  evento: string;
  esporte: string;
  mercado: string;
  data_evento: Date;
  status: string;
  observacoes: string;
}

export function MatchedBettingRoundDialog({
  open,
  onOpenChange,
  projetoId,
  round,
  onSuccess,
}: MatchedBettingRoundDialogProps) {
  const [loading, setLoading] = useState(false);
  const [bookmakers, setBookmakers] = useState<Bookmaker[]>([]);
  const [pernas, setPernas] = useState<Perna[]>([]);
  const [lucroEsperado, setLucroEsperado] = useState(0);

  const form = useForm<FormData>({
    defaultValues: {
      tipo_round: "QUALIFYING_BET",
      evento: "",
      esporte: "",
      mercado: "",
      data_evento: new Date(),
      status: "PENDENTE",
      observacoes: "",
    },
  });

  useEffect(() => {
    if (open) {
      fetchBookmakers();
      if (round) {
        form.reset({
          tipo_round: round.tipo_round,
          evento: round.evento,
          esporte: round.esporte,
          mercado: round.mercado,
          data_evento: new Date(round.data_evento),
          status: round.status,
          observacoes: round.observacoes || "",
        });
        if (round.pernas && round.pernas.length > 0) {
          setPernas(round.pernas.map(p => ({
            id: p.id,
            bookmaker_id: p.bookmaker_id,
            tipo_aposta: p.tipo_aposta,
            selecao: p.selecao,
            odd: p.odd,
            stake: p.stake,
            comissao_exchange: p.comissao_exchange || 0,
            is_free_bet: p.is_free_bet,
            liability: p.liability,
            resultado: p.resultado,
            retorno: p.retorno,
            lucro_prejuizo: p.lucro_prejuizo,
            status: p.status,
          })));
        }
      } else {
        form.reset();
        setPernas([
          { bookmaker_id: "", tipo_aposta: "BACK", selecao: "", odd: 2, stake: 100, comissao_exchange: 0, is_free_bet: false, status: "PENDENTE" },
          { bookmaker_id: "", tipo_aposta: "LAY", selecao: "", odd: 2.1, stake: 0, comissao_exchange: 5, is_free_bet: false, status: "PENDENTE" },
        ]);
      }
    }
  }, [open, round]);

  useEffect(() => {
    calculateExpectedProfit();
  }, [pernas, form.watch("tipo_round")]);

  const fetchBookmakers = async () => {
    const { data } = await supabase
      .from("bookmakers")
      .select("id, nome")
      .eq("status", "ativo");
    setBookmakers(data || []);
  };

  const calculateExpectedProfit = () => {
    const backPerna = pernas.find(p => p.tipo_aposta === "BACK");
    const layPerna = pernas.find(p => p.tipo_aposta === "LAY");

    if (!backPerna || !layPerna || !backPerna.odd || !layPerna.odd) {
      setLucroEsperado(0);
      return;
    }

    const tipoRound = form.watch("tipo_round");
    const isFreeBet = tipoRound === "FREE_BET";
    const comissao = (layPerna.comissao_exchange || 5) / 100;

    let layStake: number;
    let profit: number;

    if (isFreeBet) {
      // Free Bet - stake NOT returned
      layStake = (backPerna.stake * (backPerna.odd - 1)) / (layPerna.odd - comissao);
      // Se BACK ganha: (stake * (odd - 1)) - (layStake * (layOdd - 1))
      // Se LAY ganha: layStake * (1 - comissao) - 0 (porque free bet não perde stake)
      const profitBackWins = backPerna.stake * (backPerna.odd - 1) - layStake * (layPerna.odd - 1);
      const profitLayWins = layStake * (1 - comissao);
      profit = Math.min(profitBackWins, profitLayWins);
    } else {
      // Qualifying Bet - stake returned
      layStake = (backPerna.stake * backPerna.odd) / (layPerna.odd - comissao);
      // Se BACK ganha: (stake * (odd - 1)) - (layStake * (layOdd - 1))
      // Se LAY ganha: layStake * (1 - comissao) - stake
      const profitBackWins = backPerna.stake * (backPerna.odd - 1) - layStake * (layPerna.odd - 1);
      const profitLayWins = layStake * (1 - comissao) - backPerna.stake;
      profit = Math.min(profitBackWins, profitLayWins);
    }

    // Update lay stake in pernas
    setPernas(prev => prev.map(p => 
      p.tipo_aposta === "LAY" ? { ...p, stake: Math.round(layStake * 100) / 100, liability: Math.round(layStake * (layPerna.odd - 1) * 100) / 100 } : p
    ));

    setLucroEsperado(Math.round(profit * 100) / 100);
  };

  const updatePerna = (index: number, field: keyof Perna, value: any) => {
    setPernas(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSubmit = async (data: FormData) => {
    try {
      setLoading(true);

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        toast.error("Usuário não autenticado");
        return;
      }

      // Validate pernas
      if (pernas.length < 2) {
        toast.error("Adicione pelo menos 2 pernas (BACK e LAY)");
        return;
      }

      const hasBack = pernas.some(p => p.tipo_aposta === "BACK" && p.bookmaker_id);
      const hasLay = pernas.some(p => p.tipo_aposta === "LAY" && p.bookmaker_id);

      if (!hasBack || !hasLay) {
        toast.error("Selecione os bookmakers para BACK e LAY");
        return;
      }

      const roundData = {
        user_id: userData.user.id,
        projeto_id: projetoId,
        tipo_round: data.tipo_round,
        evento: data.evento,
        esporte: data.esporte,
        mercado: data.mercado,
        data_evento: data.data_evento.toISOString(),
        status: data.status,
        lucro_esperado: lucroEsperado,
        observacoes: data.observacoes || null,
      };

      let roundId: string;

      if (round) {
        // Update
        const { error } = await supabase
          .from("matched_betting_rounds")
          .update(roundData)
          .eq("id", round.id);

        if (error) throw error;
        roundId = round.id;

        // Delete existing pernas and recreate
        await supabase
          .from("matched_betting_pernas")
          .delete()
          .eq("round_id", round.id);
      } else {
        // Insert
        const { data: newRound, error } = await supabase
          .from("matched_betting_rounds")
          .insert(roundData)
          .select()
          .single();

        if (error) throw error;
        roundId = newRound.id;
      }

      // Insert pernas
      const pernasData = pernas.filter(p => p.bookmaker_id).map(p => ({
        round_id: roundId,
        bookmaker_id: p.bookmaker_id,
        tipo_aposta: p.tipo_aposta,
        selecao: p.selecao || data.evento,
        odd: p.odd,
        stake: p.stake,
        comissao_exchange: p.comissao_exchange,
        is_free_bet: p.is_free_bet,
        liability: p.liability,
        status: p.status,
      }));

      const { error: pernasError } = await supabase
        .from("matched_betting_pernas")
        .insert(pernasData);

      if (pernasError) throw pernasError;

      toast.success(round ? "Round atualizado!" : "Round criado!");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {round ? "Editar Round" : "Novo Round de Matched Betting"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="tipo_round"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Round</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="QUALIFYING_BET">Qualifying Bet</SelectItem>
                        <SelectItem value="FREE_BET">Free Bet</SelectItem>
                        <SelectItem value="CASHBACK_EXTRACTION">Cashback</SelectItem>
                      </SelectContent>
                    </Select>
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
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="PENDENTE">Pendente</SelectItem>
                        <SelectItem value="EM_ANDAMENTO">Em Andamento</SelectItem>
                        <SelectItem value="CONCLUIDO">Concluído</SelectItem>
                        <SelectItem value="CANCELADO">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="evento"
                rules={{ required: "Evento obrigatório" }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Evento</FormLabel>
                    <FormControl>
                      <Input placeholder="Flamengo x Palmeiras" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="data_evento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data do Evento</FormLabel>
                    <DatePicker
                      value={field.value ? format(field.value, "yyyy-MM-dd") : ""}
                      onChange={(dateStr) => field.onChange(dateStr ? new Date(dateStr) : null)}
                    />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="esporte"
                rules={{ required: "Esporte obrigatório" }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Esporte</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Futebol">Futebol</SelectItem>
                        <SelectItem value="Basquete">Basquete</SelectItem>
                        <SelectItem value="Tênis">Tênis</SelectItem>
                        <SelectItem value="MMA">MMA</SelectItem>
                        <SelectItem value="Vôlei">Vôlei</SelectItem>
                        <SelectItem value="eSports">eSports</SelectItem>
                        <SelectItem value="Outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mercado"
                rules={{ required: "Mercado obrigatório" }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mercado</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Resultado">Resultado (1X2)</SelectItem>
                        <SelectItem value="Dupla Chance">Dupla Chance</SelectItem>
                        <SelectItem value="Over/Under">Over/Under</SelectItem>
                        <SelectItem value="Ambas Marcam">Ambas Marcam</SelectItem>
                        <SelectItem value="Handicap">Handicap</SelectItem>
                        <SelectItem value="Outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Pernas */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Pernas da Operação</CardTitle>
                  <div className="flex items-center gap-2">
                    <Calculator className="h-4 w-4 text-muted-foreground" />
                    <span className={`font-bold ${lucroEsperado >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {formatCurrency(lucroEsperado)}
                    </span>
                    <span className="text-xs text-muted-foreground">esperado</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {pernas.map((perna, index) => (
                  <div key={index} className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge variant={perna.tipo_aposta === "BACK" ? "default" : "secondary"}>
                        {perna.tipo_aposta}
                      </Badge>
                      {perna.is_free_bet && (
                        <Badge className="bg-emerald-500/20 text-emerald-400">
                          <Gift className="mr-1 h-3 w-3" />
                          Free Bet
                        </Badge>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground">Bookmaker</label>
                        <Select
                          value={perna.bookmaker_id}
                          onValueChange={(v) => updatePerna(index, "bookmaker_id", v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {bookmakers.map((b) => (
                              <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <label className="text-xs text-muted-foreground">Odd</label>
                        <Input
                          type="number"
                          step="0.01"
                          value={perna.odd}
                          onChange={(e) => updatePerna(index, "odd", parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      
                      <div>
                        <label className="text-xs text-muted-foreground">Stake (R$)</label>
                        <Input
                          type="number"
                          step="0.01"
                          value={perna.stake}
                          onChange={(e) => updatePerna(index, "stake", parseFloat(e.target.value) || 0)}
                          disabled={perna.tipo_aposta === "LAY"}
                        />
                      </div>
                      
                      {perna.tipo_aposta === "LAY" && (
                        <div>
                          <label className="text-xs text-muted-foreground">Comissão (%)</label>
                          <Input
                            type="number"
                            step="0.1"
                            value={perna.comissao_exchange}
                            onChange={(e) => updatePerna(index, "comissao_exchange", parseFloat(e.target.value) || 0)}
                          />
                        </div>
                      )}
                    </div>

                    {perna.tipo_aposta === "LAY" && perna.liability && (
                      <div className="text-sm text-muted-foreground">
                        Responsabilidade: {formatCurrency(perna.liability)}
                      </div>
                    )}

                    {perna.tipo_aposta === "BACK" && form.watch("tipo_round") === "FREE_BET" && (
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={perna.is_free_bet}
                          onCheckedChange={(checked) => updatePerna(index, "is_free_bet", checked)}
                        />
                        <label className="text-sm">Esta é uma Free Bet</label>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            <FormField
              control={form.control}
              name="observacoes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Notas sobre esta operação..." {...field} />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Salvando..." : round ? "Atualizar" : "Criar Round"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
