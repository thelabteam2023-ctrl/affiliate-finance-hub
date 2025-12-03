export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      bancos: {
        Row: {
          codigo: string
          created_at: string | null
          id: string
          is_system: boolean | null
          nome: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          codigo: string
          created_at?: string | null
          id?: string
          is_system?: boolean | null
          nome: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          codigo?: string
          created_at?: string | null
          id?: string
          is_system?: boolean | null
          nome?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      bookmakers: {
        Row: {
          bookmaker_catalogo_id: string | null
          created_at: string
          id: string
          link_origem: string | null
          login_password_encrypted: string
          login_username: string
          moeda: string
          nome: string
          observacoes: string | null
          parceiro_id: string | null
          saldo_atual: number
          status: string
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          bookmaker_catalogo_id?: string | null
          created_at?: string
          id?: string
          link_origem?: string | null
          login_password_encrypted: string
          login_username: string
          moeda?: string
          nome: string
          observacoes?: string | null
          parceiro_id?: string | null
          saldo_atual?: number
          status?: string
          updated_at?: string
          url?: string | null
          user_id: string
        }
        Update: {
          bookmaker_catalogo_id?: string | null
          created_at?: string
          id?: string
          link_origem?: string | null
          login_password_encrypted?: string
          login_username?: string
          moeda?: string
          nome?: string
          observacoes?: string | null
          parceiro_id?: string | null
          saldo_atual?: number
          status?: string
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmakers_bookmaker_catalogo_id_fkey"
            columns: ["bookmaker_catalogo_id"]
            isOneToOne: false
            referencedRelation: "bookmakers_catalogo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmakers_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmakers_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_contas"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "bookmakers_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_wallets"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "bookmakers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bookmakers_catalogo: {
        Row: {
          bonus_enabled: boolean
          bonus_multiplos_json: Json | null
          bonus_simples_json: Json | null
          created_at: string
          id: string
          is_system: boolean | null
          links_json: Json | null
          logo_url: string | null
          multibonus_enabled: boolean
          nome: string
          observacoes: string | null
          operacional: string
          status: string
          updated_at: string
          user_id: string | null
          verificacao: string
        }
        Insert: {
          bonus_enabled?: boolean
          bonus_multiplos_json?: Json | null
          bonus_simples_json?: Json | null
          created_at?: string
          id?: string
          is_system?: boolean | null
          links_json?: Json | null
          logo_url?: string | null
          multibonus_enabled?: boolean
          nome: string
          observacoes?: string | null
          operacional?: string
          status?: string
          updated_at?: string
          user_id?: string | null
          verificacao?: string
        }
        Update: {
          bonus_enabled?: boolean
          bonus_multiplos_json?: Json | null
          bonus_simples_json?: Json | null
          created_at?: string
          id?: string
          is_system?: boolean | null
          links_json?: Json | null
          logo_url?: string | null
          multibonus_enabled?: boolean
          nome?: string
          observacoes?: string | null
          operacional?: string
          status?: string
          updated_at?: string
          user_id?: string | null
          verificacao?: string
        }
        Relationships: []
      }
      cash_ledger: {
        Row: {
          coin: string | null
          cotacao: number | null
          created_at: string
          data_transacao: string
          descricao: string | null
          destino_bookmaker_id: string | null
          destino_conta_bancaria_id: string | null
          destino_parceiro_id: string | null
          destino_tipo: string | null
          destino_wallet_id: string | null
          id: string
          investidor_id: string | null
          moeda: string
          nome_investidor: string | null
          origem_bookmaker_id: string | null
          origem_conta_bancaria_id: string | null
          origem_parceiro_id: string | null
          origem_tipo: string | null
          origem_wallet_id: string | null
          qtd_coin: number | null
          status: string
          tipo_moeda: string
          tipo_transacao: string
          updated_at: string
          user_id: string
          valor: number
          valor_usd: number | null
        }
        Insert: {
          coin?: string | null
          cotacao?: number | null
          created_at?: string
          data_transacao?: string
          descricao?: string | null
          destino_bookmaker_id?: string | null
          destino_conta_bancaria_id?: string | null
          destino_parceiro_id?: string | null
          destino_tipo?: string | null
          destino_wallet_id?: string | null
          id?: string
          investidor_id?: string | null
          moeda: string
          nome_investidor?: string | null
          origem_bookmaker_id?: string | null
          origem_conta_bancaria_id?: string | null
          origem_parceiro_id?: string | null
          origem_tipo?: string | null
          origem_wallet_id?: string | null
          qtd_coin?: number | null
          status?: string
          tipo_moeda: string
          tipo_transacao: string
          updated_at?: string
          user_id: string
          valor: number
          valor_usd?: number | null
        }
        Update: {
          coin?: string | null
          cotacao?: number | null
          created_at?: string
          data_transacao?: string
          descricao?: string | null
          destino_bookmaker_id?: string | null
          destino_conta_bancaria_id?: string | null
          destino_parceiro_id?: string | null
          destino_tipo?: string | null
          destino_wallet_id?: string | null
          id?: string
          investidor_id?: string | null
          moeda?: string
          nome_investidor?: string | null
          origem_bookmaker_id?: string | null
          origem_conta_bancaria_id?: string | null
          origem_parceiro_id?: string | null
          origem_tipo?: string | null
          origem_wallet_id?: string | null
          qtd_coin?: number | null
          status?: string
          tipo_moeda?: string
          tipo_transacao?: string
          updated_at?: string
          user_id?: string
          valor?: number
          valor_usd?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_ledger_destino_bookmaker_id_fkey"
            columns: ["destino_bookmaker_id"]
            isOneToOne: false
            referencedRelation: "bookmakers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_destino_conta_bancaria_id_fkey"
            columns: ["destino_conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_destino_conta_bancaria_id_fkey"
            columns: ["destino_conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_contas"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "cash_ledger_destino_parceiro_id_fkey"
            columns: ["destino_parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_destino_parceiro_id_fkey"
            columns: ["destino_parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_contas"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "cash_ledger_destino_parceiro_id_fkey"
            columns: ["destino_parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_wallets"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "cash_ledger_destino_wallet_id_fkey"
            columns: ["destino_wallet_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_wallets"
            referencedColumns: ["wallet_id"]
          },
          {
            foreignKeyName: "cash_ledger_destino_wallet_id_fkey"
            columns: ["destino_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets_crypto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_investidor_id_fkey"
            columns: ["investidor_id"]
            isOneToOne: false
            referencedRelation: "investidores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_investidor_id_fkey"
            columns: ["investidor_id"]
            isOneToOne: false
            referencedRelation: "v_roi_investidores"
            referencedColumns: ["investidor_id"]
          },
          {
            foreignKeyName: "cash_ledger_origem_bookmaker_id_fkey"
            columns: ["origem_bookmaker_id"]
            isOneToOne: false
            referencedRelation: "bookmakers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_origem_conta_bancaria_id_fkey"
            columns: ["origem_conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_origem_conta_bancaria_id_fkey"
            columns: ["origem_conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_contas"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "cash_ledger_origem_parceiro_id_fkey"
            columns: ["origem_parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_origem_parceiro_id_fkey"
            columns: ["origem_parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_contas"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "cash_ledger_origem_parceiro_id_fkey"
            columns: ["origem_parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_wallets"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "cash_ledger_origem_wallet_id_fkey"
            columns: ["origem_wallet_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_wallets"
            referencedColumns: ["wallet_id"]
          },
          {
            foreignKeyName: "cash_ledger_origem_wallet_id_fkey"
            columns: ["origem_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets_crypto"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_bancarias: {
        Row: {
          agencia: string | null
          banco: string
          banco_id: string | null
          conta: string | null
          created_at: string
          id: string
          observacoes: string | null
          parceiro_id: string
          pix_key: string | null
          tipo_conta: string
          titular: string
          updated_at: string
        }
        Insert: {
          agencia?: string | null
          banco: string
          banco_id?: string | null
          conta?: string | null
          created_at?: string
          id?: string
          observacoes?: string | null
          parceiro_id: string
          pix_key?: string | null
          tipo_conta: string
          titular: string
          updated_at?: string
        }
        Update: {
          agencia?: string | null
          banco?: string
          banco_id?: string | null
          conta?: string | null
          created_at?: string
          id?: string
          observacoes?: string | null
          parceiro_id?: string
          pix_key?: string | null
          tipo_conta?: string
          titular?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contas_bancarias_banco_id_fkey"
            columns: ["banco_id"]
            isOneToOne: false
            referencedRelation: "bancos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_bancarias_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_bancarias_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_contas"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "contas_bancarias_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_wallets"
            referencedColumns: ["parceiro_id"]
          },
        ]
      }
      fornecedores: {
        Row: {
          created_at: string | null
          documento: string | null
          email: string | null
          id: string
          nome: string
          observacoes: string | null
          status: string
          telefone: string | null
          tipo_documento: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          documento?: string | null
          email?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          status?: string
          telefone?: string | null
          tipo_documento?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          documento?: string | null
          email?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          status?: string
          telefone?: string | null
          tipo_documento?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      indicacoes: {
        Row: {
          created_at: string | null
          data_indicacao: string | null
          id: string
          indicador_id: string
          observacoes: string | null
          origem: string | null
          parceiro_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          data_indicacao?: string | null
          id?: string
          indicador_id: string
          observacoes?: string | null
          origem?: string | null
          parceiro_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          data_indicacao?: string | null
          id?: string
          indicador_id?: string
          observacoes?: string | null
          origem?: string | null
          parceiro_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "indicacoes_indicador_id_fkey"
            columns: ["indicador_id"]
            isOneToOne: false
            referencedRelation: "indicadores_referral"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicacoes_indicador_id_fkey"
            columns: ["indicador_id"]
            isOneToOne: false
            referencedRelation: "v_indicador_performance"
            referencedColumns: ["indicador_id"]
          },
          {
            foreignKeyName: "indicacoes_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicacoes_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_contas"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "indicacoes_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_wallets"
            referencedColumns: ["parceiro_id"]
          },
        ]
      }
      indicador_acordos: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          id: string
          indicador_id: string
          meta_parceiros: number | null
          observacoes: string | null
          orcamento_por_parceiro: number
          updated_at: string | null
          user_id: string
          valor_bonus: number | null
          vigencia_fim: string | null
          vigencia_inicio: string | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          id?: string
          indicador_id: string
          meta_parceiros?: number | null
          observacoes?: string | null
          orcamento_por_parceiro?: number
          updated_at?: string | null
          user_id: string
          valor_bonus?: number | null
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          id?: string
          indicador_id?: string
          meta_parceiros?: number | null
          observacoes?: string | null
          orcamento_por_parceiro?: number
          updated_at?: string | null
          user_id?: string
          valor_bonus?: number | null
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "indicador_acordos_indicador_id_fkey"
            columns: ["indicador_id"]
            isOneToOne: false
            referencedRelation: "indicadores_referral"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicador_acordos_indicador_id_fkey"
            columns: ["indicador_id"]
            isOneToOne: false
            referencedRelation: "v_indicador_performance"
            referencedColumns: ["indicador_id"]
          },
        ]
      }
      indicadores_referral: {
        Row: {
          cpf: string
          created_at: string | null
          email: string | null
          id: string
          nome: string
          observacoes: string | null
          status: string
          telefone: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cpf: string
          created_at?: string | null
          email?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          status?: string
          telefone?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cpf?: string
          created_at?: string | null
          email?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          status?: string
          telefone?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      investidor_deals: {
        Row: {
          ativo: boolean | null
          base_calculo: string
          created_at: string | null
          faixas_progressivas: Json | null
          id: string
          investidor_id: string
          percentual_fixo: number | null
          tipo_deal: string
          updated_at: string | null
          user_id: string
          vigencia_fim: string | null
          vigencia_inicio: string | null
        }
        Insert: {
          ativo?: boolean | null
          base_calculo?: string
          created_at?: string | null
          faixas_progressivas?: Json | null
          id?: string
          investidor_id: string
          percentual_fixo?: number | null
          tipo_deal?: string
          updated_at?: string | null
          user_id: string
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Update: {
          ativo?: boolean | null
          base_calculo?: string
          created_at?: string | null
          faixas_progressivas?: Json | null
          id?: string
          investidor_id?: string
          percentual_fixo?: number | null
          tipo_deal?: string
          updated_at?: string | null
          user_id?: string
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investidor_deals_investidor_id_fkey"
            columns: ["investidor_id"]
            isOneToOne: false
            referencedRelation: "investidores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investidor_deals_investidor_id_fkey"
            columns: ["investidor_id"]
            isOneToOne: false
            referencedRelation: "v_roi_investidores"
            referencedColumns: ["investidor_id"]
          },
        ]
      }
      investidores: {
        Row: {
          cpf: string
          created_at: string
          id: string
          nome: string
          observacoes: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cpf: string
          created_at?: string
          id?: string
          nome: string
          observacoes?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cpf?: string
          created_at?: string
          id?: string
          nome?: string
          observacoes?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      movimentacoes_indicacao: {
        Row: {
          created_at: string | null
          data_movimentacao: string | null
          descricao: string | null
          id: string
          indicador_id: string | null
          moeda: string
          parceria_id: string
          status: string
          tipo: string
          user_id: string
          valor: number
        }
        Insert: {
          created_at?: string | null
          data_movimentacao?: string | null
          descricao?: string | null
          id?: string
          indicador_id?: string | null
          moeda?: string
          parceria_id: string
          status?: string
          tipo: string
          user_id: string
          valor: number
        }
        Update: {
          created_at?: string | null
          data_movimentacao?: string | null
          descricao?: string | null
          id?: string
          indicador_id?: string | null
          moeda?: string
          parceria_id?: string
          status?: string
          tipo?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "movimentacoes_indicacao_indicador_id_fkey"
            columns: ["indicador_id"]
            isOneToOne: false
            referencedRelation: "indicadores_referral"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_indicacao_indicador_id_fkey"
            columns: ["indicador_id"]
            isOneToOne: false
            referencedRelation: "v_indicador_performance"
            referencedColumns: ["indicador_id"]
          },
          {
            foreignKeyName: "movimentacoes_indicacao_parceria_id_fkey"
            columns: ["parceria_id"]
            isOneToOne: false
            referencedRelation: "parcerias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_indicacao_parceria_id_fkey"
            columns: ["parceria_id"]
            isOneToOne: false
            referencedRelation: "v_custos_aquisicao"
            referencedColumns: ["parceria_id"]
          },
          {
            foreignKeyName: "movimentacoes_indicacao_parceria_id_fkey"
            columns: ["parceria_id"]
            isOneToOne: false
            referencedRelation: "v_parcerias_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      parceiros: {
        Row: {
          cep: string | null
          cidade: string | null
          cpf: string
          created_at: string
          data_nascimento: string | null
          email: string | null
          endereco: string | null
          id: string
          nome: string
          observacoes: string | null
          status: string
          telefone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cep?: string | null
          cidade?: string | null
          cpf: string
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          status?: string
          telefone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cep?: string | null
          cidade?: string | null
          cpf?: string
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          status?: string
          telefone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parceiros_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parcerias: {
        Row: {
          comissao_paga: boolean | null
          created_at: string | null
          data_fim_prevista: string | null
          data_fim_real: string | null
          data_inicio: string
          duracao_dias: number
          elegivel_renovacao: boolean | null
          fornecedor_id: string | null
          id: string
          indicacao_id: string | null
          motivo_encerramento: string | null
          observacoes: string | null
          origem_tipo: string | null
          parceiro_id: string
          status: string
          updated_at: string | null
          user_id: string
          valor_comissao_indicador: number | null
          valor_fornecedor: number | null
          valor_indicador: number | null
          valor_parceiro: number | null
        }
        Insert: {
          comissao_paga?: boolean | null
          created_at?: string | null
          data_fim_prevista?: string | null
          data_fim_real?: string | null
          data_inicio?: string
          duracao_dias?: number
          elegivel_renovacao?: boolean | null
          fornecedor_id?: string | null
          id?: string
          indicacao_id?: string | null
          motivo_encerramento?: string | null
          observacoes?: string | null
          origem_tipo?: string | null
          parceiro_id: string
          status?: string
          updated_at?: string | null
          user_id: string
          valor_comissao_indicador?: number | null
          valor_fornecedor?: number | null
          valor_indicador?: number | null
          valor_parceiro?: number | null
        }
        Update: {
          comissao_paga?: boolean | null
          created_at?: string | null
          data_fim_prevista?: string | null
          data_fim_real?: string | null
          data_inicio?: string
          duracao_dias?: number
          elegivel_renovacao?: boolean | null
          fornecedor_id?: string | null
          id?: string
          indicacao_id?: string | null
          motivo_encerramento?: string | null
          observacoes?: string | null
          origem_tipo?: string | null
          parceiro_id?: string
          status?: string
          updated_at?: string | null
          user_id?: string
          valor_comissao_indicador?: number | null
          valor_fornecedor?: number | null
          valor_indicador?: number | null
          valor_parceiro?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "parcerias_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcerias_indicacao_id_fkey"
            columns: ["indicacao_id"]
            isOneToOne: false
            referencedRelation: "indicacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcerias_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcerias_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_contas"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "parcerias_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_wallets"
            referencedColumns: ["parceiro_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      promocao_participantes: {
        Row: {
          bonus_pago: boolean | null
          created_at: string | null
          data_pagamento_bonus: string | null
          id: string
          indicador_id: string
          meta_atingida: boolean | null
          parceiros_indicados: number | null
          promocao_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          bonus_pago?: boolean | null
          created_at?: string | null
          data_pagamento_bonus?: string | null
          id?: string
          indicador_id: string
          meta_atingida?: boolean | null
          parceiros_indicados?: number | null
          promocao_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          bonus_pago?: boolean | null
          created_at?: string | null
          data_pagamento_bonus?: string | null
          id?: string
          indicador_id?: string
          meta_atingida?: boolean | null
          parceiros_indicados?: number | null
          promocao_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promocao_participantes_indicador_id_fkey"
            columns: ["indicador_id"]
            isOneToOne: false
            referencedRelation: "indicadores_referral"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promocao_participantes_indicador_id_fkey"
            columns: ["indicador_id"]
            isOneToOne: false
            referencedRelation: "v_indicador_performance"
            referencedColumns: ["indicador_id"]
          },
          {
            foreignKeyName: "promocao_participantes_promocao_id_fkey"
            columns: ["promocao_id"]
            isOneToOne: false
            referencedRelation: "promocoes_indicacao"
            referencedColumns: ["id"]
          },
        ]
      }
      promocoes_indicacao: {
        Row: {
          created_at: string | null
          data_fim: string
          data_inicio: string
          descricao: string | null
          id: string
          meta_parceiros: number
          nome: string
          status: string
          updated_at: string | null
          user_id: string
          valor_bonus: number
        }
        Insert: {
          created_at?: string | null
          data_fim: string
          data_inicio: string
          descricao?: string | null
          id?: string
          meta_parceiros: number
          nome: string
          status?: string
          updated_at?: string | null
          user_id: string
          valor_bonus: number
        }
        Update: {
          created_at?: string | null
          data_fim?: string
          data_inicio?: string
          descricao?: string | null
          id?: string
          meta_parceiros?: number
          nome?: string
          status?: string
          updated_at?: string | null
          user_id?: string
          valor_bonus?: number
        }
        Relationships: []
      }
      redes_crypto: {
        Row: {
          codigo: string
          created_at: string | null
          id: string
          is_system: boolean | null
          nome: string
          user_id: string | null
        }
        Insert: {
          codigo: string
          created_at?: string | null
          id?: string
          is_system?: boolean | null
          nome: string
          user_id?: string | null
        }
        Update: {
          codigo?: string
          created_at?: string | null
          id?: string
          is_system?: boolean | null
          nome?: string
          user_id?: string | null
        }
        Relationships: []
      }
      transacoes_bookmakers: {
        Row: {
          bookmaker_id: string
          created_at: string
          data_transacao: string
          descricao: string | null
          id: string
          referencia_externa: string | null
          saldo_anterior: number
          saldo_novo: number
          tipo: string
          valor: number
        }
        Insert: {
          bookmaker_id: string
          created_at?: string
          data_transacao?: string
          descricao?: string | null
          id?: string
          referencia_externa?: string | null
          saldo_anterior: number
          saldo_novo: number
          tipo: string
          valor: number
        }
        Update: {
          bookmaker_id?: string
          created_at?: string
          data_transacao?: string
          descricao?: string | null
          id?: string
          referencia_externa?: string | null
          saldo_anterior?: number
          saldo_novo?: number
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "transacoes_bookmakers_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "bookmakers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallets_crypto: {
        Row: {
          created_at: string
          endereco: string
          exchange: string | null
          id: string
          moeda: string[] | null
          network: string
          observacoes_encrypted: string | null
          parceiro_id: string
          rede_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          endereco: string
          exchange?: string | null
          id?: string
          moeda?: string[] | null
          network: string
          observacoes_encrypted?: string | null
          parceiro_id: string
          rede_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          endereco?: string
          exchange?: string | null
          id?: string
          moeda?: string[] | null
          network?: string
          observacoes_encrypted?: string | null
          parceiro_id?: string
          rede_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_crypto_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallets_crypto_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_contas"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "wallets_crypto_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_wallets"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "wallets_crypto_rede_id_fkey"
            columns: ["rede_id"]
            isOneToOne: false
            referencedRelation: "redes_crypto"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_custos_aquisicao: {
        Row: {
          custo_total: number | null
          data_inicio: string | null
          fornecedor_id: string | null
          fornecedor_nome: string | null
          indicacao_id: string | null
          indicador_id: string | null
          indicador_nome: string | null
          origem_tipo: string | null
          parceiro_id: string | null
          parceiro_nome: string | null
          parceria_id: string | null
          status: string | null
          user_id: string | null
          valor_fornecedor: number | null
          valor_indicador: number | null
          valor_parceiro: number | null
        }
        Relationships: [
          {
            foreignKeyName: "indicacoes_indicador_id_fkey"
            columns: ["indicador_id"]
            isOneToOne: false
            referencedRelation: "indicadores_referral"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicacoes_indicador_id_fkey"
            columns: ["indicador_id"]
            isOneToOne: false
            referencedRelation: "v_indicador_performance"
            referencedColumns: ["indicador_id"]
          },
          {
            foreignKeyName: "parcerias_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcerias_indicacao_id_fkey"
            columns: ["indicacao_id"]
            isOneToOne: false
            referencedRelation: "indicacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcerias_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcerias_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_contas"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "parcerias_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_wallets"
            referencedColumns: ["parceiro_id"]
          },
        ]
      }
      v_indicador_performance: {
        Row: {
          cpf: string | null
          email: string | null
          indicador_id: string | null
          nome: string | null
          parcerias_ativas: number | null
          parcerias_encerradas: number | null
          status: string | null
          telefone: string | null
          total_bonus: number | null
          total_comissoes: number | null
          total_parceiros_indicados: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_parcerias_alerta: {
        Row: {
          comissao_paga: boolean | null
          data_fim_prevista: string | null
          data_fim_real: string | null
          data_inicio: string | null
          dias_restantes: number | null
          duracao_dias: number | null
          elegivel_renovacao: boolean | null
          id: string | null
          indicacao_id: string | null
          indicador_nome: string | null
          nivel_alerta: string | null
          observacoes: string | null
          parceiro_cpf: string | null
          parceiro_id: string | null
          parceiro_nome: string | null
          status: string | null
          user_id: string | null
          valor_comissao_indicador: number | null
        }
        Relationships: [
          {
            foreignKeyName: "parcerias_indicacao_id_fkey"
            columns: ["indicacao_id"]
            isOneToOne: false
            referencedRelation: "indicacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcerias_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcerias_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_contas"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "parcerias_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_wallets"
            referencedColumns: ["parceiro_id"]
          },
        ]
      }
      v_roi_investidores: {
        Row: {
          aportes_crypto_usd: number | null
          aportes_fiat_brl: number | null
          aportes_fiat_usd: number | null
          cpf: string | null
          investidor_id: string | null
          liquidacoes_crypto_usd: number | null
          liquidacoes_fiat_brl: number | null
          liquidacoes_fiat_usd: number | null
          nome: string | null
          status: string | null
          user_id: string | null
        }
        Relationships: []
      }
      v_saldo_caixa_crypto: {
        Row: {
          coin: string | null
          saldo_coin: number | null
          saldo_usd: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_saldo_caixa_fiat: {
        Row: {
          moeda: string | null
          saldo: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_saldo_parceiro_contas: {
        Row: {
          banco: string | null
          conta_id: string | null
          moeda: string | null
          parceiro_id: string | null
          parceiro_nome: string | null
          saldo: number | null
          titular: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parceiros_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_saldo_parceiro_wallets: {
        Row: {
          coin: string | null
          endereco: string | null
          exchange: string | null
          parceiro_id: string | null
          parceiro_nome: string | null
          saldo_coin: number | null
          saldo_usd: number | null
          user_id: string | null
          wallet_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parceiros_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      is_master: { Args: { _user_id: string }; Returns: boolean }
      update_parcerias_em_encerramento: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "master" | "user"
      indicador_status: "ATIVO" | "TOP_VIP" | "EM_OBSERVACAO" | "INATIVO"
      parceria_status: "ATIVA" | "EM_ENCERRAMENTO" | "ENCERRADA" | "RENOVADA"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["master", "user"],
      indicador_status: ["ATIVO", "TOP_VIP", "EM_OBSERVACAO", "INATIVO"],
      parceria_status: ["ATIVA", "EM_ENCERRAMENTO", "ENCERRADA", "RENOVADA"],
    },
  },
} as const
