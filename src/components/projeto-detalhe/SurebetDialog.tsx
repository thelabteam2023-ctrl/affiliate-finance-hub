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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { 
  Calculator, 
  Save, 
  TrendingUp, 
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Trash2,
  Wallet,
  CircleDot
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface Bookmaker {
  id: string;
  nome: string;
  saldo_atual: number;
  saldo_freebet?: number;
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
  stake: string;
  selecao: string;
  isReference: boolean;
}

const ESPORTES = [
  "Futebol", "Basquete", "Tênis", "Baseball", "Hockey", 
  "Futebol Americano", "Vôlei", "MMA/UFC", "Boxe", "Golfe",
  "League of Legends", "Counter-Strike", "Dota 2", "eFootball"
];

const SELECOES_1X2 = ["Casa", "Empate", "Fora"];
const SELECOES_BINARIO = ["Sim", "Não"];

export function SurebetDialog({ open, onOpenChange, projetoId, bookmakers, surebet, onSuccess }: SurebetDialogProps) {
  const isEditing = !!surebet;
  
  // Form state
  const [evento, setEvento] = useState("");
  const [esporte, setEsporte] = useState("Futebol");
  const [modelo, setModelo] = useState<"1-X-2" | "1-2">("1-2");
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);
  
  // Modo de entrada: 'reference' ou 'manual'
  const [stakeMode, setStakeMode] = useState<"reference" | "manual">("reference");
  
  // Odds entries (2 for binary, 3 for 1X2)
  const [odds, setOdds] = useState<OddEntry[]>([
    { bookmaker_id: "", odd: "", stake: "", selecao: "Sim", isReference: true },
    { bookmaker_id: "", odd: "", stake: "", selecao: "Não", isReference: false }
  ]);
  
  // Apostas vinculadas para edição
  const [linkedApostas, setLinkedApostas] = useState<any[]>([]);

  // Inicializar formulário
  useEffect(() => {
    if (open) {
      if (surebet) {
        setEvento(surebet.evento);
        setEsporte(surebet.esporte);
        setModelo(surebet.modelo as "1-X-2" | "1-2");
        setObservacoes(surebet.observacoes || "");
        fetchLinkedApostas(surebet.id);
      } else {
        resetForm();
      }
    }
  }, [open, surebet]);

  // Atualizar array de odds quando modelo muda
  useEffect(() => {
    if (!isEditing) {
      const selecoes = modelo === "1-X-2" ? SELECOES_1X2 : SELECOES_BINARIO;
      setOdds(selecoes.map((sel, i) => ({
        bookmaker_id: "",
        odd: "",
        stake: "",
        selecao: sel,
        isReference: i === 0
      })));
    }
  }, [modelo, isEditing]);

  const resetForm = () => {
    setEvento("");
    setEsporte("Futebol");
    setModelo("1-2");
    setObservacoes("");
    setStakeMode("reference");
    setOdds([
      { bookmaker_id: "", odd: "", stake: "", selecao: "Sim", isReference: true },
      { bookmaker_id: "", odd: "", stake: "", selecao: "Não", isReference: false }
    ]);
    setLinkedApostas([]);
  };

  const fetchLinkedApostas = async (surebetId: string) => {
    const { data } = await supabase
      .from("apostas")
      .select(`
        id, selecao, odd, stake, resultado, lucro_prejuizo,
        bookmaker:bookmakers (nome, saldo_atual)
      `)
      .eq("surebet_id", surebetId);
    setLinkedApostas(data || []);
  };

  const updateOdd = (index: number, field: keyof OddEntry, value: string | boolean) => {
    const newOdds = [...odds];
    newOdds[index] = { ...newOdds[index], [field]: value };
    
    // Se está definindo referência, remover das outras
    if (field === "isReference" && value === true) {
      newOdds.forEach((o, i) => {
        if (i !== index) o.isReference = false;
      });
    }
    
    setOdds(newOdds);
  };

  const setReferenceIndex = (index: number) => {
    const newOdds = odds.map((o, i) => ({
      ...o,
      isReference: i === index
    }));
    setOdds(newOdds);
  };

  // Obter saldo da casa selecionada
  const getBookmakerSaldo = (bookmakerId: string): number | null => {
    const bk = bookmakers.find(b => b.id === bookmakerId);
    return bk ? bk.saldo_atual : null;
  };

  const getBookmakerNome = (bookmakerId: string): string => {
    const bk = bookmakers.find(b => b.id === bookmakerId);
    if (!bk) return "";
    const parceiroNome = bk.parceiro?.nome?.split(" ");
    const shortName = parceiroNome 
      ? `${parceiroNome[0]} ${parceiroNome[parceiroNome.length - 1] || ""}`.trim()
      : "";
    return shortName ? `${bk.nome} - ${shortName}` : bk.nome;
  };

  // Cálculos em tempo real
  const analysis = useMemo(() => {
    const parsedOdds = odds.map(o => parseFloat(o.odd) || 0);
    
    // Verificar se todas as odds são válidas
    if (parsedOdds.some(o => o <= 1)) {
      return null;
    }
    
    // Probabilidades implícitas
    const impliedProbs = parsedOdds.map(odd => 1 / odd);
    const totalImpliedProb = impliedProbs.reduce((a, b) => a + b, 0);
    
    // Margem/Juice do mercado (negativo = arbitragem)
    const margin = (totalImpliedProb - 1) * 100;
    const spread = -margin; // Spread positivo = lucro, negativo = custo
    
    // Probabilidades reais (normalizadas)
    const trueProbs = impliedProbs.map(p => p / totalImpliedProb);
    
    // Verificar arbitragem (soma das probabilidades implícitas < 100%)
    const hasArbitrage = totalImpliedProb < 1;
    const arbitrageProfit = hasArbitrage ? (1 - totalImpliedProb) * 100 : 0;
    
    // Calcular stakes baseado no modo
    let calculatedStakes: number[] = [];
    let stakeTotal = 0;
    
    if (stakeMode === "reference") {
      // Modo referência: calcular stakes a partir do lado referência
      const refIndex = odds.findIndex(o => o.isReference);
      const refStake = parseFloat(odds[refIndex]?.stake) || 0;
      const refOdd = parsedOdds[refIndex] || 0;
      
      if (refStake > 0 && refOdd > 1) {
        // Retorno alvo = stake de referência * odd de referência
        const targetReturn = refStake * refOdd;
        
        // Calcular stakes para cada lado para igualar o retorno
        calculatedStakes = parsedOdds.map((odd, i) => {
          if (i === refIndex) return refStake;
          return targetReturn / odd;
        });
        
        stakeTotal = calculatedStakes.reduce((a, b) => a + b, 0);
      }
    } else {
      // Modo manual: usar stakes inseridas
      calculatedStakes = odds.map(o => parseFloat(o.stake) || 0);
      stakeTotal = calculatedStakes.reduce((a, b) => a + b, 0);
    }
    
    if (stakeTotal <= 0) {
      return {
        impliedProbs,
        trueProbs,
        margin,
        spread,
        hasArbitrage,
        arbitrageProfit,
        calculatedStakes: [],
        stakeTotal: 0,
        scenarios: [],
        guaranteedProfit: 0,
        roiEsperado: 0,
        recommendation: null
      };
    }
    
    // Calcular cenários de retorno/lucro para cada resultado
    const scenarios = parsedOdds.map((odd, i) => {
      const stakeNesseLado = calculatedStakes[i];
      const retorno = stakeNesseLado * odd;
      const lucro = retorno - stakeTotal;
      return {
        selecao: odds[i].selecao,
        stake: stakeNesseLado,
        retorno,
        lucro,
        isPositive: lucro >= 0
      };
    });
    
    // Lucro garantido (mínimo entre cenários) - se todos positivos = arbitragem pura
    const minLucro = Math.min(...scenarios.map(s => s.lucro));
    const maxLucro = Math.max(...scenarios.map(s => s.lucro));
    const guaranteedProfit = minLucro;
    
    // ROI esperado (baseado no spread)
    const roiEsperado = stakeTotal > 0 ? (guaranteedProfit / stakeTotal) * 100 : 0;
    
    // Recomendação
    let recommendation: { text: string; color: string; icon: "check" | "x" | "alert" } | null = null;
    if (hasArbitrage && guaranteedProfit > 0) {
      recommendation = { 
        text: `Arbitragem! Lucro garantido: ${formatCurrency(guaranteedProfit)} (${roiEsperado.toFixed(2)}%)`, 
        color: "text-emerald-500",
        icon: "check"
      };
    } else if (guaranteedProfit >= 0) {
      recommendation = { 
        text: `Operação neutra ou positiva. Spread: ${spread.toFixed(2)}%`, 
        color: "text-blue-400",
        icon: "alert"
      };
    } else {
      const custoPercent = Math.abs(roiEsperado);
      recommendation = { 
        text: `Custo operacional: ${formatCurrency(Math.abs(guaranteedProfit))} (-${custoPercent.toFixed(2)}%)`, 
        color: "text-amber-400",
        icon: "alert"
      };
    }
    
    return {
      impliedProbs,
      trueProbs,
      margin,
      spread,
      hasArbitrage,
      arbitrageProfit,
      calculatedStakes,
      stakeTotal,
      scenarios,
      guaranteedProfit,
      roiEsperado,
      recommendation
    };
  }, [odds, stakeMode]);

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
    
    if (!analysis || analysis.stakeTotal <= 0) {
      toast.error("Defina as stakes da operação");
      return;
    }
    
    // Validar odds e casas
    for (let i = 0; i < odds.length; i++) {
      const entry = odds[i];
      if (!entry.bookmaker_id) {
        toast.error(`Selecione a casa para "${entry.selecao}"`);
        return;
      }
      const odd = parseFloat(entry.odd);
      if (isNaN(odd) || odd <= 1) {
        toast.error(`Odd inválida para "${entry.selecao}" (deve ser > 1.00)`);
        return;
      }
      
      // Verificar saldo
      const saldo = getBookmakerSaldo(entry.bookmaker_id);
      const stakeNecessaria = analysis.calculatedStakes[i];
      if (saldo !== null && stakeNecessaria > saldo) {
        toast.error(`Saldo insuficiente em ${getBookmakerNome(entry.bookmaker_id)}: ${formatCurrency(saldo)} disponível, ${formatCurrency(stakeNecessaria)} necessário`);
        return;
      }
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
            stake_total: analysis.stakeTotal,
            spread_calculado: analysis.spread,
            roi_esperado: analysis.roiEsperado,
            lucro_esperado: analysis.guaranteedProfit,
            observacoes,
            status: "PENDENTE"
          })
          .select()
          .single();

        if (surebetError) throw surebetError;

        // Create linked apostas
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
          stake: analysis.calculatedStakes[index],
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
            const newSaldo = bk.saldo_atual - analysis.calculatedStakes[i];
            await supabase
              .from("bookmakers")
              .update({ saldo_atual: newSaldo })
              .eq("id", odds[i].bookmaker_id);
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
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-amber-500" />
            {isEditing ? "Editar Surebet" : "Nova Surebet / Arbitragem"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-5">
          {/* Formulário - Lado Esquerdo (3 colunas) */}
          <div className="lg:col-span-3 space-y-4">
            {/* Cabeçalho */}
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
                    <SelectItem value="1-2">1–2 (Binário: Sim/Não, Over/Under)</SelectItem>
                    <SelectItem value="1-X-2">1–X–2 (Casa/Empate/Fora)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Evento</Label>
              <Input 
                placeholder="Ex: Brasil x Argentina • Over 2.5 gols" 
                value={evento}
                onChange={(e) => setEvento(e.target.value)}
                className="uppercase"
              />
            </div>

            {/* Toggle de Modo */}
            {!isEditing && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border">
                <div>
                  <p className="text-sm font-medium">Modo de Entrada</p>
                  <p className="text-xs text-muted-foreground">
                    {stakeMode === "reference" 
                      ? "Defina stake no lado referência, o sistema calcula o resto" 
                      : "Defina todas as stakes manualmente"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${stakeMode === "reference" ? "text-primary" : "text-muted-foreground"}`}>
                    Referência
                  </span>
                  <Switch 
                    checked={stakeMode === "manual"}
                    onCheckedChange={(checked) => setStakeMode(checked ? "manual" : "reference")}
                  />
                  <span className={`text-xs ${stakeMode === "manual" ? "text-primary" : "text-muted-foreground"}`}>
                    Manual
                  </span>
                </div>
              </div>
            )}

            <Separator />

            {/* Tabela de Odds */}
            {!isEditing && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Posições da Operação</Label>
                  {stakeMode === "reference" && (
                    <span className="text-xs text-muted-foreground">
                      Clique em <CircleDot className="h-3 w-3 inline" /> para definir referência
                    </span>
                  )}
                </div>
                
                {/* Header */}
                <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground px-1">
                  {stakeMode === "reference" && <div className="col-span-1">Ref</div>}
                  <div className={stakeMode === "reference" ? "col-span-2" : "col-span-2"}>Resultado</div>
                  <div className="col-span-4">Casa</div>
                  <div className="col-span-2">Odd</div>
                  <div className={stakeMode === "reference" ? "col-span-3" : "col-span-4"}>
                    {stakeMode === "reference" ? "Stake (ref)" : "Stake"}
                  </div>
                </div>
                
                {odds.map((entry, index) => {
                  const saldo = getBookmakerSaldo(entry.bookmaker_id);
                  const stakeCalculada = analysis?.calculatedStakes?.[index] || 0;
                  
                  return (
                    <div key={index} className="space-y-1">
                      <div className="grid grid-cols-12 gap-2 items-center">
                        {/* Referência */}
                        {stakeMode === "reference" && (
                          <div className="col-span-1 flex justify-center">
                            <button
                              type="button"
                              onClick={() => setReferenceIndex(index)}
                              className={`p-1 rounded-full transition-colors ${
                                entry.isReference 
                                  ? "text-primary bg-primary/20" 
                                  : "text-muted-foreground hover:text-primary"
                              }`}
                            >
                              <CircleDot className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                        
                        {/* Seleção */}
                        <div className={stakeMode === "reference" ? "col-span-2" : "col-span-2"}>
                          <Input 
                            value={entry.selecao}
                            onChange={(e) => updateOdd(index, "selecao", e.target.value)}
                            className="text-sm h-9"
                          />
                        </div>
                        
                        {/* Casa */}
                        <div className="col-span-4">
                          <Select 
                            value={entry.bookmaker_id}
                            onValueChange={(v) => updateOdd(index, "bookmaker_id", v)}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Selecionar casa" />
                            </SelectTrigger>
                            <SelectContent>
                              {bookmakers.map(bk => {
                                const parceiroNome = bk.parceiro?.nome?.split(" ");
                                const shortName = parceiroNome 
                                  ? `${parceiroNome[0]} ${parceiroNome[parceiroNome.length - 1] || ""}`.trim()
                                  : "";
                                return (
                                  <SelectItem key={bk.id} value={bk.id}>
                                    <div className="flex items-center justify-between w-full gap-2">
                                      <span>{bk.nome}</span>
                                      {shortName && <span className="text-xs text-muted-foreground">({shortName})</span>}
                                    </div>
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        {/* Odd */}
                        <div className="col-span-2">
                          <Input 
                            type="number"
                            step="0.01"
                            placeholder="1.00"
                            value={entry.odd}
                            onChange={(e) => updateOdd(index, "odd", e.target.value)}
                            className="h-9"
                          />
                        </div>
                        
                        {/* Stake */}
                        <div className={stakeMode === "reference" ? "col-span-3" : "col-span-4"}>
                          {stakeMode === "reference" ? (
                            entry.isReference ? (
                              <Input 
                                type="number"
                                step="0.01"
                                placeholder="Stake"
                                value={entry.stake}
                                onChange={(e) => updateOdd(index, "stake", e.target.value)}
                                className="h-9 border-primary"
                              />
                            ) : (
                              <div className="h-9 px-3 flex items-center rounded-md bg-muted/50 text-sm font-medium">
                                {stakeCalculada > 0 ? formatCurrency(stakeCalculada) : "—"}
                              </div>
                            )
                          ) : (
                            <Input 
                              type="number"
                              step="0.01"
                              placeholder="Stake"
                              value={entry.stake}
                              onChange={(e) => updateOdd(index, "stake", e.target.value)}
                              className="h-9"
                            />
                          )}
                        </div>
                      </div>
                      
                      {/* Saldo da casa */}
                      {entry.bookmaker_id && saldo !== null && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground pl-1">
                          <Wallet className="h-3 w-3" />
                          <span>Saldo disponível: {formatCurrency(saldo)}</span>
                          {stakeCalculada > saldo && (
                            <Badge variant="destructive" className="text-[10px] h-4 ml-1">
                              Insuficiente
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
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
                          {aposta.bookmaker?.nome} • Odd {aposta.odd.toFixed(2)} • {formatCurrency(aposta.stake)}
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

          {/* Análise - Lado Direito (2 colunas) */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calculator className="h-4 w-4" />
                  Análise da Operação
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {analysis && analysis.stakeTotal > 0 ? (
                  <>
                    {/* Recomendação */}
                    {analysis.recommendation && (
                      <div className={`p-3 rounded-lg border ${
                        analysis.recommendation.icon === "check" ? "bg-emerald-500/10 border-emerald-500/30" :
                        analysis.recommendation.icon === "alert" ? "bg-amber-500/10 border-amber-500/30" :
                        "bg-red-500/10 border-red-500/30"
                      }`}>
                        <div className="flex items-start gap-2">
                          {analysis.recommendation.icon === "check" && <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5" />}
                          {analysis.recommendation.icon === "alert" && <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />}
                          {analysis.recommendation.icon === "x" && <XCircle className="h-5 w-5 text-red-500 mt-0.5" />}
                          <span className={`text-sm ${analysis.recommendation.color}`}>
                            {analysis.recommendation.text}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Stake Total */}
                    <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
                      <p className="text-xs text-muted-foreground">Stake Total da Operação</p>
                      <p className="text-2xl font-bold text-primary">
                        {formatCurrency(analysis.stakeTotal)}
                      </p>
                    </div>

                    {/* Métricas */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2 rounded-lg bg-muted/30">
                        <p className="text-[10px] text-muted-foreground">Spread</p>
                        <p className={`text-sm font-bold ${analysis.spread >= 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
                          {analysis.spread >= 0 ? "+" : ""}{analysis.spread.toFixed(2)}%
                        </p>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/30">
                        <p className="text-[10px] text-muted-foreground">Margem Casa</p>
                        <p className={`text-sm font-bold ${analysis.margin > 5 ? 'text-red-500' : 'text-blue-400'}`}>
                          {analysis.margin.toFixed(2)}%
                        </p>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/30">
                        <p className="text-[10px] text-muted-foreground">ROI Esperado</p>
                        <p className={`text-sm font-bold ${analysis.roiEsperado >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                          {analysis.roiEsperado >= 0 ? "+" : ""}{analysis.roiEsperado.toFixed(2)}%
                        </p>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/30">
                        <p className="text-[10px] text-muted-foreground">
                          {analysis.guaranteedProfit >= 0 ? "Lucro Garantido" : "Custo"}
                        </p>
                        <p className={`text-sm font-bold ${analysis.guaranteedProfit >= 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
                          {analysis.guaranteedProfit >= 0 ? "+" : ""}{formatCurrency(analysis.guaranteedProfit)}
                        </p>
                      </div>
                    </div>

                    <Separator />

                    {/* Cenários de Resultado */}
                    <div>
                      <p className="text-xs font-medium mb-2">Cenários de Resultado</p>
                      <div className="space-y-2">
                        {analysis.scenarios.map((scenario, index) => (
                          <div 
                            key={index} 
                            className={`p-2 rounded-lg border ${
                              scenario.isPositive 
                                ? "bg-emerald-500/5 border-emerald-500/20" 
                                : "bg-red-500/5 border-red-500/20"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium">{scenario.selecao}</span>
                              <div className="text-right">
                                <p className="text-[10px] text-muted-foreground">
                                  Retorno: {formatCurrency(scenario.retorno)}
                                </p>
                                <p className={`text-sm font-bold ${scenario.isPositive ? "text-emerald-500" : "text-red-500"}`}>
                                  {scenario.lucro >= 0 ? "+" : ""}{formatCurrency(scenario.lucro)}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <Separator />

                    {/* Probabilidades */}
                    <div>
                      <p className="text-xs font-medium mb-2">Probabilidades</p>
                      <div className="space-y-1">
                        {odds.map((entry, index) => (
                          <div key={index} className="flex items-center justify-between text-[10px]">
                            <span className="text-muted-foreground">{entry.selecao}</span>
                            <div className="flex gap-3">
                              <span className="text-muted-foreground">
                                Impl: {(analysis.impliedProbs[index] * 100).toFixed(1)}%
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
                    <p className="text-sm">Preencha as odds e stakes para ver a análise</p>
                    {stakeMode === "reference" && (
                      <p className="text-xs mt-1">
                        Defina a stake no lado marcado como referência
                      </p>
                    )}
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
                      Esta ação não pode ser desfeita. As apostas vinculadas terão o vínculo removido.
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
            <Button 
              onClick={handleSave} 
              disabled={saving || !analysis || analysis.stakeTotal <= 0}
            >
              <Save className="h-4 w-4 mr-1" />
              {isEditing ? "Salvar" : "Registrar Surebet"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
