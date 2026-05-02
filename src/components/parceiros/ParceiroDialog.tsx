import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Loader2, User, Landmark, Wallet, Copy, Check } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PersonalDataTab } from "./tabs/PersonalDataTab";
import { BankAccountsTab } from "./tabs/BankAccountsTab";
import { CryptoWalletsTab } from "./tabs/CryptoWalletsTab";
import { validateCPF, formatCPF, formatCEP } from "@/lib/validators";
import { ParceiroProfileView } from "./ParceiroProfileView";

interface PixKey {
  tipo: string;
  chave: string;
}

interface BankAccount {
  id?: string;
  banco_id: string;
  moeda: string;
  agencia: string;
  conta: string;
  tipo_conta: string;
  titular: string;
  pix_keys: PixKey[];
  observacoes: string;
}

interface CryptoWallet {
  id?: string;
  label?: string;
  moeda: string[];
  endereco: string;
  rede_id: string;
  exchange?: string;
  observacoes: string;
}

interface Banco {
  id: string;
  codigo: string;
  nome: string;
}

interface RedeCrypto {
  id: string;
  codigo: string;
  nome: string;
}

interface ParceiroDialogProps {
  open: boolean;
  onClose: (options?: { saved?: boolean }) => void;
  parceiro: any | null;
  viewMode?: boolean;
  initialTab?: "dados" | "bancos" | "crypto";
}

