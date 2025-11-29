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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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

      const { data, error } = await supabase.from("bancos").insert({
        codigo,
        nome,
        user_id: user.id,
        is_system: false,
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
            <CommandInput placeholder="Buscar banco..." className="text-center" />
            <CommandList className="bg-popover">
              <CommandEmpty>Nenhum banco encontrado.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    setDialogOpen(true);
                    setOpen(false);
                  }}
                  className="justify-center text-center hover:bg-accent focus:bg-accent text-primary font-medium border-b border-border"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Cadastrar novo banco
                </CommandItem>
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
