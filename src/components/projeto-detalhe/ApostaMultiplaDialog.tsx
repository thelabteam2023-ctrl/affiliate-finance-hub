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
import { RegistroApostaFields, RegistroApostaValues, getSuggestionsForTab } from "./RegistroApostaFields";

interface Selecao {
  descricao: string;
  odd: string;
  resultado?: "PENDENTE" | "GREEN" | "RED" | "MEIO_GREEN" | "MEIO_RED" | "VOID";
}

interface ApostaMultipla {
  id: string;
  tipo_multipla: string;
  stake: number;
  odd_final: number;
  retorno_potencial: number | null;
  lucro_prejuizo: number | null;
  valor_retorno: number | null;
  selecoes: { descricao: string; odd: string; resultado?: string }[];
  status: string;
  resultado: string | null;
  bookmaker_id: string;
  tipo_freebet: string | null;
  gerou_freebet: boolean;
  valor_freebet_gerada: number | null;
  data_aposta: string;
  observacoes: string | null;
  estrategia?: string | null;
  forma_registro?: string | null;
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
  defaultEstrategia?: string;
}

export function ApostaMultiplaDialog({
  open,
  onOpenChange,
  aposta,
  projetoId,
  onSuccess,
  defaultEstrategia = 'PUNTER',
}: ApostaMultiplaDialogProps) {
  const [loading, setLoading] = useState(false);
  const [bookmakers, setBookmakers] = useState<Bookmaker[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Form state
  const [bookmakerId, setBookmakerId] = useState("");
  const [tipoMultipla, setTipoMultipla] = useState<"DUPLA" | "TRIPLA">("DUPLA");
  const [stake, setStake] = useState("");
  const [resultadoManual, setResultadoManual] = useState<string | null>(null);
  const [statusResultado, setStatusResultado] = useState("PENDENTE");
  const [dataAposta, setDataAposta] = useState("");
  const [observacoes, setObservacoes] = useState("");

  // Registro explícito
  const [registroValues, setRegistroValues] = useState<RegistroApostaValues>(() => {
    const suggestions = getSuggestionsForTab(defaultEstrategia === 'EXTRACAO_BONUS' ? 'bonus' : 'apostas');
    return {
      forma_registro: 'MULTIPLA',
      estrategia: defaultEstrategia as any,
      contexto_operacional: suggestions.contexto_operacional || 'NORMAL',
    };
  });

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
      
      // Verificar se o resultado salvo é diferente do calculado automaticamente
      // Se for, significa que foi um resultado manual
      const savedResultado = aposta.resultado || "PENDENTE";
      // Vamos verificar depois que as seleções forem carregadas
      setTimeout(() => {
        // Se o resultado salvo for MEIO_GREEN ou MEIO_RED, é certamente manual
        if (savedResultado === "MEIO_GREEN" || savedResultado === "MEIO_RED") {
          setResultadoManual(savedResultado);
        } else {
          setResultadoManual(null);
        }
      }, 100);
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
    setResultadoManual(null);
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
    // Reset registro values
    const suggestions = getSuggestionsForTab(defaultEstrategia === 'EXTRACAO_BONUS' ? 'bonus' : 'apostas');
    setRegistroValues({
      forma_registro: 'MULTIPLA',
      estrategia: defaultEstrategia as any,
      contexto_operacional: suggestions.contexto_operacional || 'NORMAL',
    });
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

  // Calcular preview em tempo real com fatores corretos
  const previewCalculo = useMemo(() => {
    const stakeNum = parseFloat(stake) || 0;
    const selecoesValidas = selecoes.filter((s) => {
      const oddNum = parseFloat(s.odd);
      return !isNaN(oddNum) && oddNum > 0;
    });

    if (stakeNum <= 0 || selecoesValidas.length === 0) {
      return { resultado: "PENDENTE", retorno: 0, lucro: 0 };
    }

    // Se qualquer seleção for RED → múltipla = RED total
    if (selecoes.some((s) => s.resultado === "RED")) {
      return {
        resultado: "RED",
        retorno: 0,
        lucro: usarFreebet ? 0 : -stakeNum,
      };
    }

    // Verificar se todas são PENDENTE
    const todasPendente = selecoes.every((s) => (s.resultado || "PENDENTE") === "PENDENTE");

    // Calcular fatores para cada seleção
    // Fórmula: odd_efetiva = retorno_parcial / stake
    // GREEN: odd_efetiva = odd
    // RED: já tratado acima (múltipla = RED)
    // VOID: odd_efetiva = 1 (não altera)
    // MEIO_GREEN: odd_efetiva = (odd + 1) / 2
    // MEIO_RED: odd_efetiva = 0.5
    let fatorTotal = 1;
    let oddTotal = 1; // Para calcular lucro_full (todas green)

    for (const s of selecoesValidas) {
      const odd = parseFloat(s.odd);
      oddTotal *= odd;

      const resultado = s.resultado || "PENDENTE";
      switch (resultado) {
        case "GREEN":
          fatorTotal *= odd;
          break;
        case "VOID":
          fatorTotal *= 1;
          break;
        case "MEIO_GREEN":
          // odd_efetiva = (odd + 1) / 2
          fatorTotal *= (odd + 1) / 2;
          break;
        case "MEIO_RED":
          // odd_efetiva = 0.5
          fatorTotal *= 0.5;
          break;
        case "PENDENTE":
          fatorTotal *= odd; // Assume green para preview potencial
          break;
      }
    }

    const retorno = stakeNum * fatorTotal;
    // Para freebet: RED/perda não perde stake, lucro só vem se ganhar
    const lucro = usarFreebet
      ? retorno > stakeNum
        ? retorno - stakeNum
        : 0
      : retorno - stakeNum;
    const lucroFull = stakeNum * (oddTotal - 1);

    // Classificar resultado se não for tudo pendente
    let resultado: string;
    const EPSILON = 0.01;

    if (todasPendente) {
      resultado = "PENDENTE";
    } else if (Math.abs(lucro) < EPSILON) {
      resultado = "VOID";
    } else if (lucro > 0) {
      resultado = Math.abs(lucro - lucroFull) < EPSILON ? "GREEN" : "MEIO_GREEN";
    } else {
      resultado = Math.abs(lucro + stakeNum) < EPSILON ? "RED" : "MEIO_RED";
    }

    return { resultado, retorno, lucro };
  }, [selecoes, stake, usarFreebet]);

  // Resultado final considerando override manual
  const resultadoCalculado = resultadoManual || previewCalculo.resultado;

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
    // Validação dos campos de registro obrigatórios
    if (!registroValues.forma_registro || !registroValues.estrategia || !registroValues.contexto_operacional) {
      toast.error("Preencha todos os campos obrigatórios: forma de registro, estratégia e contexto operacional");
      return;
    }

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
      
      // Usar valores do previewCalculo que já calcula corretamente com fatores
      let lucroPrejuizo: number | null = null;
      let valorRetorno: number | null = null;

      if (resultadoFinal !== "PENDENTE") {
        lucroPrejuizo = previewCalculo.lucro;
        valorRetorno = previewCalculo.retorno;
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
        status: resultadoFinal === "PENDENTE" ? "PENDENTE" : "LIQUIDADA",
        resultado: resultadoFinal,
        tipo_freebet: usarFreebet ? "freebet_snr" : null,
        gerou_freebet: gerouFreebet,
        valor_freebet_gerada: gerouFreebet
          ? parseFloat(valorFreebetGerada) || 0
          : 0,
        data_aposta: dataAposta,
        observacoes: observacoes || null,
        estrategia: registroValues.estrategia,
        forma_registro: registroValues.forma_registro,
        contexto_operacional: registroValues.contexto_operacional,
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

        // Registrar freebet gerada (se mudou de não-gerou para gerou)
        if (gerouFreebet && valorFreebetGerada && !aposta.gerou_freebet) {
          await registrarFreebetGerada(
            bookmakerId,
            parseFloat(valorFreebetGerada),
            user.id,
            aposta.id, // Passar o ID da aposta sendo editada
            resultadoFinal // Passar o resultado para determinar status
          );
        }

        // Verificar se resultado mudou e atualizar status da freebet
        const resultadoAnterior = aposta.resultado;
        if (aposta.gerou_freebet) {
          // Caso 1: PENDENTE → resultado final
          if (resultadoAnterior === "PENDENTE" && resultadoFinal !== "PENDENTE") {
            // VOID = não libera, qualquer outro resultado (GREEN, RED, MEIO_GREEN, MEIO_RED) = libera
            if (resultadoFinal === "VOID") {
              await recusarFreebetPendente(aposta.id);
            } else {
              await liberarFreebetPendente(aposta.id);
            }
          }
          // Caso 2: resultado final → PENDENTE (reversão)
          else if (resultadoAnterior !== "PENDENTE" && resultadoAnterior !== null && resultadoFinal === "PENDENTE") {
            await reverterFreebetParaPendente(aposta.id);
          }
          // Caso 3: resultado final (não-VOID) → VOID
          else if (resultadoAnterior !== "PENDENTE" && resultadoAnterior !== "VOID" && resultadoAnterior !== null && resultadoFinal === "VOID") {
            // Freebet já estava LIBERADA, precisa reverter para NAO_LIBERADA
            const { data: freebetLiberada } = await supabase
              .from("freebets_recebidas")
              .select("id, bookmaker_id, valor")
              .eq("aposta_multipla_id", aposta.id)
              .eq("status", "LIBERADA")
              .maybeSingle();

            if (freebetLiberada) {
              // Decrementar saldo_freebet
              const { data: bookmaker } = await supabase
                .from("bookmakers")
                .select("saldo_freebet")
                .eq("id", freebetLiberada.bookmaker_id)
                .maybeSingle();

              if (bookmaker) {
                const novoSaldoFreebet = Math.max(0, (bookmaker.saldo_freebet || 0) - freebetLiberada.valor);
                await supabase
                  .from("bookmakers")
                  .update({ saldo_freebet: novoSaldoFreebet })
                  .eq("id", freebetLiberada.bookmaker_id);
              }

              // Mudar status para NAO_LIBERADA
              await supabase
                .from("freebets_recebidas")
                .update({ status: "NAO_LIBERADA" })
                .eq("id", freebetLiberada.id);
            }
          }
        }

        toast.success("Aposta múltipla atualizada!");
      } else {
        // Insert - capturar o ID da aposta inserida
        const { data: insertedData, error } = await supabase
          .from("apostas_multiplas")
          .insert(apostaData)
          .select("id")
          .single();

        if (error) throw error;

        const novaApostaId = insertedData?.id;

        // NOTA: Não debitar saldo_atual na criação de apostas PENDENTES!
        // O modelo contábil correto é:
        // - saldo_atual = saldo total real (só muda na liquidação)
        // - "Em Aposta" = soma das stakes pendentes (calculado dinamicamente)
        // - "Livre" = saldo_atual - Em Aposta
        
        // Só aplicar efeito no saldo se resultado NÃO for pendente
        if (resultadoFinal !== "PENDENTE" && resultadoFinal !== null) {
          if (resultadoFinal === "RED" || resultadoFinal === "MEIO_RED") {
            // RED: debitar stake (perda confirmada)
            await debitarSaldo(bookmakerId, stakeNum, usarFreebet);
          } else if ((resultadoFinal === "GREEN" || resultadoFinal === "MEIO_GREEN") && valorRetorno && valorRetorno > 0) {
            // GREEN: creditar lucro (retorno - stake)
            const lucro = valorRetorno - stakeNum;
            if (lucro > 0) {
              await creditarRetorno(bookmakerId, lucro);
            } else if (lucro < 0) {
              await debitarSaldo(bookmakerId, Math.abs(lucro), usarFreebet);
            }
          }
          // VOID: não altera saldo
        }

        // Registrar freebet gerada com ID da aposta e resultado
        if (gerouFreebet && valorFreebetGerada && novaApostaId) {
          await registrarFreebetGerada(
            bookmakerId,
            parseFloat(valorFreebetGerada),
            user.id,
            novaApostaId,
            resultadoFinal // Passar resultado para determinar status (PENDENTE ou GREEN)
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
    userId: string,
    apostaMultiplaId?: string,
    resultadoAposta?: string
  ) => {
    try {
      // Determinar o status da freebet baseado no resultado da aposta
      // PENDENTE = aposta ainda não liquidada
      // LIBERADA = aposta GREEN ou RED (freebet disponível - algumas casas dão freebet mesmo em derrota)
      // NAO_LIBERADA = aposta VOID (única circunstância que não libera)
      let status: "PENDENTE" | "LIBERADA" | "NAO_LIBERADA" = "PENDENTE";
      
      if (resultadoAposta && resultadoAposta !== "PENDENTE") {
        // GREEN, RED, MEIO_GREEN, MEIO_RED = libera freebet
        // VOID = não libera
        status = resultadoAposta === "VOID" ? "NAO_LIBERADA" : "LIBERADA";
      }

      // Só incrementar saldo_freebet se a freebet for liberada (GREEN)
      if (status === "LIBERADA") {
        const { data: bookmaker } = await supabase
          .from("bookmakers")
          .select("saldo_freebet")
          .eq("id", bkId)
          .maybeSingle();

        if (bookmaker) {
          const novoSaldoFreebet = (bookmaker.saldo_freebet || 0) + valor;
          await supabase
            .from("bookmakers")
            .update({ saldo_freebet: novoSaldoFreebet })
            .eq("id", bkId);
        }
      }

      // Registrar na tabela freebets_recebidas com status apropriado
      await supabase.from("freebets_recebidas").insert({
        bookmaker_id: bkId,
        projeto_id: projetoId,
        user_id: userId,
        valor: valor,
        motivo: "Gerada por aposta múltipla",
        data_recebida: new Date().toISOString(),
        utilizada: false,
        aposta_multipla_id: apostaMultiplaId || null,
        status: status,
      });
    } catch (error) {
      console.error("Erro ao registrar freebet gerada:", error);
    }
  };

  // Função para liberar freebet pendente quando aposta é liquidada (GREEN, RED)
  const liberarFreebetPendente = async (apostaMultiplaId: string) => {
    try {
      // Buscar freebet pendente associada a esta aposta
      const { data: freebetPendente } = await supabase
        .from("freebets_recebidas")
        .select("id, bookmaker_id, valor")
        .eq("aposta_multipla_id", apostaMultiplaId)
        .eq("status", "PENDENTE")
        .maybeSingle();

      if (freebetPendente) {
        // Atualizar status para LIBERADA
        await supabase
          .from("freebets_recebidas")
          .update({ status: "LIBERADA" })
          .eq("id", freebetPendente.id);

        // Incrementar saldo_freebet do bookmaker
        const { data: bookmaker } = await supabase
          .from("bookmakers")
          .select("saldo_freebet")
          .eq("id", freebetPendente.bookmaker_id)
          .maybeSingle();

        if (bookmaker) {
          const novoSaldoFreebet = (bookmaker.saldo_freebet || 0) + freebetPendente.valor;
          await supabase
            .from("bookmakers")
            .update({ saldo_freebet: novoSaldoFreebet })
            .eq("id", freebetPendente.bookmaker_id);
        }
      }
    } catch (error) {
      console.error("Erro ao liberar freebet pendente:", error);
    }
  };

  // Função para recusar freebet quando aposta muda para VOID (única circunstância que não libera)
  const recusarFreebetPendente = async (apostaMultiplaId: string) => {
    try {
      await supabase
        .from("freebets_recebidas")
        .update({ status: "NAO_LIBERADA" })
        .eq("aposta_multipla_id", apostaMultiplaId)
        .eq("status", "PENDENTE");
    } catch (error) {
      console.error("Erro ao recusar freebet pendente:", error);
    }
  };

  // Função para reverter freebet LIBERADA de volta para PENDENTE quando aposta volta para PENDENTE
  const reverterFreebetParaPendente = async (apostaMultiplaId: string) => {
    try {
      // Buscar freebet LIBERADA associada a esta aposta
      const { data: freebetLiberada } = await supabase
        .from("freebets_recebidas")
        .select("id, bookmaker_id, valor")
        .eq("aposta_multipla_id", apostaMultiplaId)
        .eq("status", "LIBERADA")
        .maybeSingle();

      if (freebetLiberada) {
        // Decrementar saldo_freebet do bookmaker (reverter o crédito)
        const { data: bookmaker } = await supabase
          .from("bookmakers")
          .select("saldo_freebet")
          .eq("id", freebetLiberada.bookmaker_id)
          .maybeSingle();

        if (bookmaker) {
          const novoSaldoFreebet = Math.max(0, (bookmaker.saldo_freebet || 0) - freebetLiberada.valor);
          await supabase
            .from("bookmakers")
            .update({ saldo_freebet: novoSaldoFreebet })
            .eq("id", freebetLiberada.bookmaker_id);
        }

        // Voltar status para PENDENTE
        await supabase
          .from("freebets_recebidas")
          .update({ status: "PENDENTE" })
          .eq("id", freebetLiberada.id);
      }
    } catch (error) {
      console.error("Erro ao reverter freebet para pendente:", error);
    }
  };

  const atualizarSaldosBookmaker = async (
    apostaAntiga: ApostaMultipla,
    apostaNovaData: any,
    novaStake: number
  ) => {
    const antigaStake = apostaAntiga.stake;
    const antigaUsavaFreebet = apostaAntiga.tipo_freebet && apostaAntiga.tipo_freebet !== "normal";
    const novaUsaFreebet = usarFreebet;
    const antigoBkId = apostaAntiga.bookmaker_id;
    const novoBkId = apostaNovaData.bookmaker_id;
    const resultadoAntigo = apostaAntiga.resultado;
    const resultadoNovo = apostaNovaData.resultado;
    
    // REVERTER efeito do resultado ANTIGO (se existia e não era PENDENTE)
    if (resultadoAntigo && resultadoAntigo !== "PENDENTE") {
      if (resultadoAntigo === "RED" || resultadoAntigo === "MEIO_RED") {
        // RED antiga: stake foi debitada, reverter (creditar)
        if (antigaUsavaFreebet) {
          const { data: bk } = await supabase
            .from("bookmakers")
            .select("saldo_freebet")
            .eq("id", antigoBkId)
            .single();
          if (bk) {
            await supabase
              .from("bookmakers")
              .update({ saldo_freebet: bk.saldo_freebet + antigaStake })
              .eq("id", antigoBkId);
          }
        } else {
          const { data: bk } = await supabase
            .from("bookmakers")
            .select("saldo_atual")
            .eq("id", antigoBkId)
            .single();
          if (bk) {
            await supabase
              .from("bookmakers")
              .update({ saldo_atual: bk.saldo_atual + antigaStake })
              .eq("id", antigoBkId);
          }
        }
      } else if ((resultadoAntigo === "GREEN" || resultadoAntigo === "MEIO_GREEN") && apostaAntiga.valor_retorno) {
        // GREEN antiga: lucro foi creditado, reverter (debitar lucro)
        const lucroAntigo = apostaAntiga.valor_retorno - antigaStake;
        if (lucroAntigo !== 0) {
          const { data: bk } = await supabase
            .from("bookmakers")
            .select("saldo_atual")
            .eq("id", antigoBkId)
            .single();
          if (bk) {
            await supabase
              .from("bookmakers")
              .update({ saldo_atual: bk.saldo_atual - lucroAntigo })
              .eq("id", antigoBkId);
          }
        }
      }
      // VOID antiga: não alterou saldo, não precisa reverter
    }
    
    // APLICAR efeito do resultado NOVO (se não for PENDENTE)
    if (resultadoNovo && resultadoNovo !== "PENDENTE") {
      if (resultadoNovo === "RED" || resultadoNovo === "MEIO_RED") {
        // RED: debitar stake
        await debitarSaldo(novoBkId, novaStake, novaUsaFreebet);
      } else if ((resultadoNovo === "GREEN" || resultadoNovo === "MEIO_GREEN") && apostaNovaData.valor_retorno) {
        // GREEN: creditar lucro
        const lucroNovo = apostaNovaData.valor_retorno - novaStake;
        if (lucroNovo > 0) {
          await creditarRetorno(novoBkId, lucroNovo);
        } else if (lucroNovo < 0) {
          await debitarSaldo(novoBkId, Math.abs(lucroNovo), novaUsaFreebet);
        }
      }
      // VOID: não altera saldo
    }
  };

  const handleDelete = async () => {
    if (!aposta) return;

    try {
      setLoading(true);

      // Reverter saldo baseado no resultado da aposta
      // Modelo contábil: saldo só foi alterado se teve resultado (não PENDENTE)
      const resultado = aposta.resultado;
      const usavaFreebet = aposta.tipo_freebet && aposta.tipo_freebet !== "normal";
      
      if (resultado && resultado !== "PENDENTE") {
        if (resultado === "RED" || resultado === "MEIO_RED") {
          // RED/MEIO_RED: stake foi debitada, reverter (creditar)
          if (usavaFreebet) {
            const { data: bk } = await supabase
              .from("bookmakers")
              .select("saldo_freebet")
              .eq("id", aposta.bookmaker_id)
              .single();
            if (bk) {
              await supabase
                .from("bookmakers")
                .update({ saldo_freebet: bk.saldo_freebet + aposta.stake })
                .eq("id", aposta.bookmaker_id);
            }
          } else {
            const { data: bk } = await supabase
              .from("bookmakers")
              .select("saldo_atual")
              .eq("id", aposta.bookmaker_id)
              .single();
            if (bk) {
              await supabase
                .from("bookmakers")
                .update({ saldo_atual: bk.saldo_atual + aposta.stake })
                .eq("id", aposta.bookmaker_id);
            }
          }
        } else if ((resultado === "GREEN" || resultado === "MEIO_GREEN") && aposta.valor_retorno) {
          // GREEN/MEIO_GREEN: lucro foi creditado, reverter (debitar lucro)
          const lucro = aposta.valor_retorno - aposta.stake;
          if (lucro > 0) {
            const { data: bk } = await supabase
              .from("bookmakers")
              .select("saldo_atual")
              .eq("id", aposta.bookmaker_id)
              .single();
            if (bk) {
              await supabase
                .from("bookmakers")
                .update({ saldo_atual: bk.saldo_atual - lucro })
                .eq("id", aposta.bookmaker_id);
            }
          } else if (lucro < 0) {
            // Caso raro: retorno menor que stake, creditar a diferença
            const { data: bk } = await supabase
              .from("bookmakers")
              .select("saldo_atual")
              .eq("id", aposta.bookmaker_id)
              .single();
            if (bk) {
              await supabase
                .from("bookmakers")
                .update({ saldo_atual: bk.saldo_atual + Math.abs(lucro) })
                .eq("id", aposta.bookmaker_id);
            }
          }
        }
        // VOID: não alterou saldo, não precisa reverter
      }
      // PENDENTE: não alterou saldo, não precisa reverter

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
            {/* Campos de Registro Obrigatórios */}
            <RegistroApostaFields
              values={registroValues}
              onChange={setRegistroValues}
            />

            {/* Bookmaker / Vínculo */}
            <div className="space-y-2">
              <Label>Casa / Vínculo *</Label>
              <Select value={bookmakerId} onValueChange={setBookmakerId}>
                <SelectTrigger className="h-10 items-center">
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
                        <span className="uppercase">
                          {bk.nome} • {getFirstLastName(bk.parceiro?.nome || "")} – {formatCurrency(bk.saldo_atual + (bk.saldo_freebet || 0))}
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
                    Saldo Total:{" "}
                    <span className="text-foreground font-medium">
                      {formatCurrency(bookmakerSaldo.saldo + bookmakerSaldo.saldoFreebet)}
                    </span>
                    <span className="text-muted-foreground/70 ml-1">
                      ({formatCurrency(bookmakerSaldo.saldo)} real
                      {bookmakerSaldo.saldoFreebet > 0 && (
                        <> + <Gift className="h-3 w-3 inline mx-0.5 text-amber-400" />{formatCurrency(bookmakerSaldo.saldoFreebet)} freebet</>
                      )})
                    </span>
                  </span>
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
                  selecao.resultado === "MEIO_GREEN" ? "bg-emerald-500/5 border-emerald-500/20" :
                  selecao.resultado === "RED" ? "bg-red-500/10 border-red-500/30" :
                  selecao.resultado === "MEIO_RED" ? "bg-red-500/5 border-red-500/20" :
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
                          <SelectItem value="MEIO_GREEN">Meio Green</SelectItem>
                          <SelectItem value="RED">Red</SelectItem>
                          <SelectItem value="MEIO_RED">Meio Red</SelectItem>
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
                        className="uppercase"
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

            {/* Preview em Tempo Real da Múltipla */}
            <Card className="border-blue-500/30 bg-blue-500/5">
              <CardContent className="pt-3 pb-3">
                <div className="text-xs text-muted-foreground mb-2">
                  Preview da Múltipla
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground block mb-1">Resultado:</span>
                    <Badge className={`${
                      previewCalculo.resultado === "GREEN" ? "bg-emerald-500/20 text-emerald-400" :
                      previewCalculo.resultado === "MEIO_GREEN" ? "bg-emerald-500/10 text-emerald-300" :
                      previewCalculo.resultado === "RED" ? "bg-red-500/20 text-red-400" :
                      previewCalculo.resultado === "MEIO_RED" ? "bg-red-500/10 text-red-300" :
                      previewCalculo.resultado === "VOID" ? "bg-gray-500/20 text-gray-400" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {previewCalculo.resultado === "MEIO_GREEN" ? "MEIO GREEN" :
                       previewCalculo.resultado === "MEIO_RED" ? "MEIO RED" :
                       previewCalculo.resultado}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block mb-1">Retorno:</span>
                    <span className="font-medium">{formatCurrency(previewCalculo.retorno)}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block mb-1">P/L:</span>
                    <span className={previewCalculo.lucro >= 0 ? "text-emerald-400 font-medium" : "text-red-400 font-medium"}>
                      {previewCalculo.lucro >= 0 ? "+" : ""}{formatCurrency(previewCalculo.lucro)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

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
                resultadoCalculado === "MEIO_GREEN" ? "bg-emerald-500/5 border-emerald-500/20" :
                resultadoCalculado === "RED" ? "bg-red-500/10 border-red-500/30" :
                resultadoCalculado === "MEIO_RED" ? "bg-red-500/5 border-red-500/20" :
                "bg-gray-500/10 border-gray-500/30"
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Resultado:</span>
                  <Badge className={`${
                    resultadoCalculado === "GREEN" ? "bg-emerald-500/20 text-emerald-400" :
                    resultadoCalculado === "MEIO_GREEN" ? "bg-emerald-500/10 text-emerald-300" :
                    resultadoCalculado === "RED" ? "bg-red-500/20 text-red-400" :
                    resultadoCalculado === "MEIO_RED" ? "bg-red-500/10 text-red-300" :
                    "bg-gray-500/20 text-gray-400"
                  }`}>
                    {resultadoCalculado === "MEIO_GREEN" ? "MEIO GREEN" : 
                     resultadoCalculado === "MEIO_RED" ? "MEIO RED" : 
                     resultadoCalculado}
                  </Badge>
                </div>
                {(resultadoCalculado === "GREEN" || resultadoCalculado === "MEIO_GREEN") && oddFinalReal !== oddFinal && (
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

            {/* Resultado - Calculado automaticamente ou manual */}
            <div className="space-y-2">
              <Label>Resultado da Múltipla</Label>
              <Select 
                value={resultadoManual || previewCalculo.resultado} 
                onValueChange={(v) => {
                  // Se selecionar o mesmo que o automático, limpa o manual
                  if (v === previewCalculo.resultado) {
                    setResultadoManual(null);
                  } else {
                    setResultadoManual(v);
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDENTE">Pendente</SelectItem>
                  <SelectItem value="GREEN">Green</SelectItem>
                  <SelectItem value="MEIO_GREEN">Meio Green</SelectItem>
                  <SelectItem value="RED">Red</SelectItem>
                  <SelectItem value="MEIO_RED">Meio Red</SelectItem>
                  <SelectItem value="VOID">Void</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {resultadoManual 
                  ? `Resultado manual selecionado (automático seria: ${previewCalculo.resultado})`
                  : "Calculado automaticamente com base nos resultados individuais"
                }
              </p>
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
