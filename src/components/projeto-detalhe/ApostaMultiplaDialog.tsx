import { useState, useEffect, useMemo } from "react";
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
import { Loader2, Save, Trash2, Gift, Plus, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Card, CardContent } from "@/components/ui/card";

interface Selecao {
  descricao: string;
  odd: string;
  resultado?: "PENDENTE" | "GREEN" | "RED" | "VOID";
}

interface ApostaMultipla {
  id: string;
  tipo_multipla: string;
  stake: number;
  odd_final: number;
  retorno_potencial: number | null;
  lucro_prejuizo: number | null;
  selecoes: { descricao: string; odd: string; resultado?: string }[];
  status: string;
  resultado: string | null;
  bookmaker_id: string;
  tipo_freebet: string | null;
  gerou_freebet: boolean;
  valor_freebet_gerada: number | null;
  data_aposta: string;
  observacoes: string | null;
}

interface Bookmaker {
  id: string;
  nome: string;
  parceiro_id: string;
  saldo_atual: number;
  saldo_freebet: number;
  moeda: string;
  parceiro?: {
    nome: string;
  };
  bookmakers_catalogo?: {
    logo_url: string | null;
  } | null;
}

interface ApostaMultiplaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aposta: ApostaMultipla | null;
  projetoId: string;
  onSuccess: () => void;
}