export default function ParceiroDialog({ open, onClose, parceiro, viewMode = false, initialTab = "dados" }: ParceiroDialogProps) {
  const { workspaceId } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [endereco, setEndereco] = useState("");
  const [cidade, setCidade] = useState("");
  const [cep, setCep] = useState("");
  const [status, setStatus] = useState("ativo");
  const [observacoes, setObservacoes] = useState("");
  const [fornecedorOrigemId, setFornecedorOrigemId] = useState<string | null>(null);
  const [fornecedores, setFornecedores] = useState<any[]>([]);
  const [qualidade, setQualidade] = useState<number | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [cryptoWallets, setCryptoWallets] = useState<CryptoWallet[]>([]);
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [redes, setRedes] = useState<RedeCrypto[]>([]);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [parceiroId, setParceiroId] = useState<string | null>(null);
  const [cpfError, setCpfError] = useState<string>("");
  const [telefoneError, setTelefoneError] = useState<string>("");
  const [checkingCpf, setCheckingCpf] = useState(false);
  const [checkingTelefone, setCheckingTelefone] = useState(false);
  const [enderecoErrors, setEnderecoErrors] = useState<{ [key: number]: string }>({});
  const [checkingEnderecos, setCheckingEnderecos] = useState<{ [key: number]: boolean }>({});
  const [copiedField, setCopiedField] = useState<string>("");
  const [initialState, setInitialState] = useState<any>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [planLimitError, setPlanLimitError] = useState<string | null>(null);
  const [hasSavedDuringSession, setHasSavedDuringSession] = useState(false);
  const [expandedBankIndex, setExpandedBankIndex] = useState<number | null>(null);
  const [expandedWalletIndex, setExpandedWalletIndex] = useState<number | null>(null);
  const [contaSaldos, setContaSaldos] = useState<Record<string, number>>({});
  const [walletSaldos, setWalletSaldos] = useState<Record<string, { saldo: number; coin: string }>>({});
  const { toast } = useToast();

   // Debug logging to help identify "Invalid input syntax" errors
   useEffect(() => {
     if (loading) {
       console.log("[ParceiroDialog] Loading state changed:", loading);
     }
   }, [loading]);

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      toast({
        title: "Copiado!",
        description: `${fieldName} copiado para a área de transferência.`,
      });
      setTimeout(() => setCopiedField(""), 2000);
    } catch (error) {
      toast({
        title: "Erro ao copiar",
        description: "Não foi possível copiar o texto.",
        variant: "destructive",
      });
    }
  };

  // Capture initial state when dialog opens with parceiro data loaded
  // Use parceiro object directly instead of relying on state timing
  useEffect(() => {
    if (open && parceiro) {
      const mappedBankAccounts = (parceiro.contas_bancarias || []).map((acc: any) => {
        let parsedPixKeys: Array<{ tipo: string; chave: string }> = [];
        if (acc.pix_keys && Array.isArray(acc.pix_keys)) {
          parsedPixKeys = acc.pix_keys.map((pk: any) => ({
            tipo: pk.tipo || "",
            chave: pk.chave || ""
          }));
        }
        if (parsedPixKeys.length === 0) parsedPixKeys = [{ tipo: "", chave: "" }];
        return { ...acc, moeda: acc.moeda || "BRL", pix_keys: parsedPixKeys };
      });

      const mappedWallets = (parceiro.wallets_crypto || []).map((w: any) => ({
        ...w,
        moeda: Array.isArray(w.moeda) ? w.moeda : w.moeda ? [w.moeda] : [],
      }));

      setInitialState({
        nome: parceiro.nome || "",
        cpf: formatCPF(parceiro.cpf || ""),
        email: parceiro.email || "",
        telefone: parceiro.telefone || "",
        dataNascimento: parceiro.data_nascimento || "",
        endereco: parceiro.endereco || "",
        cidade: parceiro.cidade || "",
        cep: formatCEP(parceiro.cep || ""),
         status: parceiro.status || "ativo",
         observacoes: parceiro.observacoes || "",
         fornecedorOrigemId: (parceiro as any).fornecedor_origem_id || null,
         qualidade: parceiro.qualidade ?? null,
        bankAccounts: JSON.stringify(mappedBankAccounts),
        cryptoWallets: JSON.stringify(mappedWallets),
      });
    }
  }, [open, parceiro]);

  // Check for changes comparing current state with initial state
  useEffect(() => {
    // For new partner after first save, always allow saving if there are bank accounts or wallets
    if (parceiroId && !parceiro) {
      const hasNewAccounts = bankAccounts.some(acc => !acc.id && acc.banco_id);
      const hasNewWallets = cryptoWallets.some(w => !w.id && w.endereco);
      if (hasNewAccounts || hasNewWallets) {
        setHasChanges(true);
        return;
      }
    }

    if (!initialState || !parceiro) {
      setHasChanges(false);
      return;
    }

    const currentState = {
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
       fornecedorOrigemId,
       qualidade,
      bankAccounts: JSON.stringify(bankAccounts),
      cryptoWallets: JSON.stringify(cryptoWallets)
    };

    const changed = JSON.stringify(currentState) !== JSON.stringify(initialState);
    setHasChanges(changed);
  }, [nome, cpf, email, telefone, dataNascimento, endereco, cidade, cep, status, observacoes, qualidade, bankAccounts, cryptoWallets, initialState, parceiro, parceiroId]);

  useEffect(() => {
    fetchBancos();
    fetchRedes();
    fetchFornecedores();
  }, []);

  const fetchFornecedores = async () => {
    const { data } = await supabase
      .from("fornecedores")
      .select("id, nome")
      .eq("status", "ATIVO")
      .order("nome");
    if (data) setFornecedores(data);
  };

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      if (!parceiro) {
        resetForm();
      }
    }
  }, [open, initialTab, parceiro]);

  useEffect(() => {
    if (parceiro) {
      setNome(parceiro.nome || "");
      setCpf(formatCPF(parceiro.cpf || "")); // Apply mask when loading
      setEmail(parceiro.email || "");
      setTelefone(parceiro.telefone || "");
      setDataNascimento(parceiro.data_nascimento || "");
      setEndereco(parceiro.endereco || "");
      setCidade(parceiro.cidade || "");
      setCep(formatCEP(parceiro.cep || "")); // Apply mask when loading
       setStatus(parceiro.status || "ativo");
       setObservacoes(parceiro.observacoes || "");
       setFornecedorOrigemId((parceiro as any).fornecedor_origem_id || null);
       setQualidade((parceiro as any).qualidade ?? null);
      
      // Map bank accounts data using pix_keys JSONB column
      const mappedAccounts = (parceiro.contas_bancarias || []).map((acc: any) => {
        const formatCPFDisplay = (cpf: string) => {
          const clean = cpf.replace(/\D/g, "");
          return clean.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
        };
        const formatCNPJDisplay = (cnpj: string) => {
          const clean = cnpj.replace(/\D/g, "");
          return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
        };
        
        // Parse pix_keys from JSONB (array format)
        let parsedPixKeys: Array<{ tipo: string; chave: string }> = [];
        if (acc.pix_keys && Array.isArray(acc.pix_keys)) {
          parsedPixKeys = acc.pix_keys.map((pk: any) => ({
            tipo: pk.tipo || "",
            chave: pk.tipo === "cpf" ? formatCPFDisplay(pk.chave) 
                 : pk.tipo === "cnpj" ? formatCNPJDisplay(pk.chave)
                 : pk.chave || ""
          }));
        }
        
        // Fallback to empty if no keys
        if (parsedPixKeys.length === 0) {
          parsedPixKeys = [{ tipo: "", chave: "" }];
        }
        
        return {
          ...acc,
          moeda: acc.moeda || "BRL",
          pix_keys: parsedPixKeys
        };
      });
      setBankAccounts(mappedAccounts);
      
      // Decrypt wallet observacoes when loading and ensure moeda is always an array
      const decryptedWallets = (parceiro.wallets_crypto || []).map((wallet: any) => ({
        ...wallet,
        label: wallet.label || "",
        moeda: Array.isArray(wallet.moeda) ? wallet.moeda : [],
        observacoes: wallet.observacoes_encrypted 
          ? decodeURIComponent(escape(atob(wallet.observacoes_encrypted)))
          : ""
      }));
      setCryptoWallets(decryptedWallets);
      
      setParceiroId(parceiro.id);
    } else {
      resetForm();
      resetForm();
    }
  }, [parceiro]);

  // Fetch bank account balances when viewing profile
  useEffect(() => {
    if (!viewMode || !open || !parceiroId) {
      setContaSaldos({});
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("v_saldo_parceiro_contas")
        .select("conta_id, saldo")
        .eq("parceiro_id", parceiroId);
      if (cancelled || error || !data) return;
      const map: Record<string, number> = {};
      data.forEach((r: any) => {
        if (r.conta_id) map[r.conta_id] = Number(r.saldo) || 0;
      });
      setContaSaldos(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [viewMode, open, parceiroId, bankAccounts.length]);

  // Fetch crypto wallet balances when viewing profile
  useEffect(() => {
    if (!viewMode || !open || !parceiroId) {
      setWalletSaldos({});
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("v_wallet_crypto_balances")
        .select("wallet_id, balance_total_coin, primary_coin")
        .eq("parceiro_id", parceiroId);
      if (cancelled || error || !data) return;
      const map: Record<string, { saldo: number; coin: string }> = {};
      data.forEach((r: any) => {
        if (r.wallet_id) {
          map[r.wallet_id] = {
            saldo: Number(r.balance_total_coin) || 0,
            coin: r.primary_coin || "USDT",
          };
        }
      });
      setWalletSaldos(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [viewMode, open, parceiroId, cryptoWallets.length]);

  // Real-time CPF validation
  useEffect(() => {
    // Skip validation in view mode
    if (viewMode) {
      setCheckingCpf(false);
      setCpfError("");
      return;
    }

    const checkCpf = async () => {
      const cleanCpf = cpf.replace(/\D/g, "");
      
      // Check if empty or incomplete
      if (cleanCpf.length === 0) {
        setCpfError("");
        return;
      }
      
      // Check if complete (11 digits)
      if (cleanCpf.length === 11) {
        // Validate CPF format
        if (!validateCPF(cpf)) {
          setCpfError("CPF inválido");
          return;
        }

        // Check for duplicate
        setCheckingCpf(true);
        setCpfError("");

        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          let query = supabase
            .from("parceiros")
            .select("id")
            .eq("user_id", user.id)
            .eq("cpf", cleanCpf);

          // Exclude current parceiro if editing
          if (parceiroId || parceiro?.id) {
            query = query.neq("id", parceiroId || parceiro?.id);
          }

          const { data, error } = await query;

          if (error) throw error;

          if (data && data.length > 0) {
            setCpfError("CPF já cadastrado");
          }
        } catch (error) {
          console.error("Error checking CPF:", error);
        } finally {
          setCheckingCpf(false);
        }
      } else {
        // Incomplete CPF, clear error
        setCpfError("");
      }
    };

    const timer = setTimeout(checkCpf, 500); // Debounce 500ms
    return () => clearTimeout(timer);
  }, [cpf, parceiroId, parceiro?.id, viewMode]);

  // Real-time telefone validation
  useEffect(() => {
    // Skip validation in view mode
    if (viewMode) {
      setCheckingTelefone(false);
      setTelefoneError("");
      return;
    }

    const checkTelefone = async () => {
      const cleanTelefone = telefone.replace(/[^\d+]/g, "");
      
      // Only check if telefone has reasonable length
      if (cleanTelefone.length < 12) {
        setTelefoneError("");
        return;
      }

      setCheckingTelefone(true);
      setTelefoneError("");

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        let query = supabase
          .from("parceiros")
          .select("id")
          .eq("user_id", user.id)
          .eq("telefone", cleanTelefone);

        // Exclude current parceiro if editing
        if (parceiroId || parceiro?.id) {
          query = query.neq("id", parceiroId || parceiro?.id);
        }

        const { data, error } = await query;

        if (error) throw error;

        if (data && data.length > 0) {
          setTelefoneError("Telefone já cadastrado");
        }
      } catch (error) {
        console.error("Error checking telefone:", error);
      } finally {
        setCheckingTelefone(false);
      }
    };

    const timer = setTimeout(checkTelefone, 500); // Debounce 500ms
    return () => clearTimeout(timer);
  }, [telefone, parceiroId, parceiro?.id, viewMode]);

  const fetchBancos = async () => {
    const { data } = await supabase.from("bancos").select("*").order("nome");
    if (data) setBancos(data);
  };

  const fetchRedes = async () => {
    const { data } = await supabase.from("redes_crypto").select("*").order("nome");
    if (data) setRedes(data);
  };

  const resetForm = () => {
    setNome("");
    setCpf("");
    setEmail("");
    setTelefone("");
    setDataNascimento("");
    setEndereco("");
    setCidade("");
    setCep("");
    setStatus("ativo");
    setObservacoes("");
    setQualidade(null);
    setBankAccounts([]);
    setCryptoWallets([]);
    setActiveTab("dados");
    setParceiroId(null);
    setCpfError("");
    setTelefoneError("");
    setCheckingCpf(false);
    setCheckingTelefone(false);
    setHasSavedDuringSession(false);
    setExpandedBankIndex(null);
    setExpandedWalletIndex(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check for validation errors
    const hasEnderecoError = Object.values(enderecoErrors || {}).some(error => error);
    if (cpfError || telefoneError || hasEnderecoError) {
      toast({
        title: "Erros de validação",
        description: "Por favor, corrija os erros antes de salvar.",
        variant: "destructive",
      });
      return;
    }
    
    // Validate mandatory fields
    const isNewParceiro = !parceiroId && !parceiro;
    if (isNewParceiro) {
      // New parceiros require all fields
      if (!nome || !cpf || !dataNascimento || !email || !telefone) {
        toast({
          title: "Campos obrigatórios faltando",
          description: "Por favor, preencha: Nome, CPF, Data Nascimento, Email e Telefone.",
          variant: "destructive",
        });
        return;
      }
    } else {
      // Existing parceiros only require nome and cpf
      if (!nome || !cpf) {
        toast({
          title: "Campos obrigatórios faltando",
          description: "Por favor, preencha: Nome e CPF.",
          variant: "destructive",
        });
        return;
      }
    }
    
    // Validate CPF
    if (!validateCPF(cpf)) {
      toast({
        title: "CPF inválido",
        description: "Por favor, informe um CPF válido.",
        variant: "destructive",
      });
      return;
    }
    
    // Check bank accounts validation - Only validate accounts that have some information
    const relevantBankAccounts = bankAccounts.filter(acc => 
      acc.banco_id || (acc.pix_keys && acc.pix_keys.some(k => k.chave)) || acc.agencia || acc.conta
    );

    for (const account of relevantBankAccounts) {
      if (!account.banco_id) {
        toast({
          title: "Campo obrigatório no Banco",
          description: "Por favor, selecione o banco para todas as contas adicionadas.",
          variant: "destructive",
        });
        return;
      }
      if (!account.pix_keys.some(k => k.chave)) {
        toast({
          title: "Campo obrigatório no Banco",
          description: "Adicione pelo menos uma chave PIX para todas as contas adicionadas.",
          variant: "destructive",
        });
        return;
      }
    }

    // Check for duplicate PIX keys across all bank accounts
    const allPixKeys: string[] = [];
    for (const account of bankAccounts) {
      for (const pixKey of account.pix_keys) {
        if (pixKey.chave) {
          // Normalize the key for comparison (remove formatting)
          const normalizedKey = pixKey.tipo === "cpf" || pixKey.tipo === "cnpj" 
            ? pixKey.chave.replace(/\D/g, "") 
            : pixKey.chave.toLowerCase().trim();
          
          if (allPixKeys.includes(normalizedKey)) {
            toast({
              title: "Chave PIX duplicada",
              description: `A chave PIX "${pixKey.chave}" está cadastrada em mais de uma conta bancária.`,
              variant: "destructive",
            });
            return;
          }
          allPixKeys.push(normalizedKey);
        }
      }
    }
    
    // Validate wallet data - Only validate wallets that have some information
    const relevantWallets = cryptoWallets.filter(w => 
      w.rede_id || w.endereco || (w.moeda && w.moeda.length > 0) || w.exchange || w.label
    );

    for (const wallet of relevantWallets) {
      if (!wallet.rede_id || !wallet.endereco || !wallet.moeda || wallet.moeda.length === 0) {
        toast({
          title: "Campos obrigatórios faltando na Wallet",
          description: "Por favor, preencha Rede, Moedas e Endereço em todas as wallets que você adicionou.",
          variant: "destructive",
        });
        return;
      }
    }
    
    await saveData();
  };
  
  const saveData = async () => {
    setLoading(true);
    setPlanLimitError(null);
    console.log("[ParceiroDialog] Starting saveData...");

    try {
      // Helper to ensure UUID fields are either valid UUIDs or null (never empty strings)
      const sanitizeUuid = (val: any) => {
        if (!val || val === "" || val === "none") return null;
        // Basic UUID format check
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(val) ? val : null;
      };
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const isNewPartner = !parceiroId && !parceiro?.id;
      const isActivating = status === 'ativo' && parceiro?.status !== 'ativo';

      // Check partner limit for new active partners or when activating
      if ((isNewPartner && status === 'ativo') || isActivating) {
        if (workspaceId) {
          const { data: limitCheck, error: limitError } = await supabase.rpc('check_partner_limit', {
            workspace_uuid: workspaceId
          });

          if (limitError) throw limitError;

          const result = limitCheck as unknown as { allowed: boolean; current: number; limit: number; plan: string };
          if (!result.allowed) {
            const msg = `Limite atingido: ${result.current}/${result.limit} parceiros ativos no plano ${result.plan.toUpperCase()}. Faça upgrade para adicionar mais.`;
            setPlanLimitError(msg);
            toast({
              title: "Limite de parceiros atingido",
              description: msg,
              variant: "destructive",
            });
            setLoading(false);
            return;
          }
        }
      }

      const parceiroData: any = {
        user_id: user.id,
        workspace_id: workspaceId,
        nome: nome.trim(),
        cpf: cpf.replace(/\D/g, "") || null,
        email: email || null,
        telefone: telefone.replace(/[^\d+]/g, "") || null,
        data_nascimento: dataNascimento || null,
        endereco: endereco || null,
        cidade: cidade || null,
        cep: cep.replace(/\D/g, "") || null,
        status,
        observacoes: observacoes || null,
        fornecedor_origem_id: sanitizeUuid(fornecedorOrigemId),
        qualidade: (qualidade === null || isNaN(Number(qualidade))) ? null : Number(qualidade),
      };

      console.log("[ParceiroDialog] Saving parceiroData:", JSON.stringify(parceiroData, null, 2));

      if (!parceiroData.workspace_id) {
        throw new Error("ID do Workspace não encontrado. Por favor, recarregue a página.");
      }

      let currentParceiroId = parceiroId || parceiro?.id;

      if (currentParceiroId) {
        const { error } = await supabase
          .from("parceiros")
          .update(parceiroData)
          .eq("id", currentParceiroId);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("parceiros")
          .insert(parceiroData)
          .select()
          .single();

        if (error) throw error;
        currentParceiroId = data.id;
        setParceiroId(data.id);
      }

      // Save bank accounts with proper UPDATE/INSERT/DELETE logic
      if (currentParceiroId) {
        // Get existing account IDs from database
        const { data: existingAccounts } = await supabase
          .from("contas_bancarias")
          .select("id")
          .eq("parceiro_id", currentParceiroId);
        
        const existingIds = new Set((existingAccounts || []).map(acc => acc.id));
        const currentIds = new Set(bankAccounts.map(acc => acc.id).filter(Boolean));
        
        // DELETE accounts that were removed
        const idsToDelete = [...existingIds].filter(id => !currentIds.has(id));
        if (idsToDelete.length > 0) {
          await supabase
            .from("contas_bancarias")
            .delete()
            .in("id", idsToDelete);
        }
        
        // UPDATE or INSERT accounts
        const updatedBankAccounts = [...bankAccounts];
        for (let i = 0; i < updatedBankAccounts.length; i++) {
          const account = updatedBankAccounts[i];
          // Only save relevant bank accounts (must have a valid banco_id)
          const isRelevant = !!account.banco_id && account.banco_id !== "";
          
          if (isRelevant) {
            // Format PIX keys for JSONB storage - clean CPF/CNPJ formatting
            const cleanedPixKeys = account.pix_keys
              .filter(k => k.chave && k.tipo)
              .map(k => ({
                tipo: k.tipo,
                chave: (k.tipo === "cpf" || k.tipo === "cnpj") 
                  ? k.chave.replace(/\D/g, "") 
                  : k.chave
              }));
            
            const accountData = {
              parceiro_id: sanitizeUuid(currentParceiroId),
              banco_id: sanitizeUuid(account.banco_id),
              banco: bancos.find(b => b.id === account.banco_id)?.nome || "Banco Desconhecido",
              moeda: account.moeda || "BRL",
              agencia: account.agencia || null,
              conta: account.conta || null,
              tipo_conta: account.tipo_conta || "corrente",
              titular: (account.titular || nome).trim(),
              pix_keys: cleanedPixKeys,
              observacoes: account.observacoes || null,
            };

            console.log(`[ParceiroDialog] Saving bank account ${i}:`, JSON.stringify(accountData, null, 2));
            
            if (account.id) {
              // UPDATE existing account
              const { error: updateError } = await supabase
                .from("contas_bancarias")
                .update(accountData)
                .eq("id", account.id);
              
              if (updateError) {
                console.error("Error updating bank account:", updateError);
                throw updateError;
              }
            } else {
              // INSERT new account and capture the returned ID
              const { data: insertedData, error: insertError } = await supabase
                .from("contas_bancarias")
                .insert([accountData])
                .select('id')
                .single();
              
              if (insertError) {
                console.error("Error inserting bank account:", insertError);
                throw insertError;
              }
              
              // Update the account local copy with the new ID
              if (insertedData?.id) {
                updatedBankAccounts[i] = { ...updatedBankAccounts[i], id: insertedData.id };
              }
            }
          }
        }
        setBankAccounts(updatedBankAccounts);
      }

      // Save crypto wallets with proper UPDATE/INSERT/DELETE logic
      if (currentParceiroId) {
        // Get existing wallet IDs from database
        const { data: existingWallets } = await supabase
          .from("wallets_crypto")
          .select("id")
          .eq("parceiro_id", currentParceiroId);
        
        const existingIds = new Set((existingWallets || []).map(w => w.id));
        const currentIds = new Set(cryptoWallets.map(w => w.id).filter(Boolean));
        
        // DELETE wallets that were removed
        const idsToDelete = [...existingIds].filter(id => !currentIds.has(id));
        if (idsToDelete.length > 0) {
          await supabase
            .from("wallets_crypto")
            .delete()
            .in("id", idsToDelete);
        }
        
        // UPDATE or INSERT wallets
        const updatedCryptoWallets = [...cryptoWallets];
        for (let i = 0; i < updatedCryptoWallets.length; i++) {
          const wallet = updatedCryptoWallets[i];
          // Only save relevant wallets (must have network and address)
          const isRelevant = !!wallet.rede_id && wallet.rede_id !== "" && !!wallet.endereco;
          
          if (isRelevant) {
            // Encrypt observacoes if present
            const observacoesEncrypted = wallet.observacoes 
              ? btoa(unescape(encodeURIComponent(wallet.observacoes)))
              : null;

            const walletData: any = {
              parceiro_id: currentParceiroId,
              label: wallet.label || null,
              moeda: wallet.moeda || [],
              endereco: wallet.endereco,
              network: redes.find(r => r.id === wallet.rede_id)?.nome || "",
              rede_id: wallet.rede_id === "" ? null : wallet.rede_id,
              exchange: wallet.exchange || null,
              observacoes_encrypted: observacoesEncrypted,
            };
            
            if (wallet.id) {
              // UPDATE existing wallet
              const { error: updateError } = await supabase
                .from("wallets_crypto")
                .update(walletData)
                .eq("id", wallet.id);
              
              if (updateError) {
                console.error("Error updating crypto wallet:", updateError);
                throw updateError;
              }
            } else {
              // INSERT new wallet and capture the returned ID
              const { data: insertedData, error: insertError } = await supabase
                .from("wallets_crypto")
                .insert([walletData])
                .select('id')
                .single();
              
              if (insertError) {
                console.error("Error inserting crypto wallet:", insertError);
                throw insertError;
              }
              
              // Update the wallet local copy with the new ID
              if (insertedData?.id) {
                updatedCryptoWallets[i] = { ...updatedCryptoWallets[i], id: insertedData.id };
              }
            }
          }
        }
        setCryptoWallets(updatedCryptoWallets);
      }

      toast({
        title: parceiro ? "Parceiro atualizado" : "Parceiro criado",
        description: "Os dados foram salvos com sucesso.",
      });

      onClose({ saved: true });
    } catch (error: any) {
      console.error("[ParceiroDialog] Caught error in saveData:", error);
      let errorMessage = error.message;
      
      // Check for duplicate CPF error
      if (error.message?.includes('unique_cpf_per_user')) {
        errorMessage = "Já existe um parceiro cadastrado com este CPF.";
      }
      // Check for duplicate phone error
      if (error.message?.includes('unique_telefone_per_user')) {
        errorMessage = "Já existe um parceiro cadastrado com este telefone.";
      }
      // Check for duplicate wallet address error
      if (error.message?.includes('Este endereço de wallet já está cadastrado')) {
        errorMessage = "Este endereço de wallet já está cadastrado para outro parceiro.";
      }
      // Check for duplicate PIX key error
      if (error.message?.includes('Esta chave PIX já está cadastrada')) {
        errorMessage = "Esta chave PIX já está cadastrada em outra conta bancária.";
      }
      
      toast({
        title: "Erro ao salvar parceiro",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const addBankAccount = () => {
    const newIndex = bankAccounts.length;
    setBankAccounts([
      ...bankAccounts,
      { 
        banco_id: "", 
        moeda: "BRL",
        agencia: "", 
        conta: "", 
        tipo_conta: "corrente", 
        titular: nome, 
        pix_keys: [{ tipo: "", chave: "" }],
        observacoes: ""
      },
    ]);
    setExpandedBankIndex(newIndex);
  };

  const removeBankAccount = (index: number) => {
    setBankAccounts(bankAccounts.filter((_, i) => i !== index));
    if (expandedBankIndex === index) setExpandedBankIndex(null);
    else if (expandedBankIndex !== null && expandedBankIndex > index) setExpandedBankIndex(expandedBankIndex - 1);
  };

  const updateBankAccount = (index: number, field: string, value: any) => {
    const updated = [...bankAccounts];
    updated[index] = { ...updated[index], [field]: value };
    setBankAccounts(updated);
  };

  const addCryptoWallet = () => {
    const newIndex = cryptoWallets.length;
    setCryptoWallets([
      ...cryptoWallets,
      { 
        label: "",
        moeda: [], 
        endereco: "", 
        rede_id: "", 
        exchange: "",
        observacoes: ""
      },
    ]);
    setExpandedWalletIndex(newIndex);
  };

  const removeCryptoWallet = (index: number) => {
    setCryptoWallets(cryptoWallets.filter((_, i) => i !== index));
    if (expandedWalletIndex === index) setExpandedWalletIndex(null);
    else if (expandedWalletIndex !== null && expandedWalletIndex > index) setExpandedWalletIndex(expandedWalletIndex - 1);
    
    // Clear errors for this wallet and reorganize remaining errors
    const newErrors: { [key: number]: string } = {};
    const newChecking: { [key: number]: boolean } = {};
    
    Object.keys(enderecoErrors).forEach((key) => {
      const keyIndex = parseInt(key);
      if (keyIndex < index) {
        // Keep errors before removed index
        newErrors[keyIndex] = enderecoErrors[keyIndex];
      } else if (keyIndex > index) {
        // Shift down errors after removed index
        newErrors[keyIndex - 1] = enderecoErrors[keyIndex];
      }
      // Skip the removed index
    });
    
    Object.keys(checkingEnderecos).forEach((key) => {
      const keyIndex = parseInt(key);
      if (keyIndex < index) {
        newChecking[keyIndex] = checkingEnderecos[keyIndex];
      } else if (keyIndex > index) {
        newChecking[keyIndex - 1] = checkingEnderecos[keyIndex];
      }
    });
    
    setEnderecoErrors(newErrors);
    setCheckingEnderecos(newChecking);
  };

  const updateCryptoWallet = (index: number, field: string, value: any) => {
    const updated = [...cryptoWallets];
    updated[index] = { ...updated[index], [field]: value };
    setCryptoWallets(updated);

    // Clear error when endereco changes
    if (field === "endereco") {
      setEnderecoErrors({ ...enderecoErrors, [index]: "" });
    }
  };

  // Validate wallet address uniqueness
  const validateWalletEndereco = async (endereco: string, index: number, walletId?: string) => {
    if (viewMode || !endereco || endereco.length < 10) {
      setEnderecoErrors({ ...enderecoErrors, [index]: "" });
      return;
    }

    setCheckingEnderecos({ ...checkingEnderecos, [index]: true });

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if address already exists for this tenant
      let query = supabase
        .from("wallets_crypto")
        .select("id, parceiro_id, parceiros!inner(user_id)")
        .eq("endereco", endereco)
        .eq("parceiros.user_id", user.id);

      // Exclude current wallet if editing
      if (walletId) {
        query = query.neq("id", walletId);
      }

      const { data, error } = await query;

      if (error) throw error;

      if (data && data.length > 0) {
        setEnderecoErrors({ ...enderecoErrors, [index]: "Este endereço já está cadastrado" });
      } else {
        setEnderecoErrors({ ...enderecoErrors, [index]: "" });
      }
    } catch (error) {
      console.error("Error checking wallet address:", error);
    } finally {
      setCheckingEnderecos({ ...checkingEnderecos, [index]: false });
    }
  };

  const savePersonalData = async () => {
    // Check for validation errors
    if (cpfError || telefoneError) {
      toast({
        title: "Erros de validação",
        description: "Por favor, corrija os erros antes de salvar.",
        variant: "destructive",
      });
      return;
    }
    
    // Validate mandatory fields
    if (!nome || !cpf) {
      toast({
        title: "Campos obrigatórios faltando",
        description: "Por favor, preencha: Nome e CPF.",
        variant: "destructive",
      });
      return;
    }
    
    // Validate CPF
    if (!validateCPF(cpf)) {
      toast({
        title: "CPF inválido",
        description: "Por favor, informe um CPF válido.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const parceiroData = {
        user_id: user.id,
        workspace_id: workspaceId,
        nome,
        cpf: cpf.replace(/\D/g, ""),
        email: email || null,
        telefone: telefone ? telefone.replace(/[^\d+]/g, "") : null,
        data_nascimento: dataNascimento || null,
        endereco: endereco || null,
        cidade: cidade || null,
        cep: cep.replace(/\D/g, "") || null,
        status,
        observacoes: observacoes || null,
        qualidade: qualidade ?? null,
      };

      if (parceiroId) {
        // Update existing
        const { error } = await supabase
          .from("parceiros")
          .update(parceiroData)
          .eq("id", parceiroId);

        if (error) throw error;
      } else {
        // Create new
        const { data, error } = await supabase
          .from("parceiros")
          .insert(parceiroData)
          .select()
          .single();

        if (error) throw error;
        setParceiroId(data.id);
      }

      toast({
        title: "Dados pessoais salvos",
        description: "Agora você pode adicionar contas bancárias.",
      });

      // Switch to bank accounts tab
      setHasSavedDuringSession(true);
      setActiveTab("bancos");
    } catch (error: any) {
      let errorMessage = error.message;
      
      // Check for duplicate CPF error
      if (error.message?.includes('unique_cpf_per_user')) {
        errorMessage = "Já existe um parceiro cadastrado com este CPF.";
      }
      // Check for duplicate phone error
      if (error.message?.includes('unique_telefone_per_user')) {
        errorMessage = "Já existe um parceiro cadastrado com este telefone.";
      }
      
      toast({
        title: "Erro ao salvar dados pessoais",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Function to save bank accounts and navigate to crypto tab
  const saveBankAccountsAndContinue = async () => {
    if (!parceiroId && !parceiro) return;
    
    const currentParceiroId = parceiroId || parceiro?.id;
    if (!currentParceiroId) return;

    // Validate PIX key uniqueness within current partner's accounts
    const allPixKeys = bankAccounts.flatMap((acc, accIndex) => 
      acc.pix_keys
        .filter(k => k.chave)
        .map(k => ({ chave: k.chave, accountIndex: accIndex }))
    );
    
    const pixKeyMap = new Map<string, number>();
    for (const { chave, accountIndex } of allPixKeys) {
      if (pixKeyMap.has(chave) && pixKeyMap.get(chave) !== accountIndex) {
        toast({
          title: "Chave PIX duplicada",
          description: "A mesma chave PIX não pode ser usada em contas diferentes.",
          variant: "destructive",
        });
        return;
      }
      pixKeyMap.set(chave, accountIndex);
    }

    setLoading(true);

    try {
      // Get existing account IDs from database
      const { data: existingAccounts } = await supabase
        .from("contas_bancarias")
        .select("id")
        .eq("parceiro_id", currentParceiroId);
      
      const existingIds = new Set((existingAccounts || []).map(acc => acc.id));
      const currentIds = new Set(bankAccounts.map(acc => acc.id).filter(Boolean));
      
      // DELETE accounts that were removed
      const idsToDelete = [...existingIds].filter(id => !currentIds.has(id));
      if (idsToDelete.length > 0) {
        await supabase
          .from("contas_bancarias")
          .delete()
          .in("id", idsToDelete);
      }
      
      // UPDATE or INSERT accounts
      for (const account of bankAccounts) {
        if (account.banco_id) {
          // Format PIX keys for JSONB storage - clean CPF/CNPJ formatting
          const cleanedPixKeys = account.pix_keys
            .filter(k => k.chave && k.tipo)
            .map(k => ({
              tipo: k.tipo,
              chave: (k.tipo === "cpf" || k.tipo === "cnpj") 
                ? k.chave.replace(/\D/g, "") 
                : k.chave
            }));
          
          const accountData = {
            parceiro_id: currentParceiroId,
            banco_id: account.banco_id,
            banco: bancos.find(b => b.id === account.banco_id)?.nome || "",
            moeda: account.moeda || "BRL",
            agencia: account.agencia || null,
            conta: account.conta || null,
            tipo_conta: account.tipo_conta,
            titular: account.titular || nome,
            pix_keys: cleanedPixKeys,
            observacoes: account.observacoes || null,
          };
          
          if (account.id) {
            // UPDATE existing account
            const { error: updateError } = await supabase
              .from("contas_bancarias")
              .update(accountData)
              .eq("id", account.id);
            
            if (updateError) {
              console.error("Error updating bank account:", updateError);
              throw updateError;
            }
          } else {
            // INSERT new account
            const { data: insertedData, error: insertError } = await supabase
              .from("contas_bancarias")
              .insert([accountData])
              .select('id')
              .single();
            
            if (insertError) {
              console.error("Error inserting bank account:", insertError);
              throw insertError;
            }
          }
        }
      }

      // Reload bank accounts with IDs
      const { data: savedAccounts } = await supabase
        .from("contas_bancarias")
        .select("*")
        .eq("parceiro_id", currentParceiroId);

      if (savedAccounts) {
        const formatCPFDisplay = (cpf: string) => {
          const clean = cpf.replace(/\D/g, "");
          return clean.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
        };
        const formatCNPJDisplay = (cnpj: string) => {
          const clean = cnpj.replace(/\D/g, "");
          return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
        };
        
        setBankAccounts(savedAccounts.map(acc => {
          // Parse pix_keys from JSONB
          let parsedPixKeys: Array<{ tipo: string; chave: string }> = [];
          if (acc.pix_keys && Array.isArray(acc.pix_keys)) {
            parsedPixKeys = (acc.pix_keys as Array<{ tipo: string; chave: string }>).map((pk) => ({
              tipo: pk.tipo || "",
              chave: pk.tipo === "cpf" ? formatCPFDisplay(pk.chave) 
                   : pk.tipo === "cnpj" ? formatCNPJDisplay(pk.chave)
                   : pk.chave || ""
            }));
          }
          if (parsedPixKeys.length === 0) {
            parsedPixKeys = [{ tipo: "", chave: "" }];
          }
          
          return {
            id: acc.id,
            banco_id: acc.banco_id || "",
            moeda: acc.moeda || "BRL",
            agencia: acc.agencia || "",
            conta: acc.conta || "",
            tipo_conta: acc.tipo_conta,
            titular: acc.titular,
            pix_keys: parsedPixKeys,
            observacoes: acc.observacoes || ""
          };
        }));
      }

      toast({
        title: "Contas bancárias salvas",
        description: "Agora você pode adicionar wallets crypto.",
      });

      setHasSavedDuringSession(true);
      // Switch to crypto tab
      setActiveTab("crypto");
    } catch (error: any) {
      let errorMessage = error.message;
      
      // Check for duplicate PIX key error
      if (error.message?.includes('Esta chave PIX já está cadastrada')) {
        errorMessage = "Esta chave PIX já está cadastrada em outra conta bancária.";
      }
      
      toast({
        title: "Erro ao salvar contas bancárias",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Se houve salvamento intermediário (Salvar e Continuar), notificar o pai
      onClose(hasSavedDuringSession ? { saved: true } : undefined);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto md:max-h-[90vh] max-md:fixed max-md:inset-0 max-md:max-w-none max-md:w-full max-md:h-full max-md:max-h-full max-md:rounded-none max-md:translate-x-0 max-md:translate-y-0 max-md:left-0 max-md:top-0 max-md:pb-24">
        <DialogHeader className="max-md:sticky max-md:top-0 max-md:z-10 max-md:bg-background max-md:pb-3 max-md:border-b max-md:border-border/50">
          <DialogTitle>
            {viewMode ? "Visualizar Parceiro" : parceiro ? "Editar Parceiro" : "Novo Parceiro"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} autoComplete="off" data-form-type="other" noValidate>
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "dados" | "bancos" | "crypto")} className="w-full">
            <TabsList className="w-full max-md:overflow-x-auto max-md:scrollbar-none max-md:justify-start max-md:gap-1">
              <TabsTrigger value="dados" className="max-md:min-w-fit max-md:px-3 max-md:text-xs">
                <User className="w-4 h-4" />
                Dados Pessoais
              </TabsTrigger>
              <TabsTrigger value="bancos" disabled={!parceiroId && !parceiro} className="max-md:min-w-fit max-md:px-3 max-md:text-xs">
                <Landmark className="w-4 h-4" />
                Bancário
              </TabsTrigger>
              <TabsTrigger value="crypto" disabled={!parceiroId && !parceiro} className="max-md:min-w-fit max-md:px-3 max-md:text-xs">
                <Wallet className="w-4 h-4" />
                Crypto
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dados" className="space-y-4">
              {viewMode ? (
                <ParceiroProfileView
                  nome={nome}
                  cpf={cpf}
                  email={email}
                  telefone={telefone}
                  dataNascimento={dataNascimento}
                  endereco={endereco}
                  cidade={cidade}
                  cep={cep}
                  status={status}
                  observacoes={observacoes}
                  qualidade={qualidade}
                />
              ) : (
                <PersonalDataTab
                  nome={nome}
                  setNome={setNome}
                  cpf={cpf}
                  setCpf={setCpf}
                  email={email}
                  setEmail={setEmail}
                  telefone={telefone}
                  setTelefone={setTelefone}
                  dataNascimento={dataNascimento}
                  setDataNascimento={setDataNascimento}
                  endereco={endereco}
                  setEndereco={setEndereco}
                  cidade={cidade}
                  setCidade={setCidade}
                  cep={cep}
                  setCep={setCep}
                  status={status}
                  setStatus={setStatus}
                  observacoes={observacoes}
                  setObservacoes={setObservacoes}
                  fornecedorOrigemId={fornecedorOrigemId}
                  setFornecedorOrigemId={setFornecedorOrigemId}
                  fornecedores={fornecedores}
                  qualidade={qualidade}
                  setQualidade={setQualidade}
                  loading={loading}
                  viewMode={viewMode}
                  cpfError={cpfError}
                  telefoneError={telefoneError}
                  checkingCpf={checkingCpf}
                  planLimitError={planLimitError}
                  copyToClipboard={copyToClipboard}
                  copiedField={copiedField}
                />
              )}

              {!viewMode && !parceiro && !parceiroId && (
                <div className="flex gap-3 mt-6 max-md:fixed max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:p-4 max-md:bg-background max-md:border-t max-md:border-border/50 max-md:z-10">
                  <Button
                    type="button"
                    onClick={savePersonalData}
                    disabled={loading || !nome || !cpf}
                    className="w-full max-md:h-12"
                  >
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Salvar e Continuar
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="bancos" className="space-y-4">
              <BankAccountsTab
                bankAccounts={bankAccounts}
                addBankAccount={addBankAccount}
                removeBankAccount={removeBankAccount}
                updateBankAccount={updateBankAccount}
                expandedBankIndex={expandedBankIndex}
                setExpandedBankIndex={setExpandedBankIndex}
                bancos={bancos}
                loading={loading}
                viewMode={viewMode}
                contaSaldos={contaSaldos}
                cpf={cpf}
              />

              {!viewMode && parceiroId && !parceiro && bankAccounts.length > 0 && (
                <div className="flex gap-3 mt-6">
                  <Button
                    type="button"
                    onClick={saveBankAccountsAndContinue}
                    disabled={loading || !bankAccounts.some(acc => acc.banco_id && acc.pix_keys.some(k => k.chave))}
                    className="w-full"
                  >
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Salvar e Continuar
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="crypto" className="space-y-4">
              <CryptoWalletsTab
                cryptoWallets={cryptoWallets}
                addCryptoWallet={addCryptoWallet}
                removeCryptoWallet={removeCryptoWallet}
                updateCryptoWallet={updateCryptoWallet}
                expandedWalletIndex={expandedWalletIndex}
                setExpandedWalletIndex={setExpandedWalletIndex}
                redes={redes}
                loading={loading}
                viewMode={viewMode}
                walletSaldos={walletSaldos}
                parceiroId={parceiroId || parceiro?.id}
                validateWalletEndereco={validateWalletEndereco}
                enderecoErrors={enderecoErrors}
                checkingEnderecos={checkingEnderecos}
              />
            </TabsContent>
          </Tabs>

          <div className="flex gap-3 mt-6 max-md:fixed max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:p-4 max-md:bg-background max-md:border-t max-md:border-border/50 max-md:z-10">
            <Button type="button" variant="outline" onClick={() => onClose()} className="flex-1 max-md:h-12">
              {viewMode ? "Fechar" : "Cancelar"}
            </Button>
            {!viewMode && (parceiro || parceiroId) && (
              <Button type="submit" disabled={loading || (!hasChanges && bankAccounts.length === 0 && cryptoWallets.length === 0)} className="flex-1 max-md:h-12">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Alterações
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
