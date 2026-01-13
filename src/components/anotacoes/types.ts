export interface FluxoCard {
  id: string;
  user_id: string;
  workspace_id: string;
  coluna_id: string;
  conteudo: string;
  ordem: number;
  versao: number;
  created_at: string;
  updated_at: string;
}

export interface FluxoColuna {
  id: string;
  user_id: string;
  workspace_id: string;
  nome: string;
  ordem: number;
  created_at: string;
  updated_at: string;
}

export interface FluxoCardHistorico {
  id: string;
  card_id: string;
  user_id: string;
  workspace_id: string;
  conteudo: string;
  coluna_id: string;
  versao: number;
  tipo_mudanca: 'criacao' | 'edicao' | 'movimentacao';
  created_at: string;
}

export interface AnotacaoLivre {
  id: string;
  user_id: string;
  workspace_id: string;
  conteudo: string;
  created_at: string;
  updated_at: string;
}
