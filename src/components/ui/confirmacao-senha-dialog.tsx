import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ConfirmacaoSenhaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  variant?: "danger" | "warning";
}

// Gerar código aleatório de 4 caracteres
const generateCode = (): string => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Excluir caracteres confusos (0, O, 1, I)
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export function ConfirmacaoSenhaDialog({
  open,
  onOpenChange,
  onConfirm,
  title = "Confirmar Ação",
  description = "Esta ação é irreversível. Digite o código abaixo para confirmar.",
  confirmLabel = "Confirmar",
  variant = "danger",
}: ConfirmacaoSenhaDialogProps) {
  const [captchaCode, setCaptchaCode] = useState<string>("");
  const [inputValue, setInputValue] = useState<string>("");
  const [isValid, setIsValid] = useState<boolean>(false);

  // Gerar novo código quando o dialog abre
  useEffect(() => {
    if (open) {
      setCaptchaCode(generateCode());
      setInputValue("");
      setIsValid(false);
    }
  }, [open]);

  // Validar input
  useEffect(() => {
    setIsValid(inputValue.toUpperCase() === captchaCode);
  }, [inputValue, captchaCode]);

  const handleRefresh = useCallback(() => {
    setCaptchaCode(generateCode());
    setInputValue("");
    setIsValid(false);
  }, []);

  const handleConfirm = () => {
    if (isValid) {
      onConfirm();
      onOpenChange(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && isValid) {
      handleConfirm();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className={`h-5 w-5 ${variant === "danger" ? "text-destructive" : "text-amber-500"}`} />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* CAPTCHA Visual */}
          <div className="flex items-center justify-center gap-2">
            <div className="relative bg-muted/50 border border-border rounded-lg px-6 py-4 select-none">
              <div className="flex gap-2">
                {captchaCode.split("").map((char, idx) => (
                  <span
                    key={idx}
                    className="text-3xl font-mono font-bold tracking-widest"
                    style={{
                      color: `hsl(${(idx * 60 + 180) % 360}, 70%, 50%)`,
                      transform: `rotate(${(idx % 2 === 0 ? 1 : -1) * (Math.random() * 10 + 5)}deg)`,
                      display: "inline-block",
                      textShadow: "2px 2px 4px rgba(0,0,0,0.3)",
                    }}
                  >
                    {char}
                  </span>
                ))}
              </div>
              {/* Linhas decorativas para dificultar leitura automática */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-lg">
                <svg className="w-full h-full" style={{ position: "absolute" }}>
                  <line x1="10%" y1="30%" x2="90%" y2="70%" stroke="hsl(var(--muted-foreground))" strokeWidth="1" opacity="0.3" />
                  <line x1="20%" y1="60%" x2="80%" y2="40%" stroke="hsl(var(--muted-foreground))" strokeWidth="1" opacity="0.3" />
                </svg>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              className="h-10 w-10"
              title="Gerar novo código"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {/* Input para digitar o código */}
          <div className="space-y-2">
            <Label htmlFor="captcha-input">Digite o código acima para confirmar</Label>
            <Input
              id="captcha-input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              placeholder="Digite o código"
              maxLength={4}
              className={`text-center text-lg font-mono tracking-widest ${
                inputValue.length === 4 
                  ? isValid 
                    ? "border-emerald-500 focus-visible:ring-emerald-500" 
                    : "border-destructive focus-visible:ring-destructive"
                  : ""
              }`}
              autoFocus
              autoComplete="off"
            />
            {inputValue.length === 4 && !isValid && (
              <p className="text-sm text-destructive">Código incorreto. Tente novamente.</p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant={variant === "danger" ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={!isValid}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
