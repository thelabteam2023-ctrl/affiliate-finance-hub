import { useEffect, useMemo, useState } from "react";
import { Download, ShieldAlert, Loader2, Users } from "lucide-react";
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
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  BATCH_LIMIT_PLAIN,
  BATCH_LIMIT_WITH_CREDENTIALS,
  buildPartnerBundle,
  downloadBundleFile,
} from "@/lib/partnerPortability/buildExport";
import {
  CATEGORY_LABELS,
  DEFAULT_CATEGORIES,
  type Categories,
  type CategoryKey,
} from "@/lib/partnerPortability/schema";

interface ExportarParceiroDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** IDs dos parceiros a exportar (1 ou N). */
  parceiroIds: string[];
  /** Nome usado no arquivo quando houver apenas um parceiro. */
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
  parceiroIds,
  parceiroNome,
  workspaceId,
}: ExportarParceiroDialogProps) {
  const { toast } = useToast();
  const [categories, setCategories] = useState<Categories>({ ...DEFAULT_CATEGORIES });
  const [passphrase, setPassphrase] = useState("");
  const [passphraseConfirm, setPassphraseConfirm] = useState("");
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: null as string | null });

  useEffect(() => {
    if (open) setProgress({ done: 0, total: 0, current: null });
  }, [open]);

  const total = parceiroIds.length;
  const isBatch = total > 1;

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

  const limit = needsPassphrase ? BATCH_LIMIT_WITH_CREDENTIALS : BATCH_LIMIT_PLAIN;
  const overLimit = total > limit;

  const progressPct = useMemo(
    () => (progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0),
    [progress],
  );

  const handleExport = async () => {
    if (total === 0 || !workspaceId) return;
    setExporting(true);
    setProgress({ done: 0, total, current: null });
    try {
      const { bundle, failures } = await buildPartnerBundle(
        parceiroIds,
        workspaceId,
        categories,
        needsPassphrase ? passphrase : undefined,
        (p) => setProgress(p),
      );
      downloadBundleFile(bundle, parceiroNome);
      toast({
        title: failures.length > 0 ? "Exportado com avisos" : "Pacote exportado",
        description:
          failures.length > 0
            ? `${bundle.partners.length} parceiro(s) exportado(s); ${failures.length} falharam.`
            : `${bundle.partners.length} parceiro(s) no arquivo .labbet. Guarde-o com segurança.`,
        variant: failures.length > 0 ? "default" : undefined,
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
          <DialogTitle>{isBatch ? "Exportar parceiros" : "Exportar parceiro"}</DialogTitle>
          <DialogDescription>
            {isBatch ? (
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                {total} parceiros selecionados
              </span>
            ) : (
              parceiroNome
            )}{" "}
            — selecione exatamente o que deseja transportar. Nenhum dado operacional ou financeiro
            (saldos, apostas, lançamentos) é exportado.
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

          {overLimit && (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Limite de {limit} parceiros por exportação
                {needsPassphrase ? " com credenciais" : ""}. Reduza a seleção
                {needsPassphrase ? " ou desmarque as credenciais" : ""} para continuar.
              </AlertDescription>
            </Alert>
          )}

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

          {exporting && progress.total > 0 && (
            <div className="space-y-1.5">
              <Progress value={progressPct} className="h-1.5" />
              <p className="text-[11px] text-muted-foreground">
                {progress.done}/{progress.total} processados
                {progress.current ? ` — ${progress.current}` : ""}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={exporting}>
            Cancelar
          </Button>
          <Button
            onClick={handleExport}
            disabled={exporting || !passphraseValid || total === 0 || overLimit}
            className="gap-2"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {isBatch ? `Exportar ${total}` : "Exportar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
