import * as React from "react";
import { format, parse, isValid, isAfter, subYears } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DatePickerInputProps {
  value?: string;
  onChange: (date: string) => void;
  disabled?: boolean;
  placeholder?: string;
  fromYear?: number;
  toYear?: number;
  /** Maximum selectable date. Dates after this are disabled. */
  maxDate?: Date;
  /** Minimum age in years (e.g. 18). Enforced as maxDate = today - minAge years */
  minAge?: number;
}

/** Applies DD/MM/AAAA mask to raw digits */
function applyDateMask(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Parse DD/MM/YYYY string to Date */
function parseDMY(text: string): Date | null {
  if (text.length !== 10) return null;
  const parsed = parse(text, "dd/MM/yyyy", new Date());
  if (!isValid(parsed)) return null;
  // Verify round-trip to catch invalid dates like 31/02
  if (format(parsed, "dd/MM/yyyy") !== text) return null;
  return parsed;
}

export function DatePickerInput({
  value,
  onChange,
  disabled,
  placeholder = "DD/MM/AAAA",
  fromYear = 1920,
  toYear = new Date().getFullYear(),
  maxDate: maxDateProp,
  minAge,
}: DatePickerInputProps) {
  const effectiveMaxDate = React.useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (minAge) {
      const minDate = subYears(today, minAge);
      if (maxDateProp && maxDateProp < minDate) return maxDateProp;
      return minDate;
    }
    return maxDateProp || today;
  }, [maxDateProp, minAge]);

  // Internal text state for the input
  const [inputText, setInputText] = React.useState("");
  const [error, setError] = React.useState("");
  const [popoverOpen, setPopoverOpen] = React.useState(false);

  // Sync input text when value prop changes (from calendar or external)
  React.useEffect(() => {
    if (value) {
      // value is YYYY-MM-DD
      const [y, m, d] = value.split("-");
      if (y && m && d) {
        setInputText(`${d}/${m}/${y}`);
        setError("");
      }
    } else {
      setInputText("");
      setError("");
    }
  }, [value]);

  const validateAndEmit = (dateObj: Date) => {
    if (isAfter(dateObj, effectiveMaxDate)) {
      if (minAge) {
        setError(`Idade mínima: ${minAge} anos`);
      } else {
        setError("Data futura não permitida");
      }
      return false;
    }
    setError("");
    onChange(format(dateObj, "yyyy-MM-dd"));
    return true;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = applyDateMask(e.target.value);
    setInputText(masked);

    if (masked.length === 10) {
      const parsed = parseDMY(masked);
      if (!parsed) {
        setError("Data inválida");
        return;
      }
      validateAndEmit(parsed);
    } else {
      setError("");
      if (masked.length === 0) {
        onChange("");
      }
    }
  };

  const handleCalendarSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      const formatted = format(selectedDate, "yyyy-MM-dd");
      setInputText(format(selectedDate, "dd/MM/yyyy"));
      setError("");
      onChange(formatted);
    } else {
      setInputText("");
      setError("");
      onChange("");
    }
    setPopoverOpen(false);
  };

  // Calendar selected date derived from value prop
  const calendarDate = React.useMemo(() => {
    if (!value) return undefined;
    const [y, m, d] = value.split("-").map(Number);
    if (!y || !m || !d) return undefined;
    return new Date(y, m - 1, d);
  }, [value]);

  return (
    <div className="relative">
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            value={inputText}
            onChange={handleInputChange}
            disabled={disabled}
            placeholder={placeholder}
            className={cn(
              "flex h-10 w-full rounded-md border bg-background px-3 py-2 pr-10 text-sm ring-offset-background transition-all",
              "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "disabled:cursor-not-allowed disabled:opacity-50",
              error
                ? "border-destructive focus-visible:ring-destructive"
                : "border-input"
            )}
          />
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
            >
              <CalendarIcon className="h-4 w-4" />
            </button>
          </PopoverTrigger>
        </div>
        <PopoverContent className="w-auto p-0 border-border" align="start">
          <Calendar
            mode="single"
            selected={calendarDate}
            onSelect={handleCalendarSelect}
            disabled={(d) => {
              if (disabled) return true;
              if (effectiveMaxDate && d > effectiveMaxDate) return true;
              return false;
            }}
            initialFocus
            locale={ptBR}
            captionLayout="dropdown-buttons"
            fromYear={fromYear}
            toYear={toYear}
            toDate={effectiveMaxDate}
            defaultMonth={calendarDate || effectiveMaxDate}
          />
        </PopoverContent>
      </Popover>
      {error && (
        <p className="text-xs text-destructive mt-1">{error}</p>
      )}
    </div>
  );
}
