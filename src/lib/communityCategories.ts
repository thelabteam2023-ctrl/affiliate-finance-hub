import { Building2, Landmark, Gift, CreditCard, Target, AlertTriangle } from 'lucide-react';

export const COMMUNITY_CATEGORIES = [
  { value: 'casas_de_aposta', label: 'Casas de Aposta', icon: Building2, color: 'text-blue-500' },
  { value: 'bancos', label: 'Bancos', icon: Landmark, color: 'text-green-500' },
  { value: 'bonus_e_promocoes', label: 'Bônus e Promoções', icon: Gift, color: 'text-purple-500' },
  { value: 'pagamentos_e_saques', label: 'Pagamentos e Saques', icon: CreditCard, color: 'text-amber-500' },
  { value: 'estrategias', label: 'Estratégias', icon: Target, color: 'text-primary' },
  { value: 'alertas', label: 'Alertas', icon: AlertTriangle, color: 'text-destructive' },
] as const;

export type CommunityCategory = typeof COMMUNITY_CATEGORIES[number]['value'];

export function getCategoryByValue(value: string) {
  return COMMUNITY_CATEGORIES.find(c => c.value === value) || COMMUNITY_CATEGORIES[0];
}
