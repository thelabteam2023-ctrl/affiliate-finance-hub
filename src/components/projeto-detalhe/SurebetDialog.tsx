import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  Calculator, 
  Save, 
  TrendingUp, 
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Trash2
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface Bookmaker {
  id: string;
  nome: string;
  saldo_atual: number;
  parceiro?: {
    nome: string;
  };
  bookmakers_catalogo?: {
    logo_url: string | null;
  } | null;
}

interface Surebet {
  id: string;
  data_operacao: string;
  evento: string;
  esporte: string;
  modelo: string;
  stake_total: number;
  spread_calculado: number | null;
  roi_esperado: number | null;
  lucro_esperado: number | null;
  lucro_real: number | null;
  roi_real: number | null;
  status: string;
  resultado: string | null;
  observacoes: string | null;
}

interface SurebetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projetoId: string;
  bookmakers: Bookmaker[];
  surebet: Surebet | null;
  onSuccess: () => void;
}

interface OddEntry {
  bookmaker_id: string;
  odd: string;
  selecao: string;
}

const ESPORTES = [
  "Futebol", "Basquete", "Tênis", "Baseball", "Hockey", 
  "Futebol Americano", "Vôlei", "MMA/UFC", "Boxe", "Golfe",
  "League of Legends", "Counter-Strike", "Dota 2", "eFootball"
];