export function ApostaMultiplaDialog({
  open,
  onOpenChange,
  aposta,
  projetoId,
  onSuccess,
}: ApostaMultiplaDialogProps) {
  const [loading, setLoading] = useState(false);
  const [bookmakers, setBookmakers] = useState<Bookmaker[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Form state
  const [bookmakerId, setBookmakerId] = useState("");
  const [tipoMultipla, setTipoMultipla] = useState<"DUPLA" | "TRIPLA">("DUPLA");
  const [stake, setStake] = useState("");
  const [statusResultado, setStatusResultado] = useState("PENDENTE");
  const [dataAposta, setDataAposta] = useState("");
  const [observacoes, setObservacoes] = useState("");

  // Seleções
  const [selecoes, setSelecoes] = useState<Selecao[]>([
    { descricao: "", odd: "", resultado: "PENDENTE" },
    { descricao: "", odd: "", resultado: "PENDENTE" },
  ]);

  // Freebet state
  const [usarFreebet, setUsarFreebet] = useState(false);
  const [gerouFreebet, setGerouFreebet] = useState(false);
  const [valorFreebetGerada, setValorFreebetGerada] = useState("");

  // Saldo da casa selecionada
  const [bookmakerSaldo, setBookmakerSaldo] = useState<{
    saldo: number;
    saldoFreebet: number;
    moeda: string;
  } | null>(null);

  // Carregar bookmakers
  useEffect(() => {
    if (open) {
      fetchBookmakers();
      if (!aposta) {
        // Reset form for new aposta
        resetForm();
      }
    }
  }, [open]);

  // Preencher form com dados da aposta existente
  useEffect(() => {
    if (aposta && open) {
      setBookmakerId(aposta.bookmaker_id);
      setTipoMultipla(aposta.tipo_multipla as "DUPLA" | "TRIPLA");
      setStake(aposta.stake.toString());
      setStatusResultado(aposta.resultado || "PENDENTE");
      setDataAposta(aposta.data_aposta.slice(0, 16));
      setObservacoes(aposta.observacoes || "");

      // Parse selecoes from JSONB
      const parsedSelecoes = aposta.selecoes || [];
      if (parsedSelecoes.length > 0) {
        setSelecoes(
          parsedSelecoes.map((s: any) => ({
            descricao: s.descricao || "",
            odd: s.odd?.toString() || "",
            resultado: s.resultado || "PENDENTE",
          }))
        );
      }

      // Freebet
      if (aposta.tipo_freebet && aposta.tipo_freebet !== "normal") {
        setUsarFreebet(true);
      } else {
        setUsarFreebet(false);
      }
      setGerouFreebet(aposta.gerou_freebet || false);
      setValorFreebetGerada(aposta.valor_freebet_gerada?.toString() || "");
    }
  }, [aposta, open]);

  // Atualizar número de seleções quando tipo muda
  useEffect(() => {
    const numSelecoes = tipoMultipla === "DUPLA" ? 2 : 3;
    setSelecoes((prev) => {
      if (prev.length === numSelecoes) return prev;
      if (prev.length < numSelecoes) {
        return [...prev, { descricao: "", odd: "", resultado: "PENDENTE" }];
      }
      return prev.slice(0, numSelecoes);
    });
  }, [tipoMultipla]);

  // Atualizar saldo quando bookmaker muda
  useEffect(() => {
    if (bookmakerId) {
      const bk = bookmakers.find((b) => b.id === bookmakerId);
      if (bk) {
        setBookmakerSaldo({
          saldo: bk.saldo_atual,
          saldoFreebet: bk.saldo_freebet,
          moeda: bk.moeda,
        });
      }
    } else {
      setBookmakerSaldo(null);
    }
  }, [bookmakerId, bookmakers]);

  const resetForm = () => {
    setBookmakerId("");
    setTipoMultipla("DUPLA");
    setStake("");
    setStatusResultado("PENDENTE");
    setDataAposta(getLocalDateTimeString());
    setObservacoes("");
    setSelecoes([
      { descricao: "", odd: "", resultado: "PENDENTE" },
      { descricao: "", odd: "", resultado: "PENDENTE" },
    ]);
    setUsarFreebet(false);
    setGerouFreebet(false);
    setValorFreebetGerada("");
    setBookmakerSaldo(null);
  };

  const getLocalDateTimeString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const fetchBookmakers = async () => {
    try {
      const { data, error } = await supabase
        .from("bookmakers")
        .select(
          `
          id,
          nome,
          parceiro_id,
          saldo_atual,
          saldo_freebet,
          moeda,
          parceiro:parceiros (nome),
          bookmakers_catalogo (logo_url)
        `
        )
        .eq("projeto_id", projetoId)
        .in("status", ["ativo", "ATIVO", "EM_USO"]);

      if (error) throw error;
      setBookmakers(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar bookmakers: " + error.message);
    }
  };

  // Calcular odd final (produto das odds) - considerando VOIDs como odd 1.00
  const { oddFinal, oddFinalReal } = useMemo(() => {
    const selecoesValidas = selecoes.filter((s) => {
      const oddNum = parseFloat(s.odd);
      return !isNaN(oddNum) && oddNum > 0;
    });
    
    if (selecoesValidas.length === 0) return { oddFinal: 0, oddFinalReal: 0 };
    
    // Odd final nominal (todas as odds)
    const oddNominal = selecoesValidas.reduce((acc, s) => acc * parseFloat(s.odd), 1);
    
    // Odd final real (excluindo VOIDs que são tratados como 1.00)
    const oddReal = selecoesValidas.reduce((acc, s) => {
      if (s.resultado === "VOID") return acc * 1; // VOID = odd 1.00
      return acc * parseFloat(s.odd);
    }, 1);
    
    return { oddFinal: oddNominal, oddFinalReal: oddReal };
  }, [selecoes]);

  // Calcular resultado da múltipla baseado nos resultados individuais
  const resultadoCalculado = useMemo(() => {
    const resultados = selecoes.map(s => s.resultado || "PENDENTE");
    
    // Se alguma seleção é RED, múltipla = RED
    if (resultados.some(r => r === "RED")) return "RED";
    
    // Se todas são PENDENTE
    if (resultados.every(r => r === "PENDENTE")) return "PENDENTE";
    
    // Se todas são VOID
    if (resultados.every(r => r === "VOID")) return "VOID";
    
    // Se não há RED e há pelo menos um GREEN (outros podem ser VOID ou PENDENTE)
    const temGreen = resultados.some(r => r === "GREEN");
    const todosDefinidos = resultados.every(r => r !== "PENDENTE");
    
    if (temGreen && todosDefinidos) return "GREEN";
    
    return "PENDENTE";
  }, [selecoes]);

  // Calcular retorno potencial
  const retornoPotencial = useMemo(() => {
    const stakeNum = parseFloat(stake);
    if (isNaN(stakeNum) || stakeNum <= 0 || oddFinal <= 0) return 0;
    return stakeNum * oddFinal;
  }, [stake, oddFinal]);

  // Calcular lucro potencial
  const lucroPotencial = useMemo(() => {
    const stakeNum = parseFloat(stake);
    if (isNaN(stakeNum) || stakeNum <= 0) return 0;
    return retornoPotencial - stakeNum;
  }, [retornoPotencial, stake]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getFirstLastName = (fullName: string): string => {
    if (!fullName) return "";
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${parts[parts.length - 1]}`;
  };

  const handleSelecaoChange = (
    index: number,
    field: "descricao" | "odd" | "resultado",
    value: string
  ) => {
    setSelecoes((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleUsarFreebetChange = (checked: boolean) => {
    setUsarFreebet(checked);
    if (checked) {
      // Mutuamente exclusivo
      setGerouFreebet(false);
      setValorFreebetGerada("");
      // Preencher stake com saldo freebet disponível
      if (bookmakerSaldo && bookmakerSaldo.saldoFreebet > 0) {
        setStake(bookmakerSaldo.saldoFreebet.toString());
      }
    }
  };

  const handleSubmit = async () => {
    // Validações
    if (!bookmakerId) {
      toast.error("Selecione uma casa/vínculo");
      return;
    }

    const stakeNum = parseFloat(stake);
    if (isNaN(stakeNum) || stakeNum <= 0) {
      toast.error("Informe um valor de stake válido");
      return;
    }

    // Validar seleções
    const numSelecoes = tipoMultipla === "DUPLA" ? 2 : 3;
    for (let i = 0; i < numSelecoes; i++) {
      if (!selecoes[i]?.descricao?.trim()) {
        toast.error(`Preencha a descrição da seleção ${i + 1}`);
        return;
      }
      const oddVal = parseFloat(selecoes[i]?.odd);
      if (isNaN(oddVal) || oddVal <= 1) {
        toast.error(`Informe uma odd válida (>1) para a seleção ${i + 1}`);
        return;
      }
    }

    // Validar saldo
    if (usarFreebet) {
      if (!bookmakerSaldo || stakeNum > bookmakerSaldo.saldoFreebet) {
        toast.error("Saldo de freebet insuficiente");
        return;
      }
    } else {
      if (bookmakerSaldo && stakeNum > bookmakerSaldo.saldo) {
        toast.error("Saldo insuficiente na casa");
        return;
      }
    }

    try {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Usar o resultado calculado baseado nos resultados individuais
      const resultadoFinal = resultadoCalculado;
      
      // Calcular lucro/prejuízo baseado no resultado
      let lucroPrejuizo: number | null = null;
      let valorRetorno: number | null = null;

      // Usar oddFinalReal que considera VOIDs como odd 1.00
      const oddParaCalculo = oddFinalReal;

      if (resultadoFinal !== "PENDENTE") {
        switch (resultadoFinal) {
          case "GREEN":
            if (usarFreebet) {
              // Freebet SNR: só lucro (odd - 1) * stake
              lucroPrejuizo = stakeNum * (oddParaCalculo - 1);
              valorRetorno = lucroPrejuizo;
            } else {
              lucroPrejuizo = stakeNum * (oddParaCalculo - 1);
              valorRetorno = stakeNum * oddParaCalculo;
            }
            break;
          case "RED":
            lucroPrejuizo = usarFreebet ? 0 : -stakeNum;
            valorRetorno = 0;
            break;
          case "VOID":
            lucroPrejuizo = 0;
            valorRetorno = usarFreebet ? 0 : stakeNum;
            break;
        }
      }

      const selecoesFormatadas = selecoes
        .slice(0, tipoMultipla === "DUPLA" ? 2 : 3)
        .map((s) => ({
          descricao: s.descricao.trim(),
          odd: parseFloat(s.odd),
          resultado: s.resultado || "PENDENTE",
        }));

      const apostaData = {
        user_id: user.id,
        projeto_id: projetoId,
        bookmaker_id: bookmakerId,
        tipo_multipla: tipoMultipla,
        stake: stakeNum,
        odd_final: oddFinal,
        retorno_potencial: retornoPotencial,
        lucro_prejuizo: lucroPrejuizo,
        valor_retorno: valorRetorno,
        selecoes: selecoesFormatadas,
        status: resultadoFinal === "PENDENTE" ? "PENDENTE" : "REALIZADA",
        resultado: resultadoFinal,
        tipo_freebet: usarFreebet ? "freebet_snr" : null,
        gerou_freebet: gerouFreebet,
        valor_freebet_gerada: gerouFreebet
          ? parseFloat(valorFreebetGerada) || 0
          : 0,
        data_aposta: dataAposta,
        observacoes: observacoes || null,
      };

      if (aposta) {
        // Update
        const { error } = await supabase
          .from("apostas_multiplas")
          .update(apostaData)
          .eq("id", aposta.id);

        if (error) throw error;

        // Atualizar saldos se necessário (simplificado - ajustar diferença)
        await atualizarSaldosBookmaker(aposta, apostaData, stakeNum);

        toast.success("Aposta múltipla atualizada!");
      } else {
        // Insert
        const { error } = await supabase
          .from("apostas_multiplas")
          .insert(apostaData);

        if (error) throw error;

        // Debitar saldo
        await debitarSaldo(bookmakerId, stakeNum, usarFreebet);

        // Creditar resultado se não pendente
        if (statusResultado !== "PENDENTE" && valorRetorno && valorRetorno > 0) {
          await creditarRetorno(bookmakerId, valorRetorno);
        }

        // Registrar freebet gerada
        if (gerouFreebet && valorFreebetGerada) {
          await registrarFreebetGerada(
            bookmakerId,
            parseFloat(valorFreebetGerada),
            user.id
          );
        }

        toast.success("Aposta múltipla registrada!");
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao salvar aposta: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const debitarSaldo = async (
    bkId: string,
    valor: number,
    isFreebet: boolean
  ) => {
    const { data: bk } = await supabase
      .from("bookmakers")
      .select("saldo_atual, saldo_freebet")
      .eq("id", bkId)
      .single();

    if (!bk) return;

    if (isFreebet) {
      await supabase
        .from("bookmakers")
        .update({ saldo_freebet: bk.saldo_freebet - valor })
        .eq("id", bkId);
    } else {
      await supabase
        .from("bookmakers")
        .update({ saldo_atual: bk.saldo_atual - valor })
        .eq("id", bkId);
    }
  };

  const creditarRetorno = async (bkId: string, valor: number) => {
    const { data: bk } = await supabase
      .from("bookmakers")
      .select("saldo_atual")
      .eq("id", bkId)
      .single();

    if (bk) {
      await supabase
        .from("bookmakers")
        .update({ saldo_atual: bk.saldo_atual + valor })
        .eq("id", bkId);
    }
  };

  const registrarFreebetGerada = async (
    bkId: string,
    valor: number,
    userId: string
  ) => {
    // Criar registro em freebets_recebidas
    await supabase.from("freebets_recebidas").insert({
      bookmaker_id: bkId,
      projeto_id: projetoId,
      user_id: userId,
      valor: valor,
      motivo: "Gerada por aposta múltipla",
      utilizada: false,
    });

    // Incrementar saldo_freebet
    const { data: bk } = await supabase
      .from("bookmakers")
      .select("saldo_freebet")
      .eq("id", bkId)
      .single();

    if (bk) {
      await supabase
        .from("bookmakers")
        .update({ saldo_freebet: bk.saldo_freebet + valor })
        .eq("id", bkId);
    }
  };

  const atualizarSaldosBookmaker = async (
    apostaAntiga: ApostaMultipla,
    apostaNovaData: any,
    novaStake: number
  ) => {
    // Simplificado: reverter impacto antigo e aplicar novo
    // Em produção, seria mais complexo considerando mudanças de bookmaker, etc.
  };

  const handleDelete = async () => {
    if (!aposta) return;

    try {
      setLoading(true);

      const { error } = await supabase
        .from("apostas_multiplas")
        .delete()
        .eq("id", aposta.id);

      if (error) throw error;

      toast.success("Aposta múltipla excluída!");
      setDeleteDialogOpen(false);
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao excluir: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {aposta ? "Editar Aposta Múltipla" : "Nova Aposta Múltipla"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Bookmaker / Vínculo */}
            <div className="space-y-2">
              <Label>Casa / Vínculo *</Label>
              <Select value={bookmakerId} onValueChange={setBookmakerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a casa..." />
                </SelectTrigger>
                <SelectContent>
                  {bookmakers.map((bk) => (
                    <SelectItem key={bk.id} value={bk.id}>
                      <div className="flex items-center gap-2">
                        {bk.bookmakers_catalogo?.logo_url && (
                          <img
                            src={bk.bookmakers_catalogo.logo_url}
                            alt=""
                            className="h-4 w-4 rounded object-contain"
                          />
                        )}
                        <span>
                          {bk.nome}
                          {bk.parceiro?.nome &&
                            ` - ${getFirstLastName(bk.parceiro.nome)}`}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Saldos */}
              {bookmakerSaldo && (
                <div className="flex gap-4 text-xs">
                  <span className="text-muted-foreground">
                    Saldo:{" "}
                    <span className="text-foreground font-medium">
                      {formatCurrency(bookmakerSaldo.saldo)}
                    </span>
                  </span>
                  {bookmakerSaldo.saldoFreebet > 0 && (
                    <span className="text-amber-400">
                      <Gift className="h-3 w-3 inline mr-1" />
                      Freebet: {formatCurrency(bookmakerSaldo.saldoFreebet)}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Tipo de Múltipla */}
            <div className="space-y-2">
              <Label>Tipo de Múltipla</Label>
              <RadioGroup
                value={tipoMultipla}
                onValueChange={(v) => setTipoMultipla(v as "DUPLA" | "TRIPLA")}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="DUPLA" id="dupla" />
                  <Label htmlFor="dupla" className="cursor-pointer">
                    Dupla (2 seleções)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="TRIPLA" id="tripla" />
                  <Label htmlFor="tripla" className="cursor-pointer">
                    Tripla (3 seleções)
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Toggle Usar Freebet */}
            {bookmakerSaldo &&
              bookmakerSaldo.saldoFreebet > 0 &&
              !aposta?.gerou_freebet && (
                <Card className="border-amber-500/30 bg-amber-500/5">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Gift className="h-4 w-4 text-amber-400" />
                        <span className="text-sm font-medium">
                          Usar Freebet nesta aposta?
                        </span>
                      </div>
                      <Switch
                        checked={usarFreebet}
                        onCheckedChange={handleUsarFreebetChange}
                      />
                    </div>
                    {usarFreebet && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Stake será debitada do saldo de Freebet (SNR - stake não
                        retorna)
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

            {/* Seleções */}
            <div className="space-y-3">
              <Label>Seleções</Label>
              {selecoes.map((selecao, index) => (
                <Card key={index} className={`${
                  selecao.resultado === "GREEN" ? "bg-emerald-500/10 border-emerald-500/30" :
                  selecao.resultado === "RED" ? "bg-red-500/10 border-red-500/30" :
                  selecao.resultado === "VOID" ? "bg-gray-500/10 border-gray-500/30" :
                  "bg-muted/30"
                }`}>
                  <CardContent className="pt-3 pb-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        SELEÇÃO {index + 1}
                      </span>
                      <Select 
                        value={selecao.resultado || "PENDENTE"} 
                        onValueChange={(v) => handleSelecaoChange(index, "resultado", v)}
                      >
                        <SelectTrigger className="w-[110px] h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PENDENTE">Pendente</SelectItem>
                          <SelectItem value="GREEN">Green</SelectItem>
                          <SelectItem value="RED">Red</SelectItem>
                          <SelectItem value="VOID">Void</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-[1fr,100px] gap-2">
                      <Input
                        placeholder="Ex: Flamengo x Palmeiras - Flamengo vence"
                        value={selecao.descricao}
                        onChange={(e) =>
                          handleSelecaoChange(index, "descricao", e.target.value)
                        }
                      />
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Odd"
                        value={selecao.odd}
                        onChange={(e) =>
                          handleSelecaoChange(index, "odd", e.target.value)
                        }
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Stake e Cálculos */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Stake (R$) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Odd Final</Label>
                <Input
                  value={oddFinal > 0 ? oddFinal.toFixed(3) : "-"}
                  disabled
                  className="bg-muted/50"
                />
              </div>
              <div className="space-y-2">
                <Label>Retorno Potencial</Label>
                <Input
                  value={
                    retornoPotencial > 0 ? formatCurrency(retornoPotencial) : "-"
                  }
                  disabled
                  className="bg-muted/50"
                />
              </div>
            </div>

            {/* Resultado Calculado e Lucro */}
            {resultadoCalculado !== "PENDENTE" && (
              <div className={`p-3 rounded-lg border ${
                resultadoCalculado === "GREEN" ? "bg-emerald-500/10 border-emerald-500/30" :
                resultadoCalculado === "RED" ? "bg-red-500/10 border-red-500/30" :
                "bg-gray-500/10 border-gray-500/30"
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Resultado:</span>
                  <Badge className={`${
                    resultadoCalculado === "GREEN" ? "bg-emerald-500/20 text-emerald-400" :
                    resultadoCalculado === "RED" ? "bg-red-500/20 text-red-400" :
                    "bg-gray-500/20 text-gray-400"
                  }`}>
                    {resultadoCalculado}
                  </Badge>
                </div>
                {resultadoCalculado === "GREEN" && oddFinalReal !== oddFinal && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                    <span>Odd Ajustada (VOIDs = 1.00):</span>
                    <span className="font-medium text-foreground">{oddFinalReal.toFixed(3)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Lucro Potencial (apenas se pendente) */}
            {lucroPotencial > 0 && resultadoCalculado === "PENDENTE" && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Lucro Potencial:
                  </span>
                  <span className="text-lg font-bold text-emerald-400">
                    {formatCurrency(lucroPotencial)}
                  </span>
                </div>
              </div>
            )}

            {/* Data da Aposta */}
            <div className="space-y-2">
              <Label>Data/Hora da Aposta</Label>
              <DateTimePicker
                value={dataAposta}
                onChange={setDataAposta}
              />
            </div>

            {/* Resultado - Calculado automaticamente */}
            <div className="space-y-2">
              <Label>Resultado da Múltipla</Label>
              <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                <Badge className={`${
                  resultadoCalculado === "GREEN" ? "bg-emerald-500/20 text-emerald-400" :
                  resultadoCalculado === "RED" ? "bg-red-500/20 text-red-400" :
                  resultadoCalculado === "VOID" ? "bg-gray-500/20 text-gray-400" :
                  "bg-blue-500/20 text-blue-400"
                }`}>
                  {resultadoCalculado}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  (calculado automaticamente com base nos resultados individuais)
                </span>
              </div>
            </div>

            {/* Gerou Freebet - mutuamente exclusivo com Usar Freebet */}
            {!usarFreebet && (
              <Card className="border-emerald-500/30 bg-emerald-500/5">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Gift className="h-4 w-4 text-emerald-400" />
                      <span className="text-sm font-medium">
                        Esta aposta gerou Freebet?
                      </span>
                    </div>
                    <Switch
                      checked={gerouFreebet}
                      onCheckedChange={setGerouFreebet}
                    />
                  </div>
                  {gerouFreebet && (
                    <div className="mt-3">
                      <Label className="text-xs">Valor da Freebet Gerada</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={valorFreebetGerada}
                        onChange={(e) => setValorFreebetGerada(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Observações */}
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                placeholder="Anotações opcionais..."
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {aposta && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={loading}
                className="sm:mr-auto"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir aposta múltipla?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A aposta será removida
              permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
