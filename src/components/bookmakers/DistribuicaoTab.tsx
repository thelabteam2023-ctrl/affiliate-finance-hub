import { useMemo, useState } from "react";
import { useTabWorkspace } from "@/hooks/useTabWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useBookmakerGrupos } from "@/hooks/useBookmakerGrupos";
import {
  REGRA_CASA_LABELS,
  REGRA_IP_LABELS,
  RegraCasa,
  RegraIp,
  useDistribuicaoPlanos,
} from "@/hooks/useDistribuicaoPlanos";
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
import { Plus, Trash2, Save, Wand2, AlertTriangle, Users, FolderOpen } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface Parceiro {
  id: string;
  nome: string;
  status: string;
}

interface CatalogoItem {
  id: string;
  nome: string;
  logo_url: string | null;
}

export default function DistribuicaoTab() {
  const { workspaceId } = useTabWorkspace();
  const { grupos, membros, isLoading: gruposLoading } = useBookmakerGrupos();
  const { createPlano } = useDistribuicaoPlanos();

  const [planoNome, setPlanoNome] = useState("");
  const [selectedParceiros, setSelectedParceiros] = useState<string[]>([]);
  const [grupoConfigs, setGrupoConfigs] = useState<
    Array<{
      grupo_id: string;
      regra_casa: RegraCasa;
      regra_ip: RegraIp;
      casas_por_cpf: number | null;
    }>
  >([]);
  const [resultado, setResultado] = useState<ReturnType<typeof gerarDistribuicao> | null>(null);

  // Parceiros do workspace
  const { data: parceiros = [] } = useQuery({
    queryKey: ["parceiros-distribuicao", workspaceId],
    queryFn: async (): Promise<Parceiro[]> => {
      if (!workspaceId) return [];
      const { data, error } = await supabase
        .from("parceiros")
        .select("id, nome, status")
        .eq("workspace_id", workspaceId)
        .eq("is_caixa_operacional", false)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!workspaceId,
  });

  // Catálogo (para mostrar nomes/logos)
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
        .select("id, nome, logo_url")
        .in("id", catalogoIds);
      if (error) throw error;
      return data ?? [];
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

  const parceiroMap = useMemo(() => {
    const m = new Map<string, Parceiro>();
    parceiros.forEach((p) => m.set(p.id, p));
    return m;
  }, [parceiros]);

  const grupoCatalogoMap = useMemo(() => {
    const m = new Map<string, string[]>();
    membros.forEach((mb) => {
      if (!m.has(mb.grupo_id)) m.set(mb.grupo_id, []);
      m.get(mb.grupo_id)!.push(mb.bookmaker_catalogo_id);
    });
    return m;
  }, [membros]);

  const toggleParceiro = (id: string) => {
    setSelectedParceiros((cur) =>
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
    setResultado(gerarDistribuicao(selectedParceiros, configs));
  };

  const handleSalvar = () => {
    if (!resultado || resultado.celulas.length === 0) return;
    if (!planoNome.trim()) {
      return;
    }
    createPlano.mutate({
      nome: planoNome.trim(),
      parceiro_ids: selectedParceiros,
      grupos: grupoConfigs.map((g, idx) => ({
        grupo_id: g.grupo_id,
        regra_casa: g.regra_casa,
        regra_ip: g.regra_ip,
        casas_por_cpf: g.casas_por_cpf,
        ordem: idx,
      })),
      celulas: resultado.celulas.map((c, idx) => ({
        grupo_id: c.grupo_id,
        parceiro_id: c.parceiro_id,
        bookmaker_catalogo_id: c.bookmaker_catalogo_id,
        ip_slot: c.ip_slot,
        ordem: idx,
      })),
    });
  };

  const gruposDisponiveis = grupos.filter(
    (g) => !grupoConfigs.some((c) => c.grupo_id === g.id)
  );

  // Matriz para visualização: agrupa por (grupo, parceiro)
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            Distribuição de Casas por CPF
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Selecione os perfis e os grupos de casas. Para cada grupo, defina como as casas devem
            ser distribuídas e como o IP deve ser usado.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 1. Nome */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="plano-nome">Nome do plano (opcional para gerar)</Label>
              <Input
                id="plano-nome"
                value={planoNome}
                onChange={(e) => setPlanoNome(e.target.value)}
                placeholder="Ex: Distribuição Tier 1 — Abril"
              />
            </div>
          </div>

          <Separator />

          {/* 2. Perfis */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <Label className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4" /> Perfis (CPFs) — {selectedParceiros.length} selecionados
              </Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedParceiros(parceiros.map((p) => p.id))}
                >
                  Todos
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedParceiros([])}
                >
                  Limpar
                </Button>
              </div>
            </div>
            <ScrollArea className="h-40 border rounded-md p-3">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {parceiros.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 cursor-pointer text-sm hover:bg-muted/50 px-2 py-1 rounded"
                  >
                    <Checkbox
                      checked={selectedParceiros.includes(p.id)}
                      onCheckedChange={() => toggleParceiro(p.id)}
                    />
                    <span className="truncate">{p.nome}</span>
                    {p.status !== "ativo" && (
                      <Badge variant="outline" className="text-xs">
                        {p.status}
                      </Badge>
                    )}
                  </label>
                ))}
                {parceiros.length === 0 && (
                  <p className="text-sm text-muted-foreground col-span-full text-center py-4">
                    Nenhum parceiro encontrado.
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>

          <Separator />

          {/* 3. Grupos */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <Label className="flex items-center gap-2 text-base">
                <FolderOpen className="h-4 w-4" /> Grupos no plano
              </Label>
              <Select onValueChange={addGrupo} value="">
                <SelectTrigger className="w-64">
                  <SelectValue
                    placeholder={
                      gruposDisponiveis.length === 0
                        ? "Todos os grupos já adicionados"
                        : "Adicionar grupo..."
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {gruposDisponiveis.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: g.cor }}
                        />
                        {g.nome}
                        <span className="text-xs text-muted-foreground">
                          ({(grupoCatalogoMap.get(g.id) ?? []).length} casas)
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {grupoConfigs.length === 0 ? (
              <div className="border rounded-md p-6 text-center text-sm text-muted-foreground">
                {gruposLoading
                  ? "Carregando grupos..."
                  : "Adicione pelo menos um grupo para gerar a distribuição."}
              </div>
            ) : (
              <div className="space-y-3">
                {grupoConfigs.map((cfg) => {
                  const g = grupoMap.get(cfg.grupo_id);
                  const totalCasas = (grupoCatalogoMap.get(cfg.grupo_id) ?? []).length;
                  return (
                    <Card key={cfg.grupo_id}>
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-3 w-3 rounded-full"
                              style={{ background: g?.cor ?? "#6366f1" }}
                            />
                            <span className="font-medium">{g?.nome ?? "Grupo"}</span>
                            <Badge variant="outline">{totalCasas} casas</Badge>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeGrupo(cfg.grupo_id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <Label className="text-xs">Distribuição entre CPFs</Label>
                            <Select
                              value={cfg.regra_casa}
                              onValueChange={(v) =>
                                updateGrupoConfig(cfg.grupo_id, { regra_casa: v as RegraCasa })
                              }
                            >
                              <SelectTrigger>
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
                            <Label className="text-xs">Uso de IP</Label>
                            <Select
                              value={cfg.regra_ip}
                              onValueChange={(v) =>
                                updateGrupoConfig(cfg.grupo_id, { regra_ip: v as RegraIp })
                              }
                            >
                              <SelectTrigger>
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
                            <Label className="text-xs">Casas por CPF (vazio = todas)</Label>
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
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          <Separator />

          {/* 4. Ações */}
          <div className="flex flex-wrap gap-2 justify-end">
            <Button
              onClick={handleGerar}
              disabled={selectedParceiros.length === 0 || grupoConfigs.length === 0}
            >
              <Wand2 className="h-4 w-4 mr-2" />
              Gerar distribuição
            </Button>
            <Button
              variant="outline"
              onClick={handleSalvar}
              disabled={!resultado || resultado.celulas.length === 0 || !planoNome.trim() || createPlano.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {createPlano.isPending ? "Salvando..." : "Salvar plano"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Resultado */}
      {resultado && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resultado da distribuição</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {resultado.warnings.length > 0 && (
              <div className="space-y-1">
                {resultado.warnings.map((w, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 text-sm rounded-md p-2 ${
                      w.level === "error"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                    }`}
                  >
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{w.message}</span>
                  </div>
                ))}
              </div>
            )}

            {matrizAgrupada && matrizAgrupada.size > 0 && (
              <div className="space-y-6">
                {Array.from(matrizAgrupada.entries()).map(([grupoId, perCpf]) => {
                  const g = grupoMap.get(grupoId);
                  return (
                    <div key={grupoId}>
                      <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: g?.cor ?? "#6366f1" }}
                        />
                        {g?.nome ?? "Grupo"}
                      </h4>
                      <div className="border rounded-md overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/50">
                              <th className="text-left p-2 font-medium">CPF</th>
                              <th className="text-left p-2 font-medium">Casas</th>
                              <th className="text-left p-2 font-medium">IPs</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Array.from(perCpf.entries()).map(([pid, items]) => {
                              const p = parceiroMap.get(pid);
                              const ipSet = new Set(items.map((i) => i.ip_slot));
                              return (
                                <tr key={pid} className="border-b last:border-0">
                                  <td className="p-2 font-medium">{p?.nome ?? pid.slice(0, 8)}</td>
                                  <td className="p-2">
                                    <div className="flex flex-wrap gap-1">
                                      {items.map((c, idx) => {
                                        const cat = catalogoMap.get(c.bookmaker_catalogo_id);
                                        return (
                                          <Badge key={idx} variant="secondary" className="text-xs">
                                            {cat?.nome ?? c.bookmaker_catalogo_id.slice(0, 6)}
                                          </Badge>
                                        );
                                      })}
                                    </div>
                                  </td>
                                  <td className="p-2 text-xs text-muted-foreground">
                                    {ipSet.size === 1 ? (
                                      <span>1 IP compartilhado</span>
                                    ) : (
                                      <span>{ipSet.size} IPs distintos</span>
                                    )}
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

            {resultado.celulas.length === 0 && resultado.warnings.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nenhuma célula gerada.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
