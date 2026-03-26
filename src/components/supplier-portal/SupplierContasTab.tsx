import { useState, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Plus, ArrowUpRight, ArrowDownRight, Building2, Pencil,
  ChevronDown, User, Trash2,
} from "lucide-react";
import { SupplierNovaContaDialog } from "./SupplierNovaContaDialog";
import { SupplierEditContaDialog } from "./SupplierEditContaDialog";
import { SwipeableCard } from "./SwipeableCard";

interface Props {
  supplierWorkspaceId: string;
  accounts: any[];
  saldoDisponivel: number;
  onRefresh: () => void;
  onDepositar: () => void;
  onSacar: () => void;
  prefillCreateAccount?: {
    titularId: string;
    bookmakerIds: string[];
  } | null;
  onClearPrefillCreate?: () => void;
  activeTaskId?: string;
  onAccountCreatedForTask?: () => void;
}

function formatCurrency(val: number, moeda = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: moeda,
    minimumFractionDigits: 2,
  }).format(val);
}

interface TitularGroup {
  titularId: string | null;
  titularNome: string;
  accounts: any[];
  totalSaldo: number;
}

function groupByTitular(accounts: any[]): TitularGroup[] {
  const map = new Map<string, TitularGroup>();

  for (const acc of accounts) {
    const tid = acc.titular_id || "__sem_titular__";
    const nome = acc.supplier_titulares?.nome || "Sem titular";

    if (!map.has(tid)) {
      map.set(tid, {
        titularId: acc.titular_id || null,
        titularNome: nome,
        accounts: [],
        totalSaldo: 0,
      });
    }

    const group = map.get(tid)!;
    group.accounts.push(acc);
    group.totalSaldo += Number(acc.saldo_atual);
  }

  return Array.from(map.values()).sort((a, b) =>
    a.titularNome.localeCompare(b.titularNome)
  );
}

// Account card component defined outside to prevent remounts
function AccountCard({
  account,
  onEdit,
}: {
  account: any;
  onEdit: (acc: any) => void;
}) {
  return (
    <SwipeableCard
      leftActions={[
        {
          icon: <Pencil className="h-4 w-4" />,
          label: "Editar",
          onClick: () => onEdit(account),
          className: "bg-primary text-primary-foreground",
        },
      ]}
      rightActions={[
        {
          icon: <Trash2 className="h-4 w-4" />,
          label: "Excluir",
          onClick: () => onEdit(account),
          className: "bg-destructive text-destructive-foreground",
        },
      ]}
    >
      <Card
        className="border-0 rounded-none shadow-none cursor-pointer group"
        onClick={() => onEdit(account)}
      >
        <CardContent className="py-3 px-3 sm:px-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            {account.bookmakers_catalogo?.logo_url ? (
              <img
                src={account.bookmakers_catalogo.logo_url}
                alt=""
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-md object-contain bg-muted p-0.5 shrink-0"
              />
            ) : (
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {account.bookmakers_catalogo?.nome || "Casa"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {account.login_username}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="text-right">
              <p className="text-sm font-semibold text-foreground tabular-nums">
                {formatCurrency(Number(account.saldo_atual), account.moeda)}
              </p>
              <Badge variant="outline" className="text-[10px] hidden sm:inline-flex">
                {account.moeda}
              </Badge>
            </div>
            <Pencil className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block" />
          </div>
        </CardContent>
      </Card>
    </SwipeableCard>
  );
}

// Titular accordion group defined outside
function TitularAccordion({
  group,
  defaultOpen,
  onEditAccount,
}: {
  group: TitularGroup;
  defaultOpen: boolean;
  onEditAccount: (acc: any) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 bg-muted/50 hover:bg-muted/80 rounded-lg transition-colors">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-foreground">{group.titularNome}</p>
              <p className="text-xs text-muted-foreground">
                {group.accounts.length} conta{group.accounts.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {formatCurrency(group.totalSaldo)}
            </span>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                open ? "rotate-180" : ""
              }`}
            />
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 rounded-lg border overflow-hidden divide-y divide-border">
          {group.accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              onEdit={onEditAccount}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function SupplierContasTab({
  supplierWorkspaceId,
  accounts,
  saldoDisponivel,
  onRefresh,
  onDepositar,
  onSacar,
  prefillCreateAccount,
  onClearPrefillCreate,
  activeTaskId,
  onAccountCreatedForTask,
}: Props) {
  const [novaContaOpen, setNovaContaOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<any | null>(null);

  // Auto-open Nova Conta dialog when prefill is set
  useEffect(() => {
    if (prefillCreateAccount) {
      setNovaContaOpen(true);
    }
  }, [prefillCreateAccount]);

  const groups = useMemo(() => groupByTitular(accounts), [accounts]);
  const hasSingleTitular = groups.length <= 1;

  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" onClick={onDepositar} className="gap-1.5 text-xs sm:text-sm">
          <ArrowUpRight className="h-3.5 w-3.5" /> Depositar
        </Button>
        <Button size="sm" variant="outline" onClick={onSacar} className="gap-1.5 text-xs sm:text-sm">
          <ArrowDownRight className="h-3.5 w-3.5" /> Sacar
        </Button>
        <Button size="sm" variant="outline" onClick={() => setNovaContaOpen(true)} className="gap-1.5 text-xs sm:text-sm">
          <Plus className="h-3.5 w-3.5" /> Nova Conta
        </Button>
      </div>

      {/* Swipe hint - mobile only */}
      <p className="text-[11px] text-muted-foreground sm:hidden">
        ← Deslize os cards para ações rápidas →
      </p>

      {/* Accounts grouped by titular */}
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
      ) : hasSingleTitular ? (
        // Single titular: no accordion needed, flat list
        <div className="space-y-1">
          {groups[0] && (
            <div className="flex items-center gap-2 px-1 mb-2">
              <User className="h-3.5 w-3.5 text-primary" />
              <span className="text-sm font-semibold text-foreground">{groups[0].titularNome}</span>
              <Badge variant="secondary" className="text-[10px]">
                {groups[0].accounts.length} conta{groups[0].accounts.length !== 1 ? "s" : ""}
              </Badge>
            </div>
          )}
          <div className="rounded-lg border overflow-hidden divide-y divide-border">
            {accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                onEdit={setEditAccount}
              />
            ))}
          </div>
        </div>
      ) : (
        // Multiple titulares: accordion view
        <div className="space-y-3">
          {groups.map((group) => (
            <TitularAccordion
              key={group.titularId || "__none__"}
              group={group}
              defaultOpen={groups.length <= 3}
              onEditAccount={setEditAccount}
            />
          ))}
        </div>
      )}

      <SupplierNovaContaDialog
        open={novaContaOpen}
        onOpenChange={(open) => {
          setNovaContaOpen(open);
          if (!open) onClearPrefillCreate?.();
        }}
        supplierWorkspaceId={supplierWorkspaceId}
        onSuccess={onRefresh}
        prefillTitularId={prefillCreateAccount?.titularId}
        prefillBookmakerIds={prefillCreateAccount?.bookmakerIds}
        activeTaskId={activeTaskId}
        supplierToken={supplierToken}
        onTaskItemsCompleted={onAccountCreatedForTask}
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
