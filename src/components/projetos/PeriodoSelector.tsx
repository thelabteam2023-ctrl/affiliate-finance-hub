import { Button } from "@/components/ui/button";
import { PeriodoPreset, PeriodoAnalise, criarPeriodo } from "@/types/performance";

interface PeriodoSelectorProps {
  periodo: PeriodoAnalise;
  onChange: (periodo: PeriodoAnalise) => void;
}

const PRESETS: { value: PeriodoPreset; label: string }[] = [
  { value: '7dias', label: '7 dias' },
  { value: '30dias', label: '30 dias' },
  { value: 'mes', label: 'Mês' },
  { value: 'ano', label: 'Ano' },
  { value: 'tudo', label: 'Tudo' },
];

export function PeriodoSelector({ periodo, onChange }: PeriodoSelectorProps) {
  const handleChange = (preset: PeriodoPreset) => {
    onChange(criarPeriodo(preset));
  };

  return (
    <div className="flex items-center gap-1">
      {PRESETS.map(({ value, label }) => (
        <Button
          key={value}
          variant={periodo.preset === value ? "default" : "outline"}
          size="sm"
          onClick={() => handleChange(value)}
          className="h-7 px-3 text-xs"
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
