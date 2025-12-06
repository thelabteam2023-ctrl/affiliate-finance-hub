import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Save, Trash2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Aposta {
  id: string;
  data_aposta: string;
  esporte: string;
  evento: string;
  mercado: string | null;
  selecao: string;
  odd: number;
  stake: number;
  estrategia: string | null;
  status: string;
  resultado: string | null;
  valor_retorno: number | null;
  lucro_prejuizo: number | null;
  observacoes: string | null;
  bookmaker_id: string;
  modo_entrada?: string;
  lay_exchange?: string | null;
  lay_odd?: number | null;
  lay_stake?: number | null;
  lay_liability?: number | null;
  lay_comissao?: number | null;
  back_em_exchange?: boolean;
  back_comissao?: number | null;
}

interface Bookmaker {
  id: string;
  nome: string;
  parceiro_id: string;
  parceiro?: {
    nome: string;
  };
}

interface ApostaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aposta: Aposta | null;
  projetoId: string;
  onSuccess: () => void;
}

const ESPORTES = [
  "Futebol",
  "Basquete",
  "Tênis",
  "Baseball",
  "Hockey",
  "Futebol Americano",
  "Vôlei",
  "MMA/UFC",
  "Boxe",
  "Golfe",
  "League of Legends",
  "Counter-Strike",
  "Dota 2",
  "eFootball",
  "Outro"
];

const MERCADOS_POR_ESPORTE: Record<string, string[]> = {
  "Futebol": [
    "Moneyline / 1X2",
    "Over/Under (Gols)",
    "Handicap Asiático",
    "Handicap Europeu",
    "Ambas Marcam (BTTS)",
    "Resultado Exato",
    "Dupla Chance",
    "Draw No Bet",
    "Primeiro/Último Gol",
    "Total de Cantos",
    "Outro"
  ],
  "Basquete": [
    "Moneyline",
    "Spread",
    "Total de Pontos (Over/Under)",
    "Handicap",
    "1º/2º Tempo",
    "Margem de Vitória",
    "Outro"
  ],
  "Tênis": [
    "Vencedor do Jogo",
    "Handicap de Games",
    "Total de Games (Over/Under)",
    "Vencedor do Set",
    "Resultado Exato (Sets)",
    "Outro"
  ],
  "Baseball": [
    "Moneyline",
    "Run Line (+1.5 / -1.5)",
    "Total de Runs (Over/Under)",
    "1ª Metade (1st 5 Innings)",
    "Handicap",
    "Outro"
  ],
  "Hockey": [
    "Moneyline",
    "Puck Line (+1.5 / -1.5)",
    "Total de Gols (Over/Under)",
    "1º/2º/3º Período",
    "Handicap",
    "Outro"
  ],
  "Futebol Americano": [
    "Moneyline",
    "Spread",
    "Total de Pontos (Over/Under)",
    "1º/2º Tempo",
    "Margem de Vitória",
    "Primeiro TD",
    "Outro"
  ],
  "Vôlei": [
    "Vencedor",
    "Handicap de Sets",
    "Total de Pontos",
    "Resultado Exato (Sets)",
    "Outro"
  ],
  "MMA/UFC": [
    "Vencedor",
    "Método de Vitória",
    "Round de Finalização",
    "Vai para Decisão?",
    "Over/Under Rounds",
    "Outro"
  ],
  "Boxe": [
    "Vencedor",
    "Método de Vitória",
    "Round de Finalização",
    "Total de Rounds",
    "Outro"
  ],
  "Golfe": [
    "Vencedor do Torneio",
    "Top 5/10/20",
    "Head-to-Head",
    "Fazer o Cut",
    "Outro"
  ],
  "League of Legends": [
    "Vencedor do Mapa",
    "Vencedor da Série",
    "Handicap de Mapas",
    "Total de Mapas",
    "Primeiro Dragão",
    "Primeiro Barão",
    "Primeiro Torre",
    "First Blood",
    "Outro"
  ],
  "Counter-Strike": [
    "Vencedor do Mapa",
    "Vencedor da Série",
    "Handicap de Rounds",
    "Total de Rounds",
    "Handicap de Mapas",
    "Pistol Round",
    "Outro"
  ],
  "Dota 2": [
    "Vencedor do Mapa",
    "Vencedor da Série",
    "Handicap de Mapas",
    "Total de Mapas",
    "Primeiro Roshan",
    "Primeiro Barracks",
    "First Blood",
    "Outro"
  ],
  "eFootball": [
    "Vencedor",
    "Over/Under (Gols)",
    "Handicap",
    "Ambas Marcam",
    "Resultado Exato",
    "Outro"
  ],
  "Outro": [
    "Vencedor",
    "Over/Under",
    "Handicap",
    "Outro"
  ]
};

