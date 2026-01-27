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
}

export interface ParceiroSelectRef {
  focus: () => void;
  open: () => void;
}

interface Parceiro {
  id: string;
  nome: string;
  cpf: string;
  status: string;
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
  includeParceiroId
}, ref) => {
  const [parceiros, setParceiros] = useState<Parceiro[]>([]);
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

  // Buscar lista de parceiros ativos + parceiro atual se fornecido
  useEffect(() => {
    const fetchParceiros = async () => {
      try {
        // Buscar parceiros ativos
        const { data: ativos, error } = await supabase
          .from("parceiros")
          .select("id, nome, cpf, status")
          .eq("status", "ativo")
          .order("nome", { ascending: true });

        if (error) throw error;
        
        let lista = ativos || [];
        
        // Se temos um parceiro específico para incluir, garantir que está na lista
        if (includeParceiroId) {
          const jaExiste = lista.some(p => p.id === includeParceiroId);
          if (!jaExiste) {
            // Buscar o parceiro específico (pode estar inativo)
            const { data: parceiroEspecifico } = await supabase
              .from("parceiros")
              .select("id, nome, cpf, status")
              .eq("id", includeParceiroId)
              .maybeSingle();
            
            if (parceiroEspecifico) {
              lista = [parceiroEspecifico, ...lista];
            }
          }
        }
        
        setParceiros(lista);
      } catch (error) {
        console.error("Erro ao buscar parceiros:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchParceiros();
  }, [includeParceiroId]);

  // Quando value muda, buscar o nome para exibição
  useEffect(() => {
    if (!value) {
      setDisplayName("");
      return;
    }

    // Primeiro, verificar na lista local
    const found = parceiros.find(p => p.id === value);
    if (found) {
      setDisplayName(found.nome);
      return;
    }

    // Se não encontrou na lista (pode ser um parceiro pré-selecionado), buscar do banco
    const fetchDisplayName = async () => {
      try {
        const { data } = await supabase
          .from("parceiros")
          .select("nome")
          .eq("id", value)
          .maybeSingle();
        
        if (data) {
          setDisplayName(data.nome);
        }
      } catch (error) {
        console.error("Erro ao buscar nome do parceiro:", error);
      }
    };

    fetchDisplayName();
  }, [value, parceiros]);

  // Aplicar filtro de onlyParceiros se fornecido
  const availableParceiros = onlyParceiros 
    ? parceiros.filter(p => onlyParceiros.includes(p.id))
    : parceiros;

  const filteredParceiros = availableParceiros.filter((parceiro) =>
    parceiro.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    parceiro.cpf.includes(searchTerm)
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
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar parceiro..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
        <div className="max-h-[300px] overflow-auto">
          {filteredParceiros.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {searchTerm ? "Nenhum parceiro encontrado" : "Nenhum parceiro ativo disponível"}
            </div>
          ) : (
            filteredParceiros.map((parceiro) => (
              <SelectItem key={parceiro.id} value={parceiro.id}>
                <div className="flex flex-col gap-0.5 w-full">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="font-medium">{parceiro.nome}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatCPF(parceiro.cpf)}
                    </span>
                  </div>
                  {showSaldo && (
                    <div className="ml-6">
                      {formatSaldo(parceiro.id)}
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
