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
import { Input } from "@/components/ui/input";

interface DateTimePickerProps {
  value?: string; // ISO string format: YYYY-MM-DDTHH:mm
  onChange: (dateTime: string) => void;
  disabled?: boolean;
  placeholder?: string;
  fromYear?: number;
  toYear?: number;
}

// Parse ISO datetime string as local date
const parseLocalDateTime = (dateTimeString: string): { date: Date | undefined; hour: string; minute: string } => {
  if (!dateTimeString) return { date: undefined, hour: "12", minute: "00" };
  
  const [datePart, timePart] = dateTimeString.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = (timePart || "12:00").split(":").map(s => s.padStart(2, "0"));
  
  if (!year || !month || !day) return { date: undefined, hour: hour || "12", minute: minute || "00" };
  
  return {
    date: new Date(year, month - 1, day),
    hour: hour || "12",
    minute: minute || "00"
  };
};

export function DateTimePicker({
  value,
  onChange,
  disabled,
  placeholder = "Selecione data e hora",
  fromYear = 2020,
  toYear = new Date().getFullYear() + 2,
}: DateTimePickerProps) {
  const parsed = parseLocalDateTime(value || "");
  const [date, setDate] = React.useState<Date | undefined>(parsed.date);
  const [hour, setHour] = React.useState(parsed.hour);
  const [minute, setMinute] = React.useState(parsed.minute);
  const [open, setOpen] = React.useState(false);

  // Sync internal state when value prop changes
  React.useEffect(() => {
    const parsed = parseLocalDateTime(value || "");
    setDate(parsed.date);
    setHour(parsed.hour);
    setMinute(parsed.minute);
  }, [value]);

  const updateDateTime = (newDate: Date | undefined, newHour: string, newMinute: string) => {
    if (newDate) {
      const formattedDate = format(newDate, "yyyy-MM-dd");
      const formattedTime = `${newHour.padStart(2, "0")}:${newMinute.padStart(2, "0")}`;
      onChange(`${formattedDate}T${formattedTime}`);
    } else {
      onChange("");
    }
  };

  const handleDateSelect = (selectedDate: Date | undefined) => {
    setDate(selectedDate);
    updateDateTime(selectedDate, hour, minute);
  };

  const handleHourChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, "");
    if (val.length > 2) val = val.slice(0, 2);
    const num = parseInt(val, 10);
    if (!isNaN(num) && num > 23) val = "23";
    setHour(val);
    if (val.length === 2) {
      updateDateTime(date, val, minute);
    }
  };

  const handleMinuteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, "");
    if (val.length > 2) val = val.slice(0, 2);
    const num = parseInt(val, 10);
    if (!isNaN(num) && num > 59) val = "59";
    setMinute(val);
    if (val.length === 2) {
      updateDateTime(date, hour, val);
    }
  };

  const handleHourBlur = () => {
    const padded = hour.padStart(2, "0");
    setHour(padded);
    updateDateTime(date, padded, minute);
  };

  const handleMinuteBlur = () => {
    const padded = minute.padStart(2, "0");
    setMinute(padded);
    updateDateTime(date, hour, padded);
  };

  const focusNextFormElement = () => {
    requestAnimationFrame(() => {
      const trigger = document.querySelector('[data-datetime-trigger="true"]');
      if (trigger) {
        const focusableElements = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
        const parent = trigger.closest('form') || trigger.closest('[role="dialog"]') || document.body;
        const focusables = Array.from(parent.querySelectorAll(focusableElements));
        const currentIndex = focusables.indexOf(trigger as Element);
        const nextElement = focusables[currentIndex + 1] as HTMLElement;
        if (nextElement) nextElement.focus();
      }
    });
  };

  const handleHourKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      setOpen(false);
      focusNextFormElement();
    }
  };

  const handleMinuteKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      setOpen(false);
      focusNextFormElement();
    }
  };

  const displayValue = date
    ? `${format(date, "dd/MM", { locale: ptBR })} ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          data-datetime-trigger="true"
          className={cn(
            "w-full justify-center text-center font-normal h-10 border border-input bg-background hover:bg-accent/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-all",
            !date && "text-muted-foreground"
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {displayValue || <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 border-border" align="center">
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleDateSelect}
          disabled={disabled}
          initialFocus
          locale={ptBR}
          captionLayout="dropdown-buttons"
          fromYear={fromYear}
          toYear={toYear}
        />
        <div className="border-t border-border p-3">
          <div className="flex items-center justify-center gap-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Hora:</span>
            <div className="flex items-center gap-1">
              <Input
                type="text"
                inputMode="numeric"
                value={hour}
                onChange={handleHourChange}
                onBlur={handleHourBlur}
                onKeyDown={handleHourKeyDown}
                className="w-12 h-8 text-center text-sm"
                placeholder="HH"
                maxLength={2}
                disabled={disabled}
              />
              <span className="text-foreground font-medium">:</span>
              <Input
                type="text"
                inputMode="numeric"
                value={minute}
                onChange={handleMinuteChange}
                onBlur={handleMinuteBlur}
                onKeyDown={handleMinuteKeyDown}
                className="w-12 h-8 text-center text-sm"
                placeholder="MM"
                maxLength={2}
                disabled={disabled}
              />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
