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
