import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Shuffle, Users, Building2, Wallet, FolderKanban, TrendingUp, UserPlus, Loader2, AlertTriangle, RotateCcw, Banknote, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function Testes() {
  const [loading, setLoading] = useState<string | null>(null);
  const [valorAporte, setValorAporte] = useState<string>("5000");
  const [confirmResetCompleto, setConfirmResetCompleto] = useState(false);

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

  const handleDeleteProjetos = async () => {
    setLoading("projetos");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }

      // Buscar todos os projetos do usuário
      const { data: projetos } = await supabase
        .from("projetos")
        .select("id")
        .eq("user_id", user.id);

      if (projetos && projetos.length > 0) {
        const projetoIds = projetos.map(p => p.id);

        // Buscar operador_projetos para apagar entregas
        const { data: opProjetos } = await supabase
          .from("operador_projetos")
          .select("id")
          .in("projeto_id", projetoIds);

        if (opProjetos && opProjetos.length > 0) {
          const opProjetoIds = opProjetos.map(op => op.id);
          
          // Apagar entregas vinculadas
          await supabase.from("entregas").delete().in("operador_projeto_id", opProjetoIds);
          
          // Apagar pagamentos propostos
          await supabase.from("pagamentos_propostos").delete().in("operador_projeto_id", opProjetoIds);
        }

        // Apagar ciclos do projeto
        await supabase.from("projeto_ciclos").delete().in("projeto_id", projetoIds);

        // Apagar perdas do projeto
        await supabase.from("projeto_perdas").delete().in("projeto_id", projetoIds);
        await supabase.from("projeto_ciclos").delete().in("projeto_id", projetoIds);

        // Apagar perdas do projeto
        await supabase.from("projeto_perdas").delete().in("projeto_id", projetoIds);


        // Apagar apostas unificada
        await supabase.from("apostas_unificada").delete().in("projeto_id", projetoIds);

        // Apagar freebets recebidas
        await supabase.from("freebets_recebidas").delete().in("projeto_id", projetoIds);

        // Apagar operador_projetos (vínculos de operadores)
        await supabase.from("operador_projetos").delete().in("projeto_id", projetoIds);

        // Desvincular bookmakers do projeto (não apagar, apenas remover vínculo)
        await supabase
          .from("bookmakers")
          .update({ projeto_id: null })
          .in("projeto_id", projetoIds);
      }

      // Por fim, apagar os projetos
      const { error } = await supabase
        .from("projetos")
        .delete()
        .eq("user_id", user.id);

      if (error) throw error;

      toast.success("Projetos e todos os dados vinculados apagados com sucesso!");
    } catch (error: any) {
      console.error("Erro ao apagar projetos:", error);
      toast.error(`Erro ao apagar projetos: ${error.message}`);
    } finally {
      setLoading(null);
    }
  };

  // Função para gerar CPF válido aleatório
  const gerarCPF = () => {
    const random = (n: number) => Math.floor(Math.random() * n);
    const mod = (dividendo: number, divisor: number) => Math.round(dividendo - (Math.floor(dividendo / divisor) * divisor));
    
    const n = Array.from({ length: 9 }, () => random(9));
    let d1 = n.reduce((acc, val, i) => acc + val * (10 - i), 0);
    d1 = 11 - mod(d1, 11);
    if (d1 >= 10) d1 = 0;
    
    let d2 = d1 * 2 + n.reduce((acc, val, i) => acc + val * (11 - i), 0);
    d2 = 11 - mod(d2, 11);
    if (d2 >= 10) d2 = 0;
    
    return `${n.slice(0, 3).join('')}.${n.slice(3, 6).join('')}.${n.slice(6, 9).join('')}-${d1}${d2}`;
  };

  const nomesParceiros = [
    "MARIA SILVA SANTOS", "JOSE CARLOS OLIVEIRA", "ANA PAULA FERREIRA",
    "PEDRO HENRIQUE COSTA", "FERNANDA RODRIGUES LIMA", "LUCAS GABRIEL SOUZA",
    "JULIANA ALMEIDA PEREIRA", "RAFAEL MARTINS GOMES", "CAMILA RIBEIRO DIAS",
    "BRUNO CARVALHO NUNES", "PATRICIA MENDES BARROS", "THIAGO ARAUJO PINTO"
  ];

  const nomesIndicadores = [
    "CARLOS EDUARDO SILVA", "AMANDA COSTA REIS", "ROBERTO FERREIRA LIMA",
    "VANESSA SANTOS OLIVEIRA", "MARCELO ALVES JUNIOR", "TATIANA GOMES PEREIRA"
  ];

  const nomesOperadores = [
    "FELIPE AUGUSTO ROCHA", "LARISSA CRISTINA MOURA", "DIEGO SANTOS NASCIMENTO",
    "PRISCILA MELO DUARTE", "GUILHERME ANDRADE CASTRO", "CAROLINA FREITAS VIEIRA"
  ];

  // Função para gerar endereço de wallet aleatório
  const gerarEnderecoWallet = () => {
    const chars = '0123456789abcdef';
    let endereco = '0x';
    for (let i = 0; i < 40; i++) {
      endereco += chars[Math.floor(Math.random() * chars.length)];
    }
    return endereco;
  };

  // Função para gerar chave PIX aleatória (email ou telefone)
  const gerarChavePix = (nome: string, index: number) => {
    const tipoChave = Math.random() > 0.5 ? 'email' : 'telefone';
    if (tipoChave === 'email') {
      const nomeNormalizado = nome.toLowerCase().replace(/\s+/g, '.').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return `${nomeNormalizado}${index}@email.com`;
    } else {
      const ddd = ['11', '21', '31', '41', '51'][Math.floor(Math.random() * 5)];
      const numero = Math.floor(Math.random() * 900000000) + 100000000;
      return `${ddd}9${numero}`;
    }
  };

  // Lista de códigos de bancos para buscar na tabela
  const codigosBancosPreferidos = ['001', '033', '104', '237', '341', '260', '077'];

  const handleGerarParceirosAleatorios = async () => {
    setLoading("parceiros_gerar");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }

      // Buscar workspace do usuário
      const { data: workspaceMember } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      const workspaceId = workspaceMember?.workspace_id || null;

      // Buscar nomes de parceiros já existentes para este usuário
      const { data: parceirosExistentes } = await supabase
        .from("parceiros")
        .select("nome")
        .eq("user_id", user.id);

      const nomesExistentes = new Set(
        (parceirosExistentes || []).map(p => p.nome.toUpperCase())
      );

      // Filtrar nomes disponíveis (que ainda não existem)
      const nomesDisponiveis = nomesParceiros.filter(
        nome => !nomesExistentes.has(nome.toUpperCase())
      );

      if (nomesDisponiveis.length === 0) {
        toast.warning("Todos os nomes de parceiros de teste já foram utilizados!");
        return;
      }

      const shuffle = <T,>(array: T[]): T[] => {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
      };

      // Usar apenas nomes disponíveis
      const nomesEmbaralhados = shuffle(nomesDisponiveis);
      const quantidadeGerar = Math.min(3, nomesDisponiveis.length);
      
      if (quantidadeGerar < 3) {
        toast.info(`Apenas ${quantidadeGerar} nome(s) disponível(is) para gerar`);
      }

      const novosParceiros = nomesEmbaralhados.slice(0, quantidadeGerar).map(nome => ({
        user_id: user.id,
        workspace_id: workspaceId,
        nome,
        cpf: gerarCPF(),
        status: "ativo",
      }));

      // Inserir parceiros e recuperar os IDs
      const { data: parceirosCriados, error: parceirosError } = await supabase
        .from("parceiros")
        .insert(novosParceiros)
        .select("id, nome");

      if (parceirosError) throw parceirosError;
      if (!parceirosCriados || parceirosCriados.length === 0) {
        throw new Error("Nenhum parceiro foi criado");
      }

      // Buscar bancos reais da tabela para obter os IDs
      const { data: bancosData } = await supabase
        .from("bancos")
        .select("id, nome, codigo")
        .in("codigo", codigosBancosPreferidos);

      const bancosDisponiveis = bancosData && bancosData.length > 0 
        ? bancosData 
        : [{ id: null, nome: 'Banco Padrão', codigo: '000' }];

      // Criar contas bancárias para cada parceiro
      const contasBancarias = parceirosCriados.map((parceiro, index) => {
        const banco = bancosDisponiveis[Math.floor(Math.random() * bancosDisponiveis.length)];
        return {
          parceiro_id: parceiro.id,
          banco_id: banco.id,
          banco: banco.nome,
          titular: parceiro.nome,
          tipo_conta: Math.random() > 0.5 ? 'corrente' : 'poupanca',
          pix_key: gerarChavePix(parceiro.nome, index),
        };
      });

      const { error: contasError } = await supabase.from("contas_bancarias").insert(contasBancarias);
      if (contasError) throw contasError;

      // Buscar redes crypto para obter os IDs
      const { data: redesData } = await supabase.from("redes_crypto").select("id, codigo");
      const redeERC20 = redesData?.find(r => r.codigo === 'ERC20');
      const redeBTC = redesData?.find(r => r.codigo === 'BTC');

      // Criar wallets crypto para cada parceiro
      const walletsCrypto: any[] = [];
      
      parceirosCriados.forEach((parceiro, index) => {
        // Wallet principal com USDT na rede ERC20
        walletsCrypto.push({
          parceiro_id: parceiro.id,
          endereco: gerarEnderecoWallet(),
          network: 'ERC20',
          rede_id: redeERC20?.id || null,
          exchange: 'Binance',
          moeda: ['USDT'],
        });

        // Para alguns parceiros, adicionar uma segunda wallet com outras moedas
        if (index < 2) {
          const moedasExtras = index === 0 ? ['USDC', 'ETH'] : ['BTC'];
          const redeExtra = index === 0 ? redeERC20 : redeBTC;
          walletsCrypto.push({
            parceiro_id: parceiro.id,
            endereco: gerarEnderecoWallet(),
            network: redeExtra?.codigo || (index === 0 ? 'ERC20' : 'BTC'),
            rede_id: redeExtra?.id || null,
            exchange: index === 0 ? 'MetaMask' : 'Ledger',
            moeda: moedasExtras,
          });
        }
      });

      const { error: walletsError } = await supabase.from("wallets_crypto").insert(walletsCrypto);
      if (walletsError) throw walletsError;

      toast.success(`${quantidadeGerar} parceiros criados com ${contasBancarias.length} contas e ${walletsCrypto.length} wallets!`);
    } catch (error: any) {
      console.error("Erro ao gerar parceiros:", error);
      toast.error(`Erro ao gerar parceiros: ${error.message}`);
    } finally {
      setLoading(null);
    }
  };

  const handleGerarIndicadoresAleatorios = async () => {
    setLoading("indicadores_gerar");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }

      // Buscar workspace do usuário
      const { data: workspaceMember } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      const workspaceId = workspaceMember?.workspace_id || null;

      // Buscar nomes de indicadores já existentes para este usuário
      const { data: indicadoresExistentes } = await supabase
        .from("indicadores_referral")
        .select("nome")
        .eq("user_id", user.id);

      const nomesExistentes = new Set(
        (indicadoresExistentes || []).map(i => i.nome.toUpperCase())
      );

      // Filtrar nomes disponíveis (que ainda não existem)
      const nomesDisponiveis = nomesIndicadores.filter(
        nome => !nomesExistentes.has(nome.toUpperCase())
      );

      if (nomesDisponiveis.length === 0) {
        toast.warning("Todos os nomes de indicadores de teste já foram utilizados!");
        return;
      }

      const shuffle = <T,>(array: T[]): T[] => {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
      };

      // Usar apenas nomes disponíveis
      const nomesEmbaralhados = shuffle(nomesDisponiveis);
      const quantidadeGerar = Math.min(2, nomesDisponiveis.length);
      
      if (quantidadeGerar < 2) {
        toast.info(`Apenas ${quantidadeGerar} nome(s) disponível(is) para gerar`);
      }

      const novosIndicadores = nomesEmbaralhados.slice(0, quantidadeGerar).map(nome => ({
        user_id: user.id,
        workspace_id: workspaceId,
        nome,
        cpf: gerarCPF(),
        status: "ATIVO",
      }));

      // Inserir indicadores e recuperar IDs
      const { data: indicadoresCriados, error } = await supabase
        .from("indicadores_referral")
        .insert(novosIndicadores)
        .select("id");
      
      if (error) throw error;
      if (!indicadoresCriados || indicadoresCriados.length === 0) {
        throw new Error("Nenhum indicador foi criado");
      }

      // Criar acordos de comissão para cada indicador (obrigatório)
      const acordos = indicadoresCriados.map((indicador, index) => ({
        user_id: user.id,
        workspace_id: workspaceId,
        indicador_id: indicador.id,
        orcamento_por_parceiro: [500, 750, 600, 800][index % 4], // Valores variados
        meta_parceiros: [5, 10, 8, 15][index % 4],
        valor_bonus: [1000, 2000, 1500, 2500][index % 4],
        ativo: true,
      }));

      const { error: acordoError } = await supabase
        .from("indicador_acordos")
        .insert(acordos);
      
      if (acordoError) throw acordoError;

      toast.success(`${quantidadeGerar} indicadores criados com acordos de comissão!`);
    } catch (error: any) {
      console.error("Erro ao gerar indicadores:", error);
      toast.error(`Erro ao gerar indicadores: ${error.message}`);
    } finally {
      setLoading(null);
    }
  };

  const nomesInvestidores = [
    "CARLOS EDUARDO MENDES", "ROBERTO SILVA SANTOS", "FERNANDA COSTA LIMA",
    "MARCELO OLIVEIRA NETO", "PATRICIA ALMEIDA ROCHA", "RICARDO SOUZA DIAS"
  ];

  const handleGerarInvestidorAleatorio = async () => {
    setLoading("investidor_gerar");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }

      // Buscar workspace do usuário
      const { data: workspaceMember } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      const workspaceId = workspaceMember?.workspace_id || null;

      // Buscar nomes de investidores já existentes para este usuário
      const { data: investidoresExistentes } = await supabase
        .from("investidores")
        .select("nome")
        .eq("user_id", user.id);

      const nomesExistentes = new Set(
        (investidoresExistentes || []).map(i => i.nome.toUpperCase())
      );

      // Filtrar nomes disponíveis (que ainda não existem)
      const nomesDisponiveis = nomesInvestidores.filter(
        nome => !nomesExistentes.has(nome.toUpperCase())
      );

      if (nomesDisponiveis.length === 0) {
        toast.warning("Todos os nomes de investidores de teste já foram utilizados!");
        return;
      }

      const nomeAleatorio = nomesDisponiveis[Math.floor(Math.random() * nomesDisponiveis.length)];

      const novoInvestidor = {
        user_id: user.id,
        workspace_id: workspaceId,
        nome: nomeAleatorio,
        cpf: gerarCPF(),
        status: "ativo",
      };

      const { error } = await supabase.from("investidores").insert([novoInvestidor]);
      if (error) throw error;

      toast.success(`1 investidor criado! (${nomesDisponiveis.length - 1} nomes restantes)`);
    } catch (error: any) {
      console.error("Erro ao gerar investidor:", error);
      toast.error(`Erro ao gerar investidor: ${error.message}`);
    } finally {
      setLoading(null);
    }
  };

  const handleGerarOperadoresAleatorios = async () => {
    setLoading("operadores_gerar");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }

      // Buscar workspace do usuário
      const { data: workspaceMember } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      const workspaceId = workspaceMember?.workspace_id || null;

      // Buscar nomes de operadores já existentes para este usuário
      const { data: operadoresExistentes } = await supabase
        .from("operadores")
        .select("nome")
        .eq("user_id", user.id);

      const nomesExistentes = new Set(
        (operadoresExistentes || []).map(o => o.nome.toUpperCase())
      );

      // Filtrar nomes disponíveis (que ainda não existem)
      const nomesDisponiveis = nomesOperadores.filter(
        nome => !nomesExistentes.has(nome.toUpperCase())
      );

      if (nomesDisponiveis.length === 0) {
        toast.warning("Todos os nomes de operadores de teste já foram utilizados!");
        return;
      }

      const shuffle = <T,>(array: T[]): T[] => {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
      };

      // Usar apenas nomes disponíveis
      const nomesEmbaralhados = shuffle(nomesDisponiveis);
      const quantidadeGerar = Math.min(2, nomesDisponiveis.length);
      
      if (quantidadeGerar < 2) {
        toast.info(`Apenas ${quantidadeGerar} nome(s) disponível(is) para gerar`);
      }

      const novosOperadores = nomesEmbaralhados.slice(0, quantidadeGerar).map(nome => ({
        user_id: user.id,
        workspace_id: workspaceId,
        nome,
        cpf: gerarCPF(),
        status: "ATIVO",
        tipo_contrato: "PJ",
      }));

      const { error } = await supabase.from("operadores").insert(novosOperadores);
      if (error) throw error;

      toast.success(`${quantidadeGerar} operadores criados com sucesso!`);
    } catch (error: any) {
      console.error("Erro ao gerar operadores:", error);
      toast.error(`Erro ao gerar operadores: ${error.message}`);
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

      // Buscar workspace do usuário
      const { data: workspaceMember } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      const workspaceId = workspaceMember?.workspace_id || null;

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
            workspace_id: workspaceId,
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

  const handleResetSaldosBookmakers = async () => {
    setLoading("reset_saldos");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }

      // Buscar todas as bookmakers do usuário
      const { data: bookmakers, error: bookmarkersError } = await supabase
        .from("bookmakers")
        .select("id, nome")
        .eq("user_id", user.id);

      if (bookmarkersError) throw bookmarkersError;

      if (!bookmakers || bookmakers.length === 0) {
        toast.info("Nenhuma bookmaker encontrada");
        return;
      }

      const bookmakerIds = bookmakers.map(b => b.id);

      // Buscar todos os depósitos (dinheiro que entrou nas bookmakers)
      const { data: depositos } = await supabase
        .from("cash_ledger")
        .select("destino_bookmaker_id, valor")
        .eq("user_id", user.id)
        .eq("tipo_transacao", "DEPOSITO")
        .eq("status", "CONFIRMADO")
        .in("destino_bookmaker_id", bookmakerIds);

      // Buscar todos os saques (dinheiro que saiu das bookmakers)
      const { data: saques } = await supabase
        .from("cash_ledger")
        .select("origem_bookmaker_id, valor")
        .eq("user_id", user.id)
        .eq("tipo_transacao", "SAQUE")
        .eq("status", "CONFIRMADO")
        .in("origem_bookmaker_id", bookmakerIds);

      // Calcular saldo original de cada bookmaker (depositos - saques)
      const saldosOriginais: Record<string, number> = {};
      
      for (const bookmaker of bookmakers) {
        saldosOriginais[bookmaker.id] = 0;
      }

      // Somar depósitos
      if (depositos) {
        for (const d of depositos) {
          if (d.destino_bookmaker_id) {
            saldosOriginais[d.destino_bookmaker_id] = (saldosOriginais[d.destino_bookmaker_id] || 0) + Number(d.valor);
          }
        }
      }

      // Subtrair saques
      if (saques) {
        for (const s of saques) {
          if (s.origem_bookmaker_id) {
            saldosOriginais[s.origem_bookmaker_id] = (saldosOriginais[s.origem_bookmaker_id] || 0) - Number(s.valor);
          }
        }
      }

      // Apagar todas as freebets recebidas do usuário
      const { error: freebetsError } = await supabase
        .from("freebets_recebidas")
        .delete()
        .eq("user_id", user.id);

      if (freebetsError) {
        console.error("Erro ao apagar freebets:", freebetsError);
      }

      // Apagar todos os bônus de bookmakers vinculados aos projetos do usuário
      const { data: projetos } = await supabase
        .from("projetos")
        .select("id")
        .eq("user_id", user.id);

      if (projetos && projetos.length > 0) {
        const projetoIds = projetos.map(p => p.id);
        const { error: bonusError } = await supabase
          .from("project_bookmaker_link_bonuses")
          .delete()
          .in("project_id", projetoIds);

        if (bonusError) {
          console.error("Erro ao apagar bônus:", bonusError);
        } else {
          console.log("Bônus de bookmakers deletados com sucesso");
        }
      }

      // Apagar todas as apostas unificada do usuário
      const { error: apostasError } = await supabase
        .from("apostas_unificada")
        .delete()
        .eq("user_id", user.id);

      if (apostasError) {
        console.error("Erro ao apagar apostas:", apostasError);
      }

      console.log("Apostas deletadas com sucesso");

      // Atualizar cada bookmaker com seu saldo original e zerar saldo_freebet
      let atualizados = 0;
      for (const [bookmakerId, saldo] of Object.entries(saldosOriginais)) {
        const { error: updateError } = await supabase
          .from("bookmakers")
          .update({ saldo_atual: saldo, saldo_freebet: 0, saldo_irrecuperavel: 0 })
          .eq("id", bookmakerId);

        if (!updateError) {
          atualizados++;
        }
      }

      toast.success(`Saldos de ${atualizados} bookmakers resetados, apostas, freebets e bônus apagados!`);
    } catch (error: any) {
      console.error("Erro ao resetar saldos:", error);
      toast.error(`Erro ao resetar saldos: ${error.message}`);
    } finally {
      setLoading(null);
    }
  };

  const handleResetCompletoParaTestes = async () => {
    setLoading("reset_completo");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }

      console.log("🔄 Iniciando reset completo para testes...");

      // 1. Buscar todos os projetos do usuário
      const { data: projetos } = await supabase
        .from("projetos")
        .select("id")
        .eq("user_id", user.id);

      const projetoIds = projetos?.map(p => p.id) || [];
      console.log(`📋 Projetos encontrados: ${projetoIds.length}`);

      if (projetoIds.length > 0) {
        // 2. Buscar operador_projetos para apagar entregas
        const { data: opProjetos } = await supabase
          .from("operador_projetos")
          .select("id")
          .in("projeto_id", projetoIds);

        if (opProjetos && opProjetos.length > 0) {
          const opProjetoIds = opProjetos.map(op => op.id);
          
          // Apagar entregas vinculadas
          await supabase.from("entregas").delete().in("operador_projeto_id", opProjetoIds);
          console.log("✅ Entregas apagadas");
          
          // Apagar pagamentos propostos
          await supabase.from("pagamentos_propostos").delete().in("operador_projeto_id", opProjetoIds);
          console.log("✅ Pagamentos propostos apagados");
        }

        // 3. Apagar dados vinculados aos projetos
        await supabase.from("projeto_ciclos").delete().in("projeto_id", projetoIds);
        console.log("✅ Ciclos de projeto apagados");

        await supabase.from("projeto_perdas").delete().in("projeto_id", projetoIds);
        console.log("✅ Perdas de projeto apagadas");

        await supabase.from("projeto_conciliacoes").delete().in("projeto_id", projetoIds);
        console.log("✅ Conciliações de projeto apagadas");

        await supabase.from("apostas_unificada").delete().in("projeto_id", projetoIds);
        console.log("✅ Apostas unificadas apagadas");

        await supabase.from("freebets_recebidas").delete().in("projeto_id", projetoIds);
        console.log("✅ Freebets recebidas apagadas");

        await supabase.from("giros_gratis").delete().in("projeto_id", projetoIds);
        console.log("✅ Giros grátis apagados");

        await supabase.from("giros_gratis_disponiveis").delete().in("projeto_id", projetoIds);
        console.log("✅ Giros grátis disponíveis apagados");

        await supabase.from("project_bookmaker_link_bonuses").delete().in("project_id", projetoIds);
        console.log("✅ Bônus de bookmakers apagados");

        await supabase.from("operador_projetos").delete().in("projeto_id", projetoIds);
        console.log("✅ Operador-projetos apagados");

        // 4. Desvincular bookmakers dos projetos
        await supabase
          .from("bookmakers")
          .update({ projeto_id: null })
          .in("projeto_id", projetoIds);
        console.log("✅ Bookmakers desvinculados");

        // 5. Apagar os projetos
        const { error: projetosError } = await supabase
          .from("projetos")
          .delete()
          .eq("user_id", user.id);

        if (projetosError) throw projetosError;
        console.log("✅ Projetos apagados");
      }

      // 6. Limpar saques pendentes no cash_ledger (manter confirmados)
      const { data: saquesPendentes } = await supabase
        .from("cash_ledger")
        .select("id")
        .eq("user_id", user.id)
        .eq("tipo_transacao", "SAQUE")
        .eq("status", "PENDENTE");

      if (saquesPendentes && saquesPendentes.length > 0) {
        const saquesPendentesIds = saquesPendentes.map(s => s.id);
        await supabase.from("cash_ledger").delete().in("id", saquesPendentesIds);
        console.log(`✅ ${saquesPendentesIds.length} saques pendentes removidos`);
      }

      // 7. Recalcular saldos das bookmakers baseado no ledger
      const { data: bookmakers } = await supabase
        .from("bookmakers")
        .select("id, nome, moeda")
        .eq("user_id", user.id);

      if (bookmakers && bookmakers.length > 0) {
        const bookmakerIds = bookmakers.map(b => b.id);

        // Buscar depósitos confirmados
        const { data: depositos } = await supabase
          .from("cash_ledger")
          .select("destino_bookmaker_id, valor, moeda_destino")
          .eq("user_id", user.id)
          .eq("tipo_transacao", "DEPOSITO")
          .eq("status", "CONFIRMADO")
          .in("destino_bookmaker_id", bookmakerIds);

        // Buscar saques confirmados
        const { data: saques } = await supabase
          .from("cash_ledger")
          .select("origem_bookmaker_id, valor, moeda_origem")
          .eq("user_id", user.id)
          .eq("tipo_transacao", "SAQUE")
          .eq("status", "CONFIRMADO")
          .in("origem_bookmaker_id", bookmakerIds);

        // Calcular saldos
        const saldosCalculados: Record<string, number> = {};
        
        for (const bookmaker of bookmakers) {
          saldosCalculados[bookmaker.id] = 0;
        }

        // Somar depósitos
        if (depositos) {
          for (const d of depositos) {
            if (d.destino_bookmaker_id) {
              saldosCalculados[d.destino_bookmaker_id] = (saldosCalculados[d.destino_bookmaker_id] || 0) + Number(d.valor);
            }
          }
        }

        // Subtrair saques
        if (saques) {
          for (const s of saques) {
            if (s.origem_bookmaker_id) {
              saldosCalculados[s.origem_bookmaker_id] = (saldosCalculados[s.origem_bookmaker_id] || 0) - Number(s.valor);
            }
          }
        }

        // Atualizar cada bookmaker com saldo recalculado e status resetado
        let atualizados = 0;
        for (const bookmaker of bookmakers) {
          const saldoNovo = saldosCalculados[bookmaker.id] || 0;
          const isUSD = ['USD', 'USDT', 'BTC', 'ETH', 'USDC'].includes(bookmaker.moeda);
          
          const updateData = isUSD
            ? { saldo_usd: saldoNovo, saldo_atual: 0, saldo_freebet: 0, saldo_irrecuperavel: 0, projeto_id: null, status: 'ativo' }
            : { saldo_atual: saldoNovo, saldo_usd: 0, saldo_freebet: 0, saldo_irrecuperavel: 0, projeto_id: null, status: 'ativo' };

          const { error: updateError } = await supabase
            .from("bookmakers")
            .update(updateData)
            .eq("id", bookmaker.id);

          if (!updateError) {
            atualizados++;
          }
        }
        console.log(`✅ ${atualizados} bookmakers com saldos recalculados e status resetado`);
      }

      // Reset checkbox
      setConfirmResetCompleto(false);

      toast.success(
        `Reset completo executado!\n` +
        `• ${projetoIds.length} projetos apagados\n` +
        `• Apostas, bônus, freebets removidas\n` +
        `• Saques pendentes removidos\n` +
        `• Bookmakers: saldos recalculados, status resetado\n` +
        `• Parcerias e indicações preservadas`
      );

    } catch (error: any) {
      console.error("Erro no reset completo:", error);
      toast.error(`Erro no reset completo: ${error.message}`);
    } finally {
      setLoading(null);
    }
  };

  // Função para gerar valor múltiplo de 10 dentro de um range
  const gerarValorMultiplo10 = (min: number, max: number): number => {
    const minMultiplo = Math.ceil(min / 10) * 10;
    const maxMultiplo = Math.floor(max / 10) * 10;
    if (minMultiplo > maxMultiplo) return 0;
    const opcoes = Math.floor((maxMultiplo - minMultiplo) / 10) + 1;
    return minMultiplo + Math.floor(Math.random() * opcoes) * 10;
  };

  const handleSimularFluxoFinanceiro = async () => {
    setLoading("fluxo_financeiro");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }

      // Buscar workspace do usuário
      const { data: workspaceMember } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      const workspaceId = workspaceMember?.workspace_id || null;

      const valorTotal = parseFloat(valorAporte);
      if (isNaN(valorTotal) || valorTotal <= 0) {
        toast.error("Valor de aporte inválido");
        return;
      }

      // 1. Buscar investidor existente
      const { data: investidores } = await supabase
        .from("investidores")
        .select("id, nome")
        .eq("user_id", user.id)
        .eq("status", "ativo")
        .limit(1);

      if (!investidores || investidores.length === 0) {
        toast.error("Nenhum investidor ativo encontrado. Crie um investidor primeiro.");
        return;
      }

      const investidor = investidores[0];

      // 2. Buscar parceiros com contas bancárias e bookmakers
      const { data: parceiros } = await supabase
        .from("parceiros")
        .select(`
          id, 
          nome,
          contas_bancarias(id, banco, titular),
          bookmakers(id, nome, saldo_atual, moeda)
        `)
        .eq("user_id", user.id)
        .eq("status", "ativo");

      if (!parceiros || parceiros.length === 0) {
        toast.error("Nenhum parceiro ativo encontrado. Crie parceiros primeiro.");
        return;
      }

      // Filtrar parceiros que têm conta bancária E bookmakers
      const parceirosValidos = parceiros.filter(
        p => p.contas_bancarias && 
             p.contas_bancarias.length > 0 && 
             p.bookmakers && 
             p.bookmakers.length > 0
      );

      if (parceirosValidos.length === 0) {
        toast.error("Nenhum parceiro com conta bancária e bookmakers vinculados encontrado.");
        return;
      }

      // 3. ETAPA 1: Aporte financeiro do investidor para o caixa operacional
      const { error: aporteError } = await supabase.from("cash_ledger").insert({
        user_id: user.id,
        workspace_id: workspaceId,
        tipo_transacao: "APORTE_FINANCEIRO",
        tipo_moeda: "FIAT",
        moeda: "BRL",
        valor: valorTotal,
        investidor_id: investidor.id,
        nome_investidor: investidor.nome,
        origem_tipo: "INVESTIDOR",
        destino_tipo: "CAIXA_OPERACIONAL",
        status: "CONFIRMADO",
        descricao: `Aporte automático de teste - ${investidor.nome}`,
      });

      if (aporteError) throw aporteError;
      console.log(`✅ Aporte de R$ ${valorTotal} criado do investidor ${investidor.nome}`);

      // 4. ETAPA 2: Distribuir entre as contas bancárias dos parceiros
      // Calcular quanto cada parceiro vai receber (distribuição aleatória)
      let saldoCaixaOperacional = valorTotal;
      const distribuicaoParceiros: Array<{
        parceiroId: string;
        parceiroNome: string;
        contaId: string;
        valorTransferido: number;
      }> = [];

      // Embaralhar parceiros
      const parceirosEmbaralhados = [...parceirosValidos].sort(() => Math.random() - 0.5);
      
      // Distribuir saldo entre parceiros (não precisa ser todos nem todo o valor)
      const qtdParceirosParaUsar = Math.min(
        Math.ceil(Math.random() * parceirosEmbaralhados.length),
        parceirosEmbaralhados.length
      );

      for (let i = 0; i < qtdParceirosParaUsar && saldoCaixaOperacional > 100; i++) {
        const parceiro = parceirosEmbaralhados[i];
        const conta = parceiro.contas_bancarias[0];
        
        // Definir quanto transferir (entre 30% e 80% do restante, ou tudo se for o último)
        const percentual = i === qtdParceirosParaUsar - 1 
          ? 1 
          : 0.3 + Math.random() * 0.5;
        
        const valorMaximo = Math.floor(saldoCaixaOperacional * percentual);
        const valorTransferir = gerarValorMultiplo10(100, valorMaximo);
        
        if (valorTransferir <= 0) continue;

        // Criar transferência do caixa operacional para conta do parceiro
        const { error: transferenciaError } = await supabase.from("cash_ledger").insert({
          user_id: user.id,
          workspace_id: workspaceId,
          tipo_transacao: "TRANSFERENCIA",
          tipo_moeda: "FIAT",
          moeda: "BRL",
          valor: valorTransferir,
          origem_tipo: "CAIXA_OPERACIONAL",
          destino_tipo: "PARCEIRO_CONTA",
          destino_parceiro_id: parceiro.id,
          destino_conta_bancaria_id: conta.id,
          status: "CONFIRMADO",
          descricao: `Transferência para ${parceiro.nome} - ${conta.banco}`,
        });

        if (transferenciaError) {
          console.error("Erro na transferência:", transferenciaError);
          continue;
        }

        saldoCaixaOperacional -= valorTransferir;
        distribuicaoParceiros.push({
          parceiroId: parceiro.id,
          parceiroNome: parceiro.nome,
          contaId: conta.id,
          valorTransferido: valorTransferir,
        });

        console.log(`✅ Transferência de R$ ${valorTransferir} para ${parceiro.nome}`);
      }

      if (distribuicaoParceiros.length === 0) {
        toast.warning("Nenhuma transferência foi realizada (saldo insuficiente)");
        return;
      }

      // 5. ETAPA 3: Depositar das contas bancárias para as bookmakers
      let totalDepositadoBookmakers = 0;
      let qtdDepositos = 0;

      for (const distrib of distribuicaoParceiros) {
        // Buscar bookmakers deste parceiro
        const parceiro = parceirosValidos.find(p => p.id === distrib.parceiroId);
        if (!parceiro) continue;

        let saldoContaParceiro = distrib.valorTransferido;
        const bookmakersEmbaralhados = [...parceiro.bookmakers].sort(() => Math.random() - 0.5);
        
        // Depositar em algumas bookmakers (não necessariamente todas)
        const qtdBookmakers = Math.ceil(Math.random() * bookmakersEmbaralhados.length);

        for (let i = 0; i < qtdBookmakers && saldoContaParceiro >= 100; i++) {
          const bookmaker = bookmakersEmbaralhados[i];
          
          // Definir valor do depósito (múltiplo de 10)
          const percentual = i === qtdBookmakers - 1 
            ? 0.5 + Math.random() * 0.5 // Último: entre 50% e 100%
            : 0.2 + Math.random() * 0.6; // Outros: entre 20% e 80%
          
          const valorMaximo = Math.floor(saldoContaParceiro * percentual);
          const valorDeposito = gerarValorMultiplo10(100, valorMaximo);
          
          if (valorDeposito <= 0 || valorDeposito > saldoContaParceiro) continue;

          // Criar depósito da conta bancária para bookmaker
          const { error: depositoError } = await supabase.from("cash_ledger").insert({
            user_id: user.id,
            workspace_id: workspaceId,
            tipo_transacao: "DEPOSITO",
            tipo_moeda: "FIAT",
            moeda: "BRL",
            valor: valorDeposito,
            origem_tipo: "PARCEIRO_CONTA",
            origem_parceiro_id: distrib.parceiroId,
            origem_conta_bancaria_id: distrib.contaId,
            destino_tipo: "BOOKMAKER",
            destino_bookmaker_id: bookmaker.id,
            status: "CONFIRMADO",
            descricao: `Depósito em ${bookmaker.nome} via ${distrib.parceiroNome}`,
          });

          if (depositoError) {
            console.error("Erro no depósito:", depositoError);
            continue;
          }

          saldoContaParceiro -= valorDeposito;
          totalDepositadoBookmakers += valorDeposito;
          qtdDepositos++;

          console.log(`✅ Depósito de R$ ${valorDeposito} em ${bookmaker.nome}`);
        }
      }

      toast.success(
        `Fluxo simulado com sucesso!\n` +
        `• Aporte: R$ ${valorTotal.toLocaleString('pt-BR')}\n` +
        `• ${distribuicaoParceiros.length} parceiros receberam transferências\n` +
        `• ${qtdDepositos} depósitos em bookmakers (R$ ${totalDepositadoBookmakers.toLocaleString('pt-BR')})`
      );

    } catch (error: any) {
      console.error("Erro ao simular fluxo financeiro:", error);
      toast.error(`Erro ao simular fluxo: ${error.message}`);
    } finally {
      setLoading(null);
    }
  };

  const deleteActions = [
    { key: "parceiros", label: "Parceiros", icon: Users, action: handleDeleteParceiros, description: "Apaga todos os parceiros, contas bancárias e wallets" },
    { key: "bookmakers", label: "Bookmakers (Vínculos)", icon: Building2, action: handleDeleteBookmakers, description: "Apaga todos os vínculos parceiro-bookmaker" },
    { key: "cash_ledger", label: "Transações (Caixa)", icon: Wallet, action: () => handleDeleteAll("cash_ledger", "Transações"), description: "Apaga todas as movimentações do caixa" },
    { key: "projetos", label: "Projetos", icon: FolderKanban, action: handleDeleteProjetos, description: "Apaga todos os projetos, ciclos, apostas, surebets, freebets, perdas e vínculos" },
    { key: "investidores", label: "Investidores", icon: TrendingUp, action: () => handleDeleteAll("investidores", "Investidores"), description: "Apaga todos os investidores" },
    { key: "parcerias", label: "Parcerias (Captação)", icon: UserPlus, action: () => handleDeleteAll("parcerias", "Parcerias"), description: "Apaga todas as parcerias de captação" },
    { key: "indicadores_referral", label: "Indicadores", icon: Users, action: () => handleDeleteAll("indicadores_referral", "Indicadores"), description: "Apaga todos os indicadores" },
    { key: "operadores", label: "Operadores", icon: Users, action: () => handleDeleteAll("operadores", "Operadores"), description: "Apaga todos os operadores" },
    { key: "despesas_administrativas", label: "Despesas Administrativas", icon: Banknote, action: () => handleDeleteAll("despesas_administrativas", "Despesas Administrativas"), description: "Apaga todas as despesas administrativas" },
    { key: "movimentacoes_indicacao", label: "Movimentações Indicação", icon: UserPlus, action: () => handleDeleteAll("movimentacoes_indicacao", "Movimentações Indicação"), description: "Apaga todos os pagamentos de captação (comissões, bônus, etc.)" },
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
              <p className="font-medium">Gerar 3 Parceiros Aleatórios</p>
              <p className="text-sm text-muted-foreground">
                Cria 3 parceiros com nomes e CPFs válidos gerados automaticamente
              </p>
            </div>
            <Button 
              onClick={handleGerarParceirosAleatorios}
              disabled={loading === "parceiros_gerar"}
            >
              {loading === "parceiros_gerar" ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Users className="h-4 w-4 mr-2" />
              )}
              Gerar Parceiros
            </Button>
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <p className="font-medium">Gerar 2 Indicadores Aleatórios</p>
              <p className="text-sm text-muted-foreground">
                Cria 2 indicadores com nomes e CPFs válidos gerados automaticamente
              </p>
            </div>
            <Button 
              onClick={handleGerarIndicadoresAleatorios}
              disabled={loading === "indicadores_gerar"}
            >
              {loading === "indicadores_gerar" ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <UserPlus className="h-4 w-4 mr-2" />
              )}
              Gerar Indicadores
            </Button>
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <p className="font-medium">Gerar 2 Operadores Aleatórios</p>
              <p className="text-sm text-muted-foreground">
                Cria 2 operadores com nomes e CPFs válidos gerados automaticamente
              </p>
            </div>
            <Button 
              onClick={handleGerarOperadoresAleatorios}
              disabled={loading === "operadores_gerar"}
            >
              {loading === "operadores_gerar" ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Users className="h-4 w-4 mr-2" />
              )}
              Gerar Operadores
            </Button>
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <p className="font-medium">Gerar 1 Investidor Aleatório</p>
              <p className="text-sm text-muted-foreground">
                Cria 1 investidor com nome e CPF válido gerado automaticamente
              </p>
            </div>
            <Button 
              onClick={handleGerarInvestidorAleatorio}
              disabled={loading === "investidor_gerar"}
            >
              {loading === "investidor_gerar" ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <TrendingUp className="h-4 w-4 mr-2" />
              )}
              Gerar Investidor
            </Button>
          </div>

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

          <div className="flex items-center justify-between p-4 border border-amber-500/30 rounded-lg bg-amber-500/5">
            <div>
              <p className="font-medium">Resetar Saldos das Bookmakers</p>
              <p className="text-sm text-muted-foreground">
                Recalcula os saldos baseado apenas em depósitos e saques, apaga apostas e freebets
              </p>
            </div>
            <Button 
              onClick={handleResetSaldosBookmakers}
              disabled={loading === "reset_saldos"}
              variant="outline"
              className="border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
            >
              {loading === "reset_saldos" ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-2" />
              )}
              Resetar Saldos
            </Button>
          </div>

          {/* Simular Fluxo Financeiro Completo */}
          <div className="flex items-center justify-between p-4 border border-primary/30 rounded-lg bg-primary/5">
            <div className="flex-1">
              <p className="font-medium">Simular Fluxo Financeiro Completo</p>
              <p className="text-sm text-muted-foreground">
                Aporte do investidor → Caixa → Contas de Parceiros → Bookmakers (múltiplos de 10)
              </p>
              <div className="flex items-center gap-2 mt-2">
                <Label htmlFor="valorAporte" className="text-xs text-muted-foreground">
                  Valor do Aporte (R$):
                </Label>
                <Input
                  id="valorAporte"
                  type="number"
                  value={valorAporte}
                  onChange={(e) => setValorAporte(e.target.value)}
                  className="w-32 h-8 text-sm"
                  min="100"
                  step="100"
                />
              </div>
            </div>
            <Button 
              onClick={handleSimularFluxoFinanceiro}
              disabled={loading === "fluxo_financeiro"}
              className="ml-4"
            >
              {loading === "fluxo_financeiro" ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Banknote className="h-4 w-4 mr-2" />
              )}
              Simular Fluxo
            </Button>
          </div>
          {/* Reset Completo para Testes */}
          <div className="p-4 border-2 border-destructive/50 rounded-lg bg-destructive/5">
            <div className="flex items-start gap-3 mb-4">
              <RefreshCw className="h-5 w-5 text-destructive mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-destructive">Reset Completo para Testes</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Apaga TODOS os projetos e dados vinculados (apostas, bônus, freebets, ciclos, entregas), 
                  remove saques pendentes, recalcula saldos das bookmakers. <strong>Mantém parcerias e indicações.</strong>
                </p>
                <div className="mt-3 p-3 bg-destructive/10 rounded-md">
                  <p className="text-xs text-destructive font-medium mb-2">⚠️ Esta ação irá:</p>
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Apagar todos os projetos</li>
                    <li>Apagar todas as apostas, bônus, freebets e giros grátis</li>
                    <li>Apagar entregas e pagamentos de operadores</li>
                    <li>Remover saques pendentes do cash ledger</li>
                    <li>Resetar saldos e status das bookmakers</li>
                  </ul>
                  <p className="text-xs text-primary font-medium mt-2">✅ Será preservado:</p>
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Cash ledger confirmado (depósitos e saques finalizados)</li>
                    <li>Parceiros, operadores, investidores, indicadores</li>
                    <li>Parcerias e indicações (vínculos)</li>
                    <li>Contas bancárias e wallets</li>
                    <li>Registros de bookmakers (saldos recalculados, status resetado)</li>
                  </ul>
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-between pt-3 border-t border-destructive/20">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="confirmReset" 
                  checked={confirmResetCompleto}
                  onCheckedChange={(checked) => setConfirmResetCompleto(checked === true)}
                />
                <Label 
                  htmlFor="confirmReset" 
                  className="text-sm text-muted-foreground cursor-pointer"
                >
                  Eu entendo que esta ação é irreversível
                </Label>
              </div>
              
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="destructive"
                    disabled={!confirmResetCompleto || loading === "reset_completo"}
                  >
                    {loading === "reset_completo" ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Executar Reset Completo
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-destructive">
                      ⚠️ Confirmar Reset Completo
                    </AlertDialogTitle>
                    <AlertDialogDescription className="space-y-2">
                      <p>
                        Você está prestes a <strong>apagar TODOS os projetos</strong> e dados vinculados.
                      </p>
                      <p>
                        Os saldos das bookmakers serão recalculados baseado apenas no histórico de depósitos e saques.
                      </p>
                      <p className="text-destructive font-medium">
                        Esta ação NÃO pode ser desfeita!
                      </p>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleResetCompletoParaTestes}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Sim, executar reset completo
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
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
