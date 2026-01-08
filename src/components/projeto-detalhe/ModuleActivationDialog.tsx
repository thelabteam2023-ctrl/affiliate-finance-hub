import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  ArrowLeftRight, 
  Sparkles, 
  Zap, 
  Gift, 
  Coins, 
  Puzzle 
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, React.ElementType> = {
  ArrowLeftRight,
  Sparkles,
  Zap,
  Gift,
  Coins,
  Puzzle,
};

const MODULE_INFO: Record<string, { name: string; icon: string; description: string }> = {
  surebet: {
    name: "Surebet",
    icon: "ArrowLeftRight",
    description: "Apostas arbitradas com lucro garantido independente do resultado",
  },
  valuebet: {
    name: "ValueBet",
    icon: "Sparkles",
    description: "Apostas com valor esperado positivo baseadas em análise de odds",
  },
  duplogreen: {
    name: "Duplo Green",
    icon: "Zap",
    description: "Estratégia de proteção com potencial de lucro em dois resultados",
  },
  freebets: {
    name: "Freebets",
    icon: "Gift",
    description: "Gestão de apostas grátis e conversão em valor real",
  },
  bonus: {
    name: "Bônus",
    icon: "Coins",
    description: "Controle de bônus de casas, rollover e extração de valor",
  },
};

interface ModuleActivationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moduleId: string;
  onActivate: () => Promise<boolean>;
  onSkip?: () => void;
}

export function ModuleActivationDialog({
  open,
  onOpenChange,
  moduleId,
  onActivate,
  onSkip,
}: ModuleActivationDialogProps) {
  const [loading, setLoading] = useState(false);
  
  const moduleInfo = MODULE_INFO[moduleId] || {
    name: "Módulo",
    icon: "Puzzle",
    description: "Funcionalidade adicional do projeto",
  };
  
  const IconComponent = ICON_MAP[moduleInfo.icon] || Puzzle;

  const handleActivate = async () => {
    setLoading(true);
    const success = await onActivate();
    setLoading(false);
    if (success) {
      onOpenChange(false);
    }
  };

  const handleSkip = () => {
    onSkip?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <IconComponent className="h-6 w-6 text-primary" />
            </div>
            <div>
              <DialogTitle>Ativar módulo {moduleInfo.name}?</DialogTitle>
            </div>
          </div>
          <DialogDescription className="text-left">
            Este recurso faz parte do módulo <strong>{moduleInfo.name}</strong> que não está ativo neste projeto.
            <br /><br />
            <span className="text-foreground/80">{moduleInfo.description}</span>
          </DialogDescription>
        </DialogHeader>
        
        <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
          Ao ativar, o módulo aparecerá no menu do projeto e suas funcionalidades serão habilitadas.
          Você pode gerenciar módulos em <strong>Gestão → Módulos</strong>.
        </div>
        
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleSkip} disabled={loading}>
            Agora não
          </Button>
          <Button onClick={handleActivate} disabled={loading}>
            {loading ? "Ativando..." : `Ativar ${moduleInfo.name}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
