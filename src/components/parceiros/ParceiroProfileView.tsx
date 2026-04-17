import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  User,
  Mail,
  Phone,
  Calendar,
  MapPin,
  Home,
  Hash,
  IdCard,
  FileText,
  Copy,
  Check,
  Cake,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { StarRating } from "./StarRating";

interface ParceiroProfileViewProps {
  nome: string;
  cpf: string;
  email: string;
  telefone: string;
  dataNascimento: string;
  endereco: string;
  cidade: string;
  cep: string;
  status: string;
  observacoes: string;
  qualidade?: number | null;
}

/* ──────────────────────────────────────────────────────────────
 * InfoRow: linha read-only "label em cima, valor embaixo".
 * Botão de copiar aparece no hover (desktop) ou sempre (mobile).
 * ────────────────────────────────────────────────────────────── */
function InfoRow({
  icon: Icon,
  label,
  value,
  copyValue,
  copyKey,
  mono,
  copiedField,
  onCopy,
}: {
  icon: React.ElementType;
  label: string;
  value: string | null | undefined;
  copyValue?: string;
  copyKey: string;
  mono?: boolean;
  copiedField: string;
  onCopy: (text: string, key: string) => void;
}) {
  const isEmpty = !value || value.trim() === "";
  const copied = copiedField === copyKey;

  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors",
        !isEmpty && "hover:bg-muted/40"
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/50">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {isEmpty ? (
          <p className="mt-0.5 text-sm italic text-muted-foreground/60">
            Não informado
          </p>
        ) : (
          <p
            className={cn(
              "mt-0.5 break-words text-sm font-medium text-foreground",
              mono && "font-mono"
            )}
          >
            {value}
          </p>
        )}
      </div>
      {!isEmpty && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100"
          onClick={() => onCopy(copyValue ?? value!, copyKey)}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-success" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </Button>
      )}
    </div>
  );
}

/* Calcula idade a partir de YYYY-MM-DD */
function calcularIdade(dataNasc: string): number | null {
  if (!dataNasc) return null;
  const nasc = new Date(dataNasc);
  if (isNaN(nasc.getTime())) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
}

/* Formata YYYY-MM-DD -> DD/MM/YYYY */
function formatarData(dataNasc: string): string {
  if (!dataNasc) return "";
  const [y, m, d] = dataNasc.split("-");
  if (!y || !m || !d) return dataNasc;
  return `${d}/${m}/${y}`;
}

