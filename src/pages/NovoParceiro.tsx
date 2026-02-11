import { useState } from "react";
import { ArrowLeft, Save, UserPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { validateCPF } from "@/lib/validators";

const NovoParceiro = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    nome: "",
    cpf: "",
    email: "",
    telefone: "",
    dataNascimento: "",
    endereco: "",
    cep: "",
    cidade: "",
    usuario: "",
    senha: "",
    status: "ATIVO",
    notas: "",
  });

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const formatCPF = (value: string) => {
    const digits = value.replace(/\D/g, "");
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
      .slice(0, 14);
  };

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "");
    return digits
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{5})(\d)/, "$1-$2")
      .slice(0, 15);
  };

  const formatCEP = (value: string) => {
    const digits = value.replace(/\D/g, "");
    return digits.replace(/(\d{5})(\d)/, "$1-$2").slice(0, 9);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const nomeTrimmed = formData.nome.trim();
    const cpfDigits = formData.cpf.replace(/\D/g, "");

    if (!nomeTrimmed) {
      toast({
        title: "Campo obrigatório",
        description: "Preencha o nome completo do parceiro",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    if (!validateCPF(cpfDigits)) {
      toast({
        title: "CPF inválido",
        description: "Informe um CPF válido com 11 dígitos",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    // Simular salvamento (CPF normalizado sem máscara)
    const dataToSave = {
      ...formData,
      nome: nomeTrimmed,
      cpf: cpfDigits,
    };

    setTimeout(() => {
      toast({
        title: "Parceiro cadastrado!",
        description: `${dataToSave.nome} foi adicionado com sucesso.`,
      });
      setIsSubmitting(false);
      navigate("/parceiros");
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="mb-8 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/parceiros")}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <UserPlus className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Novo Parceiro</h1>
              <p className="text-sm text-muted-foreground">
                Cadastre um novo afiliado no sistema
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mx-auto max-w-4xl space-y-6">
            {/* Dados Pessoais */}
            <Card className="border-border bg-gradient-surface p-6 shadow-soft">
              <h2 className="mb-6 text-xl font-semibold">Dados Pessoais</h2>
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="nome">
                    Nome Completo <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="nome"
                    placeholder="Nome completo do parceiro"
                    value={formData.nome}
                    onChange={(e) => handleChange("nome", e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cpf">
                    CPF <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="cpf"
                    placeholder="000.000.000-00"
                    value={formData.cpf}
                    onChange={(e) => handleChange("cpf", formatCPF(e.target.value))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dataNascimento">Data de Nascimento</Label>
                  <Input
                    id="dataNascimento"
                    type="date"
                    value={formData.dataNascimento}
                    onChange={(e) => handleChange("dataNascimento", e.target.value)}
                  />
                </div>
              </div>
            </Card>

            {/* Contato */}
            <Card className="border-border bg-gradient-surface p-6 shadow-soft">
              <h2 className="mb-6 text-xl font-semibold">Contato</h2>
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="email@exemplo.com"
                    value={formData.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telefone">Telefone</Label>
                  <Input
                    id="telefone"
                    placeholder="(00) 00000-0000"
                    value={formData.telefone}
                    onChange={(e) => handleChange("telefone", formatPhone(e.target.value))}
                  />
                </div>
              </div>
            </Card>

            {/* Endereço */}
            <Card className="border-border bg-gradient-surface p-6 shadow-soft">
              <h2 className="mb-6 text-xl font-semibold">Endereço</h2>
              <div className="grid gap-6">
                <div className="grid gap-6 sm:grid-cols-3">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="endereco">Logradouro</Label>
                    <Input
                      id="endereco"
                      placeholder="Rua, Av, etc"
                      value={formData.endereco}
                      onChange={(e) => handleChange("endereco", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cep">CEP</Label>
                    <Input
                      id="cep"
                      placeholder="00000-000"
                      value={formData.cep}
                      onChange={(e) => handleChange("cep", formatCEP(e.target.value))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cidade">Cidade</Label>
                  <Input
                    id="cidade"
                    placeholder="Cidade - UF"
                    value={formData.cidade}
                    onChange={(e) => handleChange("cidade", e.target.value)}
                  />
                </div>
              </div>
            </Card>

            {/* Credenciais */}
            <Card className="border-border bg-gradient-surface p-6 shadow-soft">
              <h2 className="mb-6 text-xl font-semibold">Credenciais de Acesso</h2>
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="usuario">Usuário</Label>
                  <Input
                    id="usuario"
                    placeholder="Nome de usuário"
                    value={formData.usuario}
                    onChange={(e) => handleChange("usuario", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="senha">Senha</Label>
                  <Input
                    id="senha"
                    type="password"
                    placeholder="••••••••"
                    value={formData.senha}
                    onChange={(e) => handleChange("senha", e.target.value)}
                  />
                </div>
              </div>
            </Card>

            {/* Status e Observações */}
            <Card className="border-border bg-gradient-surface p-6 shadow-soft">
              <h2 className="mb-6 text-xl font-semibold">Configurações</h2>
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => handleChange("status", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ATIVO">Ativo</SelectItem>
                      <SelectItem value="INATIVO">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notas">Observações</Label>
                  <Textarea
                    id="notas"
                    placeholder="Notas internas sobre o parceiro..."
                    rows={4}
                    value={formData.notas}
                    onChange={(e) => handleChange("notas", e.target.value)}
                  />
                </div>
              </div>
            </Card>

            {/* Actions */}
            <div className="flex gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/parceiros")}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 gap-2 shadow-glow"
              >
                {isSubmitting ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Cadastrar Parceiro
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
};

export default NovoParceiro;
