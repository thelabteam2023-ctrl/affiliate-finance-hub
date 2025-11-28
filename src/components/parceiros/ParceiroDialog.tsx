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
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";

interface BankAccount {
  id?: string;
  banco: string;
  agencia: string;
  conta: string;
  tipo_conta: string;
  titular: string;
  pix_key: string;
}

interface CryptoWallet {
  id?: string;
  moeda: string;
  endereco: string;
  network: string;
  label: string;
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
  const [status, setStatus] = useState("ativo");
  const [observacoes, setObservacoes] = useState("");
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [cryptoWallets, setCryptoWallets] = useState<CryptoWallet[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    if (parceiro) {
      setNome(parceiro.nome || "");
      setCpf(parceiro.cpf || "");
      setEmail(parceiro.email || "");
      setTelefone(parceiro.telefone || "");
      setDataNascimento(parceiro.data_nascimento || "");
      setStatus(parceiro.status || "ativo");
      setObservacoes(parceiro.observacoes || "");
      setBankAccounts(parceiro.contas_bancarias || []);
      setCryptoWallets(parceiro.wallets_crypto || []);
    } else {
      resetForm();
    }
  }, [parceiro]);

  const resetForm = () => {
    setNome("");
    setCpf("");
    setEmail("");
    setTelefone("");
    setDataNascimento("");
    setStatus("ativo");
    setObservacoes("");
    setBankAccounts([]);
    setCryptoWallets([]);
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
        if (account.banco && account.conta) {
          await supabase.from("contas_bancarias").insert({
            parceiro_id: parceiroId,
            banco: account.banco,
            agencia: account.agencia,
            conta: account.conta,
            tipo_conta: account.tipo_conta,
            titular: account.titular,
            pix_key: account.pix_key || null,
          });
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
          await supabase.from("wallets_crypto").insert({
            parceiro_id: parceiroId,
            moeda: wallet.moeda,
            endereco: wallet.endereco,
            network: wallet.network,
            label: wallet.label || null,
          });
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
      { banco: "", agencia: "", conta: "", tipo_conta: "corrente", titular: nome, pix_key: "" },
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
      { moeda: "USDT", endereco: "", network: "", label: "" },
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
                <div className="col-span-2">
                  <Label htmlFor="status">Status</Label>
                  <select
                    id="status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md bg-background"
                    disabled={loading}
                  >
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                    <option value="suspenso">Suspenso</option>
                  </select>
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
                        <Input
                          value={account.banco}
                          onChange={(e) => updateBankAccount(index, "banco", e.target.value)}
                          placeholder="Nome do banco"
                        />
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
                        <select
                          value={account.tipo_conta}
                          onChange={(e) => updateBankAccount(index, "tipo_conta", e.target.value)}
                          className="w-full px-3 py-2 border rounded-md bg-background"
                        >
                          <option value="corrente">Corrente</option>
                          <option value="poupanca">Poupança</option>
                          <option value="pagamento">Pagamento</option>
                        </select>
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
                        <select
                          value={wallet.moeda}
                          onChange={(e) => updateCryptoWallet(index, "moeda", e.target.value)}
                          className="w-full px-3 py-2 border rounded-md bg-background"
                        >
                          <option value="BTC">Bitcoin (BTC)</option>
                          <option value="ETH">Ethereum (ETH)</option>
                          <option value="USDT">Tether (USDT)</option>
                          <option value="USDC">USD Coin (USDC)</option>
                          <option value="BNB">Binance Coin (BNB)</option>
                          <option value="SOL">Solana (SOL)</option>
                          <option value="ADA">Cardano (ADA)</option>
                          <option value="DOT">Polkadot (DOT)</option>
                          <option value="MATIC">Polygon (MATIC)</option>
                          <option value="TRX">Tron (TRX)</option>
                        </select>
                      </div>
                      <div>
                        <Label>Network</Label>
                        <Input
                          value={wallet.network}
                          onChange={(e) => updateCryptoWallet(index, "network", e.target.value)}
                          placeholder="Ex: ERC20, TRC20, BEP20"
                        />
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