const EXCHANGES = [
  "Betfair",
  "Smarkets",
  "Betdaq",
  "Matchbook",
  "Orbit Exchange",
  "Panter",
  "Outra"
];

export function ApostaDialog({ open, onOpenChange, aposta, projetoId, onSuccess }: ApostaDialogProps) {
  const [loading, setLoading] = useState(false);
  const [bookmakers, setBookmakers] = useState<Bookmaker[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Tipo de aposta (aba)
  const [tipoAposta, setTipoAposta] = useState<"bookmaker" | "exchange">("bookmaker");

  // Campos comuns
  const [dataAposta, setDataAposta] = useState("");
  const [esporte, setEsporte] = useState("");
  const [evento, setEvento] = useState("");
  const [mercado, setMercado] = useState("");
  const [selecao, setSelecao] = useState("");
  const [odd, setOdd] = useState("");
  const [stake, setStake] = useState("");
  const [statusResultado, setStatusResultado] = useState("PENDENTE");
  const [valorRetorno, setValorRetorno] = useState("");
  const [observacoes, setObservacoes] = useState("");

  // Bookmaker mode
  const [bookmakerId, setBookmakerId] = useState("");
  const [modoBackLay, setModoBackLay] = useState(false);
  const [layExchange, setLayExchange] = useState("");
  const [layOdd, setLayOdd] = useState("");
  const [layComissao, setLayComissao] = useState("5");

  // Exchange mode
  const [exchangeSelecionada, setExchangeSelecionada] = useState("");
  const [exchangeComissao, setExchangeComissao] = useState("5");
  const [layOddExchange, setLayOddExchange] = useState("");

  // Calculated values
  const [layStake, setLayStake] = useState<number | null>(null);
  const [layLiability, setLayLiability] = useState<number | null>(null);

  const mercadosDisponiveis = esporte ? MERCADOS_POR_ESPORTE[esporte] || MERCADOS_POR_ESPORTE["Outro"] : [];

  useEffect(() => {
    if (open) {
      fetchBookmakers();
      if (aposta) {
        setDataAposta(aposta.data_aposta.slice(0, 16));
        setEsporte(aposta.esporte);
        setEvento(aposta.evento);
        setMercado(aposta.mercado || "");
        setSelecao(aposta.selecao);
        setOdd(aposta.odd.toString());
        setStake(aposta.stake.toString());
        setStatusResultado(aposta.resultado || aposta.status);
        setValorRetorno(aposta.valor_retorno?.toString() || "");
        setObservacoes(aposta.observacoes || "");

        // Determinar tipo de aposta baseado nos dados salvos
        if (aposta.back_em_exchange && aposta.lay_odd) {
          // Exchange mode (back + lay na mesma exchange)
          setTipoAposta("exchange");
          setExchangeSelecionada(aposta.lay_exchange || "");
          setExchangeComissao(aposta.back_comissao?.toString() || "5");
          setLayOddExchange(aposta.lay_odd?.toString() || "");
        } else if (aposta.modo_entrada === "LAYBACK") {
          // Bookmaker + Lay em exchange
          setTipoAposta("bookmaker");
          setBookmakerId(aposta.bookmaker_id);
          setModoBackLay(true);
          setLayExchange(aposta.lay_exchange || "");
          setLayOdd(aposta.lay_odd?.toString() || "");
          setLayComissao(aposta.lay_comissao?.toString() || "5");
        } else {
          // Bookmaker simples
          setTipoAposta("bookmaker");
          setBookmakerId(aposta.bookmaker_id);
          setModoBackLay(false);
        }
      } else {
        resetForm();
      }
    }
  }, [open, aposta]);

  useEffect(() => {
    if (!aposta) {
      setMercado("");
    }
  }, [esporte]);

  // Calcular Lay Stake e Liability para modo Bookmaker + Lay
  useEffect(() => {
    if (tipoAposta === "bookmaker" && modoBackLay && stake && odd && layOdd) {
      const backStake = parseFloat(stake);
      const backOdd = parseFloat(odd);
      const layOddNum = parseFloat(layOdd);
      const comissao = parseFloat(layComissao) / 100;

      if (backStake > 0 && backOdd > 0 && layOddNum > 1) {
        const calculatedLayStake = (backStake * backOdd) / (layOddNum - comissao);
        const calculatedLiability = calculatedLayStake * (layOddNum - 1);
        setLayStake(Math.round(calculatedLayStake * 100) / 100);
        setLayLiability(Math.round(calculatedLiability * 100) / 100);
      } else {
        setLayStake(null);
        setLayLiability(null);
      }
    } else if (tipoAposta === "exchange" && stake && odd && layOddExchange) {
      // Calcular para Exchange mode
      const backStake = parseFloat(stake);
      const backOdd = parseFloat(odd);
      const layOddNum = parseFloat(layOddExchange);
      const comissao = parseFloat(exchangeComissao) / 100;

      if (backStake > 0 && backOdd > 0 && layOddNum > 1) {
        const calculatedLayStake = (backStake * backOdd) / (layOddNum - comissao);
        const calculatedLiability = calculatedLayStake * (layOddNum - 1);
        setLayStake(Math.round(calculatedLayStake * 100) / 100);
        setLayLiability(Math.round(calculatedLiability * 100) / 100);
      } else {
        setLayStake(null);
        setLayLiability(null);
      }
    } else {
      setLayStake(null);
      setLayLiability(null);
    }
  }, [tipoAposta, modoBackLay, stake, odd, layOdd, layComissao, layOddExchange, exchangeComissao]);

  const resetForm = () => {
    setTipoAposta("bookmaker");
    setDataAposta(new Date().toISOString().slice(0, 16));
    setEsporte("");
    setEvento("");
    setMercado("");
    setSelecao("");
    setOdd("");
    setStake("");
    setStatusResultado("PENDENTE");
    setValorRetorno("");
    setObservacoes("");
    setBookmakerId("");
    setModoBackLay(false);
    setLayExchange("");
    setLayOdd("");
    setLayComissao("5");
    setExchangeSelecionada("");
    setExchangeComissao("5");
    setLayOddExchange("");
    setLayStake(null);
    setLayLiability(null);
  };

  const fetchBookmakers = async () => {
    try {
      const { data, error } = await supabase
        .from("bookmakers")
        .select(`
          id,
          nome,
          parceiro_id,
          parceiro:parceiros(nome)
        `)
        .eq("projeto_id", projetoId)
        .in("status", ["ATIVO", "LIMITADA"]);

      if (error) throw error;

      const formatted = (data || []).map((bk: any) => ({
        id: bk.id,
        nome: bk.nome,
        parceiro_id: bk.parceiro_id,
        parceiro: bk.parceiro
      }));

      setBookmakers(formatted);
    } catch (error) {
      console.error("Erro ao buscar bookmakers:", error);
    }
  };

  const calculateLucroPrejuizo = () => {
    const stakeNum = parseFloat(stake) || 0;
    const oddNum = parseFloat(odd) || 0;
    const retornoNum = parseFloat(valorRetorno) || 0;

    switch (statusResultado) {
      case "GREEN":
        return retornoNum > 0 ? retornoNum - stakeNum : (stakeNum * oddNum) - stakeNum;
      case "RED":
        return -stakeNum;
      case "VOID":
        return 0;
      case "HALF":
        return retornoNum > 0 ? retornoNum - stakeNum : (stakeNum * ((oddNum - 1) / 2)) - (stakeNum / 2);
      default:
        return null;
    }
  };

  const handleSave = async () => {
    // Validações básicas
    if (!esporte || !evento || !selecao || !odd || !stake) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    if (tipoAposta === "bookmaker" && !bookmakerId) {
      toast.error("Selecione a bookmaker");
      return;
    }

    if (tipoAposta === "bookmaker" && modoBackLay && (!layExchange || !layOdd)) {
      toast.error("Preencha os campos de Lay");
      return;
    }

    if (tipoAposta === "exchange" && (!exchangeSelecionada || !layOddExchange)) {
      toast.error("Preencha os campos da Exchange");
      return;
    }

    try {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        toast.error("Usuário não autenticado");
        return;
      }

      const lucroPrejuizo = calculateLucroPrejuizo();

      // Montar dados baseado no tipo de aposta
      let apostaData: any = {
        user_id: userData.user.id,
        projeto_id: projetoId,
        data_aposta: dataAposta,
        esporte,
        evento,
        mercado: mercado || null,
        selecao,
        odd: parseFloat(odd),
        stake: parseFloat(stake),
        status: statusResultado === "PENDENTE" ? "PENDENTE" : "CONCLUIDA",
        resultado: statusResultado === "PENDENTE" ? null : statusResultado,
        valor_retorno: valorRetorno ? parseFloat(valorRetorno) : null,
        lucro_prejuizo: lucroPrejuizo,
        observacoes: observacoes || null,
      };

      if (tipoAposta === "bookmaker") {
        apostaData = {
          ...apostaData,
          bookmaker_id: bookmakerId,
          estrategia: modoBackLay ? "LAYBACK" : "VALOR",
          modo_entrada: modoBackLay ? "LAYBACK" : "PADRAO",
          lay_exchange: modoBackLay ? layExchange : null,
          lay_odd: modoBackLay && layOdd ? parseFloat(layOdd) : null,
          lay_stake: modoBackLay ? layStake : null,
          lay_liability: modoBackLay ? layLiability : null,
          lay_comissao: modoBackLay ? parseFloat(layComissao) : null,
          back_em_exchange: false,
          back_comissao: null,
        };
      } else {
        // Exchange mode - salvar como back_em_exchange
        apostaData = {
          ...apostaData,
          bookmaker_id: bookmakerId || bookmakers[0]?.id, // Usar primeiro bookmaker como referência
          estrategia: "EXCHANGE",
          modo_entrada: "EXCHANGE",
          lay_exchange: exchangeSelecionada,
          lay_odd: parseFloat(layOddExchange),
          lay_stake: layStake,
          lay_liability: layLiability,
          lay_comissao: parseFloat(exchangeComissao),
          back_em_exchange: true,
          back_comissao: parseFloat(exchangeComissao),
        };
      }

      if (aposta) {
        const { error } = await supabase
          .from("apostas")
          .update(apostaData)
          .eq("id", aposta.id);
        if (error) throw error;
        toast.success("Aposta atualizada com sucesso!");
      } else {
        const { error } = await supabase
          .from("apostas")
          .insert(apostaData);
        if (error) throw error;
        toast.success("Aposta registrada com sucesso!");
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao salvar aposta: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!aposta) return;
    
    try {
      setLoading(true);
      const { error } = await supabase
        .from("apostas")
        .delete()
        .eq("id", aposta.id);

      if (error) throw error;
      toast.success("Aposta excluída com sucesso!");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao excluir aposta: " + error.message);
    } finally {
      setLoading(false);
      setDeleteDialogOpen(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {aposta ? "Editar Aposta" : "Nova Aposta"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Campos comuns: Data/Hora, Esporte, Evento */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Data/Hora *</Label>
                <Input
                  type="datetime-local"
                  value={dataAposta}
                  onChange={(e) => setDataAposta(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Esporte *</Label>
                <Select value={esporte} onValueChange={setEsporte}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {ESPORTES.map((esp) => (
                      <SelectItem key={esp} value={esp}>{esp}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Evento *</Label>
                <Input
                  value={evento}
                  onChange={(e) => setEvento(e.target.value)}
                  placeholder="Ex: Real Madrid x Barcelona"
                />
              </div>
            </div>

            {/* Mercado e Seleção */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Mercado</Label>
                <Select value={mercado} onValueChange={setMercado} disabled={!esporte}>
                  <SelectTrigger>
                    <SelectValue placeholder={esporte ? "Selecione o mercado" : "Selecione o esporte primeiro"} />
                  </SelectTrigger>
                  <SelectContent>
                    {mercadosDisponiveis.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Seleção *</Label>
                <Input
                  value={selecao}
                  onChange={(e) => setSelecao(e.target.value)}
                  placeholder="Ex: Real Madrid, Over 2.5"
                />
              </div>
            </div>

            {/* Abas: Bookmaker vs Exchange */}
            <Tabs value={tipoAposta} onValueChange={(v) => setTipoAposta(v as "bookmaker" | "exchange")} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="bookmaker">Bookmaker</TabsTrigger>
                <TabsTrigger value="exchange">Exchange</TabsTrigger>
              </TabsList>

              {/* Aba Bookmaker */}
              <TabsContent value="bookmaker" className="space-y-4 mt-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Bookmaker *</Label>
                    <Select value={bookmakerId} onValueChange={setBookmakerId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {bookmakers.map((bk) => (
                          <SelectItem key={bk.id} value={bk.id}>
                            {bk.nome} • {bk.parceiro?.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Odd *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={odd}
                      onChange={(e) => setOdd(e.target.value)}
                      placeholder="Ex: 1.85"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Stake (R$) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={stake}
                      onChange={(e) => setStake(e.target.value)}
                      placeholder="Ex: 100.00"
                    />
                  </div>
                </div>

                {/* Toggle Back + Lay */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={modoBackLay}
                      onCheckedChange={setModoBackLay}
                      id="modo-back-lay"
                    />
                    <Label htmlFor="modo-back-lay" className="text-sm cursor-pointer">
                      Back + Lay (hedge em Exchange)
                    </Label>
                  </div>
                </div>

                {/* Campos Lay quando ativado */}
                {modoBackLay && (
                  <div className="space-y-3 p-4 rounded-lg border border-purple-500/30 bg-purple-500/5">
                    <Label className="text-sm font-medium text-purple-400">LAY (Exchange)</Label>
                    <div className="grid grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label>Exchange *</Label>
                        <Select value={layExchange} onValueChange={setLayExchange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {EXCHANGES.map((ex) => (
                              <SelectItem key={ex} value={ex}>{ex}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Odd Lay *</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={layOdd}
                          onChange={(e) => setLayOdd(e.target.value)}
                          placeholder="Ex: 1.90"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Stake Lay</Label>
                        <Input
                          type="text"
                          value={layStake !== null ? formatCurrency(layStake) : "-"}
                          disabled
                          className="bg-muted"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Liability</Label>
                        <Input
                          type="text"
                          value={layLiability !== null ? formatCurrency(layLiability) : "-"}
                          disabled
                          className="bg-muted"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Label className="text-xs text-muted-foreground">Comissão:</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={layComissao}
                        onChange={(e) => setLayComissao(e.target.value)}
                        className="w-20 h-8"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Aba Exchange */}
              <TabsContent value="exchange" className="space-y-4 mt-4">
                <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/5">
                  <p className="text-sm text-muted-foreground mb-4">
                    Operação Back + Lay dentro da mesma Exchange (ex: Panter, Betfair)
                  </p>
                  
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="space-y-2">
                      <Label>Exchange *</Label>
                      <Select value={exchangeSelecionada} onValueChange={setExchangeSelecionada}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {EXCHANGES.map((ex) => (
                            <SelectItem key={ex} value={ex}>{ex}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-sm text-muted-foreground">Comissão:</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={exchangeComissao}
                        onChange={(e) => setExchangeComissao(e.target.value)}
                        className="w-20 h-9"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Back */}
                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <Label className="text-sm font-medium text-emerald-400 mb-3 block">BACK</Label>
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label>Odd Back *</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={odd}
                            onChange={(e) => setOdd(e.target.value)}
                            placeholder="Ex: 1.85"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Stake (R$) *</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={stake}
                            onChange={(e) => setStake(e.target.value)}
                            placeholder="Ex: 100.00"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Lay */}
                    <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
                      <Label className="text-sm font-medium text-rose-400 mb-3 block">LAY</Label>
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label>Odd Lay *</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={layOddExchange}
                            onChange={(e) => setLayOddExchange(e.target.value)}
                            placeholder="Ex: 1.90"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-2">
                            <Label className="text-xs">Stake Lay</Label>
                            <Input
                              type="text"
                              value={layStake !== null ? formatCurrency(layStake) : "-"}
                              disabled
                              className="bg-muted h-8 text-sm"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs">Liability</Label>
                            <Input
                              type="text"
                              value={layLiability !== null ? formatCurrency(layLiability) : "-"}
                              disabled
                              className="bg-muted h-8 text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            {/* Status / Resultado */}
            <div className="space-y-2">
              <Label>Status / Resultado</Label>
              <Select value={statusResultado} onValueChange={setStatusResultado}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDENTE">PENDENTE</SelectItem>
                  <SelectItem value="GREEN">GREEN</SelectItem>
                  <SelectItem value="RED">RED</SelectItem>
                  <SelectItem value="VOID">VOID</SelectItem>
                  <SelectItem value="HALF">HALF</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Valor Retorno */}
            {statusResultado && statusResultado !== "PENDENTE" && statusResultado !== "VOID" && (
              <div className="space-y-2">
                <Label>Valor Retorno (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={valorRetorno}
                  onChange={(e) => setValorRetorno(e.target.value)}
                  placeholder="Valor total recebido"
                />
                {calculateLucroPrejuizo() !== null && (
                  <p className={`text-sm ${calculateLucroPrejuizo()! >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    Lucro/Prejuízo: {formatCurrency(calculateLucroPrejuizo()!)}
                  </p>
                )}
              </div>
            )}

            {/* Observações */}
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Notas sobre a aposta..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="flex justify-between">
            {aposta && (
              <Button
                variant="destructive"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={loading}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir
              </Button>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Aposta</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta aposta? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
