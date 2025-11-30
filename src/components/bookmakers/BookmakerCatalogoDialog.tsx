import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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
  const [links, setLinks] = useState<Array<{ url: string; referencia: string }>>([{ url: "", referencia: "PADRÃO" }]);
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
        : [{ url: "", referencia: "PADRÃO" }]);
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
    setLinks([{ url: "", referencia: "PADRÃO" }]);
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

  const validateDuplicateReference = (referencia: string, currentIndex: number): string | null => {
    const normalizedRef = referencia.trim().toUpperCase();
    if (!normalizedRef) return null;
    
    const isDuplicate = links.some((link, index) => 
      index !== currentIndex && 
      link.referencia.trim().toUpperCase() === normalizedRef
    );
    
    return isDuplicate ? "Já existe uma referência com este nome" : null;
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

      // Garantir que o primeiro link seja sempre PADRÃO
      const linksToSave = [...links];
      if (linksToSave.length > 0) {
        linksToSave[0].referencia = "PADRÃO";
      }
      
      const validLinks = linksToSave.filter(link => link.url.trim() !== "");
      
      // Validar referências duplicadas
      const references = validLinks.map(l => l.referencia.trim().toUpperCase());
      const duplicates = references.filter((ref, index) => ref && references.indexOf(ref) !== index);
      if (duplicates.length > 0) {
        toast({
          title: "Erro de validação",
          description: "Existem referências duplicadas. Cada referência deve ser única.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

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
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome da Casa *</Label>
                <Input
                  id="nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Betano, Blaze, Bet365"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="logo">URL do Logo (opcional)</Label>
                <Input
                  id="logo"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="REGULAMENTADA">REGULAMENTADA</SelectItem>
                    <SelectItem value="NAO_REGULAMENTADA">NÃO REGULAMENTADA</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="operacional">Operacional</Label>
                <Select value={operacional} onValueChange={setOperacional}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ATIVA">ATIVA</SelectItem>
                    <SelectItem value="INATIVA">INATIVA</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="verificacao">Verificação</Label>
                <Select value={verificacao} onValueChange={setVerificacao}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OBRIGATORIA">OBRIGATÓRIA</SelectItem>
                    <SelectItem value="QUANDO_SOLICITADO">QUANDO SOLICITADO</SelectItem>
                    <SelectItem value="NAO_REQUERIDA">NÃO REQUERIDA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Links de Acesso</Label>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="icon"
                  onClick={addLink}
                  className="h-8 w-8 rounded-full hover:bg-primary/10"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {links.map((link, index) => (
                <div key={index} className="space-y-2">
                  <div className="grid grid-cols-12 gap-3 items-start">
                    {index === 0 ? (
                      <>
                        <div className="col-span-2">
                          <div className="h-10 rounded-md border border-input bg-muted/30 px-3 py-2 text-sm flex items-center justify-center font-medium">
                            PADRÃO
                          </div>
                        </div>
                        <div className="col-span-10">
                          <Input
                            placeholder="https://exemplo.com"
                            value={link.url}
                            onChange={(e) => {
                              updateLink(index, "url", e.target.value);
                              updateLink(index, "referencia", "PADRÃO");
                            }}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="col-span-5">
                          <Input
                            placeholder="https://exemplo.com"
                            value={link.url}
                            onChange={(e) => updateLink(index, "url", e.target.value)}
                          />
                        </div>
                        <div className="col-span-6">
                          <Input
                            placeholder="Referência (ex: FOMENTO, PADRAO 2)"
                            value={link.referencia}
                            onChange={(e) => {
                              const error = validateDuplicateReference(e.target.value, index);
                              if (error && e.target.value.trim()) {
                                toast({
                                  title: "Referência duplicada",
                                  description: error,
                                  variant: "destructive",
                                });
                              }
                              updateLink(index, "referencia", e.target.value);
                            }}
                          />
                        </div>
                        <div className="col-span-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeLink(index)}
                            className="h-10 w-10 hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Bônus Section */}
            <div className="space-y-4 pt-6 border-t">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="bonus-enabled" className="text-base font-medium">Possui Bônus?</Label>
                  <Switch
                    id="bonus-enabled"
                    checked={bonusEnabled}
                    onCheckedChange={(checked) => {
                      setBonusEnabled(checked);
                      if (!checked) {
                        setMultibonusEnabled(false);
                      }
                    }}
                  />
                </div>
                {bonusEnabled && (
                  <div className="flex items-center justify-between">
                    <Label htmlFor="multibonus-enabled" className="text-sm font-medium">Múltiplos Bônus?</Label>
                    <Switch
                      id="multibonus-enabled"
                      checked={multibonusEnabled}
                      onCheckedChange={setMultibonusEnabled}
                    />
                  </div>
                )}
              </div>

              {bonusEnabled && !multibonusEnabled && (
                <div className="space-y-4 p-6 border rounded-lg bg-card/50">
                  <h4 className="font-semibold">Configuração de Bônus Simples</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                      <Select
                        value={bonusSimples.moeda}
                        onValueChange={(value) => setBonusSimples({ ...bonusSimples, moeda: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="BRL">BRL</SelectItem>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="EUR">EUR</SelectItem>
                        </SelectContent>
                      </Select>
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
                      <Select
                        value={bonusSimples.tipo}
                        onValueChange={(value) => setBonusSimples({ ...bonusSimples, tipo: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="SIMPLES">Simples</SelectItem>
                          <SelectItem value="MULTIPLA">Múltipla</SelectItem>
                          <SelectItem value="AMBAS">Ambas</SelectItem>
                        </SelectContent>
                      </Select>
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
                      <Select
                        value={bonusSimples.rolloverBase}
                        onValueChange={(value) => setBonusSimples({ ...bonusSimples, rolloverBase: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DEPOSITO_BONUS">Depósito + Bônus</SelectItem>
                          <SelectItem value="BONUS">Apenas Bônus</SelectItem>
                        </SelectContent>
                      </Select>
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
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">Configuração de Bônus Múltiplos (até 3)</h4>
                    {bonusMultiplos.length < 3 && (
                      <Button type="button" variant="outline" size="sm" onClick={addBonusMultiplo}>
                        <Plus className="h-4 w-4 mr-1" />
                        Adicionar Bônus
                      </Button>
                    )}
                  </div>
                  {bonusMultiplos.map((bonus, index) => (
                    <div key={index} className="space-y-4 p-6 border rounded-lg bg-card/50">
                      <div className="flex items-center justify-between">
                        <h5 className="font-medium">{index + 1}º Depósito</h5>
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
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                          <Select
                            value={bonus.moeda}
                            onValueChange={(value) => updateBonusMultiplo(index, "moeda", value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="BRL">BRL</SelectItem>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="EUR">EUR</SelectItem>
                            </SelectContent>
                          </Select>
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
                          <Select
                            value={bonus.tipo}
                            onValueChange={(value) => updateBonusMultiplo(index, "tipo", value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="SIMPLES">Simples</SelectItem>
                              <SelectItem value="MULTIPLA">Múltipla</SelectItem>
                              <SelectItem value="AMBAS">Ambas</SelectItem>
                            </SelectContent>
                          </Select>
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
                          <Select
                            value={bonus.rolloverBase}
                            onValueChange={(value) => updateBonusMultiplo(index, "rolloverBase", value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="DEPOSITO_BONUS">Depósito + Bônus</SelectItem>
                              <SelectItem value="BONUS">Apenas Bônus</SelectItem>
                            </SelectContent>
                          </Select>
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

          <div className="flex justify-end gap-3 pt-4 border-t">
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