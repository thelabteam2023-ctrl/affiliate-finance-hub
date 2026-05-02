  import * as React from "react";
  import { X, Plus, Check } from "lucide-react";
  import { Badge } from "./badge";
  import { cn } from "@/lib/utils";
  import { Button } from "./button";
  import {
    Popover,
    PopoverContent,
    PopoverTrigger,
  } from "@/components/ui/popover";
  import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
  } from "@/components/ui/command";
  // Configuração de cores para tags predefinidas
  const TAG_COLORS: Record<string, string> = {
    "Investimento Inicial": "bg-blue-500/10 text-blue-500 border-blue-500/20",
    "Aporte Extra": "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    "default": "bg-primary/10 text-primary border-primary/20"
  };

  export const getTagColor = (tag: string) => TAG_COLORS[tag] || TAG_COLORS["default"];

 
 interface TagInputProps {
   placeholder?: string;
   tags: string[];
   onChange: (tags: string[]) => void;
   className?: string;
   suggestions?: string[];
 }
 
  export function TagInput({
    tags,
    onChange,
    className,
    suggestions = [],
  }: TagInputProps) {
    const [open, setOpen] = React.useState(false);

    // Sugestões fixas + o que vier do banco
    const allSuggestions = React.useMemo(() => {
      const defaults = ["Investimento Inicial", "Aporte Extra"];
      const combined = [...new Set([...defaults, ...suggestions])];
      return combined;
    }, [suggestions]);

    const toggleTag = (tag: string) => {
      if (tags.includes(tag)) {
        onChange(tags.filter((t) => t !== tag));
      } else {
        onChange([...tags, tag]);
      }
    };

    return (
      <div className={cn("flex flex-wrap items-center gap-2", className)}>
        {tags.map((tag) => (
          <Badge 
            key={tag} 
            variant="outline" 
            className={cn("flex items-center gap-1 py-0.5 px-2 text-[10px] font-medium", getTagColor(tag))}
          >
            {tag}
            <button
              type="button"
              onClick={() => toggleTag(tag)}
              className="hover:text-destructive focus:outline-none ml-1"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </Badge>
        ))}

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-6 w-6 rounded-full p-0 flex items-center justify-center border-dashed border-muted-foreground/50 hover:border-primary hover:bg-primary/5 group transition-all"
            >
              <Plus className="h-3 w-3 text-muted-foreground group-hover:text-primary" />
              <span className="sr-only">Adicionar Tag</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Nova tag..." className="h-8 text-xs" />
              <CommandList>
                <CommandEmpty>
                  <button
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-xs hover:bg-muted transition-colors text-primary font-medium"
                    onClick={() => {
                      const input = document.querySelector('[cmdk-input]') as HTMLInputElement;
                      if (input?.value) {
                        toggleTag(input.value);
                        input.value = "";
                        setOpen(false);
                      }
                    }}
                  >
                    <Plus className="h-3 w-3" />
                    Criar nova tag
                  </button>
                </CommandEmpty>
                <CommandGroup heading="Sugestões">
                  {allSuggestions.map((suggestion) => (
                    <CommandItem
                      key={suggestion}
                      onSelect={() => {
                        toggleTag(suggestion);
                      }}
                      className="text-xs"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-3.5 w-3.5",
                          tags.includes(suggestion) ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className={cn("px-1.5 py-0.5 rounded text-[10px]", getTagColor(suggestion))}>
                        {suggestion}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    );
  }