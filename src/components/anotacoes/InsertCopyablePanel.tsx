import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Copy, ListChecks, Wand2, X } from "lucide-react";
import { CopyableLine } from "./CopyableLine";
import { CopyableBlock } from "./CopyableBlock";
import { cn } from "@/lib/utils";

interface InsertCopyablePanelProps {
  open: boolean;
  onClose: () => void;
  /** Called with the markdown snippet to insert at the cursor */
  onInsert: (snippet: string) => void;
  /** Optional dark-mode variant for the NotesDrawer */
  variant?: "default" | "drawer";
}

/**
 * Painel inline (não-modal) para inserir um valor copiável dentro de uma anotação,
 * sem o usuário precisar entender a sintaxe de crases/markdown.
 *
 * Renderiza no fluxo do editor (não em portal) para não conflitar com drawers/overlays.
 */
export function InsertCopyablePanel({ open, onClose, onInsert, variant = "default" }: InsertCopyablePanelProps) {
  const [mode, setMode] = useState<"unico" | "lista">("unico");
  const [singleLabel, setSingleLabel] = useState("");
  const [singleValue, setSingleValue] = useState("");
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

  if (!open) return null;

  const previewLines = listValues
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const canInsert =
    mode === "unico" ? singleValue.trim().length > 0 : previewLines.length > 0;

  const handleInsert = () => {
    if (mode === "unico") {
      const value = singleValue.trim();
      if (!value) return;
      const label = singleLabel.trim();
      const inner = label ? `${label}::${value}` : value;
      onInsert(`\`${inner}\``);
    } else {
      if (previewLines.length === 0) return;
      const label = listLabel.trim() || "LISTA";
      const snippet = `\n\`\`\`${label}\n${previewLines.join("\n")}\n\`\`\`\n`;
      onInsert(snippet);
    }
    onClose();
  };

  const isDrawer = variant === "drawer";

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "rounded-lg border p-3 my-2 space-y-3 shadow-sm",
        isDrawer
          ? "bg-[#0f1218] border-[#2a2d35]"
          : "bg-muted/30 border-border/50",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <Wand2 className={cn("h-3.5 w-3.5", isDrawer ? "text-[#00c853]" : "text-primary")} />
          <span className={isDrawer ? "text-gray-200" : ""}>Adicionar dado copiável</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={cn(
            "p-0.5 rounded transition-colors",
            isDrawer ? "text-gray-500 hover:text-gray-200 hover:bg-white/5" : "text-muted-foreground hover:text-foreground hover:bg-muted",
          )}
          title="Fechar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <p className={cn("text-[10px]", isDrawer ? "text-gray-500" : "text-muted-foreground")}>
        Cole valores técnicos (proxy, token, URL, IP, senha…) e eles aparecerão com um botão de copiar.
      </p>

      <Tabs value={mode} onValueChange={(v) => setMode(v as "unico" | "lista")}>
        <TabsList className="grid grid-cols-2 w-full h-8">
          <TabsTrigger value="unico" className="gap-1.5 text-xs h-6">
            <Copy className="h-3 w-3" />
            Um valor
          </TabsTrigger>
          <TabsTrigger value="lista" className="gap-1.5 text-xs h-6">
            <ListChecks className="h-3 w-3" />
            Lista
          </TabsTrigger>
        </TabsList>

        <TabsContent value="unico" className="space-y-2 pt-2 mt-0">
          <div className="space-y-1">
            <Label htmlFor="cp-single-label" className="text-[10px]">
              Nome <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="cp-single-label"
              value={singleLabel}
              onChange={(e) => setSingleLabel(e.target.value)}
              placeholder="Ex.: Token"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cp-single-value" className="text-[10px]">
              Valor a copiar <span className="text-destructive">*</span>
            </Label>
            <Input
              id="cp-single-value"
              value={singleValue}
              onChange={(e) => setSingleValue(e.target.value)}
              placeholder="Cole aqui o valor"
              className="h-8 text-xs font-mono"
              autoFocus
            />
          </div>
          {singleValue.trim() && (
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Pré-visualização</Label>
              <div className="rounded-md border border-border/40 bg-background/40 p-1.5">
                <CopyableLine value={singleValue.trim()} label={singleLabel.trim() || undefined} />
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="lista" className="space-y-2 pt-2 mt-0">
          <div className="space-y-1">
            <Label htmlFor="cp-list-label" className="text-[10px]">
              Nome do grupo <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="cp-list-label"
              value={listLabel}
              onChange={(e) => setListLabel(e.target.value)}
              placeholder="Ex.: Proxies"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cp-list-values" className="text-[10px]">
              Valores <span className="text-destructive">*</span>{" "}
              <span className="text-muted-foreground">(um por linha)</span>
            </Label>
            <Textarea
              id="cp-list-values"
              value={listValues}
              onChange={(e) => setListValues(e.target.value)}
              placeholder={"host1:porta:user:pass\nhost2:porta:user:pass"}
              className="min-h-[90px] text-xs font-mono"
            />
          </div>
          {previewLines.length > 0 && (
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">
                Pré-visualização ({previewLines.length})
              </Label>
              <CopyableBlock label={listLabel.trim() || "LISTA"} lines={previewLines} />
            </div>
          )}
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onClose} className="h-7 text-xs">
          Cancelar
        </Button>
        <Button size="sm" onClick={handleInsert} disabled={!canInsert} className="h-7 text-xs">
          Inserir
        </Button>
      </div>
    </div>
  );
}
