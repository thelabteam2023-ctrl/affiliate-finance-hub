import { useEffect, useMemo, useState } from "react";
import { Download, ShieldAlert, Loader2, Users, Search, ArrowLeft, ArrowRight } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { maskCPFPartial } from "@/lib/validators";
import { filterParceiros } from "@/lib/parceiroStatusFilter";
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

export interface ParceiroExportOption {
  id: string;
  nome: string;
  cpf: string;
  status: string;
}

interface ExportarParceiroDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Universo de parceiros do workspace atual disponíveis para exportação. */
  parceiros: ParceiroExportOption[];
  /** Parceiro aberto na tela — entra pré-marcado ao abrir o fluxo. */
  initialSelectedIds?: string[];
  /** Filtro de status vigente na listagem (usado pelo atalho "usar filtro atual"). */
  currentStatusFilter?: string;
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
  parceiros,
  initialSelectedIds,
  currentStatusFilter = "ativo",
  workspaceId,
}: ExportarParceiroDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<"select" | "options">("select");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ativo");
  const [categories, setCategories] = useState<Categories>({ ...DEFAULT_CATEGORIES });
  const [passphrase, setPassphrase] = useState("");
  const [passphraseConfirm, setPassphraseConfirm] = useState("");
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: null as string | null });

  // Reinicia o fluxo a cada abertura — cancelar nunca deixa resíduo.
  useEffect(() => {
    if (!open) return;
    setStep("select");
    setSelectedIds(initialSelectedIds ?? []);
    setSearch("");
    setStatusFilter(currentStatusFilter);
    setProgress({ done: 0, total: 0, current: null });
    setPassphrase("");
    setPassphraseConfirm("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filtered = useMemo(
    () => filterParceiros(parceiros, search, statusFilter),
    [parceiros, search, statusFilter],
  );

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const total = selectedIds.length;
  const isBatch = total > 1;

  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selectedSet.has(p.id));

  const toggleOne = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => prev.filter((id) => !filtered.some((p) => p.id === id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...filtered.map((p) => p.id)])));
    }
  };

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

  const exportNome = useMemo(() => {
    if (total === 1) return parceiros.find((p) => p.id === selectedIds[0])?.nome ?? "Parceiro";
    return "Parceiros";
  }, [total, selectedIds, parceiros]);

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
        selectedIds,
        workspaceId,
        categories,
        needsPassphrase ? passphrase : undefined,
        (p) => setProgress(p),
      );
      downloadBundleFile(bundle, exportNome);
      toast({
        title: failures.length > 0 ? "Exportado com avisos" : "Pacote exportado",
        description:
          failures.length > 0
            ? `${bundle.partners.length} parceiro(s) exportado(s); ${failures.length} falharam.`
            : `${bundle.partners.length} parceiro(s) no arquivo .labbet. Guarde-o com segurança.`,
      });
      onOpenChange(false);
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
          <DialogTitle>
            {step === "select" ? "Exportar parceiros" : isBatch ? "Exportar parceiros" : "Exportar parceiro"}
          </DialogTitle>
          <DialogDescription>
            {step === "select" ? (
              "Escolha quais parceiros deseja exportar. Somente parceiros do workspace atual são listados."
            ) : (
              <>
                {isBatch ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    {total} parceiros selecionados
                  </span>
                ) : (
                  exportNome
                )}{" "}
                — selecione exatamente o que deseja transportar. Nenhum dado operacional ou
                financeiro (saldos, apostas, lançamentos) é exportado.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {step === "select" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar parceiro..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-[150px] text-sm">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Em andamento</SelectItem>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  <SelectItem value="inativo">Inativos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                <Checkbox
                  checked={allFilteredSelected}
                  onCheckedChange={toggleAllFiltered}
                  className="h-3.5 w-3.5"
                />
                Selecionar todos ({filtered.length})
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-primary">
                  {total} selecionado{total === 1 ? "" : "s"}
                </span>
                {total > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px] text-muted-foreground"
                    onClick={() => setSelectedIds([])}
                  >
                    Limpar
                  </Button>
                )}
              </div>
            </div>

            <div className="max-h-[45vh] overflow-y-auto rounded-md border border-border divide-y divide-border/60">
              {filtered.map((p) => {
                const checked = selectedSet.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleOne(p.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
                      checked ? "bg-primary/5" : "hover:bg-muted/50",
                    )}
                  >
                    <Checkbox checked={checked} className="h-4 w-4 pointer-events-none" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-tight truncate">{p.nome}</p>
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {maskCPFPartial(p.cpf)}
                      </span>
                    </div>
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum parceiro encontrado
                </div>
              )}
            </div>
          </div>
        ) : (
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
        )}

        <DialogFooter>
          {step === "select" ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={() => setStep("options")} disabled={total === 0} className="gap-2">
                Continuar
                <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep("select")} disabled={exporting} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Button>
              <Button
                onClick={handleExport}
                disabled={exporting || !passphraseValid || total === 0 || overLimit}
                className="gap-2"
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {isBatch ? `Exportar ${total}` : "Exportar"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
