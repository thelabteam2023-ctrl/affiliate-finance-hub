import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useChatMediaPreferences, ImageDisplayMode } from '@/hooks/useChatMediaPreferences';

export function ChatSettingsPopover() {
  const { imageDisplayMode, setImageDisplayMode } = useChatMediaPreferences();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Configurações do chat">
          <Settings className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-sm mb-3">Preferências de Mídia</h4>
            
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground">
                Exibição de Imagens
              </Label>
              <RadioGroup 
                value={imageDisplayMode} 
                onValueChange={(v) => setImageDisplayMode(v as ImageDisplayMode)}
                className="gap-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="auto" id="img-auto" />
                  <Label htmlFor="img-auto" className="text-sm font-normal cursor-pointer">
                    Mostrar automaticamente
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="collapsed" id="img-collapsed" />
                  <Label htmlFor="img-collapsed" className="text-sm font-normal cursor-pointer">
                    Sempre colapsar (padrão)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="hidden" id="img-hidden" />
                  <Label htmlFor="img-hidden" className="text-sm font-normal cursor-pointer">
                    Ocultar (mostrar só texto)
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </div>
          
          <div className="pt-2 border-t border-border">
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              💡 Conteúdos com prints, análises profundas ou evidências funcionam melhor nos <strong>Tópicos por Casa</strong>.
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
