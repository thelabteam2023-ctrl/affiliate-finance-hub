import { useState } from "react";
import { Download, ShieldAlert, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { buildPartnerExport, downloadExportFile } from "@/lib/partnerPortability/buildExport";
import {
  CATEGORY_LABELS,
  DEFAULT_CATEGORIES,
  type Categories,
  type CategoryKey,
} from "@/lib/partnerPortability/schema";

interface ExportarParceiroDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parceiroId: string | null;
  parceiroNome: string;
  workspaceId: string | null;
}

const GROUPS: { title: string; keys: CategoryKey[] }[] = [
  { title: "Dados pessoais", keys: ["personal", "contact", "address", "notes"] },
  { title: "Financeiro cadastral", keys: ["banking", "crypto"] },
  { title: "Casas", keys: ["bookmakers", "credentials"] },
];

export function ExportarParceiroDialog({
  open,
  onOpenChange,
  parceiroId,
  parceiroNome,
  workspaceId,
}: ExportarParceiroDialogProps) {
  const { toast } = useToast();
  const [categories, setCategories] = useState<Categories>({ ...DEFAULT_CATEGORIES });
  const [passphrase, setPassphrase] = useState("");
  const [passphraseConfirm, setPassphraseConfirm] = useState("");
  const [exporting, setExporting] = useState(false);

  const toggle = (key: CategoryKey) => {
    setCategories((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (key === "bookmakers" && !next.bookmakers) next.credentials = false;
      if (key === "credentials" && next.credentials) next.bookmakers = true;
      return next;
    });
  };

  const needsPassphrase = categories.bookmakers && categories.credentials;
  const passphraseValid =
    !needsPassphrase || (passphrase.length >= 8 && passphrase === passphraseConfirm);

  const handleExport = async () => {
    if (!parceiroId || !workspaceId) return;
    setExporting(true);
    try {
      const envelope = await buildPartnerExport(
        { parceiroId, workspaceId },
        categories,
        needsPassphrase ? passphrase : undefined,
      );
      downloadExportFile(envelope, parceiroNome);
      toast({
        title: "Pacote exportado",
        description: "Arquivo .labbet gerado. Guarde-o com segurança.",
      });
      onOpenChange(false);
      setPassphrase("");
      setPassphraseConfirm("");
    } catch (error: any) {
      toast({
        title: "Erro ao exportar",
        description: error?.message ?? "Falha desconhecida",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Exportar parceiro</DialogTitle>
          <DialogDescription>
            {parceiroNome} — selecione exatamente o que deseja transportar. Nenhum dado
            operacional ou financeiro (saldos, apostas, lançamentos) é exportado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
          {GROUPS.map((group) => (
            <div key={group.title} className="space-y-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">{group.title}</p>
              {group.keys.map((key) => (
                <div key={key} className="flex items-center gap-2">
                  <Checkbox
                    id={`cat-${key}`}
                    checked={categories[key]}
                    onCheckedChange={() => toggle(key)}
                  />
                  <Label htmlFor={`cat-${key}`} className="text-sm font-normal cursor-pointer">
                    {CATEGORY_LABELS[key]}
                  </Label>
                </div>
              ))}
            </div>
          ))}

          {needsPassphrase && (
            <>
              <Separator />
              <Alert variant="destructive">
                <ShieldAlert className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Credenciais contêm informações sensíveis. Elas serão protegidas por uma senha de
                  exportação — sem ela, ninguém consegue abrir o pacote. Guarde essa senha em local
                  seguro; ela não pode ser recuperada.
                </AlertDescription>
              </Alert>
              <div className="space-y-2">
                <Label htmlFor="export-pass" className="text-xs">
                  Senha de proteção (mín. 8 caracteres)
                </Label>
                <Input
                  id="export-pass"
                  type="password"
                  value={passphrase}
                  autoComplete="new-password"
                  onChange={(e) => setPassphrase(e.target.value)}
                />
                <Label htmlFor="export-pass2" className="text-xs">
                  Confirmar senha
                </Label>
                <Input
                  id="export-pass2"
                  type="password"
                  value={passphraseConfirm}
                  autoComplete="new-password"
                  onChange={(e) => setPassphraseConfirm(e.target.value)}
                />
                {passphrase.length > 0 && !passphraseValid && (
                  <p className="text-xs text-destructive">
                    As senhas devem coincidir e ter no mínimo 8 caracteres.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={exporting}>
            Cancelar
          </Button>
          <Button onClick={handleExport} disabled={exporting || !passphraseValid || !parceiroId} className="gap-2">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Exportar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
