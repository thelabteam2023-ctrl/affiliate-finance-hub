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
import { Loader2, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface BookmakerCatalogoDialogProps {
  open: boolean;
  onClose: () => void;
  bookmaker: any | null;
}

interface LinkItem {
  id: string;
  url: string;
  referencia: string;
}

interface BonusItem {
  id?: string;
  tipoBônus: string;
  tipoOutro?: string;
  percent: string;
  moeda: string;
  valorMax: string;
  oddMin: string;
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
  const [logoError, setLogoError] = useState(false);
  const [status, setStatus] = useState("REGULAMENTADA");
  const [operacional, setOperacional] = useState("ATIVA");
  const [verificacao, setVerificacao] = useState("OBRIGATORIA");
  const [links, setLinks] = useState<LinkItem[]>([{ id: crypto.randomUUID(), url: "", referencia: "PADRÃO" }]);
  const [bonusEnabled, setBonusEnabled] = useState(false);
  const [bonusList, setBonusList] = useState<BonusItem[]>([]);
  const [observacoes, setObservacoes] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (bookmaker) {
      setNome(bookmaker.nome || "");
      setLogoUrl(bookmaker.logo_url || "");
      setLogoError(false);
      setStatus(bookmaker.status || "REGULAMENTADA");
      setOperacional(bookmaker.operacional || "ATIVA");
      setVerificacao(bookmaker.verificacao || "OBRIGATORIA");
      setLinks(Array.isArray(bookmaker.links_json) && bookmaker.links_json.length > 0 
        ? bookmaker.links_json.map((link: any) => ({ ...link, id: link.id || crypto.randomUUID() }))
        : [{ id: crypto.randomUUID(), url: "", referencia: "PADRÃO" }]);
      setBonusEnabled(bookmaker.bonus_enabled || false);
      
      if (Array.isArray(bookmaker.bonus_multiplos_json) && bookmaker.bonus_multiplos_json.length > 0) {
        setBonusList(bookmaker.bonus_multiplos_json.map((bonus: any) => ({ 
          ...bonus, 
          id: bonus.id || crypto.randomUUID() 
        })));
      } else {
        setBonusList([]);
      }
      
      setObservacoes(bookmaker.observacoes || "");
    } else {
      resetForm();
    }
  }, [bookmaker, open]);

  const resetForm = () => {
    setNome("");
    setLogoUrl("");
    setLogoError(false);
    setStatus("REGULAMENTADA");
    setOperacional("ATIVA");
    setVerificacao("OBRIGATORIA");
    setLinks([{ id: crypto.randomUUID(), url: "", referencia: "PADRÃO" }]);
    setBonusEnabled(false);
    setBonusList([]);
    setObservacoes("");
  };

  const addLink = () => {
    setLinks([...links, { id: crypto.randomUUID(), url: "", referencia: "" }]);
  };

  const removeLink = (id: string) => {
    setLinks(links.filter((link) => link.id !== id));
  };

  const updateLink = (id: string, field: "url" | "referencia", value: string) => {
    setLinks(links.map(link => link.id === id ? { ...link, [field]: value } : link));
  };

  const validateDuplicateReference = (referencia: string, currentId: string): string | null => {
    const normalizedRef = referencia.trim().toUpperCase();
    if (!normalizedRef) return null;
    
    const isDuplicate = links.some((link) => 
      link.id !== currentId && 
      link.referencia.trim().toUpperCase() === normalizedRef
    );
    
    return isDuplicate ? "Já existe uma referência com este nome" : null;
  };

  const addBonus = () => {
    setBonusList([
      ...bonusList,
      {
        id: crypto.randomUUID(),
        tipoBônus: "BOAS_VINDAS",
        percent: "",
        moeda: "BRL",
        valorMax: "",
        oddMin: "",
        rolloverVezes: "",
        rolloverBase: "DEPOSITO_BONUS",
        prazo: "",
      },
    ]);
  };

  const removeBonus = (id: string) => {
    setBonusList(bonusList.filter((bonus) => bonus.id !== id));
  };

  const updateBonus = (id: string, field: keyof BonusItem, value: string) => {
    setBonusList(bonusList.map(bonus => {
      if (bonus.id === id) {
        const updated = { ...bonus, [field]: value };
        // Limpar tipoOutro se mudar de OUTRO para outro tipo
        if (field === "tipoBônus" && value !== "OUTRO" && bonus.tipoOutro) {
          delete updated.tipoOutro;
        }
        return updated;
      }
      return bonus;
    }));
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
      
      // Validar que o link padrão tenha URL
      if (!linksToSave[0]?.url.trim()) {
        toast({
          title: "Erro de validação",
          description: "O link de acesso padrão é obrigatório.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const urlPadrao = linksToSave[0].url.trim().toLowerCase();

      // Validar nome duplicado (normalizado sem espaços)
      const nomeNormalizado = nome.trim().toUpperCase().replace(/\s+/g, '');
      const { data: existingBookmakers, error: checkError } = await supabase
        .from("bookmakers_catalogo")
        .select("id, nome, links_json")
        .or(`user_id.eq.${user.id},is_system.eq.true`);

      if (checkError) throw checkError;

      // Verificar nome duplicado (sem considerar espaços)
      const duplicateByName = existingBookmakers?.find(
        (bm) => bm.nome.toUpperCase().replace(/\s+/g, '') === nomeNormalizado && bm.id !== bookmaker?.id
      );

      if (duplicateByName) {
        toast({
          title: "Nome duplicado",
          description: `Já existe uma casa com o nome "${duplicateByName.nome}". Os nomes são considerados iguais mesmo com espaços diferentes.`,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // Verificar URL padrão duplicada
      const duplicateByUrl = existingBookmakers?.find((bm) => {
        if (bm.id === bookmaker?.id) return false;
        
        const links = Array.isArray(bm.links_json) ? bm.links_json : [];
        const linkPadrao = links.find((l: any) => l?.referencia === "PADRÃO") as { url?: string; referencia?: string } | undefined;
        
        return linkPadrao?.url?.trim().toLowerCase() === urlPadrao;
      });

      if (duplicateByUrl) {
        toast({
          title: "URL duplicada",
          description: `O link de acesso padrão já está cadastrado na casa "${duplicateByUrl.nome}". Use uma URL diferente.`,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }
      
      const validLinks = linksToSave.filter(link => link.url.trim() !== "").map(({ id, ...link }) => link);
      
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
        multibonus_enabled: false,
        bonus_simples_json: {} as any,
        bonus_multiplos_json: bonusEnabled ? bonusList.map(({ id, ...bonus }) => bonus) as any : [] as any,
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
            {/* Logo Preview à esquerda + Campos à direita */}
            <div className="flex gap-4">
              {/* Preview do Logo */}
              <div className="w-24 h-24 rounded-md border border-border bg-muted/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                {logoUrl && !logoError ? (
                  <img 
                    key={logoUrl}
                    src={logoUrl} 
                    alt="Preview do logo" 
                    className="w-full h-full object-contain p-2"
                    onError={() => setLogoError(true)}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">Logo</span>
                )}
              </div>

              {/* Campos Nome e URL alinhados */}
              <div className="flex-1 grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome da Casa *</Label>
                  <Input
                    id="nome"
                    value={nome}
                    onChange={(e) => setNome(e.target.value.toUpperCase())}
                    placeholder="Ex: Betano, Blaze, Bet365"
                    required
                    className="h-10"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="logo">URL do Logo (opcional)</Label>
                  <Input
                    id="logo"
                    value={logoUrl}
                    onChange={(e) => {
                      setLogoUrl(e.target.value);
                      setLogoError(false);
                    }}
                    placeholder="https://..."
                    className="h-10"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label htmlFor="status">Status *</Label>
                <Select value={status} onValueChange={setStatus} required>
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
                <Label htmlFor="operacional">Operacional *</Label>
                <Select value={operacional} onValueChange={setOperacional} required>
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
                <Label htmlFor="verificacao">Verificação *</Label>
                <Select value={verificacao} onValueChange={setVerificacao} required>
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
              <Label>Links de Acesso *</Label>
              {links.map((link, index) => (
                <div key={link.id}>
                  {index === 0 ? (
                    <div className="grid grid-cols-[130px_1fr_40px] gap-3 items-center">
                      <div className="h-10 rounded-md border border-input bg-muted/30 px-3 py-2 text-sm flex items-center justify-center font-medium">
                        PADRÃO
                      </div>
                      <Input
                        placeholder="https://exemplo.com"
                        value={link.url}
                        onChange={(e) => {
                          const newUrl = e.target.value;
                          setLinks(prevLinks => prevLinks.map(l => 
                            l.id === link.id 
                              ? { ...l, url: newUrl, referencia: "PADRÃO" } 
                              : l
                          ));
                        }}
                        className="h-10"
                        required
                      />
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="icon"
                        onClick={addLink}
                        className="h-10 w-10 rounded-full hover:bg-primary/10"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-[130px_1fr_40px] gap-3 items-center">
                      <Input
                        placeholder="Referência (ex: fomento)"
                        value={link.referencia}
                        onChange={(e) => {
                          const upperValue = e.target.value.toUpperCase();
                          const error = validateDuplicateReference(upperValue, link.id);
                          if (error && upperValue.trim()) {
                            toast({
                              title: "Referência duplicada",
                              description: error,
                              variant: "destructive",
                            });
                          }
                          updateLink(link.id, "referencia", upperValue);
                        }}
                        className="h-10"
                      />
                      <Input
                        placeholder="https://exemplo.com/FOMENTO"
                        value={link.url}
                        onChange={(e) => updateLink(link.id, "url", e.target.value)}
                        className="h-10"
                      />
                      <Badge
                        variant="outline"
                        onClick={() => removeLink(link.id)}
                        className="h-8 w-8 p-0 cursor-pointer hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50 transition-colors flex items-center justify-center"
                      >
                        <X className="h-3 w-3" />
                      </Badge>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-center gap-3">
                <Label htmlFor="bonus">Bônus Disponível</Label>
                <Switch
                  id="bonus"
                  checked={bonusEnabled}
                  onCheckedChange={setBonusEnabled}
                  className={!bonusEnabled ? "data-[state=unchecked]:bg-red-500/10" : ""}
                />
              </div>

              {bonusEnabled && (
                <div className="space-y-4 pt-2">
                  {bonusList.map((bonus) => (
                    <div
                      key={bonus.id}
                      className="space-y-4 p-4 rounded-lg border border-border bg-muted/30"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-sm">Configuração de Bônus</h4>
                        {bonusList.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeBonus(bonus.id!)}
                            className="h-8 w-8 text-destructive hover:text-destructive"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Tipo de Bônus</Label>
                          <Select
                            value={bonus.tipoBônus}
                            onValueChange={(value) =>
                              updateBonus(bonus.id!, "tipoBônus", value)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="BOAS_VINDAS">BOAS-VINDAS</SelectItem>
                              <SelectItem value="CASHBACK">CASHBACK</SelectItem>
                              <SelectItem value="FREE_BET">FREE BET</SelectItem>
                              <SelectItem value="OUTRO">OUTRO</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {bonus.tipoBônus === "OUTRO" && (
                          <div className="space-y-2">
                            <Label>Especificar Tipo</Label>
                            <Input
                              value={bonus.tipoOutro || ""}
                              onChange={(e) =>
                                updateBonus(bonus.id!, "tipoOutro", e.target.value.toUpperCase())
                              }
                              placeholder="Digite o tipo de bônus"
                            />
                          </div>
                        )}
                        <div className="space-y-2">
                          <Label>Percentual (%)</Label>
                          <Input
                            type="number"
                            value={bonus.percent}
                            onChange={(e) =>
                              updateBonus(bonus.id!, "percent", e.target.value)
                            }
                            placeholder="100"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Moeda</Label>
                          <Select
                            value={bonus.moeda}
                            onValueChange={(value) =>
                              updateBonus(bonus.id!, "moeda", value)
                            }
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
                        <div className="space-y-2">
                          <Label>Valor Máximo</Label>
                          <Input
                            type="number"
                            value={bonus.valorMax}
                            onChange={(e) =>
                              updateBonus(bonus.id!, "valorMax", e.target.value)
                            }
                            placeholder="500"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Odd Mínima</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={bonus.oddMin}
                            onChange={(e) =>
                              updateBonus(bonus.id!, "oddMin", e.target.value)
                            }
                            placeholder="1.50"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Rollover (vezes)</Label>
                          <Input
                            type="number"
                            value={bonus.rolloverVezes}
                            onChange={(e) =>
                              updateBonus(bonus.id!, "rolloverVezes", e.target.value)
                            }
                            placeholder="14"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Rollover Base</Label>
                          <Select
                            value={bonus.rolloverBase}
                            onValueChange={(value) =>
                              updateBonus(bonus.id!, "rolloverBase", value)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="DEPOSITO">DEPÓSITO</SelectItem>
                              <SelectItem value="BONUS">BÔNUS</SelectItem>
                              <SelectItem value="DEPOSITO_BONUS">DEPÓSITO + BÔNUS</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Prazo (dias)</Label>
                          <Input
                            type="number"
                            value={bonus.prazo}
                            onChange={(e) =>
                              updateBonus(bonus.id!, "prazo", e.target.value)
                            }
                            placeholder="30"
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    onClick={addBonus}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Bônus
                  </Button>
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