export function SurebetDialog({ open, onOpenChange, projetoId, bookmakers, surebet, onSuccess }: SurebetDialogProps) {
  const isEditing = !!surebet;
  
  // Form state
  const [evento, setEvento] = useState("");
  const [esporte, setEsporte] = useState("Futebol");
  const [modelo, setModelo] = useState<"1-X-2" | "1-2">("1-2");
  const [stakeTotal, setStakeTotal] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);
  
  // Odds entries (2 for binary, 3 for 1X2)
  const [odds, setOdds] = useState<OddEntry[]>([
    { bookmaker_id: "", odd: "", selecao: "Opção 1" },
    { bookmaker_id: "", odd: "", selecao: "Opção 2" }
  ]);
  
  // Apostas vinculadas para edição
  const [linkedApostas, setLinkedApostas] = useState<any[]>([]);

  useEffect(() => {
    if (open) {
      if (surebet) {
        // Load existing surebet data
        setEvento(surebet.evento);
        setEsporte(surebet.esporte);
        setModelo(surebet.modelo as "1-X-2" | "1-2");
        setStakeTotal(surebet.stake_total.toString());
        setObservacoes(surebet.observacoes || "");
        fetchLinkedApostas(surebet.id);
      } else {
        // Reset form
        setEvento("");
        setEsporte("Futebol");
        setModelo("1-2");
        setStakeTotal("");
        setObservacoes("");
        setOdds([
          { bookmaker_id: "", odd: "", selecao: "Opção 1" },
          { bookmaker_id: "", odd: "", selecao: "Opção 2" }
        ]);
        setLinkedApostas([]);
      }
    }
  }, [open, surebet]);

  // Update odds array when model changes
  useEffect(() => {
    if (!isEditing) {
      if (modelo === "1-X-2") {
        setOdds([
          { bookmaker_id: "", odd: "", selecao: "Casa" },
          { bookmaker_id: "", odd: "", selecao: "Empate" },
          { bookmaker_id: "", odd: "", selecao: "Fora" }
        ]);
      } else {
        setOdds([
          { bookmaker_id: "", odd: "", selecao: "Sim" },
          { bookmaker_id: "", odd: "", selecao: "Não" }
        ]);
      }
    }
  }, [modelo, isEditing]);

  const fetchLinkedApostas = async (surebetId: string) => {
    const { data } = await supabase
      .from("apostas")
      .select(`
        id, selecao, odd, stake, resultado, lucro_prejuizo,
        bookmaker:bookmakers (nome)
      `)
      .eq("surebet_id", surebetId);
    setLinkedApostas(data || []);
  };

  const updateOdd = (index: number, field: keyof OddEntry, value: string) => {
    const newOdds = [...odds];
    newOdds[index] = { ...newOdds[index], [field]: value };
    setOdds(newOdds);
  };

  // Cálculos em tempo real
  const analysis = useMemo(() => {
    const stake = parseFloat(stakeTotal) || 0;
    const parsedOdds = odds.map(o => parseFloat(o.odd) || 0);
    
    // Verificar se todas as odds são válidas
    if (parsedOdds.some(o => o <= 1) || stake <= 0) {
      return null;
    }
    
    // Probabilidades implícitas
    const impliedProbs = parsedOdds.map(odd => 1 / odd);
    const totalImpliedProb = impliedProbs.reduce((a, b) => a + b, 0);
    
    // Margem/Juice do mercado
    const margin = (totalImpliedProb - 1) * 100;
    
    // Probabilidades reais (normalizadas)
    const trueProbs = impliedProbs.map(p => p / totalImpliedProb);
    
    // Verificar arbitragem (soma das probabilidades implícitas < 100%)
    const hasArbitrage = totalImpliedProb < 1;
    const arbitrageProfit = hasArbitrage ? (1 - totalImpliedProb) * 100 : 0;
    
    // Calcular stakes balanceadas para cobertura perfeita
    const totalInverseOdds = parsedOdds.reduce((acc, odd) => acc + (1 / odd), 0);
    const balancedStakes = parsedOdds.map(odd => {
      const proportion = (1 / odd) / totalInverseOdds;
      return stake * proportion;
    });
    
    // Retorno garantido (se arbitragem)
    const guaranteedReturn = hasArbitrage ? stake / totalImpliedProb : 0;
    const guaranteedProfit = hasArbitrage ? guaranteedReturn - stake : 0;
    
    // EV esperado (sem arbitragem, assume distribuição igual)
    const ev = trueProbs.reduce((acc, prob, i) => {
      const potentialProfit = balancedStakes[i] * (parsedOdds[i] - 1) - (stake - balancedStakes[i]);
      return acc + prob * potentialProfit;
    }, 0);
    const evPercent = stake > 0 ? (ev / stake) * 100 : 0;
    
    // ROI esperado
    const roiEsperado = hasArbitrage ? arbitrageProfit : evPercent;
    
    // Recomendação
    let recommendation: { text: string; color: string; icon: "check" | "x" | "alert" };
    if (hasArbitrage) {
      recommendation = { 
        text: `Arbitragem detectada! Lucro garantido de ${arbitrageProfit.toFixed(2)}%`, 
        color: "text-emerald-500",
        icon: "check"
      };
    } else if (margin <= 3) {
      recommendation = { 
        text: `Margem baixa (${margin.toFixed(2)}%). Mercado competitivo.`, 
        color: "text-blue-400",
        icon: "alert"
      };
    } else if (margin <= 5) {
      recommendation = { 
        text: `Margem moderada (${margin.toFixed(2)}%). Avalie se vale.`, 
        color: "text-yellow-400",
        icon: "alert"
      };
    } else {
      recommendation = { 
        text: `Margem alta (${margin.toFixed(2)}%). Casa com vantagem significativa.`, 
        color: "text-red-400",
        icon: "x"
      };
    }
    
    return {
      impliedProbs,
      trueProbs,
      margin,
      hasArbitrage,
      arbitrageProfit,
      balancedStakes,
      guaranteedReturn,
      guaranteedProfit,
      ev,
      evPercent,
      roiEsperado,
      recommendation
    };
  }, [odds, stakeTotal]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const handleSave = async () => {
    if (!evento.trim()) {
      toast.error("Informe o evento");
      return;
    }
    
    const stake = parseFloat(stakeTotal);
    if (isNaN(stake) || stake <= 0) {
      toast.error("Informe o stake total");
      return;
    }
    
    // Validar odds e casas
    for (const entry of odds) {
      if (!entry.bookmaker_id) {
        toast.error("Selecione todas as casas");
        return;
      }
      const odd = parseFloat(entry.odd);
      if (isNaN(odd) || odd <= 1) {
        toast.error("Todas as odds devem ser maiores que 1.00");
        return;
      }
    }
    
    if (!analysis) {
      toast.error("Erro nos cálculos");
      return;
    }

    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      if (isEditing && surebet) {
        // Update surebet
        const { error } = await supabase
          .from("surebets")
          .update({
            evento,
            esporte,
            observacoes,
            updated_at: new Date().toISOString()
          })
          .eq("id", surebet.id);

        if (error) throw error;
        toast.success("Surebet atualizada!");
      } else {
        // Create surebet
        const { data: newSurebet, error: surebetError } = await supabase
          .from("surebets")
          .insert({
            user_id: user.id,
            projeto_id: projetoId,
            evento,
            esporte,
            modelo,
            stake_total: stake,
            spread_calculado: analysis.hasArbitrage ? analysis.arbitrageProfit : -analysis.margin,
            roi_esperado: analysis.roiEsperado,
            lucro_esperado: analysis.hasArbitrage ? analysis.guaranteedProfit : analysis.ev,
            observacoes,
            status: "PENDENTE"
          })
          .select()
          .single();

        if (surebetError) throw surebetError;

        // Create linked apostas (invisíveis ao usuário, mas vinculadas)
        const apostasToCreate = odds.map((entry, index) => ({
          user_id: user.id,
          projeto_id: projetoId,
          surebet_id: newSurebet.id,
          bookmaker_id: entry.bookmaker_id,
          data_aposta: new Date().toISOString(),
          esporte,
          evento,
          mercado: modelo,
          selecao: entry.selecao,
          odd: parseFloat(entry.odd),
          stake: analysis.balancedStakes[index],
          status: "PENDENTE",
          estrategia: "SUREBET",
          modo_entrada: "PADRAO"
        }));

        const { error: apostasError } = await supabase
          .from("apostas")
          .insert(apostasToCreate);

        if (apostasError) throw apostasError;

        // Atualizar saldos dos bookmakers
        for (let i = 0; i < odds.length; i++) {
          const bk = bookmakers.find(b => b.id === odds[i].bookmaker_id);
          if (bk) {
            const newSaldo = bk.saldo_atual - analysis.balancedStakes[i];
            const { error: updateError } = await supabase
              .from("bookmakers")
              .update({ saldo_atual: newSaldo })
              .eq("id", odds[i].bookmaker_id);
            
            if (updateError) console.error("Erro ao atualizar saldo:", updateError);
          }
        }

        toast.success("Surebet registrada com sucesso!");
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!surebet) return;
    
    try {
      // Deletar surebet (apostas vinculadas ficam com surebet_id = null)
      const { error } = await supabase
        .from("surebets")
        .delete()
        .eq("id", surebet.id);

      if (error) throw error;
      
      toast.success("Surebet excluída!");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao excluir: " + error.message);
    }
  };

  const handleLiquidarAposta = async (apostaId: string, resultado: "GREEN" | "RED" | "VOID") => {
    try {
      const aposta = linkedApostas.find(a => a.id === apostaId);
      if (!aposta) return;

      let lucro = 0;
      if (resultado === "GREEN") {
        lucro = aposta.stake * (aposta.odd - 1);
      } else if (resultado === "RED") {
        lucro = -aposta.stake;
      }
      // VOID = 0

      const { error } = await supabase
        .from("apostas")
        .update({ 
          resultado, 
          lucro_prejuizo: lucro,
          status: "FINALIZADA"
        })
        .eq("id", apostaId);

      if (error) throw error;

      // Verificar se todas as apostas foram liquidadas
      await fetchLinkedApostas(surebet!.id);
      
      const updatedApostas = linkedApostas.map(a => 
        a.id === apostaId ? { ...a, resultado, lucro_prejuizo: lucro } : a
      );
      
      const todasLiquidadas = updatedApostas.every(a => a.resultado && a.resultado !== "PENDENTE");
      
      if (todasLiquidadas) {
        // Calcular resultado consolidado
        const lucroTotal = updatedApostas.reduce((acc, a) => acc + (a.lucro_prejuizo || 0), 0);
        const resultadoFinal = lucroTotal > 0 ? "GREEN" : lucroTotal < 0 ? "RED" : "VOID";
        
        await supabase
          .from("surebets")
          .update({
            status: "LIQUIDADA",
            resultado: resultadoFinal,
            lucro_real: lucroTotal,
            roi_real: surebet!.stake_total > 0 ? (lucroTotal / surebet!.stake_total) * 100 : 0
          })
          .eq("id", surebet!.id);
      }

      toast.success("Resultado registrado!");
      fetchLinkedApostas(surebet!.id);
      onSuccess();
    } catch (error: any) {
      toast.error("Erro: " + error.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-amber-500" />
            {isEditing ? "Editar Surebet" : "Nova Surebet / Arbitragem"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Formulário */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Esporte</Label>
                <Select value={esporte} onValueChange={setEsporte}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ESPORTES.map(e => (
                      <SelectItem key={e} value={e}>{e}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Modelo</Label>
                <Select 
                  value={modelo} 
                  onValueChange={(v) => setModelo(v as "1-X-2" | "1-2")}
                  disabled={isEditing}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-2">1–2 (Binário)</SelectItem>
                    <SelectItem value="1-X-2">1–X–2 (Três resultados)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Evento</Label>
              <Input 
                placeholder="Ex: Brasil x Argentina" 
                value={evento}
                onChange={(e) => setEvento(e.target.value)}
                className="uppercase"
              />
            </div>

            <div className="space-y-2">
              <Label>Stake Total</Label>
              <Input 
                type="number"
                placeholder="1000.00"
                value={stakeTotal}
                onChange={(e) => setStakeTotal(e.target.value)}
                disabled={isEditing}
              />
            </div>

            <Separator />

            {/* Odds Entries */}
            {!isEditing && (
              <div className="space-y-3">
                <Label>Odds por Resultado</Label>
                {odds.map((entry, index) => (
                  <div key={index} className="grid grid-cols-3 gap-2">
                    <Select 
                      value={entry.bookmaker_id}
                      onValueChange={(v) => updateOdd(index, "bookmaker_id", v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Casa" />
                      </SelectTrigger>
                      <SelectContent>
                        {bookmakers.map(bk => (
                          <SelectItem key={bk.id} value={bk.id}>
                            {bk.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input 
                      placeholder={entry.selecao}
                      value={entry.selecao}
                      onChange={(e) => updateOdd(index, "selecao", e.target.value)}
                    />
                    <Input 
                      type="number"
                      step="0.01"
                      placeholder="Odd"
                      value={entry.odd}
                      onChange={(e) => updateOdd(index, "odd", e.target.value)}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Apostas Vinculadas (edição) */}
            {isEditing && linkedApostas.length > 0 && (
              <div className="space-y-3">
                <Label>Posições da Surebet</Label>
                {linkedApostas.map((aposta) => (
                  <Card key={aposta.id} className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{aposta.selecao}</p>
                        <p className="text-xs text-muted-foreground">
                          {aposta.bookmaker?.nome} • Odd {aposta.odd} • {formatCurrency(aposta.stake)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {aposta.resultado ? (
                          <Badge className={
                            aposta.resultado === "GREEN" ? "bg-emerald-500/20 text-emerald-400" :
                            aposta.resultado === "RED" ? "bg-red-500/20 text-red-400" :
                            "bg-gray-500/20 text-gray-400"
                          }>
                            {aposta.resultado}
                          </Badge>
                        ) : (
                          <div className="flex gap-1">
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="h-7 w-7 p-0 text-emerald-500 hover:bg-emerald-500/20"
                              onClick={() => handleLiquidarAposta(aposta.id, "GREEN")}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="h-7 w-7 p-0 text-red-500 hover:bg-red-500/20"
                              onClick={() => handleLiquidarAposta(aposta.id, "RED")}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="h-7 w-7 p-0 text-gray-500 hover:bg-gray-500/20"
                              onClick={() => handleLiquidarAposta(aposta.id, "VOID")}
                            >
                              V
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea 
                placeholder="Notas sobre a operação..."
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          {/* Análise */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calculator className="h-4 w-4" />
                  Análise em Tempo Real
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {analysis ? (
                  <>
                    {/* Recomendação */}
                    <div className={`p-3 rounded-lg border ${
                      analysis.recommendation.icon === "check" ? "bg-emerald-500/10 border-emerald-500/30" :
                      analysis.recommendation.icon === "alert" ? "bg-yellow-500/10 border-yellow-500/30" :
                      "bg-red-500/10 border-red-500/30"
                    }`}>
                      <div className="flex items-center gap-2">
                        {analysis.recommendation.icon === "check" && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                        {analysis.recommendation.icon === "alert" && <AlertCircle className="h-5 w-5 text-yellow-500" />}
                        {analysis.recommendation.icon === "x" && <XCircle className="h-5 w-5 text-red-500" />}
                        <span className={analysis.recommendation.color}>
                          {analysis.recommendation.text}
                        </span>
                      </div>
                    </div>

                    {/* Métricas */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg bg-muted/30">
                        <p className="text-xs text-muted-foreground">Margem/Juice</p>
                        <p className={`text-lg font-bold ${analysis.margin > 5 ? 'text-red-500' : 'text-blue-400'}`}>
                          {analysis.margin.toFixed(2)}%
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/30">
                        <p className="text-xs text-muted-foreground">Arbitragem</p>
                        <p className={`text-lg font-bold ${analysis.hasArbitrage ? 'text-emerald-500' : 'text-gray-500'}`}>
                          {analysis.hasArbitrage ? `+${analysis.arbitrageProfit.toFixed(2)}%` : "Não"}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/30">
                        <p className="text-xs text-muted-foreground">EV Esperado</p>
                        <p className={`text-lg font-bold ${analysis.evPercent >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                          {analysis.evPercent >= 0 ? "+" : ""}{analysis.evPercent.toFixed(2)}%
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/30">
                        <p className="text-xs text-muted-foreground">
                          {analysis.hasArbitrage ? "Lucro Garantido" : "Lucro Esperado"}
                        </p>
                        <p className={`text-lg font-bold ${
                          (analysis.hasArbitrage ? analysis.guaranteedProfit : analysis.ev) >= 0 
                            ? 'text-emerald-500' 
                            : 'text-red-500'
                        }`}>
                          {formatCurrency(analysis.hasArbitrage ? analysis.guaranteedProfit : analysis.ev)}
                        </p>
                      </div>
                    </div>

                    <Separator />

                    {/* Stakes Balanceadas */}
                    <div>
                      <p className="text-sm font-medium mb-2">Stakes Balanceadas</p>
                      <div className="space-y-2">
                        {odds.map((entry, index) => (
                          <div key={index} className="flex items-center justify-between p-2 rounded bg-muted/20">
                            <span className="text-sm">{entry.selecao || `Opção ${index + 1}`}</span>
                            <span className="font-medium">{formatCurrency(analysis.balancedStakes[index])}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Probabilidades */}
                    <div>
                      <p className="text-sm font-medium mb-2">Probabilidades</p>
                      <div className="space-y-2">
                        {odds.map((entry, index) => (
                          <div key={index} className="flex items-center justify-between text-xs">
                            <span>{entry.selecao}</span>
                            <div className="flex gap-4">
                              <span className="text-muted-foreground">
                                Implícita: {(analysis.impliedProbs[index] * 100).toFixed(1)}%
                              </span>
                              <span className="text-blue-400">
                                Real: {(analysis.trueProbs[index] * 100).toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calculator className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Preencha as odds e stake para ver a análise</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          <div>
            {isEditing && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="h-4 w-4 mr-1" />
                    Excluir
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir Surebet?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação não pode ser desfeita. Todas as apostas vinculadas também serão excluídas.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || !analysis}>
              <Save className="h-4 w-4 mr-1" />
              {isEditing ? "Salvar" : "Registrar Surebet"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
