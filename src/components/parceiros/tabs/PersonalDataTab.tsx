import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Copy, Check, AlertTriangle, Truck } from "lucide-react";
import { PhoneInput } from "../PhoneInput";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { StarRating } from "../StarRating";
import { formatCPF, formatCEP } from "@/lib/validators";

interface PersonalDataTabProps {
  nome: string;
  setNome: (val: string) => void;
  cpf: string;
  setCpf: (val: string) => void;
  email: string;
  setEmail: (val: string) => void;
  telefone: string;
  setTelefone: (val: string) => void;
  dataNascimento: string;
  setDataNascimento: (val: string) => void;
  endereco: string;
  setEndereco: (val: string) => void;
  cidade: string;
  setCidade: (val: string) => void;
  cep: string;
  setCep: (val: string) => void;
  status: string;
  setStatus: (val: string) => void;
  observacoes: string;
  setObservacoes: (val: string) => void;
  fornecedorOrigemId: string | null;
  setFornecedorOrigemId: (val: string | null) => void;
  fornecedores: any[];
  qualidade: number | null;
  setQualidade: (val: number | null) => void;
  loading: boolean;
  viewMode: boolean;
  cpfError: string;
  telefoneError: string;
  checkingCpf: boolean;
  planLimitError: string | null;
  copyToClipboard: (text: string, label: string) => void;
  copiedField: string;
}

export function PersonalDataTab({
  nome, setNome, cpf, setCpf, email, setEmail, telefone, setTelefone,
  dataNascimento, setDataNascimento, endereco, setEndereco, cidade, setCidade,
  cep, setCep, status, setStatus, observacoes, setObservacoes,
  fornecedorOrigemId, setFornecedorOrigemId, fornecedores,
  qualidade, setQualidade, loading, viewMode,
  cpfError, telefoneError, checkingCpf, planLimitError,
  copyToClipboard, copiedField
}: PersonalDataTabProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="md:col-span-2">
        <Label htmlFor="nome">Nome Completo *</Label>
        <div className="flex gap-2">
          <Input
            id="parceiro-nome-field"
            value={nome}
            onChange={(e) => setNome(e.target.value.toUpperCase())}
            required
            disabled={loading || viewMode}
            className="uppercase"
          />
        </div>
      </div>
      <div>
        <Label htmlFor="cpf">CPF *</Label>
        <div className="flex gap-2">
          <Input
            id="parceiro-cpf-field"
            value={cpf}
            onChange={(e) => setCpf(formatCPF(e.target.value))}
            placeholder="000.000.000-00"
            maxLength={14}
            required
            disabled={loading || viewMode}
            className={cpfError ? "border-red-500" : ""}
          />
        </div>
        {checkingCpf && (
          <p className="text-xs text-muted-foreground mt-1">Verificando CPF...</p>
        )}
        {cpfError && (
          <p className="text-xs text-red-500 mt-1">{cpfError}</p>
        )}
      </div>
      <div>
        <Label htmlFor="dataNascimento">Data de Nascimento <span className="text-xs text-muted-foreground font-normal">(opcional)</span></Label>
        <DatePickerInput
          value={dataNascimento}
          onChange={setDataNascimento}
          disabled={loading || viewMode}
          minAge={18}
        />
      </div>
      <div>
        <Label htmlFor="email">Email <span className="text-xs text-muted-foreground font-normal">(opcional)</span></Label>
        <Input
          id="parceiro-email-field"
          type="text"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading || viewMode}
        />
      </div>
      <div>
        <Label htmlFor="telefone">Telefone <span className="text-xs text-muted-foreground font-normal">(opcional)</span></Label>
        <PhoneInput
          value={telefone}
          onChange={setTelefone}
          disabled={loading || viewMode}
        />
        {telefoneError && (
          <p className="text-xs text-red-500 mt-1">{telefoneError}</p>
        )}
      </div>
      <div>
        <Label htmlFor="endereco">Endereço <span className="text-xs text-muted-foreground/60 ml-1">(opcional)</span></Label>
        <Input
          id="parceiro-endereco-field"
          value={endereco}
          onChange={(e) => setEndereco(e.target.value.toUpperCase())}
          className="uppercase"
          placeholder="Rua, número"
          disabled={loading || viewMode}
        />
      </div>
      <div>
        <Label htmlFor="cidade">Cidade - UF <span className="text-xs text-muted-foreground/60 ml-1">(opcional)</span></Label>
        <Input
          id="parceiro-cidade-field"
          value={cidade}
          onChange={(e) => setCidade(e.target.value.toUpperCase())}
          className="uppercase"
          placeholder="SÃO PAULO - SP"
          disabled={loading || viewMode}
        />
      </div>
      <div>
        <Label htmlFor="cep">CEP <span className="text-xs text-muted-foreground/60 ml-1">(opcional)</span></Label>
        <Input
          id="parceiro-cep-field"
          value={cep}
          onChange={(e) => setCep(formatCEP(e.target.value))}
          placeholder="00000-000"
          maxLength={9}
          disabled={loading || viewMode}
        />
      </div>
      <div className="md:col-span-2 mt-8">
        <Label htmlFor="status" className="text-center block mb-2">Status</Label>
        <Select value={status} onValueChange={setStatus} disabled={loading || viewMode}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione o status" className="text-center" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="inativo">Inativo</SelectItem>
          </SelectContent>
        </Select>
        {planLimitError && (
          <Alert variant="destructive" className="mt-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{planLimitError}</AlertDescription>
          </Alert>
        )}
      </div>
      <div className="md:col-span-2 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fornecedor_origem">
            Fornecedor Gerenciador
            <span className="text-xs text-muted-foreground/60 ml-1">(opcional)</span>
          </Label>
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select
              value={fornecedorOrigemId || "none"}
              onValueChange={(val) => setFornecedorOrigemId(val === "none" ? null : val)}
              disabled={loading || viewMode}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Sem fornecedor (gestão interna)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem fornecedor (gestão interna)</SelectItem>
                {fornecedores.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Qualidade do parceiro <span className="text-xs text-muted-foreground/60 ml-1">(opcional)</span></Label>
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2">
            <StarRating
              value={qualidade}
              onChange={(v) => !loading && !viewMode && setQualidade(v)}
              readOnly={loading || viewMode}
              size="md"
              showLabel
            />
            {qualidade != null && !viewMode && (
              <button
                type="button"
                onClick={() => setQualidade(null)}
                className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
                disabled={loading}
              >
                Limpar
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="md:col-span-2">
        <Label htmlFor="observacoes">Observações <span className="text-xs text-muted-foreground/60 ml-1">(opcional)</span></Label>
        <Textarea
          id="observacoes"
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          rows={3}
          disabled={loading || viewMode}
        />
      </div>
    </div>
  );
}