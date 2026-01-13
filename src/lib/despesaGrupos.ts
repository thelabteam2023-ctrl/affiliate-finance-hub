// ============================================================
// TAXONOMIA DE GRUPOS DE DESPESAS ADMINISTRATIVAS
// ============================================================
// Uma boa taxonomia não cresce em opções, cresce em clareza.

export const GRUPOS_DESPESA = {
  UTILIDADES_E_SERVICOS_BASICOS: {
    value: "UTILIDADES_E_SERVICOS_BASICOS",
    label: "Utilidades e Serviços Básicos",
    description: "Energia, água e serviços essenciais",
    icon: "⚡",
    color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  },
  INTERNET_E_COMUNICACAO: {
    value: "INTERNET_E_COMUNICACAO",
    label: "Internet e Comunicação",
    description: "Internet fixa, móvel, telefonia",
    icon: "📡",
    color: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  },
  ADMINISTRATIVO_CONTABIL_FISCAL: {
    value: "ADMINISTRATIVO_CONTABIL_FISCAL",
    label: "Administrativo, Contábil & Fiscal",
    description: "Tributos, contabilidade, jurídico, taxas",
    icon: "📊",
    color: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  },
  INFRAESTRUTURA_E_OCUPACAO: {
    value: "INFRAESTRUTURA_E_OCUPACAO",
    label: "Infraestrutura e Ocupação",
    description: "Aluguel, condomínio, manutenção predial",
    icon: "🏢",
    color: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  },
  TECNOLOGIA_E_SOFTWARES: {
    value: "TECNOLOGIA_E_SOFTWARES",
    label: "Tecnologia e Softwares",
    description: "Licenças, proxy, VPN, servidores, SaaS",
    icon: "💻",
    color: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  },
  ATIVOS: {
    value: "ATIVOS",
    label: "Ativos",
    description: "Equipamentos, hardware, móveis",
    icon: "🖥️",
    color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  },
  OUTROS: {
    value: "OUTROS",
    label: "Outros",
    description: "Despesas não classificadas",
    icon: "📦",
    color: "bg-gray-500/10 text-gray-600 border-gray-500/20",
  },
} as const;

export type GrupoDespesa = keyof typeof GRUPOS_DESPESA;

// Lista ordenada para selects
export const GRUPOS_DESPESA_LIST = Object.values(GRUPOS_DESPESA);

// Mapeamento de categorias antigas para grupos (para referência)
export const CATEGORIA_TO_GRUPO: Record<string, GrupoDespesa> = {
  // UTILIDADES_E_SERVICOS_BASICOS
  ENERGIA: "UTILIDADES_E_SERVICOS_BASICOS",
  AGUA: "UTILIDADES_E_SERVICOS_BASICOS",
  GAS: "UTILIDADES_E_SERVICOS_BASICOS",
  LUZ: "UTILIDADES_E_SERVICOS_BASICOS",
  
  // INTERNET_E_COMUNICACAO
  INTERNET: "INTERNET_E_COMUNICACAO",
  INTERNET_MOVEL: "INTERNET_E_COMUNICACAO",
  "INTERNET FIXA": "INTERNET_E_COMUNICACAO",
  TELEFONIA: "INTERNET_E_COMUNICACAO",
  COMUNICACAO: "INTERNET_E_COMUNICACAO",
  CELULAR: "INTERNET_E_COMUNICACAO",
  
  // ADMINISTRATIVO_CONTABIL_FISCAL (unificado)
  DARF: "ADMINISTRATIVO_CONTABIL_FISCAL",
  IMPOSTOS: "ADMINISTRATIVO_CONTABIL_FISCAL",
  TAXAS: "ADMINISTRATIVO_CONTABIL_FISCAL",
  TRIBUTOS: "ADMINISTRATIVO_CONTABIL_FISCAL",
  INSS: "ADMINISTRATIVO_CONTABIL_FISCAL",
  IRPF: "ADMINISTRATIVO_CONTABIL_FISCAL",
  ISS: "ADMINISTRATIVO_CONTABIL_FISCAL",
  CONTABILIDADE: "ADMINISTRATIVO_CONTABIL_FISCAL",
  CONTADOR: "ADMINISTRATIVO_CONTABIL_FISCAL",
  JURIDICO: "ADMINISTRATIVO_CONTABIL_FISCAL",
  ADVOCACIA: "ADMINISTRATIVO_CONTABIL_FISCAL",
  CARTORIO: "ADMINISTRATIVO_CONTABIL_FISCAL",
  ADMINISTRATIVO: "ADMINISTRATIVO_CONTABIL_FISCAL",
  
  // INFRAESTRUTURA_E_OCUPACAO
  ALUGUEL: "INFRAESTRUTURA_E_OCUPACAO",
  CONDOMINIO: "INFRAESTRUTURA_E_OCUPACAO",
  MANUTENCAO: "INFRAESTRUTURA_E_OCUPACAO",
  IPTU: "INFRAESTRUTURA_E_OCUPACAO",
  SEGURO_PREDIAL: "INFRAESTRUTURA_E_OCUPACAO",
  
  // TECNOLOGIA_E_SOFTWARES
  SOFTWARE: "TECNOLOGIA_E_SOFTWARES",
  LICENCA: "TECNOLOGIA_E_SOFTWARES",
  PROXY: "TECNOLOGIA_E_SOFTWARES",
  VPN: "TECNOLOGIA_E_SOFTWARES",
  SERVIDOR: "TECNOLOGIA_E_SOFTWARES",
  HOSTING: "TECNOLOGIA_E_SOFTWARES",
  CLOUD: "TECNOLOGIA_E_SOFTWARES",
  SAAS: "TECNOLOGIA_E_SOFTWARES",
  
  // ATIVOS
  EQUIPAMENTO: "ATIVOS",
  HARDWARE: "ATIVOS",
  MOVEIS: "ATIVOS",
  COMPUTADOR: "ATIVOS",
  MONITOR: "ATIVOS",
};

// Função helper para obter grupo a partir de categoria
export function getGrupoFromCategoria(categoria: string): GrupoDespesa {
  return CATEGORIA_TO_GRUPO[categoria] || "OUTROS";
}

// Função helper para obter info do grupo
export function getGrupoInfo(grupo: string) {
  return GRUPOS_DESPESA[grupo as GrupoDespesa] || GRUPOS_DESPESA.OUTROS;
}
