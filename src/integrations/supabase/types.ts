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
      access_group_audit_log: {
        Row: {
          action: string
          actor_user_id: string
          affected_bookmakers: string[] | null
          affected_workspaces: string[] | null
          created_at: string
          details: Json | null
          group_id: string
          id: string
        }
        Insert: {
          action: string
          actor_user_id: string
          affected_bookmakers?: string[] | null
          affected_workspaces?: string[] | null
          created_at?: string
          details?: Json | null
          group_id: string
          id?: string
        }
        Update: {
          action?: string
          actor_user_id?: string
          affected_bookmakers?: string[] | null
          affected_workspaces?: string[] | null
          created_at?: string
          details?: Json | null
          group_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_group_audit_log_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "access_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      access_group_bookmakers: {
        Row: {
          added_at: string
          added_by: string | null
          bookmaker_catalogo_id: string
          group_id: string
          id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          bookmaker_catalogo_id: string
          group_id: string
          id?: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          bookmaker_catalogo_id?: string
          group_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_group_bookmakers_bookmaker_catalogo_id_fkey"
            columns: ["bookmaker_catalogo_id"]
            isOneToOne: false
            referencedRelation: "bookmakers_catalogo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_group_bookmakers_bookmaker_catalogo_id_fkey"
            columns: ["bookmaker_catalogo_id"]
            isOneToOne: false
            referencedRelation: "v_community_bookmaker_stats"
            referencedColumns: ["bookmaker_catalogo_id"]
          },
          {
            foreignKeyName: "access_group_bookmakers_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "access_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      access_group_workspaces: {
        Row: {
          added_at: string
          added_by: string | null
          group_id: string
          id: string
          workspace_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          group_id: string
          id?: string
          workspace_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          group_id?: string
          id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_group_workspaces_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "access_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_group_workspaces_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      access_groups: {
        Row: {
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      anotacoes_livres: {
        Row: {
          conteudo: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          conteudo?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          conteudo?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "anotacoes_livres_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      apostas_pernas: {
        Row: {
          aposta_id: string
          bookmaker_id: string
          cotacao_snapshot: number | null
          cotacao_snapshot_at: string | null
          created_at: string | null
          fonte_saldo: string | null
          gerou_freebet: boolean | null
          id: string
          lucro_prejuizo: number | null
          lucro_prejuizo_brl_referencia: number | null
          moeda: string
          odd: number
          ordem: number
          resultado: string | null
          selecao: string
          selecao_livre: string | null
          stake: number
          stake_brl_referencia: number | null
          updated_at: string | null
          valor_freebet_gerada: number | null
        }
        Insert: {
          aposta_id: string
          bookmaker_id: string
          cotacao_snapshot?: number | null
          cotacao_snapshot_at?: string | null
          created_at?: string | null
          fonte_saldo?: string | null
          gerou_freebet?: boolean | null
          id?: string
          lucro_prejuizo?: number | null
          lucro_prejuizo_brl_referencia?: number | null
          moeda?: string
          odd: number
          ordem?: number
          resultado?: string | null
          selecao: string
          selecao_livre?: string | null
          stake: number
          stake_brl_referencia?: number | null
          updated_at?: string | null
          valor_freebet_gerada?: number | null
        }
        Update: {
          aposta_id?: string
          bookmaker_id?: string
          cotacao_snapshot?: number | null
          cotacao_snapshot_at?: string | null
          created_at?: string | null
          fonte_saldo?: string | null
          gerou_freebet?: boolean | null
          id?: string
          lucro_prejuizo?: number | null
          lucro_prejuizo_brl_referencia?: number | null
          moeda?: string
          odd?: number
          ordem?: number
          resultado?: string | null
          selecao?: string
          selecao_livre?: string | null
          stake?: number
          stake_brl_referencia?: number | null
          updated_at?: string | null
          valor_freebet_gerada?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "apostas_pernas_aposta_id_fkey"
            columns: ["aposta_id"]
            isOneToOne: false
            referencedRelation: "apostas_unificada"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apostas_pernas_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "bookmakers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apostas_pernas_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_disponibilidade"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apostas_pernas_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_resultado_operacional"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "apostas_pernas_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_saldo_operavel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apostas_pernas_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_status_operacional"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apostas_pernas_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_aguardando_saque"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "apostas_pernas_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_desvinculados"
            referencedColumns: ["id"]
          },
        ]
      }
      apostas_unificada: {
        Row: {
          aposta_relacionada_id: string | null
          back_comissao: number | null
          back_em_exchange: boolean | null
          bonus_id: string | null
          bookmaker_id: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          consolidation_currency: string | null
          contexto_operacional: string
          conversion_rate_used: number | null
          conversion_source: string | null
          cotacao_snapshot: number | null
          cotacao_snapshot_at: string | null
          created_at: string
          data_aposta: string
          esporte: string | null
          estrategia: string
          evento: string | null
          fonte_saldo: string | null
          forma_registro: string
          gerou_freebet: boolean | null
          id: string
          is_bonus_bet: boolean | null
          is_multicurrency: boolean | null
          lado_aposta: string | null
          lay_comissao: number | null
          lay_exchange: string | null
          lay_liability: number | null
          lay_odd: number | null
          lay_stake: number | null
          legacy_id: string | null
          legacy_table: string | null
          lucro_esperado: number | null
          lucro_prejuizo: number | null
          lucro_prejuizo_brl_referencia: number | null
          mercado: string | null
          modelo: string | null
          modo_entrada: string | null
          moeda_operacao: string | null
          observacoes: string | null
          odd: number | null
          odd_final: number | null
          pernas: Json | null
          pl_consolidado: number | null
          projeto_id: string
          resultado: string | null
          retorno_consolidado: number | null
          retorno_potencial: number | null
          roi_esperado: number | null
          roi_real: number | null
          selecao: string | null
          selecoes: Json | null
          spread_calculado: number | null
          stake: number | null
          stake_bonus: number | null
          stake_consolidado: number | null
          stake_real: number | null
          stake_total: number | null
          status: string
          surebet_legado_id: string | null
          tipo_freebet: string | null
          tipo_multipla: string | null
          updated_at: string
          usar_freebet: boolean | null
          user_id: string
          valor_brl_referencia: number | null
          valor_freebet_gerada: number | null
          valor_retorno: number | null
          workspace_id: string
        }
        Insert: {
          aposta_relacionada_id?: string | null
          back_comissao?: number | null
          back_em_exchange?: boolean | null
          bonus_id?: string | null
          bookmaker_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          consolidation_currency?: string | null
          contexto_operacional?: string
          conversion_rate_used?: number | null
          conversion_source?: string | null
          cotacao_snapshot?: number | null
          cotacao_snapshot_at?: string | null
          created_at?: string
          data_aposta?: string
          esporte?: string | null
          estrategia?: string
          evento?: string | null
          fonte_saldo?: string | null
          forma_registro?: string
          gerou_freebet?: boolean | null
          id?: string
          is_bonus_bet?: boolean | null
          is_multicurrency?: boolean | null
          lado_aposta?: string | null
          lay_comissao?: number | null
          lay_exchange?: string | null
          lay_liability?: number | null
          lay_odd?: number | null
          lay_stake?: number | null
          legacy_id?: string | null
          legacy_table?: string | null
          lucro_esperado?: number | null
          lucro_prejuizo?: number | null
          lucro_prejuizo_brl_referencia?: number | null
          mercado?: string | null
          modelo?: string | null
          modo_entrada?: string | null
          moeda_operacao?: string | null
          observacoes?: string | null
          odd?: number | null
          odd_final?: number | null
          pernas?: Json | null
          pl_consolidado?: number | null
          projeto_id: string
          resultado?: string | null
          retorno_consolidado?: number | null
          retorno_potencial?: number | null
          roi_esperado?: number | null
          roi_real?: number | null
          selecao?: string | null
          selecoes?: Json | null
          spread_calculado?: number | null
          stake?: number | null
          stake_bonus?: number | null
          stake_consolidado?: number | null
          stake_real?: number | null
          stake_total?: number | null
          status?: string
          surebet_legado_id?: string | null
          tipo_freebet?: string | null
          tipo_multipla?: string | null
          updated_at?: string
          usar_freebet?: boolean | null
          user_id: string
          valor_brl_referencia?: number | null
          valor_freebet_gerada?: number | null
          valor_retorno?: number | null
          workspace_id: string
        }
        Update: {
          aposta_relacionada_id?: string | null
          back_comissao?: number | null
          back_em_exchange?: boolean | null
          bonus_id?: string | null
          bookmaker_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          consolidation_currency?: string | null
          contexto_operacional?: string
          conversion_rate_used?: number | null
          conversion_source?: string | null
          cotacao_snapshot?: number | null
          cotacao_snapshot_at?: string | null
          created_at?: string
          data_aposta?: string
          esporte?: string | null
          estrategia?: string
          evento?: string | null
          fonte_saldo?: string | null
          forma_registro?: string
          gerou_freebet?: boolean | null
          id?: string
          is_bonus_bet?: boolean | null
          is_multicurrency?: boolean | null
          lado_aposta?: string | null
          lay_comissao?: number | null
          lay_exchange?: string | null
          lay_liability?: number | null
          lay_odd?: number | null
          lay_stake?: number | null
          legacy_id?: string | null
          legacy_table?: string | null
          lucro_esperado?: number | null
          lucro_prejuizo?: number | null
          lucro_prejuizo_brl_referencia?: number | null
          mercado?: string | null
          modelo?: string | null
          modo_entrada?: string | null
          moeda_operacao?: string | null
          observacoes?: string | null
          odd?: number | null
          odd_final?: number | null
          pernas?: Json | null
          pl_consolidado?: number | null
          projeto_id?: string
          resultado?: string | null
          retorno_consolidado?: number | null
          retorno_potencial?: number | null
          roi_esperado?: number | null
          roi_real?: number | null
          selecao?: string | null
          selecoes?: Json | null
          spread_calculado?: number | null
          stake?: number | null
          stake_bonus?: number | null
          stake_consolidado?: number | null
          stake_real?: number | null
          stake_total?: number | null
          status?: string
          surebet_legado_id?: string | null
          tipo_freebet?: string | null
          tipo_multipla?: string | null
          updated_at?: string
          usar_freebet?: boolean | null
          user_id?: string
          valor_brl_referencia?: number | null
          valor_freebet_gerada?: number | null
          valor_retorno?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "apostas_unificada_aposta_relacionada_id_fkey"
            columns: ["aposta_relacionada_id"]
            isOneToOne: false
            referencedRelation: "apostas_unificada"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apostas_unificada_bonus_id_fkey"
            columns: ["bonus_id"]
            isOneToOne: false
            referencedRelation: "project_bookmaker_link_bonuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apostas_unificada_bonus_id_fkey"
            columns: ["bonus_id"]
            isOneToOne: false
            referencedRelation: "v_bonus_historico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apostas_unificada_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "bookmakers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apostas_unificada_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_disponibilidade"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apostas_unificada_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_resultado_operacional"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "apostas_unificada_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_saldo_operavel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apostas_unificada_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_status_operacional"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apostas_unificada_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_aguardando_saque"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "apostas_unificada_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_desvinculados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apostas_unificada_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apostas_unificada_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_user_id: string
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string | null
          entity_name: string | null
          entity_type: string
          id: string
          ip_address: unknown
          metadata: Json | null
          user_agent: string | null
          workspace_id: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_user_id: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_name?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          user_agent?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          actor_user_id?: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          user_agent?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
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
      billing_events: {
        Row: {
          amount: number | null
          created_at: string
          currency: string | null
          error_message: string | null
          event_type: string
          id: string
          payload: Json | null
          processed: boolean | null
          processed_at: string | null
          provider: string | null
          provider_event_id: string | null
          subscription_id: string | null
          workspace_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          provider?: string | null
          provider_event_id?: string | null
          subscription_id?: string | null
          workspace_id: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          provider?: string | null
          provider_event_id?: string | null
          subscription_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "workspace_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      bookmaker_balance_audit: {
        Row: {
          bookmaker_id: string
          created_at: string
          diferenca: number | null
          id: string
          observacoes: string | null
          origem: string
          referencia_id: string | null
          referencia_tipo: string | null
          saldo_anterior: number
          saldo_novo: number
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          bookmaker_id: string
          created_at?: string
          diferenca?: number | null
          id?: string
          observacoes?: string | null
          origem: string
          referencia_id?: string | null
          referencia_tipo?: string | null
          saldo_anterior: number
          saldo_novo: number
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          bookmaker_id?: string
          created_at?: string
          diferenca?: number | null
          id?: string
          observacoes?: string | null
          origem?: string
          referencia_id?: string | null
          referencia_tipo?: string | null
          saldo_anterior?: number
          saldo_novo?: number
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmaker_balance_audit_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "bookmakers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmaker_balance_audit_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_disponibilidade"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmaker_balance_audit_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_resultado_operacional"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "bookmaker_balance_audit_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_saldo_operavel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmaker_balance_audit_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_status_operacional"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmaker_balance_audit_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_aguardando_saque"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "bookmaker_balance_audit_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_desvinculados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmaker_balance_audit_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      bookmaker_stake_reservations: {
        Row: {
          bookmaker_id: string
          created_at: string
          expires_at: string
          form_session_id: string
          form_type: string
          id: string
          moeda: string
          stake: number
          status: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          bookmaker_id: string
          created_at?: string
          expires_at?: string
          form_session_id: string
          form_type: string
          id?: string
          moeda?: string
          stake: number
          status?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          bookmaker_id?: string
          created_at?: string
          expires_at?: string
          form_session_id?: string
          form_type?: string
          id?: string
          moeda?: string
          stake?: number
          status?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmaker_stake_reservations_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "bookmakers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmaker_stake_reservations_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_disponibilidade"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmaker_stake_reservations_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_resultado_operacional"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "bookmaker_stake_reservations_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_saldo_operavel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmaker_stake_reservations_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_status_operacional"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmaker_stake_reservations_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_aguardando_saque"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "bookmaker_stake_reservations_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_desvinculados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmaker_stake_reservations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      bookmaker_unlinked_acks: {
        Row: {
          acknowledged_at: string
          acknowledged_by: string
          bookmaker_id: string
          id: string
          reason: string | null
          workspace_id: string
        }
        Insert: {
          acknowledged_at?: string
          acknowledged_by: string
          bookmaker_id: string
          id?: string
          reason?: string | null
          workspace_id: string
        }
        Update: {
          acknowledged_at?: string
          acknowledged_by?: string
          bookmaker_id?: string
          id?: string
          reason?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmaker_unlinked_acks_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "bookmakers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmaker_unlinked_acks_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_disponibilidade"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmaker_unlinked_acks_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_resultado_operacional"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "bookmaker_unlinked_acks_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_saldo_operavel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmaker_unlinked_acks_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_status_operacional"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmaker_unlinked_acks_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_aguardando_saque"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "bookmaker_unlinked_acks_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_desvinculados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmaker_unlinked_acks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      bookmaker_workspace_access: {
        Row: {
          bookmaker_catalogo_id: string
          granted_at: string
          granted_by: string | null
          id: string
          workspace_id: string
        }
        Insert: {
          bookmaker_catalogo_id: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          workspace_id: string
        }
        Update: {
          bookmaker_catalogo_id?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmaker_workspace_access_bookmaker_catalogo_id_fkey"
            columns: ["bookmaker_catalogo_id"]
            isOneToOne: false
            referencedRelation: "bookmakers_catalogo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmaker_workspace_access_bookmaker_catalogo_id_fkey"
            columns: ["bookmaker_catalogo_id"]
            isOneToOne: false
            referencedRelation: "v_community_bookmaker_stats"
            referencedColumns: ["bookmaker_catalogo_id"]
          },
          {
            foreignKeyName: "bookmaker_workspace_access_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      bookmakers: {
        Row: {
          aguardando_saque_at: string | null
          bookmaker_catalogo_id: string | null
          created_at: string
          estado_conta: string | null
          id: string
          instance_identifier: string | null
          link_origem: string | null
          login_password_encrypted: string
          login_username: string
          moeda: string
          nome: string
          observacoes: string | null
          parceiro_id: string | null
          projeto_id: string | null
          saldo_atual: number
          saldo_bonus: number | null
          saldo_freebet: number
          saldo_irrecuperavel: number
          saldo_usd: number
          status: string
          status_pre_bloqueio: string | null
          updated_at: string
          url: string | null
          user_id: string
          version: number | null
          workspace_id: string
        }
        Insert: {
          aguardando_saque_at?: string | null
          bookmaker_catalogo_id?: string | null
          created_at?: string
          estado_conta?: string | null
          id?: string
          instance_identifier?: string | null
          link_origem?: string | null
          login_password_encrypted: string
          login_username: string
          moeda?: string
          nome: string
          observacoes?: string | null
          parceiro_id?: string | null
          projeto_id?: string | null
          saldo_atual?: number
          saldo_bonus?: number | null
          saldo_freebet?: number
          saldo_irrecuperavel?: number
          saldo_usd?: number
          status?: string
          status_pre_bloqueio?: string | null
          updated_at?: string
          url?: string | null
          user_id: string
          version?: number | null
          workspace_id: string
        }
        Update: {
          aguardando_saque_at?: string | null
          bookmaker_catalogo_id?: string | null
          created_at?: string
          estado_conta?: string | null
          id?: string
          instance_identifier?: string | null
          link_origem?: string | null
          login_password_encrypted?: string
          login_username?: string
          moeda?: string
          nome?: string
          observacoes?: string | null
          parceiro_id?: string | null
          projeto_id?: string | null
          saldo_atual?: number
          saldo_bonus?: number | null
          saldo_freebet?: number
          saldo_irrecuperavel?: number
          saldo_usd?: number
          status?: string
          status_pre_bloqueio?: string | null
          updated_at?: string
          url?: string | null
          user_id?: string
          version?: number | null
          workspace_id?: string
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
            foreignKeyName: "bookmakers_bookmaker_catalogo_id_fkey"
            columns: ["bookmaker_catalogo_id"]
            isOneToOne: false
            referencedRelation: "v_community_bookmaker_stats"
            referencedColumns: ["bookmaker_catalogo_id"]
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
            foreignKeyName: "bookmakers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmakers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_operadores_workspace"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "bookmakers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_last_login"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "bookmakers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
          moeda_padrao: string
          multibonus_enabled: boolean
          nome: string
          observacoes: string | null
          operacional: string
          permite_saque_fiat: boolean | null
          status: string
          updated_at: string
          user_id: string | null
          verificacao: string
          visibility: Database["public"]["Enums"]["bookmaker_visibility"] | null
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
          moeda_padrao?: string
          multibonus_enabled?: boolean
          nome: string
          observacoes?: string | null
          operacional?: string
          permite_saque_fiat?: boolean | null
          status?: string
          updated_at?: string
          user_id?: string | null
          verificacao?: string
          visibility?:
            | Database["public"]["Enums"]["bookmaker_visibility"]
            | null
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
          moeda_padrao?: string
          multibonus_enabled?: boolean
          nome?: string
          observacoes?: string | null
          operacional?: string
          permite_saque_fiat?: boolean | null
          status?: string
          updated_at?: string
          user_id?: string | null
          verificacao?: string
          visibility?:
            | Database["public"]["Enums"]["bookmaker_visibility"]
            | null
        }
        Relationships: []
      }
      cash_ledger: {
        Row: {
          ajuste_direcao: string | null
          ajuste_motivo: string | null
          auditoria_metadata: Json | null
          balance_processed_at: string | null
          coin: string | null
          conversao_aplicada: boolean | null
          conversao_referencia_id: string | null
          cotacao: number | null
          cotacao_destino_usd: number | null
          cotacao_implicita: number | null
          cotacao_origem_usd: number | null
          cotacao_snapshot_at: string | null
          created_at: string
          data_transacao: string
          debito_bonus: number | null
          debito_freebet: number | null
          debito_real: number | null
          descricao: string | null
          destino_bookmaker_id: string | null
          destino_conta_bancaria_id: string | null
          destino_parceiro_id: string | null
          destino_tipo: string | null
          destino_wallet_id: string | null
          evento_promocional_tipo: string | null
          id: string
          impacta_caixa_operacional: boolean
          investidor_id: string | null
          metodo_destino: string | null
          metodo_origem: string | null
          moeda: string
          moeda_destino: string | null
          moeda_origem: string | null
          nome_investidor: string | null
          operador_id: string | null
          origem_bookmaker_id: string | null
          origem_conta_bancaria_id: string | null
          origem_parceiro_id: string | null
          origem_tipo: string | null
          origem_wallet_id: string | null
          projeto_id_snapshot: string | null
          qtd_coin: number | null
          referencia_transacao_id: string | null
          status: string
          status_valor: string | null
          tipo_moeda: string
          tipo_transacao: string
          updated_at: string
          usar_freebet: boolean | null
          user_id: string
          valor: number
          valor_confirmado: number | null
          valor_destino: number | null
          valor_origem: number | null
          valor_usd: number | null
          valor_usd_referencia: number | null
          workspace_id: string
        }
        Insert: {
          ajuste_direcao?: string | null
          ajuste_motivo?: string | null
          auditoria_metadata?: Json | null
          balance_processed_at?: string | null
          coin?: string | null
          conversao_aplicada?: boolean | null
          conversao_referencia_id?: string | null
          cotacao?: number | null
          cotacao_destino_usd?: number | null
          cotacao_implicita?: number | null
          cotacao_origem_usd?: number | null
          cotacao_snapshot_at?: string | null
          created_at?: string
          data_transacao?: string
          debito_bonus?: number | null
          debito_freebet?: number | null
          debito_real?: number | null
          descricao?: string | null
          destino_bookmaker_id?: string | null
          destino_conta_bancaria_id?: string | null
          destino_parceiro_id?: string | null
          destino_tipo?: string | null
          destino_wallet_id?: string | null
          evento_promocional_tipo?: string | null
          id?: string
          impacta_caixa_operacional?: boolean
          investidor_id?: string | null
          metodo_destino?: string | null
          metodo_origem?: string | null
          moeda: string
          moeda_destino?: string | null
          moeda_origem?: string | null
          nome_investidor?: string | null
          operador_id?: string | null
          origem_bookmaker_id?: string | null
          origem_conta_bancaria_id?: string | null
          origem_parceiro_id?: string | null
          origem_tipo?: string | null
          origem_wallet_id?: string | null
          projeto_id_snapshot?: string | null
          qtd_coin?: number | null
          referencia_transacao_id?: string | null
          status?: string
          status_valor?: string | null
          tipo_moeda: string
          tipo_transacao: string
          updated_at?: string
          usar_freebet?: boolean | null
          user_id: string
          valor: number
          valor_confirmado?: number | null
          valor_destino?: number | null
          valor_origem?: number | null
          valor_usd?: number | null
          valor_usd_referencia?: number | null
          workspace_id: string
        }
        Update: {
          ajuste_direcao?: string | null
          ajuste_motivo?: string | null
          auditoria_metadata?: Json | null
          balance_processed_at?: string | null
          coin?: string | null
          conversao_aplicada?: boolean | null
          conversao_referencia_id?: string | null
          cotacao?: number | null
          cotacao_destino_usd?: number | null
          cotacao_implicita?: number | null
          cotacao_origem_usd?: number | null
          cotacao_snapshot_at?: string | null
          created_at?: string
          data_transacao?: string
          debito_bonus?: number | null
          debito_freebet?: number | null
          debito_real?: number | null
          descricao?: string | null
          destino_bookmaker_id?: string | null
          destino_conta_bancaria_id?: string | null
          destino_parceiro_id?: string | null
          destino_tipo?: string | null
          destino_wallet_id?: string | null
          evento_promocional_tipo?: string | null
          id?: string
          impacta_caixa_operacional?: boolean
          investidor_id?: string | null
          metodo_destino?: string | null
          metodo_origem?: string | null
          moeda?: string
          moeda_destino?: string | null
          moeda_origem?: string | null
          nome_investidor?: string | null
          operador_id?: string | null
          origem_bookmaker_id?: string | null
          origem_conta_bancaria_id?: string | null
          origem_parceiro_id?: string | null
          origem_tipo?: string | null
          origem_wallet_id?: string | null
          projeto_id_snapshot?: string | null
          qtd_coin?: number | null
          referencia_transacao_id?: string | null
          status?: string
          status_valor?: string | null
          tipo_moeda?: string
          tipo_transacao?: string
          updated_at?: string
          usar_freebet?: boolean | null
          user_id?: string
          valor?: number
          valor_confirmado?: number | null
          valor_destino?: number | null
          valor_origem?: number | null
          valor_usd?: number | null
          valor_usd_referencia?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_ledger_conversao_referencia_id_fkey"
            columns: ["conversao_referencia_id"]
            isOneToOne: false
            referencedRelation: "cash_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_conversao_referencia_id_fkey"
            columns: ["conversao_referencia_id"]
            isOneToOne: false
            referencedRelation: "v_ajustes_auditoria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_conversao_referencia_id_fkey"
            columns: ["conversao_referencia_id"]
            isOneToOne: false
            referencedRelation: "v_eventos_promocionais"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "v_bookmaker_resultado_operacional"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "cash_ledger_destino_bookmaker_id_fkey"
            columns: ["destino_bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_saldo_operavel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_destino_bookmaker_id_fkey"
            columns: ["destino_bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_status_operacional"
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
            foreignKeyName: "cash_ledger_destino_bookmaker_id_fkey"
            columns: ["destino_bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_desvinculados"
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
            foreignKeyName: "cash_ledger_investidor_id_fkey"
            columns: ["investidor_id"]
            isOneToOne: false
            referencedRelation: "v_roi_investidores_multimoeda"
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
            foreignKeyName: "cash_ledger_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "v_operadores_workspace"
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
            referencedRelation: "v_bookmaker_resultado_operacional"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "cash_ledger_origem_bookmaker_id_fkey"
            columns: ["origem_bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_saldo_operavel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_origem_bookmaker_id_fkey"
            columns: ["origem_bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_status_operacional"
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
            foreignKeyName: "cash_ledger_origem_bookmaker_id_fkey"
            columns: ["origem_bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_desvinculados"
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
          {
            foreignKeyName: "cash_ledger_projeto_id_snapshot_fkey"
            columns: ["projeto_id_snapshot"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_referencia_transacao_id_fkey"
            columns: ["referencia_transacao_id"]
            isOneToOne: false
            referencedRelation: "cash_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_referencia_transacao_id_fkey"
            columns: ["referencia_transacao_id"]
            isOneToOne: false
            referencedRelation: "v_ajustes_auditoria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_referencia_transacao_id_fkey"
            columns: ["referencia_transacao_id"]
            isOneToOne: false
            referencedRelation: "v_eventos_promocionais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      cashback_manual: {
        Row: {
          bookmaker_id: string
          cash_ledger_id: string | null
          cotacao_snapshot: number | null
          cotacao_snapshot_at: string | null
          created_at: string
          data_credito: string
          id: string
          moeda_operacao: string
          observacoes: string | null
          projeto_id: string
          tem_rollover: boolean | null
          updated_at: string
          user_id: string
          valor: number
          valor_brl_referencia: number | null
          workspace_id: string
        }
        Insert: {
          bookmaker_id: string
          cash_ledger_id?: string | null
          cotacao_snapshot?: number | null
          cotacao_snapshot_at?: string | null
          created_at?: string
          data_credito?: string
          id?: string
          moeda_operacao?: string
          observacoes?: string | null
          projeto_id: string
          tem_rollover?: boolean | null
          updated_at?: string
          user_id: string
          valor: number
          valor_brl_referencia?: number | null
          workspace_id: string
        }
        Update: {
          bookmaker_id?: string
          cash_ledger_id?: string | null
          cotacao_snapshot?: number | null
          cotacao_snapshot_at?: string | null
          created_at?: string
          data_credito?: string
          id?: string
          moeda_operacao?: string
          observacoes?: string | null
          projeto_id?: string
          tem_rollover?: boolean | null
          updated_at?: string
          user_id?: string
          valor?: number
          valor_brl_referencia?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashback_manual_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "bookmakers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashback_manual_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_disponibilidade"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashback_manual_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_resultado_operacional"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "cashback_manual_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_saldo_operavel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashback_manual_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_status_operacional"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashback_manual_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_aguardando_saque"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "cashback_manual_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_desvinculados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashback_manual_cash_ledger_id_fkey"
            columns: ["cash_ledger_id"]
            isOneToOne: false
            referencedRelation: "cash_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashback_manual_cash_ledger_id_fkey"
            columns: ["cash_ledger_id"]
            isOneToOne: false
            referencedRelation: "v_ajustes_auditoria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashback_manual_cash_ledger_id_fkey"
            columns: ["cash_ledger_id"]
            isOneToOne: false
            referencedRelation: "v_eventos_promocionais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashback_manual_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashback_manual_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      community_chat_messages: {
        Row: {
          content: string
          context_id: string | null
          context_type: string
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          edited_at: string | null
          expires_at: string
          id: string
          message_type: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          content: string
          context_id?: string | null
          context_type?: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          edited_at?: string | null
          expires_at?: string
          id?: string
          message_type?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          content?: string
          context_id?: string | null
          context_type?: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          edited_at?: string | null
          expires_at?: string
          id?: string
          message_type?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_chat_messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      community_comments: {
        Row: {
          conteudo: string
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          edited_at: string | null
          id: string
          is_anonymous: boolean | null
          status: string
          topic_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          conteudo: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          edited_at?: string | null
          id?: string
          is_anonymous?: boolean | null
          status?: string
          topic_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          conteudo?: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          edited_at?: string | null
          id?: string
          is_anonymous?: boolean | null
          status?: string
          topic_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_comments_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "community_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      community_evaluations: {
        Row: {
          bookmaker_catalogo_id: string
          comentario: string | null
          confiabilidade_geral: number | null
          created_at: string
          estabilidade_conta: number | null
          facilidade_verificacao: number | null
          id: string
          is_anonymous: boolean | null
          nota_media: number | null
          qualidade_suporte: number | null
          status_bloqueio: string | null
          updated_at: string
          user_id: string
          velocidade_pagamento: number | null
        }
        Insert: {
          bookmaker_catalogo_id: string
          comentario?: string | null
          confiabilidade_geral?: number | null
          created_at?: string
          estabilidade_conta?: number | null
          facilidade_verificacao?: number | null
          id?: string
          is_anonymous?: boolean | null
          nota_media?: number | null
          qualidade_suporte?: number | null
          status_bloqueio?: string | null
          updated_at?: string
          user_id: string
          velocidade_pagamento?: number | null
        }
        Update: {
          bookmaker_catalogo_id?: string
          comentario?: string | null
          confiabilidade_geral?: number | null
          created_at?: string
          estabilidade_conta?: number | null
          facilidade_verificacao?: number | null
          id?: string
          is_anonymous?: boolean | null
          nota_media?: number | null
          qualidade_suporte?: number | null
          status_bloqueio?: string | null
          updated_at?: string
          user_id?: string
          velocidade_pagamento?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "community_evaluations_bookmaker_catalogo_id_fkey"
            columns: ["bookmaker_catalogo_id"]
            isOneToOne: false
            referencedRelation: "bookmakers_catalogo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_evaluations_bookmaker_catalogo_id_fkey"
            columns: ["bookmaker_catalogo_id"]
            isOneToOne: false
            referencedRelation: "v_community_bookmaker_stats"
            referencedColumns: ["bookmaker_catalogo_id"]
          },
        ]
      }
      community_reports: {
        Row: {
          comment_id: string | null
          created_at: string
          evaluation_id: string | null
          id: string
          reason: string
          reporter_user_id: string
          status: string
          topic_id: string | null
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          evaluation_id?: string | null
          id?: string
          reason: string
          reporter_user_id: string
          status?: string
          topic_id?: string | null
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          evaluation_id?: string | null
          id?: string
          reason?: string
          reporter_user_id?: string
          status?: string
          topic_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_reports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "community_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reports_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "community_evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reports_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "community_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      community_topics: {
        Row: {
          bookmaker_catalogo_id: string
          conteudo: string
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          edited_at: string | null
          id: string
          is_anonymous: boolean | null
          status: string
          titulo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bookmaker_catalogo_id: string
          conteudo: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          edited_at?: string | null
          id?: string
          is_anonymous?: boolean | null
          status?: string
          titulo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bookmaker_catalogo_id?: string
          conteudo?: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          edited_at?: string | null
          id?: string
          is_anonymous?: boolean | null
          status?: string
          titulo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_topics_bookmaker_catalogo_id_fkey"
            columns: ["bookmaker_catalogo_id"]
            isOneToOne: false
            referencedRelation: "bookmakers_catalogo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_topics_bookmaker_catalogo_id_fkey"
            columns: ["bookmaker_catalogo_id"]
            isOneToOne: false
            referencedRelation: "v_community_bookmaker_stats"
            referencedColumns: ["bookmaker_catalogo_id"]
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
          moeda: string
          observacoes: string | null
          parceiro_id: string
          pix_key: string | null
          pix_keys: Json | null
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
          moeda?: string
          observacoes?: string | null
          parceiro_id: string
          pix_key?: string | null
          pix_keys?: Json | null
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
          moeda?: string
          observacoes?: string | null
          parceiro_id?: string
          pix_key?: string | null
          pix_keys?: Json | null
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
          grupo: string | null
          id: string
          origem_caixa_operacional: boolean | null
          origem_conta_bancaria_id: string | null
          origem_parceiro_id: string | null
          origem_tipo: string | null
          origem_wallet_id: string | null
          qtd_coin: number | null
          recorrente: boolean | null
          status: string
          subcategoria_rh: string | null
          tipo_moeda: string | null
          updated_at: string
          user_id: string
          valor: number
          workspace_id: string
        }
        Insert: {
          categoria: string
          coin?: string | null
          cotacao?: number | null
          created_at?: string
          data_despesa?: string
          descricao?: string | null
          grupo?: string | null
          id?: string
          origem_caixa_operacional?: boolean | null
          origem_conta_bancaria_id?: string | null
          origem_parceiro_id?: string | null
          origem_tipo?: string | null
          origem_wallet_id?: string | null
          qtd_coin?: number | null
          recorrente?: boolean | null
          status?: string
          subcategoria_rh?: string | null
          tipo_moeda?: string | null
          updated_at?: string
          user_id: string
          valor: number
          workspace_id: string
        }
        Update: {
          categoria?: string
          coin?: string | null
          cotacao?: number | null
          created_at?: string
          data_despesa?: string
          descricao?: string | null
          grupo?: string | null
          id?: string
          origem_caixa_operacional?: boolean | null
          origem_conta_bancaria_id?: string | null
          origem_parceiro_id?: string | null
          origem_tipo?: string | null
          origem_wallet_id?: string | null
          qtd_coin?: number | null
          recorrente?: boolean | null
          status?: string
          subcategoria_rh?: string | null
          tipo_moeda?: string | null
          updated_at?: string
          user_id?: string
          valor?: number
          workspace_id?: string
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
          {
            foreignKeyName: "despesas_administrativas_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
          workspace_id: string
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
          workspace_id: string
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
          workspace_id?: string
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
            foreignKeyName: "entregas_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_adjustments: {
        Row: {
          bookmaker_id: string | null
          cash_ledger_id: string
          coin: string | null
          created_at: string | null
          diferenca: number
          id: string
          moeda_destino: string | null
          observacoes: string | null
          qtd_coin: number | null
          tipo: string
          tipo_ajuste: string
          user_id: string
          valor_confirmado: number
          valor_nominal: number
          wallet_id: string | null
          workspace_id: string
        }
        Insert: {
          bookmaker_id?: string | null
          cash_ledger_id: string
          coin?: string | null
          created_at?: string | null
          diferenca: number
          id?: string
          moeda_destino?: string | null
          observacoes?: string | null
          qtd_coin?: number | null
          tipo: string
          tipo_ajuste: string
          user_id: string
          valor_confirmado: number
          valor_nominal: number
          wallet_id?: string | null
          workspace_id: string
        }
        Update: {
          bookmaker_id?: string | null
          cash_ledger_id?: string
          coin?: string | null
          created_at?: string | null
          diferenca?: number
          id?: string
          moeda_destino?: string | null
          observacoes?: string | null
          qtd_coin?: number | null
          tipo?: string
          tipo_ajuste?: string
          user_id?: string
          valor_confirmado?: number
          valor_nominal?: number
          wallet_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_adjustments_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "bookmakers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_adjustments_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_disponibilidade"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_adjustments_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_resultado_operacional"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "exchange_adjustments_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_saldo_operavel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_adjustments_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_status_operacional"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_adjustments_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_aguardando_saque"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "exchange_adjustments_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_desvinculados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_adjustments_cash_ledger_id_fkey"
            columns: ["cash_ledger_id"]
            isOneToOne: false
            referencedRelation: "cash_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_adjustments_cash_ledger_id_fkey"
            columns: ["cash_ledger_id"]
            isOneToOne: false
            referencedRelation: "v_ajustes_auditoria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_adjustments_cash_ledger_id_fkey"
            columns: ["cash_ledger_id"]
            isOneToOne: false
            referencedRelation: "v_eventos_promocionais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_adjustments_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_parceiro_wallets"
            referencedColumns: ["wallet_id"]
          },
          {
            foreignKeyName: "exchange_adjustments_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets_crypto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_adjustments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rate_cache: {
        Row: {
          created_at: string
          currency_pair: string
          expires_at: string
          fetched_at: string
          id: string
          rate: number
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency_pair: string
          expires_at: string
          fetched_at?: string
          id?: string
          rate: number
          source: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency_pair?: string
          expires_at?: string
          fetched_at?: string
          id?: string
          rate?: number
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      fluxo_cards: {
        Row: {
          coluna_id: string
          conteudo: string
          created_at: string
          id: string
          ordem: number
          updated_at: string
          user_id: string
          versao: number
          workspace_id: string
        }
        Insert: {
          coluna_id: string
          conteudo?: string
          created_at?: string
          id?: string
          ordem?: number
          updated_at?: string
          user_id: string
          versao?: number
          workspace_id: string
        }
        Update: {
          coluna_id?: string
          conteudo?: string
          created_at?: string
          id?: string
          ordem?: number
          updated_at?: string
          user_id?: string
          versao?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fluxo_cards_coluna_id_fkey"
            columns: ["coluna_id"]
            isOneToOne: false
            referencedRelation: "fluxo_colunas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fluxo_cards_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      fluxo_cards_historico: {
        Row: {
          card_id: string
          coluna_id: string
          conteudo: string
          created_at: string
          id: string
          tipo_mudanca: string
          user_id: string
          versao: number
          workspace_id: string
        }
        Insert: {
          card_id: string
          coluna_id: string
          conteudo: string
          created_at?: string
          id?: string
          tipo_mudanca: string
          user_id: string
          versao: number
          workspace_id: string
        }
        Update: {
          card_id?: string
          coluna_id?: string
          conteudo?: string
          created_at?: string
          id?: string
          tipo_mudanca?: string
          user_id?: string
          versao?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fluxo_cards_historico_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "fluxo_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fluxo_cards_historico_coluna_id_fkey"
            columns: ["coluna_id"]
            isOneToOne: false
            referencedRelation: "fluxo_colunas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fluxo_cards_historico_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      fluxo_colunas: {
        Row: {
          created_at: string
          id: string
          nome: string
          ordem: number
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          ordem?: number
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fluxo_colunas_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
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
          workspace_id: string
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
          workspace_id: string
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
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fornecedores_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      freebets_recebidas: {
        Row: {
          aposta_id: string | null
          aposta_multipla_id: string | null
          bookmaker_id: string
          cotacao_snapshot: number | null
          cotacao_snapshot_at: string | null
          created_at: string
          data_recebida: string
          data_utilizacao: string | null
          data_validade: string | null
          id: string
          moeda_operacao: string | null
          motivo: string
          observacoes: string | null
          origem: string | null
          projeto_id: string
          qualificadora_id: string | null
          status: string
          tem_rollover: boolean | null
          updated_at: string
          user_id: string
          utilizada: boolean | null
          valor: number
          valor_brl_referencia: number | null
          workspace_id: string
        }
        Insert: {
          aposta_id?: string | null
          aposta_multipla_id?: string | null
          bookmaker_id: string
          cotacao_snapshot?: number | null
          cotacao_snapshot_at?: string | null
          created_at?: string
          data_recebida?: string
          data_utilizacao?: string | null
          data_validade?: string | null
          id?: string
          moeda_operacao?: string | null
          motivo: string
          observacoes?: string | null
          origem?: string | null
          projeto_id: string
          qualificadora_id?: string | null
          status?: string
          tem_rollover?: boolean | null
          updated_at?: string
          user_id: string
          utilizada?: boolean | null
          valor: number
          valor_brl_referencia?: number | null
          workspace_id: string
        }
        Update: {
          aposta_id?: string | null
          aposta_multipla_id?: string | null
          bookmaker_id?: string
          cotacao_snapshot?: number | null
          cotacao_snapshot_at?: string | null
          created_at?: string
          data_recebida?: string
          data_utilizacao?: string | null
          data_validade?: string | null
          id?: string
          moeda_operacao?: string | null
          motivo?: string
          observacoes?: string | null
          origem?: string | null
          projeto_id?: string
          qualificadora_id?: string | null
          status?: string
          tem_rollover?: boolean | null
          updated_at?: string
          user_id?: string
          utilizada?: boolean | null
          valor?: number
          valor_brl_referencia?: number | null
          workspace_id?: string
        }
        Relationships: [
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
            referencedRelation: "v_bookmaker_resultado_operacional"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "freebets_recebidas_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_saldo_operavel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freebets_recebidas_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_status_operacional"
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
            foreignKeyName: "freebets_recebidas_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_desvinculados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freebets_recebidas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freebets_recebidas_qualificadora_id_fkey"
            columns: ["qualificadora_id"]
            isOneToOne: false
            referencedRelation: "apostas_unificada"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freebets_recebidas_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      giros_gratis: {
        Row: {
          bookmaker_id: string
          cash_ledger_id: string | null
          created_at: string
          data_registro: string
          giro_disponivel_id: string | null
          id: string
          modo: string
          observacoes: string | null
          projeto_id: string
          quantidade_giros: number | null
          status: string
          updated_at: string
          user_id: string
          valor_por_giro: number | null
          valor_retorno: number
          valor_total_giros: number | null
          workspace_id: string
        }
        Insert: {
          bookmaker_id: string
          cash_ledger_id?: string | null
          created_at?: string
          data_registro?: string
          giro_disponivel_id?: string | null
          id?: string
          modo?: string
          observacoes?: string | null
          projeto_id: string
          quantidade_giros?: number | null
          status?: string
          updated_at?: string
          user_id: string
          valor_por_giro?: number | null
          valor_retorno?: number
          valor_total_giros?: number | null
          workspace_id: string
        }
        Update: {
          bookmaker_id?: string
          cash_ledger_id?: string | null
          created_at?: string
          data_registro?: string
          giro_disponivel_id?: string | null
          id?: string
          modo?: string
          observacoes?: string | null
          projeto_id?: string
          quantidade_giros?: number | null
          status?: string
          updated_at?: string
          user_id?: string
          valor_por_giro?: number | null
          valor_retorno?: number
          valor_total_giros?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "giros_gratis_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "bookmakers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "giros_gratis_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_disponibilidade"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "giros_gratis_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_resultado_operacional"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "giros_gratis_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_saldo_operavel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "giros_gratis_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_status_operacional"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "giros_gratis_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_aguardando_saque"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "giros_gratis_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_desvinculados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "giros_gratis_cash_ledger_id_fkey"
            columns: ["cash_ledger_id"]
            isOneToOne: false
            referencedRelation: "cash_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "giros_gratis_cash_ledger_id_fkey"
            columns: ["cash_ledger_id"]
            isOneToOne: false
            referencedRelation: "v_ajustes_auditoria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "giros_gratis_cash_ledger_id_fkey"
            columns: ["cash_ledger_id"]
            isOneToOne: false
            referencedRelation: "v_eventos_promocionais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "giros_gratis_giro_disponivel_id_fkey"
            columns: ["giro_disponivel_id"]
            isOneToOne: false
            referencedRelation: "giros_gratis_disponiveis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "giros_gratis_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "giros_gratis_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      giros_gratis_disponiveis: {
        Row: {
          bookmaker_id: string
          created_at: string
          data_recebido: string
          data_utilizacao: string | null
          data_validade: string | null
          giro_gratis_resultado_id: string | null
          id: string
          motivo: string
          observacoes: string | null
          projeto_id: string
          quantidade_giros: number
          status: string
          updated_at: string
          user_id: string
          valor_por_giro: number
          valor_total: number | null
          workspace_id: string
        }
        Insert: {
          bookmaker_id: string
          created_at?: string
          data_recebido?: string
          data_utilizacao?: string | null
          data_validade?: string | null
          giro_gratis_resultado_id?: string | null
          id?: string
          motivo?: string
          observacoes?: string | null
          projeto_id: string
          quantidade_giros?: number
          status?: string
          updated_at?: string
          user_id: string
          valor_por_giro: number
          valor_total?: number | null
          workspace_id: string
        }
        Update: {
          bookmaker_id?: string
          created_at?: string
          data_recebido?: string
          data_utilizacao?: string | null
          data_validade?: string | null
          giro_gratis_resultado_id?: string | null
          id?: string
          motivo?: string
          observacoes?: string | null
          projeto_id?: string
          quantidade_giros?: number
          status?: string
          updated_at?: string
          user_id?: string
          valor_por_giro?: number
          valor_total?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "giros_gratis_disponiveis_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "bookmakers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "giros_gratis_disponiveis_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_disponibilidade"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "giros_gratis_disponiveis_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_resultado_operacional"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "giros_gratis_disponiveis_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_saldo_operavel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "giros_gratis_disponiveis_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_status_operacional"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "giros_gratis_disponiveis_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_aguardando_saque"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "giros_gratis_disponiveis_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_desvinculados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "giros_gratis_disponiveis_giro_gratis_resultado_id_fkey"
            columns: ["giro_gratis_resultado_id"]
            isOneToOne: false
            referencedRelation: "giros_gratis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "giros_gratis_disponiveis_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "giros_gratis_disponiveis_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
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
          workspace_id: string
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
          workspace_id: string
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
          workspace_id?: string
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
          {
            foreignKeyName: "indicacoes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
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
          workspace_id: string
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
          workspace_id: string
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
          workspace_id?: string
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
          {
            foreignKeyName: "indicador_acordos_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
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
          workspace_id: string
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
          workspace_id: string
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
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "indicadores_referral_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
          workspace_id: string
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
          workspace_id: string
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
          workspace_id?: string
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
            foreignKeyName: "investidor_deals_investidor_id_fkey"
            columns: ["investidor_id"]
            isOneToOne: false
            referencedRelation: "v_roi_investidores_multimoeda"
            referencedColumns: ["investidor_id"]
          },
          {
            foreignKeyName: "investidor_deals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
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
          workspace_id: string
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
          workspace_id: string
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
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investidores_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          attempted_at: string
          blocked_until: string | null
          email: string
          id: string
          ip_address: string | null
          success: boolean
        }
        Insert: {
          attempted_at?: string
          blocked_until?: string | null
          email: string
          id?: string
          ip_address?: string | null
          success?: boolean
        }
        Update: {
          attempted_at?: string
          blocked_until?: string | null
          email?: string
          id?: string
          ip_address?: string | null
          success?: boolean
        }
        Relationships: []
      }
      login_history: {
        Row: {
          id: string
          ip_address: string | null
          is_active: boolean | null
          last_activity_at: string | null
          login_at: string
          logout_at: string | null
          session_id: string | null
          session_status: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string
          user_name: string | null
          workspace_id: string | null
          workspace_name: string | null
        }
        Insert: {
          id?: string
          ip_address?: string | null
          is_active?: boolean | null
          last_activity_at?: string | null
          login_at?: string
          logout_at?: string | null
          session_id?: string | null
          session_status?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id: string
          user_name?: string | null
          workspace_id?: string | null
          workspace_name?: string | null
        }
        Update: {
          id?: string
          ip_address?: string | null
          is_active?: boolean | null
          last_activity_at?: string | null
          login_at?: string
          logout_at?: string | null
          session_id?: string | null
          session_status?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string
          user_name?: string | null
          workspace_id?: string | null
          workspace_name?: string | null
        }
        Relationships: []
      }
      moderation_logs: {
        Row: {
          action_type: string
          actor_user_id: string
          created_at: string
          id: string
          metadata: Json | null
          target_author_id: string | null
          target_content: string | null
          target_id: string | null
          target_type: string
          workspace_id: string | null
        }
        Insert: {
          action_type: string
          actor_user_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_author_id?: string | null
          target_content?: string | null
          target_id?: string | null
          target_type: string
          workspace_id?: string | null
        }
        Update: {
          action_type?: string
          actor_user_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_author_id?: string | null
          target_content?: string | null
          target_id?: string | null
          target_type?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moderation_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
          workspace_id: string
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
          workspace_id: string
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
          workspace_id?: string
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
          {
            foreignKeyName: "movimentacoes_indicacao_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
          dias_intervalo_conciliacao: number | null
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
          proxima_conciliacao: string | null
          regra_prejuizo: string | null
          responsabilidades: string[] | null
          resumo_acordo: string | null
          status: string
          teto_pagamento: number | null
          tipo_meta: string | null
          ultima_conciliacao: string | null
          updated_at: string
          user_id: string
          valor_fixo: number | null
          workspace_id: string
        }
        Insert: {
          base_calculo?: string | null
          created_at?: string
          data_entrada?: string
          data_saida?: string | null
          dias_intervalo_conciliacao?: number | null
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
          proxima_conciliacao?: string | null
          regra_prejuizo?: string | null
          responsabilidades?: string[] | null
          resumo_acordo?: string | null
          status?: string
          teto_pagamento?: number | null
          tipo_meta?: string | null
          ultima_conciliacao?: string | null
          updated_at?: string
          user_id: string
          valor_fixo?: number | null
          workspace_id: string
        }
        Update: {
          base_calculo?: string | null
          created_at?: string
          data_entrada?: string
          data_saida?: string | null
          dias_intervalo_conciliacao?: number | null
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
          proxima_conciliacao?: string | null
          regra_prejuizo?: string | null
          responsabilidades?: string[] | null
          resumo_acordo?: string | null
          status?: string
          teto_pagamento?: number | null
          tipo_meta?: string | null
          ultima_conciliacao?: string | null
          updated_at?: string
          user_id?: string
          valor_fixo?: number | null
          workspace_id?: string
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
            foreignKeyName: "operador_projetos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "v_operadores_workspace"
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
            foreignKeyName: "operador_projetos_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      operadores: {
        Row: {
          auth_user_id: string | null
          cpf: string | null
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
          workspace_id: string
        }
        Insert: {
          auth_user_id?: string | null
          cpf?: string | null
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
          workspace_id: string
        }
        Update: {
          auth_user_id?: string | null
          cpf?: string | null
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
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operadores_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      operadores_legado_pendente: {
        Row: {
          created_at: string | null
          id: string
          migrated_at: string | null
          migrated_to_user_id: string | null
          operador_id: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          migrated_at?: string | null
          migrated_to_user_id?: string | null
          operador_id?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          migrated_at?: string | null
          migrated_to_user_id?: string | null
          operador_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operadores_legado_pendente_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "operadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operadores_legado_pendente_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "v_operador_comparativo"
            referencedColumns: ["operador_id"]
          },
          {
            foreignKeyName: "operadores_legado_pendente_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "v_operador_performance"
            referencedColumns: ["operador_id"]
          },
          {
            foreignKeyName: "operadores_legado_pendente_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "v_operadores_workspace"
            referencedColumns: ["operador_id"]
          },
        ]
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
          workspace_id: string
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
          workspace_id: string
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
          workspace_id?: string
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
            foreignKeyName: "pagamentos_operador_cash_ledger_id_fkey"
            columns: ["cash_ledger_id"]
            isOneToOne: false
            referencedRelation: "v_ajustes_auditoria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_operador_cash_ledger_id_fkey"
            columns: ["cash_ledger_id"]
            isOneToOne: false
            referencedRelation: "v_eventos_promocionais"
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
            foreignKeyName: "pagamentos_operador_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "v_operadores_workspace"
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
            foreignKeyName: "pagamentos_operador_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
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
          workspace_id: string
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
          workspace_id: string
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
          workspace_id?: string
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
            foreignKeyName: "pagamentos_propostos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "v_operadores_workspace"
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
            foreignKeyName: "pagamentos_propostos_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
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
          workspace_id: string
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
          workspace_id: string
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
          workspace_id?: string
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
          {
            foreignKeyName: "parceiro_lucro_alertas_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
          workspace_id: string
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
          workspace_id: string
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
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parceiros_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiros_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_operadores_workspace"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "parceiros_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_last_login"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "parceiros_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
          workspace_id: string
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
          workspace_id: string
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
          workspace_id?: string
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
            foreignKeyName: "parcerias_indicacao_id_fkey"
            columns: ["indicacao_id"]
            isOneToOne: false
            referencedRelation: "v_indicacoes_workspace"
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
          {
            foreignKeyName: "parcerias_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      participacao_ciclos: {
        Row: {
          base_calculo: string
          ciclo_id: string
          created_at: string | null
          data_apuracao: string
          data_pagamento: string | null
          id: string
          investidor_id: string
          lucro_base: number
          observacoes: string | null
          pagamento_ledger_id: string | null
          participacao_referencia_id: string | null
          percentual_aplicado: number
          projeto_id: string
          status: string
          tipo_participacao: string
          updated_at: string | null
          user_id: string
          valor_participacao: number
          workspace_id: string
        }
        Insert: {
          base_calculo: string
          ciclo_id: string
          created_at?: string | null
          data_apuracao?: string
          data_pagamento?: string | null
          id?: string
          investidor_id: string
          lucro_base?: number
          observacoes?: string | null
          pagamento_ledger_id?: string | null
          participacao_referencia_id?: string | null
          percentual_aplicado: number
          projeto_id: string
          status?: string
          tipo_participacao?: string
          updated_at?: string | null
          user_id: string
          valor_participacao?: number
          workspace_id: string
        }
        Update: {
          base_calculo?: string
          ciclo_id?: string
          created_at?: string | null
          data_apuracao?: string
          data_pagamento?: string | null
          id?: string
          investidor_id?: string
          lucro_base?: number
          observacoes?: string | null
          pagamento_ledger_id?: string | null
          participacao_referencia_id?: string | null
          percentual_aplicado?: number
          projeto_id?: string
          status?: string
          tipo_participacao?: string
          updated_at?: string | null
          user_id?: string
          valor_participacao?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "participacao_ciclos_ciclo_id_fkey"
            columns: ["ciclo_id"]
            isOneToOne: false
            referencedRelation: "projeto_ciclos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participacao_ciclos_ciclo_id_fkey"
            columns: ["ciclo_id"]
            isOneToOne: false
            referencedRelation: "v_ciclos_proximos_fechamento"
            referencedColumns: ["ciclo_id"]
          },
          {
            foreignKeyName: "participacao_ciclos_investidor_id_fkey"
            columns: ["investidor_id"]
            isOneToOne: false
            referencedRelation: "investidores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participacao_ciclos_investidor_id_fkey"
            columns: ["investidor_id"]
            isOneToOne: false
            referencedRelation: "v_roi_investidores"
            referencedColumns: ["investidor_id"]
          },
          {
            foreignKeyName: "participacao_ciclos_investidor_id_fkey"
            columns: ["investidor_id"]
            isOneToOne: false
            referencedRelation: "v_roi_investidores_multimoeda"
            referencedColumns: ["investidor_id"]
          },
          {
            foreignKeyName: "participacao_ciclos_pagamento_ledger_id_fkey"
            columns: ["pagamento_ledger_id"]
            isOneToOne: false
            referencedRelation: "cash_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participacao_ciclos_pagamento_ledger_id_fkey"
            columns: ["pagamento_ledger_id"]
            isOneToOne: false
            referencedRelation: "v_ajustes_auditoria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participacao_ciclos_pagamento_ledger_id_fkey"
            columns: ["pagamento_ledger_id"]
            isOneToOne: false
            referencedRelation: "v_eventos_promocionais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participacao_ciclos_participacao_referencia_id_fkey"
            columns: ["participacao_referencia_id"]
            isOneToOne: false
            referencedRelation: "participacao_ciclos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participacao_ciclos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participacao_ciclos_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          action: string
          code: string
          created_at: string
          description: string | null
          id: string
          module: string
          scope: string
        }
        Insert: {
          action: string
          code: string
          created_at?: string
          description?: string | null
          id?: string
          module: string
          scope?: string
        }
        Update: {
          action?: string
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          module?: string
          scope?: string
        }
        Relationships: []
      }
      plan_entitlements: {
        Row: {
          created_at: string
          custom_permissions_enabled: boolean | null
          extra_features: Json | null
          id: string
          max_active_partners: number | null
          max_custom_permissions: number | null
          max_users: number | null
          personalized_support: boolean | null
          plan_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_permissions_enabled?: boolean | null
          extra_features?: Json | null
          id?: string
          max_active_partners?: number | null
          max_custom_permissions?: number | null
          max_users?: number | null
          personalized_support?: boolean | null
          plan_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_permissions_enabled?: boolean | null
          extra_features?: Json | null
          id?: string
          max_active_partners?: number | null
          max_custom_permissions?: number | null
          max_users?: number | null
          personalized_support?: boolean | null
          plan_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_entitlements_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: true
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_prices: {
        Row: {
          amount: number
          billing_period: string
          created_at: string
          currency: string
          id: string
          is_active: boolean | null
          plan_id: string
          provider: string | null
          provider_price_id: string | null
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          amount: number
          billing_period: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean | null
          plan_id: string
          provider?: string | null
          provider_price_id?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          amount?: number
          billing_period?: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean | null
          plan_id?: string
          provider?: string | null
          provider_price_id?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_prices_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          code: string
          created_at: string
          description: string | null
          display_order: number | null
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          auth_version: number
          blocked_at: string | null
          blocked_reason: string | null
          cpf: string | null
          created_at: string
          data_admissao: string | null
          data_desligamento: string | null
          data_nascimento: string | null
          default_workspace_id: string | null
          email: string | null
          full_name: string | null
          id: string
          is_blocked: boolean | null
          is_system_owner: boolean | null
          is_test_user: boolean | null
          last_login_at: string | null
          observacoes_operador: string | null
          public_id: string | null
          telefone: string | null
          tipo_contrato: string | null
          updated_at: string
        }
        Insert: {
          auth_version?: number
          blocked_at?: string | null
          blocked_reason?: string | null
          cpf?: string | null
          created_at?: string
          data_admissao?: string | null
          data_desligamento?: string | null
          data_nascimento?: string | null
          default_workspace_id?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          is_blocked?: boolean | null
          is_system_owner?: boolean | null
          is_test_user?: boolean | null
          last_login_at?: string | null
          observacoes_operador?: string | null
          public_id?: string | null
          telefone?: string | null
          tipo_contrato?: string | null
          updated_at?: string
        }
        Update: {
          auth_version?: number
          blocked_at?: string | null
          blocked_reason?: string | null
          cpf?: string | null
          created_at?: string
          data_admissao?: string | null
          data_desligamento?: string | null
          data_nascimento?: string | null
          default_workspace_id?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_blocked?: boolean | null
          is_system_owner?: boolean | null
          is_test_user?: boolean | null
          last_login_at?: string | null
          observacoes_operador?: string | null
          public_id?: string | null
          telefone?: string | null
          tipo_contrato?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_default_workspace_id_fkey"
            columns: ["default_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      project_bookmaker_link_bonuses: {
        Row: {
          bonus_amount: number
          bookmaker_id: string
          cotacao_credito_at: string | null
          cotacao_credito_snapshot: number | null
          created_at: string
          created_by: string
          credited_at: string | null
          currency: string
          deadline_days: number | null
          deposit_amount: number | null
          expires_at: string | null
          finalize_reason: string | null
          finalized_at: string | null
          finalized_by: string | null
          id: string
          migrado_para_saldo_unificado: boolean | null
          min_odds: number | null
          notes: string | null
          project_id: string
          rollover_base: string | null
          rollover_multiplier: number | null
          rollover_progress: number | null
          rollover_target_amount: number | null
          saldo_atual: number | null
          source: string
          status: string
          template_snapshot: Json | null
          title: string
          updated_at: string
          user_id: string
          valor_brl_referencia: number | null
          valor_creditado_no_saldo: number | null
          workspace_id: string
        }
        Insert: {
          bonus_amount?: number
          bookmaker_id: string
          cotacao_credito_at?: string | null
          cotacao_credito_snapshot?: number | null
          created_at?: string
          created_by: string
          credited_at?: string | null
          currency?: string
          deadline_days?: number | null
          deposit_amount?: number | null
          expires_at?: string | null
          finalize_reason?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          migrado_para_saldo_unificado?: boolean | null
          min_odds?: number | null
          notes?: string | null
          project_id: string
          rollover_base?: string | null
          rollover_multiplier?: number | null
          rollover_progress?: number | null
          rollover_target_amount?: number | null
          saldo_atual?: number | null
          source?: string
          status?: string
          template_snapshot?: Json | null
          title?: string
          updated_at?: string
          user_id: string
          valor_brl_referencia?: number | null
          valor_creditado_no_saldo?: number | null
          workspace_id: string
        }
        Update: {
          bonus_amount?: number
          bookmaker_id?: string
          cotacao_credito_at?: string | null
          cotacao_credito_snapshot?: number | null
          created_at?: string
          created_by?: string
          credited_at?: string | null
          currency?: string
          deadline_days?: number | null
          deposit_amount?: number | null
          expires_at?: string | null
          finalize_reason?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          migrado_para_saldo_unificado?: boolean | null
          min_odds?: number | null
          notes?: string | null
          project_id?: string
          rollover_base?: string | null
          rollover_multiplier?: number | null
          rollover_progress?: number | null
          rollover_target_amount?: number | null
          saldo_atual?: number | null
          source?: string
          status?: string
          template_snapshot?: Json | null
          title?: string
          updated_at?: string
          user_id?: string
          valor_brl_referencia?: number | null
          valor_creditado_no_saldo?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_bookmaker_link_bonuses_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "bookmakers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_bookmaker_link_bonuses_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_disponibilidade"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_bookmaker_link_bonuses_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_resultado_operacional"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "project_bookmaker_link_bonuses_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_saldo_operavel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_bookmaker_link_bonuses_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_status_operacional"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_bookmaker_link_bonuses_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_aguardando_saque"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "project_bookmaker_link_bonuses_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_desvinculados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_bookmaker_link_bonuses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_bookmaker_link_bonuses_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      project_favorites: {
        Row: {
          created_at: string
          id: string
          project_id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_favorites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_favorites_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      project_modules: {
        Row: {
          activated_at: string
          activated_by: string | null
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          display_order: number
          id: string
          module_id: string
          projeto_id: string
          status: string
          workspace_id: string
        }
        Insert: {
          activated_at?: string
          activated_by?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          display_order?: number
          id?: string
          module_id: string
          projeto_id: string
          status?: string
          workspace_id: string
        }
        Update: {
          activated_at?: string
          activated_by?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          display_order?: number
          id?: string
          module_id?: string
          projeto_id?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_modules_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "project_modules_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_modules_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_modules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      project_modules_catalog: {
        Row: {
          category: string
          created_at: string
          default_order: number
          description: string | null
          icon: string
          id: string
          name: string
          requires_modules: string[] | null
        }
        Insert: {
          category?: string
          created_at?: string
          default_order?: number
          description?: string | null
          icon?: string
          id: string
          name: string
          requires_modules?: string[] | null
        }
        Update: {
          category?: string
          created_at?: string
          default_order?: number
          description?: string | null
          icon?: string
          id?: string
          name?: string
          requires_modules?: string[] | null
        }
        Relationships: []
      }
      project_user_preferences: {
        Row: {
          created_at: string
          default_tab: string
          id: string
          project_id: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          default_tab: string
          id?: string
          project_id: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          default_tab?: string
          id?: string
          project_id?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_user_preferences_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_user_preferences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
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
          tipo_projeto_snapshot: string | null
          user_id: string
          workspace_id: string
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
          tipo_projeto_snapshot?: string | null
          user_id: string
          workspace_id: string
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
          tipo_projeto_snapshot?: string | null
          user_id?: string
          workspace_id?: string
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
            referencedRelation: "v_bookmaker_resultado_operacional"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "projeto_bookmaker_historico_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_saldo_operavel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projeto_bookmaker_historico_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_status_operacional"
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
            foreignKeyName: "projeto_bookmaker_historico_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_desvinculados"
            referencedColumns: ["id"]
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
            foreignKeyName: "projeto_bookmaker_historico_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      projeto_ciclos: {
        Row: {
          auto_criado: boolean | null
          cotacao_fechamento: number | null
          cotacao_fechamento_at: string | null
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
          lucro_bruto_usd: number | null
          lucro_liquido: number | null
          lucro_liquido_usd: number | null
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
          workspace_id: string
        }
        Insert: {
          auto_criado?: boolean | null
          cotacao_fechamento?: number | null
          cotacao_fechamento_at?: string | null
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
          lucro_bruto_usd?: number | null
          lucro_liquido?: number | null
          lucro_liquido_usd?: number | null
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
          workspace_id: string
        }
        Update: {
          auto_criado?: boolean | null
          cotacao_fechamento?: number | null
          cotacao_fechamento_at?: string | null
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
          lucro_bruto_usd?: number | null
          lucro_liquido?: number | null
          lucro_liquido_usd?: number | null
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
          workspace_id?: string
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
            foreignKeyName: "projeto_ciclos_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
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
          workspace_id: string
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
          workspace_id: string
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
          workspace_id?: string
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
            foreignKeyName: "projeto_conciliacoes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      projeto_perdas: {
        Row: {
          bookmaker_id: string | null
          categoria: string
          created_at: string
          data_confirmacao: string | null
          data_registro: string
          data_reversao: string | null
          descricao: string | null
          id: string
          projeto_id: string
          status: string
          updated_at: string
          user_id: string
          valor: number
          workspace_id: string
        }
        Insert: {
          bookmaker_id?: string | null
          categoria: string
          created_at?: string
          data_confirmacao?: string | null
          data_registro?: string
          data_reversao?: string | null
          descricao?: string | null
          id?: string
          projeto_id: string
          status?: string
          updated_at?: string
          user_id: string
          valor: number
          workspace_id: string
        }
        Update: {
          bookmaker_id?: string | null
          categoria?: string
          created_at?: string
          data_confirmacao?: string | null
          data_registro?: string
          data_reversao?: string | null
          descricao?: string | null
          id?: string
          projeto_id?: string
          status?: string
          updated_at?: string
          user_id?: string
          valor?: number
          workspace_id?: string
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
            referencedRelation: "v_bookmaker_resultado_operacional"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "projeto_perdas_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_saldo_operavel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projeto_perdas_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_status_operacional"
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
            foreignKeyName: "projeto_perdas_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_desvinculados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projeto_perdas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projeto_perdas_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      projetos: {
        Row: {
          archived_at: string | null
          base_calculo_investidor: string | null
          conciliado: boolean
          cotacao_trabalho: number | null
          cotacao_trabalho_ars: number | null
          cotacao_trabalho_cop: number | null
          cotacao_trabalho_eur: number | null
          cotacao_trabalho_gbp: number | null
          cotacao_trabalho_mxn: number | null
          cotacao_trabalho_myr: number | null
          created_at: string
          data_fim_prevista: string | null
          data_fim_real: string | null
          data_inicio: string | null
          descricao: string | null
          first_operation_at: string | null
          fonte_cotacao: string | null
          id: string
          investidor_id: string | null
          modelo_absorcao_taxas: string
          moeda_consolidacao: string | null
          nome: string
          observacoes: string | null
          orcamento_inicial: number | null
          percentual_investidor: number | null
          status: string
          tem_investimento_crypto: boolean
          tipo_projeto: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          base_calculo_investidor?: string | null
          conciliado?: boolean
          cotacao_trabalho?: number | null
          cotacao_trabalho_ars?: number | null
          cotacao_trabalho_cop?: number | null
          cotacao_trabalho_eur?: number | null
          cotacao_trabalho_gbp?: number | null
          cotacao_trabalho_mxn?: number | null
          cotacao_trabalho_myr?: number | null
          created_at?: string
          data_fim_prevista?: string | null
          data_fim_real?: string | null
          data_inicio?: string | null
          descricao?: string | null
          first_operation_at?: string | null
          fonte_cotacao?: string | null
          id?: string
          investidor_id?: string | null
          modelo_absorcao_taxas?: string
          moeda_consolidacao?: string | null
          nome: string
          observacoes?: string | null
          orcamento_inicial?: number | null
          percentual_investidor?: number | null
          status?: string
          tem_investimento_crypto?: boolean
          tipo_projeto?: string | null
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          base_calculo_investidor?: string | null
          conciliado?: boolean
          cotacao_trabalho?: number | null
          cotacao_trabalho_ars?: number | null
          cotacao_trabalho_cop?: number | null
          cotacao_trabalho_eur?: number | null
          cotacao_trabalho_gbp?: number | null
          cotacao_trabalho_mxn?: number | null
          cotacao_trabalho_myr?: number | null
          created_at?: string
          data_fim_prevista?: string | null
          data_fim_real?: string | null
          data_inicio?: string | null
          descricao?: string | null
          first_operation_at?: string | null
          fonte_cotacao?: string | null
          id?: string
          investidor_id?: string | null
          modelo_absorcao_taxas?: string
          moeda_consolidacao?: string | null
          nome?: string
          observacoes?: string | null
          orcamento_inicial?: number | null
          percentual_investidor?: number | null
          status?: string
          tem_investimento_crypto?: boolean
          tipo_projeto?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
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
          {
            foreignKeyName: "projetos_investidor_id_fkey"
            columns: ["investidor_id"]
            isOneToOne: false
            referencedRelation: "v_roi_investidores_multimoeda"
            referencedColumns: ["investidor_id"]
          },
          {
            foreignKeyName: "projetos_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
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
          workspace_id: string
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
          workspace_id: string
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
          workspace_id?: string
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
          {
            foreignKeyName: "promocao_participantes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
          workspace_id: string
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
          workspace_id: string
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
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promocoes_indicacao_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission_code: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          id?: string
          permission_code: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          id?: string
          permission_code?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      sales_events: {
        Row: {
          amount: number
          created_at: string
          currency: string
          customer_email: string | null
          customer_name: string | null
          id: string
          metadata: Json | null
          plan_id: string
          price_id: string | null
          provider: string | null
          provider_event_id: string | null
          source: string
          status: string
          workspace_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          id?: string
          metadata?: Json | null
          plan_id: string
          price_id?: string | null
          provider?: string | null
          provider_event_id?: string | null
          source?: string
          status: string
          workspace_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          id?: string
          metadata?: Json | null
          plan_id?: string
          price_id?: string | null
          provider?: string | null
          provider_event_id?: string | null
          source?: string
          status?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_events_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_events_price_id_fkey"
            columns: ["price_id"]
            isOneToOne: false
            referencedRelation: "plan_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      stablecoin_correction_log: {
        Row: {
          cash_ledger_id: string
          created_at: string | null
          diferenca_corrigida: number | null
          id: string
          moeda_original: string
          tipo_transacao: string
          valor_destino_antigo: number | null
          valor_destino_novo: number | null
          valor_origem_antigo: number | null
        }
        Insert: {
          cash_ledger_id: string
          created_at?: string | null
          diferenca_corrigida?: number | null
          id?: string
          moeda_original: string
          tipo_transacao: string
          valor_destino_antigo?: number | null
          valor_destino_novo?: number | null
          valor_origem_antigo?: number | null
        }
        Update: {
          cash_ledger_id?: string
          created_at?: string | null
          diferenca_corrigida?: number | null
          id?: string
          moeda_original?: string
          tipo_transacao?: string
          valor_destino_antigo?: number | null
          valor_destino_novo?: number | null
          valor_origem_antigo?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stablecoin_correction_log_cash_ledger_id_fkey"
            columns: ["cash_ledger_id"]
            isOneToOne: false
            referencedRelation: "cash_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stablecoin_correction_log_cash_ledger_id_fkey"
            columns: ["cash_ledger_id"]
            isOneToOne: false
            referencedRelation: "v_ajustes_auditoria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stablecoin_correction_log_cash_ledger_id_fkey"
            columns: ["cash_ledger_id"]
            isOneToOne: false
            referencedRelation: "v_eventos_promocionais"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_changes: {
        Row: {
          change_type: string
          created_at: string
          effective_at: string
          from_plan_id: string | null
          from_price_id: string | null
          id: string
          metadata: Json | null
          performed_by: string | null
          reason: string | null
          scheduled_for: string | null
          subscription_id: string | null
          to_plan_id: string | null
          to_price_id: string | null
          workspace_id: string
        }
        Insert: {
          change_type: string
          created_at?: string
          effective_at?: string
          from_plan_id?: string | null
          from_price_id?: string | null
          id?: string
          metadata?: Json | null
          performed_by?: string | null
          reason?: string | null
          scheduled_for?: string | null
          subscription_id?: string | null
          to_plan_id?: string | null
          to_price_id?: string | null
          workspace_id: string
        }
        Update: {
          change_type?: string
          created_at?: string
          effective_at?: string
          from_plan_id?: string | null
          from_price_id?: string | null
          id?: string
          metadata?: Json | null
          performed_by?: string | null
          reason?: string | null
          scheduled_for?: string | null
          subscription_id?: string | null
          to_plan_id?: string | null
          to_price_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_changes_from_plan_id_fkey"
            columns: ["from_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_changes_from_price_id_fkey"
            columns: ["from_price_id"]
            isOneToOne: false
            referencedRelation: "plan_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_changes_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "workspace_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_changes_to_plan_id_fkey"
            columns: ["to_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_changes_to_price_id_fkey"
            columns: ["to_price_id"]
            isOneToOne: false
            referencedRelation: "plan_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_changes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
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
          workspace_id: string
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
          workspace_id: string
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
          workspace_id?: string
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
            referencedRelation: "v_bookmaker_resultado_operacional"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "transacoes_bookmakers_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_saldo_operavel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_bookmakers_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_status_operacional"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_bookmakers_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_aguardando_saque"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "transacoes_bookmakers_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_desvinculados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_bookmakers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_favorites: {
        Row: {
          created_at: string
          id: string
          page_icon: string
          page_path: string
          page_title: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          page_icon: string
          page_path: string
          page_title: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          page_icon?: string
          page_path?: string
          page_title?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_favorites_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_influence_config: {
        Row: {
          active: boolean
          config_key: string
          created_at: string
          id: string
          updated_at: string
          weight_chat: number
          weight_comment: number
          weight_review: number
          weight_topic: number
        }
        Insert: {
          active?: boolean
          config_key?: string
          created_at?: string
          id?: string
          updated_at?: string
          weight_chat?: number
          weight_comment?: number
          weight_review?: number
          weight_topic?: number
        }
        Update: {
          active?: boolean
          config_key?: string
          created_at?: string
          id?: string
          updated_at?: string
          weight_chat?: number
          weight_comment?: number
          weight_review?: number
          weight_topic?: number
        }
        Relationships: []
      }
      user_influence_daily: {
        Row: {
          chat_messages: number
          comments_made: number
          created_at: string
          id: string
          metric_date: string
          reviews_made: number
          topics_created: number
          total_interactions: number
          user_id: string
          workspace_id: string
        }
        Insert: {
          chat_messages?: number
          comments_made?: number
          created_at?: string
          id?: string
          metric_date: string
          reviews_made?: number
          topics_created?: number
          total_interactions?: number
          user_id: string
          workspace_id: string
        }
        Update: {
          chat_messages?: number
          comments_made?: number
          created_at?: string
          id?: string
          metric_date?: string
          reviews_made?: number
          topics_created?: number
          total_interactions?: number
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      user_influence_events: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      user_influence_ranking: {
        Row: {
          calculated_at: string
          chat_messages: number
          comments_made: number
          id: string
          influence_score: number
          period_end: string
          period_start: string
          period_type: string
          rank_position: number
          reviews_made: number
          topics_created: number
          total_interactions: number
          user_id: string
          workspace_id: string
        }
        Insert: {
          calculated_at?: string
          chat_messages?: number
          comments_made?: number
          id?: string
          influence_score?: number
          period_end: string
          period_start: string
          period_type: string
          rank_position: number
          reviews_made?: number
          topics_created?: number
          total_interactions?: number
          user_id: string
          workspace_id: string
        }
        Update: {
          calculated_at?: string
          chat_messages?: number
          comments_made?: number
          id?: string
          influence_score?: number
          period_end?: string
          period_start?: string
          period_type?: string
          rank_position?: number
          reviews_made?: number
          topics_created?: number
          total_interactions?: number
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      user_permission_overrides: {
        Row: {
          created_at: string
          expires_at: string | null
          granted: boolean
          granted_by: string | null
          id: string
          permission_code: string
          reason: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          granted?: boolean
          granted_by?: string | null
          id?: string
          permission_code: string
          reason?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          granted?: boolean
          granted_by?: string | null
          id?: string
          permission_code?: string
          reason?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permission_overrides_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
      workspace_invites: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          created_by: string | null
          email: string
          expires_at: string
          id: string
          invited_user_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: string
          token: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          created_by?: string | null
          email: string
          expires_at?: string
          id?: string
          invited_user_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          token?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_user_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invites_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          auth_version: number
          created_at: string
          id: string
          invited_at: string | null
          invited_by: string | null
          is_active: boolean
          joined_at: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          auth_version?: number
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean
          joined_at?: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          auth_version?: number
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean
          joined_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_subscriptions: {
        Row: {
          auto_renew: boolean
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          created_by: string | null
          current_period: Database["public"]["Enums"]["billing_period"]
          expires_at: string | null
          grace_period_days: number
          id: string
          metadata: Json | null
          plan_id: string
          price_id: string | null
          provider: string | null
          provider_customer_id: string | null
          provider_subscription_id: string | null
          renews_at: string | null
          started_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          auto_renew?: boolean
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          created_by?: string | null
          current_period?: Database["public"]["Enums"]["billing_period"]
          expires_at?: string | null
          grace_period_days?: number
          id?: string
          metadata?: Json | null
          plan_id: string
          price_id?: string | null
          provider?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          renews_at?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          auto_renew?: boolean
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          created_by?: string | null
          current_period?: Database["public"]["Enums"]["billing_period"]
          expires_at?: string | null
          grace_period_days?: number
          id?: string
          metadata?: Json | null
          plan_id?: string
          price_id?: string | null
          provider?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          renews_at?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_subscriptions_price_id_fkey"
            columns: ["price_id"]
            isOneToOne: false
            referencedRelation: "plan_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          deactivated_at: string | null
          deactivation_reason: string | null
          id: string
          is_active: boolean | null
          max_active_partners: number
          max_users: number
          name: string
          plan: string
          settings: Json | null
          slug: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deactivated_at?: string | null
          deactivation_reason?: string | null
          id?: string
          is_active?: boolean | null
          max_active_partners?: number
          max_users?: number
          name: string
          plan?: string
          settings?: Json | null
          slug?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deactivated_at?: string | null
          deactivation_reason?: string | null
          id?: string
          is_active?: boolean | null
          max_active_partners?: number
          max_users?: number
          name?: string
          plan?: string
          settings?: Json | null
          slug?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_ajustes_auditoria: {
        Row: {
          ajuste_direcao: string | null
          ajuste_motivo: string | null
          auditoria_metadata: Json | null
          created_at: string | null
          data_transacao: string | null
          descricao: string | null
          destino_tipo: string | null
          entidade_afetada_id: string | null
          entidade_afetada_tipo: string | null
          id: string | null
          moeda: string | null
          origem_tipo: string | null
          referencia_transacao_id: string | null
          tipo_transacao: string | null
          user_id: string | null
          valor: number | null
          workspace_id: string | null
        }
        Insert: {
          ajuste_direcao?: string | null
          ajuste_motivo?: string | null
          auditoria_metadata?: Json | null
          created_at?: string | null
          data_transacao?: string | null
          descricao?: string | null
          destino_tipo?: string | null
          entidade_afetada_id?: never
          entidade_afetada_tipo?: never
          id?: string | null
          moeda?: string | null
          origem_tipo?: string | null
          referencia_transacao_id?: string | null
          tipo_transacao?: string | null
          user_id?: string | null
          valor?: number | null
          workspace_id?: string | null
        }
        Update: {
          ajuste_direcao?: string | null
          ajuste_motivo?: string | null
          auditoria_metadata?: Json | null
          created_at?: string | null
          data_transacao?: string | null
          descricao?: string | null
          destino_tipo?: string | null
          entidade_afetada_id?: never
          entidade_afetada_tipo?: never
          id?: string | null
          moeda?: string | null
          origem_tipo?: string | null
          referencia_transacao_id?: string | null
          tipo_transacao?: string | null
          user_id?: string | null
          valor?: number | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_ledger_referencia_transacao_id_fkey"
            columns: ["referencia_transacao_id"]
            isOneToOne: false
            referencedRelation: "cash_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_referencia_transacao_id_fkey"
            columns: ["referencia_transacao_id"]
            isOneToOne: false
            referencedRelation: "v_ajustes_auditoria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_referencia_transacao_id_fkey"
            columns: ["referencia_transacao_id"]
            isOneToOne: false
            referencedRelation: "v_eventos_promocionais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
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
      v_bonus_historico: {
        Row: {
          bonus_amount: number | null
          bookmaker_catalogo_nome: string | null
          bookmaker_id: string | null
          bookmaker_logo: string | null
          bookmaker_moeda: string | null
          bookmaker_nome: string | null
          cotacao_credito_snapshot: number | null
          created_at: string | null
          credited_at: string | null
          currency: string | null
          deadline_days: number | null
          deposit_amount: number | null
          expirado: boolean | null
          expires_at: string | null
          finalize_reason: string | null
          finalized_at: string | null
          id: string | null
          migrado_para_saldo_unificado: boolean | null
          min_odds: number | null
          notes: string | null
          project_id: string | null
          projeto_nome: string | null
          rollover_base: string | null
          rollover_completo: boolean | null
          rollover_multiplier: number | null
          rollover_percentual: number | null
          rollover_progress: number | null
          rollover_target_amount: number | null
          saldo_residual: number | null
          source: string | null
          status: string | null
          title: string | null
          updated_at: string | null
          valor_brl_referencia: number | null
          valor_creditado_no_saldo: number | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_bookmaker_link_bonuses_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "bookmakers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_bookmaker_link_bonuses_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_disponibilidade"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_bookmaker_link_bonuses_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_resultado_operacional"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "project_bookmaker_link_bonuses_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_saldo_operavel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_bookmaker_link_bonuses_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_status_operacional"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_bookmaker_link_bonuses_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_aguardando_saque"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "project_bookmaker_link_bonuses_bookmaker_id_fkey"
            columns: ["bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_desvinculados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_bookmaker_link_bonuses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_bookmaker_link_bonuses_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "bookmakers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmakers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_operadores_workspace"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "bookmakers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_last_login"
            referencedColumns: ["user_id"]
          },
        ]
      }
      v_bookmaker_resultado_operacional: {
        Row: {
          bookmaker_id: string | null
          bookmaker_nome: string | null
          moeda: string | null
          parceiro_id: string | null
          projeto_id: string | null
          qtd_apostas: number | null
          qtd_greens: number | null
          qtd_reds: number | null
          resultado_apostas: number | null
          resultado_cashback: number | null
          resultado_giros: number | null
          resultado_operacional_total: number | null
          resultado_pernas: number | null
          workspace_id: string | null
        }
        Insert: {
          bookmaker_id?: string | null
          bookmaker_nome?: string | null
          moeda?: string | null
          parceiro_id?: string | null
          projeto_id?: string | null
          qtd_apostas?: never
          qtd_greens?: never
          qtd_reds?: never
          resultado_apostas?: never
          resultado_cashback?: never
          resultado_giros?: never
          resultado_operacional_total?: never
          resultado_pernas?: never
          workspace_id?: string | null
        }
        Update: {
          bookmaker_id?: string | null
          bookmaker_nome?: string | null
          moeda?: string | null
          parceiro_id?: string | null
          projeto_id?: string | null
          qtd_apostas?: never
          qtd_greens?: never
          qtd_reds?: never
          resultado_apostas?: never
          resultado_cashback?: never
          resultado_giros?: never
          resultado_operacional_total?: never
          resultado_pernas?: never
          workspace_id?: string | null
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
            foreignKeyName: "bookmakers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      v_bookmaker_saldo_operavel: {
        Row: {
          id: string | null
          moeda: string | null
          nome: string | null
          projeto_id: string | null
          saldo_bonus: number | null
          saldo_freebet: number | null
          saldo_operavel: number | null
          saldo_real: number | null
          status: string | null
          workspace_id: string | null
        }
        Insert: {
          id?: string | null
          moeda?: string | null
          nome?: string | null
          projeto_id?: string | null
          saldo_bonus?: never
          saldo_freebet?: never
          saldo_operavel?: never
          saldo_real?: number | null
          status?: string | null
          workspace_id?: string | null
        }
        Update: {
          id?: string | null
          moeda?: string | null
          nome?: string | null
          projeto_id?: string | null
          saldo_bonus?: never
          saldo_freebet?: never
          saldo_operavel?: never
          saldo_real?: number | null
          status?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookmakers_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmakers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      v_bookmaker_status_operacional: {
        Row: {
          bloqueada_por_parceiro: boolean | null
          bookmaker_catalogo_id: string | null
          estado_conta: string | null
          id: string | null
          moeda: string | null
          nome: string | null
          parceiro_id: string | null
          parceiro_nome: string | null
          parceiro_status: string | null
          pode_operar: boolean | null
          saldo_atual: number | null
          status_display: string | null
          status_real: string | null
          workspace_id: string | null
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
            foreignKeyName: "bookmakers_bookmaker_catalogo_id_fkey"
            columns: ["bookmaker_catalogo_id"]
            isOneToOne: false
            referencedRelation: "v_community_bookmaker_stats"
            referencedColumns: ["bookmaker_catalogo_id"]
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
            foreignKeyName: "bookmakers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      v_bookmakers_aguardando_saque: {
        Row: {
          bookmaker_id: string | null
          bookmaker_nome: string | null
          data_liberacao: string | null
          estado_conta: string | null
          moeda: string | null
          parceiro_id: string | null
          parceiro_nome: string | null
          projeto_id: string | null
          projeto_nome: string | null
          saldo_atual: number | null
          saldo_efetivo: number | null
          saldo_freebet: number | null
          saldo_usd: number | null
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
            foreignKeyName: "bookmakers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmakers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_operadores_workspace"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "bookmakers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_last_login"
            referencedColumns: ["user_id"]
          },
        ]
      }
      v_bookmakers_desvinculados: {
        Row: {
          id: string | null
          moeda: string | null
          nome: string | null
          parceiro_id: string | null
          parceiro_nome: string | null
          saldo_atual: number | null
          saldo_efetivo: number | null
          saldo_freebet: number | null
          saldo_total: number | null
          saldo_usd: number | null
          status: string | null
          workspace_id: string | null
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
            foreignKeyName: "bookmakers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
            foreignKeyName: "operador_projetos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "v_operadores_workspace"
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
        ]
      }
      v_community_bookmaker_stats: {
        Row: {
          bloqueios_apos_ganhos: number | null
          bloqueios_recorrentes: number | null
          bookmaker_catalogo_id: string | null
          logo_url: string | null
          media_confiabilidade_geral: number | null
          media_estabilidade_conta: number | null
          media_facilidade_verificacao: number | null
          media_qualidade_suporte: number | null
          media_velocidade_pagamento: number | null
          nome: string | null
          nota_media_geral: number | null
          regulamentacao_status: string | null
          total_avaliacoes: number | null
          total_topicos: number | null
          ultimo_topico_data: string | null
          visibility: Database["public"]["Enums"]["bookmaker_visibility"] | null
        }
        Relationships: []
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
            foreignKeyName: "parcerias_indicacao_id_fkey"
            columns: ["indicacao_id"]
            isOneToOne: false
            referencedRelation: "v_indicacoes_workspace"
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
            foreignKeyName: "operador_projetos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "v_operadores_workspace"
            referencedColumns: ["operador_id"]
          },
          {
            foreignKeyName: "operador_projetos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
        ]
      }
      v_eventos_promocionais: {
        Row: {
          auditoria_metadata: Json | null
          bookmaker_nome: string | null
          created_at: string | null
          data_transacao: string | null
          descricao: string | null
          destino_bookmaker_id: string | null
          evento_promocional_tipo: string | null
          id: string | null
          impacta_caixa_operacional: boolean | null
          moeda: string | null
          origem_bookmaker_id: string | null
          tipo_transacao: string | null
          user_id: string | null
          valor: number | null
          workspace_id: string | null
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
            referencedRelation: "v_bookmaker_resultado_operacional"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "cash_ledger_destino_bookmaker_id_fkey"
            columns: ["destino_bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_saldo_operavel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_destino_bookmaker_id_fkey"
            columns: ["destino_bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_status_operacional"
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
            foreignKeyName: "cash_ledger_destino_bookmaker_id_fkey"
            columns: ["destino_bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_desvinculados"
            referencedColumns: ["id"]
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
            referencedRelation: "v_bookmaker_resultado_operacional"
            referencedColumns: ["bookmaker_id"]
          },
          {
            foreignKeyName: "cash_ledger_origem_bookmaker_id_fkey"
            columns: ["origem_bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_saldo_operavel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_origem_bookmaker_id_fkey"
            columns: ["origem_bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmaker_status_operacional"
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
            foreignKeyName: "cash_ledger_origem_bookmaker_id_fkey"
            columns: ["origem_bookmaker_id"]
            isOneToOne: false
            referencedRelation: "v_bookmakers_desvinculados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      v_indicacoes_workspace: {
        Row: {
          created_at: string | null
          data_indicacao: string | null
          id: string | null
          indicador_id: string | null
          observacoes: string | null
          origem: string | null
          parceiro_id: string | null
          user_id: string | null
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
      v_movimentacoes_indicacao_workspace: {
        Row: {
          coin: string | null
          cotacao: number | null
          created_at: string | null
          data_movimentacao: string | null
          descricao: string | null
          id: string | null
          indicador_id: string | null
          moeda: string | null
          origem_caixa_operacional: boolean | null
          origem_conta_bancaria_id: string | null
          origem_parceiro_id: string | null
          origem_tipo: string | null
          origem_wallet_id: string | null
          parceria_id: string | null
          qtd_coin: number | null
          status: string | null
          tipo: string | null
          tipo_moeda: string | null
          user_id: string | null
          valor: number | null
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
          volume_total: number | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operadores_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
          workspace_id: string | null
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
          workspace_id?: string | null
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
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operadores_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "operador_projetos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "v_operadores_workspace"
            referencedColumns: ["operador_id"]
          },
          {
            foreignKeyName: "operador_projetos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
        ]
      }
      v_operadores_workspace: {
        Row: {
          cpf: string | null
          data_admissao: string | null
          data_desligamento: string | null
          data_nascimento: string | null
          email: string | null
          is_active: boolean | null
          joined_at: string | null
          nome: string | null
          observacoes: string | null
          operador_id: string | null
          profile_id: string | null
          projetos_ativos: number | null
          role: Database["public"]["Enums"]["app_role"] | null
          telefone: string | null
          tipo_contrato: string | null
          total_pago: number | null
          total_pendente: number | null
          user_id: string | null
          workspace_id: string | null
          workspace_member_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
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
          {
            foreignKeyName: "parceiros_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_operadores_workspace"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "parceiros_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_last_login"
            referencedColumns: ["user_id"]
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
            foreignKeyName: "parcerias_indicacao_id_fkey"
            columns: ["indicacao_id"]
            isOneToOne: false
            referencedRelation: "v_indicacoes_workspace"
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
      v_projeto_lucro_operador: {
        Row: {
          apostas_ganhas: number | null
          auth_user_id: string | null
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
          profile_id: string | null
          projeto_id: string | null
          projeto_nome: string | null
          status: string | null
          tipo_meta: string | null
          total_apostas: number | null
          total_depositado: number | null
          total_sacado: number | null
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
            foreignKeyName: "operador_projetos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "v_operadores_workspace"
            referencedColumns: ["operador_id"]
          },
          {
            foreignKeyName: "operador_projetos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
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
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investidores_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      v_roi_investidores_multimoeda: {
        Row: {
          aportes_ars: number | null
          aportes_brl: number | null
          aportes_cop: number | null
          aportes_crypto_usd: number | null
          aportes_eur: number | null
          aportes_gbp: number | null
          aportes_mxn: number | null
          aportes_myr: number | null
          aportes_usd: number | null
          cpf: string | null
          investidor_id: string | null
          liquidacoes_ars: number | null
          liquidacoes_brl: number | null
          liquidacoes_cop: number | null
          liquidacoes_crypto_usd: number | null
          liquidacoes_eur: number | null
          liquidacoes_gbp: number | null
          liquidacoes_mxn: number | null
          liquidacoes_myr: number | null
          liquidacoes_usd: number | null
          nome: string | null
          status: string | null
          total_aportes_usd_ref: number | null
          total_liquidacoes_usd_ref: number | null
          user_id: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investidores_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      v_saldo_caixa_crypto: {
        Row: {
          coin: string | null
          saldo_coin: number | null
          saldo_usd: number | null
        }
        Relationships: []
      }
      v_saldo_caixa_fiat: {
        Row: {
          moeda: string | null
          saldo: number | null
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
          {
            foreignKeyName: "parceiros_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_operadores_workspace"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "parceiros_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_last_login"
            referencedColumns: ["user_id"]
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
          {
            foreignKeyName: "parceiros_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_operadores_workspace"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "parceiros_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_last_login"
            referencedColumns: ["user_id"]
          },
        ]
      }
      v_user_last_login: {
        Row: {
          email: string | null
          full_name: string | null
          is_blocked: boolean | null
          is_system_owner: boolean | null
          last_ip_address: string | null
          last_login_global: string | null
          last_session_at: string | null
          last_workspace_id: string | null
          last_workspace_name: string | null
          session_is_active: boolean | null
          session_status: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_workspace_invite: { Args: { _token: string }; Returns: Json }
      adjust_bookmaker_balance_with_audit: {
        Args: {
          p_bookmaker_id: string
          p_delta: number
          p_observacoes?: string
          p_origem: string
          p_referencia_id?: string
          p_referencia_tipo?: string
        }
        Returns: number
      }
      admin_add_user_to_workspace: {
        Args: {
          _role?: Database["public"]["Enums"]["app_role"]
          _user_id: string
          _workspace_id: string
        }
        Returns: undefined
      }
      admin_archive_group: {
        Args: {
          p_convert_to_direct_access?: boolean
          p_group_id: string
          p_reason?: string
        }
        Returns: Json
      }
      admin_calculate_group_archive_impact: {
        Args: { p_group_id: string }
        Returns: Json
      }
      admin_cleanup_dry_run: { Args: { _user_ids: string[] }; Returns: Json }
      admin_cleanup_system_owner_operational_data: {
        Args: { p_confirmation_phrase: string }
        Returns: Json
      }
      admin_create_sale: {
        Args: {
          _amount: number
          _currency?: string
          _customer_email?: string
          _customer_name?: string
          _metadata?: Json
          _plan_code: string
          _source?: string
          _status?: string
          _workspace_id?: string
        }
        Returns: string
      }
      admin_create_workspace_for_user: {
        Args: {
          _plan?: string
          _role?: Database["public"]["Enums"]["app_role"]
          _user_id: string
          _workspace_name: string
        }
        Returns: string
      }
      admin_execute_cleanup:
        | { Args: { _user_ids: string[] }; Returns: Json }
        | {
            Args: { _confirmation_phrase: string; _user_ids: string[] }
            Returns: Json
          }
      admin_find_workspaces_by_owner_emails: {
        Args: { p_emails: string[] }
        Returns: {
          is_member: boolean
          is_owner: boolean
          member_workspaces: string[]
          owner_email: string
          workspace_id: string
          workspace_name: string
        }[]
      }
      admin_get_all_users: {
        Args: { _include_deleted?: boolean }
        Returns: {
          blocked_at: string
          blocked_reason: string
          created_at: string
          email: string
          full_name: string
          id: string
          is_blocked: boolean
          is_deleted: boolean
          is_system_owner: boolean
          last_login: string
          public_id: string
          workspace_id: string
          workspace_name: string
          workspace_role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      admin_get_all_workspaces: {
        Args: never
        Returns: {
          created_at: string
          deactivated_at: string
          deactivation_reason: string
          id: string
          is_active: boolean
          member_count: number
          name: string
          owner_email: string
          owner_id: string
          owner_name: string
          plan: string
          slug: string
        }[]
      }
      admin_get_archived_users: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          id: string
        }[]
      }
      admin_get_billing_kpis: { Args: never; Returns: Json }
      admin_get_cleanup_candidates: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_system_owner: boolean
          is_test_user: boolean
          workspace_id: string
          workspace_name: string
        }[]
      }
      admin_get_daily_revenue: {
        Args: { _days?: number }
        Returns: {
          date: string
          revenue: number
          sales_count: number
        }[]
      }
      admin_get_deleted_users: {
        Args: never
        Returns: {
          blocked_at: string
          blocked_reason: string
          created_at: string
          email: string
          full_name: string
          id: string
          is_blocked: boolean
          is_system_owner: boolean
          last_login_global: string
          public_id: string
        }[]
      }
      admin_get_group_workspaces: {
        Args: { p_group_id: string }
        Returns: {
          added_at: string
          added_by: string
          group_id: string
          id: string
          owner_email: string
          owner_public_id: string
          owner_user_id: string
          workspace_id: string
          workspace_name: string
          workspace_plan: string
        }[]
      }
      admin_get_login_history: {
        Args: {
          _end_date?: string
          _limit?: number
          _offset?: number
          _start_date?: string
          _user_id?: string
          _workspace_id?: string
        }
        Returns: {
          id: string
          ip_address: string
          is_active: boolean
          last_login_global: string
          login_at: string
          logout_at: string
          session_status: string
          user_agent: string
          user_email: string
          user_id: string
          user_name: string
          workspace_id: string
          workspace_name: string
        }[]
      }
      admin_get_login_stats: {
        Args: never
        Returns: {
          month_logins: number
          today_logins: number
          unique_users_today: number
          unique_users_week: number
          week_logins: number
        }[]
      }
      admin_get_revenue_by_plan: {
        Args: never
        Returns: {
          plan_code: string
          plan_name: string
          revenue: number
          sales_count: number
        }[]
      }
      admin_get_sales: {
        Args: {
          _from_date?: string
          _limit?: number
          _offset?: number
          _plan_code?: string
          _status?: string
          _to_date?: string
        }
        Returns: {
          amount: number
          created_at: string
          currency: string
          customer_email: string
          customer_name: string
          id: string
          metadata: Json
          plan_code: string
          plan_id: string
          plan_name: string
          price_id: string
          provider: string
          provider_event_id: string
          source: string
          status: string
          workspace_id: string
          workspace_name: string
        }[]
      }
      admin_get_users_grouped: {
        Args: never
        Returns: {
          blocked_at: string
          blocked_reason: string
          created_at: string
          email: string
          full_name: string
          id: string
          is_blocked: boolean
          is_deleted: boolean
          is_system_owner: boolean
          last_login_global: string
          public_id: string
          workspaces: Json
          workspaces_count: number
        }[]
      }
      admin_get_users_never_logged: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          user_id: string
          workspaces_count: number
        }[]
      }
      admin_get_workspace_members: {
        Args: { _workspace_id: string }
        Returns: {
          email: string
          full_name: string
          is_active: boolean
          joined_at: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      admin_hard_delete_users: { Args: { _user_ids: string[] }; Returns: Json }
      admin_list_subscriptions: {
        Args: {
          p_expiring_in_days?: number
          p_status?: Database["public"]["Enums"]["subscription_status"]
        }
        Returns: {
          cancel_at_period_end: boolean
          computed_status: Database["public"]["Enums"]["subscription_status"]
          created_at: string
          current_period: Database["public"]["Enums"]["billing_period"]
          expires_at: string
          is_expiring: boolean
          plan_code: string
          plan_name: string
          price_amount: number
          remaining_days: number
          started_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          subscription_id: string
          workspace_id: string
          workspace_name: string
        }[]
      }
      admin_preview_system_owner_cleanup: { Args: never; Returns: Json }
      admin_reactivate_group: { Args: { p_group_id: string }; Returns: Json }
      admin_reset_community: {
        Args: { _confirmation_phrase?: string; _dry_run?: boolean }
        Returns: Json
      }
      admin_resolve_workspaces_by_owner_identifiers: {
        Args: { p_tokens: string[] }
        Returns: {
          owner_email: string
          owner_id: string
          owner_public_id: string
          status: string
          token: string
          token_type: string
          workspace_id: string
          workspace_name: string
          workspace_plan: string
        }[]
      }
      admin_set_test_user: {
        Args: { _is_test: boolean; _user_id: string }
        Returns: undefined
      }
      admin_set_user_blocked: {
        Args: { _blocked: boolean; _reason?: string; _user_id: string }
        Returns: undefined
      }
      admin_set_workspace_active: {
        Args: { _active: boolean; _reason?: string; _workspace_id: string }
        Returns: undefined
      }
      admin_update_sale_status: {
        Args: { _new_status: string; _sale_id: string }
        Returns: undefined
      }
      admin_update_workspace_plan: {
        Args: { _plan: string; _workspace_id: string }
        Returns: undefined
      }
      aggregate_daily_influence: {
        Args: { target_date: string }
        Returns: number
      }
      apply_immediate_downgrade: {
        Args: {
          p_reason?: string
          p_target_price_id: string
          p_workspace_id: string
        }
        Returns: string
      }
      atualizar_aposta_liquidada_atomica: {
        Args: {
          p_aposta_id: string
          p_nova_moeda?: string
          p_nova_odd?: number
          p_novo_bookmaker_id?: string
          p_novo_resultado?: string
          p_novo_stake?: number
        }
        Returns: Json
      }
      bookmaker_pode_operar: {
        Args: { p_bookmaker_id: string }
        Returns: boolean
      }
      calcular_debito_waterfall: {
        Args: {
          p_bookmaker_id: string
          p_stake: number
          p_usar_freebet?: boolean
        }
        Returns: {
          debito_bonus: number
          debito_freebet: number
          debito_real: number
          saldo_bonus_disponivel: number
          saldo_freebet_disponivel: number
          saldo_real_disponivel: number
          stake_coberto: boolean
        }[]
      }
      calcular_proxima_conciliacao: {
        Args: {
          p_data_entrada: string
          p_dias_intervalo?: number
          p_frequencia: string
          p_ultima_conciliacao: string
        }
        Returns: string
      }
      calcular_resultado_operacional_bookmaker: {
        Args: { p_bookmaker_id: string }
        Returns: {
          qtd_apostas: number
          qtd_greens: number
          qtd_reds: number
          resultado_apostas: number
          resultado_cashback: number
          resultado_giros: number
          resultado_total: number
        }[]
      }
      calculate_bonus_rollover: {
        Args: { p_bonus_id: string }
        Returns: number
      }
      calculate_expires_at: {
        Args: {
          p_period: Database["public"]["Enums"]["billing_period"]
          p_started_at?: string
        }
        Returns: string
      }
      calculate_influence_ranking: {
        Args: {
          p_period_end: string
          p_period_start: string
          p_period_type: string
        }
        Returns: number
      }
      can_moderate_community: { Args: { _user_id: string }; Returns: boolean }
      cancel_stake_reservation: {
        Args: { p_form_session_id: string }
        Returns: boolean
      }
      cancel_workspace_invite: { Args: { _invite_id: string }; Returns: Json }
      change_member_role: {
        Args: {
          _member_id: string
          _new_role: Database["public"]["Enums"]["app_role"]
        }
        Returns: Json
      }
      check_custom_permissions_limit: {
        Args: { workspace_uuid: string }
        Returns: Json
      }
      check_cycle_closing_requirements: {
        Args: { _ciclo_id: string }
        Returns: Json
      }
      check_login_blocked: {
        Args: { p_email: string }
        Returns: {
          blocked_until: string
          failed_attempts: number
          is_blocked: boolean
        }[]
      }
      check_module_has_data: {
        Args: { p_module_id: string; p_projeto_id: string }
        Returns: boolean
      }
      check_partner_limit: { Args: { workspace_uuid: string }; Returns: Json }
      check_session_inactivity: {
        Args: { p_timeout_minutes?: number; p_user_id: string }
        Returns: {
          last_activity: string
          minutes_inactive: number
          session_id: string
          was_expired: boolean
        }[]
      }
      check_user_limit: { Args: { workspace_uuid: string }; Returns: Json }
      cleanup_expired_chat_messages: { Args: never; Returns: number }
      cleanup_expired_reservations: { Args: never; Returns: number }
      cleanup_orphan_sessions: {
        Args: { p_hours_threshold?: number }
        Returns: number
      }
      close_project_cycle: {
        Args: { _ciclo_id: string; _workspace_id: string }
        Returns: Json
      }
      column_exists: {
        Args: { _column_name: string; _table_name: string }
        Returns: boolean
      }
      commit_stake_reservation: {
        Args: { p_form_session_id: string }
        Returns: boolean
      }
      compute_subscription_status: {
        Args: {
          p_current_status: Database["public"]["Enums"]["subscription_status"]
          p_expires_at: string
          p_grace_period_days?: number
        }
        Returns: Database["public"]["Enums"]["subscription_status"]
      }
      confirmar_saque_concluido: {
        Args: { p_bookmaker_id: string }
        Returns: undefined
      }
      consumir_freebet: {
        Args: {
          p_aposta_id?: string
          p_bookmaker_id: string
          p_descricao?: string
          p_user_id?: string
          p_valor: number
          p_workspace_id?: string
        }
        Returns: string
      }
      converter_freebet: {
        Args: {
          p_aposta_id?: string
          p_bookmaker_id: string
          p_descricao?: string
          p_user_id?: string
          p_valor: number
          p_workspace_id?: string
        }
        Returns: string
      }
      corrigir_depositos_stablecoins: {
        Args: { p_dry_run?: boolean; p_workspace_id?: string }
        Returns: {
          diferenca: number
          ledger_id: string
          moeda: string
          tipo_transacao: string
          valor_destino_antigo: number
          valor_destino_novo: number
          valor_origem: number
        }[]
      }
      create_audit_log: {
        Args: {
          _action: Database["public"]["Enums"]["audit_action"]
          _after_data?: Json
          _before_data?: Json
          _entity_id?: string
          _entity_name?: string
          _entity_type: string
          _metadata?: Json
        }
        Returns: string
      }
      create_subscription: {
        Args: {
          p_created_by?: string
          p_price_id: string
          p_started_at?: string
          p_workspace_id: string
        }
        Returns: string
      }
      create_workspace_invite: {
        Args: {
          _email: string
          _role?: Database["public"]["Enums"]["app_role"]
          _workspace_id: string
        }
        Returns: Json
      }
      creditar_freebet: {
        Args: {
          p_bookmaker_id: string
          p_descricao?: string
          p_freebet_id?: string
          p_origem?: string
          p_projeto_id?: string
          p_user_id?: string
          p_valor: number
          p_workspace_id?: string
        }
        Returns: string
      }
      criar_aposta_atomica:
        | { Args: { p_aposta_data: Json; p_pernas_data: Json }; Returns: Json }
        | {
            Args: {
              p_aposta_data: Json
              p_atualizar_saldos?: boolean
              p_pernas_data?: Json
              p_projeto_id: string
              p_user_id: string
              p_workspace_id: string
            }
            Returns: Json
          }
      criar_aposta_atomica_v2: {
        Args: {
          p_bookmaker_id: string
          p_data_aposta?: string
          p_esporte?: string
          p_estrategia?: string
          p_evento?: string
          p_forma_registro?: string
          p_mercado?: string
          p_observacoes?: string
          p_odd: number
          p_projeto_id: string
          p_selecao?: string
          p_stake: number
          p_usar_freebet?: boolean
          p_user_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      debit_bookmaker_with_lock: {
        Args: {
          p_bookmaker_id: string
          p_expected_version: number
          p_origem: string
          p_referencia_id?: string
          p_referencia_tipo?: string
          p_stake: number
        }
        Returns: Json
      }
      debit_multiple_bookmakers: {
        Args: { p_debits: Json; p_origem?: string }
        Returns: Json
      }
      encerrar_ciclo_e_criar_proximo: {
        Args: { p_ciclo_id: string; p_excedente?: number; p_gatilho: string }
        Returns: string
      }
      end_user_session: { Args: { p_user_id: string }; Returns: number }
      estornar_freebet: {
        Args: {
          p_bookmaker_id: string
          p_motivo?: string
          p_user_id?: string
          p_valor: number
          p_workspace_id?: string
        }
        Returns: string
      }
      expirar_freebet: {
        Args: {
          p_bookmaker_id: string
          p_motivo?: string
          p_user_id?: string
          p_valor: number
          p_workspace_id?: string
        }
        Returns: string
      }
      expire_old_invites: { Args: never; Returns: number }
      expire_session_by_inactivity: {
        Args: { p_user_id: string }
        Returns: number
      }
      force_relogin_global: { Args: never; Returns: Json }
      force_relogin_user: { Args: { p_user_id: string }; Returns: Json }
      force_relogin_workspace: {
        Args: { p_workspace_id: string }
        Returns: Json
      }
      generate_public_id: { Args: never; Returns: string }
      get_bookmaker_saldos: {
        Args: { p_projeto_id?: string }
        Returns: {
          bonus_rollover_started: boolean
          has_pending_transactions: boolean
          id: string
          logo_url: string
          moeda: string
          nome: string
          parceiro_id: string
          parceiro_nome: string
          parceiro_primeiro_nome: string
          saldo_bonus: number
          saldo_disponivel: number
          saldo_em_aposta: number
          saldo_freebet: number
          saldo_operavel: number
          saldo_real: number
        }[]
      }
      get_bookmaker_saldos_financeiro: {
        Args: { p_include_zero_balance?: boolean; p_parceiro_id?: string }
        Returns: {
          bonus_rollover_started: boolean
          has_pending_transactions: boolean
          id: string
          logo_url: string
          moeda: string
          nome: string
          parceiro_id: string
          parceiro_nome: string
          parceiro_primeiro_nome: string
          projeto_id: string
          projeto_nome: string
          saldo_bonus: number
          saldo_disponivel: number
          saldo_em_aposta: number
          saldo_freebet: number
          saldo_operavel: number
          saldo_real: number
          status: string
        }[]
      }
      get_bookmakers_pendentes_conciliacao: {
        Args: { p_workspace_id: string }
        Returns: {
          bookmaker_id: string
          bookmaker_logo_url: string
          bookmaker_nome: string
          moeda: string
          projeto_id: string
          projeto_nome: string
          qtd_transacoes_pendentes: number
          saldo_atual: number
          valor_total_pendente: number
        }[]
      }
      get_cached_exchange_rates: {
        Args: never
        Returns: {
          age_minutes: number
          currency_pair: string
          expires_at: string
          fetched_at: string
          is_expired: boolean
          rate: number
          source: string
        }[]
      }
      get_cash_ledger_totals: {
        Args: {
          p_data_fim: string
          p_data_inicio: string
          p_tipos_transacao: string[]
          p_workspace_id: string
        }
        Returns: {
          count_transacoes: number
          total_depositos: number
          total_liquido: number
          total_saques: number
        }[]
      }
      get_current_workspace: { Args: never; Returns: string }
      get_effective_access: {
        Args: { _user_id: string; _workspace_id?: string }
        Returns: Json
      }
      get_exchange_adjustment_totals: {
        Args: { p_workspace_id: string }
        Returns: {
          count_conciliacoes: number
          moeda: string
          total_ganhos: number
          total_liquido: number
          total_perdas: number
        }[]
      }
      get_influence_config: {
        Args: never
        Returns: {
          weight_chat: number
          weight_comment: number
          weight_review: number
          weight_topic: number
        }[]
      }
      get_invite_by_token: { Args: { _token: string }; Returns: Json }
      get_my_pending_invites: {
        Args: never
        Returns: {
          expires_at: string
          id: string
          inviter_name: string
          role: string
          token: string
          workspace_id: string
          workspace_name: string
          workspace_slug: string
        }[]
      }
      get_plan_entitlements: { Args: { plan_name: string }; Returns: Json }
      get_project_active_modules: {
        Args: { p_projeto_id: string }
        Returns: {
          activated_at: string
          description: string
          display_order: number
          icon: string
          module_id: string
          name: string
        }[]
      }
      get_project_operator_candidates: {
        Args: { _workspace_id: string }
        Returns: {
          cpf: string
          display_name: string
          eligible_by_extra: boolean
          eligible_by_role: boolean
          email: string
          operador_id: string
          role_base: string
          user_id: string
        }[]
      }
      get_public_plans: { Args: never; Returns: Json }
      get_remaining_days: { Args: { p_expires_at: string }; Returns: number }
      get_saldo_disponivel_com_reservas: {
        Args: { p_bookmaker_id: string; p_exclude_session_id?: string }
        Returns: {
          saldo_contabil: number
          saldo_disponivel: number
          saldo_reservado: number
        }[]
      }
      get_saldo_operavel_por_projeto: {
        Args: { p_projeto_ids: string[] }
        Returns: {
          projeto_id: string
          saldo_operavel_brl: number
          saldo_operavel_usd: number
          total_bookmakers: number
        }[]
      }
      get_subscription_details: {
        Args: { p_workspace_id: string }
        Returns: {
          cancel_at_period_end: boolean
          computed_status: Database["public"]["Enums"]["subscription_status"]
          created_at: string
          current_period: Database["public"]["Enums"]["billing_period"]
          expires_at: string
          is_expired: boolean
          is_expiring: boolean
          is_in_grace_period: boolean
          plan_code: string
          plan_id: string
          plan_name: string
          price_amount: number
          price_currency: string
          price_id: string
          remaining_days: number
          scheduled_downgrade: Json
          started_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          subscription_id: string
          workspace_id: string
        }[]
      }
      get_user_auth_version: { Args: { p_user_id: string }; Returns: number }
      get_user_project_responsibilities: {
        Args: { _projeto_id: string; _user_id: string }
        Returns: {
          is_linked_operator: boolean
          is_owner_or_admin: boolean
          operador_projeto_id: string
          responsabilidades: string[]
        }[]
      }
      get_user_role: {
        Args: { _user_id: string; _workspace_id?: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_user_workspace: { Args: { _user_id: string }; Returns: string }
      get_user_workspaces: {
        Args: { _user_id: string }
        Returns: {
          is_default: boolean
          plan: string
          role: Database["public"]["Enums"]["app_role"]
          workspace_id: string
          workspace_name: string
          workspace_slug: string
        }[]
      }
      get_workspace_auth_version: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: number
      }
      get_workspace_invites: {
        Args: { _workspace_id: string }
        Returns: {
          created_at: string
          created_by_email: string
          created_by_name: string
          email: string
          expires_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          status: string
          token: string
        }[]
      }
      get_workspace_members_enriched: {
        Args: { _workspace_id: string }
        Returns: {
          email: string
          full_name: string
          id: string
          is_active: boolean
          joined_at: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      get_workspace_usage: { Args: { workspace_uuid: string }; Returns: Json }
      has_permission: {
        Args: {
          _permission_code: string
          _user_id: string
          _workspace_id?: string
        }
        Returns: boolean
      }
      has_project_responsibility: {
        Args: {
          _projeto_id: string
          _responsabilidade: string
          _user_id: string
        }
        Returns: boolean
      }
      has_route_access: {
        Args: { _route: string; _user_id: string; _workspace_id?: string }
        Returns: Json
      }
      is_active_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      is_master: { Args: { _user_id: string }; Returns: boolean }
      is_owner_or_admin: {
        Args: { _user_id: string; _workspace_id?: string }
        Returns: boolean
      }
      is_system_owner: { Args: { _user_id: string }; Returns: boolean }
      is_workspace_owner_or_admin: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      liquidar_aposta_atomica: {
        Args: {
          p_aposta_id: string
          p_lucro_prejuizo?: number
          p_resultado: string
          p_resultados_pernas?: Json
        }
        Returns: Json
      }
      liquidar_aposta_atomica_v2: {
        Args: {
          p_aposta_id: string
          p_lucro_prejuizo?: number
          p_resultado: string
        }
        Returns: Json
      }
      marcar_para_saque: {
        Args: { p_bookmaker_id: string }
        Returns: undefined
      }
      moderate_clear_chat: {
        Args: {
          _context_id?: string
          _context_type?: string
          _workspace_id: string
        }
        Returns: Json
      }
      moderate_delete_chat_message: {
        Args: { _message_id: string; _reason?: string }
        Returns: boolean
      }
      moderate_delete_comment: {
        Args: { p_comment_id: string; p_reason?: string }
        Returns: Json
      }
      moderate_delete_topic: {
        Args: { p_reason?: string; p_topic_id: string }
        Returns: Json
      }
      operator_has_project_access: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      processar_bonus_aposta: {
        Args: {
          p_aposta_id: string
          p_bonus_id: string
          p_bookmaker_id: string
          p_lucro_prejuizo?: number
          p_resultado: string
          p_stake_bonus: number
        }
        Returns: Json
      }
      processar_credito_ganho: {
        Args: {
          p_aposta_id?: string
          p_bookmaker_id: string
          p_debito_bonus: number
          p_debito_freebet: number
          p_debito_real: number
          p_lucro: number
          p_user_id: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      processar_debito_waterfall:
        | {
            Args: {
              p_bookmaker_id: string
              p_stake: number
              p_usar_freebet?: boolean
              p_user_id?: string
              p_workspace_id?: string
            }
            Returns: {
              debito_bonus: number
              debito_freebet: number
              debito_real: number
              erro: string
              sucesso: boolean
            }[]
          }
        | {
            Args: {
              p_aposta_id?: string
              p_bookmaker_id: string
              p_stake: number
              p_usar_freebet: boolean
              p_user_id: string
              p_workspace_id: string
            }
            Returns: {
              debito_bonus: number
              debito_freebet: number
              debito_real: number
              error_message: string
              success: boolean
            }[]
          }
      recalcular_saldo_bookmaker: {
        Args: { p_bookmaker_id: string }
        Returns: number
      }
      recalcular_saldo_bookmaker_v2: {
        Args: { p_bookmaker_id: string }
        Returns: {
          saldo_freebet_calculado: number
          saldo_real_calculado: number
        }[]
      }
      recalcular_saldos_apos_correcao_stablecoins: {
        Args: { p_workspace_id?: string }
        Returns: {
          bookmaker_id: string
          bookmaker_nome: string
          diferenca: number
          saldo_anterior: number
          saldo_recalculado: number
        }[]
      }
      recalcular_saldos_projeto: {
        Args: { p_aplicar?: boolean; p_projeto_id: string }
        Returns: {
          bonus_creditado: number
          bookmaker_id: string
          cashback: number
          depositos: number
          diferenca: number
          giros_gratis: number
          lucro_apostas: number
          moeda: string
          nome: string
          saldo_anterior: number
          saldo_calculado: number
          saques: number
          transferencias_entrada: number
          transferencias_saida: number
        }[]
      }
      recalcular_saldos_workspace: {
        Args: { p_aplicar?: boolean; p_workspace_id: string }
        Returns: {
          atualizado: boolean
          bookmaker_id: string
          diferenca: number
          nome: string
          saldo_anterior: number
          saldo_calculado: number
        }[]
      }
      record_login_attempt: {
        Args: { p_email: string; p_ip_address?: string; p_success: boolean }
        Returns: undefined
      }
      reliquidar_aposta_atomica: {
        Args: {
          p_aposta_id: string
          p_lucro_prejuizo?: number
          p_resultado_novo: string
        }
        Returns: Json
      }
      renew_subscription: {
        Args: { p_new_price_id?: string; p_workspace_id: string }
        Returns: string
      }
      resend_workspace_invite: { Args: { _invite_id: string }; Returns: Json }
      reset_projeto_operacional_seguro: {
        Args: { p_dry_run?: boolean; p_projeto_id: string; p_user_id: string }
        Returns: Json
      }
      resolver_impacto_saldo: {
        Args: { p_fonte_saldo: string; p_resultado: string; p_valor: number }
        Returns: {
          delta_bonus: number
          delta_freebet: number
          delta_real: number
          impacta_saldo_bonus: boolean
          impacta_saldo_freebet: boolean
          impacta_saldo_real: boolean
        }[]
      }
      resolver_tipo_ledger: {
        Args: { p_estrategia: string; p_resultado: string }
        Returns: string
      }
      reverter_liquidacao_para_pendente: {
        Args: { p_aposta_id: string }
        Returns: Json
      }
      schedule_downgrade: {
        Args: {
          p_reason?: string
          p_target_price_id: string
          p_workspace_id: string
        }
        Returns: string
      }
      secure_login: {
        Args: {
          p_ip_address?: string
          p_user_agent?: string
          p_user_email: string
          p_user_id: string
          p_user_name?: string
          p_workspace_id?: string
          p_workspace_name?: string
        }
        Returns: string
      }
      set_current_workspace: {
        Args: { _workspace_id: string }
        Returns: boolean
      }
      sync_all_bonus_rollovers: {
        Args: never
        Returns: {
          bonus_id: string
          bookmaker_nome: string
          new_progress: number
          old_progress: number
        }[]
      }
      sync_bonus_rollover: { Args: { p_bonus_id: string }; Returns: number }
      try_cast_uuid: { Args: { p_text: string }; Returns: string }
      update_bookmaker_balance_with_audit: {
        Args: {
          p_bookmaker_id: string
          p_novo_saldo: number
          p_observacoes?: string
          p_origem: string
          p_referencia_id?: string
          p_referencia_tipo?: string
        }
        Returns: undefined
      }
      update_influence_config: {
        Args: {
          p_weight_chat: number
          p_weight_comment: number
          p_weight_review: number
          p_weight_topic: number
        }
        Returns: boolean
      }
      update_parcerias_em_encerramento: { Args: never; Returns: undefined }
      update_user_activity: { Args: { p_user_id: string }; Returns: boolean }
      upsert_stake_reservation: {
        Args: {
          p_bookmaker_id: string
          p_form_session_id?: string
          p_form_type?: string
          p_moeda?: string
          p_stake: number
          p_workspace_id: string
        }
        Returns: {
          error_code: string
          error_message: string
          reservation_id: string
          saldo_contabil: number
          saldo_disponivel: number
          saldo_reservado: number
          success: boolean
        }[]
      }
      user_belongs_to_workspace: {
        Args: { _workspace_id: string }
        Returns: boolean
      }
      user_has_pro_access: { Args: { _user_id: string }; Returns: boolean }
      user_is_owner_or_admin: {
        Args: { check_user_id: string }
        Returns: boolean
      }
      validate_and_reserve_stakes:
        | {
            Args: { p_bookmaker_stakes: Json; p_projeto_id: string }
            Returns: Json
          }
        | {
            Args: {
              p_bookmaker_ids: string[]
              p_odds?: number[]
              p_projeto_id: string
              p_selecoes?: string[]
              p_stakes: number[]
              p_workspace_id: string
            }
            Returns: Json
          }
      validate_aposta_pre_commit:
        | {
            Args: {
              p_bookmaker_ids: string[]
              p_expected_versions?: number[]
              p_projeto_id: string
              p_stakes: number[]
            }
            Returns: Json
          }
        | {
            Args: {
              p_bookmaker_ids: string[]
              p_projeto_id: string
              p_stakes: number[]
              p_workspace_id: string
            }
            Returns: Json
          }
      validate_bet_creation_v2: {
        Args: { p_bookmaker_stakes: Json; p_projeto_id: string }
        Returns: Json
      }
      validate_operator_eligibility: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      verificar_ciclos_vencidos: { Args: never; Returns: number }
      workspace_has_group_access: {
        Args: { _bookmaker_catalogo_id: string; _workspace_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "master"
        | "user"
        | "finance"
        | "operator"
        | "viewer"
        | "owner"
        | "admin"
      audit_action:
        | "CREATE"
        | "UPDATE"
        | "DELETE"
        | "ARCHIVE"
        | "CANCEL"
        | "CONFIRM"
        | "APPROVE"
        | "REJECT"
        | "LINK"
        | "UNLINK"
        | "LOGIN"
        | "LOGOUT"
        | "PERMISSION_CHANGE"
        | "ROLE_CHANGE"
        | "login_failed"
        | "login_success"
        | "login_blocked"
        | "password_reset_requested"
      billing_period: "monthly" | "semiannual" | "annual" | "lifetime"
      bookmaker_visibility:
        | "GLOBAL_REGULATED"
        | "GLOBAL_RESTRICTED"
        | "WORKSPACE_PRIVATE"
      indicador_status: "ATIVO" | "TOP_VIP" | "EM_OBSERVACAO" | "INATIVO"
      parceria_status: "ATIVA" | "EM_ENCERRAMENTO" | "ENCERRADA" | "RENOVADA"
      subscription_status:
        | "active"
        | "trialing"
        | "past_due"
        | "canceled"
        | "expired"
        | "grace_period"
    }
    CompositeTypes: {
      user_workspace_membership: {
        workspace_id: string | null
        workspace_name: string | null
        role: string | null
        is_active: boolean | null
        joined_at: string | null
      }
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
      app_role: [
        "master",
        "user",
        "finance",
        "operator",
        "viewer",
        "owner",
        "admin",
      ],
      audit_action: [
        "CREATE",
        "UPDATE",
        "DELETE",
        "ARCHIVE",
        "CANCEL",
        "CONFIRM",
        "APPROVE",
        "REJECT",
        "LINK",
        "UNLINK",
        "LOGIN",
        "LOGOUT",
        "PERMISSION_CHANGE",
        "ROLE_CHANGE",
        "login_failed",
        "login_success",
        "login_blocked",
        "password_reset_requested",
      ],
      billing_period: ["monthly", "semiannual", "annual", "lifetime"],
      bookmaker_visibility: [
        "GLOBAL_REGULATED",
        "GLOBAL_RESTRICTED",
        "WORKSPACE_PRIVATE",
      ],
      indicador_status: ["ATIVO", "TOP_VIP", "EM_OBSERVACAO", "INATIVO"],
      parceria_status: ["ATIVA", "EM_ENCERRAMENTO", "ENCERRADA", "RENOVADA"],
      subscription_status: [
        "active",
        "trialing",
        "past_due",
        "canceled",
        "expired",
        "grace_period",
      ],
    },
  },
} as const
