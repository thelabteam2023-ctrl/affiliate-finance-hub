import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Wallet, ChevronUp, ChevronDown } from "lucide-react";
import { RedeSelect } from "../RedeSelect";
import { MoedaMultiSelect } from "../MoedaMultiSelect";
import { ExchangeSelect } from "../ExchangeSelect";
import { CryptoWalletCard } from "../CryptoWalletCard";

interface CryptoWalletsTabProps {
  cryptoWallets: any[];
  addCryptoWallet: () => void;
  removeCryptoWallet: (index: number) => void;
  updateCryptoWallet: (index: number, field: string, value: any) => void;
  expandedWalletIndex: number | null;
  setExpandedWalletIndex: (index: number | null) => void;
  redes: any[];
  loading: boolean;
  viewMode: boolean;
  walletSaldos: Record<string, { saldo: number; coin: string }>;
  parceiroId: string | null;
  validateWalletEndereco: (endereco: string, index: number, walletId?: string) => void;
  enderecoErrors: Record<number, string>;
  checkingEnderecos: Record<number, boolean>;
}

export function CryptoWalletsTab({
  cryptoWallets, addCryptoWallet, removeCryptoWallet, updateCryptoWallet,
  expandedWalletIndex, setExpandedWalletIndex, redes,
  loading, viewMode, walletSaldos, parceiroId,
  validateWalletEndereco, enderecoErrors, checkingEnderecos
}: CryptoWalletsTabProps) {
  return (
    <div className="space-y-4">
      {!viewMode && (
        <Button type="button" variant="outline" onClick={addCryptoWallet} className="w-full">
          <Plus className="mr-2 h-4 w-4" />
          Adicionar Wallet Crypto
        </Button>
      )}

      {viewMode ? (
        <div className="grid gap-4">
          {cryptoWallets.map((wallet, index) => {
            const rede = redes.find(r => r.id === wallet.rede_id);
            const saldoInfo = wallet.id ? walletSaldos[wallet.id] : undefined;
            return (
              <CryptoWalletCard
                key={index}
                wallet={{
                  ...wallet,
                  network: rede?.nome || "",
                  saldo: saldoInfo?.saldo,
                  saldoCoin: saldoInfo?.coin,
                }}
                parceiroId={parceiroId}
              />
            );
          })}
          {cryptoWallets.length === 0 && (
            <p className="text-center text-muted-foreground py-8">Nenhuma wallet crypto cadastrada</p>
          )}
        </div>
      ) : (
        cryptoWallets.map((wallet, index) => {
          const isExpanded = expandedWalletIndex === index;
          const rede = redes.find(r => r.id === wallet.rede_id);
          const redeNome = rede?.nome || "Rede não selecionada";
          const label = wallet.label || "";
          const exchangeNome = wallet.exchange || "";
          const moedaDisplay = wallet.moeda?.length > 0 ? wallet.moeda.join(", ") : "—";
          const truncAddr = wallet.endereco 
            ? `${wallet.endereco.slice(0, 6)}...${wallet.endereco.slice(-6)}`
            : "Sem endereço";

          return (
            <Card key={index} className="overflow-hidden">
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/30 transition-colors"
                onClick={() => setExpandedWalletIndex(isExpanded ? null : index)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Wallet className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {label || exchangeNome || redeNome}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {label && exchangeNome && `${exchangeNome} · `}{moedaDisplay} · {redeNome} · <span className="font-mono">{truncAddr}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); removeCryptoWallet(index); }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </div>

              {isExpanded && (
                <CardContent className="pt-2 pb-4 border-t border-border/50">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="md:col-span-2">
                      <Label className="text-center block">Apelido da Wallet</Label>
                      <Input
                        value={wallet.label}
                        onChange={(e) => updateCryptoWallet(index, "label", e.target.value)}
                        placeholder="Identificação da wallet"
                        className="text-center"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <MoedaMultiSelect
                        moedas={wallet.moeda}
                        onChange={(moedas) => updateCryptoWallet(index, "moeda", moedas)}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-center block">Exchange/Wallet</Label>
                      <ExchangeSelect
                        value={wallet.exchange}
                        onValueChange={(value) => updateCryptoWallet(index, "exchange", value)}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-center block">Network *</Label>
                      <RedeSelect
                        value={wallet.rede_id}
                        onValueChange={(value) => updateCryptoWallet(index, "rede_id", value)}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-center block">Endereço *</Label>
                      <Input
                        value={wallet.endereco}
                        onChange={(e) => updateCryptoWallet(index, "endereco", e.target.value)}
                        onBlur={() => validateWalletEndereco(wallet.endereco, index, wallet.id)}
                        placeholder="Endereço da wallet"
                        className={`text-center ${enderecoErrors[index] ? "border-destructive" : ""}`}
                      />
                      {checkingEnderecos[index] && (
                        <p className="text-xs text-muted-foreground mt-1 text-center">Verificando endereço...</p>
                      )}
                      {enderecoErrors[index] && (
                        <p className="text-xs text-destructive mt-1 text-center">{enderecoErrors[index]}</p>
                      )}
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-center block">Observações</Label>
                      <Textarea
                        value={wallet.observacoes}
                        onChange={(e) => updateCryptoWallet(index, "observacoes", e.target.value)}
                        placeholder="Informações adicionais sobre esta wallet"
                        rows={3}
                        className="text-center"
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