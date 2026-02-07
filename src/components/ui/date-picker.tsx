import * as React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DatePickerProps {
  value?: string;
  onChange: (date: string) => void;
  disabled?: boolean;
  placeholder?: string;
  fromYear?: number;
  toYear?: number;
  /** Maximum selectable date. Dates after this are disabled. */
  maxDate?: Date;
}

// Parse YYYY-MM-DD string as local date (not UTC)
const parseLocalDate = (dateString: string): Date | undefined => {
  if (!dateString) return undefined;
  const [year, month, day] = dateString.split('-').map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
};

export function DatePicker({ 
  value, 
  onChange, 
  disabled, 
  placeholder = "Selecione uma data",
  fromYear = 1920,
  toYear = new Date().getFullYear() + 10,
  maxDate,
}: DatePickerProps) {
  const [date, setDate] = React.useState<Date | undefined>(
    value ? parseLocalDate(value) : undefined
  );

  // Sync internal state when value prop changes (fixes view mode loading issue)
  React.useEffect(() => {
    if (value) {
      const parsedDate = parseLocalDate(value);
      if (parsedDate && !isNaN(parsedDate.getTime())) {
        setDate(parsedDate);
      }
    } else {
      setDate(undefined);
    }
  }, [value]);

  const handleSelect = (selectedDate: Date | undefined) => {
    setDate(selectedDate);
    if (selectedDate) {
      // Format as YYYY-MM-DD for database compatibility
      const formattedDate = format(selectedDate, "yyyy-MM-dd");
      onChange(formattedDate);
    } else {
      onChange("");
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal h-10 border border-input bg-background hover:bg-accent/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-all",
            !date && "text-muted-foreground"
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "dd/MM/yyyy", { locale: ptBR }) : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 border-border" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleSelect}
          disabled={(d) => {
            if (disabled) return true;
            if (maxDate && d > maxDate) return true;
            return false;
          }}
          initialFocus
          locale={ptBR}
          captionLayout="dropdown-buttons"
          fromYear={fromYear}
          toYear={toYear}
          toDate={maxDate}
        />
      </PopoverContent>
    </Popover>
  );
}
