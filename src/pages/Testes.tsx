import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Trash2, Shuffle, Users, Building2, Wallet, FolderKanban, TrendingUp, UserPlus, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function Testes() {
  const [loading, setLoading] = useState<string | null>(null);

  const handleDeleteAll = async (table: string, label: string) => {
    setLoading(table);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }

      const { error } = await supabase
        .from(table as any)
        .delete()
        .eq("user_id", user.id);

      if (error) throw error;

      toast.success(`${label} apagados com sucesso!`);
    } catch (error: any) {
      console.error(`Erro ao apagar ${label}:`, error);
      toast.error(`Erro ao apagar ${label}: ${error.message}`);
    } finally {
      setLoading(null);
    }
  };

  const handleDeleteParceiros = async () => {
    setLoading("parceiros");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }

      // Primeiro apagar contas bancárias e wallets (dependem de parceiros)
      const { data: parceiros } = await supabase
        .from("parceiros")
        .select("id")
        .eq("user_id", user.id);

      if (parceiros && parceiros.length > 0) {
        const parceiroIds = parceiros.map(p => p.id);
        
        await supabase.from("contas_bancarias").delete().in("parceiro_id", parceiroIds);
        await supabase.from("wallets_crypto").delete().in("parceiro_id", parceiroIds);
      }

      // Agora apagar parceiros
      const { error } = await supabase
        .from("parceiros")
        .delete()
        .eq("user_id", user.id);

      if (error) throw error;

      toast.success("Parceiros e dados relacionados apagados!");
    } catch (error: any) {
      console.error("Erro ao apagar parceiros:", error);
      toast.error(`Erro ao apagar parceiros: ${error.message}`);
    } finally {
      setLoading(null);
    }
  };

  const handleDeleteBookmakers = async () => {
    setLoading("bookmakers");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }

      // Primeiro apagar transações de bookmakers
      const { data: bookmakers } = await supabase
        .from("bookmakers")
        .select("id")
        .eq("user_id", user.id);

      if (bookmakers && bookmakers.length > 0) {
        const bookmakerIds = bookmakers.map(b => b.id);
        await supabase.from("transacoes_bookmakers").delete().in("bookmaker_id", bookmakerIds);
      }

      // Agora apagar bookmakers
      const { error } = await supabase
        .from("bookmakers")
        .delete()
        .eq("user_id", user.id);

      if (error) throw error;

      toast.success("Bookmakers apagados com sucesso!");
    } catch (error: any) {
      console.error("Erro ao apagar bookmakers:", error);
      toast.error(`Erro ao apagar bookmakers: ${error.message}`);
    } finally {
      setLoading(null);
    }
  };

  const handleGerarVinculosAleatorios = async () => {
    setLoading("vinculos");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }

      // Buscar parceiros
      const { data: parceiros, error: parceirosError } = await supabase
        .from("parceiros")
        .select("id, nome")
        .eq("user_id", user.id)
        .eq("status", "ativo");

      if (parceirosError) throw parceirosError;

      if (!parceiros || parceiros.length === 0) {
        toast.warning("Nenhum parceiro ativo encontrado");
        return;
      }

      // Buscar bookmakers do catálogo
      const { data: catalogo, error: catalogoError } = await supabase
        .from("bookmakers_catalogo")
        .select("id, nome, links_json")
        .eq("status", "REGULAMENTADA");

      if (catalogoError) throw catalogoError;

      if (!catalogo || catalogo.length === 0) {
        toast.warning("Nenhuma bookmaker no catálogo");
        return;
      }

      // Buscar vínculos existentes
      const { data: existentes } = await supabase
        .from("bookmakers")
        .select("parceiro_id, bookmaker_catalogo_id")
        .eq("user_id", user.id);

      const existentesSet = new Set(
        (existentes || []).map(e => `${e.parceiro_id}-${e.bookmaker_catalogo_id}`)
      );

      // Função para embaralhar array
      const shuffle = <T,>(array: T[]): T[] => {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
      };

      const novosVinculos: any[] = [];

      for (const parceiro of parceiros) {
        const catalogoEmbaralhado = shuffle(catalogo);
        let count = 0;

        for (const bk of catalogoEmbaralhado) {
          if (count >= 3) break;
          
          const key = `${parceiro.id}-${bk.id}`;
          if (existentesSet.has(key)) continue;

          const links = bk.links_json as any[] | null;
          const linkOrigem = links && links.length > 0 ? links[0].url : "PADRÃO";

          novosVinculos.push({
            user_id: user.id,
            parceiro_id: parceiro.id,
            bookmaker_catalogo_id: bk.id,
            nome: bk.nome,
            link_origem: linkOrigem,
            login_username: "",
            login_password_encrypted: "",
            saldo_atual: 0,
            moeda: "BRL",
            status: "ativo",
          });

          existentesSet.add(key);
          count++;
        }
      }

      if (novosVinculos.length === 0) {
        toast.info("Todos os parceiros já possuem vínculos suficientes");
        return;
      }

      const { error: insertError } = await supabase
        .from("bookmakers")
        .insert(novosVinculos);

      if (insertError) throw insertError;

      toast.success(`${novosVinculos.length} vínculos criados com sucesso!`);
    } catch (error: any) {
      console.error("Erro ao gerar vínculos:", error);
      toast.error(`Erro ao gerar vínculos: ${error.message}`);
    } finally {
      setLoading(null);
    }
  };

  const deleteActions = [
    { key: "parceiros", label: "Parceiros", icon: Users, action: handleDeleteParceiros, description: "Apaga todos os parceiros, contas bancárias e wallets" },
    { key: "bookmakers", label: "Bookmakers (Vínculos)", icon: Building2, action: handleDeleteBookmakers, description: "Apaga todos os vínculos parceiro-bookmaker" },
    { key: "cash_ledger", label: "Transações (Caixa)", icon: Wallet, action: () => handleDeleteAll("cash_ledger", "Transações"), description: "Apaga todas as movimentações do caixa" },
    { key: "projetos", label: "Projetos", icon: FolderKanban, action: () => handleDeleteAll("projetos", "Projetos"), description: "Apaga todos os projetos" },
    { key: "investidores", label: "Investidores", icon: TrendingUp, action: () => handleDeleteAll("investidores", "Investidores"), description: "Apaga todos os investidores" },
    { key: "parcerias", label: "Parcerias (Captação)", icon: UserPlus, action: () => handleDeleteAll("parcerias", "Parcerias"), description: "Apaga todas as parcerias de captação" },
    { key: "indicadores_referral", label: "Indicadores", icon: Users, action: () => handleDeleteAll("indicadores_referral", "Indicadores"), description: "Apaga todos os indicadores" },
    { key: "operadores", label: "Operadores", icon: Users, action: () => handleDeleteAll("operadores", "Operadores"), description: "Apaga todos os operadores" },
  ];

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/20">
          <AlertTriangle className="h-5 w-5 text-destructive" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Testes</h1>
          <p className="text-muted-foreground text-sm">
            Ferramentas para desenvolvimento e testes - USE COM CUIDADO!
          </p>
        </div>
      </div>

      {/* Geração de Dados */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shuffle className="h-5 w-5 text-primary" />
            Geração de Dados de Teste
          </CardTitle>
          <CardDescription>
            Ferramentas para criar dados de teste automaticamente
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <p className="font-medium">Gerar 3 Vínculos Aleatórios por Parceiro</p>
              <p className="text-sm text-muted-foreground">
                Cria vínculos com bookmakers aleatórias do catálogo para cada parceiro ativo
              </p>
            </div>
            <Button 
              onClick={handleGerarVinculosAleatorios}
              disabled={loading === "vinculos"}
            >
              {loading === "vinculos" ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Shuffle className="h-4 w-4 mr-2" />
              )}
              Gerar Vínculos
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Limpeza de Dados */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            Limpeza de Dados
          </CardTitle>
          <CardDescription>
            ATENÇÃO: Estas ações são irreversíveis e apagarão todos os dados permanentemente!
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {deleteActions.map((item) => (
            <div key={item.key} className="flex items-center justify-between p-4 border border-destructive/20 rounded-lg bg-destructive/5">
              <div className="flex items-center gap-3">
                <item.icon className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">{item.label}</p>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    disabled={loading === item.key}
                  >
                    {loading === item.key ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Tem certeza absoluta?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação não pode ser desfeita. Todos os <strong>{item.label.toLowerCase()}</strong> serão permanentemente apagados do sistema.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={item.action}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Sim, apagar tudo
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