/* Iniciais do nome para o avatar */
function getIniciais(nome: string): string {
  if (!nome) return "?";
  const partes = nome.trim().split(/\s+/);
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export function ParceiroProfileView({
  nome,
  cpf,
  email,
  telefone,
  dataNascimento,
  endereco,
  cidade,
  cep,
  status,
  observacoes,
  qualidade,
}: ParceiroProfileViewProps) {
  const [copiedField, setCopiedField] = useState("");
  const { toast } = useToast();

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(key);
      toast({ title: "Copiado!", description: `${key} copiado.` });
      setTimeout(() => setCopiedField(""), 2000);
    } catch {
      toast({
        title: "Erro ao copiar",
        description: "Não foi possível copiar o texto.",
        variant: "destructive",
      });
    }
  };

  const idade = calcularIdade(dataNascimento);
  const dataFormatada = formatarData(dataNascimento);
  const dataLabel =
    dataFormatada && idade !== null
      ? `${dataFormatada} · ${idade} anos`
      : dataFormatada || "";

  // Telefone limpo para copiar (sem máscara, sem 55)
  const telefoneCopy = telefone
    ? (() => {
        const d = telefone.replace(/\D/g, "");
        return d.startsWith("55") ? d.slice(2) : d;
      })()
    : "";

  // Endereço completo para uma linha visual
  const enderecoLinha = [endereco, cidade, cep ? `CEP ${cep}` : ""]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-6">
      {/* ── HERO HEADER ─────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-primary/5 via-background to-background p-5">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div
            className={cn(
              "flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-lg font-bold ring-2 ring-background",
              status === "ativo"
                ? "bg-primary/15 text-primary"
                : "bg-muted text-muted-foreground"
            )}
          >
            {getIniciais(nome)}
          </div>

          {/* Nome + status + cpf */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-xl font-bold leading-tight text-foreground">
                {nome || "Sem nome"}
              </h2>
              <Badge
                variant={status === "ativo" ? "default" : "secondary"}
                className={cn(
                  "text-xs",
                  status === "ativo"
                    ? "bg-success/15 text-success hover:bg-success/20"
                    : "bg-warning/15 text-warning hover:bg-warning/20"
                )}
              >
                {status === "ativo" ? "Ativo" : "Inativo"}
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className="font-mono">{cpf || "—"}</span>
              {dataLabel && (
                <>
                  <span className="text-border">•</span>
                  <span className="inline-flex items-center gap-1">
                    <Cake className="h-3.5 w-3.5" />
                    {dataLabel}
                  </span>
                </>
              )}
            </div>
            {qualidade != null && qualidade > 0 && (
              <div className="mt-2">
                <StarRating value={qualidade} readOnly size="sm" showLabel />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── IDENTIFICAÇÃO ───────────────────────────────────── */}
      <section>
        <header className="mb-2 flex items-center gap-2 px-1">
          <IdCard className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">
            Identificação
          </h3>
        </header>
        <div className="rounded-xl border border-border bg-card/30 p-1.5">
          <InfoRow
            icon={User}
            label="Nome completo"
            value={nome}
            copyKey="Nome"
            copiedField={copiedField}
            onCopy={handleCopy}
          />
          <Separator className="my-0.5 opacity-50" />
          <div className="grid gap-0.5 md:grid-cols-2">
            <InfoRow
              icon={Hash}
              label="CPF"
              value={cpf}
              copyValue={cpf.replace(/\D/g, "")}
              copyKey="CPF"
              mono
              copiedField={copiedField}
              onCopy={handleCopy}
            />
            <InfoRow
              icon={Calendar}
              label="Data de nascimento"
              value={dataLabel}
              copyValue={dataFormatada}
              copyKey="Nascimento"
              copiedField={copiedField}
              onCopy={handleCopy}
            />
          </div>
        </div>
      </section>

      {/* ── CONTATO ─────────────────────────────────────────── */}
      <section>
        <header className="mb-2 flex items-center gap-2 px-1">
          <Phone className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Contato</h3>
        </header>
        <div className="rounded-xl border border-border bg-card/30 p-1.5">
          <div className="grid gap-0.5 md:grid-cols-2">
            <InfoRow
              icon={Mail}
              label="Email"
              value={email}
              copyKey="Email"
              copiedField={copiedField}
              onCopy={handleCopy}
            />
            <InfoRow
              icon={Phone}
              label="Telefone"
              value={telefone}
              copyValue={telefoneCopy}
              copyKey="Telefone"
              copiedField={copiedField}
              onCopy={handleCopy}
            />
          </div>
          {(endereco || cidade || cep) && (
            <>
              <Separator className="my-0.5 opacity-50" />
              <InfoRow
                icon={MapPin}
                label="Endereço"
                value={enderecoLinha}
                copyValue={[endereco, cidade, cep].filter(Boolean).join(", ")}
                copyKey="Endereço"
                copiedField={copiedField}
                onCopy={handleCopy}
              />
            </>
          )}
        </div>
      </section>

      {/* ── OBSERVAÇÕES ─────────────────────────────────────── */}
      {observacoes && observacoes.trim() !== "" && (
        <section>
          <header className="mb-2 flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">
                Observações
              </h3>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => handleCopy(observacoes, "Observações")}
            >
              {copiedField === "Observações" ? (
                <>
                  <Check className="h-3.5 w-3.5 text-success" />
                  Copiado
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copiar tudo
                </>
              )}
            </Button>
          </header>
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-foreground/90">
              {observacoes}
            </pre>
          </div>
        </section>
      )}
    </div>
  );
}

export default ParceiroProfileView;
