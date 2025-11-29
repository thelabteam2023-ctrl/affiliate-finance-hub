import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Edit, Trash2, ExternalLink } from "lucide-react";
import BookmakerCatalogoDialog from "./BookmakerCatalogoDialog";

interface BookmakerCatalogo {
  id: string;
  nome: string;
  logo_url: string | null;
  status: string;
  operacional: string;
  verificacao: string;
  links_json: any;
  bonus_enabled: boolean;
  multibonus_enabled: boolean;
  observacoes: string | null;
}

export default function CatalogoBookmakers() {
  const [bookmakers, setBookmakers] = useState<BookmakerCatalogo[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBookmaker, setEditingBookmaker] = useState<BookmakerCatalogo | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchBookmakers();
  }, []);

  const fetchBookmakers = async () => {
    try {
      const { data, error } = await supabase
        .from("bookmakers_catalogo")
        .select("*")
        .order("nome", { ascending: true });

      if (error) throw error;
      setBookmakers(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar catálogo",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta casa do catálogo?")) return;

    try {
      const { error } = await supabase
        .from("bookmakers_catalogo")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Casa excluída",
        description: "A casa foi removida do catálogo com sucesso.",
      });
      fetchBookmakers();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir casa",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleEdit = (bookmaker: BookmakerCatalogo) => {
    setEditingBookmaker(bookmaker);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingBookmaker(null);
    fetchBookmakers();
  };

  const filteredBookmakers = bookmakers.filter((bookmaker) =>
    bookmaker.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Carregando catálogo...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Buscar casa de apostas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Bookmaker
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bookmakers Grid */}
      {filteredBookmakers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Nenhuma casa encontrada no catálogo.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredBookmakers.map((bookmaker) => (
            <Card key={bookmaker.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    {bookmaker.logo_url ? (
                      <img
                        src={bookmaker.logo_url}
                        alt={bookmaker.nome}
                        className="h-12 w-auto object-contain mb-2"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : null}
                    <CardTitle className="text-lg">{bookmaker.nome}</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Status:</span>
                      <Badge variant={bookmaker.status === "REGULAMENTADA" ? "default" : "secondary"}>
                        {bookmaker.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Operacional:</span>
                      <Badge variant={bookmaker.operacional === "ATIVA" ? "default" : "destructive"}>
                        {bookmaker.operacional}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Verificação:</span>
                      <Badge variant="outline">
                        {bookmaker.verificacao}
                      </Badge>
                    </div>
                    {bookmaker.bonus_enabled && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Bônus:</span>
                        <Badge variant="secondary">
                          {bookmaker.multibonus_enabled ? "Múltiplo" : "Simples"}
                        </Badge>
                      </div>
                    )}
                  </div>

                  {bookmaker.links_json && Array.isArray(bookmaker.links_json) && bookmaker.links_json.length > 0 && (
                    <div className="pt-2 border-t">
                      {bookmaker.links_json.map((link: any, index: number) => (
                        <a
                          key={index}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {link.referencia || "Site oficial"}
                        </a>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleEdit(bookmaker)}
                    >
                      <Edit className="mr-1 h-4 w-4" />
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-red-600 hover:text-red-700"
                      onClick={() => handleDelete(bookmaker.id)}
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      Excluir
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <BookmakerCatalogoDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        bookmaker={editingBookmaker}
      />
    </div>
  );
}
