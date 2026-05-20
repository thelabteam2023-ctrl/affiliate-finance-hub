import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Extrai apenas o primeiro e último nome de um nome completo.
 * Exemplo: "LUCAS GABRIEL SOUZA SILVA" => "LUCAS SILVA"
 */
export function getFirstLastName(fullName: string): string {
  if (!fullName) return "";
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 2) return fullName;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

/**
 * Extrai apenas o primeiro nome de um nome completo para uso em menções.
 * Exemplo: "LABBET CONSULTORIA" => "LABBET"
 */
export function getDisplayFirstName(name?: string | null): string {
  if (!name) return 'Usuário';
  const cleaned = name.trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'Usuário';
  const first = cleaned.split(' ')[0];
  return first || 'Usuário';
}

