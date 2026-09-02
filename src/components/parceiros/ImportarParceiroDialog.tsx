import { useMemo, useState } from "react";
import { Upload, AlertTriangle, CheckCircle2, XCircle, Loader2, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { labelBookmakerStatus, resolveImportState } from "@/lib/partnerPortability/bookmakerState";
import { maskCPFPartial } from "@/lib/validators";
import { parseImportFile, type ExportEnvelope } from "@/lib/partnerPortability/schema";
import { findPartnerMatch, MATCH_LABEL, type PartnerMatch } from "@/lib/partnerPortability/matchPartner";
import {
  applyPartnerImport,
  planBookmakerImport,
  type BookmakerPlan,
  type ImportReport,
  type ImportResolution,
} from "@/lib/partnerPortability/applyImport";

interface ImportarParceiroDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string | null;
  onImported: (parceiroId: string) => void;
}

type Step = "select" | "preview" | "running" | "report";

interface PartnerEntry {
  envelope: ExportEnvelope;
  match: PartnerMatch | null;
  resolution: ImportResolution;
  include: boolean;
  /** Preview das casas contra o parceiro encontrado no destino. */
  housePlan: BookmakerPlan;
}

interface PartnerOutcome {
  nome: string;
  ok: boolean;
  created?: boolean;
  detail?: string;
  report?: ImportReport;
}

