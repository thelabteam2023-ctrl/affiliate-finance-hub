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
  "Vôlei",
  "MMA/UFC",
  "Boxe",
  "E-sports",
  "Corrida de Cavalos",
  "NFL",
  "MLB",
  "NHL",
  "Outros"
];

const ESTRATEGIAS = [
  { value: "VALOR", label: "Aposta de Valor" },
  { value: "SUREBET", label: "Surebet" },
  { value: "ARBITRAGEM", label: "Arbitragem" },
  { value: "DUTCHING", label: "Dutching" },
  { value: "MATCHED_BETTING", label: "Matched Betting" },
  { value: "TRADING", label: "Trading" },
  { value: "OUTRO", label: "Outro" },
];

export function ApostaDialog({ open, onOpenChange, aposta, projetoId, onSuccess }: ApostaDialogProps) {
  const [loading, setLoading] = useState(false);
  const [bookmakers, setBookmakers] = useState<Bookmaker[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Form state
  const [bookmakerId, setBookmakerId] = useState("");
  const [dataAposta, setDataAposta] = useState("");
  const [esporte, setEsporte] = useState("");
  const [evento, setEvento] = useState("");
  const [mercado, setMercado] = useState("");
  const [selecao, setSelecao] = useState("");
  const [odd, setOdd] = useState("");
  const [stake, setStake] = useState("");
  const [estrategia, setEstrategia] = useState("VALOR");
  const [status, setStatus] = useState("PENDENTE");
  const [resultado, setResultado] = useState("");
  const [valorRetorno, setValorRetorno] = useState("");
  const [observacoes, setObservacoes] = useState("");

  useEffect(() => {
    if (open) {
      fetchBookmakers();
      if (aposta) {
        setBookmakerId(aposta.bookmaker_id);
        setDataAposta(aposta.data_aposta.slice(0, 16));
        setEsporte(aposta.esporte);
        setEvento(aposta.evento);
        setMercado(aposta.mercado || "");
        setSelecao(aposta.selecao);
        setOdd(aposta.odd.toString());
        setStake(aposta.stake.toString());
        setEstrategia(aposta.estrategia || "VALOR");
        setStatus(aposta.status);
        setResultado(aposta.resultado || "");
        setValorRetorno(aposta.valor_retorno?.toString() || "");
        setObservacoes(aposta.observacoes || "");
      } else {
        resetForm();
      }
    }
  }, [open, aposta]);

  const resetForm = () => {
    setBookmakerId("");
    setDataAposta(new Date().toISOString().slice(0, 16));
    setEsporte("");
    setEvento("");
    setMercado("");
    setSelecao("");
    setOdd("");
    setStake("");
    setEstrategia("VALOR");
    setStatus("PENDENTE");
    setResultado("");
    setValorRetorno("");
    setObservacoes("");
  };

  const fetchBookmakers = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const { data, error } = await supabase
        .from("bookmakers")
        .select(`
          id,
          nome,
          parceiro_id,
          parceiro:parceiros (nome)
        `)
        .eq("user_id", userData.user.id)
        .eq("status", "ativo");

      if (error) throw error;
      setBookmakers(data || []);
    } catch (error) {
      console.error("Erro ao carregar bookmakers:", error);
    }
  };

  // Calculate lucro_prejuizo when resultado or valorRetorno changes
  useEffect(() => {
    if (resultado && valorRetorno && stake) {
      const stakeNum = parseFloat(stake);
      const retornoNum = parseFloat(valorRetorno);
      // lucro = retorno - stake (se GREEN, retorno é o valor recebido total)
      // Se RED, retorno seria 0 ou o valor perdido
    }
  }, [resultado, valorRetorno, stake]);

  const calculateLucroPrejuizo = () => {
    const stakeNum = parseFloat(stake) || 0;
    const oddNum = parseFloat(odd) || 0;
    const retornoNum = parseFloat(valorRetorno) || 0;

    switch (resultado) {
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
    if (!bookmakerId || !esporte || !evento || !selecao || !odd || !stake) {
      toast.error("Preencha todos os campos obrigatórios");
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

      const apostaData = {
        user_id: userData.user.id,
        projeto_id: projetoId,
        bookmaker_id: bookmakerId,
        data_aposta: dataAposta,
        esporte,
        evento,
        mercado: mercado || null,
        selecao,
        odd: parseFloat(odd),
        stake: parseFloat(stake),
        estrategia,
        status,
        resultado: resultado || null,
        valor_retorno: valorRetorno ? parseFloat(valorRetorno) : null,
        lucro_prejuizo: lucroPrejuizo,
        observacoes: observacoes || null,
      };

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
            {/* Bookmaker */}
            <div className="space-y-2">
              <Label>Bookmaker / Vínculo *</Label>
              <Select value={bookmakerId} onValueChange={setBookmakerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o bookmaker" />
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

            {/* Data e Esporte */}
            <div className="grid grid-cols-2 gap-4">
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
            </div>

            {/* Evento e Mercado */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Evento *</Label>
                <Input
                  value={evento}
                  onChange={(e) => setEvento(e.target.value)}
                  placeholder="Ex: Real Madrid x Barcelona"
                />
              </div>
              <div className="space-y-2">
                <Label>Mercado</Label>
                <Input
                  value={mercado}
                  onChange={(e) => setMercado(e.target.value)}
                  placeholder="Ex: Resultado Final, Over/Under"
                />
              </div>
            </div>

            {/* Seleção e Estratégia */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Seleção *</Label>
                <Input
                  value={selecao}
                  onChange={(e) => setSelecao(e.target.value)}
                  placeholder="Ex: Real Madrid, Over 2.5"
                />
              </div>
              <div className="space-y-2">
                <Label>Estratégia</Label>
                <Select value={estrategia} onValueChange={setEstrategia}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ESTRATEGIAS.map((est) => (
                      <SelectItem key={est.value} value={est.value}>{est.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Odd e Stake */}
            <div className="grid grid-cols-2 gap-4">
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

            {/* Status e Resultado */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDENTE">Pendente</SelectItem>
                    <SelectItem value="REALIZADA">Realizada</SelectItem>
                    <SelectItem value="CONCLUIDA">Concluída</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Resultado</Label>
                <Select value={resultado} onValueChange={setResultado}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GREEN">GREEN</SelectItem>
                    <SelectItem value="RED">RED</SelectItem>
                    <SelectItem value="VOID">VOID</SelectItem>
                    <SelectItem value="HALF">HALF</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Valor Retorno */}
            {resultado && resultado !== "VOID" && (
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
                    Lucro/Prejuízo: R$ {calculateLucroPrejuizo()!.toFixed(2)}
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
                rows={3}
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
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}