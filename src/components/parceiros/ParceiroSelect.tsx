import { useState, useEffect, forwardRef, useImperativeHandle, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search, User } from "lucide-react";

interface SaldoParceiroContas {
  conta_id: string;
  parceiro_id: string;
  saldo: number;
  moeda: string;
}

interface SaldoParceiroWallets {
  wallet_id: string;
  parceiro_id: string;
  coin: string;
  saldo_usd: number;
  saldo_coin: number;
  // Campos para dinheiro em trânsito
  saldo_locked?: number;
  saldo_disponivel?: number;
}

interface ParceiroSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  onlyParceiros?: string[];
  // Props para exibição de saldo
  showSaldo?: boolean;
  tipoMoeda?: "FIAT" | "CRYPTO";
  moeda?: string;
  coin?: string;
  saldosContas?: SaldoParceiroContas[];
  saldosWallets?: SaldoParceiroWallets[];
  // Incluir parceiro atual mesmo se inativo (para edição)
  includeParceiroId?: string;
   // Incluir fornecedores do portal na lista
   includeFornecedores?: boolean;
   // Filtro por fornecedor gerenciador (apenas para parceiros)
   fornecedorOrigemId?: string;
}

export interface ParceiroSelectRef {
  focus: () => void;
  open: () => void;
}

 interface Entidade {
   id: string;
   nome: string;
   cpf?: string;
   status: string;
   fornecedor_origem_id?: string | null;
   tipo: 'parceiro' | 'fornecedor';
 }
 
 const ParceiroSelect = forwardRef<ParceiroSelectRef, ParceiroSelectProps>(({
  value, 
  onValueChange, 
  disabled, 
  onlyParceiros,
  showSaldo,
  tipoMoeda,
  moeda,
  coin,
  saldosContas,
   saldosWallets,
   includeParceiroId,
   includeFornecedores,
   fornecedorOrigemId
 }, ref) => {
   const [entidades, setEntidades] = useState<Entidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [displayName, setDisplayName] = useState<string>("");
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Expose focus and open methods via ref
  useImperativeHandle(ref, () => ({
    focus: () => {
      triggerRef.current?.focus();
    },
    open: () => {
      // Garantir foco antes do click (Radix Select pode ignorar click sem foco após fechar outro Select)
      triggerRef.current?.focus();
      triggerRef.current?.click();
    },
  }));

   // Buscar lista de parceiros e fornecedores ativos
   useEffect(() => {
     const fetchDados = async () => {
       setLoading(true);
       try {
         // 1. Buscar parceiros ativos
         let pQuery = supabase
           .from("parceiros")
           .select("id, nome, cpf, status, fornecedor_origem_id")
           .eq("status", "ativo")
           .neq("is_caixa_operacional", true)
           .order("nome", { ascending: true });
 
         if (fornecedorOrigemId) {
           pQuery = pQuery.eq("fornecedor_origem_id", fornecedorOrigemId);
         }
 
         // 2. Buscar fornecedores ativos (se solicitado)
         const queries = [pQuery];
         if (includeFornecedores) {
           queries.push(
             supabase
               .from("fornecedores")
               .select("id, nome, status")
               .eq("status", "ativo")
               .order("nome", { ascending: true })
           );
         }
 
         const results = await Promise.all(queries);
         const pData = results[0].data || [];
         const fData = results[1]?.data || [];
 
         let lista: Entidade[] = [
           ...pData.map(p => ({ ...p, tipo: 'parceiro' as const })),
           ...fData.map(f => ({ ...f, tipo: 'fornecedor' as const, cpf: '' }))
         ];
 
         // 3. Incluir ID específico (para edição)
         if (includeParceiroId && !lista.some(e => e.id === includeParceiroId)) {
           const { data: pEsp } = await supabase
             .from("parceiros")
             .select("id, nome, cpf, status")
             .eq("id", includeParceiroId)
             .maybeSingle();
           
           if (pEsp) {
             lista = [{ ...pEsp, tipo: 'parceiro' }, ...lista];
           } else if (includeFornecedores) {
             const { data: fEsp } = await supabase
               .from("fornecedores")
               .select("id, nome, status")
               .eq("id", includeParceiroId)
               .maybeSingle();
             if (fEsp) {
               lista = [{ ...fEsp, tipo: 'fornecedor', cpf: '' }, ...lista];
             }
           }
         }
 
         setEntidades(lista);
       } catch (error) {
         console.error("Erro ao buscar dados do select:", error);
       } finally {
         setLoading(false);
       }
     };
 
     fetchDados();
   }, [includeParceiroId, includeFornecedores, fornecedorOrigemId]);

   // Quando value muda, buscar o nome para exibição
   useEffect(() => {
     if (!value) {
       setDisplayName("");
       return;
     }
 
     const found = entidades.find(e => e.id === value);
     if (found) {
       setDisplayName(found.nome);
       return;
     }
 
     const fetchDisplayName = async () => {
       try {
         const { data: p } = await supabase.from("parceiros").select("nome").eq("id", value).maybeSingle();
         if (p) {
           setDisplayName(p.nome);
           return;
         }
         if (includeFornecedores) {
           const { data: f } = await supabase.from("fornecedores").select("nome").eq("id", value).maybeSingle();
           if (f) setDisplayName(f.nome);
         }
       } catch (error) {
         console.error("Erro ao buscar nome para display:", error);
       }
     };
 
     fetchDisplayName();
   }, [value, entidades, includeFornecedores]);

   // Aplicar filtro de onlyParceiros
   const availableEntidades = onlyParceiros 
     ? entidades.filter(e => onlyParceiros.includes(e.id))
     : entidades;
 
   const filteredEntidades = availableEntidades.filter((e) =>
     e.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
     (e.cpf && e.cpf.includes(searchTerm))
   );

  // Função para formatar CPF
  const formatCPF = (cpf: string): string => {
    if (!cpf || cpf.length !== 11) return cpf;
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  };

  // Função para calcular saldo agregado do parceiro
  const getSaldoParceiro = (parceiroId: string): { saldo: number; disponivel: boolean } => {
    if (!showSaldo) return { saldo: 0, disponivel: true };
    
    if (tipoMoeda === "FIAT" && moeda && saldosContas) {
      // Buscar contas do parceiro para a moeda selecionada
      const contasDoParceiro = saldosContas.filter(s => 
        s.parceiro_id === parceiroId && s.moeda === moeda
      );
      
      if (contasDoParceiro.length === 0) {
        return { saldo: 0, disponivel: false }; // "Saldo indisponível"
      }
      
      const saldoTotal = contasDoParceiro.reduce((acc, c) => acc + (c.saldo || 0), 0);
      return { saldo: saldoTotal, disponivel: true };
    }
    
    if (tipoMoeda === "CRYPTO" && coin && saldosWallets) {
      // Buscar wallets do parceiro para o coin selecionado
      const walletsDoParceiro = saldosWallets.filter(s => 
        s.parceiro_id === parceiroId && s.coin === coin
      );
      
      if (walletsDoParceiro.length === 0) {
        return { saldo: 0, disponivel: false }; // "Saldo indisponível"
      }
      
      // Usar saldo_disponivel se disponível, senão fallback para saldo_usd
      const saldoDisponivelTotal = walletsDoParceiro.reduce((acc, w) => 
        acc + (w.saldo_disponivel ?? w.saldo_usd ?? 0), 0
      );
      return { saldo: saldoDisponivelTotal, disponivel: true };
    }
    
    return { saldo: 0, disponivel: true };
  };

  // Formatar saldo para exibição
  const formatSaldo = (parceiroId: string): React.ReactNode => {
    if (!showSaldo) return null;
    
    const { saldo, disponivel } = getSaldoParceiro(parceiroId);
    
    if (!disponivel) {
      return (
        <span className="text-muted-foreground text-xs italic">
          Saldo indisponível
        </span>
      );
    }
    
    if (tipoMoeda === "FIAT") {
      const formatted = saldo.toLocaleString('pt-BR', { 
        style: 'currency', 
        currency: moeda || 'BRL' 
      });
      return (
        <span className={saldo > 0 ? "text-emerald-500 text-xs font-medium" : "text-muted-foreground text-xs"}>
          Saldo: {formatted}
        </span>
      );
    }
    
    // CRYPTO - sempre exibir em USD
    const formatted = saldo.toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
    return (
      <span className={saldo > 0 ? "text-emerald-500 text-xs font-medium" : "text-muted-foreground text-xs"}>
        Saldo: $ {formatted}
      </span>
    );
  };

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled || loading}>
      <SelectTrigger ref={triggerRef} className="w-full text-center">
        <div className="flex items-center justify-center gap-2 w-full">
          <User className="h-4 w-4 flex-shrink-0" />
          <span className="truncate text-center">
            {displayName || (loading ? "Carregando..." : "Selecione um parceiro ativo")}
          </span>
        </div>
      </SelectTrigger>
      <SelectContent>
        <div className="p-2 border-b" onKeyDown={(e) => e.stopPropagation()}>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar parceiro..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              className="pl-8"
            />
          </div>
        </div>
        <div className="max-h-[300px] overflow-auto">
          {filteredEntidades.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {searchTerm ? "Nenhum resultado encontrado" : "Nenhuma opção disponível"}
            </div>
          ) : (
            filteredEntidades.map((e) => (
              <SelectItem key={e.id} value={e.id} className="text-left justify-start">
                <div className="flex flex-col w-full py-0.5">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="font-medium">
                      {e.nome} {e.tipo === 'fornecedor' && <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded ml-1">FORNECEDOR</span>}
                    </span>
                  </div>
                  {e.cpf && (
                    <span className="text-xs text-muted-foreground ml-6">
                      {formatCPF(e.cpf)}
                    </span>
                  )}
                  {showSaldo && (
                    <div className="ml-6">
                      {formatSaldo(e.id)}
                    </div>
                  )}
                </div>
              </SelectItem>
            ))
          )}
        </div>
      </SelectContent>
    </Select>
  );
});

ParceiroSelect.displayName = "ParceiroSelect";

export default ParceiroSelect;