/** Resumo "2 Ativa · 1 Limitada" dos estados das casas do envelope. */
function summarizeStates(bookmakers: { status?: string | null }[]): string {
  const counts = new Map<string, number>();
  bookmakers.forEach((b) => {
    const state = resolveImportState(b.status).status;
    counts.set(state, (counts.get(state) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([state, count]) => `${count} ${labelBookmakerStatus(state)}`)
    .join(" · ");
}

export function ImportarParceiroDialog({
  open,
  onOpenChange,
  workspaceId,
  onImported,
}: ImportarParceiroDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("select");
  const [entries, setEntries] = useState<PartnerEntry[]>([]);
  const [passphrase, setPassphrase] = useState("");
  const [outcomes, setOutcomes] = useState<PartnerOutcome[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setStep("select");
    setEntries([]);
    setPassphrase("");
    setOutcomes([]);
    setProgress({ done: 0, total: 0 });
    setError(null);
    setBusy(false);
  };

  const close = (value: boolean) => {
    if (!value) reset();
    onOpenChange(value);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file || !workspaceId) return;
    setBusy(true);
    setError(null);
    try {
      const raw = await file.text();
      const parsed = parseImportFile(raw);
      if (!parsed.ok || !parsed.partners) {
        setError(parsed.error ?? "Arquivo inválido.");
        return;
      }

      // Duplicidade avaliada EXCLUSIVAMENTE no workspace de destino.
      const built: PartnerEntry[] = [];
      for (const envelope of parsed.partners) {
        const match = await findPartnerMatch(envelope, workspaceId);
        const housePlan = await planBookmakerImport(envelope, workspaceId, match?.id ?? null);
        built.push({
          envelope,
          match,
          resolution: match ? "update" : "create",
          include: true,
          housePlan,
        });
      }
      setEntries(built);
      setStep("preview");
    } catch (e: any) {
      setError(e?.message ?? "Falha ao ler o arquivo.");
    } finally {
      setBusy(false);
    }
  };

  const stats = useMemo(() => {
    const novos = entries.filter((e) => !e.match).length;
    const existentes = entries.filter((e) => !!e.match).length;
    const conflitos = entries.filter((e) => e.match && e.match.strength !== "cpf").length;
    return { total: entries.length, novos, existentes, conflitos };
  }, [entries]);

  const setResolution = (index: number, resolution: ImportResolution) => {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, resolution } : e)));
  };

  const applyToAll = (resolution: ImportResolution) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.match && !(resolution === "create" && e.match.strength === "cpf")
          ? { ...e, resolution }
          : e,
      ),
    );
  };

  const toggleInclude = (index: number) => {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, include: !e.include } : e)));
  };

  const handleConfirm = async () => {
    if (!workspaceId) return;
    const selected = entries.filter((e) => e.include);
    if (selected.length === 0) return;

    setStep("running");
    setProgress({ done: 0, total: selected.length });
    const results: PartnerOutcome[] = [];
    let lastCreatedId: string | null = null;

    // Sequencial e com erro isolado: um parceiro inválido não interrompe os demais.
    for (const entry of selected) {
      try {
        const result = await applyPartnerImport({
          envelope: entry.envelope,
          workspaceId,
          resolution: entry.resolution,
          existingPartnerId: entry.match?.id ?? null,
          credentialsPassphrase: passphrase || undefined,
        });
        lastCreatedId = result.parceiroId;
        results.push({
          nome: entry.envelope.partner.nome,
          ok: true,
          created: result.created,
          report: result,
        });
      } catch (e: any) {
        results.push({
          nome: entry.envelope.partner.nome,
          ok: false,
          detail: e?.message ?? "Falha na importação",
        });
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
      setOutcomes([...results]);
    }

    setOutcomes(results);
    setStep("report");
    if (lastCreatedId) onImported(lastCreatedId);

    const failed = results.filter((r) => !r.ok).length;
    if (failed > 0) {
      toast({
        title: "Importação concluída com falhas",
        description: `${results.length - failed} importado(s), ${failed} com erro.`,
        variant: "destructive",
      });
    }
  };

  const needsPassphrase = entries.some((e) => !!e.envelope.secure);
  const includedCount = entries.filter((e) => e.include).length;

  const aggregate = useMemo(() => {
    return outcomes.reduce(
      (acc, o) => {
        if (!o.ok) return { ...acc, erros: acc.erros + 1 };
        return {
          criados: acc.criados + (o.created ? 1 : 0),
          atualizados: acc.atualizados + (o.created ? 0 : 1),
          bancos: acc.bancos + (o.report?.banksImported ?? 0),
          wallets: acc.wallets + (o.report?.walletsImported ?? 0),
          casas: acc.casas + (o.report?.bookmakersImported ?? 0),
          casasExistentes: acc.casasExistentes + (o.report?.bookmakersExisting ?? 0),
          erros: acc.erros,
        };
      },
      { criados: 0, atualizados: 0, bancos: 0, wallets: 0, casas: 0, casasExistentes: 0, erros: 0 },
    );
  }, [outcomes]);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Importar parceiros</DialogTitle>
          <DialogDescription>
            Apenas dados cadastrais são importados. Nenhum saldo, aposta ou lançamento financeiro
            do workspace de origem é transportado.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        {step === "select" && (
          <div className="space-y-3">
            <Label htmlFor="import-file" className="text-sm">
              Selecione o arquivo .labbet
            </Label>
            <Input
              id="import-file"
              type="file"
              accept=".labbet,application/json"
              disabled={busy}
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            {busy && (
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Validando arquivo e checando
                duplicidades...
              </p>
            )}
          </div>
        )}

        {step === "preview" && entries.length > 0 && (
          <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary" className="gap-1">
                <Users className="h-3 w-3" />
                {stats.total} encontrado(s)
              </Badge>
              <Badge variant="outline">{stats.novos} novo(s)</Badge>
              <Badge variant="outline">{stats.existentes} já existente(s)</Badge>
              {stats.conflitos > 0 && (
                <Badge variant="destructive">{stats.conflitos} com conflito</Badge>
              )}
            </div>

            {stats.existentes > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Aplicar a todos:</span>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => applyToAll("update")}>
                  Atualizar existentes
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => applyToAll("create")}>
                  Criar novos
                </Button>
              </div>
            )}

            <Separator />

            <div className="space-y-2">
              {entries.map((entry, index) => (
                <div
                  key={`${entry.envelope.source_fingerprint}-${index}`}
                  className="rounded-lg border border-border p-2.5 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{entry.envelope.partner.nome}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        {entry.envelope.partner.cpf
                          ? maskCPFPartial(entry.envelope.partner.cpf)
                          : "sem CPF"}
                        {" · "}
                        {entry.envelope.banking.length} banco(s) · {entry.envelope.crypto.length}{" "}
                        wallet(s) · {entry.envelope.bookmakers.length} casa(s)
                      </p>
                      {entry.envelope.bookmakers.length > 0 && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Estados:{" "}
                          {summarizeStates(entry.envelope.bookmakers)}
                        </p>
                      )}
                      {entry.envelope.bookmakers.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          <p className="text-[11px] text-muted-foreground">
                            Casas:{" "}
                            {entry.resolution === "create"
                              ? `${entry.envelope.bookmakers.length} nova(s) — parceiro novo`
                              : `${entry.housePlan.existentes} já existente(s) · ${entry.housePlan.novas} nova(s)`}
                          </p>
                          {entry.resolution === "update" &&
                            entry.housePlan.items.map((item, i) => (
                              <p key={i} className="text-[11px] pl-2">
                                <span className="text-muted-foreground">{item.nome}</span>{" "}
                                <span className={item.exists ? "text-warning" : "text-success"}>
                                  {item.exists ? "— já existe, não será duplicada" : "— nova, será criada"}
                                </span>
                              </p>
                            ))}
                        </div>
                      )}
                    </div>

                    <Button
                      size="sm"
                      variant={entry.include ? "outline" : "ghost"}
                      className="h-7 text-[11px] shrink-0"
                      onClick={() => toggleInclude(index)}
                    >
                      {entry.include ? "Incluído" : "Ignorado"}
                    </Button>
                  </div>

                  {entry.match ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] text-warning">
                        Já existe: {entry.match.nome} ({MATCH_LABEL[entry.match.strength]})
                      </span>
                      <Button
                        size="sm"
                        variant={entry.resolution === "update" ? "default" : "outline"}
                        className="h-6 text-[11px]"
                        onClick={() => setResolution(index, "update")}
                      >
                        Atualizar
                      </Button>
                      <Button
                        size="sm"
                        variant={entry.resolution === "create" ? "default" : "outline"}
                        className="h-6 text-[11px]"
                        disabled={entry.match.strength === "cpf"}
                        onClick={() => setResolution(index, "create")}
                      >
                        Criar novo
                      </Button>
                    </div>
                  ) : (
                    <p className="text-[11px] text-success">Será criado neste workspace</p>
                  )}

                  {entry.match && entry.resolution === "create" && (
                    <p className="text-[11px] text-warning">
                      Atenção: um novo registro de parceiro será criado e todas as casas do arquivo
                      serão recriadas nele, mesmo que já existam em {entry.match.nome}.
                    </p>
                  )}
                </div>
              ))}
            </div>

            {needsPassphrase && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label htmlFor="import-pass" className="text-xs">
                    Senha de proteção do pacote de credenciais
                  </Label>
                  <Input
                    id="import-pass"
                    type="password"
                    autoComplete="off"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Sem a senha, as casas são importadas sem credenciais.
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {step === "running" && (
          <div className="py-8 flex flex-col items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Importando {progress.done}/{progress.total}...
            <Progress
              value={progress.total ? Math.round((progress.done / progress.total) * 100) : 0}
              className="h-1.5 w-full"
            />
          </div>
        )}

        {step === "report" && (
          <div className="space-y-2 text-sm max-h-[55vh] overflow-y-auto pr-1">
            <p className="font-semibold">Importação concluída.</p>
            <Line ok={aggregate.criados > 0} text={`${aggregate.criados} parceiro(s) criado(s)`} />
            <Line
              ok={aggregate.atualizados > 0}
              text={`${aggregate.atualizados} parceiro(s) atualizado(s)`}
            />
            <Line ok={aggregate.bancos > 0} text={`${aggregate.bancos} conta(s) bancária(s)`} />
            <Line ok={aggregate.wallets > 0} text={`${aggregate.wallets} carteira(s) cripto`} />
            <Line ok={aggregate.casas > 0} text={`${aggregate.casas} casa(s) criada(s)`} />
            {aggregate.casasExistentes > 0 && (
              <Line
                ok
                text={`${aggregate.casasExistentes} casa(s) já existente(s) — não duplicada(s)`}
              />
            )}
            {aggregate.erros > 0 && <Line ok={false} text={`${aggregate.erros} parceiro(s) com erro`} />}

            <Separator />
            {outcomes.map((o, i) => (
              <div key={i} className="text-[11px]">
                <p className={o.ok ? "text-muted-foreground" : "text-destructive"}>
                  • {o.nome}: {o.ok ? (o.created ? "criado" : "atualizado") : o.detail}
                </p>
                {o.report?.lines
                  .filter((l) => !l.ok)
                  .map((l, j) => (
                    <p key={j} className="pl-3 text-muted-foreground">
                      – {l.label}: {l.detail}
                    </p>
                  ))}
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => close(false)}>
                Cancelar
              </Button>
              <Button onClick={handleConfirm} className="gap-2" disabled={includedCount === 0}>
                <Upload className="h-4 w-4" />
                Importar {includedCount}
              </Button>
            </>
          )}
          {(step === "select" || step === "report") && (
            <Button variant={step === "report" ? "default" : "outline"} onClick={() => close(false)}>
              Fechar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Line({ ok, text }: { ok: boolean; text: string }) {
  return (
    <p className="flex items-center gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      )}
      <span className={ok ? "" : "text-muted-foreground"}>{text}</span>
    </p>
  );
}
