import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const countries = [
  { code: "+55", name: "Brasil", flag: "🇧🇷", mask: "(00) 00000-0000" },
  { code: "+54", name: "Argentina", flag: "🇦🇷", mask: "0 0000-0000" },
  { code: "+56", name: "Chile", flag: "🇨🇱", mask: "0 0000 0000" },
  { code: "+51", name: "Peru", flag: "🇵🇪", mask: "000 000 000" },
  { code: "+52", name: "México", flag: "🇲🇽", mask: "00 0000 0000" },
  { code: "+591", name: "Bolívia", flag: "🇧🇴", mask: "0 000 0000" },
  { code: "+57", name: "Colômbia", flag: "🇨🇴", mask: "000 000 0000" },
  { code: "+1", name: "Estados Unidos", flag: "🇺🇸", mask: "(000) 000-0000" },
  { code: "+34", name: "Espanha", flag: "🇪🇸", mask: "000 00 00 00" },
  { code: "+351", name: "Portugal", flag: "🇵🇹", mask: "000 000 000" },
  { code: "+44", name: "Reino Unido", flag: "🇬🇧", mask: "0000 000000" },
  { code: "+33", name: "França", flag: "🇫🇷", mask: "0 00 00 00 00" },
  { code: "+49", name: "Alemanha", flag: "🇩🇪", mask: "000 00000000" },
];

export function PhoneInput({ value, onChange, disabled = false }: PhoneInputProps) {
  const parsePhone = (fullPhone: string) => {
    // Normalize: ensure it starts with "+"
    const normalized = fullPhone.startsWith("+") ? fullPhone : `+${fullPhone}`;
    
    const country = countries.find(c => normalized.startsWith(c.code));
    if (country) {
      return {
        code: country.code,
        number: normalized.slice(country.code.length).trim()
      };
    }
    return { code: "+55", number: normalized.slice(3).trim() };
  };

  const parsed = parsePhone(value || "+55");
  const [countryCode, setCountryCode] = useState(parsed.code);
  const [phoneNumber, setPhoneNumber] = useState(parsed.number);

  const handleCountryChange = (newCode: string) => {
    setCountryCode(newCode);
    onChange(`${newCode} ${phoneNumber}`);
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value.replace(/\D/g, "");
    
    // Format based on country
    let formatted = input;
    if (countryCode === "+55") {
      // Brasil: (00) 00000-0000 or (00) 0000-0000
      if (input.length <= 10) {
        formatted = input.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
      } else {
        formatted = input.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
      }
    } else if (countryCode === "+1") {
      // USA: (000) 000-0000
      formatted = input.replace(/(\d{3})(\d{3})(\d{0,4})/, "($1) $2-$3");
    }
    
    setPhoneNumber(formatted);
    onChange(`${countryCode} ${input}`);
  };

  const selectedCountry = countries.find(c => c.code === countryCode) || countries[0];

  return (
    <div className="flex gap-2">
      <Select value={countryCode} onValueChange={handleCountryChange} disabled={disabled}>
        <SelectTrigger className="w-[140px]">
          <SelectValue>
            <div className="flex items-center gap-2">
              <span className="text-lg">{selectedCountry.flag}</span>
              <span>{selectedCountry.code}</span>
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="bg-popover border-border">
          {countries.map((country) => (
            <SelectItem key={country.code} value={country.code}>
              <div className="flex items-center gap-2">
                <span className="text-lg">{country.flag}</span>
                <span>{country.name}</span>
                <span className="text-muted-foreground">({country.code})</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        value={phoneNumber}
        onChange={handleNumberChange}
        placeholder={selectedCountry.mask}
        disabled={disabled}
        className="flex-1"
      />
    </div>
  );
}
