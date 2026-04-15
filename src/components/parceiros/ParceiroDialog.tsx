import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Loader2, Plus, Trash2, User, Landmark, Wallet, Copy, Check, AlertTriangle, Zap, ChevronDown, ChevronUp, Building2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BancoSelect } from "./BancoSelect";
import { RedeSelect } from "./RedeSelect";
import { PixKeyInput } from "./PixKeyInput";
import { PhoneInput } from "./PhoneInput";
import { MoedaMultiSelect } from "./MoedaMultiSelect";
import { ExchangeSelect } from "./ExchangeSelect";
import { BankAccountCard } from "./BankAccountCard";
import { CryptoWalletCard } from "./CryptoWalletCard";
import { validateCPF, formatCPF, formatCEP, formatAgencia, formatConta } from "@/lib/validators";
import { DatePickerInput } from "@/components/ui/date-picker-input";

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
  const { toast } = useToast();

  // DEBUG logs removidos — causavam re-render tracking desnecessário

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
      bankAccounts: JSON.stringify(bankAccounts),
      cryptoWallets: JSON.stringify(cryptoWallets)
    };

    const changed = JSON.stringify(currentState) !== JSON.stringify(initialState);
    setHasChanges(changed);
  }, [nome, cpf, email, telefone, dataNascimento, endereco, cidade, cep, status, observacoes, bankAccounts, cryptoWallets, initialState, parceiro, parceiroId]);

  useEffect(() => {
    fetchBancos();
    fetchRedes();
  }, []);

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
    setBankAccounts([]);
    setCryptoWallets([]);
    setActiveTab("dados");
    setParceiroId(null);
    setCpfError("");
    setTelefoneError("");
    setCheckingCpf(false);
    setCheckingTelefone(false);
    setHasSavedDuringSession(false);
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
    
    // Check bank accounts validation - RN101
    for (const account of bankAccounts) {
      if (!account.banco_id) {
        toast({
          title: "Campo obrigatório",
          description: "Selecione o banco.",
          variant: "destructive",
        });
        return;
      }
      if (!account.pix_keys.some(k => k.chave)) {
        toast({
          title: "Campo obrigatório",
          description: "Adicione pelo menos uma chave PIX.",
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
    
    // Validate wallet data - exchange is mandatory
    for (const wallet of cryptoWallets) {
      if (!wallet.exchange || !wallet.rede_id || !wallet.endereco || !wallet.moeda || wallet.moeda.length === 0) {
        toast({
          title: "Campos obrigatórios faltando",
          description: "Preencha: Exchange/Wallet, Rede, Moedas e Endereço em todas as wallets.",
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

    try {
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

      const parceiroData = {
        user_id: user.id,
        workspace_id: workspaceId,
        nome,
        cpf: cpf.replace(/\D/g, ""),
        email,
        telefone: telefone.replace(/[^\d+]/g, ""),
        data_nascimento: dataNascimento || null,
        endereco: endereco || null,
        cidade: cidade || null,
        cep: cep.replace(/\D/g, "") || null,
        status,
        observacoes: observacoes || null,
      };

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
        for (let i = 0; i < bankAccounts.length; i++) {
          const account = bankAccounts[i];
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
              moeda: account.moeda || "BRL", // CRÍTICO: Incluir moeda selecionada pelo usuário
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
              
              // Update the account in state with the new ID to prevent re-insertion
              if (insertedData?.id) {
                const updatedAccounts = [...bankAccounts];
                updatedAccounts[i] = { ...updatedAccounts[i], id: insertedData.id };
                setBankAccounts(updatedAccounts);
              }
            }
          }
        }
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
        for (let i = 0; i < cryptoWallets.length; i++) {
          const wallet = cryptoWallets[i];
          if (wallet.moeda && wallet.moeda.length > 0 && wallet.endereco && wallet.exchange) {
            // Encrypt observacoes if present
            const observacoesEncrypted = wallet.observacoes 
              ? btoa(unescape(encodeURIComponent(wallet.observacoes)))
              : null;

            const walletData = {
              parceiro_id: currentParceiroId,
              moeda: wallet.moeda,
              endereco: wallet.endereco,
              network: redes.find(r => r.id === wallet.rede_id)?.nome || "",
              rede_id: wallet.rede_id,
              exchange: wallet.exchange,
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
              
              // Update the wallet in state with the new ID to prevent re-insertion
              if (insertedData?.id) {
                const updatedWallets = [...cryptoWallets];
                updatedWallets[i] = { ...updatedWallets[i], id: insertedData.id };
                setCryptoWallets(updatedWallets);
              }
            }
          }
        }
      }

      toast({
        title: parceiro ? "Parceiro atualizado" : "Parceiro criado",
        description: "Os dados foram salvos com sucesso.",
      });

      onClose({ saved: true });
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
  };

  const removeBankAccount = (index: number) => {
    setBankAccounts(bankAccounts.filter((_, i) => i !== index));
  };

  const updateBankAccount = (index: number, field: string, value: any) => {
    const updated = [...bankAccounts];
    updated[index] = { ...updated[index], [field]: value };
    setBankAccounts(updated);
  };

  const addCryptoWallet = () => {
    setCryptoWallets([
      ...cryptoWallets,
      { 
        moeda: [], 
        endereco: "", 
        rede_id: "", 
        exchange: "",
        observacoes: ""
      },
    ]);
  };

  const removeCryptoWallet = (index: number) => {
    setCryptoWallets(cryptoWallets.filter((_, i) => i !== index));
    
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label htmlFor="nome">Nome Completo *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="parceiro-nome-field"
                      name="parceiro-nome-field"
                      value={nome}
                      onChange={(e) => setNome(e.target.value.toUpperCase())}
                      required
                      disabled={loading || viewMode}
                      className="uppercase"
                    />
                    {viewMode && nome && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => copyToClipboard(nome, "Nome")}
                        className="shrink-0"
                      >
                        {copiedField === "Nome" ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
                <div>
                  <Label htmlFor="cpf">CPF *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="parceiro-cpf-field"
                      name="parceiro-cpf-field"
                      autoComplete="off"
                      value={cpf}
                      onChange={(e) => {
                        setCpf(formatCPF(e.target.value));
                        setCpfError(""); // Clear error on change
                      }}
                      placeholder="000.000.000-00"
                      maxLength={14}
                      required
                      disabled={loading || viewMode}
                      className={cpfError ? "border-red-500" : ""}
                    />
                    {viewMode && cpf && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => copyToClipboard(cpf.replace(/\D/g, ""), "CPF")}
                        className="shrink-0"
                      >
                        {copiedField === "CPF" ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    )}
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
                  <div className="flex gap-2">
                    <Input
                      id="parceiro-email-field"
                      name="parceiro-email-field"
                      type="text"
                      inputMode="email"
                      autoComplete="off"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={loading || viewMode}
                    />
                    {viewMode && email && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => copyToClipboard(email, "Email")}
                        className="shrink-0"
                      >
                        {copiedField === "Email" ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
                <div>
                  <Label htmlFor="telefone">Telefone <span className="text-xs text-muted-foreground font-normal">(opcional)</span></Label>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <PhoneInput
                        value={telefone}
                        onChange={(value) => {
                          setTelefone(value);
                          setTelefoneError(""); // Clear error on change
                        }}
                        disabled={loading || viewMode}
                      />
                    </div>
                    {viewMode && telefone && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          const digits = telefone.replace(/\D/g, "");
                          const cleaned = digits.startsWith("55") ? digits.slice(2) : digits;
                          copyToClipboard(cleaned, "Telefone");
                        }}
                        className="shrink-0"
                      >
                        {copiedField === "Telefone" ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                  {checkingTelefone && (
                    <p className="text-xs text-muted-foreground mt-1">Verificando telefone...</p>
                  )}
                  {telefoneError && (
                    <p className="text-xs text-red-500 mt-1">{telefoneError}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="endereco">
                    Endereço
                    <span className="text-xs text-muted-foreground/60 ml-1">(opcional)</span>
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="parceiro-endereco-field"
                      name="parceiro-endereco-field"
                      value={endereco}
                      onChange={(e) => setEndereco(e.target.value.toUpperCase())}
                      className="uppercase"
                      placeholder="Rua, número"
                      disabled={loading || viewMode}
                    />
                    {viewMode && endereco && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => copyToClipboard(endereco, "Endereço")}
                        className="shrink-0"
                      >
                        {copiedField === "Endereço" ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
                <div>
                  <Label htmlFor="cidade">
                    Cidade - UF
                    <span className="text-xs text-muted-foreground/60 ml-1">(opcional)</span>
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="parceiro-cidade-field"
                      name="parceiro-cidade-field"
                      value={cidade}
                      onChange={(e) => setCidade(e.target.value.toUpperCase())}
                      className="uppercase"
                      placeholder="SÃO PAULO - SP"
                      disabled={loading || viewMode}
                    />
                    {viewMode && cidade && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => copyToClipboard(cidade, "Cidade")}
                        className="shrink-0"
                      >
                        {copiedField === "Cidade" ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
                <div>
                  <Label htmlFor="cep">
                    CEP
                    <span className="text-xs text-muted-foreground/60 ml-1">(opcional)</span>
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="parceiro-cep-field"
                      name="parceiro-cep-field"
                      value={cep}
                      onChange={(e) => setCep(formatCEP(e.target.value))}
                      placeholder="00000-000"
                      maxLength={9}
                      disabled={loading || viewMode}
                    />
                    {viewMode && cep && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => copyToClipboard(cep.replace(/\D/g, ""), "CEP")}
                        className="shrink-0"
                      >
                        {copiedField === "CEP" ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
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
                <div className="md:col-span-2">
                  <Label htmlFor="observacoes">
                    Observações
                    <span className="text-xs text-muted-foreground/60 ml-1">(opcional)</span>
                  </Label>
                  <Textarea
                    id="observacoes"
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    rows={3}
                    disabled={loading || viewMode}
                  />
                </div>
              </div>

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
              
              {!viewMode && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={addBankAccount}
                  className="w-full"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar Conta Bancária
                </Button>
              )}

              {viewMode ? (
                <div className="grid gap-4">
                  {bankAccounts.map((account, index) => {
                    const banco = bancos.find(b => b.id === account.banco_id);
                    return (
                      <BankAccountCard 
                        key={index} 
                        account={{
                          ...account,
                          banco: banco?.nome || ""
                        }} 
                      />
                    );
                  })}
                  {bankAccounts.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">
                      Nenhuma conta bancária cadastrada
                    </p>
                  )}
                </div>
              ) : (
                bankAccounts.map((account, index) => (
                <Card key={index}>
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {!viewMode && (
                         <div className="md:col-span-2 flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeBankAccount(index)}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      )}
                      <div>
                        <Label>Banco *</Label>
                        <BancoSelect
                          value={account.banco_id}
                          onValueChange={(value) => updateBankAccount(index, "banco_id", value)}
                          disabled={viewMode}
                        />
                      </div>
                      <div>
                        <Label>Moeda *</Label>
                        <Select 
                          value={account.moeda || "BRL"} 
                          onValueChange={(value) => updateBankAccount(index, "moeda", value)}
                          disabled={viewMode}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Selecione a moeda" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="BRL">BRL - Real Brasileiro</SelectItem>
                            <SelectItem value="USD">USD - Dólar Americano</SelectItem>
                            <SelectItem value="EUR">EUR - Euro</SelectItem>
                            <SelectItem value="GBP">GBP - Libra Esterlina</SelectItem>
                            <SelectItem value="MXN">MXN - Peso Mexicano</SelectItem>
                            <SelectItem value="MYR">MYR - Ringgit Malaio</SelectItem>
                            <SelectItem value="ARS">ARS - Peso Argentino</SelectItem>
                            <SelectItem value="COP">COP - Peso Colombiano</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>
                          Agência
                          <span className="text-xs text-muted-foreground/60 ml-1">(opcional)</span>
                        </Label>
                        <Input
                          value={formatAgencia(account.agencia)}
                          onChange={(e) => updateBankAccount(index, "agencia", e.target.value)}
                          placeholder="0000-0"
                          disabled={viewMode}
                        />
                      </div>
                      <div>
                        <Label>
                          Conta
                          <span className="text-xs text-muted-foreground/60 ml-1">(opcional)</span>
                        </Label>
                        <Input
                          value={formatConta(account.conta)}
                          onChange={(e) => updateBankAccount(index, "conta", e.target.value)}
                          placeholder="00000-0"
                          disabled={viewMode}
                        />
                      </div>
                      <div>
                       <Label>Tipo *</Label>
                        <Select 
                          value={account.tipo_conta} 
                          onValueChange={(value) => updateBankAccount(index, "tipo_conta", value)}
                          disabled={viewMode}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Tipo de conta" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="corrente">Corrente</SelectItem>
                            <SelectItem value="poupanca">Poupança</SelectItem>
                            <SelectItem value="pagamento">Pagamento</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Titular *</Label>
                        <Input
                          value={account.titular}
                          onChange={(e) => updateBankAccount(index, "titular", e.target.value.toUpperCase())}
                          placeholder="Nome do titular"
                          className="uppercase"
                          disabled={viewMode}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <PixKeyInput
                          keys={account.pix_keys}
                          onChange={(keys) => updateBankAccount(index, "pix_keys", keys)}
                          cpf={cpf}
                          disabled={viewMode}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label>
                          Observações
                          <span className="text-xs text-muted-foreground/60 ml-1">(opcional)</span>
                        </Label>
                        <Textarea
                          value={account.observacoes}
                          onChange={(e) => updateBankAccount(index, "observacoes", e.target.value)}
                          rows={3}
                          placeholder="Informações adicionais sobre esta conta"
                          disabled={viewMode}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )))}

              {/* Salvar e Continuar button for new partners */}
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
              
              {!viewMode && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={addCryptoWallet}
                  className="w-full"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar Wallet Crypto
                </Button>
              )}

              {viewMode ? (
                <div className="grid gap-4">
                  {cryptoWallets.map((wallet, index) => {
                    const rede = redes.find(r => r.id === wallet.rede_id);
                    return (
                      <CryptoWalletCard 
                        key={index} 
                        wallet={{
                          ...wallet,
                          network: rede?.nome || ""
                        }}
                        parceiroId={parceiroId || parceiro?.id}
                      />
                    );
                  })}
                  {cryptoWallets.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">
                      Nenhuma wallet crypto cadastrada
                    </p>
                  )}
                </div>
              ) : (
                cryptoWallets.map((wallet, index) => (
                <Card key={index}>
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {!viewMode && (
                        <div className="md:col-span-2 flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeCryptoWallet(index)}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      )}
                      <div className="md:col-span-2">
                        <MoedaMultiSelect
                          moedas={wallet.moeda}
                          onChange={(moedas) => updateCryptoWallet(index, "moeda", moedas)}
                          disabled={viewMode}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label className="text-center block">
                          Exchange/Wallet
                          <span className="text-xs text-muted-foreground/60 ml-1">(opcional)</span>
                        </Label>
                        <ExchangeSelect
                          value={wallet.exchange}
                          onValueChange={(value) => updateCryptoWallet(index, "exchange", value)}
                          disabled={viewMode}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label className="text-center block">Network *</Label>
                        <RedeSelect
                          value={wallet.rede_id}
                          onValueChange={(value) => updateCryptoWallet(index, "rede_id", value)}
                          disabled={viewMode}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label className="text-center block">Endereço *</Label>
                        <Input
                          value={wallet.endereco}
                          onChange={(e) => {
                            updateCryptoWallet(index, "endereco", e.target.value);
                          }}
                          onBlur={() => validateWalletEndereco(wallet.endereco, index, wallet.id)}
                          placeholder="Endereço da wallet"
                          disabled={viewMode}
                          className={`text-center ${enderecoErrors[index] ? "border-red-500" : ""}`}
                        />
                        {checkingEnderecos[index] && (
                          <p className="text-xs text-muted-foreground mt-1 text-center">Verificando endereço...</p>
                        )}
                        {enderecoErrors[index] && (
                          <p className="text-xs text-red-500 mt-1 text-center">{enderecoErrors[index]}</p>
                        )}
                      </div>
                      <div className="md:col-span-2">
                        <Label className="text-center block">
                          Observações
                          <span className="text-xs text-muted-foreground/60 ml-1">(opcional)</span>
                        </Label>
                        <Textarea
                          value={wallet.observacoes}
                          onChange={(e) => updateCryptoWallet(index, "observacoes", e.target.value)}
                          placeholder="Informações adicionais sobre esta wallet"
                          disabled={viewMode}
                          rows={3}
                          className="text-center"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )))}
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
