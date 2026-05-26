import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Sparkles, ScanText, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMercadosBiblioteca, ESPORTES_BIBLIOTECA, type MercadoBiblioteca } from "@/hooks/useMercadosBiblioteca";
import { FonteEntradaSelector } from "@/components/apostas/FonteEntradaSelector";
import { criarAposta, aplicarCamposNovaEntrada } from "@/services/aposta";
import { APOSTA_ESTRATEGIA, FORMA_REGISTRO, type ApostaEstrategia } from "@/lib/apostaConstants";
import { useProjetoWorkingRates } from "@/hooks/useProjetoWorkingRates";
import { useBookmakerSaldosQuery } from "@/hooks/useBookmakerSaldosQuery";
import { BookmakerSelectTrigger } from "@/components/bookmakers/BookmakerSelectOption";
import { BookmakerSearchableSelectContent } from "@/components/bookmakers/BookmakerSearchableSelectContent";

type Resultado = "PENDENTE" | "GREEN" | "RED" | "MEIO_GREEN" | "MEIO_RED" | "VOID";

// Mapeia "esporte" retornado pelo OCR (PT-BR) para o code da biblioteca.
const OCR_SPORT_MAP: Record<string, string> = {
  "futebol": "soccer",
  "soccer": "soccer",
  "basquete": "basketball",
  "basketball": "basketball",
  "tênis": "tennis",
  "tenis": "tennis",
  "tennis": "tennis",
  "hockey": "hockey",
  "handebol": "handball",
  "handball": "handball",
  "counter-strike": "cs2",
  "cs:go": "cs2",
  "cs2": "cs2",
  "league of legends": "lol",
  "lol": "lol",
  "dota 2": "dota2",
  "dota2": "dota2",
  "valorant": "valorant",
};

const RESULTADOS: { value: Resultado; label: string; className: string }[] = [
  { value: "PENDENTE",   label: "Pendente", className: "border-border text-muted-foreground" },
  { value: "GREEN",      label: "Green",    className: "border-emerald-500/40 text-emerald-500" },
  { value: "RED",        label: "Red",      className: "border-red-500/40 text-red-500" },
  { value: "MEIO_GREEN", label: "½ Green",  className: "border-emerald-500/30 text-emerald-400/80" },
  { value: "MEIO_RED",   label: "½ Red",    className: "border-red-500/30 text-red-400/80" },
  { value: "VOID",       label: "Void",     className: "border-border text-muted-foreground" },
];

interface NovaEntradaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projetoId: string;
  estrategia: ApostaEstrategia; // VALUEBET ou SUREBET (modo simples)
  onCreated?: () => void;
}

function calcEdge(odd: number | null, fair: number | null): number | null {
  if (!odd || !fair || fair === 0) return null;
  return (odd / fair - 1) * 100;
}

function buildMercadoDisplay(
  categoria: string,
  objeto: string | null,
  formato: string | null,
  direcao: string,
  linha: string | null,
  displayNome: string,
): string {
  const parts = [displayNome];
  if (formato) parts.push(formato);
  parts.push(direcao);
  if (linha) parts.push(linha);
  return parts.filter(Boolean).join(" · ");
}

