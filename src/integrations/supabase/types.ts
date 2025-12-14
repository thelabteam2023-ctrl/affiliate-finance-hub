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
      apostas: {
        Row: {
          aposta_relacionada_id: string | null
          back_comissao: number | null
          back_em_exchange: boolean | null
          bookmaker_id: string
          created_at: string
          data_aposta: string
          esporte: string
          estrategia: string | null
          evento: string
          gerou_freebet: boolean | null
          id: string
          lay_comissao: number | null
          lay_exchange: string | null
          lay_liability: number | null
          lay_odd: number | null
          lay_stake: number | null
          lucro_prejuizo: number | null
          mercado: string | null
          modo_entrada: string
          observacoes: string | null
          odd: number
          projeto_id: string
          resultado: string | null
          selecao: string
          stake: number
          status: string
          surebet_id: string | null
          tipo_freebet: string | null
          updated_at: string
          user_id: string
          valor_freebet_gerada: number | null
          valor_retorno: number | null
        }
        Insert: {
          aposta_relacionada_id?: string | null
          back_comissao?: number | null
          back_em_exchange?: boolean | null
          bookmaker_id: string
          created_at?: string
          data_aposta?: string
          esporte: string
          estrategia?: string | null
          evento: string
          gerou_freebet?: boolean | null
          id?: string
          lay_comissao?: number | null
          lay_exchange?: string | null
          lay_liability?: number | null
          lay_odd?: number | null
          lay_stake?: number | null
          lucro_prejuizo?: number | null
          mercado?: string | null
          modo_entrada?: string
          observacoes?: string | null
          odd: number
          projeto_id: string
          resultado?: string | null
          selecao: string
          stake: number
          status?: string
          surebet_id?: string | null
          tipo_freebet?: string | null
          updated_at?: string
          user_id: string
          valor_freebet_gerada?: number | null
          valor_retorno?: number | null
        }
        Update: {
          aposta_relacionada_id?: string | null
          back_comissao?: number | null
          back_em_exchange?: boolean | null
          bookmaker_id?: string
          created_at?: string
          data_aposta?: string
          esporte?: string
          estrategia?: string | null
          evento?: string
          gerou_freebet?: boolean | null
          id?: string
          lay_comissao?: number | null
          lay_exchange?: string | null
          lay_liability?: number | null
          lay_odd?: number | null
          lay_stake?: number | null
          lucro_prejuizo?: number | null
          mercado?: string | null
          modo_entrada?: string
          observacoes?: string | null
          odd?: number
          projeto_id?: string
          resultado?: string | null
          selecao?: string
          stake?: number
          status?: string
          surebet_id?: string | null
          tipo_freebet?: string | null
          updated_at?: string
          user_id?: string
          valor_freebet_gerada?: number | null
          valor_retorno?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "apostas_aposta_relacionada_id_fkey"
            columns: ["aposta_relacionada_id"]
            isOneToOne: false
            referencedRelation: "apostas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apostas_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "bookmakers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apostas_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_disponibilidade"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apostas_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_saldo_disponivel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apostas_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_aguardando_saque"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "apostas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apostas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_apostas_resumo"
            referencedColumns: ["projeto_id"]
          },
          {
            foreignKeyName: "apostas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["projeto_id"]
          },
          {
            foreignKeyName: "apostas_surebet_id_fkey"
            columns: ["surebet_id"]
            isOneToOne: false
            referencedRelation: "surebets"
            referencedColumns: ["id"]
          },
        ]
      }
      apostas_multiplas: {
        Row: {
          bookmaker_id: string
          created_at: string
          data_aposta: string
          gerou_freebet: boolean | null
          id: string
          lucro_prejuizo: number | null
          observacoes: string | null
          odd_final: number
          projeto_id: string
          resultado: string | null
          retorno_potencial: number | null
          selecoes: Json
          stake: number
          status: string
          tipo_freebet: string | null
          tipo_multipla: string
          updated_at: string
          user_id: string
          valor_freebet_gerada: number | null
          valor_retorno: number | null
        }
        Insert: {
          bookmaker_id: string
          created_at?: string
          data_aposta?: string
          gerou_freebet?: boolean | null
          id?: string
          lucro_prejuizo?: number | null
          observacoes?: string | null
          odd_final: number
          projeto_id: string
          resultado?: string | null
          retorno_potencial?: number | null
          selecoes?: Json
          stake: number
          status?: string
          tipo_freebet?: string | null
          tipo_multipla?: string
          updated_at?: string
          user_id: string
          valor_freebet_gerada?: number | null
          valor_retorno?: number | null
        }
        Update: {
          bookmaker_id?: string
          created_at?: string
          data_aposta?: string
          gerou_freebet?: boolean | null
          id?: string
          lucro_prejuizo?: number | null
          observacoes?: string | null
          odd_final?: number
          projeto_id?: string
          resultado?: string | null
          retorno_potencial?: number | null
          selecoes?: Json
          stake?: number
          status?: string
          tipo_freebet?: string | null
          tipo_multipla?: string
          updated_at?: string
          user_id?: string
          valor_freebet_gerada?: number | null
          valor_retorno?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "apostas_multiplas_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "bookmakers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apostas_multiplas_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_disponibilidade"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apostas_multiplas_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_saldo_disponivel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apostas_multiplas_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_aguardando_saque"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "apostas_multiplas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apostas_multiplas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_apostas_resumo"
            referencedColumns: ["projeto_id"]
          },
          {
            foreignKeyName: "apostas_multiplas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["projeto_id"]
          },
        ]
      }
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
          projeto_id: string | null
          saldo_atual: number
          saldo_freebet: number
          saldo_irrecuperavel: number
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
          projeto_id?: string | null
          saldo_atual?: number
          saldo_freebet?: number
          saldo_irrecuperavel?: number
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
          projeto_id?: string | null
          saldo_atual?: number
          saldo_freebet?: number
          saldo_irrecuperavel?: number
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
            referencedRelation: "v_parceiro_lucro_total"
            referencedColumns: ["parceiro_id"]
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
            foreignKeyName: "bookmakers_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmakers_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_apostas_resumo"
            referencedColumns: ["projeto_id"]
          },
          {
            foreignKeyName: "bookmakers_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["projeto_id"]
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
          operador_id: string | null
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
          operador_id?: string | null
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
          operador_id?: string | null
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
            foreignKeyName: "cash_ledger_destino_bookmaker_id_fkey"
            columns: ["destino_bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_disponibilidade"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_destino_bookmaker_id_fkey"
            columns: ["destino_bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_saldo_disponivel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_destino_bookmaker_id_fkey"
            columns: ["destino_bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_aguardando_saque"
            referencedColumns: ["bookmaker_id"]
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
            referencedRelation: "v_parceiro_lucro_total"
            referencedColumns: ["parceiro_id"]
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
            foreignKeyName: "cash_ledger_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "operadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "v_operador_comparativo"
            referencedColumns: ["operador_id"]
          },
          {
            foreignKeyName: "cash_ledger_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "v_operador_performance"
            referencedColumns: ["operador_id"]
          },
          {
            foreignKeyName: "cash_ledger_origem_bookmaker_id_fkey"
            columns: ["origem_bookmaker_id"]
            isOneToOne: false
            referencedRelation: "bookmakers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_origem_bookmaker_id_fkey"
            columns: ["origem_bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_disponibilidade"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_origem_bookmaker_id_fkey"
            columns: ["origem_bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_saldo_disponivel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_origem_bookmaker_id_fkey"
            columns: ["origem_bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_aguardando_saque"
            referencedColumns: ["bookmaker_id"]
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
            referencedRelation: "v_parceiro_lucro_total"
            referencedColumns: ["parceiro_id"]
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
            referencedRelation: "v_parceiro_lucro_total"
            referencedColumns: ["parceiro_id"]
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
      despesas_administrativas: {
        Row: {
          categoria: string
          coin: string | null
          cotacao: number | null
          created_at: string
          data_despesa: string
          descricao: string | null
          id: string
          origem_caixa_operacional: boolean | null
          origem_conta_bancaria_id: string | null
          origem_parceiro_id: string | null
          origem_tipo: string | null
          origem_wallet_id: string | null
          qtd_coin: number | null
          recorrente: boolean | null
          status: string
          tipo_moeda: string | null
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          categoria: string
          coin?: string | null
          cotacao?: number | null
          created_at?: string
          data_despesa?: string
          descricao?: string | null
          id?: string
          origem_caixa_operacional?: boolean | null
          origem_conta_bancaria_id?: string | null
          origem_parceiro_id?: string | null
          origem_tipo?: string | null
          origem_wallet_id?: string | null
          qtd_coin?: number | null
          recorrente?: boolean | null
          status?: string
          tipo_moeda?: string | null
          updated_at?: string
          user_id: string
          valor: number
        }
        Update: {
          categoria?: string
          coin?: string | null
          cotacao?: number | null
          created_at?: string
          data_despesa?: string
          descricao?: string | null
          id?: string
          origem_caixa_operacional?: boolean | null
          origem_conta_bancaria_id?: string | null
          origem_parceiro_id?: string | null
          origem_tipo?: string | null
          origem_wallet_id?: string | null
          qtd_coin?: number | null
          recorrente?: boolean | null
          status?: string
          tipo_moeda?: string | null
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "despesas_administrativas_origem_conta_bancaria_id_fkey"
            columns: ["origem_conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_administrativas_origem_conta_bancaria_id_fkey"
            columns: ["origem_conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_contas"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "despesas_administrativas_origem_parceiro_id_fkey"
            columns: ["origem_parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_administrativas_origem_parceiro_id_fkey"
            columns: ["origem_parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_parceiro_lucro_total"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "despesas_administrativas_origem_parceiro_id_fkey"
            columns: ["origem_parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_contas"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "despesas_administrativas_origem_parceiro_id_fkey"
            columns: ["origem_parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_wallets"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "despesas_administrativas_origem_wallet_id_fkey"
            columns: ["origem_wallet_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_wallets"
            referencedColumns: ["wallet_id"]
          },
          {
            foreignKeyName: "despesas_administrativas_origem_wallet_id_fkey"
            columns: ["origem_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets_crypto"
            referencedColumns: ["id"]
          },
        ]
      }
      entregas: {
        Row: {
          ajuste: number | null
          base_calculo: string | null
          conciliado: boolean | null
          created_at: string | null
          data_conciliacao: string | null
          data_fim_prevista: string | null
          data_fim_real: string | null
          data_inicio: string
          data_pagamento: string | null
          descricao: string | null
          excedente_proximo: number | null
          id: string
          meta_percentual: number | null
          meta_valor: number | null
          numero_entrega: number
          observacoes_conciliacao: string | null
          operador_projeto_id: string
          pagamento_realizado: boolean | null
          resultado_nominal: number | null
          resultado_real: number | null
          saldo_inicial: number | null
          status: string
          tipo_ajuste: string | null
          tipo_gatilho: string
          tipo_meta: string | null
          updated_at: string | null
          user_id: string
          valor_pagamento_operador: number | null
        }
        Insert: {
          ajuste?: number | null
          base_calculo?: string | null
          conciliado?: boolean | null
          created_at?: string | null
          data_conciliacao?: string | null
          data_fim_prevista?: string | null
          data_fim_real?: string | null
          data_inicio?: string
          data_pagamento?: string | null
          descricao?: string | null
          excedente_proximo?: number | null
          id?: string
          meta_percentual?: number | null
          meta_valor?: number | null
          numero_entrega?: number
          observacoes_conciliacao?: string | null
          operador_projeto_id: string
          pagamento_realizado?: boolean | null
          resultado_nominal?: number | null
          resultado_real?: number | null
          saldo_inicial?: number | null
          status?: string
          tipo_ajuste?: string | null
          tipo_gatilho?: string
          tipo_meta?: string | null
          updated_at?: string | null
          user_id: string
          valor_pagamento_operador?: number | null
        }
        Update: {
          ajuste?: number | null
          base_calculo?: string | null
          conciliado?: boolean | null
          created_at?: string | null
          data_conciliacao?: string | null
          data_fim_prevista?: string | null
          data_fim_real?: string | null
          data_inicio?: string
          data_pagamento?: string | null
          descricao?: string | null
          excedente_proximo?: number | null
          id?: string
          meta_percentual?: number | null
          meta_valor?: number | null
          numero_entrega?: number
          observacoes_conciliacao?: string | null
          operador_projeto_id?: string
          pagamento_realizado?: boolean | null
          resultado_nominal?: number | null
          resultado_real?: number | null
          saldo_inicial?: number | null
          status?: string
          tipo_ajuste?: string | null
          tipo_gatilho?: string
          tipo_meta?: string | null
          updated_at?: string | null
          user_id?: string
          valor_pagamento_operador?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "entregas_operador_projeto_id_fkey"
            columns: ["operador_projeto_id"]
            isOneToOne: false
            referencedRelation: "operador_projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entregas_operador_projeto_id_fkey"
            columns: ["operador_projeto_id"]
            isOneToOne: false
            referencedRelation: "v_operadores_sem_entrega"
            referencedColumns: ["operador_projeto_id"]
          },
          {
            foreignKeyName: "entregas_operador_projeto_id_fkey"
            columns: ["operador_projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_lucro_operador"
            referencedColumns: ["operador_projeto_id"]
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
      freebets_recebidas: {
        Row: {
          aposta_id: string | null
          aposta_multipla_id: string | null
          bookmaker_id: string
          created_at: string
          data_recebida: string
          data_utilizacao: string | null
          id: string
          motivo: string
          observacoes: string | null
          projeto_id: string
          status: string
          updated_at: string
          user_id: string
          utilizada: boolean | null
          valor: number
        }
        Insert: {
          aposta_id?: string | null
          aposta_multipla_id?: string | null
          bookmaker_id: string
          created_at?: string
          data_recebida?: string
          data_utilizacao?: string | null
          id?: string
          motivo: string
          observacoes?: string | null
          projeto_id: string
          status?: string
          updated_at?: string
          user_id: string
          utilizada?: boolean | null
          valor: number
        }
        Update: {
          aposta_id?: string | null
          aposta_multipla_id?: string | null
          bookmaker_id?: string
          created_at?: string
          data_recebida?: string
          data_utilizacao?: string | null
          id?: string
          motivo?: string
          observacoes?: string | null
          projeto_id?: string
          status?: string
          updated_at?: string
          user_id?: string
          utilizada?: boolean | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "freebets_recebidas_aposta_id_fkey"
            columns: ["aposta_id"]
            isOneToOne: false
            referencedRelation: "apostas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freebets_recebidas_aposta_multipla_id_fkey"
            columns: ["aposta_multipla_id"]
            isOneToOne: false
            referencedRelation: "apostas_multiplas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freebets_recebidas_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "bookmakers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freebets_recebidas_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_disponibilidade"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freebets_recebidas_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_saldo_disponivel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freebets_recebidas_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_aguardando_saque"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "freebets_recebidas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freebets_recebidas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_apostas_resumo"
            referencedColumns: ["projeto_id"]
          },
          {
            foreignKeyName: "freebets_recebidas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["projeto_id"]
          },
        ]
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
            referencedRelation: "v_parceiro_lucro_total"
            referencedColumns: ["parceiro_id"]
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
          projeto_id: string | null
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
          projeto_id?: string | null
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
          projeto_id?: string | null
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
          {
            foreignKeyName: "investidor_deals_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investidor_deals_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_apostas_resumo"
            referencedColumns: ["projeto_id"]
          },
          {
            foreignKeyName: "investidor_deals_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["projeto_id"]
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
      matched_betting_pernas: {
        Row: {
          bookmaker_id: string
          comissao_exchange: number | null
          created_at: string
          id: string
          is_free_bet: boolean
          liability: number | null
          lucro_prejuizo: number | null
          odd: number
          resultado: string | null
          retorno: number | null
          round_id: string
          selecao: string
          stake: number
          status: string
          tipo_aposta: string
        }
        Insert: {
          bookmaker_id: string
          comissao_exchange?: number | null
          created_at?: string
          id?: string
          is_free_bet?: boolean
          liability?: number | null
          lucro_prejuizo?: number | null
          odd: number
          resultado?: string | null
          retorno?: number | null
          round_id: string
          selecao: string
          stake: number
          status?: string
          tipo_aposta: string
        }
        Update: {
          bookmaker_id?: string
          comissao_exchange?: number | null
          created_at?: string
          id?: string
          is_free_bet?: boolean
          liability?: number | null
          lucro_prejuizo?: number | null
          odd?: number
          resultado?: string | null
          retorno?: number | null
          round_id?: string
          selecao?: string
          stake?: number
          status?: string
          tipo_aposta?: string
        }
        Relationships: [
          {
            foreignKeyName: "matched_betting_pernas_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "bookmakers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matched_betting_pernas_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_disponibilidade"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matched_betting_pernas_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_saldo_disponivel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matched_betting_pernas_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_aguardando_saque"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "matched_betting_pernas_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "matched_betting_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      matched_betting_promocoes: {
        Row: {
          bookmaker_catalogo_id: string | null
          created_at: string
          data_expiracao: string | null
          id: string
          nome: string
          observacoes: string | null
          odd_minima: number | null
          rollover: number | null
          stake_returned: boolean
          status: string
          tipo: string
          updated_at: string
          user_id: string
          valor_bonus: number
          valor_minimo_aposta: number | null
        }
        Insert: {
          bookmaker_catalogo_id?: string | null
          created_at?: string
          data_expiracao?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          odd_minima?: number | null
          rollover?: number | null
          stake_returned?: boolean
          status?: string
          tipo?: string
          updated_at?: string
          user_id: string
          valor_bonus: number
          valor_minimo_aposta?: number | null
        }
        Update: {
          bookmaker_catalogo_id?: string | null
          created_at?: string
          data_expiracao?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          odd_minima?: number | null
          rollover?: number | null
          stake_returned?: boolean
          status?: string
          tipo?: string
          updated_at?: string
          user_id?: string
          valor_bonus?: number
          valor_minimo_aposta?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "matched_betting_promocoes_bookmaker_catalogo_id_fkey"
            columns: ["bookmaker_catalogo_id"]
            isOneToOne: false
            referencedRelation: "bookmakers_catalogo"
            referencedColumns: ["id"]
          },
        ]
      }
      matched_betting_rounds: {
        Row: {
          created_at: string
          data_evento: string
          esporte: string
          evento: string
          id: string
          lucro_esperado: number | null
          lucro_real: number | null
          mercado: string
          observacoes: string | null
          projeto_id: string
          promocao_id: string | null
          status: string
          tipo_round: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data_evento: string
          esporte: string
          evento: string
          id?: string
          lucro_esperado?: number | null
          lucro_real?: number | null
          mercado: string
          observacoes?: string | null
          projeto_id: string
          promocao_id?: string | null
          status?: string
          tipo_round?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data_evento?: string
          esporte?: string
          evento?: string
          id?: string
          lucro_esperado?: number | null
          lucro_real?: number | null
          mercado?: string
          observacoes?: string | null
          projeto_id?: string
          promocao_id?: string | null
          status?: string
          tipo_round?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matched_betting_rounds_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matched_betting_rounds_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_apostas_resumo"
            referencedColumns: ["projeto_id"]
          },
          {
            foreignKeyName: "matched_betting_rounds_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["projeto_id"]
          },
          {
            foreignKeyName: "matched_betting_rounds_promocao_id_fkey"
            columns: ["promocao_id"]
            isOneToOne: false
            referencedRelation: "matched_betting_promocoes"
            referencedColumns: ["id"]
          },
        ]
      }
      movimentacoes_indicacao: {
        Row: {
          coin: string | null
          cotacao: number | null
          created_at: string | null
          data_movimentacao: string | null
          descricao: string | null
          id: string
          indicador_id: string | null
          moeda: string
          origem_caixa_operacional: boolean | null
          origem_conta_bancaria_id: string | null
          origem_parceiro_id: string | null
          origem_tipo: string | null
          origem_wallet_id: string | null
          parceria_id: string
          qtd_coin: number | null
          status: string
          tipo: string
          tipo_moeda: string | null
          user_id: string
          valor: number
        }
        Insert: {
          coin?: string | null
          cotacao?: number | null
          created_at?: string | null
          data_movimentacao?: string | null
          descricao?: string | null
          id?: string
          indicador_id?: string | null
          moeda?: string
          origem_caixa_operacional?: boolean | null
          origem_conta_bancaria_id?: string | null
          origem_parceiro_id?: string | null
          origem_tipo?: string | null
          origem_wallet_id?: string | null
          parceria_id: string
          qtd_coin?: number | null
          status?: string
          tipo: string
          tipo_moeda?: string | null
          user_id: string
          valor: number
        }
        Update: {
          coin?: string | null
          cotacao?: number | null
          created_at?: string | null
          data_movimentacao?: string | null
          descricao?: string | null
          id?: string
          indicador_id?: string | null
          moeda?: string
          origem_caixa_operacional?: boolean | null
          origem_conta_bancaria_id?: string | null
          origem_parceiro_id?: string | null
          origem_tipo?: string | null
          origem_wallet_id?: string | null
          parceria_id?: string
          qtd_coin?: number | null
          status?: string
          tipo?: string
          tipo_moeda?: string | null
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
            foreignKeyName: "movimentacoes_indicacao_origem_conta_bancaria_id_fkey"
            columns: ["origem_conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_indicacao_origem_conta_bancaria_id_fkey"
            columns: ["origem_conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_contas"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "movimentacoes_indicacao_origem_parceiro_id_fkey"
            columns: ["origem_parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_indicacao_origem_parceiro_id_fkey"
            columns: ["origem_parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_parceiro_lucro_total"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "movimentacoes_indicacao_origem_parceiro_id_fkey"
            columns: ["origem_parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_contas"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "movimentacoes_indicacao_origem_parceiro_id_fkey"
            columns: ["origem_parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_wallets"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "movimentacoes_indicacao_origem_wallet_id_fkey"
            columns: ["origem_wallet_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_wallets"
            referencedColumns: ["wallet_id"]
          },
          {
            foreignKeyName: "movimentacoes_indicacao_origem_wallet_id_fkey"
            columns: ["origem_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets_crypto"
            referencedColumns: ["id"]
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
            referencedRelation: "v_alertas_parcerias"
            referencedColumns: ["parceria_id"]
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
      operador_projetos: {
        Row: {
          base_calculo: string | null
          created_at: string
          data_entrada: string
          data_saida: string | null
          faixas_escalonadas: Json | null
          frequencia_conciliacao: string | null
          funcao: string | null
          id: string
          meta_percentual: number | null
          meta_valor: number | null
          meta_volume: number | null
          modelo_pagamento: string
          motivo_saida: string | null
          observacoes: string | null
          operador_id: string
          percentual: number | null
          piso_pagamento: number | null
          prejuizo_acumulado: number | null
          projeto_id: string
          regra_prejuizo: string | null
          resumo_acordo: string | null
          status: string
          teto_pagamento: number | null
          tipo_meta: string | null
          updated_at: string
          user_id: string
          valor_fixo: number | null
        }
        Insert: {
          base_calculo?: string | null
          created_at?: string
          data_entrada?: string
          data_saida?: string | null
          faixas_escalonadas?: Json | null
          frequencia_conciliacao?: string | null
          funcao?: string | null
          id?: string
          meta_percentual?: number | null
          meta_valor?: number | null
          meta_volume?: number | null
          modelo_pagamento?: string
          motivo_saida?: string | null
          observacoes?: string | null
          operador_id: string
          percentual?: number | null
          piso_pagamento?: number | null
          prejuizo_acumulado?: number | null
          projeto_id: string
          regra_prejuizo?: string | null
          resumo_acordo?: string | null
          status?: string
          teto_pagamento?: number | null
          tipo_meta?: string | null
          updated_at?: string
          user_id: string
          valor_fixo?: number | null
        }
        Update: {
          base_calculo?: string | null
          created_at?: string
          data_entrada?: string
          data_saida?: string | null
          faixas_escalonadas?: Json | null
          frequencia_conciliacao?: string | null
          funcao?: string | null
          id?: string
          meta_percentual?: number | null
          meta_valor?: number | null
          meta_volume?: number | null
          modelo_pagamento?: string
          motivo_saida?: string | null
          observacoes?: string | null
          operador_id?: string
          percentual?: number | null
          piso_pagamento?: number | null
          prejuizo_acumulado?: number | null
          projeto_id?: string
          regra_prejuizo?: string | null
          resumo_acordo?: string | null
          status?: string
          teto_pagamento?: number | null
          tipo_meta?: string | null
          updated_at?: string
          user_id?: string
          valor_fixo?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "operador_projetos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "operadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operador_projetos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "v_operador_comparativo"
            referencedColumns: ["operador_id"]
          },
          {
            foreignKeyName: "operador_projetos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "v_operador_performance"
            referencedColumns: ["operador_id"]
          },
          {
            foreignKeyName: "operador_projetos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operador_projetos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_apostas_resumo"
            referencedColumns: ["projeto_id"]
          },
          {
            foreignKeyName: "operador_projetos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["projeto_id"]
          },
        ]
      }
      operadores: {
        Row: {
          cpf: string
          created_at: string
          data_admissao: string
          data_desligamento: string | null
          data_nascimento: string | null
          email: string | null
          id: string
          nome: string
          observacoes: string | null
          status: string
          telefone: string | null
          tipo_contrato: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cpf: string
          created_at?: string
          data_admissao?: string
          data_desligamento?: string | null
          data_nascimento?: string | null
          email?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          status?: string
          telefone?: string | null
          tipo_contrato?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cpf?: string
          created_at?: string
          data_admissao?: string
          data_desligamento?: string | null
          data_nascimento?: string | null
          email?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          status?: string
          telefone?: string | null
          tipo_contrato?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pagamentos_operador: {
        Row: {
          cash_ledger_id: string | null
          created_at: string
          data_competencia: string | null
          data_pagamento: string
          descricao: string | null
          id: string
          moeda: string
          operador_id: string
          projeto_id: string | null
          status: string
          tipo_pagamento: string
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          cash_ledger_id?: string | null
          created_at?: string
          data_competencia?: string | null
          data_pagamento?: string
          descricao?: string | null
          id?: string
          moeda?: string
          operador_id: string
          projeto_id?: string | null
          status?: string
          tipo_pagamento?: string
          updated_at?: string
          user_id: string
          valor: number
        }
        Update: {
          cash_ledger_id?: string | null
          created_at?: string
          data_competencia?: string | null
          data_pagamento?: string
          descricao?: string | null
          id?: string
          moeda?: string
          operador_id?: string
          projeto_id?: string | null
          status?: string
          tipo_pagamento?: string
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_operador_cash_ledger_id_fkey"
            columns: ["cash_ledger_id"]
            isOneToOne: false
            referencedRelation: "cash_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_operador_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "operadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_operador_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "v_operador_comparativo"
            referencedColumns: ["operador_id"]
          },
          {
            foreignKeyName: "pagamentos_operador_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "v_operador_performance"
            referencedColumns: ["operador_id"]
          },
          {
            foreignKeyName: "pagamentos_operador_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_operador_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_apostas_resumo"
            referencedColumns: ["projeto_id"]
          },
          {
            foreignKeyName: "pagamentos_operador_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["projeto_id"]
          },
        ]
      }
      pagamentos_propostos: {
        Row: {
          aprovado_por: string | null
          base_calculo: string | null
          ciclo_id: string | null
          created_at: string | null
          data_aprovacao: string | null
          data_proposta: string | null
          desconto_prejuizo_anterior: number | null
          id: string
          lucro_base: number
          meta_volume_atingida: number | null
          metrica_acumuladora: string | null
          modelo_pagamento: string
          motivo_rejeicao: string | null
          observacoes: string | null
          operador_id: string
          operador_projeto_id: string
          pagamento_id: string | null
          percentual_aplicado: number | null
          projeto_id: string
          status: string
          tipo_gatilho: string | null
          updated_at: string | null
          user_id: string
          valor_ajustado: number | null
          valor_calculado: number
          valor_fixo_aplicado: number | null
        }
        Insert: {
          aprovado_por?: string | null
          base_calculo?: string | null
          ciclo_id?: string | null
          created_at?: string | null
          data_aprovacao?: string | null
          data_proposta?: string | null
          desconto_prejuizo_anterior?: number | null
          id?: string
          lucro_base?: number
          meta_volume_atingida?: number | null
          metrica_acumuladora?: string | null
          modelo_pagamento: string
          motivo_rejeicao?: string | null
          observacoes?: string | null
          operador_id: string
          operador_projeto_id: string
          pagamento_id?: string | null
          percentual_aplicado?: number | null
          projeto_id: string
          status?: string
          tipo_gatilho?: string | null
          updated_at?: string | null
          user_id: string
          valor_ajustado?: number | null
          valor_calculado?: number
          valor_fixo_aplicado?: number | null
        }
        Update: {
          aprovado_por?: string | null
          base_calculo?: string | null
          ciclo_id?: string | null
          created_at?: string | null
          data_aprovacao?: string | null
          data_proposta?: string | null
          desconto_prejuizo_anterior?: number | null
          id?: string
          lucro_base?: number
          meta_volume_atingida?: number | null
          metrica_acumuladora?: string | null
          modelo_pagamento?: string
          motivo_rejeicao?: string | null
          observacoes?: string | null
          operador_id?: string
          operador_projeto_id?: string
          pagamento_id?: string | null
          percentual_aplicado?: number | null
          projeto_id?: string
          status?: string
          tipo_gatilho?: string | null
          updated_at?: string | null
          user_id?: string
          valor_ajustado?: number | null
          valor_calculado?: number
          valor_fixo_aplicado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_propostos_ciclo_id_fkey"
            columns: ["ciclo_id"]
            isOneToOne: false
            referencedRelation: "projeto_ciclos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_propostos_ciclo_id_fkey"
            columns: ["ciclo_id"]
            isOneToOne: false
            referencedRelation: "v_ciclos_proximos_fechamento"
            referencedColumns: ["ciclo_id"]
          },
          {
            foreignKeyName: "pagamentos_propostos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "operadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_propostos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "v_operador_comparativo"
            referencedColumns: ["operador_id"]
          },
          {
            foreignKeyName: "pagamentos_propostos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "v_operador_performance"
            referencedColumns: ["operador_id"]
          },
          {
            foreignKeyName: "pagamentos_propostos_operador_projeto_id_fkey"
            columns: ["operador_projeto_id"]
            isOneToOne: false
            referencedRelation: "operador_projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_propostos_operador_projeto_id_fkey"
            columns: ["operador_projeto_id"]
            isOneToOne: false
            referencedRelation: "v_operadores_sem_entrega"
            referencedColumns: ["operador_projeto_id"]
          },
          {
            foreignKeyName: "pagamentos_propostos_operador_projeto_id_fkey"
            columns: ["operador_projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_lucro_operador"
            referencedColumns: ["operador_projeto_id"]
          },
          {
            foreignKeyName: "pagamentos_propostos_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "pagamentos_operador"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_propostos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_propostos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_apostas_resumo"
            referencedColumns: ["projeto_id"]
          },
          {
            foreignKeyName: "pagamentos_propostos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["projeto_id"]
          },
        ]
      }
      parceiro_lucro_alertas: {
        Row: {
          created_at: string
          data_atingido: string
          id: string
          lucro_atual: number
          marco_valor: number
          notificado: boolean | null
          parceiro_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data_atingido?: string
          id?: string
          lucro_atual: number
          marco_valor: number
          notificado?: boolean | null
          parceiro_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          data_atingido?: string
          id?: string
          lucro_atual?: number
          marco_valor?: number
          notificado?: boolean | null
          parceiro_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parceiro_lucro_alertas_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiro_lucro_alertas_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_parceiro_lucro_total"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "parceiro_lucro_alertas_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_contas"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "parceiro_lucro_alertas_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_wallets"
            referencedColumns: ["parceiro_id"]
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
          custo_aquisicao_isento: boolean | null
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
          custo_aquisicao_isento?: boolean | null
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
          custo_aquisicao_isento?: boolean | null
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
            referencedRelation: "v_parceiro_lucro_total"
            referencedColumns: ["parceiro_id"]
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
      projeto_acordos: {
        Row: {
          ativo: boolean
          base_calculo: string
          created_at: string
          deduzir_custos_operador: boolean
          id: string
          investidor_id: string | null
          observacoes: string | null
          percentual_empresa: number
          percentual_investidor: number
          percentual_prejuizo_investidor: number | null
          projeto_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          base_calculo?: string
          created_at?: string
          deduzir_custos_operador?: boolean
          id?: string
          investidor_id?: string | null
          observacoes?: string | null
          percentual_empresa?: number
          percentual_investidor?: number
          percentual_prejuizo_investidor?: number | null
          projeto_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          base_calculo?: string
          created_at?: string
          deduzir_custos_operador?: boolean
          id?: string
          investidor_id?: string | null
          observacoes?: string | null
          percentual_empresa?: number
          percentual_investidor?: number
          percentual_prejuizo_investidor?: number | null
          projeto_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projeto_acordos_investidor_id_fkey"
            columns: ["investidor_id"]
            isOneToOne: false
            referencedRelation: "investidores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projeto_acordos_investidor_id_fkey"
            columns: ["investidor_id"]
            isOneToOne: false
            referencedRelation: "v_roi_investidores"
            referencedColumns: ["investidor_id"]
          },
          {
            foreignKeyName: "projeto_acordos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projeto_acordos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_apostas_resumo"
            referencedColumns: ["projeto_id"]
          },
          {
            foreignKeyName: "projeto_acordos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["projeto_id"]
          },
        ]
      }
      projeto_bookmaker_historico: {
        Row: {
          bookmaker_id: string
          bookmaker_nome: string
          created_at: string
          data_desvinculacao: string | null
          data_vinculacao: string
          id: string
          parceiro_id: string | null
          parceiro_nome: string | null
          projeto_id: string
          status_final: string | null
          user_id: string
        }
        Insert: {
          bookmaker_id: string
          bookmaker_nome: string
          created_at?: string
          data_desvinculacao?: string | null
          data_vinculacao?: string
          id?: string
          parceiro_id?: string | null
          parceiro_nome?: string | null
          projeto_id: string
          status_final?: string | null
          user_id: string
        }
        Update: {
          bookmaker_id?: string
          bookmaker_nome?: string
          created_at?: string
          data_desvinculacao?: string | null
          data_vinculacao?: string
          id?: string
          parceiro_id?: string | null
          parceiro_nome?: string | null
          projeto_id?: string
          status_final?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projeto_bookmaker_historico_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "bookmakers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projeto_bookmaker_historico_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_disponibilidade"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projeto_bookmaker_historico_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_saldo_disponivel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projeto_bookmaker_historico_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_aguardando_saque"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "projeto_bookmaker_historico_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projeto_bookmaker_historico_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_parceiro_lucro_total"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "projeto_bookmaker_historico_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_contas"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "projeto_bookmaker_historico_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_wallets"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "projeto_bookmaker_historico_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projeto_bookmaker_historico_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_apostas_resumo"
            referencedColumns: ["projeto_id"]
          },
          {
            foreignKeyName: "projeto_bookmaker_historico_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["projeto_id"]
          },
        ]
      }
      projeto_ciclos: {
        Row: {
          created_at: string | null
          data_aprovacao: string | null
          data_fechamento: string | null
          data_fim_prevista: string
          data_fim_real: string | null
          data_inicio: string
          excedente_anterior: number
          excedente_proximo: number
          gatilho_fechamento: string | null
          id: string
          lucro_bruto: number | null
          lucro_liquido: number | null
          meta_volume: number | null
          metrica_acumuladora: string | null
          numero_ciclo: number
          observacoes: string | null
          operador_projeto_id: string | null
          pagamento_aprovado: boolean | null
          projeto_id: string
          status: string
          tipo_gatilho: string
          updated_at: string | null
          user_id: string
          valor_acumulado: number
          valor_pagamento_calculado: number | null
        }
        Insert: {
          created_at?: string | null
          data_aprovacao?: string | null
          data_fechamento?: string | null
          data_fim_prevista: string
          data_fim_real?: string | null
          data_inicio: string
          excedente_anterior?: number
          excedente_proximo?: number
          gatilho_fechamento?: string | null
          id?: string
          lucro_bruto?: number | null
          lucro_liquido?: number | null
          meta_volume?: number | null
          metrica_acumuladora?: string | null
          numero_ciclo?: number
          observacoes?: string | null
          operador_projeto_id?: string | null
          pagamento_aprovado?: boolean | null
          projeto_id: string
          status?: string
          tipo_gatilho?: string
          updated_at?: string | null
          user_id: string
          valor_acumulado?: number
          valor_pagamento_calculado?: number | null
        }
        Update: {
          created_at?: string | null
          data_aprovacao?: string | null
          data_fechamento?: string | null
          data_fim_prevista?: string
          data_fim_real?: string | null
          data_inicio?: string
          excedente_anterior?: number
          excedente_proximo?: number
          gatilho_fechamento?: string | null
          id?: string
          lucro_bruto?: number | null
          lucro_liquido?: number | null
          meta_volume?: number | null
          metrica_acumuladora?: string | null
          numero_ciclo?: number
          observacoes?: string | null
          operador_projeto_id?: string | null
          pagamento_aprovado?: boolean | null
          projeto_id?: string
          status?: string
          tipo_gatilho?: string
          updated_at?: string | null
          user_id?: string
          valor_acumulado?: number
          valor_pagamento_calculado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "projeto_ciclos_operador_projeto_id_fkey"
            columns: ["operador_projeto_id"]
            isOneToOne: false
            referencedRelation: "operador_projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projeto_ciclos_operador_projeto_id_fkey"
            columns: ["operador_projeto_id"]
            isOneToOne: false
            referencedRelation: "v_operadores_sem_entrega"
            referencedColumns: ["operador_projeto_id"]
          },
          {
            foreignKeyName: "projeto_ciclos_operador_projeto_id_fkey"
            columns: ["operador_projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_lucro_operador"
            referencedColumns: ["operador_projeto_id"]
          },
          {
            foreignKeyName: "projeto_ciclos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projeto_ciclos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_apostas_resumo"
            referencedColumns: ["projeto_id"]
          },
          {
            foreignKeyName: "projeto_ciclos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["projeto_id"]
          },
        ]
      }
      projeto_conciliacoes: {
        Row: {
          ajuste_crypto_usd: number
          ajuste_fiat: number
          created_at: string
          data_conciliacao: string
          descricao: string | null
          id: string
          motivo_perda: string | null
          observacoes: string | null
          perdas_confirmadas: number
          projeto_id: string
          saldo_nominal_crypto_usd: number
          saldo_nominal_fiat: number
          saldo_real_crypto_usd: number
          saldo_real_fiat: number
          tipo_ajuste: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ajuste_crypto_usd?: number
          ajuste_fiat?: number
          created_at?: string
          data_conciliacao?: string
          descricao?: string | null
          id?: string
          motivo_perda?: string | null
          observacoes?: string | null
          perdas_confirmadas?: number
          projeto_id: string
          saldo_nominal_crypto_usd?: number
          saldo_nominal_fiat?: number
          saldo_real_crypto_usd?: number
          saldo_real_fiat?: number
          tipo_ajuste?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ajuste_crypto_usd?: number
          ajuste_fiat?: number
          created_at?: string
          data_conciliacao?: string
          descricao?: string | null
          id?: string
          motivo_perda?: string | null
          observacoes?: string | null
          perdas_confirmadas?: number
          projeto_id?: string
          saldo_nominal_crypto_usd?: number
          saldo_nominal_fiat?: number
          saldo_real_crypto_usd?: number
          saldo_real_fiat?: number
          tipo_ajuste?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projeto_conciliacoes_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projeto_conciliacoes_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_apostas_resumo"
            referencedColumns: ["projeto_id"]
          },
          {
            foreignKeyName: "projeto_conciliacoes_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["projeto_id"]
          },
        ]
      }
      projeto_perdas: {
        Row: {
          bookmaker_id: string | null
          categoria: string
          created_at: string
          data_registro: string
          descricao: string | null
          id: string
          projeto_id: string
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          bookmaker_id?: string | null
          categoria: string
          created_at?: string
          data_registro?: string
          descricao?: string | null
          id?: string
          projeto_id: string
          updated_at?: string
          user_id: string
          valor: number
        }
        Update: {
          bookmaker_id?: string | null
          categoria?: string
          created_at?: string
          data_registro?: string
          descricao?: string | null
          id?: string
          projeto_id?: string
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "projeto_perdas_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "bookmakers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projeto_perdas_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_disponibilidade"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projeto_perdas_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_saldo_disponivel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projeto_perdas_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_aguardando_saque"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "projeto_perdas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projeto_perdas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_apostas_resumo"
            referencedColumns: ["projeto_id"]
          },
          {
            foreignKeyName: "projeto_perdas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["projeto_id"]
          },
        ]
      }
      projetos: {
        Row: {
          conciliado: boolean
          created_at: string
          data_fim_prevista: string | null
          data_fim_real: string | null
          data_inicio: string | null
          descricao: string | null
          id: string
          investidor_id: string | null
          modelo_absorcao_taxas: string
          nome: string
          observacoes: string | null
          orcamento_inicial: number | null
          status: string
          tem_investimento_crypto: boolean
          tipo_projeto: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          conciliado?: boolean
          created_at?: string
          data_fim_prevista?: string | null
          data_fim_real?: string | null
          data_inicio?: string | null
          descricao?: string | null
          id?: string
          investidor_id?: string | null
          modelo_absorcao_taxas?: string
          nome: string
          observacoes?: string | null
          orcamento_inicial?: number | null
          status?: string
          tem_investimento_crypto?: boolean
          tipo_projeto?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          conciliado?: boolean
          created_at?: string
          data_fim_prevista?: string | null
          data_fim_real?: string | null
          data_inicio?: string | null
          descricao?: string | null
          id?: string
          investidor_id?: string | null
          modelo_absorcao_taxas?: string
          nome?: string
          observacoes?: string | null
          orcamento_inicial?: number | null
          status?: string
          tem_investimento_crypto?: boolean
          tipo_projeto?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projetos_investidor_id_fkey"
            columns: ["investidor_id"]
            isOneToOne: false
            referencedRelation: "investidores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projetos_investidor_id_fkey"
            columns: ["investidor_id"]
            isOneToOne: false
            referencedRelation: "v_roi_investidores"
            referencedColumns: ["investidor_id"]
          },
        ]
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
      surebets: {
        Row: {
          created_at: string
          data_operacao: string
          esporte: string
          evento: string
          id: string
          lucro_esperado: number | null
          lucro_real: number | null
          mercado: string | null
          modelo: string
          observacoes: string | null
          projeto_id: string
          resultado: string | null
          roi_esperado: number | null
          roi_real: number | null
          spread_calculado: number | null
          stake_total: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data_operacao?: string
          esporte: string
          evento: string
          id?: string
          lucro_esperado?: number | null
          lucro_real?: number | null
          mercado?: string | null
          modelo?: string
          observacoes?: string | null
          projeto_id: string
          resultado?: string | null
          roi_esperado?: number | null
          roi_real?: number | null
          spread_calculado?: number | null
          stake_total?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data_operacao?: string
          esporte?: string
          evento?: string
          id?: string
          lucro_esperado?: number | null
          lucro_real?: number | null
          mercado?: string | null
          modelo?: string
          observacoes?: string | null
          projeto_id?: string
          resultado?: string | null
          roi_esperado?: number | null
          roi_real?: number | null
          spread_calculado?: number | null
          stake_total?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "surebets_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surebets_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_apostas_resumo"
            referencedColumns: ["projeto_id"]
          },
          {
            foreignKeyName: "surebets_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["projeto_id"]
          },
        ]
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
          {
            foreignKeyName: "transacoes_bookmakers_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_disponibilidade"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_bookmakers_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_saldo_disponivel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_bookmakers_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_aguardando_saque"
            referencedColumns: ["bookmaker_id"]
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
            referencedRelation: "v_parceiro_lucro_total"
            referencedColumns: ["parceiro_id"]
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
      v_alertas_parcerias: {
        Row: {
          data_fim_prevista: string | null
          data_inicio: string | null
          dias_restantes: number | null
          duracao_dias: number | null
          nivel_urgencia: string | null
          parceiro_nome: string | null
          parceria_id: string | null
          status: string | null
          user_id: string | null
        }
        Relationships: []
      }
      v_bookmaker_disponibilidade: {
        Row: {
          bookmaker_status: string | null
          disponibilidade: string | null
          id: string | null
          nome: string | null
          parceiro_id: string | null
          parceiro_nome: string | null
          projeto_id: string | null
          projeto_nome: string | null
          projeto_status: string | null
          saldo_atual: number | null
          user_id: string | null
        }
        Relationships: [
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
            referencedRelation: "v_parceiro_lucro_total"
            referencedColumns: ["parceiro_id"]
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
            foreignKeyName: "bookmakers_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmakers_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_apostas_resumo"
            referencedColumns: ["projeto_id"]
          },
          {
            foreignKeyName: "bookmakers_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["projeto_id"]
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
      v_bookmaker_saldo_disponivel: {
        Row: {
          apostas_pendentes: number | null
          id: string | null
          moeda: string | null
          nome: string | null
          parceiro_id: string | null
          projeto_id: string | null
          saldo_disponivel: number | null
          saldo_total: number | null
          stake_bloqueada: number | null
          status: string | null
          user_id: string | null
        }
        Relationships: [
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
            referencedRelation: "v_parceiro_lucro_total"
            referencedColumns: ["parceiro_id"]
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
            foreignKeyName: "bookmakers_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmakers_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_apostas_resumo"
            referencedColumns: ["projeto_id"]
          },
          {
            foreignKeyName: "bookmakers_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["projeto_id"]
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
      v_bookmakers_aguardando_saque: {
        Row: {
          bookmaker_id: string | null
          bookmaker_nome: string | null
          data_liberacao: string | null
          moeda: string | null
          parceiro_id: string | null
          parceiro_nome: string | null
          projeto_id: string | null
          projeto_nome: string | null
          saldo_atual: number | null
          status: string | null
          user_id: string | null
        }
        Relationships: [
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
            referencedRelation: "v_parceiro_lucro_total"
            referencedColumns: ["parceiro_id"]
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
            foreignKeyName: "bookmakers_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmakers_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_apostas_resumo"
            referencedColumns: ["projeto_id"]
          },
          {
            foreignKeyName: "bookmakers_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["projeto_id"]
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
      v_ciclos_proximos_fechamento: {
        Row: {
          alerta: string | null
          ciclo_id: string | null
          data_fim_prevista: string | null
          data_fim_real: string | null
          data_inicio: string | null
          dias_restantes: number | null
          excedente_anterior: number | null
          meta_volume: number | null
          operador_id: string | null
          operador_nome: string | null
          operador_projeto_id: string | null
          percentual_volume_atingido: number | null
          projeto_id: string | null
          projeto_nome: string | null
          status: string | null
          tipo_gatilho: string | null
          user_id: string | null
          valor_acumulado: number | null
        }
        Relationships: [
          {
            foreignKeyName: "operador_projetos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "operadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operador_projetos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "v_operador_comparativo"
            referencedColumns: ["operador_id"]
          },
          {
            foreignKeyName: "operador_projetos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "v_operador_performance"
            referencedColumns: ["operador_id"]
          },
          {
            foreignKeyName: "projeto_ciclos_operador_projeto_id_fkey"
            columns: ["operador_projeto_id"]
            isOneToOne: false
            referencedRelation: "operador_projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projeto_ciclos_operador_projeto_id_fkey"
            columns: ["operador_projeto_id"]
            isOneToOne: false
            referencedRelation: "v_operadores_sem_entrega"
            referencedColumns: ["operador_projeto_id"]
          },
          {
            foreignKeyName: "projeto_ciclos_operador_projeto_id_fkey"
            columns: ["operador_projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_lucro_operador"
            referencedColumns: ["operador_projeto_id"]
          },
          {
            foreignKeyName: "projeto_ciclos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projeto_ciclos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_apostas_resumo"
            referencedColumns: ["projeto_id"]
          },
          {
            foreignKeyName: "projeto_ciclos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["projeto_id"]
          },
        ]
      }
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
            referencedRelation: "v_parceiro_lucro_total"
            referencedColumns: ["parceiro_id"]
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
      v_entregas_pendentes: {
        Row: {
          base_calculo: string | null
          created_at: string | null
          data_fim_prevista: string | null
          data_inicio: string | null
          descricao: string | null
          id: string | null
          meta_percentual: number | null
          meta_valor: number | null
          modelo_pagamento: string | null
          nivel_urgencia: string | null
          numero_entrega: number | null
          operador_id: string | null
          operador_nome: string | null
          operador_projeto_id: string | null
          percentual: number | null
          projeto_id: string | null
          projeto_nome: string | null
          resultado_nominal: number | null
          saldo_inicial: number | null
          status: string | null
          status_conciliacao: string | null
          tipo_gatilho: string | null
          tipo_meta: string | null
          user_id: string | null
          valor_fixo: number | null
        }
        Relationships: [
          {
            foreignKeyName: "entregas_operador_projeto_id_fkey"
            columns: ["operador_projeto_id"]
            isOneToOne: false
            referencedRelation: "operador_projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entregas_operador_projeto_id_fkey"
            columns: ["operador_projeto_id"]
            isOneToOne: false
            referencedRelation: "v_operadores_sem_entrega"
            referencedColumns: ["operador_projeto_id"]
          },
          {
            foreignKeyName: "entregas_operador_projeto_id_fkey"
            columns: ["operador_projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_lucro_operador"
            referencedColumns: ["operador_projeto_id"]
          },
          {
            foreignKeyName: "operador_projetos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "operadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operador_projetos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "v_operador_comparativo"
            referencedColumns: ["operador_id"]
          },
          {
            foreignKeyName: "operador_projetos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "v_operador_performance"
            referencedColumns: ["operador_id"]
          },
          {
            foreignKeyName: "operador_projetos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operador_projetos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_apostas_resumo"
            referencedColumns: ["projeto_id"]
          },
          {
            foreignKeyName: "operador_projetos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["projeto_id"]
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
        Insert: {
          cpf?: string | null
          email?: string | null
          indicador_id?: string | null
          nome?: string | null
          parcerias_ativas?: never
          parcerias_encerradas?: never
          status?: string | null
          telefone?: string | null
          total_bonus?: never
          total_comissoes?: never
          total_parceiros_indicados?: never
          user_id?: string | null
        }
        Update: {
          cpf?: string | null
          email?: string | null
          indicador_id?: string | null
          nome?: string | null
          parcerias_ativas?: never
          parcerias_encerradas?: never
          status?: string | null
          telefone?: string | null
          total_bonus?: never
          total_comissoes?: never
          total_parceiros_indicados?: never
          user_id?: string | null
        }
        Relationships: []
      }
      v_matched_betting_resumo: {
        Row: {
          free_bets: number | null
          lucro_medio: number | null
          lucro_total: number | null
          projeto_id: string | null
          qualifying_bets: number | null
          rounds_concluidos: number | null
          taxa_sucesso: number | null
          total_rounds: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matched_betting_rounds_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matched_betting_rounds_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_apostas_resumo"
            referencedColumns: ["projeto_id"]
          },
          {
            foreignKeyName: "matched_betting_rounds_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["projeto_id"]
          },
        ]
      }
      v_operador_comparativo: {
        Row: {
          apostas_ganhas: number | null
          cpf: string | null
          lucro_total_gerado: number | null
          nome: string | null
          operador_id: string | null
          projetos_ativos: number | null
          status: string | null
          tipo_contrato: string | null
          total_apostas: number | null
          total_pago: number | null
          total_pendente: number | null
          user_id: string | null
          volume_total: number | null
        }
        Insert: {
          apostas_ganhas?: never
          cpf?: string | null
          lucro_total_gerado?: never
          nome?: string | null
          operador_id?: string | null
          projetos_ativos?: never
          status?: string | null
          tipo_contrato?: string | null
          total_apostas?: never
          total_pago?: never
          total_pendente?: never
          user_id?: string | null
          volume_total?: never
        }
        Update: {
          apostas_ganhas?: never
          cpf?: string | null
          lucro_total_gerado?: never
          nome?: string | null
          operador_id?: string | null
          projetos_ativos?: never
          status?: string | null
          tipo_contrato?: string | null
          total_apostas?: never
          total_pago?: never
          total_pendente?: never
          user_id?: string | null
          volume_total?: never
        }
        Relationships: []
      }
      v_operador_performance: {
        Row: {
          cpf: string | null
          data_admissao: string | null
          nome: string | null
          operador_id: string | null
          projetos_ativos: number | null
          status: string | null
          tipo_contrato: string | null
          total_pago: number | null
          total_pendente: number | null
          total_projetos: number | null
          user_id: string | null
        }
        Insert: {
          cpf?: string | null
          data_admissao?: string | null
          nome?: string | null
          operador_id?: string | null
          projetos_ativos?: never
          status?: string | null
          tipo_contrato?: string | null
          total_pago?: never
          total_pendente?: never
          total_projetos?: never
          user_id?: string | null
        }
        Update: {
          cpf?: string | null
          data_admissao?: string | null
          nome?: string | null
          operador_id?: string | null
          projetos_ativos?: never
          status?: string | null
          tipo_contrato?: string | null
          total_pago?: never
          total_pendente?: never
          total_projetos?: never
          user_id?: string | null
        }
        Relationships: []
      }
      v_operadores_sem_entrega: {
        Row: {
          modelo_pagamento: string | null
          operador_id: string | null
          operador_nome: string | null
          operador_projeto_id: string | null
          projeto_id: string | null
          projeto_nome: string | null
          status: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operador_projetos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "operadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operador_projetos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "v_operador_comparativo"
            referencedColumns: ["operador_id"]
          },
          {
            foreignKeyName: "operador_projetos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "v_operador_performance"
            referencedColumns: ["operador_id"]
          },
          {
            foreignKeyName: "operador_projetos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operador_projetos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_apostas_resumo"
            referencedColumns: ["projeto_id"]
          },
          {
            foreignKeyName: "operador_projetos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["projeto_id"]
          },
        ]
      }
      v_painel_operacional: {
        Row: {
          created_at: string | null
          data_limite: string | null
          descricao: string | null
          entidade_id: string | null
          entidade_tipo: string | null
          moeda: string | null
          nivel_urgencia: string | null
          ordem_urgencia: number | null
          parceiro_id: string | null
          parceiro_nome: string | null
          projeto_id: string | null
          projeto_nome: string | null
          status_anterior: string | null
          tipo_alerta: string | null
          titulo: string | null
          user_id: string | null
          valor: number | null
        }
        Relationships: []
      }
      v_parceiro_lucro_total: {
        Row: {
          cpf: string | null
          lucro_fluxo_caixa: number | null
          lucro_projetos: number | null
          nome: string | null
          parceiro_id: string | null
          saldo_bookmakers: number | null
          status: string | null
          total_depositado: number | null
          total_sacado: number | null
          user_id: string | null
        }
        Insert: {
          cpf?: string | null
          lucro_fluxo_caixa?: never
          lucro_projetos?: never
          nome?: string | null
          parceiro_id?: string | null
          saldo_bookmakers?: never
          status?: string | null
          total_depositado?: never
          total_sacado?: never
          user_id?: string | null
        }
        Update: {
          cpf?: string | null
          lucro_fluxo_caixa?: never
          lucro_projetos?: never
          nome?: string | null
          parceiro_id?: string | null
          saldo_bookmakers?: never
          status?: string | null
          total_depositado?: never
          total_sacado?: never
          user_id?: string | null
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
            referencedRelation: "v_parceiro_lucro_total"
            referencedColumns: ["parceiro_id"]
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
      v_projeto_apostas_resumo: {
        Row: {
          apostas_pendentes: number | null
          greens: number | null
          lucro_total: number | null
          meio_greens: number | null
          meio_reds: number | null
          projeto_id: string | null
          reds: number | null
          roi_percentual: number | null
          total_apostas: number | null
          total_stake: number | null
          voids: number | null
        }
        Relationships: []
      }
      v_projeto_lucro_operador: {
        Row: {
          apostas_ganhas: number | null
          base_calculo: string | null
          faixas_escalonadas: Json | null
          faturamento_projeto: number | null
          frequencia_entrega: string | null
          lucro_projeto: number | null
          meta_percentual: number | null
          meta_valor: number | null
          modelo_pagamento: string | null
          operador_id: string | null
          operador_nome: string | null
          operador_projeto_id: string | null
          percentual: number | null
          projeto_id: string | null
          projeto_nome: string | null
          status: string | null
          tipo_meta: string | null
          total_apostas: number | null
          total_depositado: number | null
          total_sacado: number | null
          user_id: string | null
          valor_fixo: number | null
        }
        Relationships: [
          {
            foreignKeyName: "operador_projetos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "operadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operador_projetos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "v_operador_comparativo"
            referencedColumns: ["operador_id"]
          },
          {
            foreignKeyName: "operador_projetos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "v_operador_performance"
            referencedColumns: ["operador_id"]
          },
          {
            foreignKeyName: "operador_projetos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operador_projetos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_apostas_resumo"
            referencedColumns: ["projeto_id"]
          },
          {
            foreignKeyName: "operador_projetos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "v_projeto_resumo"
            referencedColumns: ["projeto_id"]
          },
        ]
      }
      v_projeto_resumo: {
        Row: {
          conciliado: boolean | null
          data_fim_prevista: string | null
          data_fim_real: string | null
          data_inicio: string | null
          descricao: string | null
          nome: string | null
          operadores_ativos: number | null
          orcamento_inicial: number | null
          perdas_confirmadas: number | null
          projeto_id: string | null
          saldo_bookmakers: number | null
          saldo_irrecuperavel: number | null
          status: string | null
          tem_investimento_crypto: boolean | null
          total_bookmakers: number | null
          total_depositado: number | null
          total_gasto_operadores: number | null
          total_sacado: number | null
          user_id: string | null
        }
        Insert: {
          conciliado?: boolean | null
          data_fim_prevista?: string | null
          data_fim_real?: string | null
          data_inicio?: string | null
          descricao?: string | null
          nome?: string | null
          operadores_ativos?: never
          orcamento_inicial?: number | null
          perdas_confirmadas?: never
          projeto_id?: string | null
          saldo_bookmakers?: never
          saldo_irrecuperavel?: never
          status?: string | null
          tem_investimento_crypto?: boolean | null
          total_bookmakers?: never
          total_depositado?: never
          total_gasto_operadores?: never
          total_sacado?: never
          user_id?: string | null
        }
        Update: {
          conciliado?: boolean | null
          data_fim_prevista?: string | null
          data_fim_real?: string | null
          data_inicio?: string | null
          descricao?: string | null
          nome?: string | null
          operadores_ativos?: never
          orcamento_inicial?: number | null
          perdas_confirmadas?: never
          projeto_id?: string | null
          saldo_bookmakers?: never
          saldo_irrecuperavel?: never
          status?: string | null
          tem_investimento_crypto?: boolean | null
          total_bookmakers?: never
          total_depositado?: never
          total_gasto_operadores?: never
          total_sacado?: never
          user_id?: string | null
        }
        Relationships: []
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
