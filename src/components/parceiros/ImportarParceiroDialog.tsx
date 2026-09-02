import { useState } from "react";
import { Upload, AlertTriangle, CheckCircle2, XCircle, Loader2 } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { maskCPFPartial } from "@/lib/validators";
import { parseExportFile, type ExportEnvelope } from "@/lib/partnerPortability/schema";
import { findPartnerMatch, MATCH_LABEL, type PartnerMatch } from "@/lib/partnerPortability/matchPartner";
import { applyPartnerImport, type ImportReport, type ImportResolution } from "@/lib/partnerPortability/applyImport";

interface ImportarParceiroDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string | null;
  onImported: (parceiroId: string) => void;
}

type Step = "select" | "preview" | "running" | "report";

export function ImportarParceiroDialog({
  open,
  onOpenChange,
  workspaceId,
  onImported,
}: ImportarParceiroDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("select");
  const [envelope, setEnvelope] = useState<ExportEnvelope | null>(null);
  const [match, setMatch] = useState<PartnerMatch | null>(null);
  const [resolution, setResolution] = useState<ImportResolution>("create");
  const [passphrase, setPassphrase] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setStep("select");
    setEnvelope(null);
    setMatch(null);
    setResolution("create");
    setPassphrase("");
    setReport(null);
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
      const parsed = parseExportFile(raw);
      if (!parsed.ok || !parsed.envelope) {
        setError(parsed.error ?? "Arquivo inválido.");
        return;
      }
      const found = await findPartnerMatch(parsed.envelope, workspaceId);
      setEnvelope(parsed.envelope);
      setMatch(found);
      setResolution(found?.strength === "cpf" ? "update" : "create");
      setStep("preview");
    } catch (e: any) {
      setError(e?.message ?? "Falha ao ler o arquivo.");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!envelope || !workspaceId) return;
    setStep("running");
    try {
      const result = await applyPartnerImport({
        envelope,
        workspaceId,
        resolution,
        existingPartnerId: match?.id ?? null,
        credentialsPassphrase: passphrase || undefined,
      });
      setReport(result);
      setStep("report");
      onImported(result.parceiroId);
    } catch (e: any) {
      setError(e?.message ?? "Falha na importação.");
      setStep("preview");
      toast({ title: "Erro na importação", description: e?.message, variant: "destructive" });
    }
  };

  const needsPassphrase = !!envelope?.secure;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar parceiro</DialogTitle>
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
                <Loader2 className="h-3 w-3 animate-spin" /> Validando arquivo...
              </p>
            )}
          </div>
        )}

        {step === "preview" && envelope && (
          <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
            <div>
              <p className="text-sm font-semibold">{envelope.partner.nome}</p>
              <p className="text-xs text-muted-foreground font-mono">
                {envelope.partner.cpf ? maskCPFPartial(envelope.partner.cpf) : "sem CPF"}
              </p>
            </div>

            <div className="space-y-1 text-sm">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Serão importados</p>
              <Line ok={envelope.categories.personal} text="Dados pessoais" />
              <Line ok={envelope.categories.contact} text="Contatos" />
              <Line ok={envelope.categories.address} text="Endereço" />
              <Line ok={envelope.categories.notes} text="Observações" />
              <Line
                ok={envelope.categories.banking && envelope.banking.length > 0}
                text={`${envelope.banking.length} conta(s) bancária(s)`}
              />
              <Line
                ok={envelope.categories.crypto && envelope.crypto.length > 0}
                text={`${envelope.crypto.length} carteira(s) cripto`}
              />
              <Line
                ok={envelope.categories.bookmakers && envelope.bookmakers.length > 0}
                text={`${envelope.bookmakers.length} casa(s)`}
              />
              <Line ok={false} text="Histórico operacional e financeiro" />
            </div>

            {envelope.categories.bookmakers && envelope.bookmakers.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {envelope.bookmakers.map((b) => (
                  <Badge key={b.ext_id} variant="secondary" className="text-[11px]">
                    {b.nome}
                  </Badge>
                ))}
              </div>
            )}

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

            {match && (
              <>
                <Separator />
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Possível parceiro já existente neste workspace: <b>{match.nome}</b> (
                    {MATCH_LABEL[match.strength]}).
                  </AlertDescription>
                </Alert>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={resolution === "update" ? "default" : "outline"}
                    onClick={() => setResolution("update")}
                  >
                    Atualizar existente
                  </Button>
                  <Button
                    size="sm"
                    variant={resolution === "create" ? "default" : "outline"}
                    disabled={match.strength === "cpf"}
                    onClick={() => setResolution("create")}
                  >
                    Criar novo
                  </Button>
                </div>
                {match.strength === "cpf" && (
                  <p className="text-[11px] text-muted-foreground">
                    Criar novo está bloqueado: o CPF é único por workspace.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {step === "running" && (
          <div className="py-8 flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Importando...
          </div>
        )}

        {step === "report" && report && (
          <div className="space-y-2 text-sm max-h-[55vh] overflow-y-auto pr-1">
            <p className="font-semibold">Importação concluída.</p>
            <Line ok text={report.created ? "Parceiro criado" : "Parceiro atualizado"} />
            <Line ok={report.banksImported > 0} text={`${report.banksImported} banco(s) importado(s)`} />
            <Line ok={report.walletsImported > 0} text={`${report.walletsImported} carteira(s) importada(s)`} />
            <Line ok={report.bookmakersImported > 0} text={`${report.bookmakersImported} casa(s) importada(s)`} />
            {report.banksSkipped + report.walletsSkipped + report.bookmakersSkipped > 0 && (
              <Line
                ok={false}
                text={`${report.banksSkipped + report.walletsSkipped + report.bookmakersSkipped} item(ns) ignorado(s) por duplicidade ou conflito`}
              />
            )}
            {report.lines
              .filter((l) => !l.ok)
              .map((l, i) => (
                <p key={i} className="text-[11px] text-muted-foreground">
                  • {l.label}: {l.detail}
                </p>
              ))}
          </div>
        )}

        <DialogFooter>
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => close(false)}>
                Cancelar
              </Button>
              <Button onClick={handleConfirm} className="gap-2">
                <Upload className="h-4 w-4" />
                Confirmar importação
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
