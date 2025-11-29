import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function PasswordInput({ value, onChange, placeholder, disabled }: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative">
      <Input
        type={showPassword ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="pr-10"
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        tabIndex={-1}
        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent pointer-events-auto"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowPassword(!showPassword);
        }}
        disabled={disabled}
      >
        {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" /> : <Eye className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />}
      </Button>
    </div>
  );
}
