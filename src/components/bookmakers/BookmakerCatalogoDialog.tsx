import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2 } from "lucide-react";

interface BookmakerCatalogoDialogProps {
  open: boolean;
  onClose: () => void;
  bookmaker: any | null;
}

interface BonusSimples {
  percent: string;
  moeda: string;
  valorMax: string;
  oddMin: string;
  tipo: string;
  rolloverVezes: string;
  rolloverBase: string;
  prazo: string;
}

export default function BookmakerCatalogoDialog({
  open,
  onClose,
  bookmaker,
}: BookmakerCatalogoDialogProps) {
  const [nome, setNome] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [status, setStatus] = useState("REGULAMENTADA");
  const [operacional, setOperacional] = useState("ATIVA");
  const [verificacao, setVerificacao] = useState("OBRIGATORIA");
  const [links, setLinks] = useState<Array<{ url: string; referencia: string }>>([{ url: "", referencia: "" }]);
  const [bonusEnabled, setBonusEnabled] = useState(false);
  const [multibonusEnabled, setMultibonusEnabled] = useState(false);
  const [bonusSimples, setBonusSimples] = useState<BonusSimples>({
    percent: "",
    moeda: "BRL",
    valorMax: "",
    oddMin: "",
    tipo: "SIMPLES",
    rolloverVezes: "",
    rolloverBase: "DEPOSITO_BONUS",
    prazo: "",
  });
  const [bonusMultiplos, setBonusMultiplos] = useState<BonusSimples[]>([
    {
      percent: "",
      moeda: "BRL",
      valorMax: "",
      oddMin: "",
      tipo: "SIMPLES",
      rolloverVezes: "",
      rolloverBase: "DEPOSITO_BONUS",
      prazo: "",
    },
  ]);
  const [observacoes, setObservacoes] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (bookmaker) {
      setNome(bookmaker.nome || "");
      setLogoUrl(bookmaker.logo_url || "");
      setStatus(bookmaker.status || "REGULAMENTADA");
      setOperacional(bookmaker.operacional || "ATIVA");
      setVerificacao(bookmaker.verificacao || "OBRIGATORIA");
      setLinks(Array.isArray(bookmaker.links_json) && bookmaker.links_json.length > 0 
        ? bookmaker.links_json 
        : [{ url: "", referencia: "" }]);
      setBonusEnabled(bookmaker.bonus_enabled || false);
      setMultibonusEnabled(bookmaker.multibonus_enabled || false);
      
      if (bookmaker.bonus_simples_json && typeof bookmaker.bonus_simples_json === 'object') {
        setBonusSimples(bookmaker.bonus_simples_json);
      }
      
      if (Array.isArray(bookmaker.bonus_multiplos_json) && bookmaker.bonus_multiplos_json.length > 0) {
        setBonusMultiplos(bookmaker.bonus_multiplos_json);
      }
      
      setObservacoes(bookmaker.observacoes || "");
    } else {
      resetForm();
    }
  }, [bookmaker, open]);

  const resetForm = () => {
    setNome("");
    setLogoUrl("");
    setStatus("REGULAMENTADA");
    setOperacional("ATIVA");
    setVerificacao("OBRIGATORIA");
    setLinks([{ url: "", referencia: "" }]);
    setBonusEnabled(false);
    setMultibonusEnabled(false);
    setBonusSimples({
      percent: "",
      moeda: "BRL",
      valorMax: "",
      oddMin: "",
      tipo: "SIMPLES",
      rolloverVezes: "",
      rolloverBase: "DEPOSITO_BONUS",
      prazo: "",
    });
    setBonusMultiplos([
      {
        percent: "",
        moeda: "BRL",
        valorMax: "",
        oddMin: "",
        tipo: "SIMPLES",
        rolloverVezes: "",
        rolloverBase: "DEPOSITO_BONUS",
        prazo: "",
      },
    ]);
    setObservacoes("");
  };

  const addLink = () => {
    setLinks([...links, { url: "", referencia: "" }]);
  };

  const removeLink = (index: number) => {
    setLinks(links.filter((_, i) => i !== index));
  };

  const updateLink = (index: number, field: "url" | "referencia", value: string) => {
    const newLinks = [...links];
    newLinks[index][field] = value;
    setLinks(newLinks);
  };

  const addBonusMultiplo = () => {
    if (bonusMultiplos.length < 3) {
      setBonusMultiplos([
        ...bonusMultiplos,
        {
          percent: "",
          moeda: "BRL",
          valorMax: "",
          oddMin: "",
          tipo: "SIMPLES",
          rolloverVezes: "",
          rolloverBase: "DEPOSITO_BONUS",
          prazo: "",
        },
      ]);
    }
  };

  const removeBonusMultiplo = (index: number) => {
    setBonusMultiplos(bonusMultiplos.filter((_, i) => i !== index));
  };

  const updateBonusMultiplo = (index: number, field: keyof BonusSimples, value: string) => {
    const newBonus = [...bonusMultiplos];
    newBonus[index][field] = value;
    setBonusMultiplos(newBonus);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const validLinks = links.filter(link => link.url.trim() !== "");

      const catalogoData = {
        user_id: user.id,
        nome,
        logo_url: logoUrl || null,
        status,
        operacional,
        verificacao,
        links_json: validLinks as any,
        bonus_enabled: bonusEnabled,
        multibonus_enabled: multibonusEnabled,
        bonus_simples_json: bonusEnabled && !multibonusEnabled ? bonusSimples as any : {} as any,
        bonus_multiplos_json: bonusEnabled && multibonusEnabled ? bonusMultiplos as any : [] as any,
        observacoes: observacoes || null,
      };

      if (bookmaker) {
        const { error } = await supabase
          .from("bookmakers_catalogo")
          .update(catalogoData)
          .eq("id", bookmaker.id);

        if (error) throw error;

        toast({
          title: "Casa atualizada",
          description: "Os dados da casa foram atualizados com sucesso.",
        });
      } else {
        const { error } = await supabase
          .from("bookmakers_catalogo")
          .insert([catalogoData]);

        if (error) throw error;

        toast({
          title: "Casa adicionada",
          description: "A nova casa foi adicionada ao catálogo com sucesso.",
        });
      }

      onClose();
    } catch (error: any) {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {bookmaker ? "Editar Bookmaker" : "Novo Bookmaker"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="nome">Nome da Casa *</Label>
                <Input
                  id="nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Bet365"
                  required
                />
              </div>

              <div>
                <Label htmlFor="logo">URL do Logo</Label>
                <Input
                  id="logo"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md bg-background text-foreground"
                >
                  <option value="REGULAMENTADA">Regulamentada</option>
                  <option value="NAO_REGULAMENTADA">Não Regulamentada</option>
                </select>
              </div>

              <div>
                <Label htmlFor="operacional">Operacional</Label>
                <select
                  id="operacional"
                  value={operacional}
                  onChange={(e) => setOperacional(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md bg-background text-foreground"
                >
                  <option value="ATIVA">Ativa</option>
                  <option value="INATIVA">Inativa</option>
                </select>
              </div>

              <div>
                <Label htmlFor="verificacao">Verificação</Label>
                <select
                  id="verificacao"
                  value={verificacao}
                  onChange={(e) => setVerificacao(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md bg-background text-foreground"
                >
                  <option value="OBRIGATORIA">Obrigatória</option>
                  <option value="QUANDO_SOLICITADO">Quando Solicitado</option>
                  <option value="NAO_REQUERIDA">Não Requerida</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Links *</Label>
                <Button type="button" variant="outline" size="sm" onClick={addLink}>
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar Link
                </Button>
              </div>
              {links.map((link, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    placeholder="URL"
                    value={link.url}
                    onChange={(e) => updateLink(index, "url", e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Referência (ex: PADRAO, FOMENTO)"
                    value={link.referencia}
                    onChange={(e) => updateLink(index, "referencia", e.target.value)}
                    className="flex-1"
                  />
                  {links.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => removeLink(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {/* Bônus Section */}
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bonusEnabled}
                    onChange={(e) => {
                      setBonusEnabled(e.target.checked);
                      if (!e.target.checked) {
                        setMultibonusEnabled(false);
                      }
                    }}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium">Possui Bônus?</span>
                </label>
                {bonusEnabled && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={multibonusEnabled}
                      onChange={(e) => setMultibonusEnabled(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-medium">Múltiplos Bônus?</span>
                  </label>
                )}
              </div>

              {bonusEnabled && !multibonusEnabled && (
                <div className="space-y-3 p-4 border rounded-lg bg-card">
                  <h4 className="font-semibold text-sm">Bônus Simples</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <Label htmlFor="bonus-percent">Percentual (%)</Label>
                      <Input
                        id="bonus-percent"
                        type="number"
                        value={bonusSimples.percent}
                        onChange={(e) => setBonusSimples({ ...bonusSimples, percent: e.target.value })}
                        placeholder="100"
                      />
                    </div>
                    <div>
                      <Label htmlFor="bonus-moeda">Moeda</Label>
                      <select
                        id="bonus-moeda"
                        value={bonusSimples.moeda}
                        onChange={(e) => setBonusSimples({ ...bonusSimples, moeda: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md bg-background text-foreground"
                      >
                        <option value="BRL">BRL</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="bonus-max">Valor Máximo</Label>
                      <Input
                        id="bonus-max"
                        type="number"
                        value={bonusSimples.valorMax}
                        onChange={(e) => setBonusSimples({ ...bonusSimples, valorMax: e.target.value })}
                        placeholder="500"
                      />
                    </div>
                    <div>
                      <Label htmlFor="bonus-oddmin">Odd Mínima</Label>
                      <Input
                        id="bonus-oddmin"
                        type="number"
                        step="0.01"
                        value={bonusSimples.oddMin}
                        onChange={(e) => setBonusSimples({ ...bonusSimples, oddMin: e.target.value })}
                        placeholder="1.50"
                      />
                    </div>
                    <div>
                      <Label htmlFor="bonus-tipo">Tipo de Aposta</Label>
                      <select
                        id="bonus-tipo"
                        value={bonusSimples.tipo}
                        onChange={(e) => setBonusSimples({ ...bonusSimples, tipo: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md bg-background text-foreground"
                      >
                        <option value="SIMPLES">Simples</option>
                        <option value="MULTIPLA">Múltipla</option>
                        <option value="AMBAS">Ambas</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="bonus-rollover">Rollover (vezes)</Label>
                      <Input
                        id="bonus-rollover"
                        type="number"
                        value={bonusSimples.rolloverVezes}
                        onChange={(e) => setBonusSimples({ ...bonusSimples, rolloverVezes: e.target.value })}
                        placeholder="5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="bonus-base">Base do Rollover</Label>
                      <select
                        id="bonus-base"
                        value={bonusSimples.rolloverBase}
                        onChange={(e) => setBonusSimples({ ...bonusSimples, rolloverBase: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md bg-background text-foreground"
                      >
                        <option value="DEPOSITO_BONUS">Depósito + Bônus</option>
                        <option value="BONUS">Apenas Bônus</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="bonus-prazo">Prazo (dias)</Label>
                      <Input
                        id="bonus-prazo"
                        type="number"
                        value={bonusSimples.prazo}
                        onChange={(e) => setBonusSimples({ ...bonusSimples, prazo: e.target.value })}
                        placeholder="30"
                      />
                    </div>
                  </div>
                </div>
              )}

              {bonusEnabled && multibonusEnabled && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm">Bônus Múltiplos (até 3)</h4>
                    {bonusMultiplos.length < 3 && (
                      <Button type="button" variant="outline" size="sm" onClick={addBonusMultiplo}>
                        <Plus className="h-4 w-4 mr-1" />
                        Adicionar Bônus
                      </Button>
                    )}
                  </div>
                  {bonusMultiplos.map((bonus, index) => (
                    <div key={index} className="space-y-3 p-4 border rounded-lg bg-card">
                      <div className="flex items-center justify-between">
                        <h5 className="font-medium text-sm">{index + 1}º Depósito</h5>
                        {bonusMultiplos.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeBonusMultiplo(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <Label>Percentual (%)</Label>
                          <Input
                            type="number"
                            value={bonus.percent}
                            onChange={(e) => updateBonusMultiplo(index, "percent", e.target.value)}
                            placeholder="100"
                          />
                        </div>
                        <div>
                          <Label>Moeda</Label>
                          <select
                            value={bonus.moeda}
                            onChange={(e) => updateBonusMultiplo(index, "moeda", e.target.value)}
                            className="w-full px-3 py-2 border rounded-md bg-background text-foreground"
                          >
                            <option value="BRL">BRL</option>
                            <option value="USD">USD</option>
                            <option value="EUR">EUR</option>
                          </select>
                        </div>
                        <div>
                          <Label>Valor Máximo</Label>
                          <Input
                            type="number"
                            value={bonus.valorMax}
                            onChange={(e) => updateBonusMultiplo(index, "valorMax", e.target.value)}
                            placeholder="500"
                          />
                        </div>
                        <div>
                          <Label>Odd Mínima</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={bonus.oddMin}
                            onChange={(e) => updateBonusMultiplo(index, "oddMin", e.target.value)}
                            placeholder="1.50"
                          />
                        </div>
                        <div>
                          <Label>Tipo de Aposta</Label>
                          <select
                            value={bonus.tipo}
                            onChange={(e) => updateBonusMultiplo(index, "tipo", e.target.value)}
                            className="w-full px-3 py-2 border rounded-md bg-background text-foreground"
                          >
                            <option value="SIMPLES">Simples</option>
                            <option value="MULTIPLA">Múltipla</option>
                            <option value="AMBAS">Ambas</option>
                          </select>
                        </div>
                        <div>
                          <Label>Rollover (vezes)</Label>
                          <Input
                            type="number"
                            value={bonus.rolloverVezes}
                            onChange={(e) => updateBonusMultiplo(index, "rolloverVezes", e.target.value)}
                            placeholder="5"
                          />
                        </div>
                        <div>
                          <Label>Base do Rollover</Label>
                          <select
                            value={bonus.rolloverBase}
                            onChange={(e) => updateBonusMultiplo(index, "rolloverBase", e.target.value)}
                            className="w-full px-3 py-2 border rounded-md bg-background text-foreground"
                          >
                            <option value="DEPOSITO_BONUS">Depósito + Bônus</option>
                            <option value="BONUS">Apenas Bônus</option>
                          </select>
                        </div>
                        <div>
                          <Label>Prazo (dias)</Label>
                          <Input
                            type="number"
                            value={bonus.prazo}
                            onChange={(e) => updateBonusMultiplo(index, "prazo", e.target.value)}
                            placeholder="30"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Notas adicionais sobre esta casa..."
                rows={3}
              />
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {bookmaker ? "Atualizar" : "Adicionar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}