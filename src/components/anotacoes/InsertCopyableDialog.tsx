import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Copy, ListChecks, Wand2 } from "lucide-react";
import { CopyableLine } from "./CopyableLine";
import { CopyableBlock } from "./CopyableBlock";

interface InsertCopyableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the markdown snippet to insert at the cursor */
  onInsert: (snippet: string) => void;
}

/**
 * Diálogo amigável para inserir um "dado copiável" sem o usuário precisar
 * entender sintaxe de markdown/crases. Ele preenche os campos e o snippet
 * correto é gerado automaticamente.
 *
 * - Único: 1 valor + nome opcional (vira chip inline com botão de copiar)
 * - Lista: N valores + nome opcional (vira bloco com "copiar tudo" e por linha)
 */
export function InsertCopyableDialog({ open, onOpenChange, onInsert }: InsertCopyableDialogProps) {
  const [mode, setMode] = useState<"unico" | "lista">("unico");

  // Modo único
  const [singleLabel, setSingleLabel] = useState("");
  const [singleValue, setSingleValue] = useState("");

  // Modo lista
  const [listLabel, setListLabel] = useState("");
  const [listValues, setListValues] = useState("");

  useEffect(() => {
    if (open) {
      setMode("unico");
      setSingleLabel("");
      setSingleValue("");
      setListLabel("");
      setListValues("");
    }
  }, [open]);

  const handleInsert = () => {
    if (mode === "unico") {
      const value = singleValue.trim();
      if (!value) return;
      const label = singleLabel.trim();
      // Sintaxe: `label::value`  ou  `value`
      const inner = label ? `${label}::${value}` : value;
      onInsert(`\`${inner}\``);
    } else {
      const lines = listValues
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length === 0) return;
      const label = listLabel.trim() || "LISTA";
      const snippet = `\n\`\`\`${label}\n${lines.join("\n")}\n\`\`\`\n`;
      onInsert(snippet);
    }
    onOpenChange(false);
  };

  const previewLines = listValues
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const canInsert =
    mode === "unico" ? singleValue.trim().length > 0 : previewLines.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" />
            Adicionar dado copiável
          </DialogTitle>
          <DialogDescription>
            Cole valores técnicos (proxy, token, URL, IP, senha…) com um botão de copiar.
            Sem precisar editar texto à mão.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as "unico" | "lista")}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="unico" className="gap-1.5">
              <Copy className="h-3.5 w-3.5" />
              Um valor
            </TabsTrigger>
            <TabsTrigger value="lista" className="gap-1.5">
              <ListChecks className="h-3.5 w-3.5" />
              Lista de valores
            </TabsTrigger>
          </TabsList>

          <TabsContent value="unico" className="space-y-3 pt-3">
            <div className="space-y-1.5">
              <Label htmlFor="single-label" className="text-xs">
                Nome <span className="text-muted-foreground">(opcional — ex.: Token, IP, URL)</span>
              </Label>
              <Input
                id="single-label"
                value={singleLabel}
                onChange={(e) => setSingleLabel(e.target.value)}
                placeholder="Ex.: Token de acesso"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="single-value" className="text-xs">
                Valor a copiar <span className="text-destructive">*</span>
              </Label>
              <Input
                id="single-value"
                value={singleValue}
                onChange={(e) => setSingleValue(e.target.value)}
                placeholder="Cole aqui o valor"
                className="h-9 font-mono text-xs"
                autoFocus
              />
            </div>

            {singleValue.trim() && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Pré-visualização</Label>
                <div className="rounded-md border border-border/40 bg-muted/20 p-2">
                  <CopyableLine
                    value={singleValue.trim()}
                    label={singleLabel.trim() || undefined}
                  />
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="lista" className="space-y-3 pt-3">
            <div className="space-y-1.5">
              <Label htmlFor="list-label" className="text-xs">
                Nome do grupo <span className="text-muted-foreground">(opcional — ex.: Proxies, Credenciais)</span>
              </Label>
              <Input
                id="list-label"
                value={listLabel}
                onChange={(e) => setListLabel(e.target.value)}
                placeholder="Ex.: Proxies de produção"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="list-values" className="text-xs">
                Valores <span className="text-destructive">*</span>{" "}
                <span className="text-muted-foreground">(um por linha)</span>
              </Label>
              <Textarea
                id="list-values"
                value={listValues}
                onChange={(e) => setListValues(e.target.value)}
                placeholder={"host1:porta:user:pass\nhost2:porta:user:pass\nhost3:porta:user:pass"}
                className="min-h-[120px] font-mono text-xs"
              />
            </div>

            {previewLines.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Pré-visualização ({previewLines.length} {previewLines.length === 1 ? "linha" : "linhas"})
                </Label>
                <CopyableBlock
                  label={listLabel.trim() || "LISTA"}
                  lines={previewLines}
                />
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleInsert} disabled={!canInsert}>
            Inserir na anotação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
