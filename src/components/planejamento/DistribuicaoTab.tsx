import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBookmakerGrupos } from "@/hooks/useBookmakerGrupos";
import {
  REGRA_CASA_LABELS,
  REGRA_IP_LABELS,
  RegraCasa,
  RegraIp,
} from "@/hooks/useDistribuicaoPlanos";
import {
  usePlanningPerfis,
  usePlanningCasas,
} from "@/hooks/usePlanningData";
import {
  GrupoConfig,
  gerarDistribuicao,
  DistribuicaoCelula,
} from "@/lib/distribuicao-engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Save, Wand2, AlertTriangle, Users, FolderOpen, CalendarRange } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useExchangeRates } from "@/contexts/ExchangeRatesContext";
import { useGerarAgendaMutation, useAgendaPlano } from "@/hooks/useAgendaPlano";
import { useDistribuicaoPlanos, useDistribuicaoPlanoDetalhe } from "@/hooks/useDistribuicaoPlanos";
import type { CelulaParaAgendar } from "@/lib/agenda-engine";

interface CatalogoItem {
  id: string;
  nome: string;
  logo_url: string | null;
  moeda_padrao: string;
}

export default function DistribuicaoTab() {
  const { workspaceId } = useAuth();
  const { grupos, membros, isLoading: gruposLoading } = useBookmakerGrupos();
  const { data: perfis = [] } = usePlanningPerfis();
  const { data: casasPlanejamento = [] } = usePlanningCasas();
  const { createPlano } = useDistribuicaoPlanos();
  const { convertToBRL, cotacaoUSD } = useExchangeRates();
  const gerarAgendaMut = useGerarAgendaMutation();

  const [planoNome, setPlanoNome] = useState("");
  const [metaDiariaUsd, setMetaDiariaUsd] = useState<string>("");
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [planoSalvoId, setPlanoSalvoId] = useState<string | null>(null);
  const { data: detalheSalvo } = useDistribuicaoPlanoDetalhe(planoSalvoId);
  const [selectedPerfilIds, setSelectedPerfilIds] = useState<string[]>([]);
  const [grupoConfigs, setGrupoConfigs] = useState<
    Array<{
      grupo_id: string;
      regra_casa: RegraCasa;
      regra_ip: RegraIp;
      casas_por_cpf: number | null;
    }>
  >([]);
  const [resultado, setResultado] = useState<ReturnType<typeof gerarDistribuicao> | null>(null);

  // Conversão moeda nativa → USD (via BRL)
  const toUsd = (valor: number, moeda: string): number => {
    if (!valor) return 0;
    const brl = convertToBRL(valor, moeda);
    return cotacaoUSD > 0 ? brl / cotacaoUSD : 0;
  };

  // Universo de catálogos visíveis: APENAS casas adicionadas ao Planejamento
  const planejamentoCatalogoSet = useMemo(() => {
    const s = new Set<string>();
    casasPlanejamento.forEach((c) => s.add(c.bookmaker_catalogo_id));
    return s;
  }, [casasPlanejamento]);

  // Catálogo (nome/logo) para todas as casas dos grupos
  const catalogoIds = useMemo(() => {
    const ids = new Set<string>();
    membros.forEach((m) => ids.add(m.bookmaker_catalogo_id));
    return Array.from(ids);
  }, [membros]);

  const { data: catalogo = [] } = useQuery({
    queryKey: ["catalogo-distribuicao", catalogoIds.sort().join(",")],
    queryFn: async (): Promise<CatalogoItem[]> => {
      if (catalogoIds.length === 0) return [];
      const { data, error } = await supabase
        .from("bookmakers_catalogo")
        .select("id, nome, logo_url, moeda_padrao")
        .in("id", catalogoIds);
      if (error) throw error;
      return (data ?? []) as CatalogoItem[];
    },
    enabled: catalogoIds.length > 0,
  });

  const catalogoMap = useMemo(() => {
    const m = new Map<string, CatalogoItem>();
    catalogo.forEach((c) => m.set(c.id, c));
    return m;
  }, [catalogo]);

  const grupoMap = useMemo(() => {
    const m = new Map<string, { id: string; nome: string; cor: string }>();
    grupos.forEach((g) => m.set(g.id, g));
    return m;
  }, [grupos]);

  // Membros de cada grupo, FILTRADOS para apenas os que estão no Planejamento
  const grupoCatalogoMap = useMemo(() => {
    const m = new Map<string, string[]>();
    membros.forEach((mb) => {
      if (!planejamentoCatalogoSet.has(mb.bookmaker_catalogo_id)) return;
      if (!m.has(mb.grupo_id)) m.set(mb.grupo_id, []);
      m.get(mb.grupo_id)!.push(mb.bookmaker_catalogo_id);
    });
    return m;
  }, [membros, planejamentoCatalogoSet]);

  // Mapa perfil_id (planning) -> dados (nome + cor)
  const perfilInfo = (id: string): { nome: string; cor: string; isGenerico: boolean } => {
    const p = perfis.find((x) => x.id === id);
    if (!p) return { nome: id.slice(0, 6), cor: "#6366f1", isGenerico: false };
    const nome = p.label_custom?.trim() || p.parceiro?.nome || p.nome_generico || "—";
    return { nome, cor: p.cor, isGenerico: !p.parceiro_id };
  };
  const perfilLabel = (id: string) => perfilInfo(id).nome;

  const togglePerfil = (id: string) => {
    setSelectedPerfilIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  };

  const addGrupo = (grupoId: string) => {
    if (grupoConfigs.some((g) => g.grupo_id === grupoId)) return;
    setGrupoConfigs((cur) => [
      ...cur,
      {
        grupo_id: grupoId,
        regra_casa: "NAO_REPETIR_NO_CPF",
        regra_ip: "IP_COMPARTILHADO_GRUPO",
        casas_por_cpf: null,
      },
    ]);
  };

  const removeGrupo = (grupoId: string) => {
    setGrupoConfigs((cur) => cur.filter((g) => g.grupo_id !== grupoId));
  };

  const updateGrupoConfig = (
    grupoId: string,
    patch: Partial<(typeof grupoConfigs)[number]>
  ) => {
    setGrupoConfigs((cur) =>
      cur.map((g) => (g.grupo_id === grupoId ? { ...g, ...patch } : g))
    );
  };

  const handleGerar = () => {
    const configs: GrupoConfig[] = grupoConfigs.map((g) => ({
      grupo_id: g.grupo_id,
      grupo_nome: grupoMap.get(g.grupo_id)?.nome ?? "Grupo",
      regra_casa: g.regra_casa,
      regra_ip: g.regra_ip,
      casas_por_cpf: g.casas_por_cpf,
      catalogo_ids: grupoCatalogoMap.get(g.grupo_id) ?? [],
    }));
    // O engine espera "parceiroIds"; aqui passamos os IDs dos PERFIS de planejamento
    setResultado(gerarDistribuicao(selectedPerfilIds, configs));
  };

  const handleSalvar = () => {
    if (!resultado || resultado.celulas.length === 0) return;
    if (!planoNome.trim()) return;
    // Mapeia perfil_id (planning) -> parceiro_id real (quando houver).
    // Perfis genéricos salvam só com perfil_planejamento_id (rascunho).
    const perfilToParceiro = new Map<string, string | null>();
    perfis.forEach((p) => perfilToParceiro.set(p.id, p.parceiro_id ?? null));

    const parceiroIds = selectedPerfilIds
      .map((pid) => perfilToParceiro.get(pid) ?? null)
      .filter((x): x is string => !!x);

    createPlano.mutate(
      {
        nome: planoNome.trim(),
        parceiro_ids: parceiroIds,
        grupos: grupoConfigs.map((g, idx) => ({
          grupo_id: g.grupo_id,
          regra_casa: g.regra_casa,
          regra_ip: g.regra_ip,
          casas_por_cpf: g.casas_por_cpf,
          ordem: idx,
        })),
        celulas: resultado.celulas.map((c, idx) => ({
          grupo_id: c.grupo_id,
          // c.parceiro_id no engine = id do perfil de planejamento
          perfil_planejamento_id: c.parceiro_id,
          parceiro_id: perfilToParceiro.get(c.parceiro_id) ?? null,
          bookmaker_catalogo_id: c.bookmaker_catalogo_id,
          ip_slot: c.ip_slot,
          ordem: idx,
        })),
      },
      {
        onSuccess: (plano: any) => {
          if (plano?.id) setPlanoSalvoId(plano.id);
        },
      }
    );
  };

  // Gera agenda usando o plano salvo (precisa estar salvo pra ter celula_id reais)
  const handleGerarAgenda = () => {
    if (!planoSalvoId || !detalheSalvo) {
      toast.error("Salve o plano antes de gerar a agenda.");
      return;
    }
    const grupoModoMap = new Map(grupos.map((g) => [g.id, g.modo_execucao]));
    const grupoCelulaMap = new Map(detalheSalvo.grupos.map((g) => [g.id, g.grupo_id]));
    const membroMap = new Map<string, { sugerido: number; moeda: string | null }>();
    membros.forEach((m) => {
      membroMap.set(`${m.grupo_id}::${m.bookmaker_catalogo_id}`, {
        sugerido: Number(m.deposito_sugerido) || 0,
        moeda: m.deposito_moeda,
      });
    });

    const celulasParaAgendar: CelulaParaAgendar[] = detalheSalvo.celulas
      .map((c) => {
        const grupoOriginalId = grupoCelulaMap.get(c.plano_grupo_id);
        if (!grupoOriginalId) return null;
        const cat = catalogoMap.get(c.bookmaker_catalogo_id);
        const memb = membroMap.get(`${grupoOriginalId}::${c.bookmaker_catalogo_id}`);
        const moeda = memb?.moeda || cat?.moeda_padrao || "BRL";
        return {
          celula_id: c.id,
          grupo_id: grupoOriginalId,
          parceiro_id: c.parceiro_id,
          bookmaker_catalogo_id: c.bookmaker_catalogo_id,
          ip_slot: c.ip_slot ?? "",
          ordem: c.ordem,
          modo_execucao: grupoModoMap.get(grupoOriginalId) ?? "AGENDADO",
          deposito_sugerido: memb?.sugerido ?? 0,
          moeda,
        };
      })
      .filter((x): x is CelulaParaAgendar => !!x);

    gerarAgendaMut.mutate({
      planoId: planoSalvoId,
      celulas: celulasParaAgendar,
      startDate,
      metaDiariaUsd: metaDiariaUsd ? Number(metaDiariaUsd) : null,
      toUsd,
    });
  };

  const selectedGenericosCount = useMemo(
    () => selectedPerfilIds.filter((id) => !perfis.find((p) => p.id === id)?.parceiro_id).length,
    [selectedPerfilIds, perfis]
  );

  const gruposDisponiveis = grupos.filter(
    (g) => !grupoConfigs.some((c) => c.grupo_id === g.id)
  );

  const matrizAgrupada = useMemo(() => {
    if (!resultado) return null;
    const map = new Map<string, Map<string, DistribuicaoCelula[]>>();
    resultado.celulas.forEach((c) => {
      if (!map.has(c.grupo_id)) map.set(c.grupo_id, new Map());
      const inner = map.get(c.grupo_id)!;
      if (!inner.has(c.parceiro_id)) inner.set(c.parceiro_id, []);
      inner.get(c.parceiro_id)!.push(c);
    });
    return map;
  }, [resultado]);

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">
        Use os perfis e os grupos de casas já cadastrados. Cada grupo é distribuído de acordo com a
        regra escolhida. Apenas casas que estão no Planejamento entram na distribuição.
      </div>

      {/* Nome */}
      <div>
        <Label htmlFor="plano-nome" className="text-xs">
          Nome do plano (necessário para salvar)
        </Label>
        <Input
          id="plano-nome"
          value={planoNome}
          onChange={(e) => setPlanoNome(e.target.value)}
          placeholder="Ex: Distribuição Tier 1 — Abril"
          className="h-8 text-sm"
        />
      </div>

      <Separator />

      {/* Perfis */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4" /> Perfis ({selectedPerfilIds.length} de {perfis.length})
          </Label>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setSelectedPerfilIds(perfis.filter((p) => p.is_active).map((p) => p.id))}
            >
              Todos ativos
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setSelectedPerfilIds([])}
            >
              Limpar
            </Button>
          </div>
        </div>
        <ScrollArea className="h-32 border rounded-md p-2">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
            {perfis.map((p) => {
              const nome = p.label_custom?.trim() || p.parceiro?.nome || p.nome_generico || "—";
              const isGenerico = !p.parceiro_id;
              return (
                <label
                  key={p.id}
                  className="flex items-center gap-2 cursor-pointer text-sm hover:bg-muted/50 px-1.5 py-1 rounded"
                >
                  <Checkbox
                    checked={selectedPerfilIds.includes(p.id)}
                    onCheckedChange={() => togglePerfil(p.id)}
                  />
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: p.cor }}
                    title={isGenerico ? "Perfil genérico" : "Perfil real"}
                  />
                  <span className="truncate text-xs">{nome}</span>
                  {isGenerico && (
                    <Badge variant="outline" className="text-[9px] h-4 shrink-0">gen</Badge>
                  )}
                  {!p.is_active && (
                    <Badge variant="outline" className="text-[9px] h-4">off</Badge>
                  )}
                </label>
              );
            })}
            {perfis.length === 0 && (
              <p className="text-xs text-muted-foreground col-span-full text-center py-4">
                Nenhum perfil pré-selecionado. Adicione perfis na aba "Perfis".
              </p>
            )}
          </div>
        </ScrollArea>
      </div>

      <Separator />

      {/* Grupos */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="flex items-center gap-2 text-sm">
            <FolderOpen className="h-4 w-4" /> Grupos no plano
          </Label>
          <Select onValueChange={addGrupo} value="">
            <SelectTrigger className="w-56 h-8 text-xs">
              <SelectValue
                placeholder={
                  gruposDisponiveis.length === 0
                    ? "Todos já adicionados"
                    : "Adicionar grupo..."
                }
              />
            </SelectTrigger>
            <SelectContent>
              {gruposDisponiveis.map((g) => {
                const total = (grupoCatalogoMap.get(g.id) ?? []).length;
                return (
                  <SelectItem key={g.id} value={g.id}>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: g.cor }}
                      />
                      {g.nome}
                      <span className="text-xs text-muted-foreground">
                        ({total} casas no planejamento)
                      </span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {grupoConfigs.length === 0 ? (
          <div className="border rounded-md p-4 text-center text-xs text-muted-foreground">
            {gruposLoading
              ? "Carregando grupos..."
              : "Adicione pelo menos um grupo para gerar a distribuição."}
          </div>
        ) : (
          <div className="space-y-2">
            {grupoConfigs.map((cfg) => {
              const g = grupoMap.get(cfg.grupo_id);
              const totalCasas = (grupoCatalogoMap.get(cfg.grupo_id) ?? []).length;
              return (
                <Card key={cfg.grupo_id} className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ background: g?.cor ?? "#6366f1" }}
                      />
                      <span className="font-medium text-sm">{g?.nome ?? "Grupo"}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {totalCasas} casas no planej.
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => removeGrupo(cfg.grupo_id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Distribuição
                      </Label>
                      <Select
                        value={cfg.regra_casa}
                        onValueChange={(v) =>
                          updateGrupoConfig(cfg.grupo_id, { regra_casa: v as RegraCasa })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(REGRA_CASA_LABELS) as RegraCasa[]).map((k) => (
                            <SelectItem key={k} value={k}>
                              {REGRA_CASA_LABELS[k]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        IP
                      </Label>
                      <Select
                        value={cfg.regra_ip}
                        onValueChange={(v) =>
                          updateGrupoConfig(cfg.grupo_id, { regra_ip: v as RegraIp })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(REGRA_IP_LABELS) as RegraIp[]).map((k) => (
                            <SelectItem key={k} value={k}>
                              {REGRA_IP_LABELS[k]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Casas/CPF (vazio = todas)
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        max={totalCasas}
                        value={cfg.casas_por_cpf ?? ""}
                        onChange={(e) =>
                          updateGrupoConfig(cfg.grupo_id, {
                            casas_por_cpf: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                        placeholder={String(totalCasas)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Separator />

      {/* Aviso sobre genéricos */}
      {selectedGenericosCount > 0 && (
        <div className="flex items-start gap-2 text-[11px] rounded-md p-2 bg-warning/10 text-warning-foreground border border-warning/30">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            {selectedGenericosCount} perfil(is) genérico(s) selecionado(s). Você pode visualizar a distribuição,
            mas para <strong>salvar o plano</strong> é preciso vincular cada genérico a um parceiro real
            (na aba "Perfis", botão <em>Vincular</em>).
          </span>
        </div>
      )}

      {/* Checklist do que falta para Salvar / Gerar agenda */}
      {(() => {
        const faltaSalvar: string[] = [];
        if (!resultado || resultado.celulas.length === 0) faltaSalvar.push('Clique em "Gerar distribuição"');
        if (!planoNome.trim()) faltaSalvar.push("Preencha o nome do plano (campo no topo)");
        if (selectedGenericosCount > 0)
          faltaSalvar.push(`Vincule os ${selectedGenericosCount} perfil(is) genérico(s) a parceiros reais`);

        const faltaAgenda: string[] = [];
        if (!planoSalvoId) faltaAgenda.push("Salve o plano antes de gerar a agenda");

        if (faltaSalvar.length === 0 && faltaAgenda.length === 0) return null;
        return (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-2.5 text-[11px] space-y-1.5">
            {faltaSalvar.length > 0 && (
              <div>
                <div className="font-semibold text-foreground mb-0.5">Para salvar o plano falta:</div>
                <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                  {faltaSalvar.map((m) => <li key={m}>{m}</li>)}
                </ul>
              </div>
            )}
            {faltaAgenda.length > 0 && faltaSalvar.length === 0 && (
              <div>
                <div className="font-semibold text-foreground mb-0.5">Para gerar a agenda falta:</div>
                <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                  {faltaAgenda.map((m) => <li key={m}>{m}</li>)}
                </ul>
              </div>
            )}
          </div>
        );
      })()}

      {/* Ações */}
      <div className="flex flex-wrap gap-2 justify-end">
        <Button
          size="sm"
          onClick={handleGerar}
          disabled={selectedPerfilIds.length === 0 || grupoConfigs.length === 0}
        >
          <Wand2 className="h-3.5 w-3.5 mr-1" />
          Gerar distribuição
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleSalvar}
          disabled={
            !resultado ||
            resultado.celulas.length === 0 ||
            !planoNome.trim() ||
            createPlano.isPending ||
            selectedGenericosCount > 0
          }
          title={
            !resultado || resultado.celulas.length === 0
              ? 'Clique em "Gerar distribuição" primeiro'
              : !planoNome.trim()
              ? "Preencha o nome do plano no topo"
              : selectedGenericosCount > 0
              ? "Vincule os perfis genéricos a parceiros reais antes de salvar"
              : undefined
          }
        >
          <Save className="h-3.5 w-3.5 mr-1" />
          {createPlano.isPending ? "Salvando..." : "Salvar plano"}
        </Button>
      </div>

      {/* Agenda automática (após salvar) */}
      <Card className="p-3 space-y-3 border-primary/30 bg-primary/5">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-primary" />
          <div className="text-sm font-semibold">Agenda automática (calendário)</div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          O motor distribui os depósitos ao longo dos dias respeitando a meta diária em USD,
          o modo de execução do grupo (agendado vs sob demanda) e evita CPF repetido em sequência.
          Salve o plano antes para usar.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div>
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Início
            </Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Meta diária (USD)
            </Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={metaDiariaUsd}
              onChange={(e) => setMetaDiariaUsd(e.target.value)}
              placeholder="ex: 500"
              className="h-8 text-xs"
            />
          </div>
          <div className="flex items-end">
            <Button
              size="sm"
              className="w-full"
              onClick={handleGerarAgenda}
              disabled={!planoSalvoId || gerarAgendaMut.isPending}
              title={!planoSalvoId ? "Salve o plano primeiro" : undefined}
            >
              <CalendarRange className="h-3.5 w-3.5 mr-1" />
              {gerarAgendaMut.isPending ? "Gerando..." : "Gerar agenda"}
            </Button>
          </div>
        </div>
        {planoSalvoId && (
          <div className="text-[10px] text-muted-foreground">
            Plano salvo. As células agendadas aparecerão no calendário do Planejamento.
          </div>
        )}
      </Card>

      {/* Resultado */}
      {resultado && (
        <Card className="p-3 space-y-3">
          <div className="text-xs font-medium">Resultado</div>

          {resultado.warnings.length > 0 && (
            <div className="space-y-1">
              {resultado.warnings.map((w, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 text-xs rounded-md p-2 ${
                    w.level === "error"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-warning/10 text-warning-foreground"
                  }`}
                >
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{w.message}</span>
                </div>
              ))}
            </div>
          )}

          {matrizAgrupada && matrizAgrupada.size > 0 && (
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {Array.from(matrizAgrupada.entries()).map(([grupoId, perCpf]) => {
                const g = grupoMap.get(grupoId);
                return (
                  <div key={grupoId}>
                    <h4 className="font-medium text-xs mb-1.5 flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: g?.cor ?? "#6366f1" }}
                      />
                      {g?.nome ?? "Grupo"}
                    </h4>
                    <div className="border rounded-md overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left p-1.5 font-medium">CPF</th>
                            <th className="text-left p-1.5 font-medium">Casas</th>
                            <th className="text-left p-1.5 font-medium">IPs</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from(perCpf.entries()).map(([pid, items]) => {
                            const ipSet = new Set(items.map((i) => i.ip_slot));
                            const info = perfilInfo(pid);
                            return (
                              <tr key={pid} className="border-b last:border-0">
                                <td className="p-1.5 font-medium">
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className="h-2.5 w-2.5 rounded-full shrink-0"
                                      style={{ backgroundColor: info.cor }}
                                    />
                                    <span className="truncate">{info.nome}</span>
                                    {info.isGenerico && (
                                      <Badge variant="outline" className="text-[9px] h-4 shrink-0">gen</Badge>
                                    )}
                                  </div>
                                </td>
                                <td className="p-1.5">
                                  <div className="flex flex-wrap gap-1">
                                    {items.map((c, idx) => {
                                      const cat = catalogoMap.get(c.bookmaker_catalogo_id);
                                      return (
                                        <Badge
                                          key={idx}
                                          variant="secondary"
                                          className="text-[10px] h-4"
                                        >
                                          {cat?.nome ?? c.bookmaker_catalogo_id.slice(0, 6)}
                                        </Badge>
                                      );
                                    })}
                                  </div>
                                </td>
                                <td className="p-1.5 text-[10px] text-muted-foreground">
                                  {ipSet.size === 1
                                    ? "1 IP compartilhado"
                                    : `${ipSet.size} IPs distintos`}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
