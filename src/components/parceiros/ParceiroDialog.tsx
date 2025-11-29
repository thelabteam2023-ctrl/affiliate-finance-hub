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
import { Loader2, Plus, Trash2, Eye, EyeOff } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

interface BankAccount {
  id?: string;
  banco_id: string;
  agencia: string;
  conta: string;
  tipo_conta: string;
  titular: string;
  pix_key: string;
  senha_acesso_encrypted: string;
  senha_transacao_encrypted: string;
  usar_senha_global: boolean;
}

interface CryptoWallet {
  id?: string;
  moeda: string;
  endereco: string;
  rede_id: string;
  label: string;
  senha_acesso_encrypted: string;
  usar_senha_global: boolean;
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
  onClose: () => void;
  parceiro: any | null;
}

export default function ParceiroDialog({ open, onClose, parceiro }: ParceiroDialogProps) {
  const [loading, setLoading] = useState(false);
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [endereco, setEndereco] = useState("");
  const [cidade, setCidade] = useState("");
  const [cep, setCep] = useState("");
  const [usuarioGlobal, setUsuarioGlobal] = useState("");
  const [senhaGlobal, setSenhaGlobal] = useState("");
  const [showSenhaGlobal, setShowSenhaGlobal] = useState(false);
  const [status, setStatus] = useState("ativo");
  const [observacoes, setObservacoes] = useState("");
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [cryptoWallets, setCryptoWallets] = useState<CryptoWallet[]>([]);
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [redes, setRedes] = useState<RedeCrypto[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    fetchBancos();
    fetchRedes();
  }, []);

  useEffect(() => {
    if (parceiro) {
      setNome(parceiro.nome || "");
      setCpf(parceiro.cpf || "");
      setEmail(parceiro.email || "");
      setTelefone(parceiro.telefone || "");
      setDataNascimento(parceiro.data_nascimento || "");
      setEndereco(parceiro.endereco || "");
      setCidade(parceiro.cidade || "");
      setCep(parceiro.cep || "");
      setUsuarioGlobal(parceiro.usuario_global || "");
      setSenhaGlobal(atob(parceiro.senha_global_encrypted || ""));
      setStatus(parceiro.status || "ativo");
      setObservacoes(parceiro.observacoes || "");
      setBankAccounts(parceiro.contas_bancarias || []);
      setCryptoWallets(parceiro.wallets_crypto || []);
    } else {
      resetForm();
    }
  }, [parceiro]);

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
    setUsuarioGlobal("");
    setSenhaGlobal("");
    setStatus("ativo");
    setObservacoes("");
    setBankAccounts([]);
    setCryptoWallets([]);
  };

  const formatCEP = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    return numbers.replace(/(\d{5})(\d{3})/, "$1-$2");
  };

  const formatCPF = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    return numbers.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  };

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    if (numbers.length <= 10) {
      return numbers.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
    }
    return numbers.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const parceiroData = {
        user_id: user.id,
        nome,
        cpf: cpf.replace(/\D/g, ""),
        email: email || null,
        telefone: telefone.replace(/\D/g, "") || null,
        data_nascimento: dataNascimento || null,
        endereco: endereco || null,
        cidade: cidade || null,
        cep: cep.replace(/\D/g, "") || null,
        usuario_global: usuarioGlobal || null,
        senha_global_encrypted: senhaGlobal ? btoa(senhaGlobal) : null,
        status,
        observacoes: observacoes || null,
      };

      let parceiroId = parceiro?.id;

      if (parceiro) {
        const { error } = await supabase
          .from("parceiros")
          .update(parceiroData)
          .eq("id", parceiro.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("parceiros")
          .insert(parceiroData)
          .select()
          .single();

        if (error) throw error;
        parceiroId = data.id;
      }

      // Save bank accounts
      if (parceiro) {
        await supabase
          .from("contas_bancarias")
          .delete()
          .eq("parceiro_id", parceiro.id);
      }

      for (const account of bankAccounts) {
        if (account.banco_id && account.conta) {
          await supabase.from("contas_bancarias").insert([{
            parceiro_id: parceiroId,
            banco_id: account.banco_id,
            banco: bancos.find(b => b.id === account.banco_id)?.nome || "",
            agencia: account.agencia,
            conta: account.conta,
            tipo_conta: account.tipo_conta,
            titular: account.titular,
            pix_key: account.pix_key || null,
            senha_acesso_encrypted: account.senha_acesso_encrypted ? btoa(account.senha_acesso_encrypted) : null,
            senha_transacao_encrypted: account.senha_transacao_encrypted ? btoa(account.senha_transacao_encrypted) : null,
            usar_senha_global: account.usar_senha_global,
          }]);
        }
      }

      // Save crypto wallets
      if (parceiro) {
        await supabase
          .from("wallets_crypto")
          .delete()
          .eq("parceiro_id", parceiro.id);
      }

      for (const wallet of cryptoWallets) {
        if (wallet.moeda && wallet.endereco) {
          await supabase.from("wallets_crypto").insert([{
            parceiro_id: parceiroId,
            moeda: wallet.moeda,
            endereco: wallet.endereco,
            network: redes.find(r => r.id === wallet.rede_id)?.nome || "",
            rede_id: wallet.rede_id,
            label: wallet.label || null,
            senha_acesso_encrypted: wallet.senha_acesso_encrypted ? btoa(wallet.senha_acesso_encrypted) : null,
            usar_senha_global: wallet.usar_senha_global,
          }]);
        }
      }

      toast({
        title: parceiro ? "Parceiro atualizado" : "Parceiro criado",
        description: "Os dados foram salvos com sucesso.",
      });

      onClose();
    } catch (error: any) {
      toast({
        title: "Erro ao salvar parceiro",
        description: error.message,
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
        agencia: "", 
        conta: "", 
        tipo_conta: "corrente", 
        titular: nome, 
        pix_key: "",
        senha_acesso_encrypted: "",
        senha_transacao_encrypted: "",
        usar_senha_global: false
      },
    ]);
  };

  const removeBankAccount = (index: number) => {
    setBankAccounts(bankAccounts.filter((_, i) => i !== index));
  };

  const updateBankAccount = (index: number, field: string, value: string) => {
    const updated = [...bankAccounts];
    updated[index] = { ...updated[index], [field]: value };
    setBankAccounts(updated);
  };

  const addCryptoWallet = () => {
    setCryptoWallets([
      ...cryptoWallets,
      { 
        moeda: "USDT", 
        endereco: "", 
        rede_id: "", 
        label: "",
        senha_acesso_encrypted: "",
        usar_senha_global: false
      },
    ]);
  };

  const removeCryptoWallet = (index: number) => {
    setCryptoWallets(cryptoWallets.filter((_, i) => i !== index));
  };

  const updateCryptoWallet = (index: number, field: string, value: string) => {
    const updated = [...cryptoWallets];
    updated[index] = { ...updated[index], [field]: value };
    setCryptoWallets(updated);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {parceiro ? "Editar Parceiro" : "Novo Parceiro"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <Tabs defaultValue="dados" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="dados">Dados Pessoais</TabsTrigger>
              <TabsTrigger value="bancos">Contas Bancárias</TabsTrigger>
              <TabsTrigger value="crypto">Wallets Crypto</TabsTrigger>
            </TabsList>

            <TabsContent value="dados" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="nome">Nome Completo *</Label>
                  <Input
                    id="nome"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                <div>
                  <Label htmlFor="cpf">CPF *</Label>
                  <Input
                    id="cpf"
                    value={cpf}
                    onChange={(e) => setCpf(formatCPF(e.target.value))}
                    placeholder="000.000.000-00"
                    maxLength={14}
                    required
                    disabled={loading}
                  />
                </div>
                <div>
                  <Label htmlFor="dataNascimento">Data de Nascimento</Label>
                  <Input
                    id="dataNascimento"
                    type="date"
                    value={dataNascimento}
                    onChange={(e) => setDataNascimento(e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div>
                  <Label htmlFor="telefone">Telefone</Label>
                  <Input
                    id="telefone"
                    value={telefone}
                    onChange={(e) => setTelefone(formatPhone(e.target.value))}
                    placeholder="(00) 00000-0000"
                    maxLength={15}
                    disabled={loading}
                  />
                </div>
                <div>
                  <Label htmlFor="endereco">Endereço</Label>
                  <Input
                    id="endereco"
                    value={endereco}
                    onChange={(e) => setEndereco(e.target.value)}
                    placeholder="Rua, número"
                    disabled={loading}
                  />
                </div>
                <div>
                  <Label htmlFor="cidade">Cidade</Label>
                  <Input
                    id="cidade"
                    value={cidade}
                    onChange={(e) => setCidade(e.target.value)}
                    placeholder="Cidade - UF"
                    disabled={loading}
                  />
                </div>
                <div>
                  <Label htmlFor="cep">CEP</Label>
                  <Input
                    id="cep"
                    value={cep}
                    onChange={(e) => setCep(formatCEP(e.target.value))}
                    placeholder="00000-000"
                    maxLength={9}
                    disabled={loading}
                  />
                </div>
                <div>
                  <Label htmlFor="usuarioGlobal">Usuário Global</Label>
                  <Input
                    id="usuarioGlobal"
                    value={usuarioGlobal}
                    onChange={(e) => setUsuarioGlobal(e.target.value)}
                    placeholder="Usuário padrão"
                    disabled={loading}
                  />
                </div>
                <div>
                  <Label htmlFor="senhaGlobal">Senha Global</Label>
                  <div className="relative">
                    <Input
                      id="senhaGlobal"
                      type={showSenhaGlobal ? "text" : "password"}
                      value={senhaGlobal}
                      onChange={(e) => setSenhaGlobal(e.target.value)}
                      placeholder="Senha padrão"
                      disabled={loading}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowSenhaGlobal(!showSenhaGlobal)}
                    >
                      {showSenhaGlobal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="col-span-2">
                  <Label htmlFor="status" className="text-center block">Status</Label>
                  <Select value={status} onValueChange={setStatus} disabled={loading}>
                    <SelectTrigger className="w-full text-center">
                      <SelectValue placeholder="Selecione o status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="inativo">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label htmlFor="observacoes">Observações</Label>
                  <Textarea
                    id="observacoes"
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    rows={3}
                    disabled={loading}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="bancos" className="space-y-4">
              <Button
                type="button"
                variant="outline"
                onClick={addBankAccount}
                className="w-full"
              >
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Conta Bancária
              </Button>

              {bankAccounts.map((account, index) => (
                <Card key={index}>
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2 flex justify-between items-center mb-2">
                        <h4 className="font-medium">Conta {index + 1}</h4>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeBankAccount(index)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                      <div className="col-span-2">
                        <Label>Banco</Label>
                        <Select 
                          value={account.banco_id} 
                          onValueChange={(value) => updateBankAccount(index, "banco_id", value)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Selecione um banco" />
                          </SelectTrigger>
                          <SelectContent>
                            {bancos.map((banco) => (
                              <SelectItem key={banco.id} value={banco.id}>
                                {banco.codigo} - {banco.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Agência</Label>
                        <Input
                          value={account.agencia}
                          onChange={(e) => updateBankAccount(index, "agencia", e.target.value)}
                          placeholder="0000"
                        />
                      </div>
                      <div>
                        <Label>Conta</Label>
                        <Input
                          value={account.conta}
                          onChange={(e) => updateBankAccount(index, "conta", e.target.value)}
                          placeholder="00000-0"
                        />
                      </div>
                      <div>
                        <Label>Tipo</Label>
                        <Select 
                          value={account.tipo_conta} 
                          onValueChange={(value) => updateBankAccount(index, "tipo_conta", value)}
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
                        <Label>Titular</Label>
                        <Input
                          value={account.titular}
                          onChange={(e) => updateBankAccount(index, "titular", e.target.value)}
                          placeholder="Nome do titular"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label>Chave PIX</Label>
                        <Input
                          value={account.pix_key}
                          onChange={(e) => updateBankAccount(index, "pix_key", e.target.value)}
                          placeholder="CPF, email, telefone ou chave aleatória"
                        />
                      </div>
                      <div>
                        <Label>Senha de Acesso</Label>
                        <Input
                          type="password"
                          value={account.usar_senha_global ? "••••••••" : account.senha_acesso_encrypted}
                          onChange={(e) => updateBankAccount(index, "senha_acesso_encrypted", e.target.value)}
                          placeholder="Senha do banco"
                          disabled={account.usar_senha_global}
                        />
                      </div>
                      <div>
                        <Label>Senha de Transação</Label>
                        <Input
                          type="password"
                          value={account.usar_senha_global ? "••••••••" : account.senha_transacao_encrypted}
                          onChange={(e) => updateBankAccount(index, "senha_transacao_encrypted", e.target.value)}
                          placeholder="Senha para transferências"
                          disabled={account.usar_senha_global}
                        />
                      </div>
                      <div className="col-span-2 flex items-center gap-2">
                        <Checkbox
                          id={`usar-senha-global-${index}`}
                          checked={account.usar_senha_global}
                          onCheckedChange={(checked) => updateBankAccount(index, "usar_senha_global", String(checked))}
                        />
                        <Label htmlFor={`usar-senha-global-${index}`} className="cursor-pointer">
                          Usar senha padrão do parceiro
                        </Label>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="crypto" className="space-y-4">
              <Button
                type="button"
                variant="outline"
                onClick={addCryptoWallet}
                className="w-full"
              >
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Wallet Crypto
              </Button>

              {cryptoWallets.map((wallet, index) => (
                <Card key={index}>
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2 flex justify-between items-center mb-2">
                        <h4 className="font-medium">Wallet {index + 1}</h4>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeCryptoWallet(index)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                      <div>
                        <Label>Moeda</Label>
                        <Select 
                          value={wallet.moeda} 
                          onValueChange={(value) => updateCryptoWallet(index, "moeda", value)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Selecione a moeda" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="BTC">Bitcoin (BTC)</SelectItem>
                            <SelectItem value="ETH">Ethereum (ETH)</SelectItem>
                            <SelectItem value="USDT">Tether (USDT)</SelectItem>
                            <SelectItem value="USDC">USD Coin (USDC)</SelectItem>
                            <SelectItem value="BNB">Binance Coin (BNB)</SelectItem>
                            <SelectItem value="SOL">Solana (SOL)</SelectItem>
                            <SelectItem value="ADA">Cardano (ADA)</SelectItem>
                            <SelectItem value="DOT">Polkadot (DOT)</SelectItem>
                            <SelectItem value="MATIC">Polygon (MATIC)</SelectItem>
                            <SelectItem value="TRX">Tron (TRX)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Network</Label>
                        <Select 
                          value={wallet.rede_id} 
                          onValueChange={(value) => updateCryptoWallet(index, "rede_id", value)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Selecione uma rede" />
                          </SelectTrigger>
                          <SelectContent>
                            {redes.map((rede) => (
                              <SelectItem key={rede.id} value={rede.id}>
                                {rede.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2">
                        <Label>Endereço</Label>
                        <Input
                          value={wallet.endereco}
                          onChange={(e) => updateCryptoWallet(index, "endereco", e.target.value)}
                          placeholder="Endereço da wallet"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label>Label (Opcional)</Label>
                        <Input
                          value={wallet.label}
                          onChange={(e) => updateCryptoWallet(index, "label", e.target.value)}
                          placeholder="Ex: Wallet principal, Wallet apostas"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label>Senha de Acesso</Label>
                        <Input
                          type="password"
                          value={wallet.usar_senha_global ? "••••••••" : wallet.senha_acesso_encrypted}
                          onChange={(e) => updateCryptoWallet(index, "senha_acesso_encrypted", e.target.value)}
                          placeholder="Senha da wallet"
                          disabled={wallet.usar_senha_global}
                        />
                      </div>
                      <div className="col-span-2 flex items-center gap-2">
                        <Checkbox
                          id={`usar-senha-global-wallet-${index}`}
                          checked={wallet.usar_senha_global}
                          onCheckedChange={(checked) => updateCryptoWallet(index, "usar_senha_global", String(checked))}
                        />
                        <Label htmlFor={`usar-senha-global-wallet-${index}`} className="cursor-pointer">
                          Usar senha padrão do parceiro
                        </Label>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          </Tabs>

          <div className="flex gap-3 mt-6">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {parceiro ? "Atualizar" : "Criar"} Parceiro
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
