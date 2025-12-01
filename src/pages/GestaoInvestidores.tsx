import { useState, useEffect } from "react";
import { Plus, Search, LayoutGrid, List, Eye, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { InvestidorDialog } from "@/components/investidores/InvestidorDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Investidor {
  id: string;
  nome: string;
  cpf: string;
  status: string;
  observacoes?: string;
  created_at: string;
}

export default function GestaoInvestidores() {
  const [investidores, setInvestidores] = useState<Investidor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedInvestidor, setSelectedInvestidor] = useState<Investidor | null>(null);
  const [dialogMode, setDialogMode] = useState<"view" | "edit" | "create">("create");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [investidorToDelete, setInvestidorToDelete] = useState<Investidor | null>(null);

  const fetchInvestidores = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("investidores")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setInvestidores(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar investidores", {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvestidores();
  }, []);

  const handleDelete = async () => {
    if (!investidorToDelete) return;

    try {
      const { error } = await supabase
        .from("investidores")
        .delete()
        .eq("id", investidorToDelete.id);

      if (error) throw error;

      toast.success("Investidor excluído com sucesso");
      fetchInvestidores();
    } catch (error: any) {
      toast.error("Erro ao excluir investidor", {
        description: error.message,
      });
    } finally {
      setDeleteDialogOpen(false);
      setInvestidorToDelete(null);
    }
  };

  const filteredInvestidores = investidores.filter((inv) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      inv.nome.toLowerCase().includes(searchLower) ||
      inv.cpf.includes(searchTerm)
    );
  });

  const formatCPF = (cpf: string) => {
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-background/95">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Gestão de Investidores
            </h1>
            <p className="text-muted-foreground mt-1">
              {filteredInvestidores.length} {filteredInvestidores.length === 1 ? "investidor" : "investidores"}
            </p>
          </div>
          <Button onClick={() => {
            setSelectedInvestidor(null);
            setDialogMode("create");
            setDialogOpen(true);
          }}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Investidor
          </Button>
        </div>

        <Card className="p-4 bg-card/50 backdrop-blur border-border/50">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou CPF..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setViewMode(viewMode === "cards" ? "list" : "cards")}
            >
              {viewMode === "cards" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
            </Button>
          </div>
        </Card>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Carregando investidores...</p>
          </div>
        ) : filteredInvestidores.length === 0 ? (
          <Card className="p-12 text-center bg-card/50 backdrop-blur border-border/50">
            <p className="text-muted-foreground">
              {searchTerm ? "Nenhum investidor encontrado" : "Nenhum investidor cadastrado"}
            </p>
          </Card>
        ) : viewMode === "cards" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredInvestidores.map((investidor) => (
              <Card
                key={investidor.id}
                className={`p-4 bg-card/50 backdrop-blur border-border/50 hover:bg-accent/5 transition-colors ${
                  investidor.status === "inativo" ? "bg-warning/10 border-warning/30" : ""
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{investidor.nome}</h3>
                    <p className="text-sm text-muted-foreground">{formatCPF(investidor.cpf)}</p>
                  </div>
                  <Badge variant={investidor.status === "ativo" ? "default" : "secondary"}>
                    {investidor.status.toUpperCase()}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedInvestidor(investidor);
                      setDialogMode("view");
                      setDialogOpen(true);
                    }}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Ver
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedInvestidor(investidor);
                      setDialogMode("edit");
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setInvestidorToDelete(investidor);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <div className="divide-y divide-border/50">
              {filteredInvestidores.map((investidor) => (
                <div
                  key={investidor.id}
                  className={`p-4 hover:bg-accent/5 transition-colors ${
                    investidor.status === "inativo" ? "bg-warning/5 hover:bg-warning/10" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold">{investidor.nome}</h3>
                        <Badge variant={investidor.status === "ativo" ? "default" : "secondary"}>
                          {investidor.status.toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{formatCPF(investidor.cpf)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedInvestidor(investidor);
                          setDialogMode("view");
                          setDialogOpen(true);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedInvestidor(investidor);
                          setDialogMode("edit");
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setInvestidorToDelete(investidor);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <InvestidorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        investidor={selectedInvestidor}
        onSuccess={fetchInvestidores}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o investidor <strong>{investidorToDelete?.nome}</strong>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
