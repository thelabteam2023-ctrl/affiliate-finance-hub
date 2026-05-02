import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Building2, ChevronUp, ChevronDown } from "lucide-react";
import { BancoSelect } from "../BancoSelect";
import { PixKeyInput } from "../PixKeyInput";
import { BankAccountCard } from "../BankAccountCard";
import { formatAgencia, formatConta } from "@/lib/validators";

interface BankAccountsTabProps {
  bankAccounts: any[];
  addBankAccount: () => void;
  removeBankAccount: (index: number) => void;
  updateBankAccount: (index: number, field: string, value: any) => void;
  expandedBankIndex: number | null;
  setExpandedBankIndex: (index: number | null) => void;
  bancos: any[];
  loading: boolean;
  viewMode: boolean;
  contaSaldos: Record<string, number>;
  cpf: string;
}

export function BankAccountsTab({
  bankAccounts, addBankAccount, removeBankAccount, updateBankAccount,
  expandedBankIndex, setExpandedBankIndex, bancos,
  loading, viewMode, contaSaldos, cpf
}: BankAccountsTabProps) {
  return (
    <div className="space-y-4">
      {!viewMode && (
        <Button type="button" variant="outline" onClick={addBankAccount} className="w-full">
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
                  banco: banco?.nome || "",
                  saldo: account.id ? contaSaldos[account.id] ?? 0 : undefined,
                }}
              />
            );
          })}
          {bankAccounts.length === 0 && (
            <p className="text-center text-muted-foreground py-8">Nenhuma conta bancária cadastrada</p>
          )}
        </div>
      ) : (
        bankAccounts.map((account, index) => {
          const isExpanded = expandedBankIndex === index;
          const banco = bancos.find(b => b.id === account.banco_id);
          const bancoNome = banco?.nome || "Banco não selecionado";
          const tipoLabel = account.tipo_conta === "corrente" ? "Corrente" : account.tipo_conta === "poupanca" ? "Poupança" : account.tipo_conta === "pagamento" ? "Pagamento" : account.tipo_conta;
          const pixCount = account.pix_keys?.filter((k: any) => k.chave).length || 0;

          return (
            <Card key={index} className="overflow-hidden">
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/30 transition-colors"
                onClick={() => setExpandedBankIndex(isExpanded ? null : index)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{bancoNome}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {tipoLabel} · {account.moeda || "BRL"}
                      {account.titular && ` · ${account.titular}`}
                      {pixCount > 0 && ` · ${pixCount} PIX`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); removeBankAccount(index); }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </div>

              {isExpanded && (
                <CardContent className="pt-2 pb-4 border-t border-border/50">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                      <Select value={account.moeda || "BRL"} onValueChange={(value) => updateBankAccount(index, "moeda", value)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecione a moeda" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="BRL">BRL - Real Brasileiro</SelectItem>
                          <SelectItem value="USD">USD - Dólar Americano</SelectItem>
                          <SelectItem value="EUR">EUR - Euro</SelectItem>
                          <SelectItem value="GBP">GBP - Libra Esterlina</SelectItem>
                          <SelectItem value="MXN">MXN - Peso Mexicano</SelectItem>
                          <SelectItem value="ARS">ARS - Peso Argentino</SelectItem>
                          <SelectItem value="COP">COP - Peso Colombiano</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Agência <span className="text-xs text-muted-foreground/60 ml-1">(opcional)</span></Label>
                      <Input
                        value={formatAgencia(account.agencia)}
                        onChange={(e) => updateBankAccount(index, "agencia", e.target.value)}
                        placeholder="0000-0"
                      />
                    </div>
                    <div>
                      <Label>Conta <span className="text-xs text-muted-foreground/60 ml-1">(opcional)</span></Label>
                      <Input
                        value={formatConta(account.conta)}
                        onChange={(e) => updateBankAccount(index, "conta", e.target.value)}
                        placeholder="00000-0"
                      />
                    </div>
                    <div>
                      <Label>Tipo *</Label>
                      <Select value={account.tipo_conta} onValueChange={(value) => updateBankAccount(index, "tipo_conta", value)}>
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
                        className="uppercase"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <PixKeyInput
                        keys={account.pix_keys}
                        onChange={(keys) => updateBankAccount(index, "pix_keys", keys)}
                        cpf={cpf}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Observações <span className="text-xs text-muted-foreground/60 ml-1">(opcional)</span></Label>
                      <Textarea
                        value={account.observacoes}
                        onChange={(e) => updateBankAccount(index, "observacoes", e.target.value)}
                        rows={3}
                      />
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}