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
      contas_bancarias: {
        Row: {
          agencia: string
          banco: string
          banco_id: string | null
          conta: string
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
          agencia: string
          banco: string
          banco_id?: string | null
          conta: string
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
          agencia?: string
          banco?: string
          banco_id?: string | null
          conta?: string
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
      wallets_crypto: {
        Row: {
          created_at: string
          endereco: string
          id: string
          label: string | null
          moeda: string[] | null
          network: string
          parceiro_id: string
          rede_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          endereco: string
          id?: string
          label?: string | null
          moeda?: string[] | null
          network: string
          parceiro_id: string
          rede_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          endereco?: string
          id?: string
          label?: string | null
          moeda?: string[] | null
          network?: string
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
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
