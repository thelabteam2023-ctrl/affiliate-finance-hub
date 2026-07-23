import { Building2, Landmark, Gift, CreditCard, Target, AlertTriangle, Briefcase } from 'lucide-react';

export const COMMUNITY_CATEGORIES = [
  { value: 'casas_de_aposta', label: 'Casas de Aposta', icon: Building2, color: 'text-blue-500' },
  { value: 'bancos', label: 'Bancos', icon: Landmark, color: 'text-green-500' },
  { value: 'bonus_e_promocoes', label: 'Bônus e Promoções', icon: Gift, color: 'text-purple-500' },
  { value: 'pagamentos_e_saques', label: 'Pagamentos e Saques', icon: CreditCard, color: 'text-amber-500' },
  { value: 'estrategias', label: 'Estratégias', icon: Target, color: 'text-primary' },
  { value: 'alertas', label: 'Alertas', icon: AlertTriangle, color: 'text-destructive' },
  { value: 'escritorio', label: 'Escritório', icon: Briefcase, color: 'text-cyan-500' },
] as const;

export type CommunityCategory = typeof COMMUNITY_CATEGORIES[number]['value'];

export function getCategoryByValue(value: string) {
  return COMMUNITY_CATEGORIES.find(c => c.value === value) || COMMUNITY_CATEGORIES[0];
}

export interface CommunitySubcategory {
  categoria: CommunityCategory;
  slug: string;
  label: string;
  ordem: number;
}

export const COMMUNITY_SUBCATEGORIES: CommunitySubcategory[] = [
  { categoria: 'casas_de_aposta', slug: 'kyc', label: 'Verificação (KYC)', ordem: 1 },
  { categoria: 'casas_de_aposta', slug: 'limitacoes', label: 'Limitações e Bloqueios', ordem: 2 },
  { categoria: 'casas_de_aposta', slug: 'suporte', label: 'Suporte / Atendimento', ordem: 3 },
  { categoria: 'casas_de_aposta', slug: 'odds', label: 'Odds e Mercados', ordem: 4 },
  { categoria: 'bancos', slug: 'bloqueios', label: 'Bloqueios', ordem: 1 },
  { categoria: 'bancos', slug: 'pix_ted', label: 'PIX / TED', ordem: 2 },
  { categoria: 'bancos', slug: 'compliance', label: 'Compliance', ordem: 3 },
  { categoria: 'bonus_e_promocoes', slug: 'ofertas', label: 'Ofertas & Oportunidades', ordem: 1 },
  { categoria: 'bonus_e_promocoes', slug: 'termos', label: 'Termos e Regras', ordem: 2 },
  { categoria: 'bonus_e_promocoes', slug: 'cashback', label: 'Cashback', ordem: 3 },
  { categoria: 'pagamentos_e_saques', slug: 'prazos', label: 'Prazos', ordem: 1 },
  { categoria: 'pagamentos_e_saques', slug: 'problemas', label: 'Problemas', ordem: 2 },
  { categoria: 'pagamentos_e_saques', slug: 'metodos', label: 'Métodos e Taxas', ordem: 3 },
  { categoria: 'estrategias', slug: 'surebet', label: 'Surebet', ordem: 1 },
  { categoria: 'estrategias', slug: 'valuebet', label: 'Value Bet', ordem: 2 },
  { categoria: 'estrategias', slug: 'freebet', label: 'Freebet', ordem: 3 },
  { categoria: 'estrategias', slug: 'duplo_green', label: 'Duplo Green', ordem: 4 },
  { categoria: 'estrategias', slug: 'trade', label: 'Trade', ordem: 5 },
  { categoria: 'estrategias', slug: 'cassino', label: 'Cassino', ordem: 6 },
  { categoria: 'estrategias', slug: 'extracao', label: 'Extração', ordem: 7 },
  { categoria: 'alertas', slug: 'golpe_fraude', label: 'Golpe / Fraude', ordem: 1 },
  { categoria: 'alertas', slug: 'downtime', label: 'Downtime / Instabilidade', ordem: 2 },
  { categoria: 'alertas', slug: 'mudanca_regras', label: 'Mudança de Regras', ordem: 3 },
  { categoria: 'escritorio', slug: 'operacional', label: 'Operacional', ordem: 1 },
  { categoria: 'escritorio', slug: 'rh_legal', label: 'RH / Legal', ordem: 2 },
];

export function getSubcategoriesFor(categoria: CommunityCategory): CommunitySubcategory[] {
  return COMMUNITY_SUBCATEGORIES.filter(s => s.categoria === categoria).sort((a, b) => a.ordem - b.ordem);
}

export function getSubcategoryLabel(categoria: string, slug: string | null | undefined): string | null {
  if (!slug) return null;
  return COMMUNITY_SUBCATEGORIES.find(s => s.categoria === categoria && s.slug === slug)?.label || null;
}
