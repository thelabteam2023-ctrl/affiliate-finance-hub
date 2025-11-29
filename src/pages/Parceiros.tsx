import { useState } from "react";
import { Plus, Search, Eye, EyeOff, Edit, Trash2, Building2, Wallet, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";

interface Parceiro {
  id: string;
  nome: string;
  sobrenome: string;
  cpf: string;
  email: string;
  telefone: string;
  status: "ATIVO" | "INATIVO";
  dataNascimento: string;
  endereco: string;
  cidade: string;
  notas: string;
  bancos: number;
  wallets: number;
  casas: number;
}

// Mock data
const mockParceiros: Parceiro[] = [
  {
    id: "1",
    nome: "Felipe",
    sobrenome: "Santos",
    cpf: "123.456.789-00",
    email: "felipe@example.com",
    telefone: "(11) 98765-4321",
    status: "ATIVO",
    dataNascimento: "1990-05-15",
    endereco: "Rua das Flores, 123",
    cidade: "São Paulo",
    notas: "Parceiro premium",
    bancos: 3,
    wallets: 2,
    casas: 15,
  },
  {
    id: "2",
    nome: "Maria",
    sobrenome: "Silva",
    cpf: "987.654.321-00",
    email: "maria@example.com",
    telefone: "(21) 91234-5678",
    status: "ATIVO",
    dataNascimento: "1988-08-22",
    endereco: "Av. Paulista, 1000",
    cidade: "Rio de Janeiro",
    notas: "",
    bancos: 2,
    wallets: 1,
    casas: 8,
  },
];

const Parceiros = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("TODOS");
  const [showCPF, setShowCPF] = useState(false);
  const [parceiros] = useState<Parceiro[]>(mockParceiros);

  const filteredParceiros = parceiros.filter((p) => {
    const matchesSearch =
      p.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sobrenome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.cpf.includes(searchTerm) ||
      p.email.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === "TODOS" || p.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const maskCPF = (cpf: string) => {
    if (showCPF) return cpf;
    return cpf.replace(/\d(?=\d{4})/g, "*");
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Gestão de Parceiros</h1>
              <p className="text-sm text-muted-foreground">
                Cadastro e controle de afiliados
              </p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Card className="border-border bg-gradient-surface p-4 shadow-soft">
            <div className="text-sm text-muted-foreground">Total Parceiros</div>
            <div className="mt-1 text-3xl font-bold">{parceiros.length}</div>
          </Card>
          <Card className="border-border bg-gradient-surface p-4 shadow-soft">
            <div className="text-sm text-muted-foreground">Ativos</div>
            <div className="mt-1 text-3xl font-bold text-success">
              {parceiros.filter((p) => p.status === "ATIVO").length}
            </div>
          </Card>
          <Card className="border-border bg-gradient-surface p-4 shadow-soft">
            <div className="text-sm text-muted-foreground">Inativos</div>
            <div className="mt-1 text-3xl font-bold text-muted-foreground">
              {parceiros.filter((p) => p.status === "INATIVO").length}
            </div>
          </Card>
        </div>

        {/* Toolbar */}
        <Card className="mb-6 border-border bg-gradient-surface p-4 shadow-soft">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, CPF ou email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">Todos</SelectItem>
                  <SelectItem value="ATIVO">Ativos</SelectItem>
                  <SelectItem value="INATIVO">Inativos</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowCPF(!showCPF)}
                className="shrink-0"
              >
                {showCPF ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </Button>
            </div>
            <Button
              onClick={() => navigate("/parceiros/novo")}
              className="gap-2 shadow-glow"
            >
              <Plus className="h-4 w-4" />
              Novo Parceiro
            </Button>
          </div>
        </Card>

        {/* Parceiros Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredParceiros.map((parceiro) => (
            <Card
              key={parceiro.id}
              className="group relative overflow-hidden border-border bg-gradient-surface p-5 shadow-soft transition-all hover:shadow-medium hover:border-primary/50"
            >
              {/* Status Badge */}
              <div className="absolute right-3 top-3">
                <Badge
                  variant={parceiro.status === "ATIVO" ? "default" : "secondary"}
                  className={
                    parceiro.status === "ATIVO"
                      ? "bg-success/20 text-success border-success/30"
                      : ""
                  }
                >
                  {parceiro.status}
                </Badge>
              </div>

              {/* Nome */}
              <div className="mb-4 pr-20">
                <h3 className="text-xl font-bold">
                  {parceiro.nome} {parceiro.sobrenome}
                </h3>
                <p className="text-sm text-muted-foreground font-mono">
                  {maskCPF(parceiro.cpf)}
                </p>
              </div>

              {/* Contato */}
              <div className="mb-4 space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>📧</span>
                  <span className="truncate">{parceiro.email}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>📱</span>
                  <span>{parceiro.telefone}</span>
                </div>
              </div>

              {/* Contas */}
              <div className="mb-4 flex gap-4 border-t border-border pt-4">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  <span className="text-sm">
                    <span className="font-semibold">{parceiro.bancos}</span>{" "}
                    <span className="text-muted-foreground">bancos</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-primary" />
                  <span className="text-sm">
                    <span className="font-semibold">{parceiro.wallets}</span>{" "}
                    <span className="text-muted-foreground">wallets</span>
                  </span>
                </div>
              </div>

              {/* Casas vinculadas */}
              <div className="mb-4 rounded-lg bg-primary/5 p-3 text-center">
                <div className="text-2xl font-bold text-primary">{parceiro.casas}</div>
                <div className="text-xs text-muted-foreground">casas vinculadas</div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={() => navigate(`/parceiros/${parceiro.id}`)}
                >
                  <Edit className="h-3 w-3" />
                  Editar
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {/* Empty State */}
        {filteredParceiros.length === 0 && (
          <Card className="border-border bg-gradient-surface p-12 text-center shadow-soft">
            <Users className="mx-auto mb-4 h-16 w-16 text-muted-foreground/50" />
            <h3 className="mb-2 text-xl font-semibold">Nenhum parceiro encontrado</h3>
            <p className="mb-6 text-muted-foreground">
              {searchTerm
                ? "Tente ajustar os filtros de busca"
                : "Comece cadastrando seu primeiro parceiro"}
            </p>
            {!searchTerm && (
              <Button onClick={() => navigate("/parceiros/novo")} className="gap-2">
                <Plus className="h-4 w-4" />
                Novo Parceiro
              </Button>
            )}
          </Card>
        )}
      </main>
    </div>
  );
};

export default Parceiros;
