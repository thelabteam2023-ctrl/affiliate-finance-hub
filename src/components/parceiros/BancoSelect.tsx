import { useState, useEffect } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useWorkspace } from "@/hooks/useWorkspace";

interface Banco {
  id: string;
  codigo: string;
  nome: string;
}

interface BancoSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

export function BancoSelect({ value, onValueChange, disabled }: BancoSelectProps) {
  const [open, setOpen] = useState(false);
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { workspaceId } = useWorkspace();

  useEffect(() => {
    fetchBancos();
  }, []);

  const fetchBancos = async () => {
    const { data } = await supabase.from("bancos").select("*").order("nome");
    if (data) setBancos(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      if (!workspaceId) throw new Error("Workspace não definido");
      const { data, error } = await supabase.from("bancos").insert({
        codigo,
        nome,
        user_id: user.id,
        is_system: false,
        workspace_id: workspaceId,
      }).select().single();

      if (error) throw error;
      
      toast({ title: "Banco criado com sucesso" });
      
      // Refresh list and select new banco
      await fetchBancos();
      onValueChange(data.id);
      
      // Reset form
      setCodigo("");
      setNome("");
      setDialogOpen(false);
      setOpen(false);
    } catch (error: any) {
      toast({
        title: "Erro ao criar banco",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const selectedBanco = bancos.find((banco) => banco.id === value);

  return (
    <>
      <TooltipProvider>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full justify-between text-center"
              disabled={disabled}
            >
              <span className="flex-1 text-center">
                {selectedBanco
                  ? `${selectedBanco.codigo} - ${selectedBanco.nome}`
                  : "Selecione um banco"}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-0 bg-popover border-border" align="start">
            <Command className="bg-popover">
              <div className="relative">
                <CommandInput 
                  placeholder="Buscar por nome ou código..." 
                  className="pr-14"
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDialogOpen(true);
                        setOpen(false);
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-7 px-3 rounded-lg border border-border/50 bg-background/80 text-primary hover:bg-background hover:border-primary/50 transition-all text-sm font-medium flex items-center gap-1"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Adicionar novo banco</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            <CommandList className="bg-popover">
              <CommandEmpty>Nenhum banco encontrado.</CommandEmpty>
              <CommandGroup>
                {bancos.map((banco) => (
                  <CommandItem
                    key={banco.id}
                    value={`${banco.codigo} ${banco.nome}`}
                    onSelect={() => {
                      onValueChange(banco.id);
                      setOpen(false);
                    }}
                    className="justify-center text-center hover:bg-accent focus:bg-accent"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === banco.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {banco.codigo} - {banco.nome}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      </TooltipProvider>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Banco</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="codigo">Código *</Label>
              <Input
                id="codigo"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="000"
                required
                disabled={saving}
              />
            </div>
            <div>
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome do banco"
                required
                disabled={saving}
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
