/**
 * Valida um CPF brasileiro
 */
export function validateCPF(cpf: string): boolean {
  // Remove caracteres não numéricos
  cpf = cpf.replace(/\D/g, "");

  // Verifica se tem 11 dígitos
  if (cpf.length !== 11) return false;

  // Verifica se todos os dígitos são iguais (CPF inválido)
  if (/^(\d)\1+$/.test(cpf)) return false;

  // Validação do primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf.charAt(i)) * (10 - i);
  }
  let digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(cpf.charAt(9))) return false;

  // Validação do segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf.charAt(i)) * (11 - i);
  }
  digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(cpf.charAt(10))) return false;

  return true;
}

/**
 * Formata um CPF para o padrão 000.000.000-00
 */
export function formatCPF(cpf: string): string {
  cpf = cpf.replace(/\D/g, "");
  if (cpf.length <= 11) {
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  return cpf;
}

/**
 * Formata CEP para o padrão 00000-000
 */
export function formatCEP(cep: string): string {
  cep = cep.replace(/\D/g, "");
  return cep.replace(/(\d{5})(\d{3})/, "$1-$2");
}

/**
 * Formata agência bancária para o padrão 0000-0
 */
export function formatAgencia(agencia: string): string {
  agencia = agencia.replace(/\D/g, "");
  if (agencia.length <= 4) return agencia;
  return agencia.replace(/(\d{4})(\d)/, "$1-$2");
}

/**
 * Formata conta bancária
 */
export function formatConta(conta: string): string {
  conta = conta.replace(/[^\d-]/g, "");
  return conta;
}

/**
 * Formata telefone com DDI para exibição (55) 11 99999-9999
 */
export function formatPhoneDisplay(phone: string): string {
  if (!phone) return "";
  const cleaned = phone.replace(/\D/g, "");
  
  // Extract DDI (first 1-3 digits)
  const ddi = cleaned.slice(0, 2);
  const rest = cleaned.slice(2);
  
  // Format: (DDI) XX XXXXX-XXXX or (DDI) XX XXXX-XXXX
  if (rest.length === 11) {
    return `(${ddi}) ${rest.slice(0, 2)} ${rest.slice(2, 7)}-${rest.slice(7)}`;
  } else if (rest.length === 10) {
    return `(${ddi}) ${rest.slice(0, 2)} ${rest.slice(2, 6)}-${rest.slice(6)}`;
  }
  
  return phone;
}

/**
 * Mascara CPF parcialmente (***XXX***-**)
 */
export function maskCPFPartial(cpf: string): string {
  const formatted = formatCPF(cpf);
  return formatted.replace(/(\d{3})\.(\d{3})\.(\d{3})-(\d{2})/, "•••.$2.•••-••");
}

/**
 * Mascara senha com bullets
 */
export function maskPassword(password: string): string {
  return "•".repeat(password.length || 8);
}

/**
 * Mascara email parcialmente (us***@ex***.com)
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return email;
  const [local, domain] = email.split("@");
  const maskedLocal = local.length > 2 
    ? local.substring(0, 2) + "***" 
    : local;
  const maskedDomain = domain.length > 4
    ? domain.substring(0, 2) + "***" + domain.substring(domain.lastIndexOf("."))
    : domain;
  return `${maskedLocal}@${maskedDomain}`;
}
