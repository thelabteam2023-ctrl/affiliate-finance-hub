/**
 * Tipos e interfaces para o Wizard de Criação de Projeto
 */

export type WizardStep = 
  | "dados"      // Etapa 1 - Dados Básicos
  | "moeda"      // Etapa 2 - Moeda e Consolidação (Obrigatória)
  | "estrutura"  // Etapa 3 - Estrutura Operacional
  | "ciclos"     // Etapa 4 - Ciclos (Opcional)
  | "modulos"    // Etapa 5 - Módulos
  | "revisao";   // Etapa 6 - Revisão Final

export const WIZARD_STEPS: WizardStep[] = [
  "dados",
  "moeda",
  "estrutura",
  "ciclos",
  "modulos",
  "revisao",
];

export const STEP_CONFIG: Record<WizardStep, {
  label: string;
  description: string;
  required: boolean;
}> = {
  dados: {
    label: "Dados Básicos",
    description: "Identificação do projeto",
    required: true,
  },
  moeda: {
    label: "Moeda",
    description: "Consolidação financeira",
    required: true,
  },
  estrutura: {
    label: "Estrutura",
    description: "Configuração operacional",
    required: true,
  },
  ciclos: {
    label: "Ciclos",
    description: "Primeiro ciclo (opcional)",
    required: false,
  },
  modulos: {
    label: "Módulos",
    description: "Estratégias do projeto",
    required: false,
  },
  revisao: {
    label: "Revisão",
    description: "Confirmar e criar",
    required: true,
  },
};

export interface ProjectFormData {
  // Etapa 1 - Dados Básicos
  nome: string;
  descricao: string | null;
  status: string;
  data_inicio: string | null;
  data_fim_prevista: string | null;
  tem_investimento_crypto: boolean;
  investidor_id: string | null;
  percentual_investidor: number;
  base_calculo_investidor: string;
  
  // Etapa 2 - Moeda
  moeda_consolidacao: "BRL" | "USD";
  fonte_cotacao: "TRABALHO" | "PTAX";
  cotacao_trabalho: number | null;
  
  // Etapa 3 - Estrutura
  modelo_absorcao_taxas: string;
  
  // Etapa 4 - Ciclo (opcional)
  criar_ciclo: boolean;
  ciclo_nome: string;
  ciclo_data_inicio: string | null;
  ciclo_data_fim: string | null;
  ciclo_meta_volume: number;
  ciclo_metrica: "LUCRO" | "VOLUME";
}

export interface CicloPreview {
  nome: string;
  data_inicio: string;
  data_fim_prevista: string;
  meta_volume: number;
  metrica_acumuladora: string;
}

export const DEFAULT_FORM_DATA: ProjectFormData = {
  // Etapa 1
  nome: "",
  descricao: null,
  status: "PLANEJADO",
  data_inicio: null,
  data_fim_prevista: null,
  tem_investimento_crypto: false,
  investidor_id: null,
  percentual_investidor: 0,
  base_calculo_investidor: "LUCRO_LIQUIDO",
  
  // Etapa 2
  moeda_consolidacao: "USD",
  fonte_cotacao: "TRABALHO",
  cotacao_trabalho: null,
  
  // Etapa 3
  modelo_absorcao_taxas: "EMPRESA_100",
  
  // Etapa 4
  criar_ciclo: false,
  ciclo_nome: "",
  ciclo_data_inicio: null,
  ciclo_data_fim: null,
  ciclo_meta_volume: 0,
  ciclo_metrica: "LUCRO",
};
