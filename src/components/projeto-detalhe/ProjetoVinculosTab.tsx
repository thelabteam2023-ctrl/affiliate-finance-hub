import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Link2,
  Link2Off,
  Plus,
  Search,
  User,
  Building2,
  DollarSign,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";

interface ProjetoVinculosTabProps {
  projetoId: string;
}

interface Vinculo {
  id: string;
  nome: string;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  projeto_id: string | null;
  bookmaker_status: string;
  saldo_atual: number;
  login_username: string;
  bookmaker_catalogo_id: string | null;
  logo_url?: string | null;
}

interface BookmakerDisponivel {
  id: string;
  nome: string;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  saldo_atual: number;
  bookmaker_status: string;
  logo_url?: string | null;
}

export function ProjetoVinculosTab({ projetoId }: ProjetoVinculosTabProps) {
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [disponiveis, setDisponiveis] = useState<BookmakerDisponivel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [vinculoToRemove, setVinculoToRemove] = useState<Vinculo | null>(null);
  const [statusPopoverId, setStatusPopoverId] = useState<string | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);

  useEffect(() => {
    fetchVinculos();
  }, [projetoId]);

  const fetchVinculos = async () => {
    try {
      setLoading(true);

      // Fetch bookmakers linked to this project
      const { data: vinculosData, error: vinculosError } = await supabase
        .from("bookmakers")
        .select(`
          id,
          nome,
          parceiro_id,
          projeto_id,
          status,
          saldo_atual,
          login_username,
          bookmaker_catalogo_id,
          parceiros!bookmakers_parceiro_id_fkey (nome),
          bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url)
        `)
        .eq("projeto_id", projetoId);

      if (vinculosError) throw vinculosError;

      const mappedVinculos: Vinculo[] = (vinculosData || []).map((v: any) => ({
        id: v.id,
        nome: v.nome,
        parceiro_id: v.parceiro_id,
        parceiro_nome: v.parceiros?.nome || null,
        projeto_id: v.projeto_id,
        bookmaker_status: v.status,
        saldo_atual: v.saldo_atual,
        login_username: v.login_username,
        bookmaker_catalogo_id: v.bookmaker_catalogo_id,
        logo_url: v.bookmakers_catalogo?.logo_url || null,
      }));

      setVinculos(mappedVinculos);
    } catch (error: any) {
      toast.error("Erro ao carregar vínculos: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchDisponiveis = async () => {
    try {
      // Fetch available bookmakers (not linked to any active project)
      const { data, error } = await supabase
        .from("bookmakers")
        .select(`
          id,
          nome,
          parceiro_id,
          status,
          saldo_atual,
          parceiros!bookmakers_parceiro_id_fkey (nome),
          bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url)
        `)
        .is("projeto_id", null)
        .neq("status", "LIMITADA");

      if (error) throw error;

      const mapped: BookmakerDisponivel[] = (data || []).map((v: any) => ({
        id: v.id,
        nome: v.nome,
        parceiro_id: v.parceiro_id,
        parceiro_nome: v.parceiros?.nome || null,
        saldo_atual: v.saldo_atual,
        bookmaker_status: v.status,
        logo_url: v.bookmakers_catalogo?.logo_url || null,
      }));

      setDisponiveis(mapped);
    } catch (error: any) {
      toast.error("Erro ao carregar vínculos disponíveis: " + error.message);
    }
  };

  const handleOpenAddDialog = () => {
    fetchDisponiveis();
    setSelectedIds([]);
    setAddDialogOpen(true);
  };

  const handleAddVinculos = async () => {
    if (selectedIds.length === 0) {
      toast.error("Selecione pelo menos um vínculo");
      return;
    }

    try {
      setSaving(true);

      const { error } = await supabase
        .from("bookmakers")
        .update({ projeto_id: projetoId })
        .in("id", selectedIds);

      if (error) throw error;

      toast.success(`${selectedIds.length} vínculo(s) adicionado(s) ao projeto`);
      setAddDialogOpen(false);
      fetchVinculos();
    } catch (error: any) {
      toast.error("Erro ao adicionar vínculos: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveVinculo = async () => {
    if (!vinculoToRemove) return;

    try {
      setSaving(true);

      const { error } = await supabase
        .from("bookmakers")
        .update({ projeto_id: null })
        .eq("id", vinculoToRemove.id);

      if (error) throw error;

      toast.success("Vínculo liberado do projeto");
      setRemoveDialogOpen(false);
      setVinculoToRemove(null);
      fetchVinculos();
    } catch (error: any) {
      toast.error("Erro ao liberar vínculo: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChangeStatus = async (vinculoId: string, newStatus: string) => {
    try {
      setChangingStatus(true);

      // Database expects lowercase values
      const statusLower = newStatus.toLowerCase();
      
      const { error } = await supabase
        .from("bookmakers")
        .update({ status: statusLower })
        .eq("id", vinculoId);

      if (error) throw error;

      toast.success(`Status alterado para ${newStatus === "ATIVO" ? "Ativo" : "Limitada"}`);
      setStatusPopoverId(null);
      fetchVinculos();
    } catch (error: any) {
      toast.error("Erro ao alterar status: " + error.message);
    } finally {
      setChangingStatus(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getStatusBadge = (status: string) => {
    switch (status.toUpperCase()) {
      case "ATIVO":
        return (
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Ativo
          </Badge>
        );
      case "LIMITADA":
        return (
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
            <ShieldAlert className="h-3 w-3 mr-1" />
            Limitada
          </Badge>
        );
      default:
        return (
          <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">
            {status}
          </Badge>
        );
    }
  };

  const filteredVinculos = vinculos.filter(
    (v) =>
      v.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.parceiro_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.login_username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const totalSaldo = vinculos.reduce((acc, v) => acc + v.saldo_atual, 0);
  const vinculosAtivos = vinculos.filter((v) => v.bookmaker_status.toUpperCase() === "ATIVO").length;
  const vinculosLimitados = vinculos.filter((v) => v.bookmaker_status.toUpperCase() === "LIMITADA").length;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Vínculos</CardTitle>
            <Link2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{vinculos.length}</div>
            <p className="text-xs text-muted-foreground">
              {vinculosAtivos} ativos, {vinculosLimitados} limitados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalSaldo)}</div>
            <p className="text-xs text-muted-foreground">
              Soma dos saldos em bookmakers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Parceiros Únicos</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(vinculos.map((v) => v.parceiro_id).filter(Boolean)).size}
            </div>
            <p className="text-xs text-muted-foreground">
              Parceiros com vínculos no projeto
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, parceiro ou login..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button onClick={handleOpenAddDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Adicionar Vínculos
        </Button>
      </div>

      {/* Vínculos Grid */}
      {filteredVinculos.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-10">
              <Link2 className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">Nenhum vínculo encontrado</h3>
              <p className="text-muted-foreground">
                Adicione vínculos parceiro-bookmaker para começar
              </p>
              <Button className="mt-4" onClick={handleOpenAddDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Vínculos
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredVinculos.map((vinculo) => (
            <Card key={vinculo.id} className="relative group">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {vinculo.logo_url ? (
                      <img
                        src={vinculo.logo_url}
                        alt={vinculo.nome}
                        className="h-10 w-10 rounded-lg object-contain bg-white p-1"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                    )}
                    <div>
                      <CardTitle className="text-base">{vinculo.nome}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {vinculo.login_username}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(vinculo.bookmaker_status)}
                    <Popover 
                      open={statusPopoverId === vinculo.id} 
                      onOpenChange={(open) => setStatusPopoverId(open ? vinculo.id : null)}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Alterar Status"
                        >
                          <ShieldAlert className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56" align="end">
                        <div className="space-y-3">
                          <h4 className="font-medium text-sm">Alterar Status</h4>
                          <RadioGroup
                            value={vinculo.bookmaker_status.toUpperCase()}
                            onValueChange={(value) => handleChangeStatus(vinculo.id, value)}
                            disabled={changingStatus}
                          >
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="ATIVO" id={`ativo-${vinculo.id}`} />
                              <Label htmlFor={`ativo-${vinculo.id}`} className="flex items-center gap-2 cursor-pointer">
                                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                Ativo
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="LIMITADA" id={`limitada-${vinculo.id}`} />
                              <Label htmlFor={`limitada-${vinculo.id}`} className="flex items-center gap-2 cursor-pointer">
                                <ShieldAlert className="h-4 w-4 text-yellow-400" />
                                Limitada
                              </Label>
                            </div>
                          </RadioGroup>
                          {changingStatus && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Salvando...
                            </div>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      {vinculo.parceiro_nome || "Sem parceiro"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-sm text-muted-foreground">Saldo</span>
                    <span className="font-semibold">{formatCurrency(vinculo.saldo_atual)}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2 text-destructive hover:text-destructive"
                    onClick={() => {
                      setVinculoToRemove(vinculo);
                      setRemoveDialogOpen(true);
                    }}
                  >
                    <Link2Off className="mr-2 h-4 w-4" />
                    Liberar do Projeto
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Adicionar Vínculos ao Projeto</DialogTitle>
            <DialogDescription>
              Selecione os vínculos parceiro-bookmaker disponíveis para adicionar ao projeto.
              Vínculos em uso em outros projetos não são exibidos.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[400px] pr-4">
            {disponiveis.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Link2 className="mx-auto h-10 w-10 mb-2 opacity-50" />
                <p>Nenhum vínculo disponível</p>
                <p className="text-sm">Todos os vínculos estão em uso ou limitados</p>
              </div>
            ) : (
              <div className="space-y-2">
                {disponiveis.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedIds.includes(item.id)
                        ? "bg-primary/10 border-primary"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => toggleSelection(item.id)}
                  >
                    <Checkbox
                      checked={selectedIds.includes(item.id)}
                      onCheckedChange={() => toggleSelection(item.id)}
                    />
                    {item.logo_url ? (
                      <img
                        src={item.logo_url}
                        alt={item.nome}
                        className="h-8 w-8 rounded object-contain bg-white p-0.5"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                        <Building2 className="h-4 w-4" />
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="font-medium">{item.nome}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.parceiro_nome || "Sem parceiro"}
                      </p>
                    </div>
                    <span className="text-sm font-medium">
                      {formatCurrency(item.saldo_atual)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddVinculos} disabled={saving || selectedIds.length === 0}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adicionando...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar {selectedIds.length > 0 && `(${selectedIds.length})`}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation Dialog */}
      <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Liberar Vínculo do Projeto?</AlertDialogTitle>
            <AlertDialogDescription>
              O vínculo <strong>{vinculoToRemove?.nome}</strong> do parceiro{" "}
              <strong>{vinculoToRemove?.parceiro_nome}</strong> será liberado e poderá ser
              usado em outros projetos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveVinculo} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Liberando...
                </>
              ) : (
                "Liberar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