export function NovaEntradaDialog({ open, onOpenChange, projetoId, estrategia, onCreated }: NovaEntradaDialogProps) {
  const { user, workspaceId } = useAuth();
  const queryClient = useQueryClient();
  const { getEffectiveRate } = useProjetoWorkingRates(projetoId);

  // ---------- Form state ----------
  const [fonteEntrada, setFonteEntrada] = useState<string | null>(null);
  const [esporte, setEsporte] = useState<string>("soccer");
  const [liga, setLiga] = useState("");
  const [evento, setEvento] = useState("");

  const [categoria, setCategoria] = useState<string>("");
  const [mercadoSel, setMercadoSel] = useState<MercadoBiblioteca | null>(null);
  const [formato, setFormato] = useState<string>("");
  const [direcao, setDirecao] = useState<string>("");
  const [linha, setLinha] = useState<string>("");

  const [bookmakerId, setBookmakerId] = useState<string>("");
  const [moeda, setMoeda] = useState<string>("BRL");
  const [oddObtida, setOddObtida] = useState<string>("");
  const [fairValue, setFairValue] = useState<string>("");
  const [stake, setStake] = useState<string>("");
  const [dataHora, setDataHora] = useState<string>(() => new Date().toISOString().slice(0, 16));
  const [modelo, setModelo] = useState<"pre-jogo" | "ao-vivo">("pre-jogo");
  const [resultado, setResultado] = useState<Resultado>("PENDENTE");

  const [saving, setSaving] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [ocrHintMercado, setOcrHintMercado] = useState<string | null>(null);
  const [ocrHintAposta, setOcrHintAposta] = useState<string | null>(null);

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(file);
    });

  const applyOcrParsed = (parsed: any) => {
    const getV = (f: any) => (f && typeof f === "object" ? f.value : null);
    // Esporte
    const ocrSport = (getV(parsed.esporte) || "").toString().toLowerCase().trim();
    if (ocrSport && OCR_SPORT_MAP[ocrSport]) {
      setEsporte(OCR_SPORT_MAP[ocrSport]);
    }
    // Evento
    const mandante = getV(parsed.mandante);
    const visitante = getV(parsed.visitante);
    if (mandante && visitante) {
      setEvento(`${mandante} x ${visitante}`);
    } else if (mandante) {
      setEvento(mandante);
    }
    // Data/hora
    const dh = getV(parsed.dataHora);
    if (dh) {
      const d = new Date(dh);
      if (!isNaN(d.getTime())) {
        // local datetime-local format
        const pad = (n: number) => String(n).padStart(2, "0");
        const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        setDataHora(local);
      }
    }
    // Odd / stake
    const odd = getV(parsed.odd);
    if (odd) setOddObtida(String(odd).replace(",", "."));
    const stk = getV(parsed.stake);
    if (stk) setStake(String(stk).replace(",", "."));
    // Bookmaker — tenta casar pelo nome (lê via cache para evitar dependência circular)
    const bmNome = (getV(parsed.bookmakerNome) || "").toString().toLowerCase().trim();
    if (bmNome) {
      const cachedBms =
        (queryClient.getQueryData<any[]>(["bookmaker-saldos", projetoId, true, null]) as any[] | undefined) ||
        (queryClient.getQueriesData<any[]>({ queryKey: ["bookmaker-saldos", projetoId] }).flatMap(([, v]) => v || [])) ||
        [];
      const match = cachedBms.find((b: any) => {
        const n = (b?.nome || "").toLowerCase();
        return n && (n.includes(bmNome) || bmNome.includes(n));
      });
      if (match) setBookmakerId(match.id);
    }
    // Liga
    const lg = getV(parsed.liga);
    if (lg) setLiga(String(lg));
    // Fair value (odd justa)
    const fv = getV(parsed.fairValue);
    if (fv) setFairValue(String(fv).replace(",", "."));
    // Extrai linha numérica da seleção (ex: "Karmine Corp Blue (+1.5)" → "+1.5")
    const sel = (getV(parsed.selecao) || "").toString();
    const lineMatch = sel.match(/\(?([+-]?\d+(?:\.\d+)?)\)?\s*$/);
    if (lineMatch) setLinha(lineMatch[1]);
    // Hints visuais (mercado bruto + aposta bruta para o usuário casar manualmente)
    setOcrHintMercado((getV(parsed.mercado) || "").toString() || null);
    setOcrHintAposta(sel || null);
  };

  const handleOcrImage = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Arquivo precisa ser uma imagem");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx. 10MB)");
      return;
    }
    setOcrLoading(true);
    try {
      const base64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke("parse-betting-slip", {
        body: { imageBase64: base64 },
      });
      if (error) throw error;
      if (!data?.success || !data?.data) throw new Error("Sem dados extraídos");
      applyOcrParsed(data.data);
      toast.success("Print lido — confira os campos");
    } catch (e: any) {
      console.error("[NovaEntrada OCR]", e);
      const msg = String(e?.message || "");
      if (msg.includes("429")) toast.error("Limite de IA atingido, tente em alguns segundos");
      else if (msg.includes("402")) toast.error("Créditos de IA esgotados");
      else toast.error("Não foi possível ler o print");
    } finally {
      setOcrLoading(false);
    }
  };

  // Paste image from clipboard while dialog open
  useEffect(() => {
    if (!open) return;
    const onPaste = (ev: ClipboardEvent) => {
      const items = ev.clipboardData?.items;
      if (!items) return;
      for (const it of Array.from(items)) {
        if (it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) {
            ev.preventDefault();
            handleOcrImage(f);
            return;
          }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ---------- Data ----------
  // Usa o hook canônico de saldos — mesmo componente/modelo dos outros formulários
  const { data: bookmakerSaldos = [] } = useBookmakerSaldosQuery({
    projetoId,
    enabled: open,
    includeZeroBalance: true,
  });
  const bookmakers = useMemo(
    () =>
      bookmakerSaldos
        .filter((bk) => !bk.has_pending_transactions)
        .map((bk) => ({
          id: bk.id,
          nome: bk.nome,
          parceiro_nome: bk.parceiro_nome,
          instance_identifier: bk.instance_identifier,
          moeda: bk.moeda,
          logo_url: bk.logo_url,
          saldo_operavel: bk.saldo_operavel,
          saldo_disponivel: bk.saldo_disponivel,
          saldo_freebet: bk.saldo_freebet,
          saldo_bonus: bk.saldo_bonus,
          bonus_rollover_started: bk.bonus_rollover_started,
        })),
    [bookmakerSaldos],
  );

  const { data: mercadosByCategoria = {}, isLoading: loadingMercados } = useMercadosBiblioteca(esporte);

  const categoriaOptions = useMemo(() => Object.keys(mercadosByCategoria), [mercadosByCategoria]);
  const objetosOptions = useMemo(
    () => (categoria ? mercadosByCategoria[categoria] || [] : []),
    [categoria, mercadosByCategoria],
  );

  // Reset cascade dependents when esporte or categoria changes
  useEffect(() => {
    setCategoria("");
    setMercadoSel(null);
    setFormato("");
    setDirecao("");
    setLinha("");
  }, [esporte]);

  useEffect(() => {
    setMercadoSel(null);
    setFormato("");
    setDirecao("");
    setLinha("");
  }, [categoria]);

  // Quando seleciona mercado, prefill linha placeholder
  useEffect(() => {
    if (!mercadoSel) return;
    if (mercadoSel.tem_linha && mercadoSel.linha_placeholder && mercadoSel.linha_placeholder !== "livre") {
      setLinha(mercadoSel.linha_placeholder);
    } else {
      setLinha("");
    }
    if (!mercadoSel.formato_opcoes || mercadoSel.formato_opcoes.length === 1) {
      setFormato(mercadoSel.formato_opcoes?.[0] || "");
    } else {
      setFormato("");
    }
    setDirecao("");
  }, [mercadoSel]);

  // Auto-ajustar moeda quando bookmaker muda
  useEffect(() => {
    if (!bookmakerId) return;
    const bm = bookmakers.find((b) => b.id === bookmakerId);
    if (bm?.moeda) setMoeda(bm.moeda);
  }, [bookmakerId, bookmakers]);

  // ---------- Derivados ----------
  const oddNum = Number(oddObtida) || null;
  const fairNum = Number(fairValue) || null;
  const stakeNum = Number(stake) || null;
  const linhaNum = linha && linha !== "livre" ? Number(linha) : null;
  const edge = calcEdge(oddNum, fairNum);

  const previewMercado = mercadoSel && direcao
    ? buildMercadoDisplay(
        mercadoSel.categoria,
        mercadoSel.objeto,
        formato || null,
        direcao,
        linha || null,
        mercadoSel.display_nome,
      )
    : "";

  // Snapshot da Cotação de Trabalho para conversão (compat. com motor multimoeda)
  const rateInfo = useMemo(() => {
    if (!moeda || moeda === "BRL") return { rate: 1, snapshot: 1 };
    const eff = getEffectiveRate(moeda);
    return { rate: eff.rate, snapshot: eff.rate };
  }, [moeda, getEffectiveRate]);

  const stakeBRL = useMemo(() => {
    if (!stakeNum) return null;
    return stakeNum * rateInfo.rate;
  }, [stakeNum, rateInfo]);

  // ---------- Submit ----------
  const canSubmit = !!(
    user?.id &&
    workspaceId &&
    bookmakerId &&
    evento.trim() &&
    mercadoSel &&
    direcao &&
    oddNum && oddNum > 1 &&
    stakeNum && stakeNum > 0 &&
    previewMercado
  );

  const handleClose = () => {
    if (saving) return;
    onOpenChange(false);
  };

  const handleReset = () => {
    setFonteEntrada(null);
    setLiga("");
    setEvento("");
    setCategoria("");
    setMercadoSel(null);
    setFormato("");
    setDirecao("");
    setLinha("");
    setBookmakerId("");
    setOddObtida("");
    setFairValue("");
    setStake("");
    setModelo("pre-jogo");
    setResultado("PENDENTE");
  };

  const handleSubmit = async () => {
    if (!canSubmit || !user?.id || !workspaceId || !mercadoSel) return;
    setSaving(true);

    try {
      const result = await criarAposta({
        projeto_id: projetoId,
        workspace_id: workspaceId,
        user_id: user.id,
        forma_registro: FORMA_REGISTRO.SIMPLES,
        estrategia,
        contexto_operacional: "NORMAL",
        fonte_saldo: "REAL",
        data_aposta: new Date(dataHora).toISOString(),
        evento: evento.trim(),
        esporte,
        mercado: previewMercado,
        bookmaker_id: bookmakerId,
        selecao: direcao,
        odd: oddNum!,
        stake: stakeNum!,
        stake_total: stakeNum!,
        moeda_operacao: moeda,
        is_multicurrency: moeda !== "BRL",
        cotacao_snapshot: rateInfo.snapshot,
        valor_brl_referencia: stakeBRL,
        fonte_entrada: fonteEntrada,
      });

      if (!result.success || !result.data?.id) {
        toast.error(result.error?.message || "Falha ao registrar entrada");
        setSaving(false);
        return;
      }

      const apostaId = result.data.id;

      // Aplicar campos analíticos (não-bloqueante para o motor financeiro)
      await aplicarCamposNovaEntrada(apostaId, {
        liga: liga.trim() || null,
        mercado_categoria: mercadoSel.categoria,
        mercado_objeto: mercadoSel.objeto,
        mercado_formato: formato || null,
        mercado_direcao: direcao,
        mercado_linha: linhaNum,
        mercado_display: previewMercado,
        fair_value: fairNum,
        edge_percentual: edge,
        modelo_aposta: modelo,
        is_novo_formulario: true,
      });

      // Se o usuário marcou um resultado diferente de Pendente, deixamos para
      // o fluxo padrão de liquidação (não disparamos aqui para preservar o
      // motor de eventos; ele liquida na lista existente).
      if (resultado !== "PENDENTE") {
        toast.info("Entrada criada como Pendente. Liquide pela lista de apostas para registrar o resultado.");
      } else {
        toast.success("Entrada registrada");
      }

      await queryClient.invalidateQueries({ queryKey: ["apostas-projeto", projetoId] });
      await queryClient.invalidateQueries({ queryKey: ["apostas_unificada"] });
      onCreated?.();
      handleReset();
      onOpenChange(false);
    } catch (err: any) {
      console.error("[NovaEntradaDialog] erro:", err);
      toast.error(err?.message || "Erro inesperado");
    } finally {
      setSaving(false);
    }
  };

  // ---------- Render ----------
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[480px] p-0 gap-0 bg-card border-border">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Nova Entrada
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal ml-1">
              {estrategia === "SUREBET" ? "Surebet" : "ValueBet"}
            </span>
          </DialogTitle>
          <DialogDescription className="text-[11px] text-muted-foreground">
            Formulário compacto com biblioteca de mercados, multi-moeda e edge ao vivo.
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 py-3 space-y-3 max-h-[75vh] overflow-y-auto">
          {/* OCR — upload de print + paste (Ctrl+V) */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleOcrImage(f);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={ocrLoading}
            className="w-full h-8 text-[11px] border-primary/40 text-primary hover:bg-primary/10"
            onClick={() => fileInputRef.current?.click()}
            title="Faça upload ou cole (Ctrl+V) um print do bilhete"
          >
            {ocrLoading ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Lendo print…</>
            ) : (
              <><ScanText className="h-3.5 w-3.5 mr-1.5" /> Ler print (OCR) — ou cole com Ctrl+V</>
            )}
          </Button>

          {/* Fonte de entrada */}
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Fonte da entrada</Label>
            <FonteEntradaSelector
              workspaceId={workspaceId}
              value={fonteEntrada}
              onChange={setFonteEntrada}
            />
          </div>

          {/* Esporte + Liga */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Esporte</Label>
              <Select value={esporte} onValueChange={setEsporte}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ESPORTES_BIBLIOTECA.map((e) => (
                    <SelectItem key={e.value} value={e.value} className="text-xs">{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Liga</Label>
              <Input value={liga} onChange={(e) => setLiga(e.target.value)} className="h-8 text-xs" placeholder="Ex: Premier League" />
            </div>
          </div>

          {/* Evento */}
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Evento</Label>
            <Input value={evento} onChange={(e) => setEvento(e.target.value)} className="h-8 text-xs" placeholder="Time 1 vs Time 2" />
          </div>

          {/* Cascata Mercado */}
          <div className="space-y-2 p-2.5 rounded-md bg-muted/20 border border-border/40">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <span>Mercado</span>
              {loadingMercados && <Loader2 className="h-3 w-3 animate-spin" />}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent>
                  {categoriaOptions.map((c) => (
                    <SelectItem key={c} value={c} className="text-xs capitalize">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={mercadoSel?.id || ""}
                onValueChange={(id) => {
                  const m = objetosOptions.find((o) => o.id === id) || null;
                  setMercadoSel(m);
                }}
                disabled={!categoria}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Mercado" /></SelectTrigger>
                <SelectContent>
                  {objetosOptions.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">{m.display_nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {mercadoSel && (mercadoSel.formato_opcoes?.length || 0) > 1 && (
              <Select value={formato} onValueChange={setFormato}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Formato" /></SelectTrigger>
                <SelectContent>
                  {(mercadoSel.formato_opcoes || []).map((f) => (
                    <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Select value={direcao} onValueChange={setDirecao} disabled={!mercadoSel}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Direção" /></SelectTrigger>
                <SelectContent>
                  {(mercadoSel?.direcao_opcoes || []).map((d) => (
                    <SelectItem key={d} value={d} className="text-xs">{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {mercadoSel?.tem_linha ? (
                <Input
                  value={linha}
                  onChange={(e) => setLinha(e.target.value)}
                  className="h-8 text-xs"
                  placeholder={mercadoSel.linha_placeholder || "Linha"}
                  inputMode="decimal"
                />
              ) : (
                <div className="h-8" />
              )}
            </div>

            {previewMercado && (
              <div className="text-[11px] text-foreground/80 px-1 pt-0.5">
                <span className="text-muted-foreground/70 mr-1">›</span>
                {previewMercado}
              </div>
            )}
          </div>

          {/* Casa de apostas */}
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Casa de apostas</Label>
            <Select value={bookmakerId} onValueChange={setBookmakerId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar casa" /></SelectTrigger>
              <SelectContent>
                {bookmakers.map((b) => (
                  <SelectItem key={b.id} value={b.id} className="text-xs">
                    {b.nome} <span className="text-muted-foreground ml-1">({b.moeda})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Moeda + Odd + Fair + Edge */}
          <div className="grid grid-cols-4 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Moeda</Label>
              <Select value={moeda} onValueChange={setMoeda}>
                <SelectTrigger className="h-8 text-xs px-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MOEDAS_NOVA_ENTRADA.map((m) => (
                    <SelectItem key={m.code} value={m.code} className="text-xs">{m.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Odd</Label>
              <Input value={oddObtida} onChange={(e) => setOddObtida(e.target.value)} className="h-8 text-xs" inputMode="decimal" placeholder="2.00" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Fair</Label>
              <Input value={fairValue} onChange={(e) => setFairValue(e.target.value)} className="h-8 text-xs" inputMode="decimal" placeholder="1.85" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Edge</Label>
              <div
                className={cn(
                  "h-8 px-2 rounded-md border bg-background flex items-center text-xs font-semibold",
                  edge == null && "text-muted-foreground/50 border-border/40",
                  edge != null && edge > 0 && "text-emerald-500 border-emerald-500/30",
                  edge != null && edge < 0 && "text-red-500 border-red-500/30",
                  edge != null && edge === 0 && "text-muted-foreground border-border",
                )}
              >
                {edge == null ? "—" : `${edge >= 0 ? "+" : ""}${edge.toFixed(2)}%`}
              </div>
            </div>
          </div>

          {/* Stake + DataHora */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">
                Stake {moeda !== "BRL" && stakeBRL != null && (
                  <span className="text-muted-foreground/60">≈ R$ {stakeBRL.toFixed(2)}</span>
                )}
              </Label>
              <Input value={stake} onChange={(e) => setStake(e.target.value)} className="h-8 text-xs" inputMode="decimal" placeholder="0,00" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Data / Hora</Label>
              <Input type="datetime-local" value={dataHora} onChange={(e) => setDataHora(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>

          {/* CLV / Odd fechamento (futuro) */}
          <TooltipProvider>
            <div className="grid grid-cols-2 gap-2 opacity-50">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Odd fechamento</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Input disabled placeholder="via API Pinnacle" className="h-8 text-xs cursor-not-allowed" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-[11px] max-w-[240px]">
                    Em breve — preenchido automaticamente via API Pinnacle após o fechamento do mercado.
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">CLV %</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Input disabled placeholder="automático" className="h-8 text-xs cursor-not-allowed" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-[11px] max-w-[240px]">
                    Calculado quando a odd de fechamento estiver disponível: (odd_obtida / odd_fechamento − 1) × 100.
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </TooltipProvider>

          {/* Modelo + Resultado */}
          <div className="grid grid-cols-[auto_1fr] gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Modelo</Label>
              <Select value={modelo} onValueChange={(v) => setModelo(v as "pre-jogo" | "ao-vivo")}>
                <SelectTrigger className="h-8 text-xs w-[110px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pre-jogo" className="text-xs">Pré-jogo</SelectItem>
                  <SelectItem value="ao-vivo" className="text-xs">Ao vivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Resultado</Label>
              <div className="flex flex-wrap gap-1">
                {RESULTADOS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setResultado(r.value)}
                    className={cn(
                      "px-2 h-7 rounded-md border text-[11px] transition-colors",
                      resultado === r.value ? r.className + " bg-foreground/[0.04]" : "border-border/40 text-muted-foreground/60 hover:bg-muted/30",
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border/50 flex justify-end gap-2 bg-muted/10">
          <Button variant="ghost" size="sm" onClick={handleClose} disabled={saving} className="h-8 text-xs">
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
            className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Registrar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}