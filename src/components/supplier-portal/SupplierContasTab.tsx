import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, ArrowUpRight, ArrowDownRight, Building2, Pencil } from "lucide-react";
import { SupplierNovaContaDialog } from "./SupplierNovaContaDialog";
import { SupplierEditContaDialog } from "./SupplierEditContaDialog";

interface Props {
  supplierWorkspaceId: string;
  accounts: any[];
  saldoDisponivel: number;
  onRefresh: () => void;
  onDepositar: () => void;
  onSacar: () => void;
}

function formatCurrency(val: number, moeda = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: moeda,
    minimumFractionDigits: 2,
  }).format(val);
}

export function SupplierContasTab({
  supplierWorkspaceId,
  accounts,
  saldoDisponivel,
  onRefresh,
  onDepositar,
  onSacar,
}: Props) {
  const [novaContaOpen, setNovaContaOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<any | null>(null);

  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" onClick={onDepositar} className="gap-1.5">
          <ArrowUpRight className="h-3.5 w-3.5" /> Depositar
        </Button>
        <Button size="sm" variant="outline" onClick={onSacar} className="gap-1.5">
          <ArrowDownRight className="h-3.5 w-3.5" /> Sacar
        </Button>
        <Button size="sm" variant="outline" onClick={() => setNovaContaOpen(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Nova Conta
        </Button>
      </div>

      {/* Accounts list */}
      {accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma conta cadastrada</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => setNovaContaOpen(true)}
            >
              Criar primeira conta
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {accounts.map((account) => (
            <Card
              key={account.id}
              className="hover:border-primary/30 transition-colors cursor-pointer group"
              onClick={() => setEditAccount(account)}
            >
              <CardContent className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {account.bookmakers_catalogo?.logo_url ? (
                    <img
                      src={account.bookmakers_catalogo.logo_url}
                      alt=""
                      className="w-8 h-8 rounded-md object-contain bg-muted p-0.5"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {account.bookmakers_catalogo?.nome || "Casa"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {account.login_username}
                      {account.supplier_titulares?.nome && (
                        <span> · {account.supplier_titulares.nome}</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">
                      {formatCurrency(Number(account.saldo_atual), account.moeda)}
                    </p>
                    <Badge variant="outline" className="text-[10px]">
                      {account.moeda}
                    </Badge>
                  </div>
                  <Pencil className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <SupplierNovaContaDialog
        open={novaContaOpen}
        onOpenChange={setNovaContaOpen}
        supplierWorkspaceId={supplierWorkspaceId}
        onSuccess={onRefresh}
      />

      {editAccount && (
        <SupplierEditContaDialog
          open={!!editAccount}
          onOpenChange={(open) => { if (!open) setEditAccount(null); }}
          account={editAccount}
          onSuccess={onRefresh}
        />
      )}
    </div>
  );
}
