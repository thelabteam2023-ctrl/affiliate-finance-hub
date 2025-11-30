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
          created_at: string
          id: string
          login_password_encrypted: string
          login_username: string
          moeda: string
          nome: string
          observacoes: string | null
          saldo_atual: number
          status: string
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          login_password_encrypted: string
          login_username: string
          moeda?: string
          nome: string
          observacoes?: string | null
          saldo_atual?: number
          status?: string
          updated_at?: string
          url?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          login_password_encrypted?: string
          login_username?: string
          moeda?: string
          nome?: string
          observacoes?: string | null
          saldo_atual?: number
          status?: string
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
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
      [_ in never]: never
    }
    Functions: {
      is_master: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "master" | "user"
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
    },
  },
} as const
