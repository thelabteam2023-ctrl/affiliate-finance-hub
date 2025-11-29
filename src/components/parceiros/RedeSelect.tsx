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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface RedeCrypto {
  id: string;
  codigo: string;
  nome: string;
  usage_count?: number;
}

interface RedeSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

export function RedeSelect({ value, onValueChange, disabled }: RedeSelectProps) {
  const [open, setOpen] = useState(false);
  const [redes, setRedes] = useState<RedeCrypto[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newRede, setNewRede] = useState({ codigo: "", nome: "" });
  const { toast } = useToast();

  useEffect(() => {
    fetchRedes();
  }, []);

  const fetchRedes = async () => {
    // Buscar redes com contagem de uso
    const { data: redesData } = await supabase.from("redes_crypto").select("*");
    const { data: walletsData } = await supabase
      .from("wallets_crypto")
      .select("network");

    if (redesData && walletsData) {
      // Contar uso de cada rede
      const usageMap = walletsData.reduce((acc: Record<string, number>, wallet) => {
        acc[wallet.network] = (acc[wallet.network] || 0) + 1;
        return acc;
      }, {});

      // Adicionar contagem de uso e ordenar
      const redesWithUsage = redesData.map(rede => ({
        ...rede,
        usage_count: usageMap[rede.codigo] || 0
      }));

      // Ordem de prioridade das principais redes
      const priorityOrder = ["ERC20", "BNB Smart Chain", "TRON", "Bitcoin"];
      
      // Ordenar por: 1º prioridade default, 2º uso, 3º nome
      const sorted = redesWithUsage.sort((a, b) => {
        const aPriority = priorityOrder.indexOf(a.nome);
        const bPriority = priorityOrder.indexOf(b.nome);
        
        // Se ambos estão na lista de prioridade, ordenar pela ordem da lista
        if (aPriority !== -1 && bPriority !== -1) {
          return aPriority - bPriority;
        }
        // Se apenas A está na prioridade, A vem primeiro
        if (aPriority !== -1) return -1;
        // Se apenas B está na prioridade, B vem primeiro
        if (bPriority !== -1) return 1;
        
        // Para os demais, ordenar por uso (maior primeiro), depois por nome
        if (b.usage_count !== a.usage_count) {
          return b.usage_count - a.usage_count;
        }
        return a.nome.localeCompare(b.nome);
      });

      setRedes(sorted);
    }
  };

  const handleCreateRede = async () => {
    if (!newRede.codigo || !newRede.nome) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha código e nome da rede",
        variant: "destructive",
      });
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("redes_crypto").insert({
      codigo: newRede.codigo.toUpperCase(),
      nome: newRede.nome,
      user_id: user.id,
      is_system: false,
    });

    if (error) {
      toast({
        title: "Erro ao criar rede",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Rede criada",
      description: "Nova rede adicionada com sucesso",
    });

    setNewRede({ codigo: "", nome: "" });
    setDialogOpen(false);
    fetchRedes();
  };

  const selectedRede = redes.find((rede) => rede.id === value);

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
                {selectedRede ? selectedRede.nome : "Selecione uma rede"}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-0 bg-popover border-border" align="start">
            <Command className="bg-popover">
              <div className="relative">
                <CommandInput 
                  placeholder="Buscar rede..." 
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
                    <p>Adicionar nova rede</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <CommandList className="bg-popover">
                <CommandEmpty>Nenhuma rede encontrada.</CommandEmpty>
                <CommandGroup>
                  {redes.map((rede) => (
                    <CommandItem
                      key={rede.id}
                      value={rede.nome}
                      onSelect={() => {
                        onValueChange(rede.id);
                        setOpen(false);
                      }}
                      className="justify-center text-center hover:bg-accent focus:bg-accent"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === rede.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {rede.nome}
                      {rede.usage_count! > 0 && (
                        <span className="ml-auto text-xs text-muted-foreground">
                          ({rede.usage_count})
                        </span>
                      )}
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
            <DialogTitle>Adicionar Nova Rede</DialogTitle>
            <DialogDescription>
              Cadastre uma nova rede blockchain
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="codigo">Código *</Label>
              <Input
                id="codigo"
                placeholder="Ex: POLYGON"
                value={newRede.codigo}
                onChange={(e) => setNewRede({ ...newRede, codigo: e.target.value })}
                className="uppercase"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                placeholder="Ex: Polygon"
                value={newRede.nome}
                onChange={(e) => setNewRede({ ...newRede, nome: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateRede}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
